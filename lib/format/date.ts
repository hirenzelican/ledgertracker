/**
 * Date helpers.
 *
 * Dates are plain calendar dates (`YYYY-MM-DD`), never timestamps, so a transaction
 * dated "25 Aug" stays on 25 Aug regardless of the device's timezone. All parsing is
 * done on the string itself rather than through `new Date(string)`, which would shift
 * the day for users behind UTC.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today in the device's local timezone, as `YYYY-MM-DD`. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `2026-08-25` -> `25 Aug 2026`. */
export function formatDisplayDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/** `2026-08-25` -> `25 Aug`, or `Today` / `Yesterday` when close by. */
export function formatRelativeDate(iso: string, today = todayIso()): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const suffix = year === today.slice(0, 4) ? '' : ` ${year}`;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month}${suffix}`;
}

export function addDays(iso: string, days: number): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First day of the month containing `iso`. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Last day of the month containing `iso`. */
export function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return `${iso.slice(0, 7)}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

/** Shifts a `YYYY-MM` month by `months`, keeping day 1. */
export function shiftMonth(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

/** `01 Aug 2026 – 25 Aug 2026`. */
export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatDisplayDate(startIso)} – ${formatDisplayDate(endIso)}`;
}
