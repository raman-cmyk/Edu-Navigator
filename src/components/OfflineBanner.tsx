import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/*
 * "You're offline. Reading works, posting will send when you're back."
 * (docs/03 §Offline, docs/05 cross-cutting states). Non-blocking strip; reading
 * continues from the PWA cache, and writes queue via lib/offlineQueue.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="w-full px-s4 py-s2 text-center text-small"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      {t('common.offline')}
    </div>
  );
}
