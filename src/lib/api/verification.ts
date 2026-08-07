import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  VerificationRequest,
  NewVerificationInput,
  AdminVerificationItem,
  ReviewDecision,
  Profile,
} from '@/types/domain';

/*
 * Verification: applicant submit + admin review.
 *
 * Production: the redacted image uploads to the PRIVATE `verification-docs`
 * bucket; a `verification_requests` row is inserted with redaction_applied=true
 * (RLS rejects it otherwise). The admin queue reads via short-lived signed URLs;
 * approval runs the `verify-review` Edge Function (service role) which sets
 * tier/city on the profile — a user can never set their own tier.
 *
 * Demo: an in-memory store so the whole loop (submit -> queue -> approve ->
 * badge -> "answer a question in your city") is explorable without a backend.
 */

// A tiny placeholder "document" preview (redaction bars already applied).
function demoDoc(label: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>
    <rect width='320' height='200' fill='#fff' stroke='#E4E4DF'/>
    <text x='16' y='30' font-family='sans-serif' font-size='13' fill='#17202A'>${label}</text>
    <rect x='16' y='48' width='180' height='10' fill='#F1F1EC'/>
    <rect x='16' y='66' width='220' height='10' fill='#F1F1EC'/>
    <rect x='16' y='92' width='120' height='16' fill='#17202A'/>
    <text x='140' y='105' font-family='sans-serif' font-size='9' fill='#6E7681'>redacted</text>
    <rect x='16' y='120' width='90' height='16' fill='#17202A'/>
    <rect x='16' y='150' width='240' height='10' fill='#F1F1EC'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

interface DemoEntry extends AdminVerificationItem {}

// Seeded pending queue (other applicants) — oldest first drives the SLA order.
const demoQueue: DemoEntry[] = [
  {
    request: {
      id: 'vr-1', user_id: 'anisha', requested_tier: 'green', requested_city_id: 'melbourne',
      doc_kind: 'coe', storage_path: 'demo/vr-1', redaction_applied: true, status: 'pending',
      reviewer_id: null, reviewer_note: null, submitted_at: ago(22), reviewed_at: null,
    },
    applicant: { id: 'anisha', handle: 'anisha', display_name: 'Anisha', tier: 'grey' },
    preview_url: demoDoc('Confirmation of Enrolment — Deakin'),
    flags: [],
  },
  {
    request: {
      id: 'vr-2', user_id: 'kiran', requested_tier: 'gold', requested_city_id: null,
      doc_kind: 'degree', storage_path: 'demo/vr-2', redaction_applied: true, status: 'pending',
      reviewer_id: null, reviewer_note: null, submitted_at: ago(9), reviewed_at: null,
    },
    applicant: { id: 'kiran', handle: 'kiran', display_name: 'Kiran', tier: 'grey' },
    preview_url: demoDoc('Degree certificate — La Trobe'),
    flags: ['name matches an existing profile'],
  },
  {
    request: {
      id: 'vr-3', user_id: 'suman', requested_tier: 'green', requested_city_id: 'sydney',
      doc_kind: 'visa_grant', storage_path: 'demo/vr-3', redaction_applied: true, status: 'pending',
      reviewer_id: null, reviewer_note: null, submitted_at: ago(2), reviewed_at: null,
    },
    applicant: { id: 'suman', handle: 'suman', display_name: 'Suman', tier: 'grey' },
    preview_url: demoDoc('Visa grant notice — Subclass 500'),
    flags: [],
  },
];

// ---------------------------------------------------------------------------
export async function submitVerification(
  input: NewVerificationInput,
  profile: Profile,
): Promise<string> {
  if (isSupabaseConfigured) {
    // Upload redacted bytes to the private bucket, then insert the request.
    const blob = await (await fetch(input.redacted_data_url)).blob();
    const path = `${profile.id}/${Date.now()}-${input.doc_kind}`;
    const up = await supabase.storage.from('verification-docs').upload(path, blob, { upsert: false });
    if (up.error) throw up.error;
    const { data, error } = await supabase
      .from('verification_requests')
      .insert({
        user_id: profile.id,
        requested_tier: input.requested_tier,
        requested_city_id: input.requested_city_id,
        doc_kind: input.doc_kind,
        storage_path: path,
        redaction_applied: input.redaction_applied, // RLS requires this = true
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }
  // Demo.
  const id = 'vr-' + Math.random().toString(36).slice(2, 8);
  demoQueue.push({
    request: {
      id, user_id: profile.id, requested_tier: input.requested_tier,
      requested_city_id: input.requested_city_id, doc_kind: input.doc_kind,
      storage_path: 'demo/' + id, redaction_applied: input.redaction_applied,
      status: 'pending', reviewer_id: null, reviewer_note: null,
      submitted_at: new Date().toISOString(), reviewed_at: null,
    },
    applicant: { id: profile.id, handle: profile.handle, display_name: profile.display_name, tier: profile.tier },
    preview_url: input.redacted_data_url,
    flags: [],
  });
  return id;
}

export async function getMyRequests(profile: Profile): Promise<VerificationRequest[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', profile.id)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as VerificationRequest[];
  }
  return demoQueue.filter((e) => e.request.user_id === profile.id).map((e) => e.request).reverse();
}

export async function listPendingVerifications(): Promise<AdminVerificationItem[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('verification_requests')
      .select('*, profiles(id, handle, display_name, tier)')
      .in('status', ['pending', 'more_info'])
      .order('submitted_at', { ascending: true }); // oldest first — SLA order
    if (error) throw error;
    const items = await Promise.all(
      (data ?? []).map(async (r: Record<string, unknown>) => {
        const { data: signed } = await supabase.storage
          .from('verification-docs')
          .createSignedUrl(r.storage_path as string, 300); // 5-min expiry
        const pr = (r.profiles as Record<string, unknown>) ?? {};
        return {
          request: r as unknown as VerificationRequest,
          applicant: {
            id: (pr.id as string) ?? '',
            handle: (pr.handle as string) ?? '',
            display_name: (pr.display_name as string) ?? 'Applicant',
            tier: (pr.tier as AdminVerificationItem['applicant']['tier']) ?? 'grey',
          },
          preview_url: signed?.signedUrl ?? '',
          flags: [],
        } as AdminVerificationItem;
      }),
    );
    return items;
  }
  return demoQueue
    .filter((e) => e.request.status === 'pending' || e.request.status === 'more_info')
    .sort((a, b) => new Date(a.request.submitted_at).getTime() - new Date(b.request.submitted_at).getTime());
}

export async function reviewVerification(
  id: string,
  decision: ReviewDecision,
  note: string,
  reviewerId: string,
): Promise<void> {
  if (isSupabaseConfigured) {
    // The verify-review Edge Function performs the privileged profile write
    // (tier/city) via the service role and records the decision + notification.
    const { error } = await supabase.functions.invoke('verify-review', {
      body: { request_id: id, decision, note },
    });
    if (error) throw error;
    return;
  }
  const entry = demoQueue.find((e) => e.request.id === id);
  if (entry) {
    entry.request.status = decision;
    entry.request.reviewer_note = note || null;
    entry.request.reviewer_id = reviewerId;
    entry.request.reviewed_at = new Date().toISOString();
  }
}

/** SLA: 24h from submission. Returns hours remaining (negative = breached). */
export function slaHoursRemaining(submittedAt: string, now = Date.now()): number {
  return 24 - (now - new Date(submittedAt).getTime()) / HOUR;
}
