import { useTranslation } from 'react-i18next';

/*
 * The signature element. A trail blaze — the painted bar on rock that tells a
 * trekker they're still on the route. Filled segments are --ink, the current is
 * --blaze, unreached are --rule. Square, no rounding — a painted mark on rock
 * isn't rounded. See docs/04-design-system.md.
 *
 * Used in three places, always meaning the same thing:
 *   1. Stage selector on the feed (interactive)
 *   2. Post card (compact, showing the post's stage)
 *   3. Shortlist tool (repurposed as the 7-step progress indicator)
 */

export interface TrailBarProps {
  /** Total number of segments (5 for stages, 7 for the shortlist wizard). */
  total: number;
  /** Zero-based index of the current segment. */
  current: number;
  /** Optional labels rendered under the bar. */
  labels?: string[];
  /** Interactive stage selector: renders segments as buttons. */
  interactive?: boolean;
  onSelect?: (index: number) => void;
  /** Segment fill height in px. */
  segmentHeight?: number;
  className?: string;
  ariaLabel?: string;
}

export function TrailBar({
  total,
  current,
  labels,
  interactive = false,
  onSelect,
  segmentHeight = 4,
  className = '',
  ariaLabel,
}: TrailBarProps) {
  const { t } = useTranslation();
  const segments = Array.from({ length: total }, (_, i) => i);

  function colorFor(i: number): string {
    if (i < current) return 'var(--ink)';
    if (i === current) return 'var(--blaze)';
    return 'var(--rule)';
  }

  return (
    <div
      className={className}
      role={interactive ? 'tablist' : 'img'}
      aria-label={ariaLabel ?? t('shortlist.step', { current: current + 1, total })}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        {segments.map((i) => {
          const style: React.CSSProperties = {
            flex: 1,
            height: segmentHeight,
            background: colorFor(i),
            borderRadius: 0,
            transition: 'background 180ms ease-out',
          };
          if (interactive) {
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={labels?.[i]}
                onClick={() => onSelect?.(i)}
                style={{
                  ...style,
                  minHeight: segmentHeight,
                  padding: 0,
                  border: 'none',
                  cursor: 'pointer',
                }}
              />
            );
          }
          return <div key={i} style={style} aria-hidden="true" />;
        })}
      </div>
      {labels && (
        <div className="mt-s2 flex justify-between gap-s2">
          {labels.map((label, i) => (
            <span
              key={label}
              className="text-micro"
              style={{
                flex: 1,
                textAlign: 'center',
                color: i === current ? 'var(--ink)' : 'var(--stone)',
                fontWeight: i === current ? 600 : 400,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
