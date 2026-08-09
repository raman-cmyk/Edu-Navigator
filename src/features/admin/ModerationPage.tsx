import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/AdminShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState, LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  listModerationQueue,
  listActionLog,
  actOnTarget,
} from '@/lib/api/moderation';
import { relativeTime } from '@/lib/format';
import type { ModerationQueueItem, ModAction } from '@/types/domain';

/*
 * /admin/moderate — the moderation queue (docs/05 §/admin/moderate).
 *
 * Two rules, nothing else (docs/07 §4): an agent posing as a student gets a
 * permanent label; guaranteeing an outcome gets removed. Everything else —
 * anger, criticism, failure stories, negative reviews — stays up. The AI never
 * auto-labels an agent; a human decides here (trust rule 4).
 *
 * Removal is never a hard delete. Every action writes an append-only
 * moderation_actions row with a reason, and that audit trail IS the record
 * (trust rule 5: never delete an honest negative without a logged reason). So a
 * reason is required before any action can be recorded — except a plain dismiss,
 * which leaves the item untouched.
 *
 * --blaze appears only to flag a high-confidence auto-removal candidate (a
 * high-confidence outcome-guarantee AI flag). Nowhere else (docs/04: blaze =
 * a problem, nothing else).
 */

// The four actions offered, in order, with their i18n label + ModAction value.
const ACTIONS: { key: string; action: ModAction }[] = [
  { key: 'admin.modActionRemove', action: 'removed' },
  { key: 'admin.modActionLabelAgent', action: 'labeled_agent' },
  { key: 'admin.modActionWarn', action: 'warned' },
  { key: 'admin.modActionDismiss', action: 'none' },
];

