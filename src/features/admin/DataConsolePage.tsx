import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/AdminShell';
import { Button } from '@/components/Button';
import { LoadingBlock, ErrorNote } from '@/components/EmptyState';
import {
  getDataConfidenceByUniversity,
  getCommunityHealth,
  updateCommission,
} from '@/lib/api/dataconsole';
import { formatAUD } from '@/lib/format';
import type { Confidence, DataConfidenceRow } from '@/types/domain';

/*
 * /admin/data — the Data Console (docs/05 §/admin/data).
 *
 * Three surfaces: (1) community health, where the 7-day answer rate is the North
 * Star (docs/00) and gets the loudest tile; (2) data confidence by university,
 * with a callout for the 'none'/'low' universities the shortlist shows
 * "Insufficient data" for; (3) the commission ledger editor, which publishes
 * straight to the public /commissions ledger.
 *
 * Tokens only. --blaze means "unanswered" and nothing else, so it never appears
 * here — confidence and health read in --ink / --stone, not alarm colors.
 */

// Highest confidence first; ties keep API (name) order via a stable sort.
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1, none: 0 };

export function DataConsolePage() {
  const { t } = useTranslation();

  const health = useQuery({
    queryKey: ['data-health'],
    queryFn: getCommunityHealth,
  });

  const confidence = useQuery({
    queryKey: ['data-confidence'],
    queryFn: getDataConfidenceByUniversity,
  });

  const rows = confidence.data ?? [];

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence]),
    [rows],
  );

  const lowConfidence = useMemo(
    () => rows.filter((r) => r.confidence === 'none' || r.confidence === 'low'),
    [rows],
  );

  return (
    <AdminShell>
      <h1 className="text-h1">{t('admin.dataTitle')}</h1>

      {/* ---- Community health ---------------------------------------------- */}
      <section className="mt-s5">
        <h2 className="text-h2">{t('admin.dataHealth')}</h2>

        {health.isLoading ? (
          <div className="mt-s3">
            <LoadingBlock height={120} />
          </div>
        ) : health.isError || !health.data ? (
          <div className="mt-s3">
            <ErrorNote message={t('error.generic')} />
          </div>
        ) : (
          <div className="mt-s3 grid grid-cols-1 gap-s3 sm:grid-cols-3">
            {/* North Star — the loudest tile: filled --ink, full width on mobile. */}
            <StatTile
              label={t('admin.dataAnswerRate')}
              value={`${Math.round(health.data.answer_rate_7d * 100)}%`}
              prominent
              className="sm:col-span-3"
            />
            <StatTile
              label={t('admin.dataBacklog')}
              value={String(health.data.unanswered_backlog)}
            />
            <StatTile
              label={t('admin.dataTimeToAnswer')}
              value={
                health.data.median_time_to_first_verified_hours === null
                  ? '—'
                  : t('admin.dataHours', {
                      hours: health.data.median_time_to_first_verified_hours,
                    })
              }
              className="sm:col-span-2"
            />
          </div>
        )}
      </section>

      {/* ---- Data confidence by university --------------------------------- */}
      <section className="mt-s6">
        <h2 className="text-h2">{t('admin.dataConfidence')}</h2>

        {confidence.isLoading ? (
          <div className="mt-s3">
            <LoadingBlock height={200} />
          </div>
        ) : confidence.isError ? (
          <div className="mt-s3">
            <ErrorNote message={t('error.generic')} />
          </div>
        ) : (
          <>
            <div className="mt-s3 overflow-x-auto rounded-md border border-rule bg-surface">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-rule text-left text-stone">
                    <th className="px-s3 py-s2 font-body font-normal">
                      {t('commissions.university')}
                    </th>
                    <th className="px-s3 py-s2 font-body font-normal">
                      {t('admin.dataConfidence')}
                    </th>
                    {/* Cells are self-describing ("22 data points"); no
                        dedicated header key exists and we never invent i18n. */}
                    <th className="px-s3 py-s2" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.university_id} className="border-b border-rule last:border-0">
                      <td className="px-s3 py-s3 text-ink">{row.name}</td>
                      <td className="px-s3 py-s3 text-ink-soft">
                        {t('admin.conf_' + row.confidence)}
                      </td>
                      <td className="whitespace-nowrap px-s3 py-s3 text-right font-data text-ink-soft">
                        {t('admin.dataPoints', { count: row.data_points })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Low-confidence callout — the shortlist shows "Insufficient data"
                for these. --stone/--ink only, never --blaze. */}
            {lowConfidence.length > 0 && (
              <div className="mt-s4 rounded-md border border-rule bg-sunk p-s4">
                <p className="text-small text-ink">{t('admin.dataLowConfidence')}</p>
                <ul className="mt-s2 flex flex-col gap-s1 text-small text-stone">
                  {lowConfidence.map((row) => (
                    <li key={row.university_id}>
                      {row.name} · {t('admin.dataPoints', { count: row.data_points })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---- Commission ledger editor ------------------------------------- */}
      <section className="mt-s6">
        <h2 className="text-h2">{t('admin.dataLedger')}</h2>
        <LedgerEditor rows={rows} disabled={confidence.isLoading || confidence.isError} />
      </section>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// A single health stat tile. The North Star tile (`prominent`) is filled --ink.
// ---------------------------------------------------------------------------
function StatTile({
  label,
  value,
  prominent = false,
  className = '',
}: {
  label: string;
  value: string;
  prominent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md p-s4 ${
        prominent ? 'bg-ink text-paper' : 'border border-rule bg-surface'
      } ${className}`}
    >
      <p className={`text-small ${prominent ? 'text-paper' : 'text-stone'}`}>{label}</p>
      <p
        className={`mt-s2 font-data ${prominent ? 'text-paper' : 'text-ink'}`}
        style={{ fontSize: prominent ? 'var(--t-display-size)' : 'var(--t-h1-size)' }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commission ledger editor — publishes straight to the public /commissions
// ledger via updateCommission. Invalidates the confidence query on success.
// ---------------------------------------------------------------------------
function LedgerEditor({ rows, disabled }: { rows: DataConfidenceRow[]; disabled: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [universityId, setUniversityId] = useState('');
  const [amount, setAmount] = useState('');
  const [rebate, setRebate] = useState('');
  const [note, setNote] = useState('');
  const [published, setPublished] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      updateCommission(
        universityId,
        Number(amount),
        rebate.trim() === '' ? null : Number(rebate),
        note.trim(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-confidence'] });
      setPublished(true);
    },
  });

  const amountValid = amount.trim() !== '' && Number.isFinite(Number(amount)) && Number(amount) >= 0;
  const rebateValid =
    rebate.trim() === '' || (Number.isFinite(Number(rebate)) && Number(rebate) >= 0);
  const canPublish =
    !disabled && universityId !== '' && amountValid && rebateValid && !mutation.isPending;

  const previewAud = amountValid ? formatAUD(Number(amount)) : null;

  function onPublish(e: React.FormEvent) {
    e.preventDefault();
    if (!canPublish) return;
    mutation.mutate();
  }

  return (
    <form className="mt-s3 rounded-md border border-rule bg-surface p-s4" onSubmit={onPublish}>
      <div className="flex flex-col gap-s4">
        {/* University picker */}
        <div className="flex flex-col gap-s2">
          <label htmlFor="ledger-university" className="text-small text-ink-soft">
            {t('commissions.university')}
          </label>
          <select
            id="ledger-university"
            value={universityId}
            onChange={(e) => {
              setUniversityId(e.target.value);
              setPublished(false);
            }}
            disabled={disabled}
            className="min-h-[44px] rounded-md border border-rule bg-sunk px-s3 text-body text-ink"
          >
            <option value="">—</option>
            {rows.map((row) => (
              <option key={row.university_id} value={row.university_id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>

        {/* Amount + rebate */}
        <div className="grid grid-cols-1 gap-s4 sm:grid-cols-2">
          <div className="flex flex-col gap-s2">
            <label htmlFor="ledger-amount" className="text-small text-ink-soft">
              {t('admin.dataAmount')}
            </label>
            <input
              id="ledger-amount"
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setPublished(false);
              }}
              className="min-h-[44px] rounded-md border border-rule bg-sunk px-s3 font-data text-data text-ink"
            />
            {previewAud && <p className="font-data text-micro text-stone">{previewAud}</p>}
          </div>

          <div className="flex flex-col gap-s2">
            <label htmlFor="ledger-rebate" className="text-small text-ink-soft">
              {t('admin.dataRebate')}
            </label>
            <input
              id="ledger-rebate"
              type="number"
              inputMode="numeric"
              min={0}
              value={rebate}
              onChange={(e) => {
                setRebate(e.target.value);
                setPublished(false);
              }}
              className="min-h-[44px] rounded-md border border-rule bg-sunk px-s3 font-data text-data text-ink"
            />
          </div>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-s2">
          <label htmlFor="ledger-note" className="text-small text-ink-soft">
            {t('commissions.note')}
          </label>
          <input
            id="ledger-note"
            type="text"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setPublished(false);
            }}
            className="min-h-[44px] rounded-md border border-rule bg-sunk px-s3 text-body text-ink"
          />
        </div>

        <p className="text-micro text-stone">{t('commissions.intro')}</p>

        {mutation.isError && <ErrorNote message={t('error.generic')} />}

        {published && (
          <div
            className="rounded-md border border-rule bg-sunk p-s3 text-small text-ink-soft"
            role="status"
          >
            {t('compose.published')}
          </div>
        )}

        <div>
          <Button type="submit" variant="primary" className="min-h-[44px]" disabled={!canPublish}>
            {t('admin.dataPublish')}
          </Button>
        </div>
      </div>
    </form>
  );
}
