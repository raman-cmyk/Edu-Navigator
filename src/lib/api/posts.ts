import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  FeedPost,
  ThreadAnswer,
  JourneyStage,
  FeedSort,
  NewPostInput,
  Profile,
  AuthorSummary,
} from '@/types/domain';
import { rankFeed, sortRoom, type Viewer } from '@/lib/ranking';
import { posts as demoPosts, answers as demoAnswers } from './mockCommunity';
import { enqueue, isOffline, flush, type QueuedWrite } from '@/lib/offlineQueue';

/*
 * Community reads/writes. In production these hit Supabase PostgREST with RLS
 * enforcing the trust rules (only verified users answer, agents can't post,
 * etc.). In demo mode they operate on the in-memory store so the community is
 * runnable locally. The verified-answer gate is enforced server-side by RLS;
 * the client checks (see useAuth().canAnswer) only drive the UI.
 */

function authorFromProfile(p: Profile): AuthorSummary {
  return {
    id: p.id,
    handle: p.handle,
    display_name: p.display_name,
    tier: p.tier,
    city: p.city_id,
    university: p.university_id,
    grad_year: p.grad_year,
  };
}

// ---------------------------------------------------------------------------
// Feed + rooms
// ---------------------------------------------------------------------------
export async function listFeed(viewer: Viewer): Promise<FeedPost[]> {
  if (isSupabaseConfigured) {
    const rows = await fetchPosts({});
    return rankFeed(rows, viewer);
  }
  return rankFeed(demoPosts, viewer);
}

export async function listStage(
  stage: JourneyStage,
  sort: FeedSort,
  viewer: Viewer,
): Promise<FeedPost[]> {
  const rows = isSupabaseConfigured
    ? await fetchPosts({ stage })
    : demoPosts.filter((p) => p.stage === stage);
  return sortRoom(rows, sort, viewer);
}

export async function listCity(
  citySlug: string,
  sort: FeedSort,
  viewer: Viewer,
): Promise<FeedPost[]> {
  const rows = isSupabaseConfigured
    ? await fetchPosts({ city: citySlug })
    : demoPosts.filter((p) => p.city_id === citySlug);
  return sortRoom(rows, sort, viewer);
}

