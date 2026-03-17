'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import type { CostDataPoint, Cluster, EfficiencyReport, NodeMetrics } from '@/types/castai';

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function fmtPct(n: number) {
  return n.toFixed(0) + '%';
}

interface MonthlyBucket {
  month: string;
  label: string;
  totalCost: number;
  spotCost: number;
  onDemandCost: number;
  cpuHours: number;
  cpuUsedHours: number;
  avgDailyCost: number;
  normalizedMonthlyCost: number;
  days: number;
  isPreCast: boolean;
}

function aggregateMonthly(
  daily: CostDataPoint[],
  castaiEnabledAt?: string,
): MonthlyBucket[] {
  const enabledDate = castaiEnabledAt?.slice(0, 10) ?? '';
  const buckets: Record<string, Omit<MonthlyBucket, 'label' | 'avgDailyCost' | 'normalizedMonthlyCost' | 'isPreCast'>> = {};

  for (const d of daily) {
    const ym = d.date.slice(0, 7);
    if (!buckets[ym]) {
      buckets[ym] = { month: ym, totalCost: 0, spotCost: 0, onDemandCost: 0, cpuHours: 0, cpuUsedHours: 0, days: 0 };
    }
    buckets[ym].totalCost += d.totalCost ?? 0;
    buckets[ym].spotCost += d.spotCost ?? 0;
    buckets[ym].onDemandCost += d.onDemandCost ?? 0;
    buckets[ym].cpuHours += d.cpuHours ?? 0;
    buckets[ym].cpuUsedHours += d.cpuUsedHours ?? 0;
    buckets[ym].days++;
  }

  return Object.values(buckets)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((b) => {
      const avgDaily = b.days > 0 ? b.totalCost / b.days : 0;
      const monthEnd = `${b.month}-28`;
      const isPreCast = enabledDate ? monthEnd < enabledDate : false;
      return { ...b, label: monthLabel(b.month), avgDailyCost: avgDaily, normalizedMonthlyCost: avgDaily * 30, isPreCast };
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MonthTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as MonthlyBucket | undefined;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-56">
      <div className="font-semibold text-gray-900 mb-2 border-b border-gray-100 pb-1">
        {label} {d.isPreCast ? '(Pre-CAST AI)' : '(With CAST AI)'}
      </div>
      <div className="flex justify-between py-0.5"><span className="text-gray-600">Monthly (norm.)</span><span className="font-bold">{fmt$(d.normalizedMonthlyCost)}</span></div>
      <div className="flex justify-between py-0.5"><span className="text-gray-600">Actual spend</span><span className="font-semibold">{fmt$(d.totalCost)}</span></div>
      <div className="flex justify-between py-0.5"><span className="text-gray-600">Avg daily</span><span className="font-semibold">{fmt$(d.avgDailyCost)}/day</span></div>
      <div className="flex justify-between py-0.5"><span className="text-amber-600">On-demand</span><span className="font-semibold">{fmt$(d.onDemandCost)}</span></div>
      <div className="flex justify-between py-0.5"><span className="text-purple-600">Spot</span><span className="font-semibold">{fmt$(d.spotCost)}</span></div>
      <div className="text-gray-400 mt-1 pt-1 border-t border-gray-100">{d.days} day{d.days !== 1 ? 's' : ''} of data</div>
    </div>
  );
}

function MetricCard({ label, value, sub, accent = 'emerald' }: { label: string; value: string; sub?: string; accent?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent] ?? colors.slate}`}>
      <div className="text-xs font-medium opacity-70 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  cluster?: Cluster;
  clusterId: string;
  costData: CostDataPoint[];
  castaiEnabledAt?: string;
  efficiency?: EfficiencyReport;
  nodeMetrics?: NodeMetrics;
  savings?: { totalSavings?: number; totalCost?: number };
  loading?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ReportView({ cluster, clusterId, costData, castaiEnabledAt, efficiency, nodeMetrics, savings, loading }: Props) {
  const monthly = useMemo(() => aggregateMonthly(costData, castaiEnabledAt), [costData, castaiEnabledAt]);

  const preCastMonths = monthly.filter((m) => m.isPreCast);
  const postCastMonths = monthly.filter((m) => !m.isPreCast);

  const preAvgMonthly = preCastMonths.length > 0
    ? preCastMonths.reduce((s, m) => s + m.normalizedMonthlyCost, 0) / preCastMonths.length
    : 0;

  const recentMonths = postCastMonths.slice(-3);
  const recentAvgMonthly = recentMonths.length > 0
    ? recentMonths.reduce((s, m) => s + m.normalizedMonthlyCost, 0) / recentMonths.length
    : postCastMonths.length > 0
      ? postCastMonths.reduce((s, m) => s + m.normalizedMonthlyCost, 0) / postCastMonths.length
      : 0;

  const monthlySavings = preAvgMonthly > 0 ? preAvgMonthly - recentAvgMonthly : 0;
  const savingsPct = preAvgMonthly > 0 ? (monthlySavings / preAvgMonthly) * 100 : 0;
  const annualSavings = monthlySavings * 12;
  const hasPreCast = preCastMonths.length > 0;

  const spotTrend = monthly.map((m) => {
    const total = m.spotCost + m.onDemandCost;
    return { label: m.label, spotPct: total > 0 ? (m.spotCost / total) * 100 : 0 };
  });

  const cpuTrend = monthly.map((m) => ({
    label: m.label,
    utilization: m.cpuHours > 0 ? (m.cpuUsedHours / m.cpuHours) * 100 : 0,
  }));

  const cpuUtil = efficiency
    ? ((efficiency.cpuUsedCores / Math.max(efficiency.cpuProvisionedCores, 1)) * 100) : 0;
  const ramUtil = efficiency
    ? ((efficiency.memoryUsedGb / Math.max(efficiency.memoryProvisionedGb, 1)) * 100) : 0;

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const clusterName = cluster?.name ?? clusterId;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading report data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 print:space-y-8">

      {/* COVER */}
      <header className="text-center pb-8 border-b-2 border-emerald-200">
        <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 bg-emerald-50 rounded-full">
          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">CAST AI Cost Optimization Report</span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">{clusterName}</h1>
        <p className="text-gray-500 text-sm">
          {cluster?.provider} · {cluster?.region} · Generated {today}
        </p>
      </header>

      {/* EXECUTIVE SUMMARY */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-1 h-6 bg-emerald-500 rounded-full" />
          Executive Summary
        </h2>

        {hasPreCast ? (
          <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl p-6 mb-6 border border-emerald-100">
            <p className="text-gray-700 leading-relaxed">
              Since CAST AI was enabled on <strong>{clusterName}</strong>, the cluster&apos;s normalized monthly cost
              dropped from <strong>{fmt$(preAvgMonthly)}/mo</strong> to <strong>{fmt$(recentAvgMonthly)}/mo</strong> — a
              reduction of <strong>{fmt$(monthlySavings)}/mo ({fmtPct(savingsPct)})</strong>. Projected annual
              savings: <strong>{fmt$(annualSavings)}</strong>.
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 rounded-xl p-6 mb-6 border border-blue-100">
            <p className="text-gray-700 leading-relaxed">
              <strong>{clusterName}</strong> is actively managed by CAST AI. The current normalized monthly cost
              is <strong>{fmt$(recentAvgMonthly)}/mo</strong>. CAST AI is continuously optimizing through right-sizing,
              spot adoption, and node consolidation.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {hasPreCast && (
            <MetricCard label="Before CAST AI" value={fmt$(preAvgMonthly) + '/mo'} sub="avg monthly (normalized)" accent="slate" />
          )}
          <MetricCard label="Current Cost" value={fmt$(recentAvgMonthly) + '/mo'} sub="last 3 months avg" accent="emerald" />
          {hasPreCast && (
            <MetricCard label="Monthly Savings" value={fmt$(monthlySavings)} sub={fmtPct(savingsPct) + ' reduction'} accent="blue" />
          )}
          <MetricCard
            label={hasPreCast ? 'Annual Projection' : 'Annual Cost Rate'}
            value={hasPreCast ? fmt$(annualSavings) + ' saved' : fmt$(recentAvgMonthly * 12) + '/yr'}
            sub={hasPreCast ? 'at current trend' : 'projected'}
            accent="indigo"
          />
        </div>
      </section>

      {/* MONTHLY COST TREND */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
          <span className="w-1 h-6 bg-blue-500 rounded-full" />
          Monthly Cost Trend
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Normalized to 30-day months. {hasPreCast ? 'Grey = pre-CAST AI. Green = with CAST AI.' : 'All months show optimized costs.'}
          {hasPreCast && <> Dashed line = pre-CAST AI average ({fmt$(preAvgMonthly)}/mo).</>}
        </p>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthly} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip content={<MonthTooltip />} />
              {hasPreCast && (
                <ReferenceLine y={preAvgMonthly} stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={1.5}
                  label={{ value: `Pre-CAST avg: ${fmt$(preAvgMonthly)}`, position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
              )}
              <Bar dataKey="normalizedMonthlyCost" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {monthly.map((entry, i) => (
                  <Cell key={i} fill={entry.isPreCast ? '#94a3b8' : '#10b981'} fillOpacity={entry.isPreCast ? 0.6 : 0.85} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="normalizedMonthlyCost" stroke="#1e293b" strokeWidth={1.5} dot={false} strokeDasharray="2 2" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-2 font-medium">Month</th>
                <th className="text-right py-2 font-medium">Days</th>
                <th className="text-right py-2 font-medium">Actual Spend</th>
                <th className="text-right py-2 font-medium">Norm. Monthly</th>
                <th className="text-right py-2 font-medium">Avg/Day</th>
                <th className="text-right py-2 font-medium">Spot %</th>
                {hasPreCast && <th className="text-right py-2 font-medium">vs Baseline</th>}
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => {
                const diff = hasPreCast ? ((m.normalizedMonthlyCost - preAvgMonthly) / preAvgMonthly) * 100 : 0;
                const spotPct = (m.spotCost + m.onDemandCost) > 0 ? (m.spotCost / (m.spotCost + m.onDemandCost)) * 100 : 0;
                return (
                  <tr key={m.month} className={`border-b border-gray-100 ${m.isPreCast ? 'bg-gray-50' : ''}`}>
                    <td className="py-2 font-medium text-gray-900">{m.label}{m.isPreCast && <span className="ml-1 text-gray-400 text-[10px]">(pre)</span>}</td>
                    <td className="py-2 text-right text-gray-500">{m.days}d</td>
                    <td className="py-2 text-right font-semibold text-gray-700">{fmt$(m.totalCost)}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{fmt$(m.normalizedMonthlyCost)}</td>
                    <td className="py-2 text-right text-gray-600">{fmt$(m.avgDailyCost)}</td>
                    <td className="py-2 text-right text-purple-600">{fmtPct(spotPct)}</td>
                    {hasPreCast && (
                      <td className={`py-2 text-right font-semibold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {m.isPreCast ? '—' : `${diff > 0 ? '+' : ''}${fmtPct(diff)}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SPOT ADOPTION */}
      {spotTrend.some((s) => s.spotPct > 0) && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <span className="w-1 h-6 bg-purple-500 rounded-full" />
            Spot Instance Adoption
          </h2>
          <p className="text-xs text-gray-500 mb-4">Percentage of compute cost on spot instances. Higher = more savings.</p>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={spotTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                <Area type="monotone" dataKey="spotPct" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {nodeMetrics && (
            <div className="mt-4 grid grid-cols-3 gap-4">
              <MetricCard label="Total Nodes" value={String(nodeMetrics.totalNodes)} sub="running today" accent="slate" />
              <MetricCard label="Spot Nodes" value={String(nodeMetrics.spotNodes)}
                sub={fmtPct(nodeMetrics.totalNodes > 0 ? (nodeMetrics.spotNodes / nodeMetrics.totalNodes) * 100 : 0) + ' of fleet'} accent="indigo" />
              <MetricCard label="On-Demand" value={String(nodeMetrics.onDemandNodes)} sub="stable capacity" accent="orange" />
            </div>
          )}
        </section>
      )}

      {/* EFFICIENCY SNAPSHOT */}
      {efficiency && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <span className="w-1 h-6 bg-orange-500 rounded-full" />
            Current Resource Efficiency
          </h2>
          <p className="text-xs text-gray-500 mb-4">How efficiently the cluster uses provisioned resources.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="CPU Utilization" value={fmtPct(cpuUtil)}
              sub={`${efficiency.cpuUsedCores.toFixed(1)} / ${efficiency.cpuProvisionedCores.toFixed(1)} cores`}
              accent={cpuUtil > 50 ? 'emerald' : cpuUtil > 30 ? 'orange' : 'red'} />
            <MetricCard label="RAM Utilization" value={fmtPct(ramUtil)}
              sub={`${efficiency.memoryUsedGb.toFixed(1)} / ${efficiency.memoryProvisionedGb.toFixed(1)} GB`}
              accent={ramUtil > 50 ? 'emerald' : ramUtil > 30 ? 'orange' : 'red'} />
            <MetricCard label="Daily Waste" value={fmt$(efficiency.wastePerDay)} sub="over-provisioning cost" accent="red" />
            <MetricCard label="Monthly Waste" value={fmt$(efficiency.wastePerMonth)} sub="remaining opportunity" accent="orange" />
          </div>
          <div className="space-y-3">
            {[
              { label: 'CPU', used: efficiency.cpuUsedCores, requested: efficiency.cpuRequestedCores, provisioned: efficiency.cpuProvisionedCores, unit: 'cores' },
              { label: 'Memory', used: efficiency.memoryUsedGb, requested: efficiency.memoryRequestedGb, provisioned: efficiency.memoryProvisionedGb, unit: 'GB' },
            ].map(({ label, used, requested, provisioned, unit }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span className="font-medium">{label}</span>
                  <span>{used.toFixed(1)} used / {requested.toFixed(1)} req / {provisioned.toFixed(1)} prov {unit}</span>
                </div>
                <div className="h-4 bg-red-100 rounded-full overflow-hidden relative">
                  <div className="absolute h-full bg-amber-300 rounded-full" style={{ width: `${provisioned > 0 ? (requested / provisioned) * 100 : 0}%` }} />
                  <div className="absolute h-full bg-emerald-500 rounded-full" style={{ width: `${provisioned > 0 ? (used / provisioned) * 100 : 0}%` }} />
                </div>
                <div className="flex gap-4 mt-1.5 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Used</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300" />Requested</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-100" />Provisioned</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CPU UTILIZATION TREND */}
      {cpuTrend.some((c) => c.utilization > 0) && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <span className="w-1 h-6 bg-emerald-500 rounded-full" />
            CPU Utilization Over Time
          </h2>
          <p className="text-xs text-gray-500 mb-4">Monthly avg CPU utilization (used / provisioned). Higher = less waste.</p>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cpuTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                <Area type="monotone" dataKey="utilization" stroke="#10b981" fill="#d1fae5" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* CAST AI SAVINGS API */}
      {savings?.totalSavings != null && savings?.totalCost != null && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <span className="w-1 h-6 bg-slate-500 rounded-full" />
            CAST AI Reported Savings (90-Day)
          </h2>
          <p className="text-xs text-gray-500 mb-4">Secondary reference — compares actual spend against on-demand equivalent.</p>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Total Saved (90d)" value={fmt$(savings.totalSavings)} sub="vs on-demand equivalent" accent="emerald" />
            <MetricCard label="Actual Spend (90d)" value={fmt$(savings.totalCost)} sub="what you paid" accent="blue" />
            <MetricCard label="Savings Rate" value={fmtPct(
              (savings.totalCost + savings.totalSavings) > 0 ? (savings.totalSavings / (savings.totalCost + savings.totalSavings)) * 100 : 0
            )} sub="of on-demand equivalent" accent="indigo" />
          </div>
          <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700 leading-relaxed border border-amber-100">
            Note: CAST AI savings compare against on-demand list pricing. The monthly trend above uses your actual historical spend.
          </div>
        </section>
      )}

      {/* BOTTOM LINE */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 text-white">
        <h2 className="text-lg font-bold mb-4">The Bottom Line</h2>
        {hasPreCast ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-4">
                <div className="text-xs text-gray-300 uppercase tracking-wide">Before</div>
                <div className="text-2xl font-extrabold mt-1">{fmt$(preAvgMonthly)}<span className="text-sm font-normal text-gray-400">/mo</span></div>
              </div>
              <div className="bg-emerald-500/20 rounded-xl p-4 border border-emerald-400/30">
                <div className="text-xs text-emerald-300 uppercase tracking-wide">After</div>
                <div className="text-2xl font-extrabold mt-1 text-emerald-400">{fmt$(recentAvgMonthly)}<span className="text-sm font-normal text-emerald-300/60">/mo</span></div>
              </div>
              <div className="bg-blue-500/20 rounded-xl p-4 border border-blue-400/30">
                <div className="text-xs text-blue-300 uppercase tracking-wide">Saving</div>
                <div className="text-2xl font-extrabold mt-1 text-blue-400">{fmt$(monthlySavings)}<span className="text-sm font-normal text-blue-300/60">/mo</span></div>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">
              CAST AI has reduced <strong className="text-white">{clusterName}</strong>&apos;s monthly cost
              by <strong className="text-emerald-400">{fmtPct(savingsPct)}</strong>, saving
              an estimated <strong className="text-blue-400">{fmt$(annualSavings)}/year</strong>.
              {efficiency && (
                <> There&apos;s still <strong className="text-orange-400">{fmt$(efficiency.wastePerMonth)}/mo</strong> in remaining
                  over-provisioning that continued optimization can address.</>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="text-xs text-gray-300 uppercase tracking-wide">Current Optimized Cost</div>
              <div className="text-3xl font-extrabold mt-1">{fmt$(recentAvgMonthly)}<span className="text-sm font-normal text-gray-400">/mo</span></div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">
              CAST AI is actively managing <strong className="text-white">{clusterName}</strong> with continuous
              right-sizing, spot adoption, and node consolidation.
              {savings?.totalSavings != null && (
                <> Over the last 90 days, CAST AI saved <strong className="text-emerald-400">{fmt$(savings.totalSavings)}</strong> compared to on-demand pricing.</>
              )}
            </p>
          </div>
        )}
      </section>

      <footer className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
        Generated {today} · Data from CAST AI · {monthly.length} months of history · {costData.length} days of daily data
      </footer>
    </div>
  );
}
