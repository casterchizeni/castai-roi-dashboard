import { NextResponse } from 'next/server';
import {
  ORG_KEYS,
  listClustersForKey,
  getSavings,
  getEfficiency,
} from '@/lib/castai/real-api';
import type { RawEfficiencyItem } from '@/lib/castai/efficiency-adapter';

function providerLabel(p?: string) {
  if (p === 'aks') return 'Azure AKS';
  if (p === 'eks') return 'AWS EKS';
  if (p === 'gke') return 'GCP GKE';
  return p ?? 'Kubernetes';
}

function groupLabel(name: string) {
  const n = name.toLowerCase();
  if (/\bprod\b/.test(n) && !/non.?prod/.test(n)) return 'Production';
  if (/non.?prod|nonprod|uat|staging|sit/.test(n)) return 'Non-Prod';
  if (/\btest(ing)?\b|\bqa\b|\bdev\b/.test(n)) return 'Testing';
  if (/\bdr\b/.test(n)) return 'DR';
  return 'Other';
}

// ─── Period metrics helper ─────────────────────────────────────────────────────
// Computes avg daily cost and avg CPU utilization from efficiency API items.
// Cost = actual $$ from cpuCost* + ramCost* + storageCost fields.
// CPU util = used / provisioned (both on-demand + spot combined).
function computePeriodMetrics(items: RawEfficiencyItem[]): {
  dailyCost: number;
  cpuUtil: number;
  cpuOverprov: number;
  costPerCpuHr: number;
  days: number;
} {
  if (!items.length) return { dailyCost: 0, cpuUtil: 0, cpuOverprov: 0, costPerCpuHr: 0, days: 0 };
  const n = (s?: string) => parseFloat(s ?? '0') || 0;

  let totalCost = 0;
  const utilSamples: number[] = [];
  const overprovSamples: number[] = [];
  const costPerCpuSamples: number[] = [];

  for (const item of items) {
    const hourlyCost = (
      n(item.cpuCostOnDemand) + n(item.cpuCostSpot) + n(item.cpuCostSpotFallback) +
      n(item.ramCostOnDemand) + n(item.ramCostSpot) + n(item.ramCostSpotFallback) +
      n(item.storageCost)
    );
    totalCost += hourlyCost * 24; // daily

    const prov = n(item.cpuCountOnDemand) + n(item.cpuCountSpot);
    const used = n(item.cpuUsedOnDemand) + n(item.cpuUsedSpot);
    if (prov > 0) {
      utilSamples.push((used / prov) * 100);
      // $/provisioned CPU-hour = all-in hourly cost / provisioned CPUs
      costPerCpuSamples.push(hourlyCost / prov);
    }

    const odPct = n(item.cpuOverprovisioningOnDemandPercent);
    const spotPct = n(item.cpuOverprovisioningSpotPercent);
    if (odPct > 0 || spotPct > 0) {
      const count = (odPct > 0 ? 1 : 0) + (spotPct > 0 ? 1 : 0);
      overprovSamples.push((odPct + spotPct) / count);
    }
  }

  return {
    dailyCost: totalCost / items.length,
    cpuUtil: utilSamples.length
      ? utilSamples.reduce((a, b) => a + b, 0) / utilSamples.length
      : 0,
    cpuOverprov: overprovSamples.length
      ? overprovSamples.reduce((a, b) => a + b, 0) / overprovSamples.length
      : 0,
    costPerCpuHr: costPerCpuSamples.length
      ? costPerCpuSamples.reduce((a, b) => a + b, 0) / costPerCpuSamples.length
      : 0,
    days: items.length,
  };
}

export interface ClusterOrgSummary {
  id: string;
  name: string;
  provider: string;
  region: string;
  group: string;

  // ── CAST AI savings API (last 90 days) ────────────────────────────────────
  // Baseline for these numbers: on-demand pricing for the same resources.
  // i.e. "what would you have paid if every node were on-demand, no rightsizing"
  savings90d: number;   // $$ cost avoided (spot diff + downscaling savings)
  cost90d: number;      // $$ you actually paid (with CAST AI active)
  savingsPct: number;   // savings / (savings + cost) — % reduction vs on-demand baseline

