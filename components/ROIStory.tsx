'use client';

import type { EfficiencyReport, CostDataPoint } from '@/types/castai';
import { computeGraphDerivedSavings } from '@/components/charts/EfficiencyTrendChart';
import Collapsible from '@/components/Collapsible';

interface Props {
  costData: CostDataPoint[];
  castaiEnabledAt?: string;
  efficiency: EfficiencyReport;
  totalNodes: number;
  /** CAST AI savings API — shown as secondary reference */
  totalSavingsReal?: number;
  totalCostReal?: number;
  clusterName?: string;
}

interface StepProps {
  number: number;
  title: string;
  body: string;
  highlight?: string;
  color: string;
}

function Step({ number, title, body, highlight, color }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full ${color} text-white flex items-center justify-center font-bold text-sm`}>
          {number}
        </div>
        <div className="w-0.5 flex-1 bg-gray-200 mt-2" />
      </div>
      <div className="pb-8">
        <h3 className="font-semibold text-gray-900 text-base mb-1">{title}</h3>
        <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
        {highlight && (
          <div className={`mt-2 inline-block px-3 py-1 ${color.replace('bg-', 'bg-').replace('600','100').replace('500','100').replace('700','100')} rounded-full text-xs font-semibold text-gray-800`}>
            {highlight}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ROIStory({ costData, castaiEnabledAt, efficiency, totalNodes, totalSavingsReal, totalCostReal, clusterName }: Props) {
  const cpuWaste = efficiency.cpuProvisionedCores > 0
    ? ((efficiency.cpuProvisionedCores - efficiency.cpuUsedCores) / efficiency.cpuProvisionedCores * 100).toFixed(0)
    : '0';
  const ramWaste = efficiency.memoryProvisionedGb > 0
    ? ((efficiency.memoryProvisionedGb - efficiency.memoryUsedGb) / efficiency.memoryProvisionedGb * 100).toFixed(0)
    : '0';

  // ── Graph-derived savings (honest) ─────────────────────────────────────
  const derived = computeGraphDerivedSavings(costData, castaiEnabledAt);

  const clusterLabel = clusterName ?? 'this cluster';
  const hasRealApi = totalSavingsReal != null && totalCostReal != null;

  return (
    <Collapsible title={`How CAST AI Delivered ROI on ${clusterLabel}`} color="blue" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <p className="text-gray-500 text-sm">A step-by-step breakdown based on your actual cost data.</p>
      </div>

      <div className="mt-6">
        <Step
          number={1}
          title="Pre-CAST AI: baseline cost established"
          body={
            derived.hasPreCastData
              ? `Before CAST AI was active, ${clusterLabel} cost an average of $${derived.preCastAvgDaily.toFixed(0)}/day. The cluster ran with static node pools and manually-set resource requests — nodes stayed running 24/7 regardless of actual demand.`
              : `${clusterLabel} was onboarded to CAST AI. No pre-CAST AI cost data is available, so baseline comparisons are limited.`
          }
          highlight={derived.hasPreCastData ? `Baseline: $${derived.preCastAvgDaily.toFixed(0)}/day` : 'No pre-CAST baseline data'}
          color="bg-blue-600"
        />
        <Step
          number={2}
          title="Workload Autoscaler detected over-provisioning"
          body={`CAST AI analysed actual CPU and memory usage across all pods. It found CPU was over-provisioned by ${cpuWaste}% and RAM by ${ramWaste}% — most of the cluster's paid capacity was sitting idle.`}
          highlight={`CPU waste: ${cpuWaste}%  ·  RAM waste: ${ramWaste}%  ·  $${efficiency.wastePerDay.toFixed(0)}/day wasted`}
          color="bg-orange-500"
        />
        <Step
          number={3}
          title="Right-sizing + node consolidation"
          body={`CAST AI automatically right-sized CPU and memory requests to match actual usage (with safety headroom), then consolidated workloads onto fewer nodes. The cluster now runs ${totalNodes} nodes.`}
          highlight={`${totalNodes} nodes running today`}
          color="bg-purple-600"
        />
        <Step
          number={4}
          title="CAST AI optimized: current cost"
          body={`After optimization, ${clusterLabel} now costs $${derived.postCastAvgDaily.toFixed(0)}/day on average (last 90 post-CAST days). CAST AI continuously scales nodes in and out based on demand — you pay only for what you use.`}
          highlight={`Current: $${derived.postCastAvgDaily.toFixed(0)}/day`}
          color="bg-emerald-600"
        />
        <Step
          number={5}
          title={derived.hasPreCastData
            ? `Result: $${derived.dailySavings.toFixed(0)}/day saved`
            : 'Result: savings data'
          }
          body={
            derived.hasPreCastData
              ? `Your cost went from $${derived.preCastAvgDaily.toFixed(0)}/day to $${derived.postCastAvgDaily.toFixed(0)}/day — a daily savings of $${derived.dailySavings.toFixed(0)}. That's $${derived.monthlySavings.toFixed(0)}/month and $${(derived.monthlySavings * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/year. These numbers are derived directly from your cost data.`
              : `Current daily cost is $${derived.postCastAvgDaily.toFixed(0)}/day. Without pre-CAST AI baseline data, we can't compute exact savings from historical comparison.`
          }
          highlight={derived.hasPreCastData
            ? `$${derived.dailySavings.toFixed(0)}/day → $${derived.monthlySavings.toFixed(0)}/mo → $${(derived.monthlySavings * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`
            : undefined
          }
          color="bg-emerald-700"
        />
      </div>

      {/* Summary cards */}
      <div className="mt-2 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="bg-emerald-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-700">
            {derived.hasPreCastData ? `$${derived.dailySavings.toFixed(0)}` : 'N/A'}
          </div>
          <div className="text-xs text-gray-600 mt-1 font-medium">Daily Savings</div>
          <div className="text-xs text-gray-400 mt-0.5">from your cost data</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">
            {derived.hasPreCastData ? `$${derived.monthlySavings.toFixed(0)}` : 'N/A'}
          </div>
          <div className="text-xs text-gray-600 mt-1 font-medium">Monthly Savings</div>
          <div className="text-xs text-gray-400 mt-0.5">daily × 30</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-orange-700">
            ${derived.postCastAvgDaily.toFixed(0)}
          </div>
          <div className="text-xs text-gray-600 mt-1 font-medium">Current Avg/Day</div>
          <div className="text-xs text-gray-400 mt-0.5">post-CAST AI</div>
        </div>
      </div>

      {/* CAST AI API secondary reference */}
      {hasRealApi && (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-600">CAST AI reports (secondary reference): </span>
          ${totalSavingsReal!.toLocaleString(undefined, { maximumFractionDigits: 0 })} saved over 90d · actual spend: ${totalCostReal!.toLocaleString(undefined, { maximumFractionDigits: 0 })} · includes spot pricing + downscaling vs on-demand equivalent.
          <span className="text-amber-600"> This compares against on-demand pricing, not your historical pre-CAST spend.</span>
        </div>
      )}
    </Collapsible>
  );
}
