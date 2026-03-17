import type { CostDataPoint } from '@/types/castai';

export interface OutlierAnalysis {
  outlierDates: string[];
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  cleanedAvgDailyCost: number;
  rawAvgDailyCost: number;
  outlierImpactPct: number;  // how much outliers skew the average (%)
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Detect outlier days in baseline cost data using IQR method.
 * Returns null if fewer than minPoints data points (not enough for meaningful detection).
 */
export function detectBaselineOutliers(
  dataPoints: CostDataPoint[],
  iqrMultiplier = 1.5,
  minPoints = 7,
): OutlierAnalysis | null {
  if (dataPoints.length < minPoints) return null;

  const costs = dataPoints.map((d) => d.totalCost).sort((a, b) => a - b);
  const q1 = percentile(costs, 25);
  const q3 = percentile(costs, 75);
  const iqr = q3 - q1;
  const lowerFence = q1 - iqrMultiplier * iqr;
  const upperFence = q3 + iqrMultiplier * iqr;

  const outlierDates: string[] = [];
  let cleanedSum = 0;
  let cleanedCount = 0;
  let rawSum = 0;

  for (const d of dataPoints) {
    rawSum += d.totalCost;
    if (d.totalCost < lowerFence || d.totalCost > upperFence) {
      outlierDates.push(d.date);
    } else {
      cleanedSum += d.totalCost;
      cleanedCount++;
    }
  }

  const rawAvgDailyCost = rawSum / dataPoints.length;
  const cleanedAvgDailyCost = cleanedCount > 0 ? cleanedSum / cleanedCount : rawAvgDailyCost;
  const outlierImpactPct =
    rawAvgDailyCost > 0
      ? Math.abs((rawAvgDailyCost - cleanedAvgDailyCost) / rawAvgDailyCost) * 100
      : 0;

  // Only return analysis if outliers were actually found
  if (outlierDates.length === 0) return null;

  return {
    outlierDates,
    q1,
    q3,
    iqr,
    lowerFence,
    upperFence,
    cleanedAvgDailyCost,
    rawAvgDailyCost,
    outlierImpactPct,
  };
}
