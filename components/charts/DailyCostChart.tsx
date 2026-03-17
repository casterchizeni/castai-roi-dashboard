'use client';

import { useState, useMemo } from 'react';
import Collapsible from '@/components/Collapsible';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  Legend,
} from 'recharts';
import type { CostDataPoint } from '@/types/castai';
import type { DataGap } from '@/lib/calculations/gaps';
import { computeGraphDerivedSavings } from './EfficiencyTrendChart';

interface Props {
  data: CostDataPoint[];
  castaiEnabledAt?: string;
  loading?: boolean;
  gaps?: DataGap[];
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

const RANGES = ['1M', '3M', '6M', 'ALL'] as const;
type Range = typeof RANGES[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const get = (key: string) => payload.find((p: { dataKey: string }) => p.dataKey === key)?.value as number | undefined;
  const total = get('total');
  const onDemand = get('onDemand');
  const spot = get('spot');
  const compute = get('compute');

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-52">
      <div className="font-semibold text-gray-900 mb-2 border-b border-gray-100 pb-1">{fmtDate(label)}</div>
      {total != null && <div className="flex justify-between py-0.5"><span className="text-emerald-600 font-medium">Total Cost</span><span className="font-bold">${total.toLocaleString()}/day</span></div>}
      {compute != null && <div className="flex justify-between py-0.5"><span className="text-blue-600">Compute</span><span className="font-semibold">${compute.toLocaleString()}</span></div>}
      {onDemand != null && <div className="flex justify-between py-0.5"><span className="text-amber-600">On-demand</span><span className="font-semibold">${onDemand.toLocaleString()}</span></div>}
      {spot != null && <div className="flex justify-between py-0.5"><span className="text-purple-600">Spot</span><span className="font-semibold">${spot.toLocaleString()}</span></div>}
    </div>
  );
}

