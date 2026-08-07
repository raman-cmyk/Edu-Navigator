/*
 * Domain types shared across the app and the shortlist engine.
 * Mirrors the Postgres enums and the shortlist contract in the docs.
 * Keep in sync with docs/01-data-model.md and docs/06-shortlist-engine.md.
 */

// ---- Enums (mirror Postgres) ----
export type VerificationTier = 'grey' | 'green' | 'gold' | 'agent';
export type JourneyStage = 'deciding' | 'applying' | 'visa' | 'landing' | 'living';
export type PostKind = 'question' | 'experience';
export type VisaOutcome = 'approved' | 'refused' | 'pending' | 'not_applied';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'more_info';
export type DocKind =
  | 'offer_letter'
  | 'visa_grant'
  | 'coe'
  | 'student_id'
  | 'degree'
  | 'transcript'
  | 'address_proof';
export type Confidence = 'none' | 'low' | 'medium' | 'high';
export type RankingTier = 'go8' | 'mid' | 'regional' | 'private';

export const JOURNEY_STAGES: JourneyStage[] = [
  'deciding',
  'applying',
  'visa',
  'landing',
  'living',
];

export const FIELDS = [
  'it',
  'nursing',
  'business',
  'engineering',
  'cookery',
  'aged_care',
  'accounting',
  'public_health',
  'data',
  'construction',
  'other',
] as const;
export type Field = (typeof FIELDS)[number];

// ---- Core rows ----
export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  tier: VerificationTier;
  stage: JourneyStage;
  city_id: string | null;
  university_id: string | null;
  grad_year: number | null;
  course_name: string | null;
  target_country: string;
  lang: 'ne' | 'en';
  helpfulness_score: number;
  is_agent: boolean;
  banned_at: string | null;
  created_at: string;
}

export interface City {
  id: string;
  slug: string;
  name: string;
  country: string;
  is_active: boolean;
  basics_post_id: string | null;
}

export interface University {
  id: string;
  slug: string;
  name: string;
  city_id: string;
  country: string;
  is_regional: boolean;
  /** Inactive universities never render in shortlist results (docs/06 §2). */
  is_active?: boolean;
  annual_tuition_aud: number;
  commission_aud: number | null;
  commission_source: string | null;
  commission_updated_at: string | null;
  ranking_tier: RankingTier;
  nepali_student_estimate: number | null;
  data_confidence: Confidence;
}

export interface Course {
  id: string;
  university_id: string;
  name: string;
  field: Field;
  duration_months: number;
  annual_tuition_aud: number;
  min_gpa_pct: number;
  max_backlogs: number;
  min_ielts: number;
  min_ielts_band: number;
  on_skilled_occupation_list: boolean;
}

// ---- Shortlist contract (docs/06) ----
export type Qualification = 'see' | 'plus2' | 'bachelors' | 'masters';
export type GapReason = 'worked' | 'studied' | 'family' | 'health' | 'reattempt' | 'other';
export type EnglishTest = 'ielts' | 'pte' | 'duolingo' | 'toefl';
export type Priority = 'cheapest' | 'pr' | 'ranking' | 'fastest';
export type VisaBand = 'High' | 'Moderate' | 'Low';
export type PrPathway = 'Yes' | 'Weak' | 'No';

export interface ShortlistInput {
  qualification: Qualification;
  score_pct: number; // normalized to % even if GPA entered
  board: string;
  backlogs: number;
  gap_years: number;
  gap_reason?: GapReason;
  english_test?: EnglishTest | null;
  english_overall?: number;
  english_min_band?: number;
  budget_npr: number;
  has_collateral: boolean;
  field: Field;
  priority: Priority;
}

/** A figure that must always travel with its sample size (trust rule 1). */
export interface Figure {
  value: number | null; // null → render "Insufficient data"
  sample_size: number;
  confidence: Confidence;
}

export interface CostBreakdown {
  tuition_aud: number;
  living_aud: number;
  oshc_aud: number;
  visa_aud: number;
  flights_aud: number;
  forex_loss_aud: number;
  total_aud: number;
  total_npr: number | null; // null when city living-cost confidence is none
  living_confidence: Confidence;
  living_sample_size: number;
}

export interface UniversityResult {
  university_id: string;
  university_name: string;
  university_slug: string;
  city_name: string;
  ranking_tier: RankingTier;
  is_regional: boolean;
  course_id: string;
  course_name: string;
  fit_score: number; // 0-100
  fit_reason: string;
  cost: CostBreakdown;
  visa_band: VisaBand;
  visa_reasons: string[];
  pr_pathway: PrPathway;
  pr_reason: string;
  nepali_student_estimate: number | null;
  commission_aud: number;
  commission_npr: number;
  rebate_pct: number | null;
  data_confidence: Confidence;
  data_points: number;
  verdict: string;
}

export interface RejectionResult {
  university_id: string;
  university_name: string;
  course_name: string;
  commission_aud: number;
  commission_npr: number;
  reason: string; // concrete, numeric
}

export interface ShortlistOutput {
  share_slug: string;
  verdict: string;
  confidence: Confidence;
  npr_aud_rate: number;
  matches: UniversityResult[];
  rejections: RejectionResult[];
  provisional: boolean; // true when no english test / low confidence
}

// ---- Commission ledger (public) ----
export interface CommissionLedgerRow {
  id: string;
  university_id: string;
  university_name?: string;
  amount_aud: number;
  rebate_pct: number | null;
  effective_from: string;
  note: string | null;
}
