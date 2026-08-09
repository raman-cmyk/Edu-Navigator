import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PublicHeader } from '@/components/PublicHeader';
import { TrailBar } from '@/components/TrailBar';
import { Button } from '@/components/Button';
import { ErrorNote } from '@/components/EmptyState';
import { submitShortlist } from '@/lib/api/shortlist';
import { FIELDS } from '@/types/domain';
import type {
  ShortlistInput,
  Qualification,
  GapReason,
  EnglishTest,
  Priority,
  Field,
} from '@/types/domain';

/*
 * Seven steps, one question per screen. Trail Bar as progress. Back always
 * available. State saved to localStorage under `shortlist_draft` — the user can
 * close and return. No email, no phone, no account: any signup gate here kills
 * the funnel. See docs/05 §/shortlist.
 */

const DRAFT_KEY = 'shortlist_draft';
const TOTAL = 7;

type Draft = Partial<ShortlistInput> & { gpaScale?: '4' | '100' };

function loadDraft(): Draft {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function ShortlistPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return Boolean(draft.qualification && draft.score_pct != null && draft.board);
      case 1:
        // Backlogs default to 0 (a valid answer) — don't force a keystroke.
        return true;
      case 2: {
        // Gaps default to 0; a reason is only required once gaps > 0.
        const gaps = draft.gap_years ?? 0;
        return gaps === 0 || Boolean(draft.gap_reason);
      }
      case 3:
        return draft.english_test !== undefined; // null (not taken) is a valid choice
      case 4:
        // Budget has a sensible default (35 lakh); collateral defaults to "no".
        return true;
      case 5:
        return Boolean(draft.field);
      case 6:
        return Boolean(draft.priority);
      default:
        return false;
    }
  }

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      const input: ShortlistInput = {
        qualification: draft.qualification!,
        score_pct: draft.score_pct!,
        board: draft.board!,
        backlogs: draft.backlogs ?? 0,
        gap_years: draft.gap_years ?? 0,
        gap_reason: draft.gap_reason,
        english_test: draft.english_test ?? null,
        english_overall: draft.english_overall,
        english_min_band: draft.english_min_band,
        budget_npr: draft.budget_npr ?? 3_500_000, // 35 lakh — the slider default
        has_collateral: draft.has_collateral ?? false,
        field: draft.field!,
        priority: draft.priority!,
      };
      const slug = await submitShortlist(input);
      navigate(`/s/${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
      setSubmitting(false);
    }
  }

  function next() {
    if (step < TOTAL - 1) setStep((s) => s + 1);
    else finish();
  }

  return (
    <div className="min-h-full bg-paper">
      <PublicHeader />
      <main className="mx-auto max-w-content px-s4 pb-s8 pt-s5">
        <TrailBar total={TOTAL} current={step} segmentHeight={6} className="mb-s2" />
        <p className="text-micro text-stone">{t('shortlist.step', { current: step + 1, total: TOTAL })}</p>

        <div className="mt-s5 min-h-[280px]">
          {step === 0 && <StepQualification draft={draft} patch={patch} />}
          {step === 1 && <StepBacklogs draft={draft} patch={patch} />}
          {step === 2 && <StepGaps draft={draft} patch={patch} />}
          {step === 3 && <StepEnglish draft={draft} patch={patch} />}
          {step === 4 && <StepBudget draft={draft} patch={patch} />}
          {step === 5 && <StepField draft={draft} patch={patch} />}
          {step === 6 && <StepPriority draft={draft} patch={patch} />}
        </div>

        {submitting && <p className="text-body text-ink-soft">{t('shortlist.checking')}</p>}
        {error && <div className="mt-s3"><ErrorNote message={error} /></div>}

        <div className="mt-s5 flex items-center justify-between gap-s3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          >
            ← {t('common.back')}
          </Button>
          <Button variant="primary" onClick={next} disabled={!canAdvance() || submitting}>
            {step === TOTAL - 1 ? t('shortlist.seeResults') : t('common.next')} →
          </Button>
        </div>
      </main>
    </div>
  );
}

// ---- Shared field helpers ----
interface StepProps {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-h1">{children}</h1>;
}
function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-s2 text-small text-stone">{children}</p>;
}
function fieldClass() {
  return 'w-full rounded-md border border-rule bg-sunk px-s3 py-s2 text-body';
}

function OptionRow<T extends string>({
  value,
  selected,
  onSelect,
  children,
}: {
  value: T;
  selected: boolean;
  onSelect: (v: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className="w-full rounded-md border px-s4 py-s3 text-left text-body"
      style={{
        borderColor: selected ? 'var(--ink)' : 'var(--rule)',
        background: selected ? 'var(--ink)' : 'var(--surface)',
        color: selected ? 'var(--paper)' : 'var(--ink)',
        borderWidth: selected ? 2 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ---- Steps ----
function StepQualification({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const quals: { v: Qualification; label: string }[] = [
    { v: 'see', label: t('shortlist.qualSee') },
    { v: 'plus2', label: t('shortlist.qualPlus2') },
    { v: 'bachelors', label: t('shortlist.qualBachelors') },
    { v: 'masters', label: t('shortlist.qualMasters') },
  ];
  return (
    <div>
      <StepTitle>{t('shortlist.q1Title')}</StepTitle>
      <div className="mt-s4 grid grid-cols-2 gap-s2">
        {quals.map((q) => (
          <OptionRow key={q.v} value={q.v} selected={draft.qualification === q.v} onSelect={(v) => patch({ qualification: v })}>
            {q.label}
          </OptionRow>
        ))}
      </div>
      <label className="mt-s5 block text-small text-ink-soft">{t('shortlist.q1Score')}</label>
      <input
        className={fieldClass() + ' mt-s2'}
        inputMode="decimal"
        placeholder="e.g. 68 or 3.2"
        value={draft.score_pct != null ? String(draft.score_pct) : ''}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (Number.isNaN(raw)) return patch({ score_pct: undefined });
          // Auto-detect scale: <= 4 treated as GPA (×25), else percentage.
          patch({ score_pct: raw <= 4 ? Math.round(raw * 25) : raw, gpaScale: raw <= 4 ? '4' : '100' });
        }}
      />
      <label className="mt-s4 block text-small text-ink-soft">{t('shortlist.q1Board')}</label>
      <input
        className={fieldClass() + ' mt-s2'}
        placeholder={t('shortlist.q1BoardPlaceholder')}
        value={draft.board ?? ''}
        onChange={(e) => patch({ board: e.target.value })}
      />
    </div>
  );
}

function StepBacklogs({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  return (
    <div>
      <StepTitle>{t('shortlist.q2Title')}</StepTitle>
      <Helper>{t('shortlist.q2Helper')}</Helper>
      <input
        className={fieldClass() + ' mt-s4'}
        type="number"
        min={0}
        max={20}
        value={draft.backlogs ?? 0}
        onChange={(e) => patch({ backlogs: Math.max(0, Math.min(20, Number(e.target.value))) })}
      />
    </div>
  );
}

function StepGaps({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const reasons: { v: GapReason; label: string }[] = [
    { v: 'worked', label: t('shortlist.reasonWorked') },
    { v: 'studied', label: t('shortlist.reasonStudied') },
    { v: 'family', label: t('shortlist.reasonFamily') },
    { v: 'health', label: t('shortlist.reasonHealth') },
    { v: 'reattempt', label: t('shortlist.reasonReattempt') },
    { v: 'other', label: t('shortlist.reasonOther') },
  ];
  return (
    <div>
      <StepTitle>{t('shortlist.q3Title')}</StepTitle>
      <Helper>{t('shortlist.q3Helper')}</Helper>
      <input
        className={fieldClass() + ' mt-s4'}
        type="number"
        min={0}
        max={20}
        value={draft.gap_years ?? 0}
        onChange={(e) => patch({ gap_years: Math.max(0, Number(e.target.value)) })}
      />
      {(draft.gap_years ?? 0) > 0 && (
        <>
          <label className="mt-s4 block text-small text-ink-soft">{t('shortlist.q3Reason')}</label>
          <div className="mt-s2 grid grid-cols-2 gap-s2">
            {reasons.map((r) => (
              <OptionRow key={r.v} value={r.v} selected={draft.gap_reason === r.v} onSelect={(v) => patch({ gap_reason: v })}>
                {r.label}
              </OptionRow>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StepEnglish({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const tests: { v: EnglishTest; label: string }[] = [
    { v: 'ielts', label: 'IELTS' },
    { v: 'pte', label: 'PTE' },
    { v: 'duolingo', label: 'Duolingo' },
    { v: 'toefl', label: 'TOEFL' },
  ];
  const notTaken = draft.english_test === null;
  return (
    <div>
      <StepTitle>{t('shortlist.q4Title')}</StepTitle>
      <div className="mt-s4 grid grid-cols-2 gap-s2">
        {tests.map((tst) => (
          <OptionRow key={tst.v} value={tst.v} selected={draft.english_test === tst.v} onSelect={(v) => patch({ english_test: v })}>
            {tst.label}
          </OptionRow>
        ))}
        <button
          type="button"
          onClick={() => patch({ english_test: null, english_overall: undefined, english_min_band: undefined })}
          aria-pressed={notTaken}
          className="col-span-2 w-full rounded-md border px-s4 py-s3 text-left text-body"
          style={{
            borderColor: notTaken ? 'var(--ink)' : 'var(--rule)',
            background: notTaken ? 'var(--ink)' : 'var(--surface)',
            color: notTaken ? 'var(--paper)' : 'var(--ink)',
            borderWidth: notTaken ? 2 : 1,
          }}
        >
          {t('shortlist.q4NotTaken')}
        </button>
      </div>
      {notTaken && <Helper>{t('shortlist.q4NotTakenHelper')}</Helper>}
      {draft.english_test && (
        <div className="mt-s4 grid grid-cols-2 gap-s3">
          <div>
            <label className="block text-small text-ink-soft">{t('shortlist.q4Overall')}</label>
            <input
              className={fieldClass() + ' mt-s2'}
              inputMode="decimal"
              value={draft.english_overall ?? ''}
              onChange={(e) => patch({ english_overall: parseFloat(e.target.value) || undefined })}
            />
          </div>
          <div>
            <label className="block text-small text-ink-soft">{t('shortlist.q4MinBand')}</label>
            <input
              className={fieldClass() + ' mt-s2'}
              inputMode="decimal"
              value={draft.english_min_band ?? ''}
              onChange={(e) => patch({ english_min_band: parseFloat(e.target.value) || undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepBudget({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const lakh = draft.budget_npr != null ? Math.round(draft.budget_npr / 100000) : 35;
  return (
    <div>
      <StepTitle>{t('shortlist.q5Title')}</StepTitle>
      <Helper>{t('shortlist.q5Helper')}</Helper>
      <div className="mt-s4 flex items-center gap-s3">
        <input
          type="range"
          min={5}
          max={120}
          value={lakh}
          onChange={(e) => patch({ budget_npr: Number(e.target.value) * 100000 })}
          className="flex-1"
          aria-label={t('shortlist.q5Lakh')}
        />
        <div className="flex items-center gap-s2">
          <input
            className={fieldClass()}
            style={{ width: 90 }}
            type="number"
            min={5}
            value={lakh}
            onChange={(e) => patch({ budget_npr: Number(e.target.value) * 100000 })}
          />
          <span className="text-small text-stone">{t('shortlist.q5Lakh')}</span>
        </div>
      </div>
      <div className="mt-s5">
        <span className="block text-small text-ink-soft">{t('shortlist.q5Collateral')}</span>
        <div className="mt-s2 flex gap-s2">
          <OptionRow value="yes" selected={draft.has_collateral === true} onSelect={() => patch({ has_collateral: true })}>
            {t('shortlist.yes')}
          </OptionRow>
          <OptionRow value="no" selected={draft.has_collateral === false} onSelect={() => patch({ has_collateral: false })}>
            {t('shortlist.no')}
          </OptionRow>
        </div>
      </div>
    </div>
  );
}

function StepField({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const labels: Record<Field, string> = {
    it: 'IT',
    nursing: 'Nursing',
    business: 'Business',
    engineering: 'Engineering',
    cookery: 'Cookery',
    aged_care: 'Aged Care',
    accounting: 'Accounting',
    public_health: 'Public Health',
    data: 'Data',
    construction: 'Construction',
    other: 'Other',
  };
  return (
    <div>
      <StepTitle>{t('shortlist.q6Title')}</StepTitle>
      <div className="mt-s4 grid grid-cols-2 gap-s2">
        {FIELDS.map((f) => (
          <OptionRow key={f} value={f} selected={draft.field === f} onSelect={(v) => patch({ field: v as Field })}>
            {labels[f]}
          </OptionRow>
        ))}
      </div>
    </div>
  );
}

function StepPriority({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const opts: { v: Priority; label: string }[] = [
    { v: 'cheapest', label: t('shortlist.priorityCheapest') },
    { v: 'pr', label: t('shortlist.priorityPr') },
    { v: 'ranking', label: t('shortlist.priorityRanking') },
    { v: 'fastest', label: t('shortlist.priorityFastest') },
  ];
  return (
    <div>
      <StepTitle>{t('shortlist.q7Title')}</StepTitle>
      <div className="mt-s4 flex flex-col gap-s2">
        {opts.map((o) => (
          <OptionRow key={o.v} value={o.v} selected={draft.priority === o.v} onSelect={(v) => patch({ priority: v })}>
            {o.label}
          </OptionRow>
        ))}
      </div>
    </div>
  );
}
