/**
 * Month-by-month figures for the trends screen.
 *
 * A trend over years is exactly the query that would undo paging if it were done in the
 * browser: it needs every row, and returns twelve numbers. So it stays in the database.
 */

import { getSupabaseClient } from './client';
import { amountToPaise } from '@/lib/calculations/money';
import type { MonthlyTotal } from '@/types/transaction';

export async function fetchMonthlyTotals(
  personId: string | null,
  months: number,
): Promise<MonthlyTotal[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('monthly_totals', {
    p_person: personId,
    p_months: months,
  });
  if (error) throw error;

  return ((data ?? []) as {
    month: string;
    money_in: string | number;
    money_out: string | number;
    closing_balance: string | number;
  }[]).map((row) => ({
    month: row.month,
    moneyInPaise: amountToPaise(row.money_in),
    moneyOutPaise: amountToPaise(row.money_out),
    closingBalancePaise: amountToPaise(row.closing_balance),
  }));
}
