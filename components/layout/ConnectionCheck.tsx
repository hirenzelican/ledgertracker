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

interface ConnectionCheckProps {
  /**
   * What went wrong, which decides what the collapsed panel calls itself. On the login
   * form the question is "why can I not sign in"; on a loaded app whose data failed it is
   * "why is nothing here" - and telling someone already signed in that they have trouble
   * signing in reads as a different bug.
   */
  context?: 'sign-in' | 'loading';
}

export function ConnectionCheck({ context = 'sign-in' }: ConnectionCheckProps) {
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
        {context === 'loading'
          ? 'Nothing loading? Check the database'
          : 'Trouble signing in? Check the connection'}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-ink-faint">
          Confirms which Supabase project this build talks to, whether it answers, and
          whether its database has had the migrations run.
        </p>

        <Button variant="secondary" onClick={() => void run()} loading={running} loadingLabel="Checking...">
          Run check
        </Button>

        {result ? (
          <div
            className={`space-y-2 rounded-xl px-3 py-3 ${
              // A reachable host with an out-of-date database is still a failure, so it
              // must not come back in the same green as everything being fine.
              result.status === 'ok' && result.schema?.status !== 'ready'
                ? 'bg-returned-soft'
                : TONE[result.status]
            }`}
          >
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
              {result.schema ? (
                <div className="flex justify-between gap-3">
                  <dt>Database</dt>
                  <dd className="text-right text-ink">
                    {result.schema.status === 'ready' ? 'up to date' : 'out of date'}
                  </dd>
                </div>
              ) : null}
            </dl>

            {/* Listed individually only when something is wrong: knowing which object is
                missing is what turns "it does not work" into one migration to re-run. */}
            {result.schema && result.schema.status !== 'ready' ? (
              <ul className="space-y-0.5 text-ink-muted">
                {result.schema.objects.map((object) => (
                  <li key={object.name} className="flex justify-between gap-3">
                    <span className="font-mono text-xs">{object.name}</span>
                    <span className="text-right text-xs">
                      {object.ok ? 'present' : object.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-ink-muted">{result.advice}</p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
