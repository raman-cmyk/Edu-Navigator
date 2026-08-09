import { useTranslation } from 'react-i18next';

/*
 * Skip-to-content link — the first focusable element on the page. Visually hidden
 * until focused (keyboard/screen-reader users). Targets the current page's
 * <main> at click time, so no per-page ids are needed. Accessibility floor,
 * docs/04.
 */
export function SkipLink() {
  const { t } = useTranslation();
  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    const main = document.querySelector('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      (main as HTMLElement).focus();
      main.scrollIntoView();
    }
  }
  return (
    <a
      href="#main"
      onClick={onClick}
      className="sr-only focus:not-sr-only"
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        zIndex: 50,
        background: 'var(--ink)',
        color: 'var(--paper)',
        padding: '8px 12px',
        borderRadius: 'var(--r-sm)',
      }}
    >
      {t('common.skipToContent')}
    </a>
  );
}
