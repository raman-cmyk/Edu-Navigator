import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PublicHeader } from '@/components/PublicHeader';
import { ButtonLink } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { LoadingBlock } from '@/components/EmptyState';
import { getProofStats, getRecentAnswered } from '@/lib/api/community';

/*
 * Convince a stranger in 8 seconds this isn't another consultancy site.
 * No stock photos, no testimonial carousel, no "98% success rate".
 * Recent questions are real and live — a dead feed makes the page look dead.
 */
export function LandingPage() {
  const { t } = useTranslation();
  const proof = useQuery({ queryKey: ['proof'], queryFn: getProofStats });
  const recent = useQuery({ queryKey: ['recent'], queryFn: () => getRecentAnswered(5) });

  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pb-s8">
        {/* Hero */}
        <section className="pt-s7">
          <h1 className="text-display" style={{ maxWidth: '18ch' }}>
            {t('landing.headline')}
          </h1>
          <p className="mt-s4 text-body text-ink-soft">{t('landing.sub')}</p>
          <div className="mt-s5 flex flex-col gap-s3 sm:flex-row">
            <ButtonLink to="/shortlist" variant="primary">
              {t('landing.ctaPrimary')}
            </ButtonLink>
            <ButtonLink to="/c" variant="secondary">
              {t('landing.ctaSecondary')}
            </ButtonLink>
          </div>
        </section>

        {/* Proof strip — real numbers */}
        <section className="mt-s7 rounded-md border border-rule bg-surface p-s4">
          {proof.isLoading ? (
            <LoadingBlock height={48} />
          ) : proof.data ? (
            <div className="flex flex-wrap items-center gap-x-s4 gap-y-s2 text-small text-ink-soft">
              <span>{t('landing.proofVerified', { count: proof.data.verifiedCount })}</span>
              {proof.data.perCity.slice(0, 2).map((c) => (
                <span key={c.city}>
                  · {t('landing.proofCity', { count: c.count, city: c.city })}
                </span>
              ))}
              <span>· {t('landing.proofAnswered', { count: proof.data.answeredThisWeek })}</span>
            </div>
          ) : null}
        </section>

        {/* Live questions */}
        <section className="mt-s6">
          <h2 className="text-h2">{t('landing.recentTitle')}</h2>
          <div className="mt-s3 flex flex-col gap-s3">
            {recent.isLoading ? (
              <>
                <LoadingBlock />
                <LoadingBlock />
              </>
            ) : (
              recent.data?.map((q) => (
                <Link
                  key={q.id}
                  to={`/p/${q.id}`}
                  className="block rounded-md border border-rule bg-surface p-s4 no-underline"
                >
                  <div className="mb-s2">
                    <Badge
                      tier={q.tier}
                      name={q.authorName}
                      city={q.city}
                      university={q.university}
                      gradYear={q.gradYear}
                      anonymous={q.authorName === 'Anonymous'}
                    />
                  </div>
                  <p className="text-h2" style={{ fontSize: 'var(--t-body-size)', fontWeight: 600 }}>
                    {q.title}
                  </p>
                  <p className="mt-s1 text-small text-student">
                    {t('landing.answeredBy', { count: q.verifiedAnswerCount })}
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Transparency block */}
        <section className="mt-s7 rounded-md border border-rule bg-sunk p-s5">
          <h2 className="text-h2">{t('landing.transparencyTitle')}</h2>
          <p className="mt-s2 text-body text-ink-soft">{t('landing.transparencyBody')}</p>
          <div className="mt-s4">
            <ButtonLink to="/commissions" variant="secondary">
              {t('landing.transparencyLink')}
            </ButtonLink>
          </div>
        </section>
      </main>
    </div>
  );
}
