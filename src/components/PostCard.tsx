import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FeedPost } from '@/types/domain';
import { JOURNEY_STAGES } from '@/types/domain';
import { Badge } from './Badge';
import { TrailBar } from './TrailBar';
import { relativeTime } from '@/lib/format';

/*
 * The feed's workhorse. Trail bar shows the post's stage; the unanswered state
 * is the only place --blaze lives in the feed (2px left border, blaze dot,
 * blaze label). An unanswered question is a bug — it must read as one.
 * See docs/04-design-system.md (PostCard).
 */
export function PostCard({ post }: { post: FeedPost }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ne') ? 'ne' : 'en';
  const stageIndex = JOURNEY_STAGES.indexOf(post.stage);
  const unanswered = post.verified_answer_count === 0;

  return (
    <Link
      to={`/p/${post.id}`}
      className="block rounded-md border border-rule bg-surface p-s4 no-underline shadow"
      style={unanswered ? { borderLeft: '2px solid var(--blaze)' } : undefined}
    >
      <TrailBar
        total={JOURNEY_STAGES.length}
        current={stageIndex}
        segmentHeight={4}
        ariaLabel={t(`stages.${post.stage}`)}
        className="mb-s3"
      />

      <div className="mb-s2 flex items-center gap-s2">
        <Badge
          tier={post.author.tier}
          name={post.author.display_name}
          city={post.author.city}
          university={post.author.university}
          gradYear={post.author.grad_year}
          anonymous={post.is_anonymous}
        />
        {post.is_pinned && (
          <span className="text-micro text-stone">· {t('feed.startHere')}</span>
        )}
      </div>

      <h2 className="text-h2">{post.title}</h2>
      {post.body && (
        <p
          className="mt-s1 text-body text-stone"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {post.body}
        </p>
      )}

      <div className="mt-s3 flex items-center justify-between">
        {unanswered ? (
          <span className="inline-flex items-center gap-s2 text-small" style={{ color: 'var(--blaze)' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blaze)', display: 'inline-block' }} />
            {t('feed.unansweredFor', { time: relativeTime(post.created_at, lang).replace(/ ago| अघि/, '') })}
          </span>
        ) : (
          <span className="text-small text-student">
            {t('feed.answeredBy', { count: post.verified_answer_count })}
          </span>
        )}
        <span className="flex items-center gap-s3 text-small text-stone">
          <span aria-label={t('thread.upvote')}>↑ {post.upvote_count}</span>
          <span aria-label="comments">💬 {post.answer_count}</span>
        </span>
      </div>
    </Link>
  );
}
