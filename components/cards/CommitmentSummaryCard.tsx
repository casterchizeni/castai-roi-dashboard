'use client';

import type { CommitmentROILayer } from '@/lib/calculations/multi-cluster-roi';

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

interface Props {
  commitments: CommitmentROILayer;
}

export default function CommitmentSummaryCard({ commitments: c }: Props) {
  const { onDemandRatePerCpuHr, riRatePerCpuHr, castaiRatePerCpuHr } = c;

  // Three-layer bar widths (normalized to on-demand = 100%)
  const maxRate = onDemandRatePerCpuHr ?? riRatePerCpuHr ?? 1;
  const riBarPct = riRatePerCpuHr && maxRate > 0 ? (riRatePerCpuHr / maxRate) * 100 : 0;
  const castaiBarPct = castaiRatePerCpuHr && maxRate > 0 ? (castaiRatePerCpuHr / maxRate) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-teal-50 border-b border-teal-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-sm font-semibold text-teal-800">Reserved Instances</span>
        <span className="text-xs text-teal-600 ml-auto">{c.totalActiveRIs} active</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-gray-100 p-3">
            <div className="text-xs text-gray-500 mb-1">Active RIs</div>
            <div className="text-lg font-bold text-teal-600">{c.totalActiveRIs}</div>
            <div className="text-xs text-gray-400">{c.preCastCount} pre-CAST, {c.postCastCount} post</div>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <div className="text-xs text-gray-500 mb-1">Coverage</div>
            <div className="text-lg font-bold text-teal-600">{c.coveragePct.toFixed(0)}%</div>
            <div className="text-xs text-gray-400">of provisioned CPUs</div>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <div className="text-xs text-gray-500 mb-1">Monthly RI spend</div>
            <div className="text-lg font-bold text-gray-800">{fmt$(c.estimatedMonthlyRiSpend)}</div>
            <div className="text-xs text-gray-400">committed cost</div>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <div className="text-xs text-gray-500 mb-1">RI $/CPU-hr</div>
            <div className="text-lg font-bold text-gray-800">
              {c.avgRiCostPerCpuHr != null ? `$${c.avgRiCostPerCpuHr.toFixed(4)}` : '—'}
            </div>
            <div className="text-xs text-gray-400">avg across active RIs</div>
          </div>
        </div>

        {/* Three-layer cost bar */}
        {onDemandRatePerCpuHr && onDemandRatePerCpuHr > 0 && (riBarPct > 0 || castaiBarPct > 0) && (
          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">$/CPU-hr — Three Layers</h4>
            <div className="space-y-2">
              {/* On-demand */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 text-right">On-demand</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div className="bg-gray-400 h-full rounded-full" style={{ width: '100%' }} />
                  <span className="absolute right-2 top-0.5 text-xs text-white font-semibold">
                    ${onDemandRatePerCpuHr.toFixed(4)}
                  </span>
                </div>
              </div>
              {/* RI rate */}
              {riBarPct > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 text-right">RI rate</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                    <div className="bg-teal-500 h-full rounded-full" style={{ width: `${Math.max(riBarPct, 10)}%` }} />
                    <span className="absolute right-2 top-0.5 text-xs text-white font-semibold">
                      ${riRatePerCpuHr!.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
              {/* CAST AI optimized */}
              {castaiBarPct > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 text-right">With CAST AI</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.max(castaiBarPct, 10)}%` }} />
                    <span className="absolute right-2 top-0.5 text-xs text-white font-semibold">
                      ${castaiRatePerCpuHr!.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              On-demand rate from pre-CAST baseline. RI rate from commitment pricing. CAST AI rate includes all optimizations.
            </p>
          </div>
        )}

        {/* Warnings */}
        {c.inactiveCount > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">&#9888;&#65039;</span>
            <span>
              {c.inactiveCount} RI{c.inactiveCount !== 1 ? 's are' : ' is'} active but <strong>not orchestrated</strong> by CAST AI.
              Enabling commitment management could improve utilization of these reservations.
            </span>
          </div>
        )}

        {c.missingCostCount > 0 && (
          <p className="text-xs text-gray-400">
            Note: {c.missingCostCount} commitment{c.missingCostCount !== 1 ? 's' : ''} had no pricing data from the API. Estimates above exclude these.
          </p>
        )}
      </div>
    </div>
  );
}
