import type { CostDataPoint } from '@/types/castai';

export interface DataGap {
  startDate: string;
  endDate: string;
  durationDays: number;
  position: 'start' | 'middle' | 'end';
}

export interface GapAnalysis {
  gaps: DataGap[];
  totalMissingDays: number;
  coveragePct: number;        // days with data / expected days × 100
  dataFreshnessDays: number;  // days since most recent data point
  lastDataDate: string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Detect gaps in daily cost data.
 * Walks day-by-day from rangeStart to rangeEnd (inclusive).
 * Missing dates are grouped into contiguous gap segments.
 */
export function detectDataGaps(
  dataPoints: CostDataPoint[],
  rangeStart: string,
  rangeEnd: string,
): GapAnalysis {
  const today = new Date().toISOString().slice(0, 10);
  const start = rangeStart.slice(0, 10);
  const end = rangeEnd.slice(0, 10);

  if (!dataPoints.length) {
    const totalDays = Math.max(1, daysBetween(start, end));
    return {
      gaps: [{ startDate: start, endDate: end, durationDays: totalDays, position: 'middle' }],
      totalMissingDays: totalDays,
      coveragePct: 0,
      dataFreshnessDays: Infinity,
      lastDataDate: '',
    };
  }

  // Build set of dates with data
  const dateSet = new Set(dataPoints.map((d) => d.date.slice(0, 10)));

  // Find last data date
  const sortedDates = [...dateSet].sort();
  const lastDataDate = sortedDates[sortedDates.length - 1];
  const dataFreshnessDays = Math.max(0, daysBetween(lastDataDate, today));

  // Walk range and find gaps
  const gaps: DataGap[] = [];
  let cursor = start;
  let gapStart: string | null = null;
  const totalExpectedDays = Math.max(1, daysBetween(start, end));

  while (cursor <= end) {
    if (!dateSet.has(cursor)) {
      if (!gapStart) gapStart = cursor;
    } else {
      if (gapStart) {
        const gapEnd = addDays(cursor, -1);
        const duration = daysBetween(gapStart, gapEnd) + 1;
        const position =
          gapStart === start ? 'start' : gapEnd === end ? 'end' : 'middle';
        gaps.push({ startDate: gapStart, endDate: gapEnd, durationDays: duration, position });
        gapStart = null;
      }
    }
    cursor = addDays(cursor, 1);
  }

  // Close trailing gap
  if (gapStart) {
    const duration = daysBetween(gapStart, end) + 1;
    gaps.push({ startDate: gapStart, endDate: end, durationDays: duration, position: 'end' });
  }

  const totalMissingDays = gaps.reduce((s, g) => s + g.durationDays, 0);
  const coveragePct = ((totalExpectedDays - totalMissingDays) / totalExpectedDays) * 100;

  return {
    gaps,
    totalMissingDays,
    coveragePct,
    dataFreshnessDays,
    lastDataDate,
  };
}
