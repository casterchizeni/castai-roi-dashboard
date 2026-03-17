'use client';

import { useState, useMemo, use, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { getDynamicKeyForOrg, setClusterKeys } from '@/lib/dynamic-keys';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { OrgDashboardData, ClusterOrgSummary } from '@/app/api/org/[orgName]/route';
import { computeMultiClusterROI } from '@/lib/calculations/multi-cluster-roi';
import OrgReportView from '@/components/OrgReportView';
import CommitmentSummaryCard from '@/components/cards/CommitmentSummaryCard';

function makeFetcher(dynamicKey: string | null) {
  return (url: string) => {
    const headers: Record<string, string> = {};
    if (dynamicKey) headers['x-castai-key'] = dynamicKey;
    return fetch(url, { headers }).then((r) => r.json());
  };
}

const GROUP_ORDER = ['Production', 'Non-Prod', 'Testing', 'DR', 'Other'];

const PROVIDER_COLORS: Record<string, string> = {
  'AWS EKS':   'bg-orange-100 text-orange-700',
  'GCP GKE':   'bg-blue-100 text-blue-700',
  'Azure AKS': 'bg-sky-100 text-sky-700',
};

const GROUP_COLORS: Record<string, string> = {
  'Production': 'bg-emerald-100 text-emerald-700',
  'Non-Prod':   'bg-amber-100 text-amber-700',
  'Testing':    'bg-purple-100 text-purple-700',
  'DR':         'bg-red-100 text-red-700',
  'Other':      'bg-gray-100 text-gray-600',
};

const BAR_COLORS = [
  '#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444',
  '#06b6d4','#84cc16','#f97316','#ec4899','#6366f1',
];

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDelta(pct: number) {
  if (pct === 0) return null;
  const sign = pct < 0 ? '↓' : '↑';
  const color = pct < 0 ? 'text-emerald-600' : 'text-red-500';
  return <span className={`font-semibold ${color}`}>{sign}{Math.abs(pct).toFixed(0)}%</span>;
}

function BaselineBadge({ q, days }: { q: ClusterOrgSummary['baselineQuality']; days: number }) {
  if (q === 'strong') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {days}d
    </span>
  );
  if (q === 'weak') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      {days}d
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-xs font-medium rounded-full border border-gray-200">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
      model
    </span>
  );
}

function ModeBadge({ mode }: { mode: ClusterOrgSummary['mode'] }) {
  if (mode === 'optimizing') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Optimizing
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-200">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
      Read-only
    </span>
  );
}

type SortKey = 'savings90d' | 'cost90d' | 'savingsPct' | 'cpuUtil' | 'baselineDays' | 'name' | 'dailyCostDelta' | 'castaiDailyCost' | 'castaiCostPerCpuHr';

// ── Metric definitions ─────────────────────────────────────────────────────────
const METRIC_GUIDE = [
  {
    label: 'Savings (90d)',
    color: 'text-emerald-600',
    what: 'Total cost avoided in the last 90 days, per CAST AI\'s accounting.',
    how: 'Sum of spot savings (on-demand price minus spot price for the same CPU/RAM) plus downscaling savings (cost of nodes that were removed by right-sizing).',
    caveat: 'Baseline is on-demand pricing — not your actual pre-CAST spend. If you already had Reserved Instances or spot before CAST AI, this may overstate the savings.',
  },
  {
    label: 'Actual Spend (90d)',
    color: 'text-gray-700',
    what: 'What you actually paid for compute in the last 90 days (with CAST AI active).',
    how: 'Direct from CAST AI cost accounting: on-demand nodes + spot nodes + storage.',
    caveat: 'This is a real number — your cloud bill.',
  },
  {
    label: 'Cost Reduced %',
    color: 'text-blue-600',
    what: 'Percentage by which your cost was reduced compared to running everything on-demand.',
    how: 'savings / (savings + actual spend). E.g. 60% means you paid 40% of the all-on-demand equivalent.',
    caveat: 'Uses on-demand as the hypothetical baseline. Compare to "Daily Cost ↓" for a data-backed figure.',
  },
  {
    label: 'Est. Annual Savings',
    color: 'text-purple-600',
    what: 'Extrapolation of the 90-day savings to a full year.',
    how: 'savings90d × (365 / 90). Assumes current run-rate continues.',
    caveat: 'Linear extrapolation — doesn\'t account for seasonality or cluster growth.',
  },
  {
    label: 'Daily Cost ↓ (baseline vs now)',
    color: 'text-indigo-600',
    what: 'Actual % change in average daily spend — from BEFORE CAST AI started acting to now.',
    how: 'Fetched from the efficiency API for two real date ranges: (createdAt → firstOperationAt) vs (firstOperationAt → now). Both use actual cost fields (cpuCost + ramCost + storage).',
    caveat: 'Only available for clusters with ≥3 days of pre-CAST monitoring data. This is the most honest before/after metric because both periods use real spend data.',
  },
  {
    label: 'CPU Util — Before / After',
    color: 'text-gray-600',
    what: 'Average CPU utilisation rate before CAST AI acted vs with CAST AI active.',
    how: 'cpuUsed / cpuProvisioned, averaged over the respective date range. Higher = more efficient use of provisioned nodes.',
    caveat: 'If CAST AI rightsized your cluster (removed idle nodes), provisioned CPU drops → utilization rate goes UP even if workload didn\'t change. That\'s the point.',
  },
  {
    label: 'CPU Overprovisioning — Before / After',
    color: 'text-red-500',
    what: 'How much provisioned CPU was going unused before vs after CAST AI.',
    how: 'avg(cpuOverprovisioningOnDemandPercent) from efficiency API items, for baseline period and CAST AI period separately.',
    caveat: 'This is the INDEPENDENT CHECK on the savings claim. If CAST AI says it saved $X from downscaling, but overprovisioning barely changed, something doesn\'t add up. If overprovisioning dropped 50%, cost savings from rightsizing should be roughly 50% × your old compute spend.',
  },
];

