'use client';

/**
 * A small, collapsed panel on the login screen. It exists because the Supabase URL and
 * key are compiled into the bundle: when sign-in fails there is otherwise no way, from
 * the phone the app runs on, to see which project the build is talking to.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { checkSupabaseConnection, type ConnectionDiagnostic } from '@/lib/supabase/diagnostics';

const TONE: Record<ConnectionDiagnostic['status'], string> = {
  ok: 'bg-received-soft',
  rejected: 'bg-returned-soft',
  unreachable: 'bg-returned-soft',
  unconfigured: 'bg-returned-soft',
};

export function ConnectionCheck() {
  const [result, setResult] = useState<ConnectionDiagnostic | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await checkSupabaseConnection());
    } finally {
      setRunning(false);
    }
  };

  return (
    <details className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer list-none font-medium text-ink-muted">
        Trouble signing in? Check the connection
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-ink-faint">
          Confirms which Supabase project this build talks to, and whether it answers.
        </p>

        <Button variant="secondary" onClick={() => void run()} loading={running} loadingLabel="Checking...">
          Run check
        </Button>

        {result ? (
          <div className={`space-y-2 rounded-xl px-3 py-3 ${TONE[result.status]}`}>
            <p className="font-medium text-ink">{result.summary}</p>
            <dl className="space-y-1 text-ink-muted">
              <div className="flex justify-between gap-3">
                <dt>Project host</dt>
                <dd className="break-all text-right text-ink">{result.host ?? 'not set'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Anon key</dt>
                <dd className="break-all text-right text-ink">
                  {result.keyPreview ?? 'not set'}
                  {result.keyLength > 0 ? ` (${result.keyLength} chars)` : ''}
                </dd>
              </div>
            </dl>
            <p className="text-ink-muted">{result.advice}</p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
