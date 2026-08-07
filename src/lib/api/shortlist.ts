import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { ShortlistInput, ShortlistOutput } from '@/types/domain';
import { runDemoShortlist } from '@/features/shortlist/demo';

/*
 * Client access to the shortlist. Two paths:
 *  - Production: POST to the `shortlist` Edge Function (scoring + commission +
 *    Claude verdict all run server-side; result is frozen in shortlist_runs).
 *    The result page reads the frozen jsonb — never recomputes.
 *  - Local demo (no Supabase configured): run the demo generator and stash the
 *    frozen result in sessionStorage so /s/:slug renders. Clearly demo-only.
 */

const DEMO_PREFIX = 'baato_demo_shortlist_';

function makeSlug(): string {
  // Short, URL-safe, permanent. Prod generates this server-side.
  return (
    Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6)
  );
}

export async function submitShortlist(input: ShortlistInput): Promise<string> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.functions.invoke('shortlist', { body: input });
    if (error) throw error;
    return (data as { share_slug: string }).share_slug;
  }
  // Demo path.
  const slug = makeSlug();
  const result = runDemoShortlist(input, slug);
  sessionStorage.setItem(DEMO_PREFIX + slug, JSON.stringify(result));
  return slug;
}

export async function fetchShortlistResult(slug: string): Promise<ShortlistOutput | null> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('shortlist_runs')
      .select('results')
      .eq('share_slug', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data.results as ShortlistOutput;
  }
  const raw = sessionStorage.getItem(DEMO_PREFIX + slug);
  return raw ? (JSON.parse(raw) as ShortlistOutput) : null;
}
