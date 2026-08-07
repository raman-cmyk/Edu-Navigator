-- 0005 — Storage
-- Private `verification-docs` bucket. Documents are uploaded on verification
-- submit and are NEVER publicly readable.
--
-- There is intentionally NO storage.objects policy for this bucket: with RLS
-- enabled on storage.objects (Supabase default) and no permissive policy, the
-- anon/authenticated roles cannot read or list these objects at all. Access is
-- granted only via short-lived signed URLs (5-minute expiry) minted by an
-- admin-authenticated Edge Function running with the service role. Users cannot
-- re-read their own uploaded documents after submission. See docs/02.

insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;
