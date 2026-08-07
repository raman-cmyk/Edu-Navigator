import { useTranslation } from 'react-i18next';
import { ButtonLink } from './Button';

/*
 * The most important UI element in the product. A grey user sees an explanation
 * of the rule, never a disabled textarea (a disabled input reads as a bug; an
 * explanation reads as a rule). The real enforcement is RLS — this is cosmetic.
 * Copy is explanatory, never scolding. See docs/04-design-system.md.
 */

export function LockedReplyBox() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-rule bg-sunk p-s4">
      <p className="text-body text-ink-soft">{t('verify.lockedTitle')}</p>
      <div className="mt-s3">
        <ButtonLink to="/verify" variant="primary">
          {t('verify.lockedButton')}
        </ButtonLink>
      </div>
    </div>
  );
}
