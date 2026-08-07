import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/AdminShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState, LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  listPendingVerifications,
  reviewVerification,
  slaHoursRemaining,
} from '@/lib/api/verification';
import { relativeTime } from '@/lib/format';
import type { AdminVerificationItem, DocKind, ReviewDecision } from '@/types/domain';

/*
 * /admin/verify — the verification queue (docs/05 §/admin/verify).
 *
 * Oldest first (the api already sorts SLA order). Every item shows a live 24h
 * SLA countdown; an overdue item is a bug, so the breach is the one legitimate
 * use of --blaze on this screen (docs/04: blaze = a problem, nothing else).
 *
 * Approve is one tap. Reject / Request more first reveal a reason area — the
 * reason is shown to the applicant, so it's required, never a dead end
 * (docs/05: "On rejection: exact reason, immediate resubmit").
 */

// doc_kind -> i18n key under verify.doc* (keys already exist in en.json/ne.json).
const DOC_KIND_KEY: Record<DocKind, string> = {
  offer_letter: 'verify.docOffer',
  visa_grant: 'verify.docVisa',
  coe: 'verify.docCoe',
  student_id: 'verify.docStudentId',
  degree: 'verify.docDegree',
  transcript: 'verify.docTranscript',
  address_proof: 'verify.docAddress',
};

// Quick reason templates that fill the textarea for reject / request-more.
const REASON_TEMPLATES = [
  'admin.reasonBlurry',
  'admin.reasonWrongDoc',
  'admin.reasonNameMismatch',
  'admin.reasonOverRedacted',
] as const;

export function VerificationQueuePage() {
  const { t, i18n } = useTranslation();
  const lang: 'ne' | 'en' = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const { profile } = useAuth();
  const reviewerId = profile?.id ?? 'admin';

  const [notice, setNotice] = useState<ReviewDecision | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-verify'],
    queryFn: listPendingVerifications,
  });

  const noticeKey: Record<ReviewDecision, string> = {
    approved: 'admin.reviewedApproved',
    rejected: 'admin.reviewedRejected',
    more_info: 'admin.reviewedMoreInfo',
  };

  return (
    <AdminShell>
      <h1 className="text-h1">{t('admin.title')}</h1>
      <p className="mt-s2 text-small text-stone">{t('admin.subtitle')}</p>

      {notice && (
        <div className="mt-s4">
          <div
            className="rounded-md border border-rule bg-surface p-s3 text-small text-ink-soft"
            role="status"
          >
            {t(noticeKey[notice])}
          </div>
        </div>
      )}

      <div className="mt-s4 flex flex-col gap-s4">
        {isLoading ? (
          <>
            <LoadingBlock height={220} />
            <LoadingBlock height={220} />
          </>
        ) : isError ? (
          <ErrorNote message={t('error.generic')} />
        ) : data && data.length > 0 ? (
          data.map((item) => (
            <QueueCard
              key={item.request.id}
              item={item}
              lang={lang}
              reviewerId={reviewerId}
              onReviewed={setNotice}
            />
          ))
        ) : (
          <EmptyState message={t('admin.empty')} />
        )}
      </div>
    </AdminShell>
  );
}

// ---------------------------------------------------------------------------
// One queue item.
// ---------------------------------------------------------------------------
interface QueueCardProps {
  item: AdminVerificationItem;
  lang: 'ne' | 'en';
  reviewerId: string;
  onReviewed: (decision: ReviewDecision) => void;
}

