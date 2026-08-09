import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { ModerationQueueItem, ModerationActionRow, ModAction, ReportReason, Profile } from '@/types/domain';
import { authorById } from './mockCommunity';

/*
 * Moderation (docs C2). Two rules only: agent-as-student → permanent orange
 * label; guaranteeing outcomes → removed. Everything else stays up. Removal is
 * never a hard delete — it sets removed_at and REQUIRES a moderation_actions row
 * with a reason (the audit trail is append-only and immutable).
 *
 * Privileged writes (removed_at, profiles.is_agent) are revoked from clients;
 * in production these route through a service-role admin function. Demo mutates
 * an in-memory store so the queue is explorable.
 */

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const demoQueue: ModerationQueueItem[] = [
  {
    id: 'mq1', source: 'ai_flagged', target_type: 'answer', target_id: 'x1',
    excerpt: 'Just apply through us and your visa is guaranteed, 100% approval for Nepali students.',
    author: authorById('agentx'), reason: 'outcome_guarantee',
    quote: 'visa is guaranteed', ai_confidence: 'high', created_at: ago(1),
  },
  {
    id: 'mq2', source: 'ai_flagged', target_type: 'post', target_id: 'x2',
    excerpt: 'DM me for guidance on your SOP, best rates in Kathmandu.',
    author: authorById('agentx'), reason: 'agent_as_student',
    quote: 'DM me for guidance', ai_confidence: 'medium', created_at: ago(4),
  },
  {
    id: 'mq3', source: 'reported', target_type: 'answer', target_id: 'x3',
    excerpt: 'This university is a scam, they took my money and I got nothing.',
    author: authorById('sita'), reason: 'abuse',
    quote: null, ai_confidence: null, created_at: ago(8),
  },
];

const demoLog: ModerationActionRow[] = [
  { id: 'ma1', moderator_id: 'admin', target_type: 'post', target_id: 'old1', action: 'labeled_agent', reason: 'Confirmed consultancy account posting as a student.', created_at: ago(30) },
];

export async function listModerationQueue(): Promise<ModerationQueueItem[]> {
  if (isSupabaseConfigured) {
    // Reports are the queryable source client-side; AI flags are written by the
    // `moderate` function into the same queue table in production.
    const { data, error } = await supabase
      .from('reports')
      .select('id, target_type, target_id, reason, note, created_at, profiles!reports_reporter_id_fkey(handle, display_name, tier)')
      .eq('status', 'open')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      source: 'reported' as const,
      target_type: r.target_type as 'post' | 'answer',
      target_id: r.target_id as string,
      excerpt: (r.note as string) ?? '',
      author: authorById((r.target_id as string) ?? ''),
      reason: r.reason as ReportReason,
      quote: null,
      ai_confidence: null,
      created_at: r.created_at as string,
    }));
  }
  return [...demoQueue];
}

export async function listActionLog(): Promise<ModerationActionRow[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('moderation_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as ModerationActionRow[];
  }
  return [...demoLog];
}

export async function actOnTarget(
  item: ModerationQueueItem,
  action: ModAction,
  reason: string,
  moderatorId: string,
): Promise<void> {
  if (isSupabaseConfigured) {
    // Append-only audit row (admin-only insert). This is the record of record.
    const { error } = await supabase.from('moderation_actions').insert({
      moderator_id: moderatorId,
      target_type: item.target_type,
      target_id: item.target_id,
      action,
      reason,
    });
    if (error) throw error;
    // NOTE: setting removed_at / profiles.is_agent is a privileged write that
    // must run with the service role — production routes it through an admin
    // moderation Edge Function. The audit row above is written here regardless.
    return;
  }
  // Demo: drop from the queue and record the action.
  const idx = demoQueue.findIndex((q) => q.id === item.id);
  if (idx >= 0) demoQueue.splice(idx, 1);
  demoLog.unshift({
    id: 'ma-' + Math.random().toString(36).slice(2, 7),
    moderator_id: moderatorId,
    target_type: item.target_type,
    target_id: item.target_id,
    action,
    reason,
    created_at: new Date().toISOString(),
  });
}

export async function reportTarget(
  targetType: 'post' | 'answer',
  targetId: string,
  reason: ReportReason,
  note: string,
  reporter: Profile,
): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('reports').insert({
      reporter_id: reporter.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      note,
      status: 'open',
    });
    if (error) throw error;
    return;
  }
  demoQueue.push({
    id: 'mq-' + Math.random().toString(36).slice(2, 7),
    source: 'reported',
    target_type: targetType,
    target_id: targetId,
    excerpt: note,
    author: authorById(reporter.id),
    reason,
    quote: null,
    ai_confidence: null,
    created_at: new Date().toISOString(),
  });
}
