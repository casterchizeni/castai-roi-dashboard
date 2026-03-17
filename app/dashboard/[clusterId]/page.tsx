'use client';

import { useState, use, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  useCluster,
  useClusterCost,
  useEfficiency,
  useNamespaces,
  useWorkloads,
  useNodeMetrics,
  useSavings,
  useAutoscalerEvents,
  useRebalancing,
} from '@/hooks/useClusterData';
import { useROI } from '@/hooks/useROI';
import OverviewCard from '@/components/cards/OverviewCard';
import NodeConsolidation from '@/components/cards/NodeConsolidation';
import WasteCalculator from '@/components/cards/WasteCalculator';
import ForecastChart from '@/components/charts/ForecastChart';
import SpotOnDemandRatio from '@/components/charts/SpotOnDemandRatio';
import InstanceBreakdown from '@/components/charts/InstanceBreakdown';
import UsageGrowthChart from '@/components/charts/UsageGrowthChart';
import NamespaceTable from '@/components/tables/NamespaceTable';
import WorkloadTable from '@/components/tables/WorkloadTable';
import Timeline from '@/components/Timeline';
import ROIStory from '@/components/ROIStory';
import AutoscalerEventsChart from '@/components/charts/AutoscalerEventsChart';
import EfficiencyTrendChart from '@/components/charts/EfficiencyTrendChart';
import DailyCostChart from '@/components/charts/DailyCostChart';
import ResourceCostStory from '@/components/charts/ResourceCostStory';
import RebalancingCard from '@/components/cards/RebalancingCard';
import ClientPartnerView from '@/components/ClientPartnerView';
import ReportView from '@/components/ReportView';
import DateRangeSelector from '@/components/DateRangeSelector';
import type { DateRangeConfig } from '@/components/DateRangeSelector';
import DataQualityBanner from '@/components/DataQualityBanner';
import { exportDashboardPDF } from '@/lib/export/pdf';
import { detectBaselineDates } from '@/lib/castai/baseline';

type ViewMode = 'partner' | 'report' | 'technical';

const TAB_CONFIG: { key: ViewMode; label: string; color: string }[] = [
  { key: 'partner', label: 'Client Partner', color: 'bg-emerald-600' },
  { key: 'report', label: 'Report', color: 'bg-gray-800' },
  { key: 'technical', label: 'Technical', color: 'bg-indigo-600' },
];

