import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';

/*
 * Minimal top bar for public pages. The wordmark is the trail name — बाटो.
 * Language toggle is always reachable (parents lurk in Nepali, and parents
 * decide).
 */
export function PublicHeader() {
  const { t } = useTranslation();
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-content items-center justify-between px-s4 py-s3">
        <Link to="/" className="no-underline" aria-label={t('common.appName')}>
          <span className="font-display text-h2" style={{ color: 'var(--ink)' }}>
            {t('common.appName')}
          </span>
        </Link>
        <div className="flex items-center gap-s3">
          <Link to="/c" className="text-small no-underline text-ink-soft">
            {t('nav.community')}
          </Link>
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
