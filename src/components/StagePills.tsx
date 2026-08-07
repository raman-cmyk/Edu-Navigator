import { useTranslation } from 'react-i18next';
import type { JourneyStage } from '@/types/domain';
import { JOURNEY_STAGES } from '@/types/domain';

/*
 * The feed's stage selector. Horizontal-scroll pills with proper 44px touch
 * targets (the decorative Trail Bar lives on each PostCard and the wizard). The
 * selected pill is filled --ink, echoing a filled trail segment.
 */
export function StagePills({
  value,
  onSelect,
}: {
  value: JourneyStage;
  onSelect: (s: JourneyStage) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('feed.title')}
      className="flex gap-s2 overflow-x-auto pb-s1"
      style={{ scrollbarWidth: 'none' }}
    >
      {JOURNEY_STAGES.map((stage) => {
        const active = stage === value;
        return (
          <button
            key={stage}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(stage)}
            className="whitespace-nowrap rounded-full border px-s4 text-small"
            style={{
              borderColor: active ? 'var(--ink)' : 'var(--rule)',
              background: active ? 'var(--ink)' : 'var(--surface)',
              color: active ? 'var(--paper)' : 'var(--ink-soft)',
            }}
          >
            {t(`stages.${stage}`)}
          </button>
        );
      })}
    </div>
  );
}
