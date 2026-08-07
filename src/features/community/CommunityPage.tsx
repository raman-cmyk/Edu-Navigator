import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PublicHeader } from '@/components/PublicHeader';
import { PostCard } from '@/components/PostCard';
import { LoadingBlock } from '@/components/EmptyState';
import { ButtonLink } from '@/components/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listFeed } from '@/lib/api/posts';
import { JOURNEY_STAGES } from '@/types/domain';

/*
 * Community, logged out. Full feed — blur nothing, gate nothing. The content is
 * the advertisement. The login prompt appears only when someone tries to vote,
 * comment, post, or save (handled on the thread/compose screens). See docs/05.
 */
export function CommunityPage() {
  const { t } = useTranslation();
  const { isAuthed } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['community-feed'],
    queryFn: () => listFeed({ country: 'AU' }),
  });

  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pb-s8 pt-s4">
        <div className="flex items-center justify-between gap-s3">
          <h1 className="text-h1">{t('community.title')}</h1>
          {isAuthed && <ButtonLink to="/feed" variant="secondary">{t('nav.feed')}</ButtonLink>}
        </div>

        {!isAuthed && (
          <p className="mt-s2 rounded-md bg-sunk p-s3 text-small text-ink-soft">
            {t('community.readOnlyBanner')}
          </p>
        )}

        {/* Stage room links */}
        <nav className="mt-s4 flex flex-wrap gap-s2" aria-label={t('community.title')}>
          {JOURNEY_STAGES.map((stage) => (
            <Link
              key={stage}
              to={`/c/${stage}`}
              className="rounded-full border border-rule bg-surface px-s4 py-s1 text-small no-underline text-ink-soft"
            >
              {t(`stages.${stage}`)}
            </Link>
          ))}
        </nav>

        <div className="mt-s5 flex flex-col gap-s3">
          {isLoading ? (
            <>
              <LoadingBlock height={140} />
              <LoadingBlock height={140} />
            </>
          ) : (
            data?.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </main>
    </div>
  );
}
