import { useTranslation } from 'react-i18next';
import type { Confidence } from '@/types/domain';

/*
 * For money. Mono, with confidence attached. Never render a number without its
 * sample size — this component enforces trust rule 1 in the UI layer.
 * When confidence is 'none', render "Insufficient data", never a number.
 * See docs/04-design-system.md.
 */

export interface DataFigureProps {
  /** Pre-formatted figure string, e.g. "NPR 42,50,000". */
  formatted: string | null;
  confidence: Confidence;
  sampleSize: number;
  /** Optional label above the figure. */
  label?: string;
  /** Larger presentation for the headline cost. */
  large?: boolean;
}

export function DataFigure({ formatted, confidence, sampleSize, label, large }: DataFigureProps) {
  const { t } = useTranslation();

  if (confidence === 'none' || formatted === null) {
    return (
      <div>
        {label && <div className="text-small text-stone">{label}</div>}
        <div className="text-body" style={{ fontWeight: 600 }}>
          {t('common.insufficientData')}
        </div>
        <div className="text-micro text-stone">{t('common.insufficientDataLong')}</div>
      </div>
    );
  }

  return (
    <div>
      {label && <div className="text-small text-stone">{label}</div>}
      <div
        className="mono"
        style={{ fontSize: large ? 24 : 'var(--t-data-size)', color: 'var(--ink)' }}
      >
        {formatted}
      </div>
      <div className="text-micro text-stone">{t('common.basedOn', { count: sampleSize })}</div>
    </div>
  );
}
