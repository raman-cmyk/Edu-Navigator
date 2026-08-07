import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CommissionLedgerRow } from '@/types/domain';

/*
 * The public commission ledger. Readable by everyone, including anonymous —
 * that is deliberate and load-bearing. It is the transparency claim made
 * verifiable (docs/02, docs/05 §/commissions).
 */
export async function getCommissionLedger(): Promise<CommissionLedgerRow[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('commission_ledger')
      .select('id, university_id, amount_aud, rebate_pct, effective_from, note, universities(name)')
      .order('amount_aud', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      university_id: r.university_id as string,
      university_name: (r.universities as { name?: string } | null)?.name,
      amount_aud: r.amount_aud as number,
      rebate_pct: r.rebate_pct as number | null,
      effective_from: r.effective_from as string,
      note: r.note as string | null,
    }));
  }
  return DEMO_LEDGER;
}

const DEMO_LEDGER: CommissionLedgerRow[] = [
  { id: '1', university_id: 'cqu', university_name: 'CQUniversity', amount_aud: 4500, rebate_pct: 20, effective_from: '2026-01-01', note: 'Regional provider' },
  { id: '2', university_id: 'scu', university_name: 'Southern Cross University', amount_aud: 4300, rebate_pct: null, effective_from: '2026-01-01', note: null },
  { id: '3', university_id: 'cdu', university_name: 'Charles Darwin University', amount_aud: 4200, rebate_pct: 15, effective_from: '2026-01-01', note: 'Regional provider' },
  { id: '4', university_id: 'federation', university_name: 'Federation University', amount_aud: 4000, rebate_pct: null, effective_from: '2026-01-01', note: null },
  { id: '5', university_id: 'vu', university_name: 'Victoria University', amount_aud: 3800, rebate_pct: null, effective_from: '2026-01-01', note: null },
  { id: '6', university_id: 'wsu', university_name: 'Western Sydney University', amount_aud: 3600, rebate_pct: 10, effective_from: '2026-01-01', note: null },
  { id: '7', university_id: 'latrobe', university_name: 'La Trobe University', amount_aud: 3500, rebate_pct: null, effective_from: '2026-01-01', note: null },
  { id: '8', university_id: 'deakin', university_name: 'Deakin University', amount_aud: 3200, rebate_pct: null, effective_from: '2026-01-01', note: null },
  { id: '9', university_id: 'adelaide', university_name: 'University of Adelaide', amount_aud: 2800, rebate_pct: null, effective_from: '2026-01-01', note: 'Go8' },
  { id: '10', university_id: 'usyd', university_name: 'University of Sydney', amount_aud: 2500, rebate_pct: null, effective_from: '2026-01-01', note: 'Go8' },
];
