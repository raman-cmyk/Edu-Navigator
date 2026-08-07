import { useTranslation } from 'react-i18next';
import type { FeedSort } from '@/types/domain';

/* Room sort tabs: Hot · New · Unanswered (docs/05 §stage room). */
export function SortTabs({ value, onSelect }: { value: FeedSort; onSelect: (s: FeedSort) => void }) {
  const { t } = useTranslation();
  const tabs: FeedSort[] = ['hot', 'new', 'unanswered'];
  return (
    <div role="tablist" className="flex gap-s4 border-b border-rule">
      {tabs.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab)}
            className="pb-s2 text-small"
            style={{
              color: active ? 'var(--ink)' : 'var(--stone)',
              fontWeight: active ? 600 : 400,
              borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
            }}
          >
            {t(`feed.sort${tab === 'hot' ? 'Hot' : tab === 'new' ? 'New' : 'Unanswered'}`)}
          </button>
        );
      })}
    </div>
  );
}
