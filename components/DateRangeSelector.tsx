'use client';

import { useState } from 'react';

export interface DateRangeConfig {
  comparisonEnd: string; // ISO date YYYY-MM-DD — how far to measure CAST AI impact
}

interface Props {
  /** Auto-detected baseline period (read-only) */
  detected: { baselineStart: string; baselineEnd: string };
  value: DateRangeConfig | null;
  onChange: (cfg: DateRangeConfig | null) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DateRangeSelector({ detected, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value?.comparisonEnd ?? today());

  const baselineDays =
    detected.baselineStart && detected.baselineEnd && detected.baselineStart !== detected.baselineEnd
      ? Math.max(
          0,
          Math.round(
            (new Date(detected.baselineEnd).getTime() -
              new Date(detected.baselineStart).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  const isCustom = value !== null;

  function apply() {
    onChange({ comparisonEnd: draft });
    setOpen(false);
  }

  function reset() {
    onChange(null);
    setDraft(today());
    setOpen(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mt-0.5">
            <svg className="w-4.5 h-4.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              Analysis Period
              {isCustom && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-semibold rounded-full">
                  Custom end
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Comparing through <span className="font-semibold text-gray-700">{isCustom ? fmtDate(value.comparisonEnd) : 'today'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isCustom && (
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {open ? 'Close' : 'Set Range'}
          </button>
        </div>
      </div>

      {/* Visual timeline — always visible */}
      <div className="mt-4 flex items-center gap-0 h-8">
        {/* Baseline segment */}
        <div className="flex-1 relative">
          <div className="h-2 bg-slate-200 rounded-l-full" />
          <div className="absolute -top-0.5 left-0 w-3 h-3 bg-slate-400 rounded-full border-2 border-white" title="Cluster created" />
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-slate-500 font-medium">{fmtDate(detected.baselineStart)}</span>
          </div>
        </div>
        {/* Divider — autoscaler enabled */}
        <div className="relative flex flex-col items-center mx-1 -mt-3">
          <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white z-10" title="CAST AI enabled" />
          <span className="text-[10px] text-emerald-700 font-bold mt-0.5 whitespace-nowrap">Autoscaler on</span>
        </div>
        {/* CAST AI segment */}
        <div className="flex-[2] relative">
          <div className="h-2 bg-emerald-200 rounded-r-full" />
          <div className="absolute -top-0.5 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" title={isCustom ? value.comparisonEnd : 'Today'} />
          <div className="flex justify-end mt-1">
            <span className="text-[11px] text-emerald-600 font-medium">{isCustom ? fmtDate(value.comparisonEnd) : 'Today'}</span>
          </div>
        </div>
      </div>

      {/* Labels under timeline */}
      <div className="flex items-start gap-0 mt-1">
        <div className="flex-1">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Baseline</span>
          {baselineDays > 0 ? (
            <span className="text-[11px] text-slate-400 ml-1">({baselineDays} days, all pre-CAST AI data)</span>
          ) : (
            <span className="text-[11px] text-amber-500 ml-1">(no pre-CAST AI data)</span>
          )}
        </div>
        <div className="flex-[2] text-right">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">With CAST AI</span>
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          {/* Baseline info (read-only) */}
          <div className="mb-5 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <h4 className="text-sm font-bold text-slate-700 mb-1">
              Baseline Period
              <span className="text-xs font-normal text-slate-400 ml-2">(auto-detected, not editable)</span>
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              <span className="font-semibold">{fmtDate(detected.baselineStart)}</span>
              <span className="text-slate-400 mx-2">→</span>
              <span className="font-semibold">{fmtDate(detected.baselineEnd)}</span>
              {baselineDays > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-600 text-xs font-semibold rounded-full">
                  {baselineDays} days
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              This is all data from when the cluster was created until the autoscaler first took action.
              It represents your real costs before any CAST AI optimisation — no artificial window or offset.
            </p>
          </div>

          {/* Comparison end date */}
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2">
              Compare Through
              <span className="text-xs font-normal text-gray-400 ml-2">(how far to measure CAST AI savings)</span>
            </h4>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="date"
                value={draft}
                min={detected.baselineEnd}
                max={today()}
                onChange={(e) => setDraft(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                {[
                  { label: 'Today', val: today() },
                  { label: '30d ago', val: daysAgo(30) },
                  { label: '90d ago', val: daysAgo(90) },
                ].map(({ label, val }) => (
                  <button
                    key={label}
                    onClick={() => setDraft(val)}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                      draft === val
                        ? 'bg-indigo-600 text-white border-transparent'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
