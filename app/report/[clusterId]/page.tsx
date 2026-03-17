'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  useCluster,
  useClusterCost,
  useEfficiency,
  useNodeMetrics,
  useSavings,
} from '@/hooks/useClusterData';
import ReportView from '@/components/ReportView';

export default function ReportPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const { clusterId } = use(params);

  const { data: cluster, isLoading: clusterLoading } = useCluster(clusterId);
  const { data: costReport, isLoading: costLoading } = useClusterCost(clusterId);
  const { data: efficiency } = useEfficiency(clusterId);
  const { data: nodeMetrics } = useNodeMetrics(clusterId);
  const { data: savings } = useSavings(clusterId);

  const loading = clusterLoading || costLoading;
  const savingsData = savings as { totalSavings?: number; totalCost?: number } | undefined;

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav (hidden in print) */}
      <div className="print:hidden bg-gray-50 border-b border-gray-200 py-3 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm font-medium">Home</Link>
          <span className="text-gray-300">|</span>
          <Link href={`/dashboard/${clusterId}`} className="text-gray-500 hover:text-gray-800 text-sm font-medium">Dashboard</Link>
          <span className="text-gray-300">|</span>
          <span className="text-gray-900 font-semibold text-sm">Report</span>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="px-8 py-10">
        <ReportView
          cluster={cluster ?? undefined}
          clusterId={clusterId}
          costData={costReport?.daily ?? []}
          castaiEnabledAt={cluster?.autoscalerEnabledAt}
          efficiency={efficiency ?? undefined}
          nodeMetrics={nodeMetrics ?? undefined}
          savings={savingsData}
          loading={loading}
        />
      </div>
    </div>
  );
}
