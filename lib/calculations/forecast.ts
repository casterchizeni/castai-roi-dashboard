import { addDays, formatISO, parseISO } from 'date-fns';
import type { CostDataPoint, ForecastResult } from '@/types/castai';

/**
 * Builds honest 30 and 90 day cost forecasts.
 *
 * Philosophy: no made-up numbers.
 * - Uses weighted moving average of recent actual cost (last 30 days).
 * - Shows min/max range so the viewer understands variance.
 * - Does NOT extrapolate a "without CAST AI" fantasy line.
 * - Savings run rate comes from actual data (baseline delta or savings API).
 */
export function buildForecast(
  history: CostDataPoint[],
  baseline: { avgDailyCost: number },
): ForecastResult {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  // Use last 30 days (or whatever's available)
  const window = sorted.slice(-30);
  const costs = window.map((d) => d.totalCost).filter((c) => c > 0);
  const n = costs.length || 1;

  // Weighted average: more recent days count more
  // weights: 1, 2, 3, ..., n (linear ramp)
  const totalWeight = (n * (n + 1)) / 2;
  const weightedAvg = costs.reduce((sum, cost, i) => sum + cost * (i + 1), 0) / totalWeight;

  // Simple average for comparison
  const simpleAvg = costs.reduce((a, b) => a + b, 0) / n;

  // Use weighted avg as the primary forecast rate
  const avgDailyCost = weightedAvg || simpleAvg;

  // Min/max for range
  const minDailyCost = costs.length ? Math.min(...costs) : 0;
  const maxDailyCost = costs.length ? Math.max(...costs) : 0;

  // Forecasts
  const forecast30day = avgDailyCost * 30;
  const forecast90day = avgDailyCost * 90;
  const rangeLow30day = minDailyCost * 30;
  const rangeHigh30day = maxDailyCost * 30;

  // Savings run rate: use baseline delta if we have baseline data
  // Otherwise these stay at 0 — we don't guess
  const savingsPerDay = baseline.avgDailyCost > 0
    ? Math.max(0, baseline.avgDailyCost - avgDailyCost)
    : 0;
  const savingsRunRate30day = savingsPerDay * 30;
  const savingsRunRate90day = savingsPerDay * 90;

  // Daily forecast data points
  const lastDate = sorted[sorted.length - 1]?.date
    ? parseISO(sorted[sorted.length - 1].date)
    : new Date();

  const dailyForecasts = Array.from({ length: 90 }, (_, i) => {
    const date = formatISO(addDays(lastDate, i + 1), { representation: 'date' });
    return {
      date,
      cost: +avgDailyCost.toFixed(2),
      low: +minDailyCost.toFixed(2),
      high: +maxDailyCost.toFixed(2),
    };
  });

  return {
    forecast30day,
    forecast90day,
    rangeLow30day,
    rangeHigh30day,
    avgDailyCost,
    minDailyCost,
    maxDailyCost,
    dataPointsUsed: costs.length,
    savingsRunRate30day,
    savingsRunRate90day,
    dailyForecasts,
    // backward compat
    withoutCastAI30day: 0,
    withoutCastAI90day: 0,
    trendSlope: 0,
  };
}
