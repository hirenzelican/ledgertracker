'use client';

/**
 * Turning the screen lock on, changing it, and turning it off.
 *
 * Setting one asks twice, because a PIN you mistyped into a lock you cannot open is a
 * sign-out and a fresh start. Changing one asks for the old first. Removing one asks for
 * it too - otherwise a lock could be lifted by anyone already looking at an unlocked
 * phone, which is precisely the person it was put there for.
 *
 * The description says what this does and does not do. Someone deciding whether four
 * digits is enough for their situation deserves to know it is a screen lock rather than
 * encryption, in the place where they are making the decision.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { PinPad } from '@/components/security/PinPad';
import { usePin } from '@/components/providers/PinProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { PIN_LENGTH } from '@/lib/security/pin';

/** Which PIN the pad is currently collecting. */
type Step = 'current' | 'choose' | 'confirm';

type Flow = 'set' | 'change' | 'remove';

export function PinSettings() {
  const { hasPin, supported, setPin, removePin, unlock, lockNow } = usePin();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [value, setValue] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = (next: Flow) => {
    setFlow(next);
    setStep(next === 'set' ? 'choose' : 'current');
    setValue('');
    setFirst('');
    setError(null);
  };

  const close = () => {
    setFlow(null);
    setValue('');
    setFirst('');
    setError(null);
  };

  const advance = async (entered: string) => {
    setBusy(true);
    setError(null);
    try {
      if (step === 'current') {
        // Reuses the same check the lock screen makes, cooldown and all, so hammering
        // guesses here is no cheaper than hammering them there.
        if (!(await unlock(entered))) {
          setError(t('pin.wrong'));
          setValue('');
          return;
        }
        if (flow === 'remove') {
          removePin();
          close();
          showToast({ tone: 'success', title: t('pin.removed') });
          return;
        }
        setStep('choose');
        setValue('');
        return;
      }

      if (step === 'choose') {
        setFirst(entered);
        setStep('confirm');
        setValue('');
        return;
      }

      if (entered !== first) {
        setError(t('pin.mismatch'));
        setStep('choose');
        setFirst('');
        setValue('');
        return;
      }

      await setPin(entered);
      close();
      showToast({ tone: 'success', title: t('pin.saved') });
    } finally {
      setBusy(false);
    }
  };

  const onChange = (next: string) => {
    setValue(next);
    setError(null);
    if (next.length === PIN_LENGTH) void advance(next);
  };

  // Offered only where it can actually work. See `isPinSupported`.
  if (!supported) return null;

  const heading =
    step === 'current' ? t('pin.enterCurrent') : step === 'choose' ? t('pin.choose') : t('pin.again');

  return (
    <>
      <div>
        <p className="field-label">{t('pin.settingsLabel')}</p>
        <p className="mb-2.5 text-sm text-ink-muted">{t('pin.settingsBody')}</p>

        {hasPin ? (
          <div className="space-y-2.5">
            <Button variant="secondary" size="lg" className="w-full" onClick={() => start('change')}>
              {t('pin.change')}
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => start('remove')}>
              {t('pin.remove')}
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={lockNow}>
              {t('pin.lockNow')}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="lg" className="w-full" onClick={() => start('set')}>
            {t('pin.set')}
          </Button>
        )}
      </div>

      <Sheet open={flow !== null} title={heading} onClose={close} dismissible={!busy}>
        <div className="pb-2">
          <p className="mb-6 min-h-[20px] text-center text-sm text-ink-muted" role={error ? 'alert' : undefined}>
            {error ?? (step === 'confirm' ? t('pin.againHint') : t('pin.chooseHint'))}
          </p>
          <PinPad value={value} onChange={onChange} disabled={busy} />
        </div>
      </Sheet>
    </>
  );
}
