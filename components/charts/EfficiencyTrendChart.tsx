'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  Legend,
} from 'recharts';
import type { CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  data: CostDataPoint[];
  castaiEnabledAt?: string; // ISO date — shades pre-CAST AI region
  loading?: boolean;
}

export interface GraphDerivedSavings {
  preCastAvgDaily: number;
  postCastAvgDaily: number;
  dailySavings: number;
  monthlySavings: number;
  hasPreCastData: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

const RANGES = ['1M', '3M', '6M', 'ALL'] as const;
type Range = typeof RANGES[number];
type ViewMode = 'cost' | 'cpu';

/** Compute honest savings from chart data itself */
export function computeGraphDerivedSavings(
  data: CostDataPoint[],
  castaiEnabledAt?: string,
): GraphDerivedSavings {
  if (!castaiEnabledAt) {
    return { preCastAvgDaily: 0, postCastAvgDaily: 0, dailySavings: 0, monthlySavings: 0, hasPreCastData: false };
  }
  const preCastDays = data.filter(d => d.date < castaiEnabledAt);
  const postCastDays = data.filter(d => d.date >= castaiEnabledAt).slice(-90);

  if (preCastDays.length === 0) {
    const postAvg = postCastDays.length > 0
      ? postCastDays.reduce((s, d) => s + (d.totalCost ?? 0), 0) / postCastDays.length
      : 0;
    return { preCastAvgDaily: 0, postCastAvgDaily: postAvg, dailySavings: 0, monthlySavings: 0, hasPreCastData: false };
  }

  const preCastAvgDaily = preCastDays.reduce((s, d) => s + (d.totalCost ?? 0), 0) / preCastDays.length;
  const postCastAvgDaily = postCastDays.length > 0
    ? postCastDays.reduce((s, d) => s + (d.totalCost ?? 0), 0) / postCastDays.length
    : 0;
  const dailySavings = preCastAvgDaily - postCastAvgDaily;
  return {
    preCastAvgDaily,
    postCastAvgDaily,
    dailySavings,
    monthlySavings: dailySavings * 30,
    hasPreCastData: true,
  };
}

// ── Series config ────────────────────────────────────────────────────────────

const COST_LINE_SERIES = {
  total:    { label: 'Total $/day',     color: '#10b981' },
  onDemand: { label: 'On-demand $/day', color: '#f59e0b' },
  spot:     { label: 'Spot $/day',      color: '#8b5cf6' },
} as const;

const EFFICIENCY_SERIES = {
  provisioned: { label: 'Provisioned', color: '#ef4444', fillColor: '#fee2e2' },
  requested:   { label: 'Requested',   color: '#f59e0b', fillColor: '#fef3c7' },
  used:        { label: 'Used',         color: '#10b981', fillColor: '#d1fae5' },
} as const;

// ── Tooltips ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UnifiedCostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const get = (key: string) => payload.find((p: { dataKey: string }) => p.dataKey === key)?.value as number | undefined;

