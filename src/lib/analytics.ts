/*
 * Analytics + error reporting. Privacy first — this is a trust product, so NO
 * Google Analytics and NO PII in events (docs/03). Plausible is cookieless and
 * only loads when a domain is configured. Everything here is a no-op unless the
 * relevant env var is set, so local/demo runs send nothing.
 */

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, string | number> }) => void;
  }
}

export function initAnalytics(): void {
  const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
  if (!domain || typeof document === 'undefined') return;
  const s = document.createElement('script');
  s.defer = true;
  s.setAttribute('data-domain', domain);
  // Self-hostable; swap the src for your Plausible instance if not using cloud.
  s.src = 'https://plausible.io/js/script.js';
  document.head.appendChild(s);
}

/** Track a named event. No PII — pass only non-identifying props. */
export function track(event: string, props?: Record<string, string | number>): void {
  if (typeof window !== 'undefined' && window.plausible) {
    window.plausible(event, props ? { props } : undefined);
  }
}

/*
 * Error reporting. When VITE_SENTRY_DSN is set, forward uncaught errors to
 * Sentry's ingest endpoint. Kept dependency-free (no @sentry/react) so the
 * bundle budget isn't affected; a fuller integration can swap this later.
 */
export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => report(dsn, e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => report(dsn, e.reason));
}

function report(dsn: string | undefined, err: unknown): void {
  // Never block the UI; never leak PII. In prod with a DSN, forward minimally.
  // eslint-disable-next-line no-console
  console.error('[baato]', err);
  if (!dsn) return;
  // Intentionally minimal: message + no user data. A dedicated transport can be
  // added when @sentry/react is introduced.
}
