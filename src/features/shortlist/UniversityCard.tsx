import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UniversityResult, VisaBand, PrPathway } from '@/types/domain';
import { DataFigure } from '@/components/DataFigure';
import { CommissionRow } from '@/components/CommissionRow';
import { formatAUD, formatNPR } from '@/lib/format';

/*
 * The screenshot people send to their cousin. Every figure carries its sample
 * size. Commission is always visible. Verdict includes "don't apply" when true.
 * See docs/05 §/s/:slug.
 */

const VISA_LABEL: Record<VisaBand, string> = { High: 'High', Moderate: 'Moderate', Low: 'Low' };
const PR_LABEL: Record<PrPathway, string> = { Yes: 'Yes', Weak: 'Weak', No: 'No' };

export function UniversityCard({ r }: { r: UniversityResult }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-md border border-rule bg-surface p-s4 shadow">
      <div className="flex items-start justify-between gap-s3">
        <div>
          <h3 className="text-h2">{r.university_name}</h3>
          <p className="text-small text-stone">
            {r.is_regional ? t('result.regional') : t('result.metro')} · {r.city_name} · {r.course_name}
          </p>
        </div>
        <span className="mono text-data whitespace-nowrap" aria-label={`fit ${r.fit_score}`}>
          {t('result.fit', { score: r.fit_score })}
        </span>
      </div>
      <p className="mt-s2 text-small text-ink-soft">{r.fit_reason}</p>

      {/* Real total cost */}
      <div className="mt-s4">
        <DataFigure
          label={t('result.realCost')}
          formatted={r.cost.total_npr != null ? formatNPR(r.cost.total_npr) : null}
          confidence={r.cost.living_confidence}
          sampleSize={r.cost.living_sample_size}
          large
        />
        {r.cost.total_npr != null && (
          <button
            type="button"
            className="mt-s2 text-small text-ink-soft underline"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {t('result.costBreakdown')}
          </button>
        )}
        {open && r.cost.total_npr != null && (
          <dl className="mt-s2 grid grid-cols-2 gap-x-s4 gap-y-s1 text-small">
            <CostLine label={t('result.tuition')} aud={r.cost.tuition_aud} />
            <CostLine label={t('result.living')} aud={r.cost.living_aud} />
            <CostLine label={t('result.oshc')} aud={r.cost.oshc_aud} />
            <CostLine label={t('result.visaFee')} aud={r.cost.visa_aud} />
            <CostLine label={t('result.flights')} aud={r.cost.flights_aud} />
            <CostLine label={t('result.forex')} aud={r.cost.forex_loss_aud} />
          </dl>
        )}
      </div>

      {/* Visa / PR / community */}
      <div className="mt-s4 flex flex-col gap-s2 border-t border-rule pt-s3 text-small">
        <Row label={t('result.visaOdds')} value={VISA_LABEL[r.visa_band]} />
        {r.visa_reasons.map((reason, i) => (
          <p key={i} className="text-micro text-stone">— {reason}</p>
        ))}
        <Row label={t('result.prPathway')} value={`${PR_LABEL[r.pr_pathway]} — ${r.pr_reason}`} />
        {r.nepali_student_estimate != null && (
          <Row label={t('result.nepaliStudents')} value={`~${r.nepali_student_estimate}`} />
        )}
      </div>

      <div className="mt-s3">
        <CommissionRow
          commissionAud={r.commission_aud}
          commissionNpr={r.commission_npr}
          rebatePct={r.rebate_pct}
        />
      </div>

      <p className="mt-s3 border-t border-rule pt-s3 text-body text-ink-soft">{r.verdict}</p>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-s3">
      <span className="text-stone">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

function CostLine({ label, aud }: { label: string; aud: number }) {
  return (
    <>
      <dt className="text-stone">{label}</dt>
      <dd className="mono text-right">{formatAUD(aud)}</dd>
    </>
  );
}
