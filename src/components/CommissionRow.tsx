import { useTranslation } from 'react-i18next';
import { formatAUD, formatNPR } from '@/lib/format';

/*
 * Always visible on every university card. Never collapsed, never behind a
 * tooltip, never in small grey text. The whole thesis is that this number is
 * stated plainly. Set in mono, --ink, normal weight. See docs/04.
 */

export interface CommissionRowProps {
  commissionAud: number;
  commissionNpr: number;
  rebatePct?: number | null;
}

export function CommissionRow({ commissionAud, commissionNpr, rebatePct }: CommissionRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-s1 border-t border-rule pt-s3">
      <span className="text-small text-ink-soft">{t('result.commissionLabel')}</span>
      <span className="mono text-data text-ink">
        {formatAUD(commissionAud)} · {formatNPR(commissionNpr)}
      </span>
      {rebatePct != null && rebatePct > 0 && (
        <span className="text-micro text-stone">
          {t('commissions.rebate')}: {rebatePct}%
        </span>
      )}
    </div>
  );
}
