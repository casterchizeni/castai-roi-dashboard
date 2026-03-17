'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  data: CostDataPoint[];
  loading?: boolean;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

export default function UsageGrowthChart({ data, loading }: Props) {
  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const chartData = data.map((d) => ({
    date: d.date,
    cost: +d.totalCost.toFixed(0),
    cpuHours: d.cpuHours != null ? +(d.cpuHours / 1000).toFixed(1) : undefined,
    memGbHours: d.memoryGbHours != null ? +(d.memoryGbHours / 1000).toFixed(1) : undefined,
  }));

  const tickInterval = Math.max(1, Math.ceil(data.length / 12));

  return (
    <Collapsible title="Usage Growth Correlation" color="blue" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Tracks whether workload growth correlates with cost growth. Ideally, usage grows while cost stays flat or declines — that&apos;s efficiency.
      </p>
      <p className="text-xs text-gray-400 mb-4">
        Cost growing slower than usage = CAST AI optimization effect
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={tickInterval} tickFormatter={fmtDate} />
          <YAxis yAxisId="cost" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <YAxis yAxisId="usage" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}k`} />
          <Tooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString() : v} />
          <Legend />
          <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#10b981" dot={false} name="Cost ($)" strokeWidth={2} />
          <Line yAxisId="usage" type="monotone" dataKey="cpuHours" stroke="#6366f1" dot={false} name="CPU Hours (k)" strokeWidth={1.5} />
          <Line yAxisId="usage" type="monotone" dataKey="memGbHours" stroke="#f59e0b" dot={false} name="Mem GB-Hours (k)" strokeWidth={1.5} />
        </ComposedChart>
      </ResponsiveContainer>
    </Collapsible>
  );
}
