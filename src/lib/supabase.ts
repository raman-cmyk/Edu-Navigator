import { createClient } from '@supabase/supabase-js';

/*
 * Browser Supabase client. Uses the ANON key only — RLS is the real
 * enforcement layer (see docs/02-rls-policies.md). No service-role key ever
 * reaches the client; privileged work goes through Edge Functions.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Phone OTP primary, email magic link secondary (docs/03).
  },
});
