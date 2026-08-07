import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { SortTabs } from '@/components/SortTabs';
import { PostCard } from '@/components/PostCard';
import { EmptyState, LoadingBlock } from '@/components/EmptyState';
import { ButtonLink } from '@/components/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listStage } from '@/lib/api/posts';
import { JOURNEY_STAGES } from '@/types/domain';
import type { JourneyStage, FeedSort } from '@/types/domain';

/*
 * Stage room — one of five, same structure, scoped content. Sort tabs
 * (Hot / New / Unanswered), pinned "Start here" post first. See docs/05.
 */
export function StageRoomPage() {
  const { t } = useTranslation();
  const { stage } = useParams<{ stage: string }>();
  const { profile } = useAuth();
  const [sort, setSort] = useState<FeedSort>('hot');

  const valid = Boolean(stage && JOURNEY_STAGES.includes(stage as JourneyStage));
  const stageTyped = (valid ? stage : 'deciding') as JourneyStage;
  const viewer = { stage: stageTyped, country: profile?.target_country ?? 'AU' };
  const { data, isLoading } = useQuery({
    queryKey: ['stage', stageTyped, sort, profile?.id ?? 'anon'],
    queryFn: () => listStage(stageTyped, sort, viewer),
    enabled: valid,
  });

  if (!valid) return <Navigate to="/feed" replace />;

  return (
    <AppShell>
      <h1 className="text-h1">{t(`stages.${stageTyped}`)}</h1>
      <div className="mt-s3">
        <SortTabs value={sort} onSelect={setSort} />
      </div>
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
