import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button, ButtonLink } from '@/components/Button';
import { EmptyState, ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createPost, findSimilar } from '@/lib/api/posts';
import { JOURNEY_STAGES } from '@/types/domain';
import type {
  FeedPost,
  JourneyStage,
  NewPostInput,
  PostKind,
  VisaOutcome,
  ExperienceDataInput,
} from '@/types/domain';

/*
 * /ask — Composer. Mode chosen up front: Ask a question (anyone) or Share
 * experience (verified only). The experience form carries the structured fields
 * that feed the shortlist tool. Two client-side trust checks live here — a
 * duplicate check (often answers the question instantly) and an outcome-guarantee
 * post-check — but neither is the real enforcement: RLS blocks unverified writes
 * and server moderation removes guarantees. See docs/05 §/ask.
 */

const DRAFT_KEY = 'shortlist_draft';
const CITY_SLUGS = ['sydney', 'melbourne', 'adelaide', 'brisbane'] as const;
// Proper nouns — same in both scripts; no i18n key needed.
const CITY_LABELS: Record<(typeof CITY_SLUGS)[number], string> = {
  sydney: 'Sydney',
  melbourne: 'Melbourne',
  adelaide: 'Adelaide',
  brisbane: 'Brisbane',
};

const GUARANTEE_RE = /guarantee|guaranteed|assured|100%|definitely will|certain to/i;

const TITLE_MIN = 10;
const TITLE_MAX = 200;

function toTags(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNum(raw: string): number | null {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function hasShortlistDraft(): boolean {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return Boolean(raw && raw !== '{}');
  } catch {
    return false;
  }
}

// Field primitive — bg-sunk well, --rule border, 44px touch target.
const FIELD_CLASS = 'w-full rounded-md border border-rule bg-sunk px-s3 py-s2 text-body';
const FIELD_STYLE = { minHeight: 44 } as const;

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-s2 block text-small text-ink-soft">
      {children}
    </label>
  );
}

