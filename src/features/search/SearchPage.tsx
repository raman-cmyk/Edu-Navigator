import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { PostCard } from '@/components/PostCard';
import { EmptyState, LoadingBlock } from '@/components/EmptyState';
import { ButtonLink } from '@/components/Button';
import { StagePills } from '@/components/StagePills';
import { searchPosts } from '@/lib/api/search';
import type { JourneyStage, SearchFilters } from '@/types/domain';

/*
 * Semantic search. Natural-language input encouraged. Verified content always
 * outranks unverified. The AI summary sits ABOVE the human answers, clearly
 * labeled, never replacing them. Empty state is an invitation, never "no
 * results". See docs/05 §/search and docs/07.
 */
export function SearchPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') ?? '');
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [stage, setStage] = useState<JourneyStage | null>(null);

  const filters: SearchFilters = { verifiedOnly, stage };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', query, verifiedOnly, stage],
    queryFn: () => searchPosts(query, filters, lang),
    enabled: query.trim().length > 0,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(input);
    setParams(input ? { q: input } : {});
  }

  return (
    <AppShell>
      <form onSubmit={submit}>
        <label htmlFor="search-input" className="sr-only">{t('search.title')}</label>
        <div className="flex gap-s2">
          <input
            id="search-input"
            className="flex-1 rounded-md border border-rule bg-sunk px-s3 py-s2 text-body"
            placeholder={t('search.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="rounded-md bg-ink px-s4 text-paper">
            {t('search.run')}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="mt-s3">
        <StagePills value={stage ?? 'deciding'} onSelect={(s) => setStage(stage === s ? null : s)} />
        <label className="mt-s3 flex items-center gap-s2 text-small text-ink-soft">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          {t('search.verifiedOnly')}
        </label>
      </div>

      {/* Results */}
      <div className="mt-s5">
        {query.trim().length === 0 ? null : isLoading || isFetching ? (
          <>
            <LoadingBlock height={70} />
            <div className="mt-s3" />
            <LoadingBlock height={140} />
          </>
        ) : data && data.results.length > 0 ? (
          <>
            {/* AI summary — labeled, above the human answers, never replacing them */}
            {data.summary && (
              <section className="mb-s4 rounded-md border border-rule bg-sunk p-s4">
                <div className="mb-s2 flex items-center gap-s2">
                  <span
                    className="rounded-sm px-s2 text-micro"
                    style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                  >
                    {t('search.aiLabel')}
                  </span>
                  <span className="text-micro text-stone">
                    {data.summary.generated
                      ? t('search.summaryAi', { count: data.summary.sources.length })
                      : t('search.summaryThreads')}
                  </span>
                </div>
                <p className="text-body text-ink-soft">{data.summary.text}</p>
                {data.summary.sources.length > 0 && (
                  <ul className="mt-s2 flex flex-col gap-s1">
                    {data.summary.sources.map((s, i) => (
                      <li key={s.postId} className="text-small">
                        <Link to={`/p/${s.postId}`} className="text-ink-soft">
                          [{i + 1}] {s.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <p className="mb-s2 text-micro text-stone">{t('search.resultsCount', { count: data.results.length })}</p>
            <div className="flex flex-col gap-s3">
              {data.results.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            message={t('empty.search', { count: 340 })}
            action={
              <ButtonLink to={`/ask?title=${encodeURIComponent(input)}`} variant="primary">
                {t('nav.ask')}
              </ButtonLink>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
