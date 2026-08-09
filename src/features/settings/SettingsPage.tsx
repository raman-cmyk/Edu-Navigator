import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button, ButtonLink } from '@/components/Button';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Badge } from '@/components/Badge';
import { ErrorNote } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth/AuthProvider';
import { updateOwnProfile } from '@/lib/api/profiles';
import { getPrefs, setPrefs, DEFAULT_PREFS, allKinds } from '@/lib/api/notifications';
import { JOURNEY_STAGES } from '@/types/domain';
import type {
  JourneyStage,
  NotificationChannels,
  NotificationKind,
  NotificationPrefs,
} from '@/types/domain';

/*
 * /settings — language · stage · target country + universities · notification
 * controls (granular per kind & per channel, defaulting to LESS) · privacy ·
 * data export · delete account · verification status. See docs/05 §/settings.
 *
 * Trust posture: notifications default to less (a spammy community feels like an
 * agent). Nothing here can flip a tier — verification lives at /verify. Profile
 * edits touch only the safe, self-editable columns (RLS revokes the rest).
 *
 * Two persistence paths, matching the app's demo/prod split:
 *   - demo  → useAuth().applyVerification(patch) (merges + writes localStorage)
 *   - prod  → updateOwnProfile({ id, ... }) (writes only the safe columns)
 * Target universities and the two privacy toggles have no backend column in V1,
 * so they are UI-level state persisted to localStorage.
 */

const PRIVACY_KEY = 'baato_privacy';
const TARGET_UNIS_KEY = 'baato_target_unis';

const CHANNELS = ['in_app', 'viber', 'email'] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABEL: Record<Channel, string> = {
  in_app: 'settings.channelInApp',
  viber: 'settings.channelViber',
  email: 'settings.channelEmail',
};

interface PrivacyPrefs {
  profileVisibility: boolean;
  anonDefault: boolean;
}

const DEFAULT_PRIVACY: PrivacyPrefs = { profileVisibility: true, anonDefault: false };

