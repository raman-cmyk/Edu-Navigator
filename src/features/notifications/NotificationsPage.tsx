import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { EmptyState, LoadingBlock, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listNotifications, markAllRead } from '@/lib/api/notifications';
import { relativeTime } from '@/lib/format';
import type { AppNotification, NotificationKind } from '@/types/domain';

/*
 * /notifications — grouped by day (docs/05 §/notifications).
 *
 * "Your question got a verified answer" is the highest-priority kind (it's the
 * one that also fires a Viber push); everything else batches. In-app we render
 * them all, newest first, split into Today / Earlier.
 *
 * Unread rows get *subtle* emphasis only — a small --student dot and heavier
 * --ink text. --blaze is deliberately NOT used here: in this product blaze means
 * an unanswered question in the feed and nothing else (docs/04).
 */

// kind -> i18n label key (all keys exist under notif.* in en.json / ne.json).
const KIND_LABEL: Record<NotificationKind, string> = {
  verified_answer: 'notif.kindVerifiedAnswer',
  marked_helpful: 'notif.kindMarkedHelpful',
  unanswered_expertise: 'notif.kindUnansweredExpertise',
  verification_approved: 'notif.kindVerificationApproved',
  verification_rejected: 'notif.kindVerificationRejected',
  city_post: 'notif.kindCityPost',
  weekly_digest: 'notif.kindWeeklyDigest',
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const lang: 'ne' | 'en' = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const { profile, isAuthed } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: () => listNotifications(profile!),
    enabled: isAuthed && Boolean(profile),
  });

  const markAll = useMutation({
    mutationFn: () => markAllRead(profile!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', profile?.id] });
    },
  });

  // Logged out: this is an authed screen — explain, don't gate with a dead field.
  if (!isAuthed || !profile) {
    return (
      <AppShell>
        <h1 className="text-h1">{t('notif.title')}</h1>
        <p className="mt-s3 text-small text-stone">{t('feed.readOnlyNote')}</p>
      </AppShell>
    );
  }

  const items = data ?? [];
  const now = new Date();

  // Newest first within each group; split into Today / Earlier by calendar day.
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const today = sorted.filter((n) => isSameDay(new Date(n.created_at), now));
  const earlier = sorted.filter((n) => !isSameDay(new Date(n.created_at), now));

  const hasUnread = items.some((n) => n.read_at === null);

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-s3">
        <h1 className="text-h1">{t('notif.title')}</h1>
        {hasUnread && (
          <Button
            variant="secondary"
            className="min-h-[44px]"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {t('notif.markAllRead')}
          </Button>
        )}
      </div>

      <div className="mt-s4 flex flex-col gap-s5">
        {isLoading ? (
          <div className="flex flex-col gap-s3">
            <LoadingBlock height={64} />
            <LoadingBlock height={64} />
            <LoadingBlock height={64} />
          </div>
        ) : isError ? (
          <ErrorNote message={t('error.generic')} />
        ) : items.length === 0 ? (
          <EmptyState message={t('empty.notifications')} />
        ) : (
          <>
            {today.length > 0 && (
              <NotificationGroup
                title={t('notif.today')}
                items={today}
                lang={lang}
              />
            )}
            {earlier.length > 0 && (
              <NotificationGroup
                title={t('notif.earlier')}
                items={earlier}
                lang={lang}
              />
            )}
          </>
        )}
      </div>

      {/* Reassurance, not spam: the hard 2/day push cap lives in the notify fn. */}
      <p className="mt-s6 text-micro text-stone">{t('notif.pushCapNote')}</p>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// A day group ("Today" / "Earlier").
// ---------------------------------------------------------------------------
function NotificationGroup({
  title,
  items,
  lang,
}: {
  title: string;
  items: AppNotification[];
  lang: 'ne' | 'en';
}) {
  return (
    <section>
      <h2 className="text-small text-stone">{title}</h2>
      <ul className="mt-s2 flex flex-col gap-s2">
        {items.map((n) => (
          <li key={n.id}>
            <NotificationRow item={n} lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One notification row. Links to the thread or city room when the payload
// carries the reference; otherwise renders as a plain card.
// ---------------------------------------------------------------------------
function NotificationRow({ item, lang }: { item: AppNotification; lang: 'ne' | 'en' }) {
  const { t } = useTranslation();
  const unread = item.read_at === null;

  const payload = item.payload as {
    post_id?: unknown;
    title?: unknown;
    city?: unknown;
  };
  const postId = typeof payload.post_id === 'string' ? payload.post_id : null;
  const city = typeof payload.city === 'string' ? payload.city : null;
  const context = typeof payload.title === 'string' ? payload.title : null;

  const to = postId ? `/p/${postId}` : city ? `/city/${city}` : null;

  const inner = (
    <div className="flex items-start gap-s3">
      {/* Unread marker: a small square dot in --student. Never --blaze. */}
      <span
        aria-hidden="true"
        className="mt-s2 shrink-0"
        style={{
          width: 6,
          height: 6,
          background: unread ? 'var(--student)' : 'transparent',
        }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-body"
          style={{
            color: unread ? 'var(--ink)' : 'var(--ink-soft)',
            fontWeight: unread ? 600 : 400,
          }}
        >
          {t(KIND_LABEL[item.kind])}
        </p>
        {context && (
          <p className="mt-s1 truncate text-small text-stone">{context}</p>
        )}
        <p className="mt-s1 text-micro text-stone">
          {relativeTime(item.created_at, lang)}
        </p>
      </div>
    </div>
  );

  const cardClass =
    'block rounded-md border border-rule bg-surface p-s3 no-underline';

  if (to) {
    return (
      <Link to={to} className={`${cardClass} min-h-[44px]`}>
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}