export function ModerationPage() {
  const { t, i18n } = useTranslation();
  const lang: 'ne' | 'en' = i18n.language.startsWith('ne') ? 'ne' : 'en';

  const queue = useQuery({
    queryKey: ['mod-queue'],
    queryFn: listModerationQueue,
  });
  const log = useQuery({
    queryKey: ['mod-log'],
    queryFn: listActionLog,
  });

  const aiFlagged = (queue.data ?? []).filter((i) => i.source === 'ai_flagged');
  const reported = (queue.data ?? []).filter((i) => i.source === 'reported');

  return (
    <AdminShell>
      <h1 className="text-h1">{t('admin.modTitle')}</h1>
      <p className="mt-s2 text-small text-stone">{t('admin.modSubtitle')}</p>

      <div className="mt-s4 flex flex-col gap-s4">
        {queue.isLoading ? (
          <>
            <LoadingBlock height={180} />
            <LoadingBlock height={180} />
          </>
        ) : queue.isError ? (
          <ErrorNote message={t('error.generic')} />
        ) : (queue.data ?? []).length === 0 ? (
          <EmptyState message={t('admin.modEmpty')} />
        ) : (
          <>
            {aiFlagged.length > 0 && (
              <Section title={t('admin.modAiFlagged')}>
                {aiFlagged.map((item) => (
                  <QueueCard key={item.id} item={item} lang={lang} />
                ))}
              </Section>
            )}
            {reported.length > 0 && (
              <Section title={t('admin.modReported')}>
                {reported.map((item) => (
                  <QueueCard key={item.id} item={item} lang={lang} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {/* Append-only, immutable audit trail — the record of record. */}
      <section className="mt-s8">
        <h2 className="text-h2">{t('admin.modActionLog')}</h2>
        <div className="mt-s3 flex flex-col gap-s2">
          {log.isLoading ? (
            <LoadingBlock height={120} />
          ) : log.isError ? (
            <ErrorNote message={t('error.generic')} />
          ) : (log.data ?? []).length === 0 ? (
            <p className="text-small text-stone">{t('admin.modEmpty')}</p>
          ) : (
            (log.data ?? []).map((row) => (
              <div
                key={row.id}
                className="rounded-md border border-rule bg-surface p-s3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-s2">
                  <span className="text-small text-ink" style={{ fontWeight: 600 }}>
                    {t('admin.action_' + row.action)}
                  </span>
                  <span className="text-micro text-stone">
                    {relativeTime(row.created_at, lang)}
                  </span>
                </div>
                <p className="mt-s1 text-micro text-stone">
                  {row.target_type} · {row.target_id}
                </p>
                {row.reason && (
                  <p className="mt-s1 text-small text-ink-soft">{row.reason}</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-h2">{title}</h2>
      <div className="mt-s3 flex flex-col gap-s4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One queue item + its action controls.
// ---------------------------------------------------------------------------
function QueueCard({ item, lang }: { item: ModerationQueueItem; lang: 'ne' | 'en' }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const moderatorId = profile?.id ?? 'admin';

  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<ModAction | null>(null);

  const mutation = useMutation({
    mutationFn: (v: { action: ModAction; reason: string }) =>
      actOnTarget(item, v.action, v.reason, moderatorId),
    onSuccess: () => {
      // Invalidate BOTH: the item leaves the queue and a new audit row lands.
      qc.invalidateQueries({ queryKey: ['mod-queue'] });
      qc.invalidateQueries({ queryKey: ['mod-log'] });
    },
  });

  // A dismiss ('none') leaves the item up and may carry no reason; every other
  // action writes to the permanent audit trail and REQUIRES a reason.
  const reasonRequired = selected !== null && selected !== 'none';
  const canConfirm =
    selected !== null &&
    !mutation.isPending &&
    (!reasonRequired || reason.trim().length > 0);

  // The one legitimate --blaze use here: a high-confidence outcome-guarantee AI
  // flag is an auto-removal candidate and should read as a problem.
  const isAutoRemoveCandidate =
    item.source === 'ai_flagged' &&
    item.reason === 'outcome_guarantee' &&
    item.ai_confidence === 'high';

  function confirm() {
    if (!canConfirm || selected === null) return;
    mutation.mutate({ action: selected, reason: reason.trim() });
  }

  return (
    <article className="rounded-md border border-rule bg-surface p-s4 shadow">
      {/* Author + reason + when */}
      <div className="flex flex-wrap items-start justify-between gap-s3">
        <Badge
          tier={item.author.tier}
          name={item.author.display_name}
          city={item.author.city}
          university={item.author.university}
          gradYear={item.author.grad_year}
        />
        <span className="text-micro text-stone">
          {relativeTime(item.created_at, lang)}
        </span>
      </div>

      <div className="mt-s2 flex flex-wrap items-center gap-s2">
        <span
          className="inline-flex items-center rounded-sm px-s2 py-s1 text-micro"
          style={{ background: 'var(--sunk)', color: 'var(--ink-soft)', fontWeight: 600 }}
        >
          {t('admin.reason_' + item.reason)}
        </span>
        {item.ai_confidence && (
          <span
            className="text-micro"
            style={{
              color: isAutoRemoveCandidate ? 'var(--blaze)' : 'var(--stone)',
              fontWeight: isAutoRemoveCandidate ? 600 : 400,
            }}
          >
            {t('admin.conf_' + item.ai_confidence)}
          </span>
        )}
      </div>

      {/* The offending content */}
      <p className="mt-s3 text-body text-ink">{item.excerpt}</p>

      {/* The specific flagged span, when the AI isolated one */}
      {item.quote && (
        <div
          className="mt-s3 rounded-sm bg-sunk p-s3"
          style={{
            borderLeft: `2px solid ${isAutoRemoveCandidate ? 'var(--blaze)' : 'var(--rule)'}`,
          }}
        >
          <p className="text-micro text-stone">{t('admin.modQuote')}</p>
          <p className="mt-s1 text-small text-ink" style={{ fontWeight: 600 }}>
            {item.quote}
          </p>
        </div>
      )}

      {mutation.isError && (
        <div className="mt-s3">
          <ErrorNote message={t('error.generic')} />
        </div>
      )}

      {/* Reason first — the audit trail is the record (trust rule 5). */}
      <div className="mt-s4 rounded-md border border-rule bg-sunk p-s3">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={t('admin.modReasonPlaceholder')}
          className="w-full rounded-md border border-rule bg-surface p-s3 text-body text-ink"
          aria-label={t('admin.modReasonPlaceholder')}
        />

        {/* Pick an action */}
        <div className="mt-s3 flex flex-wrap gap-s2">
          {ACTIONS.map(({ key, action }) => {
            const active = selected === action;
            return (
              <button
                key={action}
                type="button"
                disabled={mutation.isPending}
                onClick={() => setSelected(action)}
                className="min-h-[44px] rounded-sm border px-s3 py-s2 text-small"
                style={{
                  borderColor: active ? 'var(--ink)' : 'var(--rule)',
                  background: active ? 'var(--ink)' : 'var(--surface)',
                  color: active ? 'var(--paper)' : 'var(--ink-soft)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {t(key)}
              </button>
            );
          })}
        </div>

        <div className="mt-s3">
          <Button
            variant="primary"
            className="min-h-[44px]"
            disabled={!canConfirm}
            onClick={confirm}
          >
            {t('admin.modConfirm')}
          </Button>
        </div>
      </div>
    </article>
  );
}