/** verified_answer → VerifiedAnswer, so `notif.kind` + this = the i18n key. */
function pascal(kind: string): string {
  return kind
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function channelsFor(prefs: NotificationPrefs, kind: NotificationKind): NotificationChannels {
  return prefs[kind] ?? DEFAULT_PREFS[kind];
}

function readPrivacy(): PrivacyPrefs {
  try {
    const raw = localStorage.getItem(PRIVACY_KEY);
    return raw ? { ...DEFAULT_PRIVACY, ...(JSON.parse(raw) as Partial<PrivacyPrefs>) } : DEFAULT_PRIVACY;
  } catch {
    return DEFAULT_PRIVACY;
  }
}

const INPUT_CLASS = 'w-full rounded-md border border-rule bg-sunk px-s3 py-s2 text-body';
const INPUT_STYLE: React.CSSProperties = { minHeight: 44 };

export function SettingsPage() {
  const { t } = useTranslation();
  const { profile, isAuthed, isDemo, applyVerification, signOut } = useAuth();
  const qc = useQueryClient();

  // ---- Profile form (local state; docs/05) ----
  const [stage, setStage] = useState<JourneyStage>(profile?.stage ?? 'deciding');
  const [targetCountry, setTargetCountry] = useState<string>(profile?.target_country ?? '');
  const [targetUnis, setTargetUnis] = useState<string>(() => localStorage.getItem(TARGET_UNIS_KEY) ?? '');
  const [privacy, setPrivacy] = useState<PrivacyPrefs>(() => readPrivacy());

  const [profileFlash, setProfileFlash] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Re-seed the form when the profile arrives / changes identity.
  useEffect(() => {
    if (profile) {
      setStage(profile.stage);
      setTargetCountry(profile.target_country);
    }
  }, [profile?.id]);

  // ---- Notification prefs (query + local edits + save mutation) ----
  const [prefs, setPrefsState] = useState<NotificationPrefs>({ ...DEFAULT_PREFS });
  const [notifFlash, setNotifFlash] = useState(false);

  const { data: loadedPrefs } = useQuery({
    queryKey: ['prefs', profile?.id],
    queryFn: () => getPrefs(profile!),
    enabled: Boolean(profile),
  });

  useEffect(() => {
    if (loadedPrefs) setPrefsState(loadedPrefs);
  }, [loadedPrefs]);

  const prefsMutation = useMutation({
    mutationFn: (next: NotificationPrefs) => setPrefs(profile!, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prefs', profile?.id] });
      setNotifFlash(true);
      setTimeout(() => setNotifFlash(false), 2000);
    },
  });

  function toggleChannel(kind: NotificationKind, channel: Channel) {
    setPrefsState((prev) => {
      const current = prev[kind] ?? DEFAULT_PREFS[kind];
      return { ...prev, [kind]: { ...current, [channel]: !current[channel] } };
    });
  }

  // ---- Delete account (confirm by typing DELETE) ----
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  async function saveProfile() {
    setProfileError(null);
    setSavingProfile(true);
    try {
      // UI-level prefs with no backend column in V1.
      localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacy));
      localStorage.setItem(TARGET_UNIS_KEY, targetUnis);
      if (isDemo) {
        applyVerification({ stage, target_country: targetCountry });
      } else if (profile) {
        await updateOwnProfile({ id: profile.id, stage, target_country: targetCountry });
      }
      setProfileFlash(true);
      setTimeout(() => setProfileFlash(false), 2000);
    } catch {
      setProfileError(t('error.generic'));
    } finally {
      setSavingProfile(false);
    }
  }

  function exportData() {
    if (!profile) return;
    const payload = {
      exported_at: new Date().toISOString(),
      profile,
      notification_prefs: prefs,
      privacy,
      target_universities: targetUnis,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baato-data-${profile.handle}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function confirmDelete() {
    if (deleteText !== 'DELETE') return;
    // TODO(prod): call a `delete-account` Edge Function (service-role) that
    // anonymizes posts/answers and removes the auth user + profile row. There is
    // deliberately no destructive server call from the client. Demo just signs out.
    signOut();
  }

  if (!isAuthed || !profile) {
    return (
      <AppShell>
        <h1 className="text-h1 font-display" style={{ color: 'var(--ink)' }}>
          {t('settings.title')}
        </h1>
        <p className="mt-s4 text-body text-ink-soft">{t('feed.readOnlyNote')}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-h1 font-display" style={{ color: 'var(--ink)' }}>
        {t('settings.title')}
      </h1>

      {/* Language */}
      <Section title={t('settings.language')}>
        <LanguageToggle />
      </Section>

      {/* Stage */}
      <Section title={t('settings.stage')}>
        <select
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          value={stage}
          onChange={(e) => setStage(e.target.value as JourneyStage)}
          aria-label={t('settings.stage')}
        >
          {JOURNEY_STAGES.map((s) => (
            <option key={s} value={s}>
              {t(`stages.${s}`)}
            </option>
          ))}
        </select>
      </Section>

      {/* Target country & universities */}
      <Section title={t('settings.target')}>
        <label className="mb-s1 block text-small text-stone" htmlFor="target-country">
          {t('settings.targetCountry')}
        </label>
        <input
          id="target-country"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          value={targetCountry}
          onChange={(e) => setTargetCountry(e.target.value)}
        />
        <label className="mb-s1 mt-s3 block text-small text-stone" htmlFor="target-unis">
          {t('settings.targetUnis')}
        </label>
        <input
          id="target-unis"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          value={targetUnis}
          onChange={(e) => setTargetUnis(e.target.value)}
        />
      </Section>

      {/* Save profile edits */}
      <div className="mt-s4 flex items-center gap-s3">
        <Button onClick={saveProfile} disabled={savingProfile}>
          {t('settings.save')}
        </Button>
        {profileFlash && (
          <span className="text-small" style={{ color: 'var(--student)' }} role="status">
            {t('settings.saved')}
          </span>
        )}
      </div>
      {profileError && (
        <div className="mt-s3">
          <ErrorNote message={profileError} />
        </div>
      )}

      {/* Notifications */}
      <Section title={t('settings.notifications')} help={t('settings.notificationsHelp')}>
        <div className="overflow-x-auto rounded-md border border-rule bg-surface">
          <table className="w-full border-collapse text-small" style={{ minWidth: 340 }}>
            <thead>
              <tr>
                <th className="p-s2 text-left font-body text-stone" style={{ minWidth: 160 }} scope="col">
                  {/* row label column — no heading text needed */}
                </th>
                {CHANNELS.map((ch) => (
                  <th
                    key={ch}
                    className="p-s2 text-center font-body text-stone"
                    style={{ minWidth: 56 }}
                    scope="col"
                  >
                    {t(CHANNEL_LABEL[ch])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allKinds().map((kind) => {
                const channels = channelsFor(prefs, kind);
                const label = t(`notif.kind${pascal(kind)}`);
                return (
                  <tr key={kind} className="border-t border-rule">
                    <td className="p-s2 align-middle text-ink-soft">{label}</td>
                    {CHANNELS.map((ch) => (
                      <td key={ch} className="p-0 text-center align-middle">
                        <label
                          className="mx-auto inline-flex items-center justify-center"
                          style={{ minWidth: 44, minHeight: 44 }}
                        >
                          <span className="sr-only">{`${label} — ${t(CHANNEL_LABEL[ch])}`}</span>
                          <input
                            type="checkbox"
                            checked={channels[ch]}
                            onChange={() => toggleChannel(kind, ch)}
                            style={{ width: 20, height: 20 }}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-s3 flex items-center gap-s3">
          <Button
            variant="secondary"
            onClick={() => prefsMutation.mutate(prefs)}
            disabled={prefsMutation.isPending}
          >
            {t('settings.save')}
          </Button>
          {notifFlash && (
            <span className="text-small" style={{ color: 'var(--student)' }} role="status">
              {t('settings.saved')}
            </span>
          )}
          {prefsMutation.isError && (
            <span className="text-small text-ink-soft">{t('error.generic')}</span>
          )}
        </div>
      </Section>

      {/* Privacy (UI-level in V1; persisted to localStorage on Save above) */}
      <Section title={t('settings.privacy')}>
        <ToggleRow
          label={t('settings.profileVisibility')}
          checked={privacy.profileVisibility}
          onChange={(v) => setPrivacy((p) => ({ ...p, profileVisibility: v }))}
        />
        <ToggleRow
          label={t('settings.anonDefault')}
          checked={privacy.anonDefault}
          onChange={(v) => setPrivacy((p) => ({ ...p, anonDefault: v }))}
        />
      </Section>

      {/* Your data */}
      <Section title={t('settings.data')}>
        <div className="flex flex-col gap-s3">
          <Button variant="secondary" onClick={exportData}>
            {t('settings.exportData')}
          </Button>

          {!confirmingDelete ? (
            <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
              {t('settings.deleteAccount')}
            </Button>
          ) : (
            <div className="rounded-md border border-rule bg-surface p-s4">
              <p className="text-body text-ink">{t('settings.deleteConfirm')}</p>
              <input
                className={`${INPUT_CLASS} mt-s3`}
                style={INPUT_STYLE}
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                aria-label={t('settings.deleteConfirm')}
                autoFocus
              />
              <div className="mt-s3 flex gap-s3">
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={deleteText !== 'DELETE'}
                >
                  {t('settings.deleteAccount')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteText('');
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Verification status */}
      <Section title={t('settings.verificationStatus')}>
        <div className="flex flex-wrap items-center gap-s3">
          <Badge
            tier={profile.tier}
            name={profile.display_name}
            city={profile.city_id}
            university={profile.university_id}
            gradYear={profile.grad_year}
          />
          <ButtonLink to="/verify" variant="secondary">
            {t('profile.verify')}
          </ButtonLink>
        </div>
      </Section>
    </AppShell>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-s5">
      <h2 className="text-h2 font-display" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
      {help && <p className="mt-s1 text-small text-stone">{help}</p>}
      <div className="mt-s3">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center justify-between gap-s3 border-b border-rule py-s2"
      style={{ minHeight: 44 }}
    >
      <span className="text-body text-ink-soft">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20 }}
      />
    </label>
  );
}
