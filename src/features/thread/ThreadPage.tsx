import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { LockedReplyBox } from '@/components/LockedReplyBox';
import { TrailBar } from '@/components/TrailBar';
import { EmptyState, LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getThread, createAnswer, toggleUpvote, toggleSave } from '@/lib/api/posts';
import { relativeTime } from '@/lib/format';
import { JOURNEY_STAGES } from '@/types/domain';
import type { ThreadAnswer } from '@/types/domain';

/*
 * /p/:id — Thread.
 *
 * The two rules that make this screen the product:
 *   1. Verified answers always render FIRST — sorted by tier, then helpfulness,
 *      then upvotes, then time. NOT by votes alone. Grey/agent comments collapse
 *      below under "Other comments".
 *   2. The reply box is the core mechanic. canAnswer (green/gold, not banned,
 *      not agent) gets a real textarea; everyone else gets the LockedReplyBox —
 *      an explanation of the rule, never a disabled field. RLS is the real gate;
 *      this only drives UI. See docs/05-screens.md and docs/04-design-system.md.
 */

// Client-side outcome-guarantee guard. Server moderation is the real enforcement
// (trust rule 3); this is a fast UX nudge so a student can rephrase before submit.
const GUARANTEE_RE = /guarantee|assured|100%|definitely will|certain to/i;

function isVerified(a: ThreadAnswer): boolean {
  return a.author.tier === 'green' || a.author.tier === 'gold';
}

