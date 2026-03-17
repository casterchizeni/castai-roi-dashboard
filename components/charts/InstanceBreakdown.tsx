'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { NodeInfo, SavingsRecommendation } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  nodes: NodeInfo[];
  savings?: SavingsRecommendation;
  loading?: boolean;
}

export default function InstanceBreakdown({ nodes, savings, loading }: Props) {
  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const byType: Record<string, { spot: number; onDemand: number; costPerHour: number }> = {};
  nodes.forEach((n) => {
    if (!byType[n.instanceType]) byType[n.instanceType] = { spot: 0, onDemand: 0, costPerHour: n.costPerHour ?? 0 };
    const cnt = n.count ?? 1;
    if (n.isSpot) byType[n.instanceType].spot += cnt;
    else byType[n.instanceType].onDemand += cnt;
  });

  const data = Object.entries(byType).map(([type, v]) => ({
    type,
    spot: v.spot,
    onDemand: v.onDemand,
    total: v.spot + v.onDemand,
    costPerHour: v.costPerHour,
  })).sort((a, b) => b.total - a.total);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center justify-center h-48">
        <p className="text-gray-400 text-sm">No node data available</p>
      </div>
    );
  }

  // Dynamic height so every bar has room (min 200px, 48px per instance type)
  const chartHeight = Math.max(200, data.length * 52);

  return (
    <Collapsible title="Instance Type Breakdown" color="indigo" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-2 leading-relaxed">
            Breakdown of node types in the cluster — instance family, lifecycle (spot/on-demand), and per-node cost contribution.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{nodes.reduce((s, n) => s + (n.count ?? 1), 0)} total nodes</p>
        </div>
      </div>
      {/* Horizontal bar chart — labels sit comfortably on Y axis */}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v) => `${v}`}
            label={{ value: 'Node count', position: 'insideBottom', offset: -2, style: { fontSize: 10, fill: '#9ca3af' } }}
          />
          <YAxis
            type="category"
            dataKey="type"
            tick={{ fontSize: 11, fill: '#374151' }}
            width={180}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [`${value ?? 0} nodes`, name ?? '']}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="spot"     fill="#8b5cf6" name="Spot"      radius={[0, 3, 3, 0]} />
          <Bar dataKey="onDemand" fill="#f59e0b" name="On-Demand" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {savings && savings.recommendations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-50">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold">Recommendations</p>
          <ul className="space-y-1">
            {savings.recommendations.map((r, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-gray-600">{r.description}</span>
                <span className="text-emerald-600 font-medium">${r.savingsAmount.toLocaleString()}/mo</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Collapsible>
  );
}
