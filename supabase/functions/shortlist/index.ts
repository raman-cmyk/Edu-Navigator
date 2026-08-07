/*
 * Supabase Edge Function: shortlist
 *
 * Public endpoint. Validates input, rate-limits per IP, fetches the catalog with
 * the service-role client, runs the PURE engine (single source of truth), asks
 * Claude for the verdict (post-checked, retried once, deterministic fallback),
 * freezes the result to `shortlist_runs`, and returns the shaped response.
 *
 * BUNDLING ASSUMPTION
 * -------------------
 * The engine is imported from the shared `src/lib/shortlist` module by relative
 * path so the algorithm is never duplicated. `supabase functions deploy` bundles
 * with esbuild, which resolves the engine's extensionless internal TS imports
 * (../../types/domain, ../format). If a future toolchain enforces Deno's strict
 * extension resolution, add explicit `.ts` extensions in the engine or vendor a
 * bundled copy — do NOT re-implement the algorithm here.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

import { runShortlist } from '../../../src/lib/shortlist/index.ts';
import { postCheckVerdict } from '../../../src/lib/shortlist/verdict.ts';
import type { Catalog } from '../../../src/lib/shortlist/catalog.ts';
import type { ShortlistOutput } from '../../../src/types/domain.ts';

// ---- Config ----

// TODO(fx): replace with a value read from a daily-refreshed `fx_rates` row.
// Frozen with the result so a shared link shows the rate it was computed at.
const NPR_PER_AUD = 88;

const RATE_LIMIT_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CLAUDE_MODEL = 'claude-sonnet-4-5';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---- Input validation ----

const InputSchema = z.object({
  qualification: z.enum(['see', 'plus2', 'bachelors', 'masters']),
  score_pct: z.number().min(0).max(100),
  board: z.string().min(1).max(80),
  backlogs: z.number().int().min(0).max(50),
  gap_years: z.number().int().min(0).max(30),
  gap_reason: z.enum(['worked', 'studied', 'family', 'health', 'reattempt', 'other']).optional(),
  english_test: z.enum(['ielts', 'pte', 'duolingo', 'toefl']).nullable().optional(),
  english_overall: z.number().min(0).max(120).optional(),
  english_min_band: z.number().min(0).max(9).optional(),
  budget_npr: z.number().positive(),
  has_collateral: z.boolean(),
  field: z.enum([
    'it', 'nursing', 'business', 'engineering', 'cookery', 'aged_care',
    'accounting', 'public_health', 'data', 'construction', 'other',
  ]),
  priority: z.enum(['cheapest', 'pr', 'ranking', 'fastest']),
});

// ---- Rate limiter ----
// In-memory per-IP limiter. Sufficient for a single edge instance; PRODUCTION
// must use a durable store (e.g. Supabase table or Upstash) because edge
// instances are ephemeral and horizontally scaled.
const rateBuckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_PER_HOUR) {
    rateBuckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(ip, hits);
  return false;
}

// ---- Helpers ----

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : '').trim() || 'unknown';
}

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function makeShareSlug(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

/** Aggregate raw `university_data_points` rows into the engine's shape. */
function aggregateDataPoints(rows: any[]): Catalog['dataPoints'] {
  const acc: Catalog['dataPoints'] = {};
  const salaries: Record<string, number[]> = {};
  for (const r of rows) {
    const id = r.university_id as string;
    const dp = (acc[id] ??= {
      count: 0,
      would_choose_again_no: 0,
      would_choose_again_total: 0,
      visa_refused: 0,
      visa_total: 0,
      median_grad_salary_aud: null,
    });
    dp.count += 1;
    switch (r.metric) {
      case 'choose_again':
        dp.would_choose_again_total += 1;
        if (Number(r.value) === 0) dp.would_choose_again_no += 1; // 0 encodes "no"
        break;
      case 'visa_approved':
        dp.visa_total += 1;
        break;
      case 'visa_refused':
        dp.visa_total += 1;
        dp.visa_refused += 1;
        break;
      case 'grad_salary_aud':
        (salaries[id] ??= []).push(Number(r.value));
        break;
    }
  }
  for (const [id, vals] of Object.entries(salaries)) {
    vals.sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    acc[id].median_grad_salary_aud =
      vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  }
  return acc;
}

/** Build the strict allowed-numbers set from the computed output. */
function allowedNumbers(input: unknown, output: ShortlistOutput): Set<number> {
  const set = new Set<number>();
  const scan = (obj: unknown) => {
    const matches = JSON.stringify(obj).match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (const m of matches) {
      const n = parseFloat(m);
      set.add(n);
      set.add(Math.round(n)); // AI may round a figure for readability
    }
  };
  scan(input);
  scan(output.matches);
  scan(output.rejections);
  set.add(output.matches.length);
  set.add(output.rejections.length);
  return set;
}

// ---- Claude verdict ----

