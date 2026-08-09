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

// ---- Community rows ----
export interface Post {
  id: string;
  author_id: string;
  kind: PostKind;
  stage: JourneyStage;
  city_id: string | null;
  title: string;
  body: string | null;
  is_anonymous: boolean;
  shortlist_run_id: string | null;
  answer_count: number;
  verified_answer_count: number;
  upvote_count: number;
  is_pinned: boolean;
  removed_at: string | null;
  created_at: string;
}

export interface Answer {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  parent_answer_id: string | null;
  is_marked_helpful: boolean;
  upvote_count: number;
  removed_at: string | null;
  created_at: string;
}

/** Author summary as rendered in a Badge (anonymous still shows the badge). */
export interface AuthorSummary {
  id: string;
  handle: string;
  display_name: string;
  tier: VerificationTier;
  city: string | null;
  university: string | null;
  grad_year: number | null;
}

/** A post joined with its author + tag info, as the feed/thread render it. */
export interface FeedPost extends Post {
  author: AuthorSummary;
  city_name: string | null;
  university_tags: string[];
  country_tags: string[];
  /** Whether the current viewer has upvoted / saved (viewer-specific). */
  viewer_upvoted?: boolean;
  viewer_saved?: boolean;
}

/** An answer joined with its author, plus its one level of replies. */
export interface ThreadAnswer extends Answer {
  author: AuthorSummary;
  replies: ThreadAnswer[];
  viewer_upvoted?: boolean;
}

export type FeedSort = 'hot' | 'new' | 'unanswered';

/** Input to create a question (anyone) or an experience post (verified only). */
export interface NewPostInput {
  kind: PostKind;
  title: string;
  body: string;
  stage: JourneyStage;
  city_id?: string | null;
  is_anonymous: boolean;
  shortlist_run_id?: string | null;
  university_tags: string[];
  country_tags: string[];
  experience?: ExperienceDataInput;
}

/** Structured fields on an experience post — these feed the shortlist tool. */
export interface ExperienceDataInput {
  university_id: string | null;
  course_id: string | null;
  intake: string;
  total_paid_npr: number | null;
  monthly_living_aud: number | null;
  parttime_hourly_aud: number | null;
  visa_outcome: VisaOutcome;
  refusal_reason: string | null;
  would_choose_again: 'yes' | 'no' | 'unsure';
}

// ---- Verification ----
export interface VerificationRequest {
  id: string;
  user_id: string;
  requested_tier: 'green' | 'gold';
  requested_city_id: string | null;
  doc_kind: DocKind;
  storage_path: string;
  redaction_applied: boolean;
  status: VerificationStatus;
  reviewer_id: string | null;
  reviewer_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

/** What the applicant submits (the redacted image never leaves as raw pixels). */
export interface NewVerificationInput {
  requested_tier: 'green' | 'gold';
  requested_city_id: string | null;
  university_id?: string | null;
  grad_year?: number | null;
  doc_kind: DocKind;
  /** Redacted image as a data URL (demo) or the bytes to upload (prod). */
  redacted_data_url: string;
  redaction_applied: boolean;
}

/** A queue row as the admin sees it: request + applicant + a viewable preview. */
export interface AdminVerificationItem {
  request: VerificationRequest;
  applicant: { id: string; handle: string; display_name: string; tier: VerificationTier };
  /** Signed URL (prod, 5-min) or data URL (demo). Redaction already applied. */
  preview_url: string;
  /** Flags surfaced to the reviewer. */
  flags: string[];
}

export type ReviewDecision = 'approved' | 'rejected' | 'more_info';

// ---- Search (docs/03, docs/07) ----
export interface SearchFilters {
  stage?: JourneyStage | null;
  country?: string | null;
  university?: string | null;
  city?: string | null;
  tier?: VerificationTier | null;
  verifiedOnly?: boolean;
  /** ISO date; results older than this are excluded. */
  since?: string | null;
}

/** An AI-generated block. Always labeled; `generated=false` for the fallback. */
export interface AISummary {
  text: string;
  sources: { postId: string; title: string }[];
  generated: boolean;
}

export interface SearchResponse {
  summary: AISummary | null;
  results: FeedPost[];
}

// ---- Notifications (docs/01, docs B9) ----
export type NotificationKind =
  | 'verified_answer'
  | 'marked_helpful'
  | 'unanswered_expertise'
  | 'verification_approved'
  | 'verification_rejected'
  | 'city_post'
  | 'weekly_digest';

export const NOTIFICATION_KINDS: NotificationKind[] = [
  'verified_answer',
  'marked_helpful',
  'unanswered_expertise',
  'verification_approved',
  'verification_rejected',
  'city_post',
  'weekly_digest',
];

export interface AppNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationChannels {
  in_app: boolean;
  viber: boolean;
  email: boolean;
}

/** Per-kind channel prefs. Defaults lean to LESS (docs B9). */
export type NotificationPrefs = Partial<Record<NotificationKind, NotificationChannels>>;

// ---- Profiles + helpfulness (docs/05, docs B7) ----
export interface HelpfulnessInputs {
  /** Answers the asker marked helpful. */
  answers_marked_helpful: number;
  /** Upvotes on your answers from verified users. */
  verified_upvotes: number;
  /** Structured experience-data fields you contributed. */
  structured_contributions: number;
}

export interface ProfileView {
  profile: Profile;
  city_name: string | null;
  university_name: string | null;
  helpfulness: HelpfulnessInputs;
  posts: FeedPost[];
  answers: (Answer & { post_title: string })[];
  saved?: FeedPost[];
  /** People helped by this member's answers (contribution stat). */
  people_helped: number;
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
