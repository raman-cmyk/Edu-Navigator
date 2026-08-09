import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Profile, ProfileView, FeedPost, Answer, AuthorSummary } from '@/types/domain';
import { posts as demoPosts, answers as demoAnswers, authorById } from './mockCommunity';

/*
 * Profiles: own (/me) and others (/u/:handle). "Ask [name]" routes to a public
 * post, never a DM — there are no DMs in V1 (DMs are where agents go to sell).
 * Demo assembles the view from the in-memory store; prod reads Supabase.
 */

const CITY_NAME: Record<string, string> = {
  sydney: 'Sydney', melbourne: 'Melbourne', adelaide: 'Adelaide', brisbane: 'Brisbane',
};
const UNI_NAME: Record<string, string> = {
  deakin: 'Deakin', latrobe: 'La Trobe', cdu: 'CDU', cqu: 'CQUniversity',
};

function answersBy(authorId: string): (Answer & { post_title: string })[] {
  const out: (Answer & { post_title: string })[] = [];
  for (const post of demoPosts) {
    const list = demoAnswers[post.id] ?? [];
    const flat = [...list, ...list.flatMap((a) => a.replies)];
    for (const a of flat) {
      if (a.author_id === authorId) out.push({ ...a, post_title: post.title });
    }
  }
  return out.sort((a, b) => b.upvote_count - a.upvote_count);
}

function viewFromAuthor(author: AuthorSummary, base: Profile): ProfileView {
  const myPosts = demoPosts.filter((p) => p.author_id === author.id);
  const myAnswers = answersBy(author.id);
  const marked = myAnswers.filter((a) => a.is_marked_helpful).length;
  const upvotes = myAnswers.reduce((n, a) => n + a.upvote_count, 0);
  const structured = myPosts.filter((p) => p.kind === 'experience').length;
  const peopleHelped = upvotes * 5 + marked * 25;
  return {
    profile: base,
    city_name: base.city_id ? CITY_NAME[base.city_id] ?? base.city_id : author.city,
    university_name: base.university_id ? UNI_NAME[base.university_id] ?? base.university_id : author.university,
    helpfulness: {
      answers_marked_helpful: marked,
      verified_upvotes: upvotes,
      structured_contributions: structured,
    },
    posts: myPosts,
    answers: myAnswers,
    people_helped: peopleHelped,
  };
}

function profileFromAuthor(a: AuthorSummary): Profile {
  return {
    id: a.id, handle: a.handle, display_name: a.display_name, tier: a.tier,
    stage: 'living', city_id: a.city ? a.city.toLowerCase() : null,
    university_id: a.university ? a.university.toLowerCase() : null, grad_year: a.grad_year,
    course_name: null, target_country: 'AU', lang: 'ne', helpfulness_score: 0,
    is_agent: a.tier === 'agent', banned_at: null, created_at: new Date().toISOString(),
  };
}

export async function getProfileByHandle(handle: string): Promise<ProfileView | null> {
  if (isSupabaseConfigured) {
    const { data: p } = await supabase.from('profiles').select('*').eq('handle', handle).maybeSingle();
    if (!p) return null;
    return await buildRemoteView(p as Profile);
  }
  // Demo: match a seeded author by handle.
  const entry = Object.values<AuthorSummary>(
    // authorById returns a fallback for unknowns; scan known handles instead.
    demoPosts.reduce<Record<string, AuthorSummary>>((acc, post) => {
      acc[post.author.handle] = post.author;
      return acc;
    }, {}),
  ).find((a) => a.handle === handle);
  const author = entry ?? authorById(handle);
  return viewFromAuthor(author, profileFromAuthor(author));
}

export async function getOwnProfileView(profile: Profile): Promise<ProfileView> {
  if (isSupabaseConfigured) return await buildRemoteView(profile);
  const author: AuthorSummary = {
    id: profile.id, handle: profile.handle, display_name: profile.display_name, tier: profile.tier,
    city: profile.city_id ? CITY_NAME[profile.city_id] ?? profile.city_id : null,
    university: profile.university_id ? UNI_NAME[profile.university_id] ?? profile.university_id : null,
    grad_year: profile.grad_year,
  };
  const view = viewFromAuthor(author, profile);
  view.saved = demoPosts.filter((p) => p.viewer_saved);
  return view;
}

async function buildRemoteView(profile: Profile): Promise<ProfileView> {
  const [{ data: posts }, { data: answers }] = await Promise.all([
    supabase.from('posts').select('*').eq('author_id', profile.id).is('removed_at', null).order('created_at', { ascending: false }),
    supabase.from('answers').select('*, posts(title)').eq('author_id', profile.id).is('removed_at', null),
  ]);
  const ans = (answers ?? []).map((a: Record<string, unknown>) => ({
    ...(a as unknown as Answer),
    post_title: ((a.posts as { title?: string } | null)?.title) ?? '',
  }));
  const marked = ans.filter((a) => a.is_marked_helpful).length;
  const upvotes = ans.reduce((n, a) => n + (a.upvote_count ?? 0), 0);
  return {
    profile,
    city_name: profile.city_id ? CITY_NAME[profile.city_id] ?? profile.city_id : null,
    university_name: profile.university_id ? UNI_NAME[profile.university_id] ?? profile.university_id : null,
    helpfulness: { answers_marked_helpful: marked, verified_upvotes: upvotes, structured_contributions: 0 },
    posts: (posts ?? []) as unknown as FeedPost[],
    answers: ans,
    people_helped: upvotes * 5 + marked * 25,
  };
}

/** Update the safe, self-editable columns only (RLS revokes the rest). */
export async function updateOwnProfile(patch: Partial<Profile>): Promise<void> {
  if (!isSupabaseConfigured) return; // demo: handled by AuthProvider.applyVerification / local
  const safe: Partial<Profile> = {
    display_name: patch.display_name,
    stage: patch.stage,
    target_country: patch.target_country,
    lang: patch.lang,
  };
  const { error } = await supabase.from('profiles').update(safe).eq('id', patch.id!);
  if (error) throw error;
}
