import { NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Button } from './Button';
import { LanguageToggle } from './LanguageToggle';

/*
 * Admin layout + guard. Admin role lives in auth.users.raw_app_meta_data
 * (server-only). In demo mode there's a one-tap "enter admin" so the admin
 * surface is explorable locally. Non-admins never see the queues.
 */
const TABS = [
  { to: '/admin/verify', key: 'verify', label: 'Verify' },
  { to: '/admin/moderate', key: 'moderate', label: 'Moderate' },
  { to: '/admin/friction', key: 'friction', label: 'Friction' },
  { to: '/admin/data', key: 'data', label: 'Data' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isAdmin, isDemo, enterAdminDemo } = useAuth();

  if (!isAdmin) {
    return (
      <div className="min-h-full bg-paper">
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-content items-center justify-between px-s4 py-s3">
            <Link to="/" className="font-display text-h2 no-underline" style={{ color: 'var(--ink)' }}>
              {t('common.appName')}
            </Link>
            <LanguageToggle />
          </div>
        </header>
        <main className="mx-auto max-w-content px-s4 pt-s8 text-center">
          <p className="text-body text-ink-soft">{t('admin.adminOnly')}</p>
          {isDemo && (
            <div className="mt-s4 flex justify-center">
              <Button variant="primary" onClick={enterAdminDemo}>
                {t('admin.enterAdmin')}
              </Button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-content items-center justify-between px-s4 py-s3">
          <Link to="/admin/verify" className="font-display text-h2 no-underline" style={{ color: 'var(--ink)' }}>
            {t('common.appName')} · admin
          </Link>
          <LanguageToggle />
        </div>
        <nav className="mx-auto flex max-w-content gap-s4 overflow-x-auto px-s4">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              className="whitespace-nowrap pb-s2 text-small no-underline"
              style={({ isActive }) => ({
                color: isActive ? 'var(--ink)' : 'var(--stone)',
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid var(--ink)' : '2px solid transparent',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-content px-s4 pb-s8 pt-s4">{children}</main>
    </div>
  );
}
