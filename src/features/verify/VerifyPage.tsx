import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { TrailBar } from '@/components/TrailBar';
import { Button, ButtonLink } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { ErrorNote, LoadingBlock } from '@/components/EmptyState';
import { RedactionCanvas } from '@/components/RedactionCanvas';
import { useAuth } from '@/lib/auth/AuthProvider';
import { submitVerification, getMyRequests } from '@/lib/api/verification';
import { listCity } from '@/lib/api/posts';
import type { DocKind, VerificationRequest } from '@/types/domain';

/*
 * Verification flow (docs/05 §/verify): pick tier -> upload -> redaction ->
 * review. A human reviews within 24h. On approval the badge appears and the
 * user is immediately shown questions in their city they can now answer —
 * converting verification into contribution in the same session. Rejection is
 * never a dead end: the reason is shown and resubmission is one tap.
 */

const CITIES = [
  { slug: 'sydney', name: 'Sydney' },
  { slug: 'melbourne', name: 'Melbourne' },
  { slug: 'adelaide', name: 'Adelaide' },
  { slug: 'brisbane', name: 'Brisbane' },
];
const DOC_KINDS: DocKind[] = ['offer_letter', 'visa_grant', 'coe', 'student_id', 'degree', 'transcript', 'address_proof'];
const DOC_KEY: Record<DocKind, string> = {
  offer_letter: 'docOffer', visa_grant: 'docVisa', coe: 'docCoe', student_id: 'docStudentId',
  degree: 'docDegree', transcript: 'docTranscript', address_proof: 'docAddress',
};
const TOTAL = 4;

export function VerifyPage() {
  const { t } = useTranslation();
  const { profile, isAuthed, applyVerification } = useAuth();

  const myRequests = useQuery({
    queryKey: ['my-verifications', profile?.id],
    queryFn: () => (profile ? getMyRequests(profile) : Promise.resolve([])),
    enabled: Boolean(profile),
  });

  const [starting, setStarting] = useState(false);
  const latest = myRequests.data?.[0];

  if (!isAuthed) {
    return (
      <AppShell>
        <h1 className="text-h1">{t('verify.title')}</h1>
        <p className="mt-s3 text-body text-ink-soft">{t('feed.readOnlyNote')}</p>
      </AppShell>
    );
  }

  // Show the status view when a request exists and the user isn't starting a new one.
  if (latest && !starting) {
    return <StatusView latest={latest} onStartOver={() => setStarting(true)} applyVerification={applyVerification} />;
  }

  return <Wizard onDone={() => { setStarting(false); myRequests.refetch(); }} />;
}

