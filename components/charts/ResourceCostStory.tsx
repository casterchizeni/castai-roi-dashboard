'use client';

/**
 * ResourceCostStory
 *
 * Answers: "Where does every dollar go?"
 *
 * Every compute dollar sits in one of three buckets:
 *   1. Used         — actual CPU/RAM work done. Cannot be reduced.
 *   2. Pod headroom — pods requested more than they used (safety buffers).
 *                     CAST AI Workload Autoscaler right-sizes this.
 *   3. Node overhead— nodes provisioned more than pods requested (idle node capacity).
 *                     CAST AI node autoscaler removes this.
 *
 * If castaiEnabledAt is early enough in the data, shows a before/after comparison.
 * Otherwise shows the current state breakdown.
 */

import { useMemo } from 'react';
import type { CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  data: CostDataPoint[];
  castaiEnabledAt?: string;
}

interface PeriodStats {
  label: string;
  days: number;
  // CPU
  cpuProv: number;   // avg $/day provisioned
  cpuReq: number;    // avg $/day at request level
  cpuUsed: number;   // avg $/day at used level
  // Memory
  ramProv: number;
  ramReq: number;
  ramUsed: number;
}

function fmt$(n: number) {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

// Compute averages for a slice of daily data points
function computeStats(slice: CostDataPoint[]): {
  cpuProv: number; cpuReq: number; cpuUsed: number;
  ramProv: number; ramReq: number; ramUsed: number;
  days: number;
} {
  const valid = slice.filter((d) => (d.cpuHours ?? 0) > 0);
  if (!valid.length) return { cpuProv: 0, cpuReq: 0, cpuUsed: 0, ramProv: 0, ramReq: 0, ramUsed: 0, days: 0 };

  let sumCpuProv = 0, sumCpuReq = 0, sumCpuUsed = 0;
  let sumRamProv = 0, sumRamReq = 0, sumRamUsed = 0;

  for (const d of valid) {
    const cpuCost = d.cpuCost ?? 0;
    const ramCost = d.ramCost ?? 0;
    const cpuHours = d.cpuHours ?? 0;
    const ramHours = d.memoryGbHours ?? 0;

    // Cost rate ($/hour) for each resource
    const cpuRate = cpuHours > 0 ? cpuCost / cpuHours : 0;
    const ramRate = ramHours > 0 ? ramCost / ramHours : 0;

    // Hypothetical cost if provisioned == requested / used
    sumCpuProv += cpuCost;
    sumCpuReq  += cpuRate * (d.cpuRequestedHours ?? 0);
    sumCpuUsed += cpuRate * (d.cpuUsedHours ?? 0);

    sumRamProv += ramCost;
    sumRamReq  += ramRate * (d.ramRequestedGbHours ?? 0);
    sumRamUsed += ramRate * (d.ramUsedGbHours ?? 0);
  }

  const n = valid.length;
  return {
    cpuProv: sumCpuProv / n,
    cpuReq:  sumCpuReq  / n,
    cpuUsed: sumCpuUsed / n,
    ramProv: sumRamProv / n,
    ramReq:  sumRamReq  / n,
    ramUsed: sumRamUsed / n,
    days: n,
  };
}

// Horizontal stacked bar showing the three cost layers (all values in $/day, displayed as $/mo)
function CostBar({ prov, req, used, label, sublabel }: {
  prov: number; req: number; used: number;
  label: string; sublabel?: string;
}) {
  if (!prov) return null;

  const nodeOverhead = Math.max(0, prov - req);
  const podHeadroom  = Math.max(0, req - used);
  const actualUsed   = Math.max(0, used);

  const usedPct    = pct(actualUsed,   prov);
  const headPct    = pct(podHeadroom,  prov);
  const overPct    = pct(nodeOverhead, prov);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-xs font-semibold text-gray-700">{label}</span>
          {sublabel && <span className="text-xs text-gray-400 ml-1">({sublabel})</span>}
        </div>
        <span className="text-xs font-bold text-gray-900">{fmt$(prov * 30)}/mo</span>
      </div>
      {/* Stacked bar */}
      <div className="flex h-8 rounded-lg overflow-hidden w-full">
        {/* Used — green */}
        {usedPct > 0 && (
          <div
            className="bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative group"
            style={{ width: `${usedPct}%`, minWidth: usedPct > 8 ? undefined : '2px' }}
          >
            {usedPct >= 8 && (
              <span className="truncate px-1">{usedPct}%</span>
            )}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
              Used: {fmt$(actualUsed * 30)}/mo · {usedPct}% of total
            </span>
          </div>
        )}
        {/* Pod headroom — amber */}
        {headPct > 0 && (
          <div
            className="bg-amber-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative group"
            style={{ width: `${headPct}%`, minWidth: headPct > 8 ? undefined : '2px' }}
          >
            {headPct >= 8 && (
              <span className="truncate px-1">{headPct}%</span>
            )}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
              Pod headroom: {fmt$(podHeadroom * 30)}/mo · {headPct}% of total
            </span>
          </div>
        )}
        {/* Node overhead — red */}
        {overPct > 0 && (
          <div
            className="bg-red-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative group"
            style={{ width: `${overPct}%`, minWidth: overPct > 8 ? undefined : '2px' }}
          >
            {overPct >= 8 && (
              <span className="truncate px-1">{overPct}%</span>
            )}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-lg">
              Node overhead: {fmt$(nodeOverhead * 30)}/mo · {overPct}% of total
            </span>
          </div>
        )}
      </div>
      {/* Breakdown under bar */}
      <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />Used: {fmt$(actualUsed * 30)}/mo ({usedPct}%)</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />Pod headroom: {fmt$(podHeadroom * 30)}/mo ({headPct}%)</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-red-400 mr-1" />Node overhead: {fmt$(nodeOverhead * 30)}/mo ({overPct}%)</span>
      </div>
    </div>
  );
}

