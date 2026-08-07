import type {
  AuthorSummary,
  FeedPost,
  ThreadAnswer,
  JourneyStage,
  PostKind,
} from '@/types/domain';

/*
 * DEMO-ONLY in-memory community store.
 *
 * In production every read/write goes through Supabase PostgREST with RLS. This
 * store exists only so the community is runnable locally without a backend. It
 * mirrors the dev-seed shape from docs/09, including the required test cases:
 * unanswered questions under 24h (feed boost), an experience post, anonymous
 * posts, and a negative "I regret coming here" post that must NOT be flagged
 * (trust rule 5).
 */

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const AUTHORS: Record<string, AuthorSummary> = {
  sujata: { id: 'sujata', handle: 'sujata', display_name: 'Sujata', tier: 'gold', city: 'Melbourne', university: 'Deakin', grad_year: 2024 },
  bibek: { id: 'bibek', handle: 'bibek', display_name: 'Bibek', tier: 'gold', city: 'Adelaide', university: 'CDU', grad_year: 2023 },
  anjali: { id: 'anjali', handle: 'anjali', display_name: 'Anjali', tier: 'gold', city: 'Melbourne', university: 'La Trobe', grad_year: 2024 },
  prakash: { id: 'prakash', handle: 'prakash', display_name: 'Prakash', tier: 'green', city: 'Brisbane', university: null, grad_year: null },
  sita: { id: 'sita', handle: 'sita', display_name: 'Sita', tier: 'green', city: 'Sydney', university: null, grad_year: null },
  raju: { id: 'raju', handle: 'raju', display_name: 'Raju', tier: 'grey', city: null, university: null, grad_year: null },
  gita: { id: 'gita', handle: 'gita', display_name: 'Gita', tier: 'grey', city: null, university: null, grad_year: null },
  agentx: { id: 'agentx', handle: 'eduagent', display_name: 'EduPath Consultancy', tier: 'agent', city: null, university: null, grad_year: null },
};

export function authorById(id: string): AuthorSummary {
  return AUTHORS[id] ?? { id, handle: id, display_name: 'Member', tier: 'grey', city: null, university: null, grad_year: null };
}

interface Seed {
  id: string;
  author: string;
  kind: PostKind;
  stage: JourneyStage;
  city?: string | null;
  cityName?: string | null;
  title: string;
  body: string;
  anon?: boolean;
  ageHours: number;
  answers: number;
  verifiedAnswers: number;
  upvotes: number;
  pinned?: boolean;
  unis?: string[];
  countries?: string[];
}

const SEEDS: Seed[] = [
  // Unanswered under 24h — must dominate the feed.
  { id: 'p1', author: 'gita', kind: 'question', stage: 'visa', title: 'Will a 2-year gap kill my visa if I worked at a bank?', body: 'I worked at a bank after my bachelor for two years. Applying for July intake. Scared the officer will refuse for the gap.', ageHours: 6, answers: 0, verifiedAnswers: 0, upvotes: 4, countries: ['AU'] },
  { id: 'p2', author: 'raju', kind: 'question', stage: 'applying', title: 'IELTS 6.0 overall but 5.5 in writing — which unis accept this?', body: 'Do I need to retake or will some universities take 5.5 in one band?', ageHours: 3, answers: 0, verifiedAnswers: 0, upvotes: 2, countries: ['AU'] },
  { id: 'p3', author: 'gita', kind: 'question', stage: 'deciding', title: 'Is regional worth it just for the extra PR points?', body: 'Everyone says go regional for PR. But is the trade-off in jobs and life worth it?', ageHours: 10, answers: 0, verifiedAnswers: 0, upvotes: 6, countries: ['AU'] },
  // Answered by verified.
  { id: 'p4', author: 'sita', kind: 'question', stage: 'living', title: 'Real monthly cost in Sydney sharing a room — honest numbers?', body: 'Not the university estimate. What do you actually spend?', anon: true, ageHours: 30, answers: 4, verifiedAnswers: 4, upvotes: 22, cityName: 'Sydney', city: 'sydney' },
  { id: 'p5', author: 'prakash', kind: 'question', stage: 'landing', title: 'First 90 days in Melbourne — bank, SIM, TFN in what order?', body: 'Landing next month. What should I set up first?', ageHours: 48, answers: 6, verifiedAnswers: 3, upvotes: 18, cityName: 'Melbourne', city: 'melbourne' },
  // Experience post (feeds the shortlist) — verified author.
  { id: 'p6', author: 'sujata', kind: 'experience', stage: 'living', title: 'Deakin IT, 2024 intake — what it actually cost me', body: 'Full breakdown of tuition, rent, and my part-time job. Sharing so the shortlist tool has real numbers.', ageHours: 72, answers: 3, verifiedAnswers: 2, upvotes: 31, unis: ['Deakin'], countries: ['AU'] },
  // Negative / regret post — MUST NOT be flagged (trust rule 5 regression).
  { id: 'p7', author: 'bibek', kind: 'experience', stage: 'living', title: 'Honestly? Coming here was a mistake for me.', body: 'I am not going to sugar-coat it. The loan pressure and isolation broke me for a year. Sharing so nobody decides blind.', ageHours: 96, answers: 5, verifiedAnswers: 2, upvotes: 44 },
  // Pinned start-here per a stage.
  { id: 'p8', author: 'anjali', kind: 'question', stage: 'visa', title: 'Start here: the GTE and financial documents checklist', body: 'Community-maintained checklist for visa-stage questions. Read before posting.', ageHours: 400, answers: 12, verifiedAnswers: 8, upvotes: 120, pinned: true },
];

