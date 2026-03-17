'use client';

import { useState } from 'react';
import type { NamespaceCost } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  namespaces: NamespaceCost[];
  loading?: boolean;
}

type SortCol = 'namespace' | 'cost' | 'cpuRequest';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 text-xs ${active ? 'text-indigo-600' : 'text-gray-300'}`}>
      {active ? (dir === 'desc' ? '\u2193' : '\u2191') : '\u2195'}
    </span>
  );
}

export default function NamespaceTable({ namespaces, loading }: Props) {
  const [sortCol, setSortCol] = useState<SortCol>('cost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  if (loading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;

  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sorted = [...namespaces].sort((a, b) => {
    const valA = sortCol === 'namespace' ? a.namespace
               : sortCol === 'cost'      ? a.cost
               : a.cpuRequest;
    const valB = sortCol === 'namespace' ? b.namespace
               : sortCol === 'cost'      ? b.cost
               : b.cpuRequest;
    if (typeof valA === 'string') return sortDir === 'desc' ? valB.toString().localeCompare(valA) : valA.localeCompare(valB.toString());
    return sortDir === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
  });

  const totalCost = namespaces.reduce((s, n) => s + n.cost, 0);

  function Th({ col, label }: { col: SortCol; label: string }) {
    return (
      <th
        className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none whitespace-nowrap"
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon active={sortCol === col} dir={sortDir} />
      </th>
    );
  }

  return (
    <Collapsible title="Cost by Namespace" color="indigo" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Cost allocation by Kubernetes namespace. Shows which teams or services drive the most spend.
      </p>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400">{namespaces.length} namespaces · click header to sort</span>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm text-gray-900">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b-2 border-gray-200">
              <th
                className="text-left pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none"
                onClick={() => handleSort('namespace')}
              >
                Namespace<SortIcon active={sortCol === 'namespace'} dir={sortDir} />
              </th>
              <Th col="cost"       label="Cost (7d)" />
              <Th col="cpuRequest" label="CPU Req" />
              <th className="text-right pb-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ns) => {
              const pct = totalCost > 0 ? (ns.cost / totalCost) * 100 : 0;
              return (
                <tr key={ns.namespace} className="border-b border-gray-100 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-4 font-mono text-xs text-gray-800 max-w-[160px] truncate" title={ns.namespace}>
                    {ns.namespace}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">
                    {ns.cost > 0 ? `$${ns.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '\u2014'}
                  </td>
                  <td className="py-2.5 text-right text-gray-600">
                    {ns.cpuRequest > 0 ? `${ns.cpuRequest}c` : '\u2014'}
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
    </Collapsible>
  );
}
