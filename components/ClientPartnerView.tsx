'use client';

import { useMemo } from 'react';
import Collapsible from '@/components/Collapsible';
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
  ReferenceLine,
} from 'recharts';
import type {
  CostDataPoint,
  EfficiencyReport,
  NodeMetrics,
  ForecastResult,
  BaselineMetrics,
  ROIResult,
} from '@/types/castai';
import { computeGraphDerivedSavings } from './charts/EfficiencyTrendChart';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  costData: CostDataPoint[];
  castaiEnabledAt?: string;
  efficiency?: EfficiencyReport;
  nodeMetrics?: NodeMetrics;
  forecast?: ForecastResult;
  roiData?: {
    baseline: BaselineMetrics;
    roi: ROIResult;
    forecast: ForecastResult;
  };
  clusterName?: string;
  realSavings?: { totalSavings: number; totalCost: number };
  monthlyFee: number;
  loading?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)} '${y.slice(2)}`;
}
function fmtDateShort(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

function fmtFull$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ── Chart tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const get = (key: string) => payload.find((p: { dataKey: string }) => p.dataKey === key)?.value as number | undefined;

  const total = get('totalCost');
  const prov = get('provisionedCost');
  const req = get('requestedCost');
  const used = get('usedCost');

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-56">
      <div className="font-semibold text-gray-900 mb-2 border-b border-gray-100 pb-1">{fmtDate(label)}</div>
      {total != null && (
        <div className="flex justify-between py-0.5">
          <span className="text-emerald-600 font-semibold">Actual cost</span>
          <span className="font-bold">${total.toLocaleString()}/day</span>
        </div>
      )}
      <div className="border-t border-gray-50 mt-1 pt-1 text-[10px] uppercase text-gray-400 font-medium tracking-wide">Cost layers</div>
      {prov != null && (
        <div className="flex justify-between py-0.5">
          <span className="text-red-500">Provisioned</span>
          <span className="font-semibold">${prov.toLocaleString()}</span>
        </div>
      )}
      {req != null && (
        <div className="flex justify-between py-0.5">
          <span className="text-amber-500">Requested</span>
          <span className="font-semibold">${req.toLocaleString()}</span>
        </div>
      )}
      {used != null && (
        <div className="flex justify-between py-0.5">
          <span className="text-emerald-500">Used</span>
          <span className="font-semibold">${used.toLocaleString()}</span>
        </div>
      )}
      {prov != null && used != null && prov > used && (
        <div className="flex justify-between py-0.5 mt-1 border-t border-gray-100 pt-1">
          <span className="text-red-600 font-medium">Waste (prov − used)</span>
          <span className="font-bold text-red-600">${(prov - used).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

// ── Big number card ──────────────────────────────────────────────────────────

function BigStat({ label, value, sub, color = 'text-gray-900', bg = 'bg-white' }: {
  label: string; value: string; sub: string; color?: string; bg?: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-5 border border-gray-100`}>
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ClientPartnerView({
  costData,
  castaiEnabledAt,
  efficiency,
  nodeMetrics,
  forecast,
  roiData,
  clusterName,
  realSavings,
  monthlyFee,
  loading,
}: Props) {
  // Loading state
  if (loading || !costData.length) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-40 bg-gradient-to-r from-gray-200 to-gray-100 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="animate-pulse h-28 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="animate-pulse h-96 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const savings = useMemo(
    () => computeGraphDerivedSavings(costData, castaiEnabledAt),
    [costData, castaiEnabledAt],
  );

  // ── Chart data: actual cost line + provisioned/requested/used areas ──────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const chartData = useMemo(() =>
    costData.map((d) => {
      const totalCost = d.totalCost ?? 0;
      const cpuHours = d.cpuHours ?? 0;
      const cpuReqHours = d.cpuRequestedHours ?? 0;
      const cpuUsedHours = d.cpuUsedHours ?? 0;
      const ramHours = d.memoryGbHours ?? 0;
      const ramReqHours = d.ramRequestedGbHours ?? 0;
      const ramUsedHours = d.ramUsedGbHours ?? 0;
      const cpuCost = d.cpuCost ?? 0;
      const ramCost = d.ramCost ?? 0;

      const provCost = totalCost;
      const reqCpuCost = cpuHours > 0 ? cpuCost * (cpuReqHours / cpuHours) : 0;
      const reqRamCost = ramHours > 0 ? ramCost * (ramReqHours / ramHours) : 0;
      const reqCost = reqCpuCost + reqRamCost;
      const usedCpuCost = cpuHours > 0 ? cpuCost * (cpuUsedHours / cpuHours) : 0;
      const usedRamCost = ramHours > 0 ? ramCost * (ramUsedHours / ramHours) : 0;
      const usedCost = usedCpuCost + usedRamCost;

      return {
        date: d.date,
        totalCost: totalCost > 0 ? +totalCost.toFixed(0) : undefined,
        provisionedCost: provCost > 0 ? +provCost.toFixed(0) : undefined,
        requestedCost: reqCost > 0 ? +reqCost.toFixed(0) : undefined,
        usedCost: usedCost > 0 ? +usedCost.toFixed(0) : undefined,
      };
    }),
    [costData],
  );

  const enabledSlice = castaiEnabledAt?.slice(0, 10) ?? '';
  const showBaseline = enabledSlice && chartData.length > 0 && chartData[0].date < enabledSlice;
  const tickInterval = Math.max(1, Math.ceil(chartData.length / 10));

  // ── Rate-based savings ($/prov-cpu-hr) ───────────────────────────────────
  const hasRateBasedSavings = roiData && roiData.baseline.costPerCpuHour > 0;
  const baselineCpuRate = roiData?.baseline.costPerCpuHour ?? 0;
  const baselineRamRate = roiData?.baseline.costPerGbHour ?? 0;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const currentRates = useMemo(() => {
    const recent = costData.slice(-30).filter(d => (d.cpuHours ?? 0) > 0);
    if (!recent.length) return { cpuRate: 0, ramRate: 0 };
    const totalCpuCost = recent.reduce((s, d) => s + (d.cpuCost ?? 0), 0);
    const totalCpuHrs = recent.reduce((s, d) => s + (d.cpuHours ?? 0), 0);
    const totalRamCost = recent.reduce((s, d) => s + (d.ramCost ?? 0), 0);
    const totalRamHrs = recent.reduce((s, d) => s + (d.memoryGbHours ?? 0), 0);
    return {
      cpuRate: totalCpuHrs > 0 ? totalCpuCost / totalCpuHrs : 0,
      ramRate: totalRamHrs > 0 ? totalRamCost / totalRamHrs : 0,
    };
  }, [costData]);

  const cpuRateSavingsPct = baselineCpuRate > 0 && currentRates.cpuRate > 0
    ? ((baselineCpuRate - currentRates.cpuRate) / baselineCpuRate) * 100
    : 0;

  const roiSavings = roiData?.roi.totalSavings ?? 0;
  const roiExpected = roiData?.roi.currentPeriod.expectedCost ?? 0;
  const roiActual = roiData?.roi.currentPeriod.actualCost ?? 0;
  const roiMonths = roiData?.roi.monthsSinceBaseline ?? 1;

  // ── Derived numbers ──────────────────────────────────────────────────────
  const annualSavings = savings.hasPreCastData ? savings.monthlySavings * 12 : 0;
  const savingsPct = savings.hasPreCastData && savings.preCastAvgDaily > 0
    ? (savings.dailySavings / savings.preCastAvgDaily) * 100
    : 0;
  const netMonthlySavings = savings.monthlySavings - monthlyFee;
  const paybackMonths = netMonthlySavings > 0 ? Math.ceil(monthlyFee / netMonthlySavings) : null;

  const cpuUtil = efficiency && efficiency.cpuProvisionedCores > 0
    ? ((efficiency.cpuUsedCores / efficiency.cpuProvisionedCores) * 100).toFixed(0)
    : null;
  const ramUtil = efficiency && efficiency.memoryProvisionedGb > 0
    ? ((efficiency.memoryUsedGb / efficiency.memoryProvisionedGb) * 100).toFixed(0)
    : null;

  const clusterLabel = clusterName ?? 'this cluster';

  return (
    <div className="space-y-6">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-white">
        <div className="text-sm font-medium text-emerald-100 uppercase tracking-wide mb-2">
          CAST AI ROI Summary — {clusterLabel}
        </div>
        {savings.hasPreCastData ? (
          <>
            <h1 className="text-3xl font-bold mb-3">
              Saving {fmtFull$(savings.monthlySavings)}/month ({savingsPct.toFixed(0)}% cost reduction)
            </h1>
            <p className="text-emerald-100 text-base leading-relaxed max-w-3xl">
              Before CAST AI, {clusterLabel} cost <span className="text-white font-semibold">{fmtFull$(savings.preCastAvgDaily)}/day</span>.
              Today it costs <span className="text-white font-semibold">{fmtFull$(savings.postCastAvgDaily)}/day</span>.
              That&apos;s <span className="text-white font-semibold">{fmtFull$(savings.dailySavings)} saved every day</span>.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-3">
              Current cost: {fmtFull$(savings.postCastAvgDaily)}/day
            </h1>
            <p className="text-emerald-100 text-base leading-relaxed max-w-3xl">
              CAST AI is actively optimizing {clusterLabel}. No pre-CAST AI baseline data is available for a direct before/after comparison.
            </p>
          </>
        )}
      </div>

      {/* ── Key numbers ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStat
          label="Baseline (pre-autoscaler)"
          value={savings.hasPreCastData ? `${fmtFull$(savings.preCastAvgDaily)}/day` : 'N/A'}
          sub={savings.hasPreCastData ? `${fmtFull$(savings.preCastAvgDaily * 30)}/month` : 'no pre-CAST data'}
          color="text-slate-600"
          bg="bg-slate-50"
        />
        <BigStat
          label="With CAST AI"
          value={`${fmtFull$(savings.postCastAvgDaily)}/day`}
          sub={`${fmtFull$(savings.postCastAvgDaily * 30)}/month`}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <BigStat
          label="Monthly Savings"
          value={savings.hasPreCastData ? fmtFull$(savings.monthlySavings) : 'N/A'}
          sub={savings.hasPreCastData ? `${savingsPct.toFixed(0)}% reduction` : 'need baseline data'}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <BigStat
          label="Annual Savings"
          value={savings.hasPreCastData ? fmtFull$(annualSavings) : 'N/A'}
          sub={savings.hasPreCastData ? 'projected at current rate' : ''}
          color="text-indigo-600"
          bg="bg-indigo-50"
        />
      </div>

      {/* ── THE chart: cost/day with provisioned/requested/used ────────────── */}
      <Collapsible title="Cost Per Day — Pre-CAST AI to Today" color="emerald" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <p className="text-sm text-gray-500 mb-2">
          Your actual daily cost over time with three cost layers underneath:
        </p>
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500 rounded inline-block" style={{height: 3}} />
            <span className="font-semibold text-gray-700">Green line</span> = actual daily cost (what you paid)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-red-100 border border-red-300 rounded-sm inline-block" />
            <span className="font-semibold text-gray-700">Red area</span> = provisioned cost (total billed capacity)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-amber-100 border border-amber-300 rounded-sm inline-block" />
            <span className="font-semibold text-gray-700">Amber area</span> = requested cost (what pods asked for)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-emerald-100 border border-emerald-300 rounded-sm inline-block" />
            <span className="font-semibold text-gray-700">Green area</span> = used cost (actual compute work)
          </span>
        </div>

        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              interval={tickInterval}
              tickFormatter={fmtDateShort}
            />
            <YAxis
              yAxisId="main"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip content={<CostTooltip />} />

            {/* Pre-CAST AI shading = full baseline period */}
            {showBaseline && (
              <ReferenceArea
                yAxisId="main"
                x1={chartData[0].date}
                x2={enabledSlice}
                fill="#94a3b8"
                fillOpacity={0.12}
                stroke="#94a3b8"
                strokeOpacity={0.4}
                strokeDasharray="4 2"
                label={{ value: 'Baseline (pre-autoscaler)', position: 'insideTopLeft', fontSize: 11, fill: '#475569' }}
              />
            )}

            {/* Baseline avg reference line */}
            {savings.hasPreCastData && (
              <ReferenceLine
                yAxisId="main"
                y={savings.preCastAvgDaily}
                stroke="#94a3b8"
                strokeDasharray="8 4"
                label={{ value: `Baseline avg: ${fmtFull$(savings.preCastAvgDaily)}/day`, position: 'insideTopRight', fontSize: 11, fill: '#475569' }}
              />
            )}

            {/* Efficiency areas — back to front */}
            <Area yAxisId="main" type="monotone" dataKey="provisionedCost" fill="#fee2e2" stroke="#ef4444" strokeWidth={1} fillOpacity={0.4} dot={false} name="Provisioned" />
            <Area yAxisId="main" type="monotone" dataKey="requestedCost"   fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} fillOpacity={0.5} dot={false} name="Requested" />
            <Area yAxisId="main" type="monotone" dataKey="usedCost"        fill="#d1fae5" stroke="#10b981" strokeWidth={1} fillOpacity={0.6} dot={false} name="Used" />

            {/* Actual cost line on top */}
            <Line yAxisId="main" type="monotone" dataKey="totalCost" stroke="#10b981" strokeWidth={2.5} dot={false} name="Actual Cost" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Chart explanation */}
        <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">How to read this: </span>
          The <span className="text-red-600 font-semibold">red area</span> is what cloud providers billed (all provisioned capacity).
          The <span className="text-amber-600 font-semibold">amber area</span> is what your pods actually requested.
          The <span className="text-emerald-600 font-semibold">green area</span> is what was truly used by workloads.
          The gaps between them are waste — CAST AI shrinks these by right-sizing pods (amber→green gap) and removing idle nodes (red→amber gap).
          {savings.hasPreCastData && (
            <> You can see the cost drop after CAST AI was enabled — from {fmtFull$(savings.preCastAvgDaily)}/day down to {fmtFull$(savings.postCastAvgDaily)}/day.</>
          )}
        </div>
      </Collapsible>

      {/* ── $/prov-cpu-hr ─────────────────────────────────────────────────────── */}
      {hasRateBasedSavings && (
        <Collapsible title="Cost Per CPU-Hour: Before vs After" color="blue" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-4">
            <span className="font-semibold text-gray-700">$/prov-cpu-hr</span> = how much you pay per CPU-hour of provisioned capacity. This is the unit rate your cloud provider charges.
            CAST AI lowers it by using spot instances and consolidating nodes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-slate-50 rounded-xl text-center">
              <div className="text-sm text-gray-500 mb-1">Baseline (pre-autoscaler)</div>
              <div className="text-2xl font-bold text-slate-700">${baselineCpuRate.toFixed(4)}</div>
              <div className="text-sm text-gray-400">per prov CPU-hr</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl text-center">
              <div className="text-sm text-gray-500 mb-1">With CAST AI</div>
              <div className="text-2xl font-bold text-emerald-600">${currentRates.cpuRate.toFixed(4)}</div>
              <div className="text-xs text-gray-400">per prov CPU-hr</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl text-center">
              <div className="text-xs text-gray-500 mb-1">Rate Reduction</div>
              <div className={`text-2xl font-bold ${cpuRateSavingsPct > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                {cpuRateSavingsPct > 0 ? `${cpuRateSavingsPct.toFixed(0)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400">cheaper per CPU-hr</div>
            </div>
          </div>

          {roiSavings > 0 && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl text-sm text-gray-600 leading-relaxed">
              At the old rate, your current workloads would cost <span className="font-semibold">{fmtFull$(roiExpected)}</span> over {roiMonths} months.
              You actually paid <span className="font-semibold">{fmtFull$(roiActual)}</span> — saving <span className="font-bold text-emerald-700">{fmtFull$(roiSavings)}</span> because
              CAST AI got you cheaper CPU-hours (spot) and reduced total hours needed (right-sizing + consolidation).
            </div>
          )}

          {baselineRamRate > 0 && currentRates.ramRate > 0 && (
            <div className="mt-3 text-xs text-gray-500">
              Memory rate: ${baselineRamRate.toFixed(4)}/GB-hr → ${currentRates.ramRate.toFixed(4)}/GB-hr
              {baselineRamRate > currentRates.ramRate && (
                <span className="text-emerald-600 font-semibold ml-2">
                  ({(((baselineRamRate - currentRates.ramRate) / baselineRamRate) * 100).toFixed(0)}% cheaper)
                </span>
              )}
            </div>
          )}
      </Collapsible>
      )}


      {/* ── Remaining waste ───────────────────────────────────────────────────── */}
      {efficiency && (
        <Collapsible title="Remaining Optimization Opportunity" color="orange" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-4">
            Some overhead is normal (reliability, burst capacity). This is what&apos;s still paid for but not fully used.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-orange-50 rounded-xl text-center">
              <div className="text-2xl font-bold text-orange-600">{fmtFull$(efficiency.wastePerDay)}/day</div>
              <div className="text-xs text-gray-500 mt-1">daily waste</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-xl text-center">
              <div className="text-2xl font-bold text-orange-600">{fmtFull$(efficiency.wastePerMonth)}/mo</div>
              <div className="text-xs text-gray-500 mt-1">monthly waste</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl text-center">
              <div className="text-2xl font-bold text-blue-600">{efficiency.utilizationPercent}%</div>
              <div className="text-xs text-gray-500 mt-1">utilization</div>
            </div>
          </div>
        </Collapsible>
      )}

      {/* ── Methodology ───────────────────────────────────────────────────────── */}
      <Collapsible title="How these numbers work" color="gray" defaultOpen={false} className="bg-gray-50 rounded-xl p-4">
        <div className="text-sm text-gray-400 leading-relaxed">
        <strong>Savings</strong> = pre-CAST AI avg daily cost minus post-CAST avg (last 90 days) — from your actual billing.
        <strong> $/prov-cpu-hr</strong> = what you pay per CPU-hour of provisioned capacity (cpuCost ÷ cpuHours). It drops when CAST AI uses spot instances.
        <strong> Chart areas</strong>: provisioned (billed) → requested (pods) → used (real work). The gaps are waste that CAST AI reduces.
        {realSavings && <> <strong>CAST AI&apos;s own number</strong> compares against on-demand list pricing — a different methodology.</>}
        </div>
      </Collapsible>
    </div>
  );
}
