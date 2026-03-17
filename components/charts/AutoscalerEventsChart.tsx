'use client';

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import type { AutoscalerEvent } from '@/lib/calculations/events';
import type { CostDataPoint } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  costData: CostDataPoint[];
  events: AutoscalerEvent[];
  loading?: boolean;
}

const EVENT_COLORS: Record<string, string> = {
  weekend_down: '#10b981',
  scale_down:   '#3b82f6',
  weekend_up:   '#f59e0b',
  scale_up:     '#ef4444',
};

const EVENT_LABELS: Record<string, string> = {
  weekend_down: 'Weekend scale-down',
  scale_down:   'Autoscaler scale-down',
  weekend_up:   'Scale back up (Mon)',
  scale_up:     'Demand scale-up',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const cost = payload.find((p: { dataKey: string }) => p.dataKey === 'cost');
  const saving = payload.find((p: { dataKey: string }) => p.dataKey === 'saving');
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-800 max-w-[220px]">
      <div className="font-semibold text-gray-900 mb-1">{label}</div>
      {cost && <div className="text-gray-700">Cost: <span className="font-semibold">${Number(cost.value).toFixed(2)}</span></div>}
      {saving && saving.value > 0 && (
        <div className="text-emerald-700 mt-1">
          CAST AI saved: <span className="font-semibold">${Number(saving.value).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

export default function AutoscalerEventsChart({ costData, events, loading }: Props) {
  if (loading) return <div className="animate-pulse h-72 bg-gray-100 rounded-xl" />;

  // Build a map of event savings by date
  const savingsByDate: Record<string, number> = {};
  events.forEach((e) => {
    savingsByDate[e.date] = (savingsByDate[e.date] ?? 0) + e.savingsFromEvent;
  });

  const chartData = costData.map((d) => ({
    date: d.date,        // full YYYY-MM-DD as key
    cost: +d.totalCost.toFixed(2),
    saving: +(savingsByDate[d.date] ?? 0).toFixed(2),
  }));

  const tickInterval = Math.max(1, Math.ceil(costData.length / 12));

  // Unique dates that have events (for reference lines) — keep full date keys
  const eventDates = [...new Set(events.map((e) => e.date))];

  const downEvents = events.filter((e) => e.type === 'weekend_down' || e.type === 'scale_down');
  const upEvents   = events.filter((e) => e.type === 'weekend_up'   || e.type === 'scale_up');
  const totalEventSavings = downEvents.reduce((s, e) => s + e.savingsFromEvent, 0);

  return (
    <Collapsible title="CAST AI Autoscaler Events" color="orange" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Autoscaler activity overlaid on daily cost. Shows when CAST AI scaled nodes in or out, correlated with spend changes.
      </p>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            Detected from day-over-day cost changes — green bars = CAST AI scale-down savings
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-emerald-600">
            ${totalEventSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-gray-500">saved across {downEvents.length} scale-down events</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval={tickInterval} tickFormatter={fmtDate} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `$${v}`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span className="text-gray-700 text-xs">{value}</span>}
          />
          {eventDates.map((d) => {
            const ev = events.find((e) => e.date === d);
            if (!ev) return null;
            const isDown = ev.type === 'weekend_down' || ev.type === 'scale_down';
            return (
              <ReferenceLine
                key={d}
                x={d}
                stroke={isDown ? '#10b981' : '#f59e0b'}
                strokeDasharray="3 3"
                strokeWidth={1.5}
              />
            );
          })}
          <Bar dataKey="saving" fill="#dcfce7" stroke="#10b981" strokeWidth={1} name="Event savings ($)" radius={[2,2,0,0]} />
          <Line type="monotone" dataKey="cost" stroke="#6366f1" dot={false} name="Daily cost ($)" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Event log table */}
      <div className="mt-5 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Event Log ({events.length} events detected)</h3>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs text-gray-800">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-gray-200">
                <th className="text-left pb-2 font-semibold text-gray-600">Date</th>
                <th className="text-left pb-2 font-semibold text-gray-600">Day</th>
                <th className="text-left pb-2 font-semibold text-gray-600">Event</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Cost Before</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Cost After</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Change</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Saved</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const isDown = ev.type === 'weekend_down' || ev.type === 'scale_down';
                const color = EVENT_COLORS[ev.type];
                return (
                  <tr key={`${ev.date}-${ev.type}`} className="border-b border-gray-50 hover:bg-slate-50">
                    <td className="py-2 font-mono text-gray-800">{ev.date}</td>
                    <td className="py-2 text-gray-600">{ev.dayOfWeek.slice(0, 3)}</td>
                    <td className="py-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium"
                        style={{ background: color }}
                      >
                        {isDown ? '↓' : '↑'} {EVENT_LABELS[ev.type]}
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-700">${ev.costBefore.toFixed(2)}</td>
                    <td className="py-2 text-right text-gray-700">${ev.costAfter.toFixed(2)}</td>
                    <td className={`py-2 text-right font-semibold ${isDown ? 'text-emerald-700' : 'text-amber-600'}`}>
                      {ev.changePct.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right font-semibold text-emerald-700">
                      {isDown ? `$${ev.savingsFromEvent.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </Collapsible>
  );
}