  const total = get('totalCost');
  const onDemand = get('onDemandCost');
  const spot = get('spotCost');
  const prov = get('provisionedCost');
  const req = get('requestedCost');
  const used = get('usedCost');

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-60">
      <div className="font-semibold text-gray-900 mb-2 border-b border-gray-100 pb-1">{fmtDate(label)}</div>
      {total != null && <div className="flex justify-between py-0.5"><span className="text-emerald-600 font-medium">Total Cost</span><span className="font-bold">${total.toFixed(0)}/day</span></div>}
      {onDemand != null && <div className="flex justify-between py-0.5"><span className="text-amber-600">On-demand</span><span className="font-semibold">${onDemand.toFixed(0)}</span></div>}
      {spot != null && <div className="flex justify-between py-0.5"><span className="text-purple-600">Spot</span><span className="font-semibold">${spot.toFixed(0)}</span></div>}
      {(prov != null || req != null || used != null) && <div className="border-t border-gray-100 mt-1 pt-1 text-gray-500 font-medium text-[10px] uppercase tracking-wide">Efficiency</div>}
      {prov != null && <div className="flex justify-between py-0.5"><span className="text-red-600">Provisioned</span><span className="font-semibold">${prov.toFixed(0)}</span></div>}
      {req != null && <div className="flex justify-between py-0.5"><span className="text-amber-600">Requested</span><span className="font-semibold">${req.toFixed(0)}</span></div>}
      {used != null && <div className="flex justify-between py-0.5"><span className="text-emerald-600">Used</span><span className="font-semibold">${used.toFixed(0)}</span></div>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CpuTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const get = (key: string) => payload.find((p: { dataKey: string }) => p.dataKey === key)?.value as number | undefined;
  const prov = get('provisionedCPU');
  const req  = get('requestedCPU');
  const used = get('usedCPU');
  const waste = prov && req ? (((prov - req) / prov) * 100).toFixed(0) : null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-52">
      <div className="font-semibold text-gray-900 mb-2 border-b border-gray-100 pb-1">{fmtDate(label)}</div>
      {prov  != null && <div className="flex justify-between py-0.5"><span className="text-red-600">Provisioned</span><span className="font-semibold">{prov.toFixed(0)} CPU-hrs</span></div>}
      {req   != null && <div className="flex justify-between py-0.5"><span className="text-amber-600">Requested</span><span className="font-semibold">{req.toFixed(0)} CPU-hrs</span></div>}
      {used  != null && <div className="flex justify-between py-0.5"><span className="text-emerald-600">Used</span><span className="font-semibold">{used.toFixed(1)} CPU-hrs</span></div>}
      {waste != null && <div className="flex justify-between py-0.5 mt-1 border-t border-gray-100 pt-1"><span className="text-red-500 font-medium">Waste</span><span className="font-bold text-red-600">{waste}%</span></div>}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EfficiencyTrendChart({ data, castaiEnabledAt, loading }: Props) {
  const [range, setRange] = useState<Range>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('cost');

  // Cost line toggles
  const [costLines, setCostLines] = useState({
    total: true,
    onDemand: false,
    spot: false,
  });

  // Efficiency area toggles
  const [effLayers, setEffLayers] = useState({
    provisioned: true,
    requested: true,
    used: true,
  });

  if (loading) return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;
  if (!data.length) return null;

  const toggleCostLine = (key: keyof typeof costLines) =>
    setCostLines(v => ({ ...v, [key]: !v[key] }));

  const toggleEffLayer = (key: keyof typeof effLayers) =>
    setEffLayers(v => ({ ...v, [key]: !v[key] }));

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const filteredData = useMemo(() => {
    const daysBack = range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : Infinity;
    const cutoff = daysBack === Infinity ? '' : new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return data.filter((d) => !cutoff || d.date >= cutoff);
  }, [data, range]);

  // ── Savings derived from chart data ──────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const savings = useMemo(
    () => computeGraphDerivedSavings(filteredData, castaiEnabledAt),
    [filteredData, castaiEnabledAt],
  );

  // ── Cost view chart data ─────────────────────────────────────────────────
  const costChartData = filteredData.map((d) => {
    const totalCost = d.totalCost ?? 0;
    const cpuHours = d.cpuHours ?? 0;
    const cpuReqHours = d.cpuRequestedHours ?? 0;
    const cpuUsedHours = d.cpuUsedHours ?? 0;
    const ramHours = d.memoryGbHours ?? 0;
    const ramReqHours = d.ramRequestedGbHours ?? 0;
    const ramUsedHours = d.ramUsedGbHours ?? 0;

    const provCost = totalCost;
    const cpuCost = d.cpuCost ?? 0;
    const ramCost = d.ramCost ?? 0;
    const reqCpuCost = cpuHours > 0 ? cpuCost * (cpuReqHours / cpuHours) : 0;
    const reqRamCost = ramHours > 0 ? ramCost * (ramReqHours / ramHours) : 0;
    const reqCost = reqCpuCost + reqRamCost;
    const usedCpuCost = cpuHours > 0 ? cpuCost * (cpuUsedHours / cpuHours) : 0;
    const usedRamCost = ramHours > 0 ? ramCost * (ramUsedHours / ramHours) : 0;
    const usedCost = usedCpuCost + usedRamCost;

    return {
      date: d.date,
      // Cost lines
      totalCost: totalCost > 0 ? +totalCost.toFixed(0) : undefined,
      onDemandCost: (d.onDemandCost ?? 0) > 0 ? +(d.onDemandCost!).toFixed(0) : undefined,
      spotCost: (d.spotCost ?? 0) > 0 ? +(d.spotCost!).toFixed(0) : undefined,
      // Efficiency areas
      provisionedCost: provCost > 0 ? +provCost.toFixed(0) : undefined,
      requestedCost: reqCost > 0 ? +reqCost.toFixed(0) : undefined,
      usedCost: usedCost > 0 ? +usedCost.toFixed(0) : undefined,
    };
  });

  // ── CPU view chart data ──────────────────────────────────────────────────
  const cpuChartData = filteredData.map((d) => {
    const prov = d.cpuHours ?? 0;
    const req  = d.cpuRequestedHours ?? 0;
    const used = d.cpuUsedHours ?? 0;
    return {
      date: d.date,
      provisionedCPU: prov > 0 ? +prov.toFixed(0) : undefined,
      requestedCPU:   req  > 0 ? +req.toFixed(0)  : undefined,
      usedCPU:        used > 0 ? +used.toFixed(1)  : undefined,
    };
  });

  const chartData = viewMode === 'cost' ? costChartData : cpuChartData;
  const tickInterval = Math.max(1, Math.ceil(chartData.length / 12));

  // Summary stats (last 14 days)
  const recent = filteredData.filter((d) => (d.cpuHours ?? 0) > 0).slice(-14);
  const avgProvCost = recent.reduce((s, d) => s + (d.totalCost ?? 0), 0) / Math.max(recent.length, 1);
  const avgUsedCost = recent.reduce((s, d) => {
    const cpuCost = d.cpuCost ?? 0;
    const ramCost = d.ramCost ?? 0;
    const cpuH = d.cpuHours ?? 0;
    const ramH = d.memoryGbHours ?? 0;
    const usedCpu = cpuH > 0 ? cpuCost * ((d.cpuUsedHours ?? 0) / cpuH) : 0;
    const usedRam = ramH > 0 ? ramCost * ((d.ramUsedGbHours ?? 0) / ramH) : 0;
    return s + usedCpu + usedRam;
  }, 0) / Math.max(recent.length, 1);
  const costGap = avgProvCost - avgUsedCost;

  // CPU summary
  const avgProv   = recent.reduce((s, d) => s + (d.cpuHours ?? 0), 0) / Math.max(recent.length, 1);
  const avgReq    = recent.reduce((s, d) => s + (d.cpuRequestedHours ?? 0), 0) / Math.max(recent.length, 1);
  const avgWaste  = avgProv > 0 ? ((avgProv - avgReq) / avgProv * 100) : 0;

  // Pre-CAST AI baseline visibility
  const showBaseline = castaiEnabledAt && chartData.length > 0 && chartData[0].date < castaiEnabledAt;

  const yLabel  = viewMode === 'cost' ? '$/day' : 'CPU-hrs';
  const yFmt    = viewMode === 'cost' ? (v: number) => `$${v}` : (v: number) => `${v}`;

  return (
    <Collapsible title="Cost & Efficiency Over Time" color="orange" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Description */}
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        The unified cost &amp; efficiency view. Lines show actual spend (total, on-demand, spot). Shaded areas show provisioned vs requested vs used capacity cost. Grey region = pre-CAST AI baseline.
      </p>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            {viewMode === 'cost'
              ? <>Lines = actual cost · Areas = provisioned → requested → used · Gap = optimization opportunity</>
              : <>CPU provisioned vs requested vs used · Over-provisioning: <span className="font-semibold text-red-600">{avgWaste.toFixed(0)}%</span></>
            }
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {/* View mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('cost')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'cost' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              $/day
            </button>
            <button
              onClick={() => setViewMode('cpu')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'cpu' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              CPU-hrs
            </button>
          </div>
          {/* Date range buttons */}
          <div className="flex gap-1">
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
      </div>

      {/* Savings stats bar (derived from chart data) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {viewMode === 'cost' ? (
          <>
            <div className="rounded-lg p-3 bg-slate-50">
              <div className="text-xs font-medium text-gray-500">Pre-CAST AI avg</div>
              <div className="text-base font-bold mt-0.5 text-slate-700">
                {savings.hasPreCastData ? `$${savings.preCastAvgDaily.toFixed(0)}/day` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {savings.hasPreCastData ? 'baseline period' : 'no pre-CAST data'}
              </div>
            </div>
            <div className="rounded-lg p-3 bg-emerald-50">
              <div className="text-xs font-medium text-gray-500">Current avg</div>
              <div className="text-base font-bold mt-0.5 text-emerald-700">
                ${savings.postCastAvgDaily.toFixed(0)}/day
              </div>
              <div className="text-xs text-gray-400 mt-0.5">last 90 post-CAST days</div>
            </div>
            <div className="rounded-lg p-3 bg-blue-50">
              <div className="text-xs font-medium text-gray-500">Daily savings</div>
              <div className={`text-base font-bold mt-0.5 ${savings.dailySavings > 0 ? 'text-blue-700' : 'text-gray-500'}`}>
                {savings.hasPreCastData ? `$${savings.dailySavings.toFixed(0)}/day` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">pre vs post avg</div>
            </div>
            <div className="rounded-lg p-3 bg-indigo-50">
              <div className="text-xs font-medium text-gray-500">Monthly savings</div>
              <div className={`text-base font-bold mt-0.5 ${savings.monthlySavings > 0 ? 'text-indigo-700' : 'text-gray-500'}`}>
                {savings.hasPreCastData ? `$${savings.monthlySavings.toFixed(0)}/mo` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">daily × 30</div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg p-3 bg-red-50">
              <div className="text-xs font-medium text-gray-500">Avg Provisioned</div>
              <div className="text-base font-bold mt-0.5 text-red-700">{avgProv.toFixed(0)} CPU-hrs/day</div>
              <div className="text-xs text-gray-400 mt-0.5">what you pay for</div>
            </div>
            <div className="rounded-lg p-3 bg-amber-50">
              <div className="text-xs font-medium text-gray-500">Avg Requested</div>
              <div className="text-base font-bold mt-0.5 text-amber-700">{avgReq.toFixed(0)} CPU-hrs/day</div>
              <div className="text-xs text-gray-400 mt-0.5">after right-sizing</div>
            </div>
            <div className="rounded-lg p-3 bg-orange-50">
              <div className="text-xs font-medium text-gray-500">Over-Provisioning</div>
              <div className="text-base font-bold mt-0.5 text-orange-700">{avgWaste.toFixed(0)}%</div>
              <div className="text-xs text-gray-400 mt-0.5">prov → req gap</div>
            </div>
            <div className="rounded-lg p-3 bg-gray-50">
              <div className="text-xs font-medium text-gray-500">Industry Avg</div>
              <div className="text-base font-bold mt-0.5 text-gray-500">70–80%</div>
              <div className="text-xs text-gray-400 mt-0.5">before optimisation</div>
            </div>
          </>
        )}
      </div>

      {/* Toggle controls */}
      {viewMode === 'cost' && (
        <div className="flex flex-wrap gap-4 mb-4">
          {/* Cost breakdown lines */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">Cost:</span>
            {(Object.entries(COST_LINE_SERIES) as [keyof typeof COST_LINE_SERIES, typeof COST_LINE_SERIES[keyof typeof COST_LINE_SERIES]][]).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => toggleCostLine(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  costLines[key]
                    ? 'border-transparent text-white'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}
                style={costLines[key] ? { background: meta.color } : {}}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                {meta.label}
              </button>
            ))}
          </div>
          {/* Efficiency layers */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">Efficiency:</span>
            {(Object.entries(EFFICIENCY_SERIES) as [keyof typeof EFFICIENCY_SERIES, typeof EFFICIENCY_SERIES[keyof typeof EFFICIENCY_SERIES]][]).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => toggleEffLayer(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  effLayers[key]
                    ? 'border-transparent text-white'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}
                style={effLayers[key] ? { background: meta.color } : {}}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                {meta.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'cpu' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.entries(EFFICIENCY_SERIES) as [keyof typeof EFFICIENCY_SERIES, typeof EFFICIENCY_SERIES[keyof typeof EFFICIENCY_SERIES]][]).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => toggleEffLayer(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                effLayers[key]
                  ? 'border-transparent text-white'
                  : 'bg-white border-gray-300 text-gray-500'
              }`}
              style={effLayers[key] ? { background: meta.color } : {}}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
              {meta.label}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval={tickInterval}
            tickFormatter={fmtDate}
          />
          <YAxis
            yAxisId="main"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={yFmt}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }}
          />
          <Tooltip content={viewMode === 'cost' ? <UnifiedCostTooltip /> : <CpuTooltip />} />
          <Legend content={() => null} />

          {/* Pre-CAST AI shaded region */}
          {showBaseline && (
            <ReferenceArea
              yAxisId="main"
              x1={chartData[0].date}
              x2={castaiEnabledAt}
              fill="#94a3b8"
              fillOpacity={0.12}
              stroke="#94a3b8"
              strokeOpacity={0.4}
              strokeDasharray="4 2"
              label={{ value: '← Pre-CAST AI baseline', position: 'insideTopLeft', fontSize: 10, fill: '#64748b' }}
            />
          )}

          {viewMode === 'cost' ? (
            <>
              {/* Efficiency areas — drawn back-to-front */}
              <Area
                yAxisId="main"
                type="monotone"
                dataKey="provisionedCost"
                fill={EFFICIENCY_SERIES.provisioned.fillColor}
                stroke={EFFICIENCY_SERIES.provisioned.color}
                strokeWidth={effLayers.provisioned ? 1 : 0}
                fillOpacity={effLayers.provisioned ? 0.4 : 0}
                dot={false}
                name="Provisioned"
              />
              <Area
                yAxisId="main"
                type="monotone"
                dataKey="requestedCost"
                fill={EFFICIENCY_SERIES.requested.fillColor}
                stroke={EFFICIENCY_SERIES.requested.color}
                strokeWidth={effLayers.requested ? 1 : 0}
                fillOpacity={effLayers.requested ? 0.5 : 0}
                dot={false}
                name="Requested"
              />
              <Area
                yAxisId="main"
                type="monotone"
                dataKey="usedCost"
                fill={EFFICIENCY_SERIES.used.fillColor}
                stroke={EFFICIENCY_SERIES.used.color}
                strokeWidth={effLayers.used ? 1 : 0}
                fillOpacity={effLayers.used ? 0.6 : 0}
                dot={false}
                name="Used"
              />

              {/* Cost lines — drawn on top */}
              {costLines.total && (
                <Line
                  yAxisId="main"
                  type="monotone"
                  dataKey="totalCost"
                  stroke={COST_LINE_SERIES.total.color}
                  strokeWidth={2.5}
                  dot={false}
                  name="Total $/day"
                />
              )}
              {costLines.onDemand && (
                <Line
                  yAxisId="main"
                  type="monotone"
                  dataKey="onDemandCost"
                  stroke={COST_LINE_SERIES.onDemand.color}
                  strokeWidth={1.5}
                  dot={false}
                  name="On-demand $/day"
                  strokeDasharray="4 2"
                />
              )}
              {costLines.spot && (
                <Line
                  yAxisId="main"
                  type="monotone"
                  dataKey="spotCost"
                  stroke={COST_LINE_SERIES.spot.color}
                  strokeWidth={1.5}
                  dot={false}
                  name="Spot $/day"
                  strokeDasharray="4 2"
                />
              )}
            </>
          ) : (
            <>
              {/* CPU view: areas only */}
              <Area
                yAxisId="main"
                type="monotone"
                dataKey="provisionedCPU"
                fill={EFFICIENCY_SERIES.provisioned.fillColor}
                stroke={EFFICIENCY_SERIES.provisioned.color}
                strokeWidth={effLayers.provisioned ? 1.5 : 0}
                fillOpacity={effLayers.provisioned ? 0.55 : 0}
                dot={false}
                name="Provisioned CPU-hrs"
              />
              <Area
                yAxisId="main"
                type="monotone"
                dataKey="requestedCPU"
                fill={EFFICIENCY_SERIES.requested.fillColor}
                stroke={EFFICIENCY_SERIES.requested.color}
                strokeWidth={effLayers.requested ? 1.5 : 0}
                fillOpacity={effLayers.requested ? 0.7 : 0}
                dot={false}
                name="Requested CPU-hrs"
              />
              <Area
                yAxisId="main"
                type="monotone"
                dataKey="usedCPU"
                fill={EFFICIENCY_SERIES.used.fillColor}
                stroke={EFFICIENCY_SERIES.used.color}
                strokeWidth={effLayers.used ? 2 : 0}
                fillOpacity={effLayers.used ? 0.8 : 0}
                dot={false}
                name="Used CPU-hrs"
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Interpretation footer */}
      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">How to read:</span>
        {viewMode === 'cost' ? (
          <> The <span className="text-emerald-600 font-semibold">green line</span> is your actual daily cost. Toggle on-demand/spot lines to see the breakdown. The shaded areas show <span className="text-red-600 font-semibold">provisioned</span> (billed) → <span className="text-amber-600 font-semibold">requested</span> (pods) → <span className="text-emerald-600 font-semibold">used</span> (actual work). The gap = <span className="font-semibold">${costGap.toFixed(0)}/day</span> optimization opportunity.</>
        ) : (
          <> The <span className="text-red-600 font-semibold">red area</span> is provisioned capacity. The <span className="text-amber-600 font-semibold">amber area</span> is what pods request after right-sizing. The <span className="text-emerald-600 font-semibold">green area</span> is true compute work. Over-provisioning: <span className="font-semibold">{avgWaste.toFixed(0)}%</span>.</>
        )}
        {showBaseline && <span> The <span className="font-semibold text-slate-500">shaded grey region</span> shows the pre-CAST AI baseline period.</span>}
        {savings.hasPreCastData && viewMode === 'cost' && (
          <span> Savings derived from chart data: pre-CAST AI avg ${savings.preCastAvgDaily.toFixed(0)}/day → current ${savings.postCastAvgDaily.toFixed(0)}/day = <span className="font-semibold text-emerald-600">${savings.dailySavings.toFixed(0)}/day saved</span>.</span>
        )}
      </div>
    </Collapsible>
  );
}