const SYSTEM_PROMPT = [
  'You write the honest verdict for an education-shortlisting tool for Nepali students going to Australia.',
  'Write 3-5 plain sentences. Name the single biggest problem with the profile FIRST.',
  'Use ONLY numbers that appear in the data provided — never invent a figure.',
  'Never use: guaranteed, assured, 100%, dream, unlock, seamless, journey, empower.',
  'Always state the weakest part of the profile.',
  "If confidence is 'none' or 'low', say explicitly that the list is provisional.",
  'No marketing tone. Honest, direct, useful.',
].join(' ');

async function generateVerdict(
  apiKey: string,
  input: unknown,
  output: ShortlistOutput
): Promise<string | null> {
  const payload = {
    profile: input,
    confidence: output.confidence,
    provisional: output.provisional,
    top_matches: output.matches.slice(0, 3).map((m) => ({
      university: m.university_name,
      course: m.course_name,
      fit_score: m.fit_score,
      total_npr: m.cost.total_npr,
      visa_band: m.visa_band,
      pr_pathway: m.pr_pathway,
      verified_students: m.data_points,
    })),
    top_rejections: output.rejections.slice(0, 2).map((r) => ({
      university: r.university_name,
      reason: r.reason,
    })),
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  return typeof text === 'string' ? text.trim() : null;
}

// ---- Handler ----

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return json(
      {
        error: 'rate_limited',
        message: 'You have run the shortlist too many times this hour. Ask the community while you wait.',
        community_url: '/community',
      },
      429
    );
  }

  // Parse + validate.
  let input: z.infer<typeof InputSchema>;
  try {
    const body = await req.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'invalid_input', issues: parsed.error.flatten() }, 400);
    }
    input = parsed.data;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch the catalog (service role — commission data must not be tamperable).
    const [uniRes, courseRes, cityRes, cityCostRes, dpRes, ledgerRes] = await Promise.all([
      supabase.from('universities').select('*'),
      supabase.from('courses').select('*'),
      supabase.from('cities').select('id, slug, name').eq('is_active', true),
      supabase.from('v_city_costs').select('city_id, median_monthly_aud, sample_size'),
      supabase.from('university_data_points').select('university_id, metric, value'),
      supabase.from('commission_ledger').select('university_id, amount_aud, rebate_pct, effective_from'),
    ]);

    const firstError =
      uniRes.error || courseRes.error || cityRes.error || cityCostRes.error || dpRes.error || ledgerRes.error;
    if (firstError) {
      console.error('[shortlist] catalog fetch failed:', firstError.message);
      return json({ error: 'catalog_unavailable' }, 503);
    }

    const cityLivingCost: Catalog['cityLivingCost'] = {};
    for (const row of cityCostRes.data ?? []) {
      cityLivingCost[row.city_id] = {
        median_monthly_aud: row.median_monthly_aud,
        sample_size: row.sample_size ?? 0,
      };
    }

    // Ledger: keep the latest row per university by effective_from.
    const ledger: Catalog['ledger'] = {};
    const ledgerSeen: Record<string, string> = {};
    for (const row of ledgerRes.data ?? []) {
      const prev = ledgerSeen[row.university_id];
      if (!prev || String(row.effective_from) > prev) {
        ledgerSeen[row.university_id] = String(row.effective_from);
        ledger[row.university_id] = { amount_aud: row.amount_aud, rebate_pct: row.rebate_pct ?? null };
      }
    }

    const catalog: Catalog = {
      universities: (uniRes.data ?? []) as any,
      courses: (courseRes.data ?? []) as any,
      cities: (cityRes.data ?? []) as any,
      cityLivingCost,
      dataPoints: aggregateDataPoints(dpRes.data ?? []),
      ledger,
      fxRate: NPR_PER_AUD,
    };

    const shareSlug = makeShareSlug();

    // Run the pure engine (attaches the deterministic verdict).
    const output = runShortlist(input, catalog, shareSlug);

    // Verdict: Claude → post-check → retry once → deterministic fallback.
    if (CLAUDE_API_KEY) {
      const allowed = allowedNumbers(input, output);
      for (let attempt = 0; attempt < 2; attempt++) {
        const candidate = await generateVerdict(CLAUDE_API_KEY, input, output);
        if (candidate) {
          const check = postCheckVerdict(candidate, allowed);
          if (check.ok) {
            output.verdict = candidate;
            break;
          }
          console.warn(`[shortlist] verdict post-check failed (attempt ${attempt + 1}): ${check.reason}`);
        }
      }
      // If both attempts failed, output.verdict keeps the deterministic fallback.
    }

    // Freeze the full result (service role bypasses RLS for the insert).
    const { error: insertError } = await supabase.from('shortlist_runs').insert({
      share_slug: shareSlug,
      inputs: input,
      results: output, // full frozen jsonb, includes fx rate + every sample size
      verdict: output.verdict,
      confidence: output.confidence,
    });
    if (insertError) {
      console.error('[shortlist] freeze failed:', insertError.message);
      return json({ error: 'could_not_save' }, 500);
    }

    return json({
      share_slug: output.share_slug,
      verdict: output.verdict,
      confidence: output.confidence,
      matches: output.matches,
      rejections: output.rejections,
    });
  } catch (err) {
    // Never leak a stack trace to the client.
    console.error('[shortlist] unexpected error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'internal_error' }, 500);
  }
});
