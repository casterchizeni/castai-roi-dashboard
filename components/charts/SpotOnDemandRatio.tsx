'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { NodeMetrics, CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  nodes: NodeMetrics;
  baselineData?: CostDataPoint[];
  castaiData?: CostDataPoint[];
  loading?: boolean;
}

const COLORS = ['#8b5cf6', '#f59e0b'];

function avgSpotPct(data: CostDataPoint[]): number {
  if (!data.length) return 0;
  let spotSum = 0;
  let totalSum = 0;
  for (const d of data) {
    spotSum += d.spotCost ?? 0;
    totalSum += d.totalCost;
  }
  return totalSum > 0 ? (spotSum / totalSum) * 100 : 0;
}

export default function SpotOnDemandRatio({ nodes, baselineData, castaiData, loading }: Props) {
  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const data = [
    { name: 'Spot', value: nodes.spotNodes },
    { name: 'On-Demand', value: nodes.onDemandNodes },
  ];

  const spotPct = nodes.totalNodes > 0 ? ((nodes.spotNodes / nodes.totalNodes) * 100).toFixed(0) : '0';

  const hasBaseline = baselineData && baselineData.length > 0;
  const baselineSpotPct = hasBaseline ? avgSpotPct(baselineData) : 0;
  const castaiSpotPct = castaiData && castaiData.length > 0 ? avgSpotPct(castaiData) : 0;

  return (
    <Collapsible title="Spot vs On-Demand Ratio" color="emerald" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Current mix of spot vs on-demand nodes. Higher spot usage = lower cost, but CAST AI maintains reliability with fallback policies.
      </p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value">
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-3">
          <div className="text-3xl font-bold text-purple-600">{spotPct}% Spot</div>
          <div className="text-sm text-gray-500">{nodes.spotNodes} spot nodes</div>
          <div className="text-sm text-gray-500">{nodes.onDemandNodes} on-demand nodes</div>
          <div className="flex gap-4 mt-2">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS[i] }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Before → After spot cost comparison */}
      {hasBaseline && castaiSpotPct > 0 ? (
        <div className="border-t border-gray-100 pt-3 mt-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Spot Cost % — Pre-CAST → Now</span>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-600">{baselineSpotPct.toFixed(0)}%</div>
              <div className="text-xs text-gray-400">Before</div>
            </div>
            <span className="text-gray-300 text-lg">→</span>
            <div className="flex-1 bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-purple-600">{castaiSpotPct.toFixed(0)}%</div>
              <div className="text-xs text-gray-400">With CAST AI</div>
            </div>
            {baselineSpotPct > 0 && (
              <div className="flex-1 text-center">
                <div className={`text-lg font-bold ${castaiSpotPct > baselineSpotPct ? 'text-emerald-600' : 'text-red-500'}`}>
                  {castaiSpotPct > baselineSpotPct ? '+' : ''}{(castaiSpotPct - baselineSpotPct).toFixed(0)}pp
                </div>
                <div className="text-xs text-gray-400">Change</div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Based on avg spot cost as % of total cost over {baselineData.length}d baseline vs {castaiData?.length ?? 0}d CAST AI period.
          </p>
        </div>
      ) : hasBaseline ? (
        <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-3 mt-4">
          Baseline period had no spot cost data for comparison.
        </p>
      ) : null}
    </Collapsible>
  );
}