export default function DashboardPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const { clusterId } = use(params);
  const searchParams = useSearchParams();
  const navRouter = useRouter();

  const [monthlyFee, setMonthlyFee] = useState(() => {
    const p = searchParams.get('fee');
    return p ? Number(p) : 5000;
  });
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeConfig | null>(() => {
    const t = searchParams.get('through');
    return t ? { comparisonEnd: t } : null;
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = searchParams.get('view') as ViewMode | null;
    return v && ['partner', 'report', 'technical'].includes(v) ? v : 'partner';
  });

  // Sync filter state → URL for shareable links
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== 'partner') params.set('view', viewMode);
    if (monthlyFee !== 5000) params.set('fee', String(monthlyFee));
    if (dateRange?.comparisonEnd) params.set('through', dateRange.comparisonEnd);
    const qs = params.toString();
    const current = window.location.search.replace(/^\?/, '');
    if (qs !== current) {
      navRouter.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
  }, [viewMode, monthlyFee, dateRange, navRouter]);

  const { data: cluster, isLoading: clusterLoading } = useCluster(clusterId);
  const { data: costReport, isLoading: costLoading } = useClusterCost(clusterId);
  const { data: efficiency, isLoading: effLoading } = useEfficiency(clusterId);
  const { data: namespaceReport, isLoading: nsLoading } = useNamespaces(clusterId);
  const { data: workloadReport, isLoading: wlLoading } = useWorkloads(clusterId);
  const { data: nodeMetrics, isLoading: nodeLoading } = useNodeMetrics(clusterId);
  const { data: savings } = useSavings(clusterId);
  const { data: eventsData, isLoading: eventsLoading } = useAutoscalerEvents(clusterId);
  const { data: rebalancingData, isLoading: rebalancingLoading } = useRebalancing(clusterId);

  const roiData = useROI(
    cluster,
    costReport,
    monthlyFee,
    dateRange?.comparisonEnd
  );

  const loading = clusterLoading || costLoading;

  // Auto-detected baseline dates (used as defaults in DateRangeSelector)
  const detectedBaseline = cluster
    ? detectBaselineDates(cluster)
    : { baselineStart: '', baselineEnd: '' };

  // Extract real savings data from the CAST AI savings API (90d, secondary reference)
  const savingsData = savings as { totalSavings?: number; totalCost?: number } | undefined;
  const realTotalSavings = savingsData?.totalSavings;
  const realTotalCost    = savingsData?.totalCost;

  // Data quality detection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isMock = !!(costReport as any)?.isMock || !!(efficiency as any)?.isMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasApiError = !!(costReport as any)?.error || !!(efficiency as any)?.error;
  // Count pre-CAST AI baseline days
  const enabledDate = cluster?.autoscalerEnabledAt?.slice(0, 10) ?? '';
  const baselineDays = enabledDate && costReport?.daily
    ? costReport.daily.filter((d) => d.date < enabledDate).length
    : 0;

  const castaiEnabledAt = cluster?.autoscalerEnabledAt;

  // Split cost data into baseline (pre-CAST) and CAST AI periods
  const { baselineCostData, castaiCostData } = useMemo(() => {
    const daily = costReport?.daily ?? [];
    const enabledAt = castaiEnabledAt?.slice(0, 10);
    if (!enabledAt || !daily.length) return { baselineCostData: [], castaiCostData: daily };
    return {
      baselineCostData: daily.filter((d) => d.date < enabledAt),
      castaiCostData: daily.filter((d) => d.date >= enabledAt),
    };
  }, [costReport?.daily, castaiEnabledAt]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportDashboardPDF('dashboard-content', cluster?.name ?? clusterId);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm font-medium">← Back</Link>
            <span className="text-gray-300">|</span>
            <span className="font-bold text-gray-900">{cluster?.name ?? clusterId}</span>
            {cluster && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                {cluster.provider} · {cluster.region}
              </span>
            )}
            {(cluster as { isLive?: boolean } | undefined)?.isLive && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Live data
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Three-way view toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {TAB_CONFIG.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === key
                      ? `${color} text-white shadow-sm`
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {viewMode === 'report' && (
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Print PDF
              </button>
            )}
            {viewMode !== 'report' && (
              <button
                onClick={handleExport}
                disabled={exporting || loading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div id="dashboard-content" className="max-w-7xl mx-auto px-4 py-6 space-y-6 print:max-w-4xl print:px-8 print:py-10">

        {/* Timeline (partner + technical only) */}
        {viewMode !== 'report' && cluster && <Timeline cluster={cluster} />}

        {/* Data quality warnings (partner + technical only) */}
        {viewMode !== 'report' && (
          <DataQualityBanner
            baselineDays={baselineDays}
            hasApiError={hasApiError}
            isMock={isMock}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* CLIENT PARTNER VIEW                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'partner' && (
          <ClientPartnerView
            costData={costReport?.daily ?? []}
            castaiEnabledAt={castaiEnabledAt}
            efficiency={efficiency ?? undefined}
            nodeMetrics={nodeMetrics ?? undefined}
            forecast={roiData?.forecast}
            roiData={roiData ?? undefined}
            clusterName={cluster?.name}
            realSavings={realTotalSavings != null && realTotalCost != null
              ? { totalSavings: realTotalSavings, totalCost: realTotalCost }
              : undefined}
            monthlyFee={monthlyFee}
            loading={loading}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* REPORT VIEW (printable monthly trend)                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'report' && (
          <ReportView
            cluster={cluster ?? undefined}
            clusterId={clusterId}
            costData={costReport?.daily ?? []}
            castaiEnabledAt={castaiEnabledAt}
            efficiency={efficiency ?? undefined}
            nodeMetrics={nodeMetrics ?? undefined}
            savings={savingsData}
            loading={loading}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TECHNICAL VIEW                                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'technical' && (
          <>
            {/* Date Range Comparison selector */}
            {cluster && detectedBaseline.baselineStart && (
              <DateRangeSelector
                detected={detectedBaseline}
                value={dateRange}
                onChange={setDateRange}
              />
            )}

            {/* Daily Cost — the simple "what did I actually pay" chart */}
            {costReport && (
              <DailyCostChart
                data={costReport.daily}
                castaiEnabledAt={castaiEnabledAt}
                loading={costLoading}
              />
            )}

            {/* Efficiency Analysis — provisioned vs requested vs used */}
            {costReport && (
              <EfficiencyTrendChart
                data={costReport.daily}
                castaiEnabledAt={castaiEnabledAt}
                loading={costLoading}
              />
            )}

            {/* ROI Overview (graph-derived savings) */}
            {costReport && (
              <OverviewCard
                costData={costReport.daily}
                castaiEnabledAt={castaiEnabledAt}
                realSavings={realTotalSavings != null && realTotalCost != null
                  ? { totalSavings: realTotalSavings, totalCost: realTotalCost }
                  : undefined}
                loading={loading}
              />
            )}

            {/* ROI Story (graph-derived savings) */}
            {costReport && efficiency && nodeMetrics && (
              <ROIStory
                costData={costReport.daily}
                castaiEnabledAt={castaiEnabledAt}
                efficiency={efficiency}
                totalNodes={nodeMetrics.totalNodes}
                totalSavingsReal={realTotalSavings}
                totalCostReal={realTotalCost}
                clusterName={cluster?.name}
              />
            )}

            {/* Resource cost story — where every dollar goes */}
            {costReport && (
              <ResourceCostStory
                data={costReport.daily}
                castaiEnabledAt={castaiEnabledAt}
              />
            )}

            {/* Autoscaler Events */}
            {costReport && (
              <AutoscalerEventsChart
                costData={costReport.daily}
                events={eventsData?.events ?? []}
                loading={eventsLoading || costLoading}
              />
            )}

            {/* Rebalancing schedules */}
            <RebalancingCard
              schedules={rebalancingData?.schedules ?? []}
              loading={rebalancingLoading}
            />

            {/* Spot/On-Demand Ratio */}
            {nodeMetrics && (
              <SpotOnDemandRatio
                nodes={nodeMetrics}
                baselineData={baselineCostData}
                castaiData={castaiCostData}
                loading={nodeLoading}
              />
            )}

            {/* Usage growth correlation */}
            {costReport && <UsageGrowthChart data={costReport.daily} loading={costLoading} />}

            {/* 30/90 day forecast */}
            {roiData && <ForecastChart forecast={roiData.forecast} baselineDays={baselineDays} loading={costLoading} />}

            {/* Node consolidation + Waste calculator */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {nodeMetrics && (
                <NodeConsolidation
                  current={nodeMetrics}
                  baselineData={baselineCostData}
                  castaiData={castaiCostData}
                  loading={nodeLoading}
                />
              )}
              {efficiency && <WasteCalculator efficiency={efficiency} loading={effLoading} />}
            </div>

            {/* Instance breakdown */}
            {nodeMetrics && (
              <InstanceBreakdown nodes={nodeMetrics.nodes} savings={savings} loading={nodeLoading} />
            )}

            {/* Namespace + Workload cost tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {namespaceReport && (
                <NamespaceTable namespaces={namespaceReport.namespaces} loading={nsLoading} />
              )}
              {workloadReport && (
                <WorkloadTable
                  workloads={workloadReport.workloads}
                  loading={wlLoading}
                />
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
