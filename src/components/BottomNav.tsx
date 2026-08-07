import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/*
 * Mobile bottom nav: Feed · Search · + Ask · City · Me. The centre "Ask" is the
 * primary action — anyone can ask, always. Icons are text glyphs to stay within
 * the font budget (no icon library).
 */
interface NavItem {
  to: string;
  key: 'feed' | 'search' | 'ask' | 'city' | 'me';
  glyph: string;
  primary?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/feed', key: 'feed', glyph: '≡' },
  { to: '/search', key: 'search', glyph: '⌕' },
  { to: '/ask', key: 'ask', glyph: '+', primary: true },
  { to: '/city/melbourne', key: 'city', glyph: '◈' },
  { to: '/me', key: 'me', glyph: '◉' },
];

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="sticky bottom-0 z-10 border-t border-rule bg-paper"
      aria-label={t('nav.feed')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-content items-stretch justify-between">
        {ITEMS.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            className="flex flex-1 flex-col items-center justify-center gap-s1 py-s2 no-underline"
            style={({ isActive }) => ({
              color: isActive ? 'var(--ink)' : 'var(--stone)',
              fontWeight: isActive ? 600 : 400,
            })}
          >
            <span
              aria-hidden="true"
              style={
                item.primary
                  ? {
                      width: 32,
                      height: 32,
                      lineHeight: '30px',
                      textAlign: 'center',
                      background: 'var(--ink)',
                      color: 'var(--paper)',
                      borderRadius: 'var(--r-sm)',
                      fontSize: 20,
                    }
                  : { fontSize: 20 }
              }
            >
              {item.glyph}
            </span>
            <span className="text-micro">{t(`nav.${item.key}`)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
