'use client';

/**
 * The lock screen: everything behind it, nothing of it readable.
 *
 * It covers rather than replaces, so nothing about the app's state is disturbed by
 * locking - come back within the grace period and you are on the same screen, mid-form,
 * where you left off.
 *
 * The way out for someone who has genuinely forgotten is signing out. Nothing is lost by
 * it: the entries are on the server, and signing back in brings them all down again. It
 * is also the honest escape - a "reset PIN" that did not require the account password
 * would be a lock with its own key taped to it.
 */

import { useEffect, useState } from 'react';
import { PinPad } from './PinPad';
import { PotliLogo } from '@/components/ui/PotliLogo';
import { Button } from '@/components/ui/Button';
import { usePin } from '@/components/providers/PinProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { PIN_LENGTH } from '@/lib/security/pin';

export function PinLock() {
  const { unlock, blockedForMs, failures } = usePin();
  const { signOut } = useAuth();
  const { t } = useTranslation();

  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  const blocked = blockedForMs > 0;

  // Verified on the last digit, so unlocking is four taps and nothing else.
  useEffect(() => {
    if (value.length !== PIN_LENGTH || checking || blocked) return;
    setChecking(true);
    void (async () => {
      const ok = await unlock(value);
      if (!ok) {
        setWrong(true);
        setValue('');
      }
      setChecking(false);
    })();
  }, [blocked, checking, unlock, value]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface-sunken px-6">
      <PotliLogo className="h-14 w-14" />
      <h1 className="mt-4 text-lg font-semibold text-ink">{t('pin.title')}</h1>

      <p
        className="mt-1 min-h-[20px] text-sm text-ink-muted"
        role={wrong || blocked ? 'alert' : undefined}
      >
        {blocked
          ? t('pin.waitSeconds', { seconds: Math.ceil(blockedForMs / 1000) })
          : wrong
            ? t('pin.wrong')
            : t('pin.subtitle')}
      </p>

      <div className="mt-8 w-full max-w-xs">
        <PinPad
          value={value}
          onChange={(next) => {
            setWrong(false);
            setValue(next);
          }}
          disabled={checking || blocked}
        />
      </div>

      {failures >= 2 ? (
        <Button
          variant="secondary"
          className="mt-10"
          onClick={() => void signOut()}
        >
          {t('pin.forgot')}
        </Button>
      ) : null}
    </div>
  );
}
