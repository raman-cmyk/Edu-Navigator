import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PublicHeader } from '@/components/PublicHeader';
import { LoadingBlock } from '@/components/EmptyState';
import { getCommissionLedger } from '@/lib/api/commissions';
import { formatAUD } from '@/lib/format';

/*
 * The number consultancies hide. We publish it, anonymous-readable. This is the
 * transparency claim made verifiable. See docs/05 §/commissions.
 */
export function CommissionsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['ledger'], queryFn: getCommissionLedger });

  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pb-s8 pt-s5">
        <h1 className="text-h1">{t('commissions.title')}</h1>
        <p className="mt-s3 text-body text-ink-soft">{t('commissions.intro')}</p>

        <div className="mt-s5 overflow-x-auto">
          {isLoading ? (
            <LoadingBlock height={240} />
          ) : (
            <table className="w-full border-collapse text-small">
              <thead>
                <tr className="border-b border-rule text-left text-stone">
                  <th className="py-s2 pr-s3 font-body font-normal">{t('commissions.university')}</th>
                  <th className="py-s2 pr-s3 font-body font-normal">{t('commissions.commission')}</th>
                  <th className="py-s2 pr-s3 font-body font-normal">{t('commissions.rebate')}</th>
                  <th className="py-s2 pr-s3 font-body font-normal">{t('commissions.effective')}</th>
                  <th className="py-s2 font-body font-normal">{t('commissions.note')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((row) => (
                  <tr key={row.id} className="border-b border-rule align-top">
                    <td className="py-s2 pr-s3 text-ink">{row.university_name ?? row.university_id}</td>
                    <td className="py-s2 pr-s3 mono">{formatAUD(row.amount_aud)}</td>
                    <td className="py-s2 pr-s3 mono">{row.rebate_pct != null ? `${row.rebate_pct}%` : '—'}</td>
                    <td className="py-s2 pr-s3 text-stone">{row.effective_from}</td>
                    <td className="py-s2 text-stone">{row.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
