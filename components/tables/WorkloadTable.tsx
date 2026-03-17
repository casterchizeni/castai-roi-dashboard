'use client';

import { useState } from 'react';
import type { WorkloadCost } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  workloads: WorkloadCost[];
  loading?: boolean;
}

type SortCol = 'workload' | 'cost' | 'cpuRequest' | 'namespace';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return <span className={`ml-1 text-xs ${active ? 'text-indigo-600' : 'text-gray-300'}`}>{active ? (dir === 'desc' ? '\u2193' : '\u2191') : '\u2195'}</span>;
}

export default function WorkloadTable({ workloads, loading }: Props) {
  const [sortCol, setSortCol]   = useState<SortCol>('cost');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [showAll, setShowAll]   = useState(false);

  if (loading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;

  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sorted = [...workloads].sort((a, b) => {
    const va = sortCol === 'workload'    ? a.workloadName
             : sortCol === 'cost'        ? a.cost
             : sortCol === 'namespace'   ? a.namespace
             : a.cpuRequest;
    const vb = sortCol === 'workload'    ? b.workloadName
             : sortCol === 'cost'        ? b.cost
             : sortCol === 'namespace'   ? b.namespace
             : b.cpuRequest;
    if (typeof va === 'string') return sortDir === 'desc' ? vb.toString().localeCompare(va) : va.localeCompare(vb.toString());
    return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
  });

  const display = showAll ? sorted : sorted.slice(0, 20);
  const totalCurrent = workloads.reduce((s, w) => s + w.cost, 0);

  function Th({ col, label, right = true }: { col: SortCol; label: string; right?: boolean }) {
    return (
      <th
        className={`${right ? 'text-right' : 'text-left'} pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none whitespace-nowrap`}
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon active={sortCol === col} dir={sortDir} />
      </th>
    );
  }

  return (
    <Collapsible title="Cost by Workload" color="indigo" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Top workloads by cost. Compares current spend to what CAST AI estimates could be further optimized.
      </p>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-gray-400 mt-0.5">
            7-day snapshot · {workloads.length} workloads · Total: ${totalCurrent.toLocaleString(undefined, {maximumFractionDigits:0})}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs text-gray-900">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b-2 border-gray-200">
              <Th col="workload"   label="Workload" right={false} />
              <Th col="namespace"  label="Namespace" right={false} />
              <Th col="cost"       label="Cost (7d)" />
              <Th col="cpuRequest" label="CPU Req" />
              <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {display.map((w) => {
              const pct = totalCurrent > 0 ? (w.cost / totalCurrent) * 100 : 0;
              return (
                <tr key={`${w.namespace}/${w.workloadName}`} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-3 font-mono text-gray-800 max-w-[160px] truncate" title={w.workloadName}>
                    {w.workloadName}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 max-w-[100px] truncate" title={w.namespace}>
                    {w.namespace}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">
                    {w.cost > 0 ? `$${w.cost.toLocaleString(undefined, {maximumFractionDigits:0})}` : '\u2014'}
                  </td>
                  <td className="py-2.5 text-right text-gray-600">
                    {w.cpuRequest > 0 ? `${w.cpuRequest}c` : '\u2014'}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-gray-500 text-xs w-8 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > 20 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full py-2 text-xs text-indigo-600 font-semibold hover:bg-indigo-50 rounded-lg transition-colors"
        >
          {showAll ? `Show top 20` : `Show all ${sorted.length} workloads`}
        </button>
      )}
    </Collapsible>
  );
}
