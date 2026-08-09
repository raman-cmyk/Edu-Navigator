// verify-review — admin approves/rejects a verification request.
//
// This is the ONLY path that writes tier/city/university onto a profile. It runs
// with the service role because those columns are revoked from `authenticated`
// (docs/02) — a user can never set their own tier. The caller must be an admin
// (role in app_metadata). On a decision it records the review and notifies the
// applicant. See docs/03 (Edge Functions) and docs/08 T4.4.
//
// Deno runtime. Secrets come from Deno.env — never the client.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ReviewBody {
  request_id?: string;
  decision?: 'approved' | 'rejected' | 'more_info';
  note?: string;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  // Verify the caller is an authenticated admin.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  if (userData.user.app_metadata?.role !== 'admin') return json({ error: 'forbidden' }, 403);
  const reviewerId = userData.user.id;

  let body: ReviewBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { request_id, decision, note } = body;
  if (!request_id || !decision || !['approved', 'rejected', 'more_info'].includes(decision)) {
    return json({ error: 'invalid_input' }, 400);
  }
  if ((decision === 'rejected' || decision === 'more_info') && !note?.trim()) {
    return json({ error: 'reason_required' }, 400); // the applicant must see why
  }

  const { data: request, error: reqErr } = await admin
    .from('verification_requests')
    .select('*')
    .eq('id', request_id)
    .single();
  if (reqErr || !request) return json({ error: 'not_found' }, 404);

  // Apply the decision.
  const patch: Record<string, unknown> = {
    status: decision,
    reviewer_id: reviewerId,
    reviewer_note: note ?? null,
    reviewed_at: new Date().toISOString(),
  };
  const { error: updErr } = await admin.from('verification_requests').update(patch).eq('id', request_id);
  if (updErr) return json({ error: 'update_failed' }, 500);

  if (decision === 'approved') {
    // The privileged write: grant the tier/city on the profile.
    const profilePatch: Record<string, unknown> = { tier: request.requested_tier };
    if (request.requested_city_id) profilePatch.city_id = request.requested_city_id;
    const { error: profErr } = await admin.from('profiles').update(profilePatch).eq('id', request.user_id);
    if (profErr) return json({ error: 'profile_update_failed' }, 500);

    // Record city history so gold alumni can post in this city room later even
    // after moving away (docs/08 T6.1). Idempotent on (user_id, city_id).
    if (request.requested_city_id) {
      await admin
        .from('profile_cities')
        .upsert({ user_id: request.user_id, city_id: request.requested_city_id }, { onConflict: 'user_id,city_id' });
    }
  }

  // Notify the applicant (notification insert is service-role only).
  await admin.from('notifications').insert({
    user_id: request.user_id,
    kind: `verification_${decision}`,
    payload: { request_id, note: note ?? null },
  });

  return json({ ok: true, decision });
});