export default function DailyCostChart({ data, castaiEnabledAt, loading, gaps }: Props) {
  const [range, setRange] = useState<Range>('ALL');
  const [showLines, setShowLines] = useState({
    total: true,
    compute: false,
    onDemand: false,
    spot: false,
  });

  if (loading) return <div className="animate-pulse h-80 bg-gray-100 rounded-xl" />;
  if (!data.length) return null;

  const toggle = (key: keyof typeof showLines) =>
    setShowLines(v => ({ ...v, [key]: !v[key] }));

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const filteredData = useMemo(() => {
    const daysBack = range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : Infinity;
    const cutoff = daysBack === Infinity ? '' : new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return data.filter((d) => !cutoff || d.date >= cutoff);
  }, [data, range]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const savings = useMemo(
    () => computeGraphDerivedSavings(data, castaiEnabledAt),
    [data, castaiEnabledAt],
  );

  const chartData = filteredData.map((d) => ({
    date: d.date,
    total: +d.totalCost.toFixed(0),
    compute: +d.computeCost.toFixed(0),
    onDemand: (d.onDemandCost ?? 0) > 0 ? +(d.onDemandCost!).toFixed(0) : undefined,
    spot: (d.spotCost ?? 0) > 0 ? +(d.spotCost!).toFixed(0) : undefined,
  }));

  const tickInterval = Math.max(1, Math.ceil(chartData.length / 12));
  const showBaseline = castaiEnabledAt && chartData.length > 0 && chartData[0].date < (castaiEnabledAt?.slice(0, 10) ?? '');

  // Recent avg
  const recent14 = filteredData.slice(-14);
  const avgDaily = recent14.reduce((s, d) => s + d.totalCost, 0) / Math.max(recent14.length, 1);

  const LINE_CONFIG = [
    { key: 'total', label: 'Total Cost', color: '#10b981', width: 2.5, dash: undefined },
    { key: 'compute', label: 'Compute', color: '#3b82f6', width: 1.5, dash: undefined },
    { key: 'onDemand', label: 'On-demand', color: '#f59e0b', width: 1.5, dash: '4 2' },
    { key: 'spot', label: 'Spot', color: '#8b5cf6', width: 1.5, dash: '4 2' },
  ] as const;

  return (
    <Collapsible title="Daily Cost Over Time" color="emerald" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <p className="text-sm text-gray-500 mb-3 leading-relaxed">
        Your actual daily cloud cost — what you paid, no modelling. The shaded area shows all pre-CAST AI data used as your baseline.
      </p>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm text-gray-500 mt-0.5">
            Recent avg: <span className="font-semibold text-gray-700">${avgDaily.toFixed(0)}/day</span>
            {savings.hasPreCastData && (
              <> · Pre-CAST AI baseline: <span className="font-semibold text-slate-600">${savings.preCastAvgDaily.toFixed(0)}/day</span>
              {savings.dailySavings > 0 && <> · saving <span className="font-semibold text-emerald-600">${savings.dailySavings.toFixed(0)}/day</span></>}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                range === r
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Savings summary (if pre-CAST data exists) */}
      {savings.hasPreCastData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="rounded-lg p-3 bg-slate-50">
            <div className="text-xs font-semibold text-gray-500">Baseline avg</div>
            <div className="text-base font-bold text-slate-700">${savings.preCastAvgDaily.toFixed(0)}/day</div>
            <div className="text-[11px] text-slate-400 mt-0.5">All pre-autoscaler data</div>
          </div>
          <div className="rounded-lg p-3 bg-emerald-50">
            <div className="text-xs font-semibold text-gray-500">With CAST AI</div>
            <div className="text-base font-bold text-emerald-700">${savings.postCastAvgDaily.toFixed(0)}/day</div>
            <div className="text-[11px] text-emerald-500 mt-0.5">Recent 90d avg</div>
          </div>
          <div className="rounded-lg p-3 bg-blue-50">
            <div className="text-xs font-semibold text-gray-500">Daily savings</div>
            <div className={`text-base font-bold ${savings.dailySavings > 0 ? 'text-blue-700' : 'text-gray-500'}`}>
              ${savings.dailySavings.toFixed(0)}/day
            </div>
          </div>
          <div className="rounded-lg p-3 bg-indigo-50">
            <div className="text-xs font-semibold text-gray-500">Monthly savings</div>
            <div className={`text-base font-bold ${savings.monthlySavings > 0 ? 'text-indigo-700' : 'text-gray-500'}`}>
              ${savings.monthlySavings.toFixed(0)}/mo
            </div>
          </div>
        </div>
      )}

      {/* Line toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LINE_CONFIG.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggle(key as keyof typeof showLines)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              showLines[key as keyof typeof showLines]
                ? 'border-transparent text-white'
                : 'bg-white border-gray-300 text-gray-500'
            }`}
            style={showLines[key as keyof typeof showLines] ? { background: color } : {}}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval={tickInterval}
            tickFormatter={fmtDate}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v: number) => `$${v}`}
            label={{ value: '$/day', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }}
          />
          <Tooltip content={<CostTooltip />} />
          <Legend content={() => null} />

          {/* Pre-CAST AI shaded region = full baseline period */}
          {showBaseline && (
            <ReferenceArea
              x1={chartData[0].date}
              x2={castaiEnabledAt!.slice(0, 10)}
              fill="#94a3b8"
              fillOpacity={0.12}
              stroke="#94a3b8"
              strokeOpacity={0.4}
              strokeDasharray="4 2"
              label={{ value: 'Baseline (all pre-autoscaler data)', position: 'insideTopLeft', fontSize: 11, fill: '#475569' }}
            />
          )}

          {/* Data gap bands */}
          {gaps?.filter((g) => g.position === 'middle').map((gap, i) => (
            <ReferenceArea
              key={`gap-${i}`}
              x1={gap.startDate}
              x2={gap.endDate}
              fill="#9ca3af"
              fillOpacity={0.15}
              stroke="#9ca3af"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
              label={i === 0 ? { value: 'No data', position: 'insideTop', fontSize: 10, fill: '#6b7280' } : undefined}
            />
          ))}

          {LINE_CONFIG.map(({ key, color, width, dash }) =>
            showLines[key as keyof typeof showLines] ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={width}
                strokeDasharray={dash}
                dot={false}
                name={key}
              />
            ) : null
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 text-sm text-gray-400">
        Total cost = on-demand + spot + storage. Toggle lines above to see the breakdown.
      </div>
    </Collapsible>
  );
}
