/**
 * The screen lock.
 *
 * What this is for, stated plainly because the difference matters: Potli runs on a phone
 * that gets handed around a family, and a balance sheet of who owes whom is not something
 * you want a curious relative reading over chai. This locks the *screen* against that
 * person. It is not encryption. Your entries live in Postgres and are protected there by
 * your sign-in and by row level security; someone holding your unlocked, signed-in phone
 * and a debugger can still reach them, and no four digits stored on the same device could
 * honestly change that.
 *
 * Given that, the PIN is still never stored. What is kept is a PBKDF2-SHA256 hash over a
 * random per-device salt, so the stored record does not hand the number to anyone reading
 * localStorage. A four-digit PIN has ten thousand possibilities and an attacker with the
 * record can grind all of them offline whatever the iteration count - which is why the
 * attempt throttling below, which they cannot bypass through the UI, is doing at least as
 * much of the work as the hash is.
 */

/** OWASP's floor for PBKDF2-SHA256, and about a tenth of a second on a mid-range phone. */
export const PBKDF2_ITERATIONS = 310_000;

/** Four, as on every lock screen anyone has already learned. Verified on the last digit. */
export const PIN_LENGTH = 4;

/** What gets written to storage. Versioned so the parameters can be raised later. */
export interface PinRecord {
  v: 1;
  /** Which signed-in account this belongs to; another account on the device has none. */
  userId: string;
  saltB64: string;
  hashB64: string;
  iterations: number;
}

export interface AttemptState {
  /** Consecutive failures since the last success. */
  failures: number;
  /** Epoch ms until which entry is refused, or 0. */
  blockedUntil: number;
}

export const NO_ATTEMPTS: AttemptState = { failures: 0, blockedUntil: 0 };

/** Wrong guesses allowed before the first wait. */
const FREE_ATTEMPTS = 4;

/**
 * How long a wait lasts after `failures` consecutive wrong entries.
 *
 * Doubling from half a minute, capped at five: long enough that working through ten
 * thousand possibilities by hand is not a thing anyone will sit and do, short enough that
 * a real owner who fumbled twice is not locked out of their own records for the evening.
 */
export function cooldownMs(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  const step = failures - FREE_ATTEMPTS - 1;
  return Math.min(30_000 * 2 ** step, 300_000);
}

/**
 * Whether this browser can hash a PIN at all.
 *
 * `crypto.subtle` only exists in a secure context. Potli is served over HTTPS, so this
 * is true everywhere it actually runs - but a lock that silently fails to be set is far
 * worse than one that is honestly not offered, so the setting hides itself instead.
 */
export function isPinSupported(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.importKey === 'function';
}

export function isDigits(pin: string, length = PIN_LENGTH): boolean {
  return new RegExp(`^\\d{${length}}$`).test(pin);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** Builds the record to store for a new PIN. The PIN itself goes nowhere else. */
export async function makePinRecord(pin: string, userId: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    v: 1,
    userId,
    saltB64: toBase64(salt),
    hashB64: await derive(pin, salt, PBKDF2_ITERATIONS),
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Whether an entered PIN matches the record.
 *
 * The comparison is constant-time. It is very probably pointless here - the attacker is
 * holding the device and can read the record directly - but a timing-variable compare in
 * a file about authentication is the kind of thing that gets copied somewhere it matters.
 */
export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const candidate = await derive(pin, fromBase64(record.saltB64), record.iterations);
  return timingSafeEqual(candidate, record.hashB64);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i += 1) differences |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differences === 0;
}

/** Parses a stored record, rejecting anything that is not one rather than trusting it. */
export function parsePinRecord(raw: string | null): PinRecord | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<PinRecord>;
    if (record.v !== 1) return null;
    if (typeof record.userId !== 'string' || record.userId === '') return null;
    if (typeof record.saltB64 !== 'string' || typeof record.hashB64 !== 'string') return null;
    if (typeof record.iterations !== 'number' || !Number.isFinite(record.iterations)) return null;
    return record as PinRecord;
  } catch {
    return null;
  }
}

export function parseAttempts(raw: string | null): AttemptState {
  if (raw === null) return NO_ATTEMPTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NO_ATTEMPTS;
    const state = parsed as Partial<AttemptState>;
    const failures = typeof state.failures === 'number' ? state.failures : 0;
    const blockedUntil = typeof state.blockedUntil === 'number' ? state.blockedUntil : 0;
    if (!Number.isFinite(failures) || !Number.isFinite(blockedUntil)) return NO_ATTEMPTS;
    return { failures: Math.max(0, Math.trunc(failures)), blockedUntil };
  } catch {
    return NO_ATTEMPTS;
  }
}

/** The state after one more wrong entry. */
export function afterFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  const wait = cooldownMs(failures);
  return { failures, blockedUntil: wait === 0 ? 0 : now + wait };
}

/** Milliseconds still to wait, or 0. */
export function remainingBlockMs(state: AttemptState, now: number): number {
  return Math.max(0, state.blockedUntil - now);
}