function QueueCard({ item, lang, reviewerId, onReviewed }: QueueCardProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { request, applicant, preview_url, flags } = item;

  // Which reason flow is open (null = just the three action buttons).
  const [mode, setMode] = useState<null | 'rejected' | 'more_info'>(null);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: (v: { decision: ReviewDecision; note: string }) =>
      reviewVerification(request.id, v.decision, v.note, reviewerId),
    onSuccess: (_res, v) => {
      qc.invalidateQueries({ queryKey: ['admin-verify'] });
      onReviewed(v.decision);
    },
  });

  const docLabel = t(DOC_KIND_KEY[request.doc_kind]);
  const hoursLeft = slaHoursRemaining(request.submitted_at);
  const breached = hoursLeft < 0;

  function confirm() {
    const note = reason.trim();
    if (!mode || note.length === 0) return; // reason required for reject / more_info
    mutation.mutate({ decision: mode, note });
  }

  return (
    <article className="rounded-md border border-rule bg-surface p-s4 shadow">
      {/* Applicant + SLA countdown */}
      <div className="flex flex-wrap items-start justify-between gap-s3">
        <Badge tier={applicant.tier} name={applicant.display_name} />
        <span
          className="text-small"
          style={
            breached
              ? { color: 'var(--blaze)', fontWeight: 600 }
              : { color: 'var(--ink-soft)' }
          }
        >
          {breached
            ? t('admin.slaBreached', { hours: Math.ceil(-hoursLeft) })
            : t('admin.slaLeft', { hours: Math.floor(hoursLeft) })}
        </span>
      </div>

      {/* Request meta */}
      <dl className="mt-s3 grid grid-cols-[auto_1fr] gap-x-s4 gap-y-s2 text-small">
        <dt className="text-stone">{t('admin.requestedTier')}</dt>
        <dd className="text-ink-soft">{request.requested_tier}</dd>
        <dt className="text-stone">{t('admin.docKind')}</dt>
        <dd className="text-ink-soft">{docLabel}</dd>
      </dl>

      <p className="mt-s2 text-micro text-stone">
        {t('admin.submittedAgo', { time: relativeTime(request.submitted_at, lang) })}
      </p>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="mt-s3">
          <p className="text-small text-stone">{t('admin.flags')}</p>
          <ul className="mt-s1 list-disc pl-s5 text-small text-stone">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Document viewer — redaction already applied upstream. */}
      <div className="mt-s3">
        <img
          src={preview_url}
          alt={t('admin.docKind') + ': ' + docLabel}
          className="rounded-sm"
          style={{ maxWidth: '100%', height: 'auto', border: '1px solid var(--rule)' }}
        />
      </div>

      {mutation.isError && (
        <div className="mt-s3">
          <ErrorNote message={t('error.generic')} />
        </div>
      )}

      {/* Actions */}
      {mode === null ? (
        <div className="mt-s4 flex flex-wrap gap-s3">
          <Button
            variant="primary"
            className="min-h-[44px]"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ decision: 'approved', note: '' })}
          >
            {t('admin.approve')}
          </Button>
          <Button
            variant="destructive"
            className="min-h-[44px]"
            disabled={mutation.isPending}
            onClick={() => setMode('rejected')}
          >
            {t('admin.reject')}
          </Button>
          <Button
            variant="secondary"
            className="min-h-[44px]"
            disabled={mutation.isPending}
            onClick={() => setMode('more_info')}
          >
            {t('admin.requestMore')}
          </Button>
        </div>
      ) : (
        <div className="mt-s4 rounded-md border border-rule bg-sunk p-s3">
          <label className="text-small text-ink-soft" htmlFor={`reason-${request.id}`}>
            {t('admin.reason')}
          </label>

          {/* Quick reason templates fill the textarea. */}
          <div className="mt-s2 flex flex-wrap gap-s2">
            {REASON_TEMPLATES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setReason(t(key))}
                className="min-h-[44px] rounded-sm border border-rule bg-surface px-s3 py-s2 text-left text-small text-ink-soft"
              >
                {t(key)}
              </button>
            ))}
          </div>

          <textarea
            id={`reason-${request.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-s3 w-full rounded-md border border-rule bg-surface p-s3 text-body text-ink"
            aria-label={t('admin.reason')}
          />

          <div className="mt-s3 flex flex-wrap gap-s3">
            <Button
              variant="primary"
              className="min-h-[44px]"
              disabled={mutation.isPending || reason.trim().length === 0}
              onClick={confirm}
            >
              {mode === 'rejected' ? t('admin.reject') : t('admin.requestMore')}
            </Button>
            <Button
              variant="ghost"
              className="min-h-[44px]"
              disabled={mutation.isPending}
              onClick={() => {
                setMode(null);
                setReason('');
              }}
            >
              {t('common.back')}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
