/**
 * Money handling.
 *
 * Every calculation in this app is done on integers representing paise
 * (1 rupee = 100 paise). Rupee values only ever exist as decimal *strings* at the
 * database boundary and as formatted text in the UI. `parseFloat` is never used for
 * arithmetic, so `0.1 + 0.2` style rounding drift cannot reach the ledger.
 */

/** Largest amount the app accepts: NUMERIC(12,2) tops out below 10^10 rupees. */
export const MAX_AMOUNT_PAISE = 9_999_999_999_99; // ₹99,99,99,999.99

/**
 * Parses a stored amount into paise.
 *
 * PostgREST serialises a Postgres `numeric` with `to_json`, which produces an unquoted
 * JSON number - so `amount` reaches the browser as a JS number, not a string. Backups
 * and hand-written JSON may carry either form. Numbers are routed through their shortest
 * round-tripping decimal representation rather than multiplied by 100, so no binary
 * floating-point error can enter the ledger. Amounts here are capped well below the
 * point where JS switches to exponent notation, so that representation is always plain
 * decimal.
 */
export function amountToPaise(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Not a valid amount: ${value}`);
    }
    return amountToPaise(String(value));
  }

  const trimmed = value.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Not a valid decimal amount: ${JSON.stringify(value)}`);
  }
  const [, sign, whole = '0', fractionRaw] = match;
  // Pad/truncate the fraction to exactly two digits, rounding half-up on the third.
  const fraction = (fractionRaw ?? '').padEnd(3, '0');
  const paise =
    Number(whole) * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Amount out of range: ${value}`);
  }
  return sign === '-' ? -paise : paise;
}

/** Renders paise as the plain decimal string Postgres NUMERIC(12,2) expects. */
export function paiseToRupeeString(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${rupees}.${fraction}`;
}

/**
 * Parses free-form user input ("1250", "1,250.5", "₹1250.50") into paise.
 * Returns null when the input is not a well-formed amount.
 */
export function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*(?:\.\d{0,2})?$/.test(cleaned)) return null;
  if (!/\d/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) return null;
  return paise;
}

const INDIAN_NUMBER_FORMAT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats paise using the Indian digit grouping: ₹1,00,000.00.
 * Paise are dropped when the amount is a whole number of rupees, which is the
 * common case and keeps the dashboard readable (₹13,000 rather than ₹13,000.00).
 */
export function formatRupees(paise: number, options: { alwaysShowPaise?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const showPaise = options.alwaysShowPaise === true || remainder !== 0;
  const formatted = showPaise
    ? INDIAN_NUMBER_FORMAT.format(rupees + remainder / 100)
    : new Intl.NumberFormat('en-IN').format(rupees);
  return `${negative ? '-' : ''}₹${formatted}`;
}

/** Formats paise with an explicit `+` / `−` sign, for transaction rows. */
export function formatSignedRupees(paise: number, type: 'RECEIVED' | 'RETURNED'): string {
  return `${type === 'RECEIVED' ? '+' : '−'} ${formatRupees(Math.abs(paise))}`;
}

/** Plain digits-and-dot rendering for CSV / JSON export. */
export function paiseToExportString(paise: number): string {
  return paiseToRupeeString(paise);
}