/** Verified-first ordering: helpful, then upvotes, then oldest-first. */
function sortVerified(a: ThreadAnswer, b: ThreadAnswer): number {
  if (a.is_marked_helpful !== b.is_marked_helpful) return a.is_marked_helpful ? -1 : 1;
  if (b.upvote_count !== a.upvote_count) return b.upvote_count - a.upvote_count;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function ThreadPage() {
  const { t, i18n } = useTranslation();
  const lang: 'ne' | 'en' = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const { id = '' } = useParams();
  const { profile, isAuthed, canAnswer } = useAuth();
  const qc = useQueryClient();

  const [showOther, setShowOther] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['thread', id],
    queryFn: () => getThread(id),
    enabled: id.length > 0,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['thread', id] });

  const upvoteMutation = useMutation({
    mutationFn: (v: { type: 'post' | 'answer'; targetId: string }) =>
      toggleUpvote(v.type, v.targetId, profile!),
    onSuccess: invalidate,
  });
  const saveMutation = useMutation({
    mutationFn: (postId: string) => toggleSave(postId, profile!),
    onSuccess: invalidate,
  });
  const answerMutation = useMutation({
    mutationFn: (v: { body: string; parentAnswerId: string | null }) =>
      createAnswer(id, v.body, v.parentAnswerId, profile!),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col gap-s3">
          <LoadingBlock height={140} />
          <LoadingBlock height={80} />
          <LoadingBlock height={80} />
        </div>
      </AppShell>
    );
  }

  const post = data?.post ?? null;
  if (isError || !post) {
    return (
      <AppShell>
        <ErrorNote message={t('error.generic')} />
      </AppShell>
    );
  }

  const answers = data?.answers ?? [];
  const verified = answers.filter(isVerified).sort(sortVerified);
  const other = answers.filter((a) => !isVerified(a));
  const stageIndex = JOURNEY_STAGES.indexOf(post.stage);
  const stageLabels = JOURNEY_STAGES.map((s) => t(`stages.${s}`));

  async function submitAnswer(body: string, parentAnswerId: string | null): Promise<void> {
    await answerMutation.mutateAsync({ body, parentAnswerId });
  }

  return (
    <AppShell>
      {/* ---- Question ---- */}
      <article className="rounded-md border border-rule bg-surface p-s4">
        <TrailBar
          total={JOURNEY_STAGES.length}
          current={stageIndex}
          labels={stageLabels}
          segmentHeight={4}
          ariaLabel={t(`stages.${post.stage}`)}
        />

        <div className="mt-s3 flex items-center justify-between gap-s3">
          <Badge
            tier={post.author.tier}
            name={post.author.display_name}
            city={post.author.city}
            university={post.author.university}
            gradYear={post.author.grad_year}
            anonymous={post.is_anonymous}
          />
          <span className="text-micro text-stone">{relativeTime(post.created_at, lang)}</span>
        </div>

        <h1 className="mt-s3 text-h2">{post.title}</h1>
        {post.body && <p className="mt-s2 text-body text-ink-soft">{post.body}</p>}

        {(post.university_tags.length > 0 || post.country_tags.length > 0) && (
          <div className="mt-s3 flex flex-wrap gap-s2">
            {[...post.country_tags, ...post.university_tags].map((tag) => (
              <span
                key={tag}
                className="rounded-sm border border-rule bg-sunk px-s2 py-s1 text-micro text-ink-soft"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {post.shortlist_run_id && (
          <div className="mt-s3">
            <Link
              to={`/s/${post.shortlist_run_id}`}
              className="text-small text-ink-soft underline"
            >
              {t('thread.attachedShortlist')}
            </Link>
          </div>
        )}

        {/* Post actions — upvote + save. No downvote path anywhere. */}
        <div className="mt-s4 flex flex-wrap items-center gap-s4 border-t border-rule pt-s3">
          {isAuthed ? (
            <>
              <button
                type="button"
                onClick={() => upvoteMutation.mutate({ type: 'post', targetId: post.id })}
                aria-label={t('thread.upvote')}
                className="text-small text-ink-soft"
                style={{ fontWeight: post.viewer_upvoted ? 600 : 400 }}
              >
                ↑ {post.upvote_count}
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate(post.id)}
                className="text-small text-ink-soft"
                style={{ fontWeight: post.viewer_saved ? 600 : 400 }}
              >
                {post.viewer_saved ? t('thread.saved') : t('thread.save')}
              </button>
            </>
          ) : (
            <>
              <span className="text-small text-stone">↑ {post.upvote_count}</span>
              <span className="text-micro text-stone">{t('feed.loginToVote')}</span>
              <span className="text-micro text-stone">{t('feed.loginToSave')}</span>
            </>
          )}
        </div>
      </article>

      {/* ---- Reply area (the core mechanic) ---- */}
      <section className="mt-s4">
        {canAnswer ? (
          <AnswerForm
            placeholder={t('thread.replyPlaceholder')}
            submitLabel={t('thread.post')}
            submitting={answerMutation.isPending}
            onSubmit={(body) => submitAnswer(body, null)}
          />
        ) : (
          <LockedReplyBox />
        )}
      </section>

      {/* ---- Answers ---- */}
      <section className="mt-s6">
        {/* AI summary — only past 15 answers, collapsed by default, clearly AI. */}
        {post.answer_count > 15 && (
          <details className="mb-s4 rounded-md border border-rule bg-sunk p-s4">
            <summary className="flex cursor-pointer items-center gap-s2 text-small text-ink-soft">
              <span
                className="rounded-sm px-s2 py-s1 text-micro"
                style={{ background: 'var(--sunk)', border: '1px solid var(--rule)', fontWeight: 600 }}
              >
                {t('thread.aiLabel')}
              </span>
              {t('thread.summary')}
            </summary>
            <p className="mt-s3 text-body text-ink-soft">{t('thread.summaryBody')}</p>
          </details>
        )}

        <h2 className="text-h2">{t('thread.verifiedAnswers')}</h2>
        {verified.length === 0 ? (
          <div className="mt-s3">
            <EmptyState message={t('thread.noAnswers')} />
          </div>
        ) : (
          <div className="mt-s3 flex flex-col gap-s4">
            {verified.map((a) => (
              <AnswerCard
                key={a.id}
                answer={a}
                lang={lang}
                isAuthed={isAuthed}
                onUpvote={(answerId) => upvoteMutation.mutate({ type: 'answer', targetId: answerId })}
                canReply={canAnswer}
                isReplyOpen={replyingTo === a.id}
                onToggleReply={() => setReplyingTo(replyingTo === a.id ? null : a.id)}
                replySubmitting={answerMutation.isPending}
                onReplySubmit={async (body) => {
                  await submitAnswer(body, a.id);
                  setReplyingTo(null);
                }}
              />
            ))}
          </div>
        )}

        {/* Other comments (grey/agent) — collapsed by default. */}
        {other.length > 0 && (
          <div className="mt-s6">
            <h2 className="text-h2">{t('thread.otherComments')}</h2>
            {!showOther ? (
              <button
                type="button"
                onClick={() => setShowOther(true)}
                className="mt-s3 text-small text-ink-soft underline"
              >
                {t('thread.showOther', { count: other.length })}
              </button>
            ) : (
              <div className="mt-s3 flex flex-col gap-s4">
                {other.map((a) => (
                  <AnswerCard
                    key={a.id}
                    answer={a}
                    lang={lang}
                    isAuthed={isAuthed}
                    onUpvote={(answerId) =>
                      upvoteMutation.mutate({ type: 'answer', targetId: answerId })
                    }
                    canReply={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Answer card — one level of replies only. No reply affordance on replies.
// ---------------------------------------------------------------------------
interface AnswerCardProps {
  answer: ThreadAnswer;
  lang: 'ne' | 'en';
  isAuthed: boolean;
  onUpvote: (answerId: string) => void;
  canReply: boolean;
  isReply?: boolean;
  isReplyOpen?: boolean;
  onToggleReply?: () => void;
  replySubmitting?: boolean;
  onReplySubmit?: (body: string) => Promise<void>;
}

function AnswerCard({
  answer,
  lang,
  isAuthed,
  onUpvote,
  canReply,
  isReply = false,
  isReplyOpen = false,
  onToggleReply,
  replySubmitting = false,
  onReplySubmit,
}: AnswerCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`rounded-md border border-rule bg-surface p-s4${isReply ? ' bg-sunk' : ''}`}
      style={isReply ? { marginLeft: 'var(--s4)' } : undefined}
    >
      <div className="flex items-center justify-between gap-s3">
        <Badge
          tier={answer.author.tier}
          name={answer.author.display_name}
          city={answer.author.city}
          university={answer.author.university}
          gradYear={answer.author.grad_year}
        />
        <span className="text-micro text-stone">{relativeTime(answer.created_at, lang)}</span>
      </div>

      {answer.is_marked_helpful && (
        <p className="mt-s2 text-small" style={{ color: 'var(--student)', fontWeight: 600 }}>
          {t('thread.markedHelpful')}
        </p>
      )}

      <p className="mt-s2 text-body text-ink">{answer.body}</p>

      <div className="mt-s3 flex flex-wrap items-center gap-s4">
        {isAuthed ? (
          <button
            type="button"
            onClick={() => onUpvote(answer.id)}
            aria-label={t('thread.upvote')}
            className="text-small text-ink-soft"
            style={{ fontWeight: answer.viewer_upvoted ? 600 : 400 }}
          >
            ↑ {answer.upvote_count}
          </button>
        ) : (
          <span className="text-small text-stone">↑ {answer.upvote_count}</span>
        )}

        {!isReply && canReply && onToggleReply && (
          <button
            type="button"
            onClick={onToggleReply}
            className="text-small text-ink-soft underline"
          >
            {t('thread.reply')}
          </button>
        )}
      </div>

      {!isReply && isReplyOpen && onReplySubmit && (
        <div className="mt-s3">
          <AnswerForm
            placeholder={t('thread.replyPlaceholder')}
            submitLabel={t('thread.post')}
            submitting={replySubmitting}
            onSubmit={onReplySubmit}
          />
        </div>
      )}

      {/* One level of replies, indented. Never recurse past this. */}
      {!isReply && answer.replies.length > 0 && (
        <div className="mt-s3 flex flex-col gap-s3">
          {answer.replies.map((r) => (
            <AnswerCard
              key={r.id}
              answer={r}
              lang={lang}
              isAuthed={isAuthed}
              onUpvote={onUpvote}
              canReply={false}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer form — real textarea, with the outcome-guarantee UX guard.
// ---------------------------------------------------------------------------
interface AnswerFormProps {
  placeholder: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (body: string) => Promise<void>;
}

function AnswerForm({ placeholder, submitLabel, submitting, onSubmit }: AnswerFormProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [warn, setWarn] = useState(false);

  async function handleSubmit() {
    const body = text.trim();
    if (!body) return;
    if (GUARANTEE_RE.test(body)) {
      setWarn(true);
      return; // server moderation is the real gate; block here as UX.
    }
    setWarn(false);
    await onSubmit(body);
    setText('');
  }

  return (
    <div className="rounded-md border border-rule bg-surface p-s4">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (warn) setWarn(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={4}
        className="w-full rounded-md border border-rule bg-sunk p-s3 text-body text-ink"
      />
      {warn && (
        <div className="mt-s3">
          <ErrorNote message={t('outcomeWarning')} />
        </div>
      )}
      <div className="mt-s3 flex justify-end">
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={submitting || text.trim().length === 0}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
