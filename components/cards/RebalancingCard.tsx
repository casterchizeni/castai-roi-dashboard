'use client';

import type { RebalancingSchedule } from '@/lib/castai/real-api';
import Collapsible from '@/components/Collapsible';

interface Props {
  schedules: RebalancingSchedule[];
  loading?: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  JobStatusFinished: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  JobStatusSkipped:  { bg: 'bg-yellow-100',  text: 'text-yellow-700',  label: 'Skipped' },
  JobStatusFailed:   { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Failed' },
};

function cronHuman(cron: string) {
  if (cron.includes('*/1 * *'))   return 'Daily at midnight';
  if (cron.includes('* * mon,'))  return 'Daily at 9 PM (Aggressive)';
  if (cron.includes('* * mon'))   return 'Weekly (Monday)';
  if (cron.includes('mon,thu'))   return 'Bi-weekly (Mon & Thu)';
  return cron;
}

export default function RebalancingCard({ schedules, loading }: Props) {
  if (loading) return <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />;
  if (!schedules.length) {
    return (
      <Collapsible title="Rebalancing Schedules" color="orange" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <p className="text-sm text-gray-500">No active rebalancing schedules found for this cluster.</p>
      </Collapsible>
    );
  }

  return (
    <Collapsible title="Rebalancing Schedules" color="orange" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            CAST AI rebalancer consolidates nodes on a schedule to maximise savings
          </p>
        </div>
        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
          {schedules.length} active
        </span>
      </div>

      <div className="space-y-4">
        {schedules.map((s) => {
          const job = s.jobs[0]; // one job per cluster
          const statusStyle = STATUS_STYLES[job?.status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: job?.status ?? '—' };
          const lastAt = job?.lastTriggerAt ? new Date(job.lastTriggerAt).toLocaleString() : '—';
          const nextAt = job?.nextTriggerAt ? new Date(job.nextTriggerAt).toLocaleDateString() : '—';

          return (
            <div key={s.id} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <div>
                  <span className="font-medium text-gray-500">Frequency</span>
                  <p className="text-gray-800">{cronHuman(s.schedule.cron)}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Savings threshold</span>
                  <p className="text-gray-800">
                    {s.triggerConditions.ignoreSavings
                      ? 'Runs regardless of savings'
                      : `Only if ≥${s.triggerConditions.savingsPercentage}% savings found`}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Last triggered</span>
                  <p className="text-gray-800">{lastAt}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Next trigger</span>
                  <p className="text-gray-800">{nextAt}</p>
                </div>
              </div>
              {job?.status === 'JobStatusSkipped' && (
                <p className="mt-2 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">
                  Skipped — rebalancing plan did not meet the {s.triggerConditions.savingsPercentage}% savings threshold on last run
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}
