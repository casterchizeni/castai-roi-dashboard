'use client';

import type { Cluster } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  cluster: Cluster;
}

interface Event {
  date: string;
  label: string;
  color: string;
}

export default function Timeline({ cluster }: Props) {
  const events: Event[] = [
    { date: cluster.createdAt.slice(0, 10), label: 'Cluster Onboarded', color: 'bg-blue-500' },
  ];

  if (cluster.autoscalerEnabledAt) {
    events.push({
      date: cluster.autoscalerEnabledAt.slice(0, 10),
      label: 'Autoscaler Enabled',
      color: 'bg-emerald-500',
    });
  }
  if (cluster.workloadAutoscalerEnabledAt) {
    events.push({
      date: cluster.workloadAutoscalerEnabledAt.slice(0, 10),
      label: 'Workload Autoscaler Enabled',
      color: 'bg-purple-500',
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Collapsible title="Autoscaler Event Timeline" color="slate" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="relative flex items-center gap-0">
        {events.map((ev, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className={`w-4 h-4 rounded-full ${ev.color} z-10`} />
            {i < events.length - 1 && (
              <div className="absolute top-2 left-0 right-0 h-0.5 bg-gray-200 -z-0" />
            )}
            <div className="mt-2 text-center">
              <div className="text-xs font-medium text-gray-700">{ev.label}</div>
              <div className="text-xs text-gray-400">{ev.date}</div>
            </div>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}