  // ── Efficiency API — CAST AI managed period ───────────────────────────────
  // Fetched from max(firstOperationAt, 90d ago) to now.
  // Cost here comes from efficiency items (cpuCost + ramCost + storage).
  castaiDailyCost: number;    // avg $/day with CAST AI
  castaiCpuUtil: number;      // avg CPU utilization % with CAST AI
  castaiCpuOverprov: number;  // avg CPU overprovisioning % WITH CAST AI — residual waste
  castaiCostPerCpuHr: number; // avg $/provisioned CPU-hour with CAST AI
  castaiDays: number;         // number of days in this window

  // ── Efficiency API — pre-CAST AI baseline period ──────────────────────────
  // Fetched from createdAt to firstOperationAt (only when baselineDays >= 3).
  // These are REAL historical numbers before any CAST AI optimization.
  baselineDailyCost: number;  // avg $/day BEFORE CAST AI acted
  baselineCpuUtil: number;    // avg CPU util % BEFORE CAST AI acted
  baselineCpuOverprov: number;// avg CPU overprovisioning % BEFORE CAST AI — the "waste" before
  baselineCostPerCpuHr: number; // avg $/provisioned CPU-hour BEFORE CAST AI
  baselineDays: number;       // days of actual pre-CAST data available

  // ── Derived comparison ────────────────────────────────────────────────────
  // Only meaningful when baselineDays >= 3 AND both costs > 0.
  // Negative value = cost went DOWN (good). E.g. -45 means 45% cheaper.
  dailyCostDelta: number;
  costPerCpuHrDelta: number;  // % change in $/prov CPU-hr (negative = cheaper per unit)

  // ── Baseline quality classification ──────────────────────────────────────
  baselineQuality: 'strong' | 'weak' | 'none';

  // ── Cluster mode ────────────────────────────────────────────────────────
  // 'optimizing' = CAST AI is actively managing (has firstOperationAt + savings)
  // 'read-only'  = monitoring only — collecting data but not optimizing
  mode: 'optimizing' | 'read-only';

  // backward compat
  cpuUtil: number; // = castaiCpuUtil

  firstOperationAt?: string;
  createdAt?: string;
  status: 'ok' | 'error';
}

export interface OrgDashboardData {
  orgName: string;
  displayName: string;
  clusters: ClusterOrgSummary[];
}

