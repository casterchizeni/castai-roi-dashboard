'use client';

import { useMemo } from 'react';
import { formatISO } from 'date-fns';
import { detectBaselineDates, calculateBaselineMetrics } from '@/lib/castai/baseline';
import { calculateROI } from '@/lib/calculations/roi';
import { buildForecast } from '@/lib/calculations/forecast';
import { calculatePayback } from '@/lib/calculations/payback';
import type { Cluster, ClusterCostReport } from '@/types/castai';

export function useROI(
  cluster: Cluster | undefined,
  costReport: ClusterCostReport | undefined,
  monthlyFee = 0,
  comparisonEnd?: string        // if set, limits comparison to this date (default = today)
) {
  return useMemo(() => {
    if (!cluster || !costReport?.daily?.length) return null;

    // Baseline = all pre-CAST-AI data (createdAt → autoscaler enabled)
    const { baselineStart, baselineEnd } = detectBaselineDates(cluster);

    const baseline = calculateBaselineMetrics(costReport.daily, baselineStart, baselineEnd);

    const periodEnd = comparisonEnd ?? formatISO(new Date(), { representation: 'date' });

    // Only include days after the baseline window and up to periodEnd
    const comparisonData = costReport.daily.filter(
      (d) => d.date > baselineEnd && d.date <= periodEnd
    );

    const roi      = calculateROI(baseline, comparisonData, baselineEnd, periodEnd);
    const forecast = buildForecast(costReport.daily, baseline);
    const payback  = calculatePayback(roi.monthlySavings, monthlyFee, roi.monthsSinceBaseline, baselineStart);

    return { baseline, roi, forecast, payback };
  }, [cluster, costReport, monthlyFee, comparisonEnd]);
}
