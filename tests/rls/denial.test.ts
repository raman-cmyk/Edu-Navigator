/**
 * RLS DENIAL TESTS — the 8 load-bearing behaviors from docs/02 "Testing requirement".
 *
 * Each test asserts DENIAL (the write returns an error), not merely permission.
 * If these do not pass, the product is not shippable (docs/02).
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN (against a local Supabase stack)
 * ---------------------------------------------------------------------------
 *   1. Start the stack (applies migrations + seed):
 *        supabase start
 *        supabase db reset            # ensures 0001-0005 + seed are loaded
 *   2. Grab the local keys printed by `supabase status`, then export:
 *        export SUPABASE_URL=http://localhost:54321
 *        export SUPABASE_ANON_KEY=<anon key from `supabase status`>
 *        export SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>
 *   3. Run:
 *        npm run test:rls
 *
 * When SUPABASE_URL is not set the whole suite is SKIPPED (not failed), so a
 * plain `npm test` stays green in environments without a local DB. CI that
 * provisions Supabase should set the three env vars above to actually exercise
 * these tests.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);

// A run-unique suffix so repeated runs don't collide on unique columns.
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const PW = 'password123!';

describe.skipIf(!configured)('RLS denial behaviors (docs/02)', () => {
  // NOTE: `describe.skipIf` still runs this factory body at collection time (it
  // only skips the tests/hooks), so clients must be built inside beforeAll —
  // never at the top level, or an unconfigured `npm test` throws instead of
  // skipping. `configured` is guaranteed true by the time beforeAll runs.
  let admin: SupabaseClient;

  const createdUserIds: string[] = [];
  let cityId: string;
  let postId: string;

  let greyClient: SupabaseClient;
  let greenClient: SupabaseClient;
  let agentClient: SupabaseClient;
  let greyId: string;
  let greenId: string;
  let agentId: string;

  /** Create an auth user (profile auto-created by trigger), apply profile
   *  overrides via the service role, then return a signed-in anon client. */
  async function makeUser(
    label: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ client: SupabaseClient; id: string }> {
    const email = `rls_${label}_${RUN}@dev.local`;
    const handle = `rls${label}${RUN}`.toLowerCase().slice(0, 20);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PW,
      email_confirm: true,
      user_metadata: { handle, display_name: `RLS ${label}`, lang: 'en' },
    });
    if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
    const id = data.user.id;
    createdUserIds.push(id);

    if (Object.keys(overrides).length > 0) {
      const { error: upErr } = await admin.from('profiles').update(overrides).eq('id', id);
      if (upErr) throw new Error(`profile override(${label}) failed: ${upErr.message}`);
    }

    const client = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await client.auth.signInWithPassword({ email, password: PW });
    if (signErr) throw new Error(`signIn(${label}) failed: ${signErr.message}`);
    return { client, id };
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // A city the test users are NOT verified for.
    const { data: city, error: cityErr } = await admin
      .from('cities')
      .insert({ slug: `rls-city-${RUN}`, name: 'RLS Test City', country: 'AU', is_active: true })
      .select()
      .single();
    if (cityErr || !city) throw new Error(`city insert failed: ${cityErr?.message}`);
    cityId = city.id;

    const grey = await makeUser('grey'); // default grey, city_id null
    const green = await makeUser('green', { tier: 'green' });
    const agent = await makeUser('agent', { tier: 'agent', is_agent: true });
    greyClient = grey.client;
    greyId = grey.id;
    greenClient = green.client;
    greenId = green.id;
    agentClient = agent.client;
    agentId = agent.id;

    // A question post to answer / vote on (created via service role, bypassing RLS).
    const { data: post, error: postErr } = await admin
      .from('posts')
      .insert({
        author_id: greenId,
        kind: 'question',
        stage: 'deciding',
        title: 'RLS fixture question post for denial tests',
        body: 'fixture body',
      })
      .select()
      .single();
    if (postErr || !post) throw new Error(`fixture post failed: ${postErr?.message}`);
    postId = post.id;
  }, 60_000);

  afterAll(async () => {
    // Best-effort cleanup.
    for (const id of createdUserIds) {
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ignore */
      }
    }
    try {
      await admin.from('cities').delete().eq('id', cityId);
    } catch {
      /* ignore */
    }
  });

  it('1. grey user answer insert is denied', async () => {
    const { error } = await greyClient.from('answers').insert({
      post_id: postId,
      author_id: greyId,
      body: 'grey should not be able to answer',
    });
    expect(error).toBeTruthy();
  });

  it('2. agent post insert is denied', async () => {
    const { error } = await agentClient.from('posts').insert({
      author_id: agentId,
      kind: 'question',
      stage: 'deciding',
      title: 'An agent should not be able to post this',
      body: 'agent body',
    });
    expect(error).toBeTruthy();
  });

  it('3. self-setting own tier to gold is denied (column revoked)', async () => {
    const { error } = await greenClient.from('profiles').update({ tier: 'gold' }).eq('id', greenId);
    expect(error).toBeTruthy();
  });

  it('4. non-city member posting in a city room is denied', async () => {
    const { error } = await greyClient.from('posts').insert({
      author_id: greyId,
      kind: 'question',
      stage: 'landing',
      city_id: cityId, // grey is not verified for this city
      title: 'Trying to post into a city room I do not belong to',
      body: 'city room body',
    });
    expect(error).toBeTruthy();
  });

  it('5. verification submitted without redaction is denied', async () => {
    const { error } = await greyClient.from('verification_requests').insert({
      user_id: greyId,
      requested_tier: 'green',
      doc_kind: 'offer_letter',
      storage_path: `verification-docs/${greyId}/doc.pdf`,
      redaction_applied: false, // must be true to submit
      status: 'pending',
    });
    expect(error).toBeTruthy();
  });

  it('6. client shortlist_runs insert is denied (service-role only)', async () => {
    const { error } = await greyClient.from('shortlist_runs').insert({
      share_slug: `client-run-${RUN}`,
      inputs: {},
      results: {},
      verdict: 'client should not be able to write this',
      confidence: 'low',
    });
    expect(error).toBeTruthy();
  });

  it('7. answer nested two levels deep is denied', async () => {
    // green can answer. Build a valid depth-1 chain, then attempt depth 2.
    const { data: a, error: aErr } = await greenClient
      .from('answers')
      .insert({ post_id: postId, author_id: greenId, body: 'root answer' })
      .select()
      .single();
    expect(aErr).toBeNull();
    expect(a).toBeTruthy();

    const { data: b, error: bErr } = await greenClient
      .from('answers')
      .insert({ post_id: postId, author_id: greenId, body: 'depth-1 reply', parent_answer_id: a!.id })
      .select()
      .single();
    expect(bErr).toBeNull();
    expect(b).toBeTruthy();

    const { error: cErr } = await greenClient
      .from('answers')
      .insert({ post_id: postId, author_id: greenId, body: 'depth-2 reply', parent_answer_id: b!.id });
    expect(cErr).toBeTruthy(); // depth > 1 rejected
  });

  it('8. downvote (value = -1) is denied', async () => {
    const { error } = await greyClient.from('votes').insert({
      user_id: greyId,
      target_type: 'post',
      target_id: postId,
      value: -1, // only value = 1 is allowed
    });
    expect(error).toBeTruthy();
  });
});