function computeBaselineQuality(createdAt?: string, firstOpAt?: string): {
  baselineDays: number;
  baselineQuality: 'strong' | 'weak' | 'none';
} {
  if (!createdAt || !firstOpAt) return { baselineDays: 0, baselineQuality: 'none' };
  const created = new Date(createdAt).getTime();
  const firstOp = new Date(firstOpAt).getTime();
  const diffMs = firstOp - created;
  const baselineDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  const baselineQuality = baselineDays >= 14 ? 'strong' : baselineDays >= 3 ? 'weak' : 'none';
  return { baselineDays, baselineQuality };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgName: string }> }
) {
  const { orgName } = await params;

  const orgEntry = ORG_KEYS.find(
    (o) => o.name.toLowerCase() === orgName.toLowerCase() ||
           (orgName === 'my-org' && o.name === 'Default')
  );

  // Support dynamic API keys passed via header (for user-added orgs)
  const dynamicKey = req.headers.get('x-castai-key');

  if (!orgEntry && !dynamicKey) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 });
  }

  const key = orgEntry?.key ?? dynamicKey!;
  const name = orgEntry?.name ?? orgName;
  const displayName = name === 'Default' ? 'My Org' : name;

  const allClusters = await listClustersForKey(key);
  const readyClusters = allClusters.filter((c) => c.status === 'ready');

  const now = new Date();
  const end = now.toISOString();
  const start90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const start14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const summaries = await Promise.allSettled(
    readyClusters.map(async (cluster): Promise<ClusterOrgSummary> => {
      const { baselineDays, baselineQuality } = computeBaselineQuality(
        cluster.createdAt,
        cluster.firstOperationAt
      );

      // The start of the "CAST AI active" period for efficiency:
      // use firstOperationAt if available, but cap back to start90 so we don't fetch years of data.
      const castaiEffStart =
        cluster.firstOperationAt && new Date(cluster.firstOperationAt) > new Date(start90)
          ? cluster.firstOperationAt
          : start90;

      // Only fetch baseline efficiency when we have ≥3 days of pre-CAST data.
      const wantBaseline = baselineDays >= 3 && !!cluster.createdAt && !!cluster.firstOperationAt;

      const [savingsRes, castaiEffRes, baselineEffRes] = await Promise.allSettled([
        getSavings(cluster.id, start90, end, key),
        getEfficiency(cluster.id, castaiEffStart, end, key),
        wantBaseline
          ? getEfficiency(cluster.id, cluster.createdAt!, cluster.firstOperationAt!, key)
          : Promise.resolve(null),
      ]);

      // ── Savings API ──────────────────────────────────────────────────────
      const savings90d =
        savingsRes.status === 'fulfilled'
          ? parseFloat(savingsRes.value.summary?.totalSavings ?? '0')
          : 0;
      const cost90d =
        savingsRes.status === 'fulfilled'
          ? parseFloat(savingsRes.value.summary?.totalCost ?? '0')
          : 0;
      const savingsPct = cost90d + savings90d > 0
        ? (savings90d / (cost90d + savings90d)) * 100
        : 0;

      // ── CAST AI period efficiency ────────────────────────────────────────
      const castaiItems: RawEfficiencyItem[] =
        castaiEffRes.status === 'fulfilled' && castaiEffRes.value
          ? (castaiEffRes.value as { items: RawEfficiencyItem[] }).items ?? []
          : [];
      const castai = computePeriodMetrics(castaiItems);

      // ── Baseline period efficiency (pre-CAST AI) ─────────────────────────
      const baselineItems: RawEfficiencyItem[] =
        baselineEffRes.status === 'fulfilled' && baselineEffRes.value
          ? (baselineEffRes.value as { items: RawEfficiencyItem[] }).items ?? []
          : [];
      const baseline = computePeriodMetrics(baselineItems);

      // ── Derived deltas ───────────────────────────────────────────────────
      const dailyCostDelta =
        baseline.dailyCost > 0 && castai.dailyCost > 0
          ? ((castai.dailyCost - baseline.dailyCost) / baseline.dailyCost) * 100
          : 0;
      const costPerCpuHrDelta =
        baseline.costPerCpuHr > 0 && castai.costPerCpuHr > 0
          ? ((castai.costPerCpuHr - baseline.costPerCpuHr) / baseline.costPerCpuHr) * 100
          : 0;

      // Detect mode: optimizing if CAST AI has acted AND produced savings
      const mode: 'optimizing' | 'read-only' =
        cluster.firstOperationAt && savings90d > 0 ? 'optimizing' : 'read-only';

      return {
        id: cluster.id,
        name: cluster.name,
        provider: providerLabel(cluster.providerType),
        region: cluster.region?.displayName ?? cluster.region?.name ?? '',
        group: groupLabel(cluster.name),
        mode,
        savings90d,
        cost90d,
        savingsPct,
        castaiDailyCost: castai.dailyCost,
        castaiCpuUtil: castai.cpuUtil,
        castaiCpuOverprov: castai.cpuOverprov,
        castaiCostPerCpuHr: castai.costPerCpuHr,
        castaiDays: castai.days,
        baselineDailyCost: baseline.dailyCost,
        baselineCpuUtil: baseline.cpuUtil,
        baselineCpuOverprov: baseline.cpuOverprov,
        baselineCostPerCpuHr: baseline.costPerCpuHr,
        baselineDays,
        baselineQuality,
        dailyCostDelta,
        costPerCpuHrDelta,
        cpuUtil: castai.cpuUtil,
        firstOperationAt: cluster.firstOperationAt,
        createdAt: cluster.createdAt,
        status: 'ok',
      };
    })
  );

  const clusters: ClusterOrgSummary[] = summaries.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const c = readyClusters[i];
    const { baselineDays, baselineQuality } = computeBaselineQuality(c.createdAt, c.firstOperationAt);
    return {
      id: c.id,
      name: c.name,
      provider: providerLabel(c.providerType),
      region: c.region?.displayName ?? '',
      group: groupLabel(c.name),
      mode: 'read-only' as const,
      savings90d: 0,
      cost90d: 0,
      savingsPct: 0,
      castaiDailyCost: 0,
      castaiCpuUtil: 0,
      castaiCpuOverprov: 0,
      castaiCostPerCpuHr: 0,
      castaiDays: 0,
      baselineDailyCost: 0,
      baselineCpuUtil: 0,
      baselineCpuOverprov: 0,
      baselineCostPerCpuHr: 0,
      baselineDays,
      baselineQuality,
      dailyCostDelta: 0,
      costPerCpuHrDelta: 0,
      cpuUtil: 0,
      firstOperationAt: c.firstOperationAt,
      createdAt: c.createdAt,
      status: 'error',
    };
  });

  return NextResponse.json({ orgName: name, displayName, clusters } satisfies OrgDashboardData);
}
