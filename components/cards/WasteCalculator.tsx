'use client';

import type { EfficiencyReport } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  efficiency: EfficiencyReport;
  loading?: boolean;
}

function GaugeBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{percent.toFixed(0)}% waste</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

export default function WasteCalculator({ efficiency, loading }: Props) {
  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  const cpuWaste = efficiency.cpuProvisionedCores > 0
    ? ((efficiency.cpuProvisionedCores - efficiency.cpuUsedCores) / efficiency.cpuProvisionedCores) * 100
    : 0;
  const memWaste = efficiency.memoryProvisionedGb > 0
    ? ((efficiency.memoryProvisionedGb - efficiency.memoryUsedGb) / efficiency.memoryProvisionedGb) * 100
    : 0;

  return (
    <Collapsible title="Over-Provisioning Waste" color="red" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Estimated daily and monthly waste from over-provisioned CPU and memory. This is capacity you&apos;re paying for but not using.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Waste / Day</span>
          <span className="text-2xl font-bold text-red-500">
            ${efficiency.wastePerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Waste / Month</span>
          <span className="text-2xl font-bold text-orange-500">
            ${efficiency.wastePerMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Utilization</span>
          <span className="text-2xl font-bold text-blue-600">{efficiency.utilizationPercent}%</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <GaugeBar label="CPU Waste" percent={cpuWaste} color="bg-orange-400" />
        <GaugeBar label="Memory Waste" percent={memWaste} color="bg-yellow-400" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div>CPU: {efficiency.cpuUsedCores}c used / {efficiency.cpuProvisionedCores}c provisioned</div>
        <div>Mem: {efficiency.memoryUsedGb}GB used / {efficiency.memoryProvisionedGb}GB provisioned</div>
      </div>
      <div className="mt-4 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 leading-relaxed">
        <span className="font-semibold">Waste vs Savings:</span> Waste = what you&apos;re still overpaying (provisioned − used). This is different from Savings (cost reduction from pre-CAST AI to now).
      </div>
    </Collapsible>
  );
}
