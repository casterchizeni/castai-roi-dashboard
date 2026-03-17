'use client';

import type { DataGap } from '@/lib/calculations/gaps';

interface Props {
  baselineDays: number;
  hasApiError?: boolean;
  isMock?: boolean;
  dataFreshnessDays?: number;
  gaps?: DataGap[];
}

export default function DataQualityBanner({ baselineDays, hasApiError, isMock, dataFreshnessDays, gaps }: Props) {
  const warnings: { type: 'info' | 'warn' | 'error'; message: string }[] = [];

  if (isMock) {
    warnings.push({
      type: 'warn',
      message: 'Using estimated values — real API data unavailable.',
    });
  }

  if (hasApiError) {
    warnings.push({
      type: 'error',
      message: 'Some data failed to load. Metrics marked with \u26A0 may be incomplete.',
    });
  }

  if (baselineDays < 3) {
    warnings.push({
      type: 'info',
      message: 'No pre-CAST AI data available. Savings are compared against on-demand pricing, not your historical spend.',
    });
  } else if (baselineDays < 14) {
    warnings.push({
      type: 'info',
      message: `Limited baseline: only ${baselineDays} days of pre-CAST AI data. Monthly estimates are extrapolated.`,
    });
  }

  // Data freshness warning
  if (dataFreshnessDays != null && dataFreshnessDays > 7) {
    warnings.push({
      type: 'warn',
      message: `Data is ${dataFreshnessDays} days old. The cluster may have been disconnected from CAST AI.`,
    });
  } else if (dataFreshnessDays != null && dataFreshnessDays > 2) {
    warnings.push({
      type: 'info',
      message: `Last data received ${dataFreshnessDays} days ago.`,
    });
  }

  // Gap detection warning
  const middleGaps = gaps?.filter((g) => g.position === 'middle') ?? [];
  if (middleGaps.length > 0) {
    const totalMissingDays = middleGaps.reduce((s, g) => s + g.durationDays, 0);
    warnings.push({
      type: 'warn',
      message: `${totalMissingDays} days of missing data detected in ${middleGaps.length} gap${middleGaps.length !== 1 ? 's' : ''}. Averages reflect only days with data.`,
    });
  }

  if (warnings.length === 0) return null;

  const bgMap = { info: 'bg-blue-50 border-blue-200 text-blue-800', warn: 'bg-amber-50 border-amber-200 text-amber-800', error: 'bg-red-50 border-red-200 text-red-800' };
  const iconMap = { info: '\u2139\uFE0F', warn: '\u26A0\uFE0F', error: '\u274C' };

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className={`border rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${bgMap[w.type]}`}>
          <span className="flex-shrink-0 mt-0.5">{iconMap[w.type]}</span>
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
