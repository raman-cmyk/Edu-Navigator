import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PublicHeader } from '@/components/PublicHeader';
import { Button, ButtonLink } from '@/components/Button';
import { LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { UniversityCard } from './UniversityCard';
import { fetchShortlistResult } from '@/lib/api/shortlist';
import { formatAUD, formatNPR } from '@/lib/format';

/*
 * Results are frozen — read from storage, never recomputed. A shared link must
 * show what the sharer saw. The rejection section is the marketing. See docs/05.
 */
export function ResultPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shortlist', slug],
    queryFn: () => fetchShortlistResult(slug),
  });

  function share() {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pb-s8 pt-s5">
        {isLoading && (
          <div className="flex flex-col gap-s3">
            <LoadingBlock height={120} />
            <LoadingBlock height={200} />
          </div>
        )}
        {isError && <ErrorNote message={t('error.generic')} />}
        {!isLoading && !data && !isError && (
          <ErrorNote message={t('error.generic')} />
        )}

        {data && (
          <>
            {/* Header: verdict */}
            <section>
              <span className="text-small text-stone">{t('result.verdictLabel')}</span>
              <p className="mt-s2 text-h2">{data.verdict}</p>
              {data.provisional && (
                <p className="mt-s3 rounded-md bg-blaze-weak p-s3 text-small text-ink">
                  {t('result.provisional')}
                </p>
              )}
            </section>

            {/* Matches */}
            <section className="mt-s6 flex flex-col gap-s4">
              {data.matches.map((r) => (
                <UniversityCard key={r.university_id + r.course_id} r={r} />
              ))}
            </section>

            {/* Rejections — the marketing */}
            {data.rejections.length > 0 && (
              <section className="mt-s7">
                <h2 className="text-h1" style={{ fontSize: 'var(--t-h2-size)' }}>
                  {t('result.rejectTitle')}
                </h2>
                <div className="mt-s3 flex flex-col gap-s3">
                  {data.rejections.map((rej) => (
                    <div key={rej.university_id} className="rounded-md border border-rule bg-surface p-s4">
                      <h3 className="text-body" style={{ fontWeight: 600 }}>
                        {rej.university_name} · {rej.course_name}
                      </h3>
                      <p className="mt-s2 text-body text-ink-soft">{rej.reason}</p>
                      <p className="mt-s2 mono text-small text-ink">
                        {formatAUD(rej.commission_aud)} · {formatNPR(rej.commission_npr)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Footer actions */}
            <section className="mt-s7 flex flex-wrap gap-s3">
              <ButtonLink to={`/ask?shortlist=${slug}`} variant="secondary">
                {t('result.askCommunity')}
              </ButtonLink>
              <Button variant="secondary" onClick={share}>
                {copied ? t('result.shareCopied') : t('result.share')}
              </Button>
              <Link to="/methodology" className="self-center text-small text-ink-soft">
                {t('result.methodology')}
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
