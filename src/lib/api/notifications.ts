import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AppNotification, NotificationPrefs, NotificationKind, Profile } from '@/types/domain';
import { NOTIFICATION_KINDS } from '@/types/domain';

/*
 * Notifications: in-app list + per-kind, per-channel prefs. Sending (Viber +
 * Resend) and the hard 2-push/day cap live in the `notify` Edge Function
 * (docs B9) — never the client. Notification inserts are service-role only.
 * Demo uses a seeded list + localStorage prefs so the screens are explorable.
 */

const PREFS_KEY = 'baato_demo_notif_prefs';
const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

// Defaults lean to LESS (docs B9): the highest-value pushes on Viber, the rest
// in-app or off.
export const DEFAULT_PREFS: Record<NotificationKind, { in_app: boolean; viber: boolean; email: boolean }> = {
  verified_answer: { in_app: true, viber: true, email: false },
  marked_helpful: { in_app: true, viber: false, email: false },
  unanswered_expertise: { in_app: true, viber: true, email: false },
  verification_approved: { in_app: true, viber: true, email: true },
  verification_rejected: { in_app: true, viber: true, email: true },
  city_post: { in_app: true, viber: false, email: false },
  weekly_digest: { in_app: false, viber: false, email: false },
};

const demoNotifications: AppNotification[] = [
  { id: 'n1', user_id: 'demo-user', kind: 'verified_answer', payload: { post_id: 'p1', title: 'Will a 2-year gap kill my visa?' }, read_at: null, created_at: ago(2) },
  { id: 'n2', user_id: 'demo-user', kind: 'marked_helpful', payload: { post_id: 'p4' }, read_at: null, created_at: ago(5) },
  { id: 'n3', user_id: 'demo-user', kind: 'unanswered_expertise', payload: { post_id: 'p3', title: 'Is regional worth it just for the extra PR points?' }, read_at: null, created_at: ago(20) },
  { id: 'n4', user_id: 'demo-user', kind: 'city_post', payload: { city: 'melbourne' }, read_at: ago(26), created_at: ago(30) },
];

export async function listNotifications(profile: Profile): Promise<AppNotification[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  }
  return demoNotifications.filter((n) => n.user_id === profile.id || profile.id === 'demo-user');
}

export async function markAllRead(profile: Profile): Promise<void> {
  if (isSupabaseConfigured) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile.id).is('read_at', null);
    return;
  }
  const now = new Date().toISOString();
  demoNotifications.forEach((n) => {
    if (!n.read_at) n.read_at = now;
  });
}

export async function getPrefs(profile: Profile): Promise<NotificationPrefs> {
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('notification_prefs').select('*').eq('user_id', profile.id).maybeSingle();
    if (!data) return { ...DEFAULT_PREFS };
    // Expect a jsonb `prefs` column or flat columns; tolerate either.
    return ((data as Record<string, unknown>).prefs as NotificationPrefs) ?? { ...DEFAULT_PREFS };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as NotificationPrefs) : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setPrefs(profile: Profile, prefs: NotificationPrefs): Promise<void> {
  if (isSupabaseConfigured) {
    await supabase.from('notification_prefs').upsert({ user_id: profile.id, prefs });
    return;
  }
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function allKinds(): NotificationKind[] {
  return NOTIFICATION_KINDS;
}