export function ComposePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile, isAuthed, canAnswer } = useAuth();

  const shortlistSlug = params.get('shortlist');
  const canAttachShortlist = Boolean(shortlistSlug) || hasShortlistDraft();

  const initialMode: PostKind = params.get('mode') === 'experience' ? 'experience' : 'question';
  const [mode, setMode] = useState<PostKind>(initialMode);

  // Shared (ask) fields
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [stage, setStage] = useState<JourneyStage>(profile?.stage ?? 'deciding');
  const [city, setCity] = useState('');
  const [uniTags, setUniTags] = useState('');
  const [countryTags, setCountryTags] = useState('AU');
  const [anonymous, setAnonymous] = useState(false);
  const [attach, setAttach] = useState(false);

  // Experience-only structured fields
  const [expUniversity, setExpUniversity] = useState('');
  const [expCourse, setExpCourse] = useState('');
  const [expIntake, setExpIntake] = useState('');
  const [expTotalPaid, setExpTotalPaid] = useState('');
  const [expMonthlyLiving, setExpMonthlyLiving] = useState('');
  const [expHourly, setExpHourly] = useState('');
  const [expVisa, setExpVisa] = useState<VisaOutcome>('approved');
  const [expRefusal, setExpRefusal] = useState('');
  const [expChooseAgain, setExpChooseAgain] = useState<'yes' | 'no' | 'unsure'>('yes');

  const [similar, setSimilar] = useState<FeedPost[]>([]);
  const [outcomeBlocked, setOutcomeBlocked] = useState(false);

  const titleTrimmed = title.trim();
  const titleValid = titleTrimmed.length >= TITLE_MIN && titleTrimmed.length <= TITLE_MAX;
  const experienceLocked = mode === 'experience' && !canAnswer;

  // Duplicate check — debounce the title ~400ms, then surface up to 3 matches.
  useEffect(() => {
    if (titleTrimmed.length < 6) {
      setSimilar([]);
      return;
    }
    const handle = window.setTimeout(() => {
      findSimilar(titleTrimmed)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [titleTrimmed]);

  const mutation = useMutation({
    mutationFn: (input: NewPostInput) => {
      if (!profile) throw new Error('not authed');
      return createPost(input, profile);
    },
    onSuccess: (newId) => navigate('/p/' + newId),
  });

  const experience: ExperienceDataInput = useMemo(
    () => ({
      university_id: expUniversity.trim() || null,
      course_id: expCourse.trim() || null,
      intake: expIntake.trim(),
      total_paid_npr: toNum(expTotalPaid),
      monthly_living_aud: toNum(expMonthlyLiving),
      parttime_hourly_aud: toNum(expHourly),
      visa_outcome: expVisa,
      refusal_reason: expRefusal.trim() || null,
      would_choose_again: expChooseAgain,
    }),
    [
      expUniversity,
      expCourse,
      expIntake,
      expTotalPaid,
      expMonthlyLiving,
      expHourly,
      expVisa,
      expRefusal,
      expChooseAgain,
    ],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !titleValid) return;
    if (mode === 'experience' && !canAnswer) return;

    // Outcome-guarantee client check (UX only; server moderation enforces).
    if (GUARANTEE_RE.test(`${title} ${body}`)) {
      setOutcomeBlocked(true);
      return;
    }
    setOutcomeBlocked(false);

    const input: NewPostInput = {
      kind: mode,
      title: titleTrimmed,
      body: body.trim(),
      stage,
      city_id: city || null,
      is_anonymous: anonymous,
      shortlist_run_id: attach ? shortlistSlug ?? null : null,
      university_tags: toTags(uniTags),
      country_tags: toTags(countryTags),
      ...(mode === 'experience' ? { experience } : {}),
    };
    mutation.mutate(input);
  }

  // ---- Logged out: an explanation, never a rendered form. ----
  if (!isAuthed || !profile) {
    return (
      <AppShell>
        <h1 className="mb-s4 text-h1">{t('nav.ask')}</h1>
        <EmptyState message={t('feed.readOnlyNote')} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-s4 text-h1">{t('nav.ask')}</h1>

      {/* Mode chosen up front */}
      <div className="mb-s5 grid grid-cols-2 gap-s2" role="tablist" aria-label={t('nav.ask')}>
        <ModeButton selected={mode === 'question'} onClick={() => setMode('question')}>
          {t('compose.ask')}
        </ModeButton>
        <ModeButton selected={mode === 'experience'} onClick={() => setMode('experience')}>
          {t('compose.experience')}
        </ModeButton>
      </div>

      {experienceLocked ? (
        <div className="rounded-md border border-rule bg-sunk p-s4">
          <p className="text-body text-ink-soft">{t('compose.experienceVerifiedOnly')}</p>
          <div className="mt-s3">
            <ButtonLink to="/verify" variant="primary">
              {t('verify.lockedButton')}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-s5" noValidate>
          {/* Title */}
          <div>
            <Label htmlFor="compose-title">{t('compose.titleLabel')}</Label>
            <input
              id="compose-title"
              className={FIELD_CLASS}
              style={FIELD_STYLE}
              value={title}
              maxLength={TITLE_MAX}
              placeholder={t('compose.titlePlaceholder')}
              onChange={(e) => setTitle(e.target.value)}
            />
            {titleTrimmed.length > 0 && !titleValid && (
              <p className="mt-s2 text-small text-stone">{t('compose.titleTooShort')}</p>
            )}
          </div>

          {/* Duplicate check */}
          {similar.length > 0 && (
            <div className="rounded-md border border-rule bg-surface p-s4">
              <p className="mb-s2 text-small text-ink-soft">{t('compose.similar')}</p>
              <ul className="flex flex-col gap-s2">
                {similar.map((p) => (
                  <li key={p.id}>
                    <Link to={`/p/${p.id}`} className="text-body text-ink underline">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Body */}
          <div>
            <Label htmlFor="compose-body">{t('compose.bodyLabel')}</Label>
            <textarea
              id="compose-body"
              className={FIELD_CLASS}
              rows={5}
              placeholder={t('compose.bodyPlaceholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Stage */}
          <div>
            <Label htmlFor="compose-stage">{t('compose.stageLabel')}</Label>
            <select
              id="compose-stage"
              className={FIELD_CLASS}
              style={FIELD_STYLE}
              value={stage}
              onChange={(e) => setStage(e.target.value as JourneyStage)}
            >
              {JOURNEY_STAGES.map((s) => (
                <option key={s} value={s}>
                  {t('stages.' + s)}
                </option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <Label htmlFor="compose-city">{t('compose.cityLabel')}</Label>
            <select
              id="compose-city"
              className={FIELD_CLASS}
              style={FIELD_STYLE}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">—</option>
              {CITY_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {CITY_LABELS[slug]}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="grid gap-s4 sm:grid-cols-2">
            <div>
              <Label htmlFor="compose-unis">{t('compose.uniTags')}</Label>
              <input
                id="compose-unis"
                className={FIELD_CLASS}
                style={FIELD_STYLE}
                value={uniTags}
                placeholder="Deakin, RMIT"
                onChange={(e) => setUniTags(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="compose-countries">{t('compose.countryTags')}</Label>
              <input
                id="compose-countries"
                className={FIELD_CLASS}
                style={FIELD_STYLE}
                value={countryTags}
                placeholder="AU"
                onChange={(e) => setCountryTags(e.target.value)}
              />
            </div>
          </div>

          {/* Anonymous toggle */}
          <div>
            <label className="flex items-start gap-s3" style={{ minHeight: 44 }}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2 }}
              />
              <span>
                <span className="block text-body text-ink">{t('compose.anonymous')}</span>
                <span className="block text-small text-stone">{t('compose.anonymousHelp')}</span>
              </span>
            </label>
          </div>

          {/* Attach shortlist */}
          {canAttachShortlist && (
            <div>
              <label className="flex items-center gap-s3" style={{ minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={attach}
                  onChange={(e) => setAttach(e.target.checked)}
                  style={{ width: 20, height: 20 }}
                />
                <span className="text-body text-ink">
                  {attach ? t('compose.attached') : t('compose.attachShortlist')}
                </span>
              </label>
            </div>
          )}

          {/* Experience-only structured fields */}
          {mode === 'experience' && (
            <div className="flex flex-col gap-s4 rounded-md border border-rule bg-surface p-s4">
              <p className="text-small text-ink-soft">{t('compose.whyExperience')}</p>

              <div className="grid gap-s4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="exp-uni">{t('compose.expUniversity')}</Label>
                  <input
                    id="exp-uni"
                    className={FIELD_CLASS}
                    style={FIELD_STYLE}
                    value={expUniversity}
                    onChange={(e) => setExpUniversity(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="exp-course">{t('compose.expCourse')}</Label>
                  <input
                    id="exp-course"
                    className={FIELD_CLASS}
                    style={FIELD_STYLE}
                    value={expCourse}
                    onChange={(e) => setExpCourse(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="exp-intake">{t('compose.expIntake')}</Label>
                  <input
                    id="exp-intake"
                    className={FIELD_CLASS}
                    style={FIELD_STYLE}
                    value={expIntake}
                    placeholder="2024-07"
                    onChange={(e) => setExpIntake(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="exp-paid">{t('compose.expTotalPaid')}</Label>
                  <input
                    id="exp-paid"
                    className={`${FIELD_CLASS} font-data`}
                    style={FIELD_STYLE}
                    inputMode="numeric"
                    value={expTotalPaid}
                    onChange={(e) => setExpTotalPaid(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="exp-living">{t('compose.expMonthlyLiving')}</Label>
                  <input
                    id="exp-living"
                    className={`${FIELD_CLASS} font-data`}
                    style={FIELD_STYLE}
                    inputMode="numeric"
                    value={expMonthlyLiving}
                    onChange={(e) => setExpMonthlyLiving(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="exp-hourly">{t('compose.expHourly')}</Label>
                  <input
                    id="exp-hourly"
                    className={`${FIELD_CLASS} font-data`}
                    style={FIELD_STYLE}
                    inputMode="decimal"
                    value={expHourly}
                    onChange={(e) => setExpHourly(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="exp-visa">{t('compose.expVisa')}</Label>
                <select
                  id="exp-visa"
                  className={FIELD_CLASS}
                  style={FIELD_STYLE}
                  value={expVisa}
                  onChange={(e) => setExpVisa(e.target.value as VisaOutcome)}
                >
                  {/* i18n: no keys for visa-outcome options */}
                  <option value="approved">{t('compose.visaApproved')}</option>
                  <option value="refused">{t('compose.visaRefused')}</option>
                  <option value="pending">{t('compose.visaPending')}</option>
                  <option value="not_applied">{t('compose.visaNotApplied')}</option>
                </select>
              </div>

              {expVisa === 'refused' && (
                <div>
                  <Label htmlFor="exp-refusal">{t('compose.expRefusal')}</Label>
                  <input
                    id="exp-refusal"
                    className={FIELD_CLASS}
                    style={FIELD_STYLE}
                    value={expRefusal}
                    onChange={(e) => setExpRefusal(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label>{t('compose.expChooseAgain')}</Label>
                <div className="grid grid-cols-3 gap-s2">
                  <ChoiceButton
                    selected={expChooseAgain === 'yes'}
                    onClick={() => setExpChooseAgain('yes')}
                  >
                    {t('shortlist.yes')}
                  </ChoiceButton>
                  <ChoiceButton
                    selected={expChooseAgain === 'no'}
                    onClick={() => setExpChooseAgain('no')}
                  >
                    {t('shortlist.no')}
                  </ChoiceButton>
                  <ChoiceButton
                    selected={expChooseAgain === 'unsure'}
                    onClick={() => setExpChooseAgain('unsure')}
                  >
                    {t('compose.chooseUnsure')}
                  </ChoiceButton>
                </div>
              </div>
            </div>
          )}

          {outcomeBlocked && <ErrorNote message={t('outcomeWarning')} />}
          {mutation.isError && <ErrorNote message={t('error.generic')} />}

          <div>
            <Button type="submit" variant="primary" disabled={!titleValid || mutation.isPending}>
              {t('compose.publish')}
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}

function ModeButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className="w-full rounded-md border px-s4 py-s3 text-body"
      style={{
        minHeight: 44,
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

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="w-full rounded-md border px-s3 py-s2 text-body"
      style={{
        minHeight: 44,
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
