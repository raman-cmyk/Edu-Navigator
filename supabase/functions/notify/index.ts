// notify — routes a notification to the user's channels and ENFORCES the hard
// 2-push-per-day cap (docs B9). The cap lives here, in the function, not just in
// prefs — a notification-spammy community feels like an agent, which is exactly
// what Baato is not.
//
// Triggered by DB webhooks (on answer/verification/etc.) and by cron (digests).
// Sends via Viber (primary — Nepal runs on Viber) and Resend (email). Always
// writes the in-app row (service role). Degrades cleanly if a provider key is
// missing. Secrets from Deno.env only.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

const PUSH_CAP_PER_DAY = 2;

interface NotifyBody {
  user_id?: string;
  kind?: string;
  payload?: Record<string, unknown>;
}

// Which kinds are eligible for a push at all (the rest are in-app/digest only).
const PUSHABLE = new Set(['verified_answer', 'unanswered_expertise', 'verification_approved', 'verification_rejected']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  let body: NotifyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { user_id, kind, payload = {} } = body;
  if (!user_id || !kind) return json({ error: 'invalid_input' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Always record the in-app notification.
  const { error: insErr } = await admin.from('notifications').insert({ user_id, kind, payload });
  if (insErr) return json({ error: 'insert_failed' }, 500);

  // Load prefs (default to LESS when absent).
  const { data: prefRow } = await admin.from('notification_prefs').select('prefs').eq('user_id', user_id).maybeSingle();
  const prefs = (prefRow?.prefs ?? {}) as Record<string, { in_app?: boolean; viber?: boolean; email?: boolean }>;
  const channel = prefs[kind] ?? {};

  const sent: string[] = [];

  // Push (Viber) — gated by pref, kind eligibility, AND the hard daily cap.
  if (channel.viber && PUSHABLE.has(kind)) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .gte('created_at', startOfDay.toISOString())
      .contains('payload', { pushed: true });

    if ((count ?? 0) < PUSH_CAP_PER_DAY) {
      const ok = await sendViber(user_id, kind, payload, admin);
      if (ok) {
        // Mark this notification as pushed so it counts toward the cap.
        await admin
          .from('notifications')
          .update({ payload: { ...payload, pushed: true } })
          .eq('user_id', user_id)
          .eq('kind', kind)
          .order('created_at', { ascending: false })
          .limit(1);
        sent.push('viber');
      }
    }
  }

  // Email (Resend) — no cap; used for lower-urgency + digests.
  if (channel.email) {
    const ok = await sendEmail(user_id, kind, payload);
    if (ok) sent.push('email');
  }

  return json({ ok: true, in_app: true, sent, push_cap: PUSH_CAP_PER_DAY });
});

async function sendViber(
  userId: string,
  kind: string,
  _payload: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
): Promise<boolean> {
  const key = Deno.env.get('VIBER_API_KEY');
  if (!key) return false; // degrade: in-app still recorded
  // Look up the user's Viber id (stored server-side, not in this demo schema).
  const { data } = await admin.from('profiles').select('handle').eq('id', userId).maybeSingle();
  if (!data) return false;
  try {
    const res = await fetch('https://chatapi.viber.com/pa/send_message', {
      method: 'POST',
      headers: { 'X-Viber-Auth-Token': key, 'content-type': 'application/json' },
      body: JSON.stringify({ receiver: userId, type: 'text', text: notifText(kind) }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

async function sendEmail(userId: string, kind: string, _payload: Record<string, unknown>): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'Baato <no-reply@baato.app>', to: userId, subject: notifText(kind), text: notifText(kind) }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

function notifText(kind: string): string {
  const map: Record<string, string> = {
    verified_answer: 'Your question got a verified answer.',
    unanswered_expertise: 'A question in your area is waiting for an answer.',
    verification_approved: 'Your verification was approved.',
    verification_rejected: 'Your verification needs another look.',
  };
  return map[kind] ?? 'You have a new notification on Baato.';
}
