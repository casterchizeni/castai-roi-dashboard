'use client';

import type { NodeMetrics, CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface PeriodStats {
  avgCpuHrsPerDay: number;
  avgSpotPct: number;
  avgOverprovPct: number;
  days: number;
}

function computePeriodStats(data: CostDataPoint[]): PeriodStats {
  if (!data.length) return { avgCpuHrsPerDay: 0, avgSpotPct: 0, avgOverprovPct: 0, days: 0 };

  let totalCpuHrs = 0;
  let spotCostSum = 0;
  let totalCostSum = 0;
  let overprovSum = 0;
  let overprovCount = 0;

  for (const d of data) {
    totalCpuHrs += d.cpuHours ?? 0;
    spotCostSum += d.spotCost ?? 0;
    totalCostSum += d.totalCost;
    if (d.cpuOverprovisioningPct != null && d.cpuOverprovisioningPct > 0) {
      overprovSum += d.cpuOverprovisioningPct;
      overprovCount++;
    }
  }

  return {
    avgCpuHrsPerDay: totalCpuHrs / data.length,
    avgSpotPct: totalCostSum > 0 ? (spotCostSum / totalCostSum) * 100 : 0,
    avgOverprovPct: overprovCount > 0 ? overprovSum / overprovCount : 0,
    days: data.length,
  };
}

function ComparisonRow({ label, before, after, unit, lowerIsBetter = false }: {
  label: string;
  before: number;
  after: number;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  const delta = before > 0 ? ((after - before) / before) * 100 : 0;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600 font-medium">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-gray-500">{before > 0 ? `${before.toFixed(1)}${unit}` : '—'}</span>
        <span className="text-gray-300">→</span>
        <span className="font-semibold text-gray-800">{after > 0 ? `${after.toFixed(1)}${unit}` : '—'}</span>
        {before > 0 && after > 0 && (
          <span className={`font-semibold ${improved ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  current: NodeMetrics;
  baselineData?: CostDataPoint[];
  castaiData?: CostDataPoint[];
  loading?: boolean;
}

export default function NodeConsolidation({ current, baselineData, castaiData, loading }: Props) {
  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  const spotPct = current.totalNodes > 0 ? (current.spotNodes / current.totalNodes) * 100 : 0;
  const instanceCounts: Record<string, number> = {};
  current.nodes.forEach((n) => {
    instanceCounts[n.instanceType] = (instanceCounts[n.instanceType] ?? 0) + (n.count ?? 1);
  });

  const hasBaseline = baselineData && baselineData.length > 0;
  const baseline = hasBaseline ? computePeriodStats(baselineData) : null;
  const castai = castaiData && castaiData.length > 0 ? computePeriodStats(castaiData) : null;

  return (
    <Collapsible title="Node Consolidation" color="emerald" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        {hasBaseline
          ? 'Pre-CAST AI vs current comparison — shows how compute capacity and efficiency changed.'
          : 'Current node count and utilization. Shows how efficiently compute capacity is packed.'}
      </p>

      {/* Current snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Current Nodes</span>
          <span className="text-2xl font-bold text-emerald-600">{current.totalNodes}</span>
          <span className="text-xs text-gray-400">active nodes</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Spot Usage</span>
          <span className="text-2xl font-bold text-purple-600">{spotPct.toFixed(0)}%</span>
          <span className="text-xs text-gray-400">{current.spotNodes} spot / {current.onDemandNodes} on-demand</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Instance Types</span>
          <span className="text-2xl font-bold text-gray-700">{Object.keys(instanceCounts).length}</span>
          <span className="text-xs text-gray-400">unique types</span>
        </div>
      </div>

      {/* Before → After comparison */}
      {baseline && castai ? (
        <div className="border-t border-gray-100 pt-3 mt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pre-CAST → Now</span>
            <span className="text-xs text-gray-400">{baseline.days}d baseline vs {castai.days}d with CAST AI</span>
          </div>
          <ComparisonRow
            label="Avg provisioned CPU-hrs/day"
            before={baseline.avgCpuHrsPerDay}
            after={castai.avgCpuHrsPerDay}
            unit=""
            lowerIsBetter
          />
          <ComparisonRow
            label="Spot cost %"
            before={baseline.avgSpotPct}
            after={castai.avgSpotPct}
            unit="%"
          />
          <ComparisonRow
            label="CPU overprovisioning"
            before={baseline.avgOverprovPct}
            after={castai.avgOverprovPct}
            unit="%"
            lowerIsBetter
          />
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic border-t border-gray-50 pt-3 mt-1">
          No pre-CAST AI data for comparison
        </p>
      )}

      <div className="pt-3 border-t border-gray-50 mt-3">
        <span className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Instance Types</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(instanceCounts).map(([type, count]) => (
            <span key={type} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
              {type} ×{count}
            </span>
          ))}
        </div>
      </div>
    </Collapsible>
  );
}
