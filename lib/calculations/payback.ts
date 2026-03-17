import { addMonths, formatISO } from 'date-fns';
import type { PaybackResult } from '@/types/castai';

/**
 * Calculates CAST AI ROI payback period.
 */
export function calculatePayback(
  monthlySavings: number,
  monthlyFee: number,
  monthsSinceBaseline: number,
  baselineDate: string
): PaybackResult {
  const paybackMonths = monthlySavings > 0 ? monthlyFee / monthlySavings : Infinity;

  const breakEvenDate =
    paybackMonths === Infinity
      ? 'N/A'
      : formatISO(addMonths(new Date(baselineDate), Math.ceil(paybackMonths)), {
          representation: 'date',
        });

  const netSavingsToDate = monthlySavings * monthsSinceBaseline - monthlyFee * monthsSinceBaseline;

  return {
    monthlyFee,
    monthlySavings,
    paybackMonths: isFinite(paybackMonths) ? paybackMonths : -1,
    breakEvenDate,
    netSavingsToDate,
  };
}
