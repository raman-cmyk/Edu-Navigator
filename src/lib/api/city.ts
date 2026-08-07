import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/*
 * City-room header + cost panel. The living-cost panel renders ONLY when the
 * sample size is >= 5 (v_city_costs); below that we say how many have shared,
 * never a median from too few points (trust rule 1). See docs/05 §city room.
 */
export interface CityStats {
  slug: string;
  name: string;
  members: number;
  verified: number;
  livingMedianAud: number | null;
  livingSampleSize: number;
  basics: string | null;
}

const DEMO: Record<string, CityStats> = {
  melbourne: { slug: 'melbourne', name: 'Melbourne', members: 89, verified: 61, livingMedianAud: 1850, livingSampleSize: 8, basics: 'Transport: myki card, get one at any 7-Eleven. Nepali groceries in Footscray and Tarneit. Median room in a share house runs AUD 180–220/week; further out is cheaper. Most students work in hospitality, retail, or aged care.' },
  sydney: { slug: 'sydney', name: 'Sydney', members: 74, verified: 52, livingMedianAud: 2100, livingSampleSize: 6, basics: 'Opal card for transport. Nepali community around Lakemba, Auburn, Rockdale. Rent is the highest of the four cities — budget AUD 190–260/week for a shared room.' },
  brisbane: { slug: 'brisbane', name: 'Brisbane', members: 41, verified: 28, livingMedianAud: 1650, livingSampleSize: 6, basics: 'Go card for transport. Cheaper than Sydney/Melbourne. Nepali groceries in Sunnybank and Moorooka.' },
  // Adelaide deliberately under the n>=5 threshold so the panel shows the note.
  adelaide: { slug: 'adelaide', name: 'Adelaide', members: 28, verified: 19, livingMedianAud: null, livingSampleSize: 3, basics: 'metroCARD for transport. Regional points apply here — a real PR advantage. Smaller but growing Nepali community.' },
};

export async function getCityStats(slug: string): Promise<CityStats | null> {
  if (isSupabaseConfigured) {
    const { data: city } = await supabase
      .from('cities')
      .select('slug, name')
      .eq('slug', slug)
      .maybeSingle();
    if (!city) return null;
    // v_city_costs exposes the median + sample size per city.
    const { data: cost } = await supabase
      .from('v_city_costs')
      .select('median_monthly_aud, sample_size')
      .eq('city_slug', slug)
      .maybeSingle();
    return {
      slug: city.slug as string,
      name: city.name as string,
      members: 0,
      verified: 0,
      livingMedianAud: (cost?.median_monthly_aud as number) ?? null,
      livingSampleSize: (cost?.sample_size as number) ?? 0,
      basics: null,
    };
  }
  return DEMO[slug] ?? null;
}
