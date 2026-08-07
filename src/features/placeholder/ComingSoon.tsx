import { useTranslation } from 'react-i18next';
import { PublicHeader } from '@/components/PublicHeader';
import { ButtonLink } from '@/components/Button';

/*
 * Placeholder for routes landing in later V1 milestones (community, thread,
 * feed, composer, verification, admin). Keeps public links from 404-ing and
 * signals the route exists in the map (docs/05).
 */
export function ComingSoon({ routeName }: { routeName: string }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pt-s8 text-center">
        <h1 className="text-h1">{routeName}</h1>
        <p className="mt-s3 text-body text-ink-soft">
          This screen is part of the community build, landing in a later milestone.
        </p>
        <div className="mt-s5 flex justify-center gap-s3">
          <ButtonLink to="/shortlist" variant="primary">
            {t('landing.ctaPrimary')}
          </ButtonLink>
          <ButtonLink to="/" variant="secondary">
            {t('common.appName')}
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
