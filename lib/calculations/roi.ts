import { differenceInMonths, parseISO } from 'date-fns';
import type { BaselineMetrics, CostDataPoint, ROIResult } from '@/types/castai';

/**
 * Calculates expected cost based on baseline per-unit rates × current usage.
 * Uses separated CPU and RAM rates — no unit mixing.
 */
export function calculateExpectedCost(
  baseline: BaselineMetrics,
  currentCpuHours: number,
  currentMemGbHours: number
): number {
  return (
    baseline.costPerCpuHour * currentCpuHours +
    baseline.costPerGbHour * currentMemGbHours
  );
}

/**
 * Calculates ROI over a given period using baseline rates and actual costs.
 * When usage data is unavailable, skips expected cost calculation entirely
 * rather than guessing with circular math.
 */
export function calculateROI(
  baseline: BaselineMetrics,
  periodDataPoints: CostDataPoint[],
  periodStart: string,
  periodEnd: string
): ROIResult {
  const actualCost = periodDataPoints.reduce((s, p) => s + p.totalCost, 0);
  const totalCpuHours = periodDataPoints.reduce((s, p) => s + (p.cpuHours ?? 0), 0);
  const totalMemGbHours = periodDataPoints.reduce((s, p) => s + (p.memoryGbHours ?? 0), 0);

  let expectedCost: number;

  if (totalCpuHours > 0 || totalMemGbHours > 0) {
    // Real usage data available — project what it would cost at baseline rates
    expectedCost = calculateExpectedCost(baseline, totalCpuHours, totalMemGbHours);
  } else {
    // No usage data — fall back to daily rate extrapolation
    const days = periodDataPoints.length || 1;
    expectedCost = baseline.avgDailyCost * days;
  }

  const totalSavings = expectedCost - actualCost;
  const roiPercent = expectedCost > 0 ? (totalSavings / expectedCost) * 100 : 0;

  const monthsSinceBaseline = Math.max(
    differenceInMonths(parseISO(periodEnd), parseISO(baseline.startDate)),
    1
  );

  return {
    baselineMetrics: baseline,
    currentPeriod: {
      startDate: periodStart,
      endDate: periodEnd,
      actualCost,
      expectedCost,
    },
    totalSavings,
    roiPercent,
    monthlySavings: totalSavings / monthsSinceBaseline,
    monthsSinceBaseline,
  };
}
