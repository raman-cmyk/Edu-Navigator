import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/AdminShell';
import { Button } from '@/components/Button';
import { EmptyState, LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listFriction, addFriction, weeklyRollup } from '@/lib/api/friction';
import { relativeTime } from '@/lib/format';
import type { FrictionRollupRow, FrictionTaskType } from '@/types/domain';

/*
 * /admin/friction — the friction log (docs/05 §/admin/friction, docs C3).
 *
 * "The most valuable admin screen." Ops logs every manual task; the WEEKLY
 * ROLLUP by task type is the whole point — the tallest bar picks V2. So the
 * rollup renders first, before the log form, before the history.
 *
 * The rollup is a plain horizontal bar chart: --ink fill on a --sunk track.
 * Not --blaze — blaze means "unanswered", nothing else (docs/04). The top row
 * is already the winner (the api sorts total_minutes desc); it needs no accent
 * beyond being longest and first.
 */

// All FrictionTaskType values, in the order they're offered in the select.
// Labels come from admin.task_<type> (keys already exist in en.json/ne.json).
const TASK_TYPES: FrictionTaskType[] = [
  'sop',
  'document_chase',
  'noc_run',
  'translation',
  'visa_prep',
  'uni_application',
  'other',
];

export function FrictionLogPage() {
  const { t, i18n } = useTranslation();
  const lang: 'ne' | 'en' = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const { profile } = useAuth();
  const qc = useQueryClient();

  const rollup = useQuery({
    queryKey: ['friction-rollup'],
    queryFn: () => weeklyRollup(),
  });
  const list = useQuery({
    queryKey: ['friction-list'],
    queryFn: listFriction,
  });

  // ---- Log-a-task form state ----
  const [taskType, setTaskType] = useState<FrictionTaskType>('sop');
  const [studentRef, setStudentRef] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      addFriction(
        {
          task_type: taskType,
          student_ref: studentRef.trim(),
          minutes: Number(minutes),
          note: note.trim(),
        },
        profile!,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friction-rollup'] });
      qc.invalidateQueries({ queryKey: ['friction-list'] });
      setStudentRef('');
      setMinutes('');
      setNote('');
      setTaskType('sop');
    },
  });

  const minutesNum = Number(minutes);
  const canSave =
    Boolean(profile) &&
    studentRef.trim().length > 0 &&
    Number.isFinite(minutesNum) &&
    minutesNum > 0 &&
    !mutation.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    mutation.mutate();
  }

  const fieldClass =
    'mt-s1 min-h-[44px] w-full rounded-md border border-rule bg-surface p-s3 text-body text-ink';

  return (
    <AdminShell>
      <h1 className="text-h1">{t('admin.frictionTitle')}</h1>
      <p className="mt-s2 text-small text-stone">{t('admin.frictionSubtitle')}</p>

      {/* -- Weekly rollup: the point of the screen, so it comes first -- */}
      <section className="mt-s5">
        <h2 className="text-h2">{t('admin.frictionRollup')}</h2>
        <div className="mt-s3">
          {rollup.isLoading ? (
            <LoadingBlock height={180} />
          ) : rollup.isError ? (
            <ErrorNote message={t('error.generic')} />
          ) : rollup.data && rollup.data.length > 0 ? (
            <RollupChart rows={rollup.data} />
          ) : (
            <EmptyState message={t('admin.empty')} />
          )}
        </div>
      </section>

      {/* -- Log a task -- */}
      <section className="mt-s6">
        <h2 className="text-h2">{t('admin.frictionAdd')}</h2>
        <form className="mt-s3 flex flex-col gap-s4" onSubmit={submit}>
          <div>
            <label className="text-small text-ink-soft" htmlFor="friction-task">
              {t('admin.frictionTaskType')}
            </label>
            <select
              id="friction-task"
              className={fieldClass}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as FrictionTaskType)}
            >
              {TASK_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {t('admin.task_' + tt)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-small text-ink-soft" htmlFor="friction-student">
              {t('admin.frictionStudent')}
            </label>
            <input
              id="friction-student"
              type="text"
              className={fieldClass}
              value={studentRef}
              onChange={(e) => setStudentRef(e.target.value)}
            />
          </div>

          <div>
            <label className="text-small text-ink-soft" htmlFor="friction-minutes">
              {t('admin.frictionMinutesLabel')}
            </label>
            <input
              id="friction-minutes"
              type="number"
              min={1}
              inputMode="numeric"
              className={`${fieldClass} font-data`}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>

          <div>
            <label className="text-small text-ink-soft" htmlFor="friction-note">
              {t('admin.frictionNote')}
            </label>
            <textarea
              id="friction-note"
              rows={2}
              className={fieldClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {mutation.isError && <ErrorNote message={t('error.generic')} />}

          <div>
            <Button
              type="submit"
              variant="primary"
              className="min-h-[44px]"
              disabled={!canSave}
            >
              {t('admin.frictionSave')}
            </Button>
          </div>
        </form>
      </section>

      {/* -- Recent entries, newest first -- */}
      <section className="mt-s6">
        <h2 className="text-h2">{t('admin.frictionRecent')}</h2>
        <div className="mt-s3 flex flex-col gap-s3">
          {list.isLoading ? (
            <>
              <LoadingBlock height={64} />
              <LoadingBlock height={64} />
            </>
          ) : list.isError ? (
            <ErrorNote message={t('error.generic')} />
          ) : list.data && list.data.length > 0 ? (
            list.data.map((e) => (
              <article
                key={e.id}
                className="rounded-md border border-rule bg-surface p-s3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-s2">
                  <span className="text-body text-ink">{t('admin.task_' + e.task_type)}</span>
                  <span className="font-data text-small text-ink-soft">
                    {t('admin.frictionMinutes', { minutes: e.minutes })}
                  </span>
                </div>
                <p className="mt-s1 text-small text-stone">
                  <span className="font-data">{e.student_ref}</span>
                  {e.note ? ` · ${e.note}` : ''}
                </p>
                <p className="mt-s1 text-micro text-stone">
                  {relativeTime(e.logged_at, lang)}
                </p>
              </article>
            ))
          ) : (
            <EmptyState message={t('admin.empty')} />
          )}
        </div>
      </section>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart. Rows arrive sorted total_minutes desc, so the first
// row is the longest bar and the winner. Bars are width-constrained to their
// track, so nothing overflows the viewport at 360px.
// ---------------------------------------------------------------------------
function RollupChart({ rows }: { rows: FrictionRollupRow[] }) {
  const { t } = useTranslation();
  const maxMinutes = Math.max(...rows.map((r) => r.total_minutes), 1);

  return (
    <ol className="flex flex-col gap-s3">
      {rows.map((r) => {
        const pct = Math.max(4, Math.round((r.total_minutes / maxMinutes) * 100));
        return (
          <li key={r.task_type}>
            <div className="flex flex-wrap items-baseline justify-between gap-s2">
              <span className="text-small text-ink">{t('admin.task_' + r.task_type)}</span>
              <span className="font-data text-small text-ink-soft">
                {t('admin.frictionMinutes', { minutes: r.total_minutes })}
                {' · '}
                {t('admin.frictionEntries', { count: r.entries })}
              </span>
            </div>
            {/* Track (--sunk) with an --ink fill. Not --blaze. */}
            <div
              className="mt-s1 h-s3 w-full overflow-hidden rounded-sm"
              style={{ background: 'var(--sunk)' }}
              role="img"
              aria-label={
                t('admin.task_' + r.task_type) +
                ': ' +
                t('admin.frictionMinutes', { minutes: r.total_minutes })
              }
            >
              <div
                className="h-full rounded-sm"
                style={{ width: `${pct}%`, background: 'var(--ink)' }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