// ---------------------------------------------------------------------------
function StatusView({
  latest,
  onStartOver,
  applyVerification,
}: {
  latest: VerificationRequest;
  onStartOver: () => void;
  applyVerification: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();

  // On approval, reflect the granted badge on the local profile (in prod the
  // verify-review Edge Function has already written it server-side).
  const applied = useRef(false);
  if (latest.status === 'approved' && !applied.current) {
    applied.current = true;
    applyVerification({
      tier: latest.requested_tier,
      city_id: latest.requested_city_id ?? profile?.city_id ?? null,
    });
  }

  const citySlug = latest.requested_city_id ?? profile?.city_id ?? null;
  const unanswered = useQuery({
    queryKey: ['verify-conversion', citySlug],
    queryFn: () => (citySlug ? listCity(citySlug, 'unanswered', { country: 'AU' }) : Promise.resolve([])),
    enabled: latest.status === 'approved' && Boolean(citySlug),
  });

  return (
    <AppShell>
      <h1 className="text-h1">{t('verify.statusTitle')}</h1>

      {latest.status === 'pending' && (
        <p className="mt-s3 rounded-md bg-sunk p-s4 text-body text-ink-soft">{t('verify.statusPending')}</p>
      )}

      {latest.status === 'approved' && (
        <div className="mt-s3">
          <div className="rounded-md border border-rule bg-surface p-s4">
            <p className="text-body">{t('verify.approvedWelcome')}</p>
            {profile && (
              <div className="mt-s2">
                <Badge tier={profile.tier} name={profile.display_name} city={profile.city_id} university={profile.university_id} gradYear={profile.grad_year} />
              </div>
            )}
          </div>

          {citySlug && (
            <section className="mt-s5">
              <h2 className="text-h2">{t('verify.conversionTitle')}</h2>
              <div className="mt-s3 flex flex-col gap-s3">
                {unanswered.isLoading ? (
                  <LoadingBlock height={100} />
                ) : (
                  <>
                    {(unanswered.data ?? []).slice(0, 3).map((p) => (
                      <Link key={p.id} to={`/p/${p.id}`} className="block rounded-md border border-rule bg-surface p-s3 no-underline">
                        <span className="text-body" style={{ fontWeight: 600 }}>{p.title}</span>
                      </Link>
                    ))}
                    <ButtonLink to={`/city/${citySlug}`} variant="primary">{t('verify.conversionCta')}</ButtonLink>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {(latest.status === 'rejected' || latest.status === 'more_info') && (
        <div className="mt-s3">
          <ErrorNote message={`${t(latest.status === 'rejected' ? 'verify.statusRejected' : 'verify.statusMoreInfo')}${latest.reviewer_note ? ' — ' + latest.reviewer_note : ''}`} />
          <div className="mt-s4">
            <Button variant="primary" onClick={onStartOver}>{t('verify.resubmit')}</Button>
          </div>
        </div>
      )}

      {latest.status === 'pending' && (
        <div className="mt-s5">
          <Button variant="ghost" onClick={onStartOver}>{t('verify.startOver')}</Button>
        </div>
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
function Wizard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [tier, setTier] = useState<'green' | 'gold'>('green');
  const [cityId, setCityId] = useState<string | null>(null);
  const [gradYear, setGradYear] = useState<string>('');
  const [docKind, setDocKind] = useState<DocKind>('coe');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [redacted, setRedacted] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      submitVerification(
        {
          requested_tier: tier,
          requested_city_id: cityId,
          grad_year: gradYear ? Number(gradYear) : null,
          doc_kind: docKind,
          redacted_data_url: redacted ?? imageDataUrl ?? '',
          redaction_applied: confirmed,
        },
        profile!,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-verifications'] });
      onDone();
    },
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setRedacted(null);
      setConfirmed(false);
    };
    reader.readAsDataURL(file);
  }

  const canNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return Boolean(imageDataUrl);
    if (step === 2) return confirmed;
    return true;
  }, [step, imageDataUrl, confirmed]);

  return (
    <AppShell>
      <TrailBar total={TOTAL} current={step} segmentHeight={6} className="mb-s2" />
      <p className="text-micro text-stone">{t('verify.step', { current: step + 1, total: TOTAL })}</p>
      <p className="mt-s3 text-small text-ink-soft">{t('verify.intro')}</p>

      <div className="mt-s5 min-h-[260px]">
        {step === 0 && (
          <div>
            <h1 className="text-h1">{t('verify.pickTier')}</h1>
            <div className="mt-s4 flex flex-col gap-s2">
              <TierOption selected={tier === 'green'} onClick={() => setTier('green')} title={t('verify.tierGreen')} desc={t('verify.tierGreenDesc')} />
              <TierOption selected={tier === 'gold'} onClick={() => setTier('gold')} title={t('verify.tierGold')} desc={t('verify.tierGoldDesc')} />
            </div>
            {tier === 'gold' && (
              <label className="mt-s4 block">
                <span className="text-small text-ink-soft">{t('verify.gradYear')}</span>
                <input className="mt-s1 w-full rounded-md border border-rule bg-sunk px-s3 py-s2" inputMode="numeric" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2024" />
              </label>
            )}
            <div className="mt-s5 rounded-md border border-rule bg-sunk p-s3">
              <span className="text-small text-ink-soft">{t('verify.cityTag')}</span>
              <p className="text-micro text-stone">{t('verify.cityTagDesc')}</p>
              <label className="mt-s2 block text-small text-ink-soft">{t('verify.chooseCity')}</label>
              <select className="mt-s1 w-full rounded-md border border-rule bg-surface px-s3 py-s2" value={cityId ?? ''} onChange={(e) => setCityId(e.target.value || null)}>
                <option value="">—</option>
                {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h1 className="text-h1">{t('verify.upload')}</h1>
            <p className="mt-s2 text-small text-stone">{t('verify.uploadHelp')}</p>
            <label className="mt-s4 block text-small text-ink-soft">{t('verify.chooseDoc')}</label>
            <select className="mt-s1 w-full rounded-md border border-rule bg-sunk px-s3 py-s2" value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)}>
              {DOC_KINDS.map((d) => <option key={d} value={d}>{t(`verify.${DOC_KEY[d]}`)}</option>)}
            </select>
            <label className="mt-s4 inline-flex cursor-pointer items-center rounded-md bg-ink px-s4 py-s2 text-paper">
              {t('verify.pickFile')}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            </label>
            {imageDataUrl && <img src={imageDataUrl} alt="" className="mt-s3 max-w-full rounded-md border border-rule" />}
          </div>
        )}

        {step === 2 && imageDataUrl && (
          <div>
            <h1 className="text-h1">{t('verify.redactTitle')}</h1>
            <p className="mt-s2 text-small text-stone">{t('verify.redactHelp')}</p>
            <div className="mt-s4">
              <RedactionCanvas imageDataUrl={imageDataUrl} onChange={setRedacted} />
            </div>
            <label className="mt-s4 flex items-start gap-s2">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-s1" />
              <span className="text-body">{t('verify.redactConfirm')}</span>
            </label>
            {!confirmed && <p className="mt-s1 text-micro text-stone">{t('verify.mustRedact')}</p>}
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="text-h1">{t('verify.review')}</h1>
            <p className="mt-s2 text-small text-stone">{t('verify.reviewHelp')}</p>
            <dl className="mt-s4 flex flex-col gap-s2 text-small">
              <Row label={t('verify.pickTier')} value={tier === 'green' ? t('verify.tierGreen') : t('verify.tierGold')} />
              <Row label={t('verify.chooseDoc')} value={t(`verify.${DOC_KEY[docKind]}`)} />
              {cityId && <Row label={t('verify.chooseCity')} value={CITIES.find((c) => c.slug === cityId)?.name ?? cityId} />}
            </dl>
            {(redacted ?? imageDataUrl) && <img src={redacted ?? imageDataUrl ?? ''} alt="" className="mt-s3 max-w-full rounded-md border border-rule" />}
            {submit.isError && <div className="mt-s3"><ErrorNote message={t('error.generic')} /></div>}
          </div>
        )}
      </div>

      <div className="mt-s5 flex items-center justify-between gap-s3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submit.isPending} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}>
          ← {t('common.back')}
        </Button>
        {step < TOTAL - 1 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            {t('common.next')} →
          </Button>
        ) : (
          <Button variant="primary" onClick={() => submit.mutate()} disabled={submit.isPending || !confirmed}>
            {submit.isPending ? t('common.loading') : t('verify.submit')}
          </Button>
        )}
      </div>
    </AppShell>
  );
}

function TierOption({ selected, onClick, title, desc }: { selected: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="w-full rounded-md border px-s4 py-s3 text-left"
      style={{
        borderColor: selected ? 'var(--ink)' : 'var(--rule)',
        borderWidth: selected ? 2 : 1,
        background: 'var(--surface)',
      }}
    >
      <span className="block text-body" style={{ fontWeight: 600 }}>{title}</span>
      <span className="block text-small text-stone">{desc}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-s3">
      <dt className="text-stone">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
