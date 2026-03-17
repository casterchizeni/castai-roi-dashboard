'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  data: CostDataPoint[];
  baselineEnd?: string;
  loading?: boolean;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  // iso = YYYY-MM-DD → "Apr '25"
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

export default function CostTrendChart({ data, baselineEnd, loading }: Props) {
  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const chartData = data.map((d) => ({
    date: d.date,        // full YYYY-MM-DD as key
    label: fmtDate(d.date),
    cost: +d.totalCost.toFixed(0),
    spot: d.spotCost != null ? +d.spotCost.toFixed(0) : undefined,
    onDemand: d.onDemandCost != null ? +d.onDemandCost.toFixed(0) : undefined,
  }));

  // Show ~12 ticks regardless of data length (monthly cadence)
  const tickInterval = Math.max(1, Math.ceil(data.length / 12));

  return (
    <Collapsible title="Cost Trend" color="emerald" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Daily cloud spend over time. The vertical line marks when CAST AI&apos;s baseline period ended and active optimization began.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={tickInterval} tickFormatter={fmtDate} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(v) => typeof v === 'number' ? `$${v.toLocaleString()}` : v} />
          <Legend />
          {baselineEnd && (
            <ReferenceLine
              x={baselineEnd.slice(0, 10)}
              stroke="#6366f1"
              strokeDasharray="4 2"
              label={{ value: 'Baseline End', position: 'top', fontSize: 10, fill: '#6366f1' }}
            />
          )}
          <Line type="monotone" dataKey="cost" stroke="#10b981" dot={false} name="Total Cost" strokeWidth={2} />
          <Line type="monotone" dataKey="spot" stroke="#8b5cf6" dot={false} name="Spot" strokeWidth={1} />
          <Line type="monotone" dataKey="onDemand" stroke="#f59e0b" dot={false} name="On-Demand" strokeWidth={1} />
        </LineChart>
      </ResponsiveContainer>
    </Collapsible>
  );
}
