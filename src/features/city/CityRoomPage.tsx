import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { SortTabs } from '@/components/SortTabs';
import { PostCard } from '@/components/PostCard';
import { EmptyState, LoadingBlock } from '@/components/EmptyState';
import { ButtonLink } from '@/components/Button';
import { DataFigure } from '@/components/DataFigure';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCity } from '@/lib/api/posts';
import { getCityStats } from '@/lib/api/city';
import { formatAUD } from '@/lib/format';
import type { FeedSort } from '@/types/domain';

/*
 * City room. Four cities only (docs/05). Everyone reads; only city-verified
 * members post (RLS-enforced). The cost panel renders ONLY when n >= 5 — below
 * that we say how many have shared, never a median from too few points.
 */
const CITIES = ['sydney', 'melbourne', 'adelaide', 'brisbane'];

export function CityRoomPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { profile } = useAuth();
  const [sort, setSort] = useState<FeedSort>('hot');

  const valid = Boolean(slug && CITIES.includes(slug));
  const citySlug = slug ?? 'melbourne';
  const viewer = { stage: profile?.stage ?? null, country: profile?.target_country ?? 'AU' };
  const stats = useQuery({
    queryKey: ['city', citySlug],
    queryFn: () => getCityStats(citySlug),
    enabled: valid,
  });
  const feed = useQuery({
    queryKey: ['cityfeed', citySlug, sort, profile?.id ?? 'anon'],
    queryFn: () => listCity(citySlug, sort, viewer),
    enabled: valid,
  });

  if (!valid) return <Navigate to="/city/melbourne" replace />;

  const c = stats.data;
  const costEnough = c ? c.livingSampleSize >= 5 && c.livingMedianAud != null : false;

  return (
    <AppShell>
      <h1 className="text-h1">{c?.name ?? slug}</h1>
      {c && (
        <p className="mt-s1 text-small text-stone">
          {t('community.cityMembers', { count: c.members })} · {t('community.cityVerified', { count: c.verified })}
        </p>
      )}

      {/* Cost panel — gated at n >= 5 */}
      <section className="mt-s4 rounded-md border border-rule bg-surface p-s4">
        {stats.isLoading ? (
          <LoadingBlock height={60} />
        ) : costEnough && c ? (
          <DataFigure
            label={t('community.costPanel')}
            formatted={`${formatAUD(c.livingMedianAud)} / mo`}
            confidence={c.livingSampleSize >= 20 ? 'high' : 'medium'}
            sampleSize={c.livingSampleSize}
          />
        ) : (
          <div>
            <div className="text-small text-stone">{t('community.costPanel')}</div>
            <p className="mt-s1 text-body text-ink-soft">
              {t('community.costInsufficient', { count: c?.livingSampleSize ?? 0 })}
            </p>
          </div>
        )}
      </section>

      {/* Pinned city basics */}
      {c?.basics && (
        <section className="mt-s3 rounded-md border border-rule bg-sunk p-s4">
          <h2 className="text-h2">{t('community.cityBasics')}</h2>
          <p className="mt-s2 text-body text-ink-soft">{c.basics}</p>
        </section>
      )}

      <div className="mt-s5">
        <SortTabs value={sort} onSelect={setSort} />
      </div>
      <div className="mt-s4 flex flex-col gap-s3">
        {feed.isLoading ? (
          <LoadingBlock height={140} />
        ) : feed.data && feed.data.length > 0 ? (
          feed.data.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <EmptyState
            message={t('empty.cityRoom', { count: c?.members ?? 0 })}
            action={<ButtonLink to="/ask" variant="primary">{t('nav.ask')}</ButtonLink>}
          />
        )}
      </div>
    </AppShell>
  );
}
