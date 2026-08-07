import { useTranslation } from 'react-i18next';

/*
 * ne / en toggle. Persists in localStorage (handled by the detector) and swaps
 * the <html lang> attribute (handled in i18n/index.ts). Parents lurk in Nepali,
 * and parents decide — so this is always reachable. See docs/01-overview / D1.
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('ne') ? 'ne' : 'en';

  function set(lng: 'ne' | 'en') {
    if (lng !== current) i18n.changeLanguage(lng);
  }

  return (
    <div
      className={`inline-flex overflow-hidden rounded-sm border border-rule ${className}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => set('ne')}
        aria-pressed={current === 'ne'}
        className="px-s3 text-small"
        style={{
          minHeight: 32,
          background: current === 'ne' ? 'var(--ink)' : 'var(--surface)',
          color: current === 'ne' ? 'var(--paper)' : 'var(--ink-soft)',
        }}
        lang="ne"
      >
        नेपाली
      </button>
      <button
        type="button"
        onClick={() => set('en')}
        aria-pressed={current === 'en'}
        className="px-s3 text-small"
        style={{
          minHeight: 32,
          background: current === 'en' ? 'var(--ink)' : 'var(--surface)',
          color: current === 'en' ? 'var(--paper)' : 'var(--ink-soft)',
        }}
        lang="en"
      >
        EN
      </button>
    </div>
  );
}
