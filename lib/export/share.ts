/**
 * Plain-text summaries meant to be sent to the other person.
 *
 * The point of sharing is to replace "I think you owe me" with a list both people can
 * read, so the message leads with the one sentence that settles it and then shows the
 * working. WhatsApp renders `*text*` as bold and nothing else reliably, so that is the
 * only formatting used.
 */

import { describePersonBalance } from '@/lib/calculations/balance';
import { formatRupees, amountToPaise } from '@/lib/calculations/money';
import { formatDateRange, formatDisplayDate } from '@/lib/format/date';
import type { Translate } from '@/lib/i18n/locales';
import type { StatementSummary } from '@/lib/calculations/balance';
import type { Person, TransactionWithBalance } from '@/types/transaction';

/** Beyond this the message becomes a wall of text nobody reads on a phone. */
export const MAX_SHARED_LINES = 20;

function entryLine(entry: TransactionWithBalance, t: Translate): string {
  const { transaction } = entry;
  const sign = entry.deltaPaise > 0 ? '+' : '−';
  const amount = formatRupees(amountToPaise(transaction.amount));
  const what = t(`type.${transaction.type}.short`);
  const method = t(`method.${transaction.method}.short`);
  const note = transaction.note ? ` · ${transaction.note}` : '';
  return `${formatDisplayDate(transaction.transaction_date, t)} · ${sign} ${amount} · ${what} · ${method}${note}`;
}

/**
 * Trims the list to something readable, keeping the most recent and saying how many were
 * left out rather than silently dropping them.
 */
function entryLines(entries: readonly TransactionWithBalance[], t: Translate): string[] {
  const shown = entries.slice(0, MAX_SHARED_LINES);
  const lines = shown.map((entry) => entryLine(entry, t));
  if (entries.length > shown.length) {
    lines.push(t('share.more', { count: entries.length - shown.length }));
  }
  return lines;
}

/** Everything standing between you and one person, as of today. */
export function buildContactShareText(
  person: Person,
  balancePaise: number,
  moneyInPaise: number,
  moneyOutPaise: number,
  /** Newest first, as the screens hold them. */
  entries: readonly TransactionWithBalance[],
  today: string,
  t: Translate,
): string {
  const parts = [
    `*${describePersonBalance(person.name, balancePaise, t)}*`,
    t('share.asOf', { date: formatDisplayDate(today, t) }),
  ];

  if (entries.length > 0) {
    parts.push('', ...entryLines(entries, t));
    parts.push(
      '',
      t('history.summary', {
        in: formatRupees(moneyInPaise),
        out: formatRupees(moneyOutPaise),
      }),
    );
  }

  parts.push('', `— ${t('app.name')}`);
  return parts.join('\n');
}

/** A statement for a date range, for one person or for everyone. */
export function buildStatementShareText(
  statement: StatementSummary,
  personName: string | null,
  t: Translate,
): string {
  const heading = personName
    ? t('statement.forPerson', { name: personName })
    : t('statement.forEveryone');

  const parts = [
    `*${heading}*`,
    formatDateRange(statement.startDate, statement.endDate, t),
    '',
    `${t('statement.opening')}: ${formatRupees(statement.openingBalancePaise)}`,
    `${t('statement.moneyIn')}: + ${formatRupees(statement.receivedPaise)}`,
    `${t('statement.moneyOut')}: − ${formatRupees(statement.returnedPaise)}`,
    `*${t('statement.closing')}: ${formatRupees(statement.closingBalancePaise)}*`,
  ];

  if (statement.entries.length > 0) {
    // The statement holds entries oldest-first; a reader wants the latest at the top.
    parts.push('', ...entryLines([...statement.entries].reverse(), t));
  }

  parts.push('', `— ${t('app.name')}`);
  return parts.join('\n');
}
