// moderate — runs on every post/answer insert (DB webhook). Enforces EXACTLY
// two rules (docs/07 §4):
//   Rule 1 (outcome guarantee): high-confidence → auto-remove + notify author,
//           low/medium → queue for a human, post stays up.
//   Rule 2 (agent posing as student): ANY confidence → queue, NEVER auto-remove,
//           NEVER auto-label. A human decides agent status — it's permanent and
//           reputational.
// Everything else stays up: anger, criticism, "going abroad was a mistake",
// negative reviews, failure stories. That honesty is the product (trust rule 5).
//
// If Claude is down/unconfigured, we QUEUE everything for human review and leave
// posts up — AI is never load-bearing. Secrets from Deno.env only.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

const SYSTEM_PROMPT = `Check this post against two rules.

RULE 1 — Outcome guarantee
Flag if it promises or guarantees a visa, admission, PR, or job outcome.
"I got mine approved in 3 weeks" is fine — that's experience.
"You will definitely get approved" is a violation.
"Apply through us, visa guaranteed" is a violation.

RULE 2 — Agent posing as student
Flag if it reads as commercial promotion of a consultancy or service:
contact details, service offers, "DM me for guidance", pricing.
A student sharing their own consultancy's bad behaviour is NOT a violation.

Return JSON only:
{"rule1": bool, "rule2": bool, "confidence": "low"|"medium"|"high",
 "quote": "the specific text that triggered it, or null"}

Everything else is allowed. Anger, criticism of universities, saying
going abroad was a mistake, negative reviews, failure stories — all
allowed. Do not flag them.`;

interface WebhookBody {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
}

interface ModVerdict {
  rule1: boolean;
  rule2: boolean;
  confidence: 'low' | 'medium' | 'high';
  quote: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  let body: WebhookBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const table = body.table === 'answers' ? 'answers' : 'posts';
  const record = body.record ?? {};
  const targetId = record.id as string | undefined;
  const authorId = record.author_id as string | undefined;
  if (!targetId || !authorId) return json({ error: 'invalid_input' }, 400);

  const text = table === 'posts'
    ? `${(record.title as string) ?? ''}\n${(record.body as string) ?? ''}`
    : ((record.body as string) ?? '');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const verdict = await classify(text);

  // Claude down/unconfigured → queue for human review, leave the post up.
  if (!verdict) {
    await queueForReview(admin, table, targetId, 'other', 'AI unavailable — manual review.');
    return json({ ok: true, action: 'queued', reason: 'ai_unavailable' });
  }

  // Rule 1, high confidence → auto-remove + notify. Removal is recorded in the
  // append-only audit trail (trust rule 5: removal requires a reason).
  if (verdict.rule1 && verdict.confidence === 'high') {
    await admin.from(table).update({ removed_at: new Date().toISOString() }).eq('id', targetId);
    await admin.from('moderation_actions').insert({
      moderator_id: authorId, // system action; a real moderator id is set on human review
      target_type: table === 'posts' ? 'post' : 'answer',
      target_id: targetId,
      action: 'removed',
      reason: `Auto-removed (outcome guarantee): ${verdict.quote ?? 'promise of an outcome'}`,
    });
    await admin.from('notifications').insert({
      user_id: authorId,
      kind: 'moderation_removed',
      payload: { target_id: targetId, quote: verdict.quote, can_edit: true },
    });
    return json({ ok: true, action: 'removed', quote: verdict.quote });
  }

  // Rule 1 low/medium, OR rule 2 any confidence → queue, post stays up.
  if (verdict.rule1 || verdict.rule2) {
    const reason = verdict.rule2 ? 'agent_as_student' : 'outcome_guarantee';
    await queueForReview(admin, table, targetId, reason, verdict.quote ?? '');
    return json({ ok: true, action: 'queued', reason });
  }

  return json({ ok: true, action: 'none' });
});

async function classify(text: string): Promise<ModVerdict | null> {
  const key = Deno.env.get('CLAUDE_API_KEY');
  if (!key || !text.trim()) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text.slice(0, 4000) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as ModVerdict;
    return parsed;
  } catch (_e) {
    return null;
  }
}

async function queueForReview(
  admin: ReturnType<typeof createClient>,
  table: string,
  targetId: string,
  reason: string,
  note: string,
): Promise<void> {
  // A report row with a system reporter surfaces in the admin moderation queue.
  await admin.from('reports').insert({
    reporter_id: null, // system flag
    target_type: table === 'posts' ? 'post' : 'answer',
    target_id: targetId,
    reason,
    note,
    status: 'open',
  });
}
