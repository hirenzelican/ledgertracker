'use client';

/**
 * Connection diagnostics for the login screen.
 *
 * When a sign-in fails at the network level the browser deliberately hides why: a
 * blocked response and an unreachable host both surface as `TypeError: Failed to fetch`.
 * This check tells the two apart, and shows which project the build is actually pointed
 * at - the values are compiled in at build time, so they cannot be inspected any other
 * way from a phone.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type DiagnosticStatus = 'ok' | 'rejected' | 'unreachable' | 'unconfigured';

/** Whether the database has the views and function this build reads through. */
export type SchemaStatus = 'ready' | 'missing' | 'unknown';

export interface SchemaDiagnostic {
  status: SchemaStatus;
  summary: string;
  advice: string;
  /** Each object the app depends on, and what the server said about it. */
  objects: { name: string; ok: boolean; detail: string }[];
}

export interface ConnectionDiagnostic {
  status: DiagnosticStatus;
  /** Host this build talks to, e.g. `abcdef.supabase.co`. */
  host: string | null;
  /** First and last few characters of the anon key, enough to compare by eye. */
  keyPreview: string | null;
  keyLength: number;
  summary: string;
  advice: string;
  /** Present once the connection itself is known to work. */
  schema?: SchemaDiagnostic;
}

/**
 * Asks the database whether the objects this build reads through actually exist.
 *
 * The app reads balances and history through views created by a migration, so a build
 * pointed at a database that has not had that migration run comes up looking empty with
 * no obvious cause. This tells the two apart, and does it without signing in - which
 * works because of what the two failures look like from outside:
 *
 *   401 / permission denied  the object exists and anon is correctly refused - correct
 *   404 / PGRST205           PostgREST has never heard of it - migration not run, or its
 *                            schema cache has not reloaded since
 *
 * So being refused is the passing case here. That reads oddly, and is the whole point.
 */
async function checkSchema(baseUrl: string, anonKey: string): Promise<SchemaDiagnostic> {
  const paths = [
    { name: 'person_balances', url: `${baseUrl}/rest/v1/person_balances?select=id&limit=1` },
    { name: 'transaction_ledger', url: `${baseUrl}/rest/v1/transaction_ledger?select=id&limit=1` },
    { name: 'ledger_summary', url: `${baseUrl}/rest/v1/rpc/ledger_summary` },
  ];

  const objects: SchemaDiagnostic['objects'] = [];
  for (const { name, url } of paths) {
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(anonKey)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      // 404 is the only answer that means "not there". Anything else - refused, bad
      // method, empty result - proves PostgREST knows the object.
      const known = response.status !== 404;
      objects.push({
        name,
        ok: known,
        detail: known ? `present (HTTP ${response.status})` : 'not found (HTTP 404)',
      });
    } catch {
      objects.push({ name, ok: false, detail: 'request failed' });
    }
  }

  const missing = objects.filter((object) => !object.ok);
  if (missing.length === 0) {
    return {
      status: 'ready',
      objects,
      summary: 'The database has everything this build reads through.',
      advice: 'Balances, history and statements will all load once you sign in.',
    };
  }

  return {
    status: 'missing',
    objects,
    summary: `The database is missing ${missing.map((object) => object.name).join(', ')}.`,
    advice:
      'Run supabase/migrations/20260830010000_server_side_paging.sql in the Supabase SQL editor. If you have already run it, PostgREST may still be serving a cached schema: run "notify pgrst, \'reload schema\';" and check again.',
  };
}

/** Masks the middle of the key. It is a public value, but there is no need to show it whole. */
function previewKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export async function checkSupabaseConnection(): Promise<ConnectionDiagnostic> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      status: 'unconfigured',
      host: null,
      keyPreview: null,
      keyLength: supabaseAnonKey?.length ?? 0,
      summary: 'This build has no Supabase URL or key compiled into it.',
      advice:
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your host, then redeploy.',
    };
  }

  let host: string;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    return {
      status: 'unconfigured',
      host: supabaseUrl,
      keyPreview: previewKey(supabaseAnonKey),
      keyLength: supabaseAnonKey.length,
      summary: 'The configured Supabase URL is not a valid address.',
      advice: 'It should look like https://your-project-ref.supabase.co with no trailing slash.',
    };
  }

  // Underscores are not legal in hostnames, so their presence means something other than
  // a hostname ended up in the URL - almost always the key pasted onto the end of it.
  if (/[^a-z0-9.\-]/i.test(host)) {
    return {
      status: 'unconfigured',
      host,
      keyPreview: previewKey(supabaseAnonKey),
      keyLength: supabaseAnonKey.length,
      summary: 'The Supabase URL contains characters that cannot appear in a hostname.',
      advice:
        'The URL and the key have probably been pasted into the same field. NEXT_PUBLIC_SUPABASE_URL should be only https://your-ref.supabase.co, with the key in NEXT_PUBLIC_SUPABASE_ANON_KEY. Fix both and redeploy.',
    };
  }

  // The key goes in the query string on purpose: a plain GET with no custom headers
  // avoids a CORS preflight, so a failure here means the request truly did not land.
  const target = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/health?apikey=${encodeURIComponent(
    supabaseAnonKey,
  )}`;

  try {
    const response = await fetch(target, { method: 'GET', cache: 'no-store' });
    if (response.ok) {
      // Only worth asking about the schema once the host is known to answer at all.
      const schema = await checkSchema(supabaseUrl.replace(/\/$/, ''), supabaseAnonKey);
      return {
        status: 'ok',
        host,
        keyPreview: previewKey(supabaseAnonKey),
        keyLength: supabaseAnonKey.length,
        schema,
        summary:
          schema.status === 'ready'
            ? `Reached ${host}, the key was accepted, and the database is up to date.`
            : `Reached ${host} and the key was accepted, but the database is out of date.`,
        advice:
          schema.status === 'ready'
            ? 'The connection is fine. If signing in still fails, the message on the form is the real reason.'
            : schema.advice,
      };
    }
    return {
      status: 'rejected',
      host,
      keyPreview: previewKey(supabaseAnonKey),
      keyLength: supabaseAnonKey.length,
      summary: `Reached ${host}, but it refused the key (HTTP ${response.status}).`,
      advice:
        'Copy the anon / public key again from Project Settings → API, replace it in your host and redeploy.',
    };
  } catch {
    return {
      status: 'unreachable',
      host,
      keyPreview: previewKey(supabaseAnonKey),
      keyLength: supabaseAnonKey.length,
      summary: `Could not reach ${host} at all.`,
      advice:
        'Check that host matches your Supabase project, that the project is not paused, and that no ad blocker or private-browsing shield is blocking it.',
    };
  }
}
