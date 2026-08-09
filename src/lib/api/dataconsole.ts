import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { DataConfidenceRow, CommunityHealth } from '@/types/domain';

/*
 * Data console (docs C4): data confidence by university, community health
 * (answer rate, unanswered backlog), and the commission ledger editor. The
 * answer rate is the North Star — if a scared student asks at 2am and a verified
 * alum answers by morning, the product works.
 */

export async function getDataConfidenceByUniversity(): Promise<DataConfidenceRow[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('universities')
      .select('id, name, data_confidence, university_data_points(count)')
      .order('name');
    if (error) throw error;
    return (data ?? []).map((u: Record<string, unknown>) => ({
      university_id: u.id as string,
      name: u.name as string,
      data_points: Array.isArray(u.university_data_points) ? (u.university_data_points as unknown[]).length : 0,
      confidence: (u.data_confidence as DataConfidenceRow['confidence']) ?? 'none',
    }));
  }
  return [
    { university_id: 'deakin', name: 'Deakin University', data_points: 22, confidence: 'high' },
    { university_id: 'latrobe', name: 'La Trobe University', data_points: 9, confidence: 'medium' },
    { university_id: 'wsu', name: 'Western Sydney University', data_points: 8, confidence: 'medium' },
    { university_id: 'federation', name: 'Federation University', data_points: 4, confidence: 'low' },
    { university_id: 'scu', name: 'Southern Cross University', data_points: 3, confidence: 'low' },
    { university_id: 'adelaide', name: 'University of Adelaide', data_points: 1, confidence: 'low' },
    { university_id: 'cdu', name: 'Charles Darwin University', data_points: 0, confidence: 'none' },
    { university_id: 'usyd', name: 'University of Sydney', data_points: 0, confidence: 'none' },
  ];
}

export async function getCommunityHealth(): Promise<CommunityHealth> {
  if (isSupabaseConfigured) {
    const [{ data: rate }, { count: backlog }] = await Promise.all([
      supabase.from('v_answer_rate').select('answer_rate').maybeSingle(),
      supabase.from('v_unanswered_questions').select('*', { count: 'exact', head: true }),
    ]);
    return {
      answer_rate_7d: (rate?.answer_rate as number) ?? 0,
      unanswered_backlog: backlog ?? 0,
      median_time_to_first_verified_hours: null,
    };
  }
  return { answer_rate_7d: 0.62, unanswered_backlog: 3, median_time_to_first_verified_hours: 7 };
}

export async function updateCommission(
  universityId: string,
  amountAud: number,
  rebatePct: number | null,
  note: string,
): Promise<void> {
  if (isSupabaseConfigured) {
    // Publishes straight to the public /commissions ledger (admin/service role).
    const { error } = await supabase.from('commission_ledger').insert({
      university_id: universityId,
      amount_aud: amountAud,
      rebate_pct: rebatePct,
      effective_from: new Date().toISOString().slice(0, 10),
      note,
    });
    if (error) throw error;
    return;
  }
  // Demo: no-op with an explanatory return (the public ledger is static in demo).
}