// One thread with many answers (>15) would trigger the AI summary; kept small
// here for demo weight but the flag is exercised by verifiedAnswers on p8.

const ANSWER_SEEDS: Record<string, { author: string; body: string; ageHours: number; helpful?: boolean; upvotes: number }[]> = {
  p4: [
    { author: 'sita', body: 'Sharing a room in a 2-bed in Lakemba: rent AUD 190/week, groceries ~AUD 90/week, transport AUD 50/week. So roughly AUD 1,600/month all in, tighter if you cook.', ageHours: 28, helpful: true, upvotes: 15 },
    { author: 'prakash', body: 'Add ~AUD 60/month for phone and a buffer for textbooks. Sydney is the most expensive of the four cities, budget accordingly.', ageHours: 26, upvotes: 7 },
    { author: 'sujata', body: 'If you can live a bit further out (Blacktown, Auburn) rent drops to ~AUD 160/week but commute goes up. Trade-off is real.', ageHours: 20, upvotes: 9 },
    { author: 'anjali', body: 'Second everything above. The official "AUD 21,000/year" figure is understated — plan for more.', ageHours: 14, upvotes: 5 },
  ],
  p6: [
    { author: 'prakash', body: 'This is gold, thank you. Did the part-time job cover rent or just extras?', ageHours: 60, upvotes: 4 },
    { author: 'sujata', body: 'Covered rent + groceries in semester breaks when I could work full hours. During semester (48h/fortnight cap) it covered about half.', ageHours: 58, helpful: true, upvotes: 8 },
    { author: 'sita', body: 'Matches my experience at a different uni. The fortnightly cap is the thing people underestimate.', ageHours: 50, upvotes: 3 },
  ],
  p7: [
    { author: 'sujata', body: 'Thank you for writing this. It is not the story consultancies tell and people need to hear it before they mortgage land.', ageHours: 90, helpful: true, upvotes: 20 },
    { author: 'anjali', body: 'It got better for me in year two once I found community and steady work — but year one was exactly this. Both things are true.', ageHours: 80, upvotes: 12 },
  ],
};

function toFeedPost(s: Seed): FeedPost {
  return {
    id: s.id,
    author_id: s.author,
    kind: s.kind,
    stage: s.stage,
    city_id: s.city ?? null,
    title: s.title,
    body: s.body,
    is_anonymous: s.anon ?? false,
    shortlist_run_id: null,
    answer_count: s.answers,
    verified_answer_count: s.verifiedAnswers,
    upvote_count: s.upvotes,
    is_pinned: s.pinned ?? false,
    removed_at: null,
    created_at: ago(s.ageHours),
    author: authorById(s.author),
    city_name: s.cityName ?? null,
    university_tags: s.unis ?? [],
    country_tags: s.countries ?? [],
    viewer_upvoted: false,
    viewer_saved: false,
  };
}

// Mutable in-memory store (demo only). Seeded once per session.
export const posts: FeedPost[] = SEEDS.map(toFeedPost);
export const answers: Record<string, ThreadAnswer[]> = Object.fromEntries(
  Object.entries(ANSWER_SEEDS).map(([postId, list]) => [
    postId,
    list.map((a, i) => ({
      id: `${postId}-a${i}`,
      post_id: postId,
      author_id: a.author,
      body: a.body,
      parent_answer_id: null,
      is_marked_helpful: a.helpful ?? false,
      upvote_count: a.upvotes,
      removed_at: null,
      created_at: ago(a.ageHours),
      author: authorById(a.author),
      replies: [],
      viewer_upvoted: false,
    })),
  ]),
);
