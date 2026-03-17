import type { RawEfficiencyResponse } from '@/lib/castai/efficiency-adapter';

const BASE = process.env.CASTAI_BASE_URL ?? 'https://api.cast.ai/v1';

// ─── Multi-org API key registry ───────────────────────────────────────────────
// Reads CASTAI_API_KEY (default org) + CASTAI_API_KEY_<NAME> (additional orgs)
export const ORG_KEYS: { name: string; key: string }[] = [];

(function parseOrgKeys() {
  const def = process.env.CASTAI_API_KEY;
  if (def) ORG_KEYS.push({ name: 'Default', key: def });

  for (const [envVar, value] of Object.entries(process.env)) {
    if (envVar.startsWith('CASTAI_API_KEY_') && value) {
      const suffix = envVar.slice('CASTAI_API_KEY_'.length);
      // Skip reserved Next.js suffixes
      if (!['BASE_URL'].includes(suffix)) {
        ORG_KEYS.push({ name: suffix, key: value });
      }
    }
  }
})();

function makeHeaders(apiKey: string) {
  return {
    'X-API-Key': apiKey,
    'Accept': 'application/json',
    'User-Agent': 'castai-roi-dashboard/1.0',
  };
}

async function get<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: makeHeaders(apiKey),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CAST AI ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Clusters ─────────────────────────────────────────────────────────────────

export interface RealCluster {
  id: string;
  name: string;
  status: string;
  providerType?: string;
  region?: { name: string; displayName: string };
  organizationId?: string;
  createdAt?: string;
  firstOperationAt?: string; // best proxy for "CAST AI enabled at"
}

export async function listClustersForKey(apiKey: string): Promise<RealCluster[]> {
  const data = await get<{ items: RealCluster[] }>('kubernetes/external-clusters', apiKey);
  return data.items ?? [];
}

/** Uses the first (default) org key. For multi-org use listClustersForKey. */
export async function listClusters(): Promise<RealCluster[]> {
  return listClustersForKey(ORG_KEYS[0]?.key ?? '');
}

export async function getCluster(clusterId: string, apiKey: string): Promise<RealCluster | null> {
  const clusters = await listClustersForKey(apiKey);
  return clusters.find((c) => c.id === clusterId) ?? null;
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

export interface RealNode {
  id: string;
  name: string;
  instanceType: string;
  cloud: string;
  state: { phase: string };
  spotConfig: { isSpot: boolean; price: string };
  labels?: Record<string, string>;
  createdAt: string;
}

export async function listNodes(clusterId: string, apiKey: string): Promise<RealNode[]> {
  const data = await get<{ items: RealNode[] }>(
    `kubernetes/external-clusters/${clusterId}/nodes`,
    apiKey
  );
  return data.items ?? [];
}

// ─── Efficiency ───────────────────────────────────────────────────────────────

export async function getEfficiency(
  clusterId: string,
  startTime: string,
  endTime: string,
  apiKey: string
) {
  return get<RawEfficiencyResponse>(
    `cost-reports/clusters/${clusterId}/efficiency?startTime=${startTime}&endTime=${endTime}`,
    apiKey
  );
}

// ─── Chunked efficiency fetch (365-day max span workaround) ──────────────────

const MAX_SPAN_MS = 365 * 24 * 60 * 60 * 1000; // 365 days in ms

export async function fetchEfficiencyChunked(
  clusterId: string,
  startTime: string,
  endTime: string,
  apiKey: string
): Promise<RawEfficiencyResponse> {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  // If within the limit, just do a single fetch
  if (endMs - startMs <= MAX_SPAN_MS) {
    return getEfficiency(clusterId, startTime, endTime, apiKey);
  }

  // Split into 365-day chunks
  const chunks: { start: string; end: string }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + MAX_SPAN_MS, endMs);
    chunks.push({
      start: new Date(cursor).toISOString(),
      end: new Date(chunkEnd).toISOString(),
    });
    cursor = chunkEnd;
  }

  const results = await Promise.all(
    chunks.map((c) => getEfficiency(clusterId, c.start, c.end, apiKey))
  );

  // Merge all items, deduping by date (timestamp)
  const seen = new Set<string>();
  const allItems: RawEfficiencyResponse['items'] = [];
  for (const r of results) {
    for (const item of r.items ?? []) {
      const key = item.timestamp.slice(0, 10);
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }
  }

  // Use summary/current from the most recent chunk (last one)
  const last = results[results.length - 1];
  return {
    clusterId: last.clusterId,
    items: allItems,
    summary: last.summary,
    current: last.current,
  };
}

// ─── Savings ──────────────────────────────────────────────────────────────────

export interface RealSavingsItem {
  timestamp: string;
  downscalingSavings: string;
  spotSavings: string;
}

export interface RealSavingsResponse {
  clusterId: string;
  items: RealSavingsItem[];
  summary: {
    totalCost: string;
    totalSavings: string;
  };
}

export async function getSavings(
  clusterId: string,
  startTime: string,
  endTime: string,
  apiKey: string
) {
  return get<RealSavingsResponse>(
    `cost-reports/clusters/${clusterId}/savings?startTime=${startTime}&endTime=${endTime}`,
    apiKey
  );
}

// ─── Workload Costs ───────────────────────────────────────────────────────────

export interface RealWorkloadCostItem {
  workloadName: string;
  workloadType: string;
  namespace: string;
  costMetrics: {
    timestamp: string;
    costOnDemand: string;
    costSpot: string;
    cpuCountOnDemand: string;
    podCountOnDemand: string;
    cpuCostOnDemand: string;
    ramCostOnDemand: string;
  }[];
}

export async function getWorkloadCosts(
  clusterId: string,
  startTime: string,
  endTime: string,
  apiKey: string
) {
  return get<{
    clusterId: string;
    items: RealWorkloadCostItem[];
    count: number;
    nextCursor?: string;
  }>(`cost-reports/clusters/${clusterId}/workload-costs?startTime=${startTime}&endTime=${endTime}`, apiKey);
}

// ─── Rebalancing Schedules ────────────────────────────────────────────────────

export interface RebalancingJob {
  id: string;
  clusterId: string;
  rebalancingScheduleId: string;
  rebalancingPlanId: string;
  enabled: boolean;
  lastTriggerAt: string;
  nextTriggerAt: string;
  status: string;
}

export interface RebalancingSchedule {
  id: string;
  name: string;
  schedule: { cron: string };
  triggerConditions: { savingsPercentage: number; ignoreSavings: boolean };
  launchConfiguration: {
    rebalancingOptions: {
      executionConditions: { enabled: boolean; achievedSavingsPercentage: number };
      aggressiveMode: boolean;
    };
  };
  lastTriggerAt: string;
  nextTriggerAt: string;
  jobs: RebalancingJob[];
}

export async function getRebalancingSchedules(apiKey: string): Promise<RebalancingSchedule[]> {
  const data = await get<{ schedules: RebalancingSchedule[] }>('rebalancing-schedules', apiKey);
  return data.schedules ?? [];
}
