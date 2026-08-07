import type { VerificationTier } from '@/types/domain';

/*
 * The most-rendered component in the product. Badges are never color-only —
 * the tier is always spelled out in text (accessibility floor). Agents must be
 * unmistakable: a full pill, never abbreviated, never subtle.
 * See docs/04-design-system.md.
 */

const TIER_COLOR: Record<VerificationTier, string> = {
  gold: 'var(--verified)',
  green: 'var(--student)',
  agent: 'var(--agent)',
  grey: 'var(--stone)',
};

const TIER_LABEL: Record<VerificationTier, string> = {
  gold: 'Gold',
  green: 'Green',
  agent: 'Agent',
  grey: '',
};

export interface BadgeProps {
  tier: VerificationTier;
  name: string;
  city?: string | null;
  university?: string | null;
  gradYear?: number | null;
  /** Anonymous posts hide the name but still show the badge. */
  anonymous?: boolean;
}

export function Badge({
  tier,
  name,
  city,
  university,
  gradYear,
  anonymous = false,
}: BadgeProps) {
  const displayName = anonymous ? 'Anonymous' : name;

  // Agents get a loud, full pill. Trust rule 4 made visible.
  if (tier === 'agent') {
    return (
      <span className="inline-flex items-center gap-s2 text-small">
        <span style={{ color: 'var(--ink-soft)' }}>{displayName}</span>
        <span
          className="inline-flex items-center rounded-sm px-s2 py-s1 text-small"
          style={{
            background: 'color-mix(in srgb, var(--agent) 12%, transparent)',
            color: 'var(--agent)',
            fontWeight: 600,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              background: 'var(--agent)',
              marginRight: 6,
              display: 'inline-block',
            }}
          />
          Agent
        </span>
      </span>
    );
  }

  // Grey: dot only, no tier text beyond the name.
  if (tier === 'grey') {
    return (
      <span className="inline-flex items-center gap-s2 text-small">
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, background: TIER_COLOR.grey, display: 'inline-block' }}
        />
        <span style={{ color: 'var(--ink-soft)' }}>{displayName}</span>
      </span>
    );
  }

  const parts = [TIER_LABEL[tier], city, university && gradYear ? `${university} '${String(gradYear).slice(-2)}` : university]
    .filter(Boolean)
    .join(' · ');

  return (
    <span className="inline-flex items-center gap-s2 text-small">
      <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{displayName}</span>
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, background: TIER_COLOR[tier], display: 'inline-block' }}
      />
      <span style={{ color: 'var(--ink-soft)' }}>{parts}</span>
    </span>
  );
}
