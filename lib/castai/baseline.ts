import { parseISO, formatISO } from 'date-fns';
import type { Cluster, BaselineMetrics, CostDataPoint } from '@/types/castai';

/**
 * Determines the baseline start and end dates from cluster metadata.
 *
 * Baseline = the ENTIRE pre-CAST-AI period:
 *   start = cluster createdAt (when it was onboarded)
 *   end   = when CAST AI first acted (autoscaler / WA enabled)
 *
 * This uses ALL available data before optimisation began — no arbitrary
 * 7-day window or stabilisation offset.
 */
export function detectBaselineDates(
  cluster: Partial<Cluster>,
): { baselineStart: string; baselineEnd: string } {
  const createdAt = cluster.createdAt
    ? parseISO(cluster.createdAt)
    : new Date();

  // When did CAST AI start acting? Use the earliest enablement date.
  const candidates = [
    cluster.workloadAutoscalerEnabledAt,
    cluster.autoscalerEnabledAt,
  ]
    .filter(Boolean)
    .map((d) => parseISO(d!));

  // If no enablement date, fall back to createdAt (no baseline available)
  const castaiStart =
    candidates.length > 0
      ? new Date(Math.min(...candidates.map((d) => d.getTime())))
      : createdAt;

  return {
    baselineStart: formatISO(createdAt, { representation: 'date' }),
    baselineEnd: formatISO(castaiStart, { representation: 'date' }),
  };
}

/**
 * Calculates per-unit rates from ALL cost data points in the baseline window.
 * Uses every available day between baselineStart and baselineEnd.
 */
export function calculateBaselineMetrics(
  dataPoints: CostDataPoint[],
  baselineStart: string,
  baselineEnd: string
): BaselineMetrics {
  const start = parseISO(baselineStart);
  const end = parseISO(baselineEnd);

  const windowPoints = dataPoints.filter((dp) => {
    const d = parseISO(dp.date);
    return d >= start && d <= end;
  });

  if (windowPoints.length === 0) {
    // No data in the pre-CAST window — fall back to the earliest available data.
    // This handles clusters that were onboarded with CAST AI from the start.
    const sorted = [...dataPoints].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const earliest = sorted.slice(0, 7); // use first week as rough baseline
    return computeMetrics(
      earliest,
      earliest[0]?.date ?? baselineStart,
      earliest[earliest.length - 1]?.date ?? baselineEnd
    );
  }

  return computeMetrics(windowPoints, baselineStart, baselineEnd);
}

function computeMetrics(
  points: CostDataPoint[],
  startDate: string,
  endDate: string
): BaselineMetrics {
  const totalCost = points.reduce((s, p) => s + (p.totalCost ?? 0), 0);
  const totalCpuCost = points.reduce((s, p) => s + (p.cpuCost ?? 0), 0);
  const totalRamCost = points.reduce((s, p) => s + (p.ramCost ?? 0), 0);
  const totalCpuHours = points.reduce((s, p) => s + (p.cpuHours ?? 0), 0);
  const totalMemGbHours = points.reduce((s, p) => s + (p.memoryGbHours ?? 0), 0);
  const n = points.length || 1;

  // Separate CPU and RAM rates — no mixing of units
  let costPerCpuHour: number;
  let costPerGbHour: number;

  if (totalCpuHours > 0 && totalCpuCost > 0) {
    costPerCpuHour = totalCpuCost / totalCpuHours;
  } else if (totalCpuHours > 0) {
    // No per-resource cost split available — use proportional estimate (70% CPU)
    costPerCpuHour = (totalCost * 0.7) / totalCpuHours;
  } else {
    costPerCpuHour = 0;
  }

  if (totalMemGbHours > 0 && totalRamCost > 0) {
    costPerGbHour = totalRamCost / totalMemGbHours;
  } else if (totalMemGbHours > 0) {
    // No per-resource cost split available — use proportional estimate (30% RAM)
    costPerGbHour = (totalCost * 0.3) / totalMemGbHours;
  } else {
    costPerGbHour = 0;
  }

  return {
    startDate,
    endDate,
    avgDailyCost: totalCost / n,
    costPerCpuHour,
    costPerGbHour,
    totalCpuHours,
    totalMemoryGbHours: totalMemGbHours,
    avgNodeCount: 0, // filled in by caller with node metrics
  };
}
