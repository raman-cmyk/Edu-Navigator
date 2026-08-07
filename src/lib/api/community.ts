import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { VerificationTier, JourneyStage } from '@/types/domain';

/*
 * Landing-page proof data. These are REAL live queries in production — if the
 * feed is dead, the landing page looks dead. That's intentional pressure
 * (docs/05 §Landing). Falls back to representative demo data locally.
 */

export interface ProofStats {
  verifiedCount: number;
  perCity: { city: string; count: number }[];
  answeredThisWeek: number;
}

export interface RecentQuestion {
  id: string;
  title: string;
  authorName: string;
  tier: VerificationTier;
  city: string | null;
  university: string | null;
  gradYear: number | null;
  stage: JourneyStage;
  verifiedAnswerCount: number;
}

export async function getProofStats(): Promise<ProofStats> {
  if (isSupabaseConfigured) {
    const [{ count: verifiedCount }] = await Promise.all([
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('tier', ['green', 'gold']),
    ]);
    // Per-city and answered-this-week would use dedicated views in prod.
    return {
      verifiedCount: verifiedCount ?? 0,
      perCity: [],
      answeredThisWeek: 0,
    };
  }
  return {
    verifiedCount: 1247,
    perCity: [
      { city: 'Melbourne', count: 89 },
      { city: 'Sydney', count: 74 },
      { city: 'Brisbane', count: 41 },
      { city: 'Adelaide', count: 28 },
    ],
    answeredThisWeek: 340,
  };
}

export async function getRecentAnswered(limit = 5): Promise<RecentQuestion[]> {
  if (isSupabaseConfigured) {
    const { data } = await supabase
      .from('posts')
      .select('id, title, stage, verified_answer_count, is_anonymous, profiles(display_name, tier, grad_year)')
      .eq('kind', 'question')
      .gt('verified_answer_count', 0)
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      title: p.title as string,
      authorName: 'Verified student',
      tier: 'green',
      city: null,
      university: null,
      gradYear: null,
      stage: p.stage as JourneyStage,
      verifiedAnswerCount: p.verified_answer_count as number,
    }));
  }
  return DEMO_RECENT.slice(0, limit);
}

const DEMO_RECENT: RecentQuestion[] = [
  {
    id: 'demo-1',
    title: 'Will a 2-year gap kill my visa if I worked at a bank?',
    authorName: 'Sujata',
    tier: 'gold',
    city: 'Melbourne',
    university: 'Deakin',
    gradYear: 2024,
    stage: 'visa',
    verifiedAnswerCount: 3,
  },
  {
    id: 'demo-2',
    title: 'Is regional worth it just for the extra PR points?',
    authorName: 'Bibek',
    tier: 'gold',
    city: 'Adelaide',
    university: 'CDU',
    gradYear: 2023,
    stage: 'deciding',
    verifiedAnswerCount: 5,
  },
  {
    id: 'demo-3',
    title: 'Real monthly cost in Sydney sharing a room — honest numbers?',
    authorName: 'Anonymous',
    tier: 'green',
    city: 'Sydney',
    university: null,
    gradYear: null,
    stage: 'living',
    verifiedAnswerCount: 4,
  },
  {
    id: 'demo-4',
    title: 'Got my CoE but IELTS band is 5.5 in writing — reapply?',
    authorName: 'Prakash',
    tier: 'green',
    city: 'Brisbane',
    university: null,
    gradYear: null,
    stage: 'applying',
    verifiedAnswerCount: 2,
  },
  {
    id: 'demo-5',
    title: 'First 90 days in Melbourne — bank, SIM, TFN in what order?',
    authorName: 'Anjali',
    tier: 'gold',
    city: 'Melbourne',
    university: 'La Trobe',
    gradYear: 2024,
    stage: 'landing',
    verifiedAnswerCount: 6,
  },
];