// Single-number delta callout (values already in $/mo)
function DeltaLine({ label, before, after }: { label: string; before: number; after: number }) {
  if (!before || !after) return null;
  const saved = before - after;
  const pctSaved = pct(saved, before);
  if (saved <= 0) return null;
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-gray-400 line-through">{fmt$(before)}/mo</span>
        <span className="font-semibold text-gray-800">{fmt$(after)}/mo</span>
        <span className="font-bold text-emerald-600">↓{pctSaved}%</span>
      </div>
    </div>
  );
}

export default function ResourceCostStory({ data, castaiEnabledAt }: Props) {
  const { current, baseline, hasBaseline } = useMemo(() => {
    if (!data?.length) return { current: null, baseline: null, hasBaseline: false };

    const enabledDate = castaiEnabledAt?.slice(0, 10) ?? '';
    const hasBase = enabledDate && data.some((d) => d.date < enabledDate) && data.some((d) => d.date >= enabledDate);

    if (hasBase && enabledDate) {
      const baseSlice    = data.filter((d) => d.date < enabledDate);
      const currentSlice = data.filter((d) => d.date >= enabledDate).slice(-90);
      return {
        baseline: computeStats(baseSlice),
        current:  computeStats(currentSlice),
        hasBaseline: true,
      };
    }

    // No baseline — just show current state using last 90 days
    return {
      current: computeStats(data.slice(-90)),
      baseline: null,
      hasBaseline: false,
    };
  }, [data, castaiEnabledAt]);

  if (!current || (!current.cpuProv && !current.ramProv)) return null;

  // Totals for the summary callout
  const currTotal = current.cpuProv + current.ramProv;
  const baseTotal = baseline ? baseline.cpuProv + baseline.ramProv : 0;

  // What CAST AI eliminated
  const currOverhead = Math.max(0, current.cpuProv - current.cpuReq) + Math.max(0, current.ramProv - current.ramReq);
  const currHeadroom = Math.max(0, current.cpuReq - current.cpuUsed) + Math.max(0, current.ramReq - current.ramUsed);
  const currUsed     = (current.cpuUsed + current.ramUsed);

  const baseOverhead = baseline ? Math.max(0, baseline.cpuProv - baseline.cpuReq) + Math.max(0, baseline.ramProv - baseline.ramReq) : 0;
  const baseHeadroom = baseline ? Math.max(0, baseline.cpuReq - baseline.cpuUsed) + Math.max(0, baseline.ramReq - baseline.ramUsed) : 0;

  return (
    <Collapsible title="Where every compute dollar goes" color="emerald" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Description */}
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Where every compute dollar goes — broken into three layers: what workloads actually consumed, the safety headroom pods requested beyond usage, and the node capacity provisioned beyond all requests.
      </p>

      {/* Header */}
      <div className="mb-5">
        <p className="text-sm text-gray-500 mt-0.5">
          Three layers of cost: what you actually <span className="text-emerald-600 font-semibold">use</span>, what pods <span className="text-amber-500 font-semibold">request</span> beyond that, and what nodes <span className="text-red-500 font-semibold">provision</span> beyond what pods request.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-5 p-3 bg-slate-50 rounded-lg text-xs">
        <div className="flex items-start gap-2">
          <div className="w-3 h-3 rounded-sm bg-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold text-gray-800">Used</span>
            <p className="text-gray-500">Actual CPU/RAM consumed by workloads. Cannot be reduced — this is the minimum cost of running your software.</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-3 h-3 rounded-sm bg-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold text-gray-800">Pod headroom</span>
            <p className="text-gray-500">What pods <em>request</em> minus what they <em>use</em>. Safety buffer in pod resource specs. CAST AI's <strong>Workload Autoscaler</strong> right-sizes this.</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-3 h-3 rounded-sm bg-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold text-gray-800">Node overhead</span>
            <p className="text-gray-500">What nodes <em>provision</em> minus what pods <em>request</em>. Idle node capacity. CAST AI's <strong>node autoscaler</strong> removes idle nodes to close this gap.</p>
          </div>
        </div>
      </div>

      {/* ── Current state (or "With CAST AI" if we have baseline) ── */}
      <div className="mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
          {hasBaseline ? `With CAST AI — avg over last ${current.days} days` : `Current state — avg over last ${current.days} days`}
        </h3>
        {current.cpuProv > 0 && (
          <CostBar prov={current.cpuProv} req={current.cpuReq} used={current.cpuUsed} label="CPU" sublabel="$/mo avg" />
        )}
        {current.ramProv > 0 && (
          <CostBar prov={current.ramProv} req={current.ramReq} used={current.ramUsed} label="Memory" sublabel="$/mo avg" />
        )}
        {/* Total */}
        <div className="mt-3 flex items-center justify-between text-sm border-t border-gray-100 pt-3">
          <span className="text-gray-500">Total compute/month</span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">
              {fmt$(currUsed * 30)} real work + {fmt$(currHeadroom * 30)} pod headroom + {fmt$(currOverhead * 30)} node overhead
            </span>
            <span className="font-bold text-gray-900">{fmt$(currTotal * 30)}/mo</span>
          </div>
        </div>
      </div>

      {/* ── Baseline comparison (if available) ── */}
      {hasBaseline && baseline && (
        <>
          <div className="mb-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
              Before CAST AI — avg over {baseline.days} baseline days
              {baseline.days < 30 && (
                <span className="ml-2 text-amber-600 font-normal normal-case">
                  ({baseline.days}-day baseline → normalized to 30-day monthly rate)
                </span>
              )}
            </h3>
            {baseline.cpuProv > 0 && (
              <CostBar prov={baseline.cpuProv} req={baseline.cpuReq} used={baseline.cpuUsed} label="CPU" sublabel="$/mo avg" />
            )}
            {baseline.ramProv > 0 && (
              <CostBar prov={baseline.ramProv} req={baseline.ramReq} used={baseline.ramUsed} label="Memory" sublabel="$/mo avg" />
            )}
            <div className="mt-3 flex items-center justify-between text-sm border-t border-gray-100 pt-3">
              <span className="text-gray-500">Total compute/month</span>
              <span className="font-bold text-gray-900">{fmt$(baseTotal * 30)}/mo</span>
            </div>
          </div>

          {/* Before/after delta summary */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-3">What CAST AI changed</p>
            <DeltaLine label="Total monthly cost" before={baseTotal * 30} after={currTotal * 30} />
            <DeltaLine label="Node overhead (idle node capacity)" before={baseOverhead * 30} after={currOverhead * 30} />
            <DeltaLine label="Pod headroom (request vs actual use)" before={baseHeadroom * 30} after={currHeadroom * 30} />
            {baseTotal > 0 && currTotal > 0 && (
              <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-800">Monthly savings (real data)</span>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-700">{fmt$((baseTotal - currTotal) * 30)}/mo</div>
                  <div className="text-xs text-emerald-600">{pct(baseTotal - currTotal, baseTotal)}% reduction · est. {fmt$((baseTotal - currTotal) * 365)}/year</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── No-baseline note ── */}
      {!hasBaseline && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 leading-relaxed">
          <span className="font-semibold">No pre-CAST AI baseline available</span> — CAST AI was active from (or very near) the start of data collection. The bars above show the current efficiency level that CAST AI is maintaining. The "node overhead" and "pod headroom" bars represent remaining optimization opportunity, not pre-CAST waste.
        </div>
      )}

      {/* How the numbers are calculated */}
      <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 leading-relaxed">
        <span className="font-semibold text-gray-500">Methodology:</span> Costs from CAST AI efficiency API (cpuCost + ramCost per day). "Used cost" = actual cost × (cpuUsedHours / cpuProvisionedHours). "Pod headroom cost" = actual cost × (requestedHours - usedHours) / provisionedHours. "Node overhead cost" = actual cost × (provisionedHours - requestedHours) / provisionedHours. All are derived from real provisioned resource costs — not on-demand pricing models.
      </div>
    </Collapsible>
  );
}