export default function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgName: string }>;
}) {
  const { orgName } = use(params);
  const dynamicKey = getDynamicKeyForOrg(orgName);
  const fetcher = useCallback(makeFetcher(dynamicKey), [dynamicKey]);
  const { data, isLoading } = useSWR<OrgDashboardData>(
    `/api/org/${orgName}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Cache cluster→key mapping so drill-down to individual clusters works
  useEffect(() => {
    if (dynamicKey && data?.clusters) {
      setClusterKeys(data.clusters.map((c) => c.id), dynamicKey);
    }
  }, [dynamicKey, data]);

  const allClusters = data?.clusters ?? [];

  // ── State (initialized from URL for shareable links) ─────────────────────
  const searchParams = useSearchParams();
  const navRouter = useRouter();

  const [selected, setSelected] = useState<Set<string> | null>(() => {
    const c = searchParams.get('clusters');
    if (c === null) return null; // no param = all selected
    if (c === '') return new Set<string>();
    return new Set(c.split(','));
  });
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const s = searchParams.get('sort') as SortKey | null;
    return s && ['savings90d', 'cost90d', 'savingsPct', 'cpuUtil', 'baselineDays', 'name', 'dailyCostDelta', 'castaiDailyCost', 'castaiCostPerCpuHr'].includes(s) ? s : 'baselineDays';
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const d = searchParams.get('dir');
    return d === 'asc' ? 'asc' : 'desc';
  });
  const [viewMode, setViewMode] = useState<'overview' | 'report'>(() => {
    const v = searchParams.get('view');
    return v === 'report' ? 'report' : 'overview';
  });
  const [monthlyFee, setMonthlyFee] = useState(() => {
    const f = searchParams.get('fee');
    return f ? Number(f) : 0;
  });
  const [roiCalcOpen, setRoiCalcOpen] = useState(false);
  const [contractMonths, setContractMonths] = useState(12);
  const [roiTier, setRoiTier] = useState<'strong' | 'weak+' | 'all'>('strong');

  // Sync filter state → URL for shareable links
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== 'overview') params.set('view', viewMode);
    if (monthlyFee !== 0) params.set('fee', String(monthlyFee));
    if (sortKey !== 'baselineDays') params.set('sort', sortKey);
    if (sortDir !== 'desc') params.set('dir', sortDir);
    if (selected !== null) params.set('clusters', [...selected].join(','));
    if (search) params.set('q', search);
    const qs = params.toString();
    const current = window.location.search.replace(/^\?/, '');
    if (qs !== current) {
      navRouter.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
  }, [viewMode, monthlyFee, sortKey, sortDir, selected, search, navRouter]);

  const effectiveSelected = useMemo(
    () => selected ?? new Set(allClusters.map((c) => c.id)),
    [selected, allClusters]
  );

  const filteredClusters = useMemo(
    () => allClusters.filter((c) => effectiveSelected.has(c.id)),
    [allClusters, effectiveSelected]
  );

  function toggle(id: string) {
    const next = new Set(effectiveSelected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function selectAll() { setSelected(null); }
  function deselectAll() { setSelected(new Set()); }

  // ── Aggregated metrics ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    // Modeled savings (CAST AI savings API — vs on-demand baseline)
    const savings = filteredClusters.reduce((s, c) => s + c.savings90d, 0);
    const cost    = filteredClusters.reduce((s, c) => s + c.cost90d, 0);
    const total   = savings + cost;
    const savingsPct = total > 0 ? (savings / total) * 100 : 0;
    const annualSavings = savings * (365 / 90);

    // Real before/after — only clusters with both baseline and CAST AI data
    const withBoth = filteredClusters.filter(
      (c) => c.baselineDailyCost > 0 && c.castaiDailyCost > 0
    );
    const avgBaselineDailyCost = withBoth.length
      ? withBoth.reduce((s, c) => s + c.baselineDailyCost, 0) / withBoth.length : 0;
    const avgCastaiDailyCost = withBoth.length
      ? withBoth.reduce((s, c) => s + c.castaiDailyCost, 0) / withBoth.length : 0;
    const avgDailyCostDelta = avgBaselineDailyCost > 0
      ? ((avgCastaiDailyCost - avgBaselineDailyCost) / avgBaselineDailyCost) * 100 : 0;

    // $/prov CPU-hr — the unit economics metric
    const withCpuHr = filteredClusters.filter(
      (c) => (c.baselineCostPerCpuHr ?? 0) > 0 && (c.castaiCostPerCpuHr ?? 0) > 0
    );
    const avgBaselineCpuHr = withCpuHr.length
      ? withCpuHr.reduce((s, c) => s + (c.baselineCostPerCpuHr ?? 0), 0) / withCpuHr.length : 0;
    const avgCastaiCpuHr = withCpuHr.length
      ? withCpuHr.reduce((s, c) => s + (c.castaiCostPerCpuHr ?? 0), 0) / withCpuHr.length : 0;
    const avgCpuHrDelta = avgBaselineCpuHr > 0
      ? ((avgCastaiCpuHr - avgBaselineCpuHr) / avgBaselineCpuHr) * 100 : 0;

    // CPU utilization
    const withBaseline = filteredClusters.filter((c) => c.baselineDays >= 3 && c.baselineCpuUtil > 0);
    const withCastai   = filteredClusters.filter((c) => c.castaiCpuUtil > 0);
    const avgBaselineCpu = withBaseline.length
      ? withBaseline.reduce((s, c) => s + c.baselineCpuUtil, 0) / withBaseline.length : 0;
    const avgCastaiCpu = withCastai.length
      ? withCastai.reduce((s, c) => s + c.castaiCpuUtil, 0) / withCastai.length : 0;

    // Overprovisioning
    const withOverprov = filteredClusters.filter(
      (c) => (c.baselineCpuOverprov ?? 0) > 0 && (c.castaiCpuOverprov ?? 0) > 0
    );
    const avgBaselineOverprov = withOverprov.length
      ? withOverprov.reduce((s, c) => s + (c.baselineCpuOverprov ?? 0), 0) / withOverprov.length : 0;
    const avgCastaiOverprov = withOverprov.length
      ? withOverprov.reduce((s, c) => s + (c.castaiCpuOverprov ?? 0), 0) / withOverprov.length : 0;

    const strongBaseline = filteredClusters.filter((c) => c.baselineQuality === 'strong').length;
    const weakBaseline   = filteredClusters.filter((c) => c.baselineQuality === 'weak').length;
    const noBaseline     = filteredClusters.filter((c) => c.baselineQuality === 'none').length;

    const optimizingCount = filteredClusters.filter((c) => c.mode === 'optimizing').length;
    const readOnlyCount   = filteredClusters.filter((c) => c.mode === 'read-only').length;

    return {
      savings, cost, savingsPct, annualSavings,
      avgBaselineCpu, avgCastaiCpu,
      avgBaselineDailyCost, avgCastaiDailyCost, avgDailyCostDelta,
      avgBaselineCpuHr, avgCastaiCpuHr, avgCpuHrDelta, cpuHrClusterCount: withCpuHr.length,
      avgBaselineOverprov, avgCastaiOverprov,
      strongBaseline, weakBaseline, noBaseline,
      baselineClusterCount: withBoth.length,
      optimizingCount, readOnlyCount,
    };
  }, [filteredClusters]);

  // ── Sorted table ───────────────────────────────────────────────────────────
  const sortedClusters = useMemo(() => {
    return [...filteredClusters].sort((a, b) => {
      const av = sortKey === 'name' ? a.name : (a[sortKey] as number);
      const bv = sortKey === 'name' ? b.name : (b[sortKey] as number);
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filteredClusters, sortKey, sortDir]);

  function setSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  // ── Bar chart ──────────────────────────────────────────────────────────────
  const barData = useMemo(
    () =>
      [...filteredClusters]
        .sort((a, b) => b.savings90d - a.savings90d)
        .slice(0, 20)
        .map((c) => ({ name: c.name.replace(/^xano-/, ''), savings: Math.round(c.savings90d), id: c.id })),
    [filteredClusters]
  );

  // ── Grouped cluster selector ───────────────────────────────────────────────
  const searchLower = search.toLowerCase();
  const groupedClusters = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      group: g,
      clusters: allClusters.filter(
        (c) => c.group === g && (!searchLower || c.name.toLowerCase().includes(searchLower))
      ),
    })).filter((g) => g.clusters.length > 0);
  }, [allClusters, searchLower]);

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className={`ml-1 text-xs ${sortKey === k ? 'text-indigo-600' : 'text-gray-300'}`}>
      {sortKey === k ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm font-medium">← Back</Link>
            <span className="text-gray-300">|</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {(data?.displayName ?? orgName).charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-lg">
                {data?.displayName ?? orgName}
              </span>
              <span className="ml-2 text-sm text-gray-400">Organization View</span>
            </div>
            {!isLoading && (
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">
                {filteredClusters.length} / {allClusters.length} clusters
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('overview')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'overview'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => {
                  setViewMode('report');
                  setSelectorOpen(true);
                }}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'report'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                ROI Report
              </button>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 rounded-lg bg-white print:hidden">
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Fee:</span>
              <span className="text-xs text-gray-400">$</span>
              <input
                type="number"
                value={monthlyFee || ''}
                onChange={(e) => setMonthlyFee(Math.max(0, Number(e.target.value)))}
                placeholder="0"
                className="w-20 text-xs font-semibold text-gray-800 text-right focus:outline-none bg-transparent"
                min={0}
                step={100}
              />
              <span className="text-xs text-gray-400">/mo</span>
            </div>
            <button
              onClick={() => setGuideOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How metrics work
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Metric Guide ─────────────────────────────────────────────────── */}
        {guideOpen && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">How every metric is calculated</h3>
              <button onClick={() => setGuideOpen(false)} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {METRIC_GUIDE.map((m) => (
                <div key={m.label} className="rounded-lg border border-gray-100 p-3 space-y-1">
                  <p className={`text-xs font-bold uppercase tracking-wide ${m.color}`}>{m.label}</p>
                  <p className="text-xs text-gray-700"><span className="font-semibold">What: </span>{m.what}</p>
                  <p className="text-xs text-gray-500"><span className="font-semibold">How: </span>{m.how}</p>
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1"><span className="font-semibold">Note: </span>{m.caveat}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stats (overview only) ────────────────────────────────────────── */}
        {viewMode === 'overview' && (
          isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse h-28 bg-white rounded-xl border border-gray-200" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* PRIMARY — Real before/after data */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Real Before vs After — from efficiency data ({totals.baselineClusterCount} clusters with baseline)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* $/day Before → After */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg $/day</div>
                    {totals.avgBaselineDailyCost > 0 ? (
                      <>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="text-sm text-gray-500">${totals.avgBaselineDailyCost.toFixed(0)}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-lg font-bold text-gray-900">${totals.avgCastaiDailyCost.toFixed(0)}</span>
                        </div>
                        <div className={`text-sm font-bold mt-1 ${totals.avgDailyCostDelta < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {totals.avgDailyCostDelta < 0 ? '↓' : '↑'}{Math.abs(totals.avgDailyCostDelta).toFixed(0)}%
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">before CAST AI → now</div>
                      </>
                    ) : (
                      <div className="text-lg font-bold text-gray-300 mt-1">—</div>
                    )}
                  </div>

                  {/* $/prov CPU-hr Before → After */}
                  <div className="bg-white rounded-xl border-2 border-indigo-200 p-4">
                    <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">$/prov CPU-hr</div>
                    {totals.avgBaselineCpuHr > 0 ? (
                      <>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="text-sm text-gray-500">${totals.avgBaselineCpuHr.toFixed(3)}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-lg font-bold text-gray-900">${totals.avgCastaiCpuHr.toFixed(3)}</span>
                        </div>
                        <div className={`text-sm font-bold mt-1 ${totals.avgCpuHrDelta < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {totals.avgCpuHrDelta < 0 ? '↓' : '↑'}{Math.abs(totals.avgCpuHrDelta).toFixed(0)}% per unit
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">all-in cost per provisioned CPU-hour ({totals.cpuHrClusterCount} clusters)</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-bold text-gray-300 mt-1">—</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">no baseline data</div>
                      </>
                    )}
                  </div>

                  {/* CPU Util Before → After */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CPU Utilization</div>
                    {totals.avgBaselineCpu > 0 ? (
                      <>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="text-sm text-gray-500">{totals.avgBaselineCpu.toFixed(0)}%</span>
                          <span className="text-gray-300">→</span>
                          <span className={`text-lg font-bold ${totals.avgCastaiCpu > totals.avgBaselineCpu ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {totals.avgCastaiCpu.toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">higher = more efficient</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-bold text-gray-900 mt-1.5">{totals.avgCastaiCpu > 0 ? `${totals.avgCastaiCpu.toFixed(0)}%` : '—'}</div>
                        <div className="text-[11px] text-gray-400 mt-1">current (no baseline)</div>
                      </>
                    )}
                  </div>

                  {/* Overprovisioning Before → After */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overprovisioning</div>
                    {totals.avgBaselineOverprov > 0 ? (
                      <>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="text-sm text-red-400">{totals.avgBaselineOverprov.toFixed(0)}%</span>
                          <span className="text-gray-300">→</span>
                          <span className={`text-lg font-bold ${totals.avgCastaiOverprov < totals.avgBaselineOverprov ? 'text-emerald-600' : 'text-red-500'}`}>
                            {totals.avgCastaiOverprov.toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">lower = less waste</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-bold text-gray-900 mt-1.5">{totals.avgCastaiOverprov > 0 ? `${totals.avgCastaiOverprov.toFixed(0)}%` : '—'}</div>
                        <div className="text-[11px] text-gray-400 mt-1">current (no baseline)</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* SECONDARY — CAST AI modeled savings */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">CAST AI Modeled Savings — spot + downscaling vs on-demand equivalent (90 days)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                    <div className="text-xl font-bold text-emerald-600">{fmt$(totals.savings)}</div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Modeled Savings</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                    <div className="text-xl font-bold text-gray-900">{fmt$(totals.cost)}</div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Actual Spend</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                    <div className="text-xl font-bold text-blue-600">{totals.savingsPct.toFixed(0)}%</div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Cost Reduced</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                    <div className="text-xl font-bold text-purple-600">{fmt$(totals.annualSavings)}</div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Est. Annual</div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── ROI Calculator (overview only) ──────────────────────────────── */}
        {viewMode === 'overview' && !isLoading && filteredClusters.length > 0 && (() => {
          // Tier-filtered clusters for ROI
          const strongCount = filteredClusters.filter((c) => c.baselineQuality === 'strong').length;
          const weakCount = filteredClusters.filter((c) => c.baselineQuality === 'weak').length;
          const allCount = filteredClusters.length;
          const roiClusters = filteredClusters.filter((c) => {
            if (roiTier === 'strong') return c.baselineQuality === 'strong';
            if (roiTier === 'weak+') return c.baselineQuality === 'strong' || c.baselineQuality === 'weak';
            return true;
          });
          const excludedCount = filteredClusters.length - roiClusters.length;

          const roi = computeMultiClusterROI(roiClusters, monthlyFee, data?.commitments);
          const paybackMonths = roi.monthlySavings > 0 && monthlyFee > 0 ? monthlyFee / roi.monthlySavings : 0;

          return (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setRoiCalcOpen((o) => !o)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-800">ROI Calculator</span>
                  <span className="text-xs text-gray-400">({roiClusters.length} clusters with baseline)</span>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${roiCalcOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {roiCalcOpen && (
                <div className="border-t border-gray-100 p-5 space-y-4">
                  {/* Baseline tier toggle */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Include clusters:</span>
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                      {([
                        { key: 'strong' as const, label: 'Strong baseline only', count: strongCount, color: 'bg-emerald-600' },
                        { key: 'weak+' as const, label: 'Include weak', count: strongCount + weakCount, color: 'bg-amber-500' },
                        { key: 'all' as const, label: 'All clusters', count: allCount, color: 'bg-gray-600' },
                      ]).map(({ key, label, count, color }) => (
                        <button
                          key={key}
                          onClick={() => setRoiTier(key)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                            roiTier === key
                              ? `${color} text-white shadow-sm`
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {label}
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                            roiTier === key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                          }`}>{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {excludedCount > 0 && (
                    <p className="text-xs text-gray-400">
                      {excludedCount} cluster{excludedCount !== 1 ? 's' : ''} excluded — {roiTier === 'strong' ? 'weak or no baseline data' : 'no baseline data'}
                    </p>
                  )}

                  {/* Inputs */}
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                      <span className="text-xs text-gray-500 font-medium">Monthly CAST AI fee:</span>
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        value={monthlyFee || ''}
                        onChange={(e) => setMonthlyFee(Math.max(0, Number(e.target.value)))}
                        placeholder="0"
                        className="w-24 text-sm font-semibold text-gray-800 text-right focus:outline-none bg-transparent"
                        min={0}
                        step={100}
                      />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                      <span className="text-xs text-gray-500 font-medium">Contract length:</span>
                      <input
                        type="number"
                        value={contractMonths}
                        onChange={(e) => setContractMonths(Math.max(1, Number(e.target.value)))}
                        className="w-12 text-sm font-semibold text-gray-800 text-right focus:outline-none bg-transparent"
                        min={1}
                        max={60}
                      />
                      <span className="text-xs text-gray-400">months</span>
                    </div>
                  </div>

                  {roi.clustersWithBaseline > 0 ? (
                    <>
                      {/* Core before → after metrics */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          Before → After ({roi.clustersWithBaseline} cluster{roi.clustersWithBaseline !== 1 ? 's' : ''} with baseline)
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="rounded-lg border border-gray-100 p-3">
                            <div className="text-xs text-gray-500 mb-1">Daily cost</div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">{fmt$(roi.totalBaselineDailyCost)}/d</span>
                              <span className="text-gray-300">→</span>
                              <span className="text-sm font-bold text-gray-800">{fmt$(roi.totalCastaiDailyCost)}/d</span>
                            </div>
                            {roi.costReductionPct > 0 && (
                              <div className="text-xs font-semibold text-emerald-600 mt-1">↓{roi.costReductionPct.toFixed(0)}%</div>
                            )}
                          </div>
                          <div className="rounded-lg border border-gray-100 p-3">
                            <div className="text-xs text-gray-500 mb-1">Monthly savings run rate</div>
                            <div className="text-lg font-bold text-emerald-600">{fmt$(roi.monthlySavings)}</div>
                            <div className="text-xs text-gray-400">Annual: {fmt$(roi.annualSavings)}</div>
                          </div>
                          <div className="rounded-lg border border-gray-100 p-3">
                            <div className="text-xs text-gray-500 mb-1">CPU utilization</div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">{roi.avgCpuUtilBefore > 0 ? `${roi.avgCpuUtilBefore.toFixed(0)}%` : '—'}</span>
                              <span className="text-gray-300">→</span>
                              <span className="text-sm font-bold text-gray-800">{roi.avgCpuUtilAfter > 0 ? `${roi.avgCpuUtilAfter.toFixed(0)}%` : '—'}</span>
                            </div>
                            {roi.avgCpuUtilBefore > 0 && roi.avgCpuUtilAfter > roi.avgCpuUtilBefore && (
                              <div className="text-xs font-semibold text-emerald-600 mt-1">↑{(roi.avgCpuUtilAfter - roi.avgCpuUtilBefore).toFixed(0)}pp</div>
                            )}
                          </div>
                          <div className="rounded-lg border border-gray-100 p-3">
                            <div className="text-xs text-gray-500 mb-1">Overprovisioning</div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">{roi.avgCpuOverprovBefore > 0 ? `${roi.avgCpuOverprovBefore.toFixed(0)}%` : '—'}</span>
                              <span className="text-gray-300">→</span>
                              <span className="text-sm font-bold text-gray-800">{roi.avgCpuOverprovAfter > 0 ? `${roi.avgCpuOverprovAfter.toFixed(0)}%` : '—'}</span>
                            </div>
                            {roi.avgCpuOverprovBefore > 0 && roi.avgCpuOverprovAfter < roi.avgCpuOverprovBefore && (
                              <div className="text-xs font-semibold text-emerald-600 mt-1">↓{(roi.avgCpuOverprovBefore - roi.avgCpuOverprovAfter).toFixed(0)}pp less waste</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* $/Requested-CPU-hr — workload-normalized metric */}
                      {(() => {
                        const baseReq = roiClusters.filter((c) => c.baselineCostPerRequestedCpuHr > 0);
                        const castReq = roiClusters.filter((c) => c.castaiCostPerRequestedCpuHr > 0);
                        const avgBaseReq = baseReq.length ? baseReq.reduce((s, c) => s + c.baselineCostPerRequestedCpuHr, 0) / baseReq.length : 0;
                        const avgCastReq = castReq.length ? castReq.reduce((s, c) => s + c.castaiCostPerRequestedCpuHr, 0) / castReq.length : 0;
                        if (avgBaseReq <= 0 && avgCastReq <= 0) return null;
                        const delta = avgBaseReq > 0 && avgCastReq > 0 ? ((avgCastReq - avgBaseReq) / avgBaseReq) * 100 : 0;
                        return (
                          <div className="border-t border-gray-100 pt-3">
                            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                              <div className="text-xs text-blue-600 font-medium mb-1">$/Requested CPU-hr (workload-normalized)</div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">{avgBaseReq > 0 ? `$${avgBaseReq.toFixed(4)}` : '—'}</span>
                                <span className="text-gray-300">→</span>
                                <span className="text-sm font-bold text-gray-800">{avgCastReq > 0 ? `$${avgCastReq.toFixed(4)}` : '—'}</span>
                                {delta < 0 && (
                                  <span className="text-xs font-semibold text-emerald-600">↓{Math.abs(delta).toFixed(0)}%</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">Normalizes for workload growth — if workloads doubled but cost per unit of work went down, that&apos;s real optimization.</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Savings decomposition (spot vs rightsizing) */}
                      {(roi.totalSpotSavings > 0 || roi.totalRightsizingSavings > 0) && (
                        <div className="border-t border-gray-100 pt-3">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Savings Breakdown (90d)</h4>
                          <div className="flex gap-3">
                            <div className="flex-1 rounded-lg border border-purple-100 bg-purple-50/50 p-3 text-center">
                              <div className="text-lg font-bold text-purple-600">{fmt$(roi.totalSpotSavings)}</div>
                              <div className="text-xs text-purple-500">Spot adoption</div>
                            </div>
                            <div className="flex-1 rounded-lg border border-teal-100 bg-teal-50/50 p-3 text-center">
                              <div className="text-lg font-bold text-teal-600">{fmt$(roi.totalRightsizingSavings)}</div>
                              <div className="text-xs text-teal-500">Rightsizing</div>
                            </div>
                          </div>
                          {roi.totalSpotSavings + roi.totalRightsizingSavings > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div className="h-full bg-purple-500" style={{ width: `${(roi.totalSpotSavings / (roi.totalSpotSavings + roi.totalRightsizingSavings)) * 100}%` }} />
                              </div>
                              <span className="text-xs text-gray-400">
                                {((roi.totalSpotSavings / (roi.totalSpotSavings + roi.totalRightsizingSavings)) * 100).toFixed(0)}% spot / {((roi.totalRightsizingSavings / (roi.totalSpotSavings + roi.totalRightsizingSavings)) * 100).toFixed(0)}% rightsizing
                              </span>
                            </div>
                          )}
                          <p className="text-xs text-gray-400 mt-1">From CAST AI optimization model (vs on-demand equivalent).</p>
                        </div>
                      )}

                      {/* Baseline outlier note */}
                      {(() => {
                        const withOutliers = roiClusters.filter((c) => (c.baselineOutlierDays ?? 0) > 0);
                        if (!withOutliers.length) return null;
                        const totalOutlierDays = withOutliers.reduce((s, c) => s + (c.baselineOutlierDays ?? 0), 0);
                        return (
                          <p className="text-xs text-amber-600 border-t border-gray-100 pt-3">
                            {totalOutlierDays} anomalous day{totalOutlierDays !== 1 ? 's' : ''} detected in {withOutliers.length} cluster baseline{withOutliers.length !== 1 ? 's' : ''}. Baseline averages use cleaned data (outliers excluded via IQR method).
                          </p>
                        );
                      })()}

                      {/* Fee-based ROI */}
                      {monthlyFee > 0 && (
                        <div className="border-t border-gray-100 pt-4">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Net ROI (after fee)</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-center">
                              <div className={`text-lg font-bold ${roi.roiMultiple >= 1 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {roi.roiMultiple.toFixed(1)}x
                              </div>
                              <div className="text-xs text-indigo-600 font-medium mt-0.5">ROI multiple</div>
                            </div>
                            <div className={`rounded-lg border p-3 text-center ${roi.netMonthlyBenefit > 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
                              <div className={`text-lg font-bold ${roi.netMonthlyBenefit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {roi.netMonthlyBenefit > 0 ? '+' : ''}{fmt$(roi.netMonthlyBenefit)}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">Net monthly</div>
                            </div>
                            <div className={`rounded-lg border p-3 text-center ${roi.annualNetBenefit > 0 ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}>
                              <div className={`text-lg font-bold ${roi.annualNetBenefit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {roi.annualNetBenefit > 0 ? '+' : ''}{fmt$(roi.annualNetBenefit)}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">Net annual</div>
                            </div>
                            <div className="rounded-lg border border-gray-100 p-3 text-center">
                              <div className="text-lg font-bold text-gray-900">
                                {paybackMonths > 0 ? `${paybackMonths.toFixed(1)} mo` : '—'}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">Payback period</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {monthlyFee === 0 && (
                        <p className="text-xs text-gray-400 text-center">Enter a monthly CAST AI fee above to see net ROI.</p>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-500">No clusters with {roiTier === 'strong' ? 'strong' : 'sufficient'} baseline data.</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {roiTier === 'strong' ? 'Try "Include weak" or "All clusters" to see ROI estimates with lower confidence.' : 'Clusters need pre-CAST AI monitoring data for before/after comparison.'}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                    All metrics are real before→after comparisons from efficiency API data. Savings = baseline daily cost minus current daily cost. No modeled or hypothetical numbers.
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Commitment/RI Summary (overview only, when commitments exist) ─── */}
        {viewMode === 'overview' && !isLoading && (() => {
          const roiClusters = filteredClusters.filter((c) => {
            if (roiTier === 'strong') return c.baselineQuality === 'strong';
            if (roiTier === 'weak+') return c.baselineQuality === 'strong' || c.baselineQuality === 'weak';
            return true;
          });
          const roi = computeMultiClusterROI(roiClusters, monthlyFee, data?.commitments);
          if (!roi.commitments) return null;
          return <CommitmentSummaryCard commitments={roi.commitments} />;
        })()}

        {/* ── Data freshness warnings (overview only) ─────────────────────────── */}
        {viewMode === 'overview' && !isLoading && (() => {
          const staleClusters = filteredClusters.filter((c) => c.dataStale);
          if (!staleClusters.length) return null;
          return (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">&#9888;&#65039;</span>
              <span>
                {staleClusters.length} cluster{staleClusters.length !== 1 ? 's have' : ' has'} stale data ({staleClusters.map((c) => c.name).join(', ')}).
                These may be disconnected from CAST AI.
              </span>
            </div>
          );
        })()}

        {/* ── Baseline validation callout (overview only) ────────────────────── */}
        {viewMode === 'overview' && !isLoading && allClusters.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">Baseline Strength</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  <span className="text-emerald-700 font-semibold">Strong (≥14 days):</span> real before/after cost comparison available — most credible savings case.&nbsp;
                  <span className="text-amber-600 font-semibold">Weak (3–13 days):</span> limited pre-CAST data, directionally valid.&nbsp;
                  <span className="text-gray-500 font-semibold">None (&lt;3 days):</span> no pre-CAST history — savings from CAST AI on-demand model only.
                  Clusters are ranked by baseline days in the table.
                </p>
              </div>
              <div className="flex gap-4 text-center flex-shrink-0">
                <div>
                  <div className="text-lg font-bold text-emerald-600">{totals.optimizingCount}</div>
                  <div className="text-xs text-gray-400">Optimizing</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-500">{totals.readOnlyCount}</div>
                  <div className="text-xs text-gray-400">Read-only</div>
                </div>
                <div className="border-l border-gray-200 pl-4">
                  <div className="text-lg font-bold text-emerald-600">{totals.strongBaseline}</div>
                  <div className="text-xs text-gray-400">Strong</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-500">{totals.weakBaseline}</div>
                  <div className="text-xs text-gray-400">Weak</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-400">{totals.noBaseline}</div>
                  <div className="text-xs text-gray-400">None</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Cluster selector ─────────────────────────────────────────────── */}
        <div className={`bg-white rounded-xl border overflow-hidden ${viewMode === 'report' ? 'border-indigo-200' : 'border-gray-200'}`}>
          {/* Header row: always shows search + count in report mode */}
          <div className="flex items-center gap-3 px-5 py-3">
            {viewMode === 'report' ? (
              <>
                <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search and select clusters to build the ROI story…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 text-sm focus:outline-none bg-transparent placeholder-gray-400"
                  autoFocus
                />
              </>
            ) : (
              <button
                onClick={() => setSelectorOpen((o) => !o)}
                className="flex-1 flex items-center justify-between hover:bg-gray-50 -mx-5 -my-3 px-5 py-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800">Cluster Filter</span>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${selectorOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full flex-shrink-0">
              {effectiveSelected.size} / {allClusters.length}
            </span>
            <button onClick={selectAll} className="px-2.5 py-1 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0">
              All
            </button>
            <button onClick={deselectAll} className="px-2.5 py-1 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0">
              None
            </button>
          </div>

          {/* Cluster grid — always open in report mode, toggled in overview mode */}
          {(viewMode === 'report' || selectorOpen) && (
            <div className="border-t border-gray-100 p-5">
              {/* Search bar inside for overview mode (report mode has it in the header) */}
              {viewMode === 'overview' && (
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search clusters…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {groupedClusters.map(({ group, clusters }) => (
                  <div key={group}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${GROUP_COLORS[group] ?? 'bg-gray-100 text-gray-600'}`}>{group}</span>
                      <span className="text-xs text-gray-400">{clusters.length}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {clusters.map((c) => {
                        const isSelected = effectiveSelected.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(c.id)}
                              className="accent-indigo-600 flex-shrink-0"
                            />
                            <span className="truncate font-medium">{c.name}</span>
                            {c.mode === 'read-only' && (
                              <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-400" title="Read-only" />
                            )}
                            {viewMode === 'report' && c.mode !== 'read-only' && c.baselineQuality !== 'none' && (
                              <span className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.baselineQuality === 'strong' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {groupedClusters.length === 0 && search && (
                  <p className="text-xs text-gray-400 text-center py-4">No clusters match &quot;{search}&quot;</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Overview content ─────────────────────────────────────────────── */}
        {viewMode === 'overview' && (
          <>
            {/* ── Savings bar chart ─────────────────────────────────────────── */}
            {!isLoading && barData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
                  Savings by Cluster — Top {barData.length} (90 days)
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  CAST AI modeled savings: spot + downscaling vs on-demand equivalent
                </p>
                <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 28)}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [fmt$(v as number), 'Savings (vs on-demand)']} />
                    <Bar dataKey="savings" radius={[0, 4, 4, 0]}>
                      {barData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Cluster table ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Cluster-by-Cluster Breakdown</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Sorted by baseline days — more pre-CAST history = more validated evidence
                  </p>
                </div>
                <span className="text-xs text-gray-400">{sortedClusters.length} clusters</span>
              </div>

              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse h-10 bg-gray-100 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('name')} className="flex items-center gap-1 hover:text-gray-800">
                            Cluster <SortIcon k="name" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Env
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Mode
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('baselineDays')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            Baseline <SortIcon k="baselineDays" />
                          </button>
                        </th>
                        {/* CPU Before → After */}
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          CPU util Before→After
                        </th>
                        {/* Overprovisioning Before → After */}
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          Overprov Before→After
                        </th>
                        {/* Current $/day */}
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('castaiDailyCost')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            Current $/day <SortIcon k="castaiDailyCost" />
                          </button>
                        </th>
                        {/* $/CPU-hr */}
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('castaiCostPerCpuHr')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            $/CPU-hr <SortIcon k="castaiCostPerCpuHr" />
                          </button>
                        </th>
                        {/* Daily cost delta */}
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('dailyCostDelta')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            Daily $/day ↓ <SortIcon k="dailyCostDelta" />
                          </button>
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('savings90d')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            Savings 90d <SortIcon k="savings90d" />
                          </button>
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('cost90d')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            Spend 90d <SortIcon k="cost90d" />
                          </button>
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <button onClick={() => setSort('savingsPct')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                            Saved% <SortIcon k="savingsPct" />
                          </button>
                        </th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortedClusters.map((c, i) => (
                        <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.status === 'error' ? 'opacity-50' : ''}`}>
                          {/* Name */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </span>
                              <span className="font-medium text-gray-800">{c.name}</span>
                            </div>
                            <div className="text-xs text-gray-400 ml-7">{c.region}</div>
                          </td>
                          {/* Env */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium w-fit ${GROUP_COLORS[c.group] ?? 'bg-gray-100 text-gray-600'}`}>
                                {c.group}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold w-fit ${PROVIDER_COLORS[c.provider] ?? 'bg-gray-100 text-gray-600'}`}>
                                {c.provider}
                              </span>
                            </div>
                          </td>
                          {/* Mode */}
                          <td className="px-4 py-3 text-center">
                            <ModeBadge mode={c.mode} />
                          </td>
                          {/* Baseline badge */}
                          <td className="px-4 py-3 text-right">
                            <BaselineBadge q={c.baselineQuality} days={c.baselineDays} />
                          </td>
                          {/* CPU before → after */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {c.baselineCpuUtil > 0 ? (
                              <span className="text-xs">
                                <span className="text-gray-500">{c.baselineCpuUtil.toFixed(0)}%</span>
                                <span className="text-gray-300 mx-1">→</span>
                                <span className={`font-semibold ${c.castaiCpuUtil > c.baselineCpuUtil ? 'text-emerald-600' : 'text-gray-700'}`}>
                                  {c.castaiCpuUtil.toFixed(0)}%
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">
                                — → {c.castaiCpuUtil > 0 ? `${c.castaiCpuUtil.toFixed(0)}%` : '—'}
                              </span>
                            )}
                          </td>
                          {/* Overprovisioning before → after */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {c.baselineCpuOverprov > 0 ? (
                              <span className="text-xs">
                                <span className="text-red-400 font-semibold">{c.baselineCpuOverprov.toFixed(0)}%</span>
                                <span className="text-gray-300 mx-1">→</span>
                                <span className={`font-semibold ${c.castaiCpuOverprov < c.baselineCpuOverprov ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {c.castaiCpuOverprov.toFixed(0)}%
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">
                                — → {c.castaiCpuOverprov > 0 ? `${c.castaiCpuOverprov.toFixed(0)}%` : '—'}
                              </span>
                            )}
                          </td>
                          {/* Current $/day */}
                          <td className="px-4 py-3 text-right">
                            {c.castaiDailyCost > 0 ? (
                              <span className="text-xs font-semibold text-gray-700">{fmt$(c.castaiDailyCost)}/d</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          {/* $/CPU-hr */}
                          <td className="px-4 py-3 text-right">
                            {c.castaiCostPerCpuHr > 0 ? (
                              <span className="text-xs font-medium text-gray-600">${c.castaiCostPerCpuHr.toFixed(3)}</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          {/* Daily cost delta */}
                          <td className="px-4 py-3 text-right">
                            {c.baselineDailyCost > 0 && c.castaiDailyCost > 0 ? (
                              <div className="text-xs">
                                <div>{fmtDelta(c.dailyCostDelta)}</div>
                                <div className="text-gray-400">
                                  {fmt$(c.baselineDailyCost)}/d → {fmt$(c.castaiDailyCost)}/d
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">no baseline</span>
                            )}
                          </td>
                          {/* Savings 90d */}
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                            {c.savings90d > 0 ? fmt$(c.savings90d) : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Spend 90d */}
                          <td className="px-4 py-3 text-right text-gray-700">
                            {c.cost90d > 0 ? fmt$(c.cost90d) : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Saved% */}
                          <td className="px-4 py-3 text-right">
                            {c.savingsPct > 0 ? (
                              <span className={`font-semibold ${c.savingsPct >= 50 ? 'text-emerald-600' : c.savingsPct >= 25 ? 'text-blue-600' : 'text-gray-600'}`}>
                                {c.savingsPct.toFixed(0)}%
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Deep dive */}
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/${c.id}`}
                              className="px-3 py-1 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap"
                            >
                              Deep dive →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ROI Report view ──────────────────────────────────────────────── */}
        {viewMode === 'report' && (
          <OrgReportView
            clusters={filteredClusters}
            orgName={data?.displayName ?? orgName}
            monthlyFee={monthlyFee}
            loading={isLoading}
          />
        )}


      </div>
    </div>
  );
}
