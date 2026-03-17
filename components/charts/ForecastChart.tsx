'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ForecastResult } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  forecast: ForecastResult;
  baselineDays?: number;
  loading?: boolean;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function ForecastChart({ forecast, baselineDays = 0, loading }: Props) {
  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const data = forecast.dailyForecasts.map((d) => ({
    date: d.date,
    cost: d.cost,
    low: d.low,
    high: d.high,
  }));
  const tickInterval = Math.max(1, Math.ceil(data.length / 10));

  const hasSavings = forecast.savingsRunRate30day > 0;

  return (
    <Collapsible title="Cost Forecast (30 & 90 Day)" color="purple" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Projected spend based on weighted average of the last {forecast.dataPointsUsed} days of actual cost data.
        The shaded range shows observed daily min/max — not a confidence interval.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border border-gray-100 p-3 text-center">
          <div className="text-lg font-bold text-gray-900">{fmt$(forecast.forecast30day)}</div>
          <div className="text-xs text-gray-500 mt-0.5">30-day forecast</div>
        </div>
        <div className="rounded-lg border border-gray-100 p-3 text-center">
          <div className="text-lg font-bold text-gray-900">{fmt$(forecast.forecast90day)}</div>
          <div className="text-xs text-gray-500 mt-0.5">90-day forecast</div>
        </div>
        <div className="rounded-lg border border-gray-100 p-3 text-center">
          <div className="text-xs text-gray-400">{fmt$(forecast.rangeLow30day)} – {fmt$(forecast.rangeHigh30day)}</div>
          <div className="text-xs text-gray-500 mt-0.5">30-day range</div>
        </div>
        {hasSavings ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-center">
            <div className="text-lg font-bold text-emerald-600">{fmt$(forecast.savingsRunRate30day)}/mo</div>
            <div className="text-xs text-emerald-700 mt-0.5">Savings run rate</div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-100 p-3 text-center">
            <div className="text-lg font-bold text-gray-300">—</div>
            <div className="text-xs text-gray-500 mt-0.5">No baseline for savings</div>
          </div>
        )}
      </div>

      <div className="mb-3 p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600">
        Based on {forecast.dataPointsUsed} days of data. Avg daily cost: <span className="font-semibold">${forecast.avgDailyCost.toFixed(2)}</span> (range: ${forecast.minDailyCost.toFixed(2)} – ${forecast.maxDailyCost.toFixed(2)}).
        {baselineDays >= 3 && hasSavings && (
          <> Saving <span className="font-semibold text-emerald-600">${(forecast.savingsRunRate30day / 30).toFixed(2)}/day</span> vs pre-CAST baseline.</>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={tickInterval} tickFormatter={fmtDate} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(v) => typeof v === 'number' ? `$${v.toLocaleString()}` : v} />
          <Legend />
          <Area
            type="monotone"
            dataKey="high"
            fill="#e0e7ff"
            stroke="none"
            name="Daily range (high)"
            fillOpacity={0.4}
          />
          <Area
            type="monotone"
            dataKey="low"
            fill="#ffffff"
            stroke="none"
            name="Daily range (low)"
            fillOpacity={1}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#6366f1"
            dot={false}
            name="Projected daily cost"
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Collapsible>
  );
}
