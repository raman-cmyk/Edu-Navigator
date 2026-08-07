import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Profile, VerificationTier } from '@/types/domain';

/*
 * Auth + current profile. Two modes:
 *  - Production: Supabase Auth (phone OTP primary, email magic link secondary,
 *    docs/03). Profile row is created on first sign-in by a DB trigger.
 *  - Demo (no Supabase configured): a mock profile in localStorage, with a tier
 *    switcher so the locked-reply mechanic and the grey/verified/agent states
 *    can all be demonstrated locally. Clearly demo-only.
 *
 * `canAnswer` is the core gate: green/gold, not banned, not an agent. The real
 * enforcement is RLS — this only drives UI (the locked reply box).
 */

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  isAuthed: boolean;
  canAnswer: boolean;
  isDemo: boolean;
  signInDemo: (tier: VerificationTier) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY = 'baato_demo_profile';

function demoProfile(tier: VerificationTier): Profile {
  const byTier: Record<VerificationTier, Partial<Profile>> = {
    grey: { display_name: 'You (Grey)', handle: 'you', city_id: null, university_id: null },
    green: { display_name: 'You (Green)', handle: 'you', city_id: 'sydney' },
    gold: { display_name: 'You (Gold)', handle: 'you', city_id: 'melbourne', university_id: 'deakin', grad_year: 2024 },
    agent: { display_name: 'You (Agent)', handle: 'you', is_agent: true },
  };
  return {
    id: 'demo-user',
    handle: 'you',
    display_name: 'You',
    tier,
    stage: 'deciding',
    city_id: null,
    university_id: null,
    grad_year: null,
    course_name: null,
    target_country: 'AU',
    lang: 'ne',
    helpfulness_score: 0,
    is_agent: false,
    banned_at: null,
    created_at: new Date().toISOString(),
    ...byTier[tier],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const raw = localStorage.getItem(DEMO_KEY);
      setProfile(raw ? (JSON.parse(raw) as Profile) : null);
      setLoading(false);
      return;
    }
    let active = true;
    async function loadProfile(userId: string) {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (active) setProfile((data as Profile) ?? null);
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadProfile(data.session.user.id).finally(() => active && setLoading(false));
      else if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) loadProfile(session.user.id);
      else setProfile(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInDemo = useCallback((tier: VerificationTier) => {
    const p = demoProfile(tier);
    localStorage.setItem(DEMO_KEY, JSON.stringify(p));
    setProfile(p);
  }, []);

  const signOut = useCallback(() => {
    if (isSupabaseConfigured) {
      supabase.auth.signOut();
    } else {
      localStorage.removeItem(DEMO_KEY);
    }
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      profile,
      loading,
      isAuthed: Boolean(profile),
      canAnswer:
        Boolean(profile) &&
        (profile!.tier === 'green' || profile!.tier === 'gold') &&
        !profile!.banned_at &&
        !profile!.is_agent,
      isDemo: !isSupabaseConfigured,
      signInDemo,
      signOut,
    }),
    [profile, loading, signInDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