async function fetchPosts(filter: { stage?: JourneyStage; city?: string }): Promise<FeedPost[]> {
  let q = supabase
    .from('posts')
    .select(
      'id, author_id, kind, stage, city_id, title, body, is_anonymous, shortlist_run_id, answer_count, verified_answer_count, upvote_count, is_pinned, removed_at, created_at, profiles(id, handle, display_name, tier, grad_year)',
    )
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (filter.stage) q = q.eq('stage', filter.stage);
  if (filter.city) q = q.eq('city_id', filter.city);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

function mapRow(r: Record<string, unknown>): FeedPost {
  const pr = (r.profiles as Record<string, unknown>) ?? {};
  return {
    id: r.id as string,
    author_id: r.author_id as string,
    kind: r.kind as FeedPost['kind'],
    stage: r.stage as JourneyStage,
    city_id: (r.city_id as string) ?? null,
    title: r.title as string,
    body: (r.body as string) ?? null,
    is_anonymous: r.is_anonymous as boolean,
    shortlist_run_id: (r.shortlist_run_id as string) ?? null,
    answer_count: (r.answer_count as number) ?? 0,
    verified_answer_count: (r.verified_answer_count as number) ?? 0,
    upvote_count: (r.upvote_count as number) ?? 0,
    is_pinned: (r.is_pinned as boolean) ?? false,
    removed_at: (r.removed_at as string) ?? null,
    created_at: r.created_at as string,
    author: {
      id: (pr.id as string) ?? (r.author_id as string),
      handle: (pr.handle as string) ?? '',
      display_name: (pr.display_name as string) ?? 'Member',
      tier: (pr.tier as AuthorSummary['tier']) ?? 'grey',
      city: null,
      university: null,
      grad_year: (pr.grad_year as number) ?? null,
    },
    city_name: null,
    university_tags: [],
    country_tags: [],
  };
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------
export async function getPost(id: string): Promise<FeedPost | null> {
  if (isSupabaseConfigured) {
    const rows = await fetchPosts({});
    return rows.find((p) => p.id === id) ?? null;
  }
  return demoPosts.find((p) => p.id === id) ?? null;
}

export async function getThread(
  postId: string,
): Promise<{ post: FeedPost | null; answers: ThreadAnswer[] }> {
  const post = await getPost(postId);
  if (isSupabaseConfigured) {
    const { data } = await supabase
      .from('answers')
      .select('id, post_id, author_id, body, parent_answer_id, is_marked_helpful, upvote_count, removed_at, created_at, profiles(id, handle, display_name, tier, grad_year)')
      .eq('post_id', postId)
      .is('removed_at', null)
      .order('created_at', { ascending: true });
    const flat = (data ?? []).map(mapAnswer);
    return { post, answers: nest(flat) };
  }
  return { post, answers: demoAnswers[postId] ?? [] };
}

function mapAnswer(r: Record<string, unknown>): ThreadAnswer {
  const pr = (r.profiles as Record<string, unknown>) ?? {};
  return {
    id: r.id as string,
    post_id: r.post_id as string,
    author_id: r.author_id as string,
    body: r.body as string,
    parent_answer_id: (r.parent_answer_id as string) ?? null,
    is_marked_helpful: (r.is_marked_helpful as boolean) ?? false,
    upvote_count: (r.upvote_count as number) ?? 0,
    removed_at: (r.removed_at as string) ?? null,
    created_at: r.created_at as string,
    author: {
      id: (pr.id as string) ?? (r.author_id as string),
      handle: (pr.handle as string) ?? '',
      display_name: (pr.display_name as string) ?? 'Member',
      tier: (pr.tier as AuthorSummary['tier']) ?? 'grey',
      city: null,
      university: null,
      grad_year: (pr.grad_year as number) ?? null,
    },
    replies: [],
  };
}

/** Nest one level: replies hang under their parent (docs enforces depth = 1). */
function nest(flat: ThreadAnswer[]): ThreadAnswer[] {
  const roots: ThreadAnswer[] = [];
  const byId = new Map(flat.map((a) => [a.id, a]));
  for (const a of flat) {
    if (a.parent_answer_id && byId.has(a.parent_answer_id)) {
      byId.get(a.parent_answer_id)!.replies.push(a);
    } else {
      roots.push(a);
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Duplicate check (composer)
// ---------------------------------------------------------------------------
export async function findSimilar(title: string): Promise<FeedPost[]> {
  const q = title.trim().toLowerCase();
  if (q.length < 6) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  const source = isSupabaseConfigured ? await fetchPosts({}) : demoPosts;
  return source
    .filter((p) => p.kind === 'question')
    .map((p) => ({ p, score: overlap(p.title.toLowerCase(), words) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p);
}

function overlap(title: string, words: string[]): number {
  return words.reduce((n, w) => (title.includes(w) ? n + 1 : n), 0);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
export async function createPost(input: NewPostInput, author: Profile): Promise<string> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: author.id,
        kind: input.kind,
        stage: input.stage,
        city_id: input.city_id ?? null,
        title: input.title,
        body: input.body,
        is_anonymous: input.is_anonymous,
        shortlist_run_id: input.shortlist_run_id ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }
  // Demo: prepend to the in-memory store.
  const id = 'new-' + Math.random().toString(36).slice(2, 8);
  demoPosts.unshift({
    id,
    author_id: author.id,
    kind: input.kind,
    stage: input.stage,
    city_id: input.city_id ?? null,
    title: input.title,
    body: input.body,
    is_anonymous: input.is_anonymous,
    shortlist_run_id: input.shortlist_run_id ?? null,
    answer_count: 0,
    verified_answer_count: 0,
    upvote_count: 0,
    is_pinned: false,
    removed_at: null,
    created_at: new Date().toISOString(),
    author: authorFromProfile(author),
    city_name: null,
    university_tags: input.university_tags,
    country_tags: input.country_tags,
    viewer_upvoted: false,
    viewer_saved: false,
  });
  demoAnswers[id] = [];
  return id;
}

export async function createAnswer(
  postId: string,
  body: string,
  parentAnswerId: string | null,
  author: Profile,
): Promise<void> {
  if (isSupabaseConfigured) {
    // Offline: queue the answer and replay on reconnect (docs/03 §Offline).
    if (isOffline()) {
      enqueue('answer', { post_id: postId, author_id: author.id, body, parent_answer_id: parentAnswerId });
      return;
    }
    // RLS rejects this unless the author is green/gold and non-agent.
    const { error } = await supabase.from('answers').insert({
      post_id: postId,
      author_id: author.id,
      body,
      parent_answer_id: parentAnswerId,
    });
    if (error) throw error;
    return;
  }
  // Demo.
  const list = demoAnswers[postId] ?? (demoAnswers[postId] = []);
  const answer: ThreadAnswer = {
    id: `${postId}-a${list.length}-${Math.random().toString(36).slice(2, 6)}`,
    post_id: postId,
    author_id: author.id,
    body,
    parent_answer_id: parentAnswerId,
    is_marked_helpful: false,
    upvote_count: 0,
    removed_at: null,
    created_at: new Date().toISOString(),
    author: authorFromProfile(author),
    replies: [],
  };
  if (parentAnswerId) {
    const parent = list.find((a) => a.id === parentAnswerId);
    if (parent) parent.replies.push(answer);
  } else {
    list.push(answer);
  }
  const post = demoPosts.find((p) => p.id === postId);
  if (post) {
    post.answer_count += 1;
    const verified = author.tier === 'green' || author.tier === 'gold';
    if (verified) post.verified_answer_count += 1;
  }
}

export async function toggleUpvote(
  targetType: 'post' | 'answer',
  targetId: string,
  author: Profile,
): Promise<void> {
  if (isSupabaseConfigured) {
    // value = 1 only — there is no downvote path anywhere in the client.
    const { data } = await supabase
      .from('votes')
      .select('user_id')
      .eq('user_id', author.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .maybeSingle();
    if (data) {
      await supabase.from('votes').delete().eq('user_id', author.id).eq('target_type', targetType).eq('target_id', targetId);
    } else {
      await supabase.from('votes').insert({ user_id: author.id, target_type: targetType, target_id: targetId, value: 1 });
    }
    return;
  }
  if (targetType === 'post') {
    const post = demoPosts.find((p) => p.id === targetId);
    if (post) {
      post.viewer_upvoted = !post.viewer_upvoted;
      post.upvote_count += post.viewer_upvoted ? 1 : -1;
    }
  } else {
    for (const list of Object.values(demoAnswers)) {
      const a = list.find((x) => x.id === targetId) ?? list.flatMap((x) => x.replies).find((x) => x.id === targetId);
      if (a) {
        a.viewer_upvoted = !a.viewer_upvoted;
        a.upvote_count += a.viewer_upvoted ? 1 : -1;
        break;
      }
    }
  }
}

/**
 * Replay queued offline writes (answers) once back online. Registered on the
 * window 'online' event in main.tsx. No-op in demo mode.
 */
export async function replayQueuedWrites(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  return flush(async (w: QueuedWrite) => {
    if (w.kind !== 'answer') return;
    const { error } = await supabase.from('answers').insert({
      post_id: w.payload.post_id as string,
      author_id: w.payload.author_id as string,
      body: w.payload.body as string,
      parent_answer_id: (w.payload.parent_answer_id as string) ?? null,
    });
    if (error) throw error;
  });
}

export async function toggleSave(postId: string, author: Profile): Promise<void> {
  if (isSupabaseConfigured) {
    const { data } = await supabase
      .from('saves')
      .select('post_id')
      .eq('user_id', author.id)
      .eq('post_id', postId)
      .maybeSingle();
    if (data) {
      await supabase.from('saves').delete().eq('user_id', author.id).eq('post_id', postId);
    } else {
      await supabase.from('saves').insert({ user_id: author.id, post_id: postId });
    }
    return;
  }
  const post = demoPosts.find((p) => p.id === postId);
  if (post) post.viewer_saved = !post.viewer_saved;
}
