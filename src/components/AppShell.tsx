import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { BottomNav } from './BottomNav';
import { Badge } from './Badge';
import { useAuth } from '@/lib/auth/AuthProvider';

/*
 * Authed layout: top bar (logo · search · notifications · avatar) + content +
 * bottom nav. In demo mode a small status switcher lets you explore every tier
 * (grey / green / gold / agent) and the logged-out read-only state — so the
 * locked-reply mechanic is visible without a backend.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { profile, isDemo, isAuthed, signInDemo, signOut } = useAuth();

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-content items-center justify-between px-s4 py-s3">
          <Link to="/feed" className="no-underline">
            <span className="font-display text-h2" style={{ color: 'var(--ink)' }}>
              {t('common.appName')}
            </span>
          </Link>
          <div className="flex items-center gap-s3">
            <Link to="/search" aria-label={t('nav.search')} className="text-body no-underline text-ink-soft">⌕</Link>
            <Link to="/notifications" aria-label="notifications" className="text-body no-underline text-ink-soft">🔔</Link>
            <LanguageToggle />
          </div>
        </div>

        {isDemo && (
          <div className="mx-auto flex max-w-content flex-wrap items-center gap-s2 border-t border-rule px-s4 py-s2 text-micro">
            <span className="text-stone">{t('auth.demoNote')}</span>
            {isAuthed && profile ? (
              <>
                <Badge tier={profile.tier} name={profile.display_name} city={profile.city_id} university={profile.university_id} gradYear={profile.grad_year} />
                <button className="underline text-ink-soft" onClick={signOut} style={{ minHeight: 0 }}>
                  {t('auth.signOut')}
                </button>
              </>
            ) : (
              <span className="flex flex-wrap gap-s2">
                <DemoBtn onClick={() => signInDemo('grey')}>{t('auth.asGrey')}</DemoBtn>
                <DemoBtn onClick={() => signInDemo('green')}>{t('auth.asGreen')}</DemoBtn>
                <DemoBtn onClick={() => signInDemo('gold')}>{t('auth.asGold')}</DemoBtn>
                <DemoBtn onClick={() => signInDemo('agent')}>{t('auth.asAgent')}</DemoBtn>
              </span>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-content flex-1 px-s4 pb-s7 pt-s4">{children}</main>

      <BottomNav />
    </div>
  );
}

function DemoBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-sm border border-rule bg-surface px-s2 text-micro text-ink-soft"
      style={{ minHeight: 0, paddingTop: 2, paddingBottom: 2 }}
    >
      {children}
    </button>
  );
}
