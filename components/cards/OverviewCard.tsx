'use client';

import type { CostDataPoint } from '@/types/castai';
import { computeGraphDerivedSavings } from '@/components/charts/EfficiencyTrendChart';
import Collapsible from '@/components/Collapsible';

interface Props {
  costData: CostDataPoint[];
  castaiEnabledAt?: string;
  /** CAST AI savings API numbers — shown as secondary reference */
  realSavings?: {
    totalSavings: number;
    totalCost: number;
  };
  loading?: boolean;
}

function Stat({ label, value, sub, valueColor = 'text-gray-900', note }: {
  label: string; value: string; sub?: string; valueColor?: string; note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${valueColor}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
      {note && <span className="text-xs text-amber-600 italic">{note}</span>}
    </div>
  );
}

export default function OverviewCard({ costData, castaiEnabledAt, realSavings, loading }: Props) {
  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  // ── Primary: graph-derived savings (honest, verifiable from chart) ────────
  const derived = computeGraphDerivedSavings(costData, castaiEnabledAt);

  const annualSavings = derived.hasPreCastData ? derived.monthlySavings * 12 : 0;
  const savingsPct = derived.hasPreCastData && derived.preCastAvgDaily > 0
    ? (derived.dailySavings / derived.preCastAvgDaily) * 100
    : 0;

  const hasCastaiApi = realSavings != null;

  return (
    <Collapsible title="ROI Overview" color="blue" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
          Based on your actual cost data
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat
          label="Pre-CAST AI"
          value={derived.hasPreCastData ? `$${derived.preCastAvgDaily.toFixed(0)}/day` : 'N/A'}
          sub={derived.hasPreCastData ? 'baseline avg daily cost' : 'no pre-CAST data'}
          valueColor="text-slate-700"
        />
        <Stat
          label="Current"
          value={`$${derived.postCastAvgDaily.toFixed(0)}/day`}
          sub="post-CAST avg daily cost"
          valueColor="text-emerald-600"
        />
        <Stat
          label="Daily Savings"
          value={derived.hasPreCastData ? `$${derived.dailySavings.toFixed(0)}/day` : 'N/A'}
          sub={derived.hasPreCastData ? `${savingsPct.toFixed(0)}% reduction` : 'need baseline data'}
          valueColor={derived.dailySavings > 0 ? 'text-emerald-600' : 'text-gray-500'}
        />
        <Stat
          label="Est. Annual Savings"
          value={derived.hasPreCastData ? `$${annualSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr` : 'N/A'}
          sub={derived.hasPreCastData ? `$${derived.monthlySavings.toFixed(0)}/mo × 12` : ''}
          valueColor="text-blue-600"
        />
      </div>

      {/* Explanation + CAST AI API reference */}
      <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-400 leading-relaxed">
        <span className="font-semibold text-gray-500">How it&apos;s calculated: </span>
        Savings = pre-CAST AI average daily cost minus current average daily cost (last 90 post-CAST days). This is derived directly from your cost data — what you can verify on the chart above.
        {hasCastaiApi && (
          <>
            <br />
            <span className="font-semibold text-gray-500 mt-1 inline-block">CAST AI reports (secondary): </span>
            ${realSavings.totalSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })} saved over 90d (includes spot + downscaling vs on-demand equiv.). Actual spend: ${realSavings.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}.
            <span className="text-amber-600"> Note: CAST AI&apos;s number compares against on-demand pricing, not your historical pre-CAST spend.</span>
          </>
        )}
      </div>
    </Collapsible>
  );
}
