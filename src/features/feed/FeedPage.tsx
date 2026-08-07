import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { StagePills } from '@/components/StagePills';
import { PostCard } from '@/components/PostCard';
import { EmptyState, LoadingBlock } from '@/components/EmptyState';
import { ButtonLink } from '@/components/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listStage } from '@/lib/api/posts';
import type { JourneyStage } from '@/types/domain';

/*
 * Home feed. Stage pills switch the feed; the user's own stage is pre-selected.
 * The stage banner is a contextual nudge that drives reciprocity (docs/05).
 * Unanswered questions under 24h are boosted hard by the ranking — an
 * unanswered question is a bug, and the feed's job is to route it to answerers.
 */
export function FeedPage() {
  const { t } = useTranslation();
  const { profile, isAuthed } = useAuth();
  const [stage, setStage] = useState<JourneyStage>(profile?.stage ?? 'deciding');

  const viewer = { stage, country: profile?.target_country ?? 'AU' };
  const { data, isLoading } = useQuery({
    queryKey: ['feed', stage, profile?.id ?? 'anon'],
    queryFn: () => listStage(stage, 'hot', viewer),
  });

  return (
    <AppShell>
      <StagePills value={stage} onSelect={setStage} />

      <p className="mt-s3 rounded-md bg-sunk p-s3 text-small text-ink-soft">
        {t(`feed.banner${bannerKey(stage)}`)}
      </p>

      {!isAuthed && (
        <p className="mt-s3 text-small text-stone">{t('feed.readOnlyNote')}</p>
      )}

      <div className="mt-s4 flex flex-col gap-s3">
        {isLoading ? (
          <>
            <LoadingBlock height={140} />
            <LoadingBlock height={140} />
          </>
        ) : data && data.length > 0 ? (
          data.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <EmptyState
            message={t('empty.feed')}
            action={<ButtonLink to="/ask" variant="primary">{t('nav.ask')}</ButtonLink>}
          />
        )}
      </div>
    </AppShell>
  );
}

function bannerKey(stage: JourneyStage): string {
  switch (stage) {
    case 'visa':
      return 'Visa';
    case 'landing':
      return 'Landing';
    case 'living':
      return 'Living';
    default:
      return 'Default';
  }
}
