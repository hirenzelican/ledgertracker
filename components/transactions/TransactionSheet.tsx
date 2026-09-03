'use client';

/**
 * Connects the transaction form to the ledger: saves, reports the new balance and
 * closes. Used by both the dashboard quick actions and the history screen's edit flow.
 */

import { Sheet } from '@/components/ui/Sheet';
import { TransactionForm } from '@/components/forms/TransactionForm';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import {
  amountToPaise,
  formatRupees,
  paiseToRupeeString,
  stripTrailingPaise,
} from '@/lib/calculations/money';
import { describePersonBalance, settlementFor } from '@/lib/calculations/balance';
import type { Transaction, TransactionInput, TransactionType } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

export type SheetMode =
  | { kind: 'create'; type: TransactionType; personId?: string }
  /** Clearing what is outstanding with one person; see `settleMode` below. */
  | SettleMode
  | { kind: 'edit'; transaction: Transaction };

export interface SettleMode {
  kind: 'settle';
  personId: string;
  type: TransactionType;
  amountPaise: number;
}

/**
 * The sheet that settles up with someone, or null when there is nothing to settle.
 *
 * Both halves of the offer - whether to show it at all, and what it should say - come
 * from this one call, so a screen cannot end up with a "settle ₹1,500" button that opens
 * a form for a different figure. The direction and amount are a snapshot taken when the
 * button is drawn: if the balance changes underneath, the open form keeps the numbers
 * the user was shown rather than silently rewriting itself mid-edit.
 */
export function settleMode(personId: string, balancePaise: number): SettleMode | null {
  const settlement = settlementFor(balancePaise);
  return settlement === null ? null : { kind: 'settle', personId, ...settlement };
}

interface TransactionSheetProps {
  mode: SheetMode | null;
  onClose: () => void;
}

export type { SheetMode as TransactionSheetMode };

export function TransactionSheet({ mode, onClose }: TransactionSheetProps) {
  const { addTransaction, editTransaction, balanceIfApplied, people } = useLedger();
  const { showToast } = useToast();
  const { t } = useTranslation();

  if (!mode) return null;

  const isEdit = mode.kind === 'edit';
  const isSettle = mode.kind === 'settle';
  const previous = isEdit ? mode.transaction : null;
  const type = isEdit ? mode.transaction.type : mode.type;
  const personId = mode.kind === 'edit' ? mode.transaction.person_id : mode.personId;
  const personName = people.find((person) => person.id === personId)?.name ?? '';

  // The row being edited has to come back out of the balance before the new one goes in,
  // and only when it belonged to this person - moving a transaction to someone else
  // leaves the new person's balance untouched by the old row.
  const excludeFor = (personId: string) =>
    previous && previous.person_id === personId
      ? { type: previous.type, amountPaise: amountToPaise(previous.amount) }
      : undefined;

  // For a new transaction this is that person's current balance; for an edit it is their
  // balance with the edited transaction taken back out, which is what the guard uses.
  const balanceForPerson = (personId: string) =>
    balanceIfApplied(personId, { exclude: excludeFor(personId) });

  const title = isEdit
    ? t('form.editTitle')
    : isSettle
      ? t('settle.title')
      : t(`type.${type}.action`);

  const submitLabel = isEdit
    ? t('form.saveChanges')
    : isSettle
      ? t('settle.save')
      : t('form.save');

  /**
   * Settling says what it is about to do in words, because the entry it writes is the
   * one people pick wrongly by hand: money coming back from a loan is "they paid back",
   * not "I gave back". It also says outright that a smaller number is allowed - a part
   * payment is the common case, and a pre-filled amount otherwise reads as fixed.
   */
  const intro = isSettle
    ? t(type === 'RETURNED' ? 'settle.introHolding' : 'settle.introOwed', {
        name: personName,
        amount: formatRupees(mode.amountPaise),
      })
    : undefined;

  const handleSubmit = async (input: TransactionInput, options?: { force?: boolean }) => {
    const newBalancePaise = balanceIfApplied(input.person_id, {
      exclude: excludeFor(input.person_id),
      include: { type: input.type, amountPaise: input.amountPaise },
    });

    const mutationOptions = { allowUnusual: options?.force === true };
    const result = isEdit
      ? await editTransaction(mode.transaction, input, mutationOptions)
      : await addTransaction(input, mutationOptions);

    if (!result.ok) {
      return { ok: false, message: result.message, overridable: result.overridable };
    }

    showToast({
      tone: 'success',
      title: `${formatRupees(input.amountPaise)} · ${t(`type.${input.type}.short`)}`,
      description: describePersonBalance(
        people.find((person) => person.id === input.person_id)?.name ?? '',
        newBalancePaise,
        t,
      ),
    });
    onClose();
    return { ok: true };
  };

  return (
    <Sheet open title={title} onClose={onClose}>
      <TransactionForm
        key={isEdit ? mode.transaction.id : `new-${mode.kind}-${type}-${personId ?? ''}`}
        type={type}
        allowTypeChange={isEdit}
        initial={isEdit ? mode.transaction : undefined}
        submitLabel={submitLabel}
        balanceForPerson={balanceForPerson}
        initialPersonId={isEdit ? undefined : mode.personId}
        initialAmount={
          // Integer paise all the way to the field: dividing by 100 to make the string
          // would be the one float in the app that touches an amount.
          isSettle ? stripTrailingPaise(paiseToRupeeString(mode.amountPaise)) : undefined
        }
        intro={intro}
        lockedPersonName={isSettle ? personName : undefined}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Sheet>
  );
}
