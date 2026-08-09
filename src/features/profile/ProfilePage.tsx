import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { PostCard } from '@/components/PostCard';
import { ButtonLink } from '@/components/Button';
import { LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getOwnProfileView, getProfileByHandle } from '@/lib/api/profiles';
import { computeHelpfulness, nextTier } from '@/lib/helpfulness';
import { relativeTime } from '@/lib/format';

/*
 * Profile — own (/me) and others (/u/:handle). "Ask [name]" routes to a public
 * post tagged to them, NOT a DM — knowledge stays in the commons and there are
 * no DMs in V1. Answers are sorted by helpfulness, not post count. See docs/05.
 */
export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const { handle } = useParams<{ handle: string }>();
  const { profile: me, isAuthed } = useAuth();
  const isOwn = !handle;

  const view = useQuery({
    queryKey: ['profile', handle ?? me?.id ?? 'anon'],
    queryFn: () =>
      isOwn ? (me ? getOwnProfileView(me) : Promise.resolve(null)) : getProfileByHandle(handle!),
    enabled: isOwn ? Boolean(me) : Boolean(handle),
  });

  if (isOwn && !isAuthed) {
    return (
      <AppShell>
        <h1 className="text-h1">{t('profile.title')}</h1>
        <p className="mt-s3 text-body text-ink-soft">{t('feed.readOnlyNote')}</p>
      </AppShell>
    );
  }

  const v = view.data;

  return (
    <AppShell>
      {view.isLoading ? (
        <LoadingBlock height={120} />
      ) : !v ? (
        <ErrorNote message={t('error.generic')} />
      ) : (
        <>
          {/* Header */}
          <section className="rounded-md border border-rule bg-surface p-s4">
            <Badge
              tier={v.profile.tier}
              name={v.profile.display_name}
              city={v.city_name}
              university={v.university_name}
              gradYear={v.profile.grad_year}
            />
            <p className="mt-s2 text-small text-stone">
              {t('profile.stage')}: {t(`stages.${v.profile.stage}`)} · {t('profile.helpfulness')}:{' '}
              <span className="mono">{computeHelpfulness(v.helpfulness)}</span>
            </p>

            {isOwn ? (
              <OwnStatus tier={v.profile.tier} />
            ) : (
              <div className="mt-s3">
                <ButtonLink to={`/ask?to=${v.profile.handle}`} variant="primary">
                  {t('profile.askName', { name: v.profile.display_name })}
                </ButtonLink>
              </div>
            )}

            {v.answers.length > 0 && (
              <p className="mt-s3 text-small text-ink-soft">
                {t('profile.contributionStat', { answers: v.answers.length, people: v.people_helped })}
              </p>
            )}

            {isOwn && (
              <div className="mt-s3">
                <ButtonLink to="/settings" variant="secondary">{t('profile.editProfile')}</ButtonLink>
              </div>
            )}
          </section>

          {/* Answers — sorted by helpfulness */}
          <section className="mt-s6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h2">{t('profile.answers')}</h2>
              <span className="text-micro text-stone">{t('profile.sortedByHelpfulness')}</span>
            </div>
            <div className="mt-s3 flex flex-col gap-s3">
              {v.answers.length === 0 ? (
                <p className="text-body text-stone">{t('profile.noAnswers')}</p>
              ) : (
                v.answers.map((a) => (
                  <Link key={a.id} to={`/p/${a.post_id}`} className="block rounded-md border border-rule bg-surface p-s3 no-underline">
                    <p className="text-body text-ink-soft">{a.body}</p>
                    <p className="mt-s1 text-micro text-stone">
                      {t('profile.inThread', { title: a.post_title })} · ↑ {a.upvote_count} · {relativeTime(a.created_at, lang)}
                      {a.is_marked_helpful ? ` · ${t('thread.markedHelpful')}` : ''}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>

          {/* Posts */}
          <section className="mt-s6">
            <h2 className="text-h2">{t('profile.posts')}</h2>
            <div className="mt-s3 flex flex-col gap-s3">
              {v.posts.length === 0 ? (
                <p className="text-body text-stone">{t('profile.noPosts')}</p>
              ) : (
                v.posts.map((p) => <PostCard key={p.id} post={p} />)
              )}
            </div>
          </section>

          {/* Saved (own only) */}
          {isOwn && v.saved && v.saved.length > 0 && (
            <section className="mt-s6">
              <h2 className="text-h2">{t('profile.saved')}</h2>
              <div className="mt-s3 flex flex-col gap-s3">
                {v.saved.map((p) => <PostCard key={p.id} post={p} />)}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

function OwnStatus({ tier }: { tier: string }) {
  const { t } = useTranslation();
  const { next, how } = nextTier(tier);
  if (!next) {
    return <p className="mt-s3 rounded-md bg-sunk p-s3 text-small text-ink-soft">{t('profile.topTier')}</p>;
  }
  return (
    <div className="mt-s3 rounded-md bg-sunk p-s3">
      <p className="text-small text-ink-soft">{t('profile.nextTier', { tier, next, how })}</p>
      <div className="mt-s2">
        <ButtonLink to="/verify" variant="primary">{t('profile.verify')}</ButtonLink>
      </div>
    </div>
  );
}
