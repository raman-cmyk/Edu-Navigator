import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { FrictionEntry, FrictionRollupRow, FrictionTaskType, Profile } from '@/types/domain';

/*
 * Friction log (docs C3) — the most valuable admin screen. Ops logs every manual
 * task; the weekly rollup by task type picks V2, not the spec. Highest total
 * minutes is the next thing built. Let the pain choose.
 */

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

// Seeded so `sop` and `document_chase` top the rollup (docs/09).
const demo: FrictionEntry[] = [
  { id: 'f1', ops_user_id: 'ops1', task_type: 'sop', student_ref: 'S-102', minutes: 90, note: 'SOP draft + 2 revisions', logged_at: daysAgo(1) },
  { id: 'f2', ops_user_id: 'ops1', task_type: 'sop', student_ref: 'S-118', minutes: 75, note: 'SOP from scratch', logged_at: daysAgo(2) },
  { id: 'f3', ops_user_id: 'ops2', task_type: 'document_chase', student_ref: 'S-102', minutes: 60, note: 'Chased transcript from TU', logged_at: daysAgo(2) },
  { id: 'f4', ops_user_id: 'ops2', task_type: 'document_chase', student_ref: 'S-140', minutes: 45, note: 'Bank statement follow-up', logged_at: daysAgo(3) },
  { id: 'f5', ops_user_id: 'ops1', task_type: 'noc_run', student_ref: 'S-118', minutes: 120, note: 'Ministry NOC in person', logged_at: daysAgo(3) },
  { id: 'f6', ops_user_id: 'ops2', task_type: 'visa_prep', student_ref: 'S-140', minutes: 50, note: 'GTE interview prep', logged_at: daysAgo(4) },
  { id: 'f7', ops_user_id: 'ops1', task_type: 'sop', student_ref: 'S-155', minutes: 80, note: 'SOP revision after refusal', logged_at: daysAgo(5) },
  { id: 'f8', ops_user_id: 'ops2', task_type: 'translation', student_ref: 'S-155', minutes: 35, note: 'Citizenship translation', logged_at: daysAgo(6) },
  { id: 'f9', ops_user_id: 'ops1', task_type: 'document_chase', student_ref: 'S-160', minutes: 55, note: 'CoE follow-up with agent', logged_at: daysAgo(6) },
  { id: 'f10', ops_user_id: 'ops2', task_type: 'uni_application', student_ref: 'S-160', minutes: 40, note: 'Portal application submit', logged_at: daysAgo(7) },
];

export async function listFriction(): Promise<FrictionEntry[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('friction_log')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as FrictionEntry[];
  }
  return [...demo].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
}

export async function addFriction(
  entry: { task_type: FrictionTaskType; student_ref: string; minutes: number; note: string },
  ops: Profile,
): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('friction_log').insert({ ...entry, ops_user_id: ops.id });
    if (error) throw error;
    return;
  }
  demo.unshift({ id: 'f-' + Math.random().toString(36).slice(2, 7), ops_user_id: ops.id, logged_at: new Date().toISOString(), ...entry });
}

/** Weekly rollup by task type, total minutes descending — this picks V2. */
export async function weeklyRollup(sinceDays = 7): Promise<FrictionRollupRow[]> {
  const entries = await listFriction();
  const cutoff = Date.now() - sinceDays * DAY;
  const byType = new Map<FrictionTaskType, { total_minutes: number; entries: number }>();
  for (const e of entries) {
    if (new Date(e.logged_at).getTime() < cutoff) continue;
    const cur = byType.get(e.task_type) ?? { total_minutes: 0, entries: 0 };
    cur.total_minutes += e.minutes;
    cur.entries += 1;
    byType.set(e.task_type, cur);
  }
  return [...byType.entries()]
    .map(([task_type, v]) => ({ task_type, ...v }))
    .sort((a, b) => b.total_minutes - a.total_minutes);
}
