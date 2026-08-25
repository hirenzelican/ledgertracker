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

export interface ConnectionDiagnostic {
  status: DiagnosticStatus;
  /** Host this build talks to, e.g. `abcdef.supabase.co`. */
  host: string | null;
  /** First and last few characters of the anon key, enough to compare by eye. */
  keyPreview: string | null;
  keyLength: number;
  summary: string;
  advice: string;
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
      return {
        status: 'ok',
        host,
        keyPreview: previewKey(supabaseAnonKey),
        keyLength: supabaseAnonKey.length,
        summary: `Reached ${host} and the key was accepted.`,
        advice:
          'The connection is fine. If signing in still fails, the message on the form is the real reason.',
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
