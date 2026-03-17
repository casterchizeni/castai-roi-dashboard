import { NextRequest, NextResponse } from 'next/server';
import {
  ORG_KEYS,
  listClustersForKey,
  listNodes,
  getEfficiency,
  fetchEfficiencyChunked,
  getSavings,
  getWorkloadCosts,
  getRebalancingSchedules,
  getCluster,
} from '@/lib/castai/real-api';
import {
  adaptEfficiencyToCostHistory,
  adaptEfficiencyReport,
} from '@/lib/castai/efficiency-adapter';
import { detectAutoscalerEvents } from '@/lib/calculations/events';

// ─── Per-cluster API key resolution ──────────────────────────────────────────
// Caches clusterId → apiKey so we only do the lookup once per cold start

const clusterKeyCache = new Map<string, string>();

async function resolveOrgKey(clusterId: string): Promise<string> {
  if (clusterKeyCache.has(clusterId)) return clusterKeyCache.get(clusterId)!;

  // Try all org keys in parallel and cache all their clusters
  await Promise.allSettled(
    ORG_KEYS.map(async ({ key }) => {
      try {
        const clusters = await listClustersForKey(key);
        for (const c of clusters) clusterKeyCache.set(c.id, key);
      } catch { /* skip unreachable org */ }
    })
  );

  // Return resolved key, or fall back to first available key
  return clusterKeyCache.get(clusterId) ?? ORG_KEYS[0]?.key ?? '';
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateRange(daysBack = 365) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function savingsRange() { return dateRange(90); }
function shortRange(daysBack = 7) { return dateRange(daysBack); }

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const type = req.nextUrl.searchParams.get('type') ?? 'cost';

  // Support dynamic API keys passed via header (for user-added orgs)
  const dynamicKey = req.headers.get('x-castai-key');
  if (dynamicKey) {
    clusterKeyCache.set(clusterId, dynamicKey);
  }

  if (!ORG_KEYS.length && !dynamicKey) {
    // No API keys configured — serve mock data with isMock flag
    const mock = await import('@/lib/mock-data');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addMockFlag = (data: any) => ({ ...data, isMock: true });
    switch (type) {
      case 'cluster':    return NextResponse.json(addMockFlag(mock.MOCK_CLUSTERS[clusterId] ?? { id: clusterId }));
      case 'cost':       return NextResponse.json(addMockFlag(mock.getMockClusterCostReport(clusterId)));
      case 'efficiency': return NextResponse.json(addMockFlag(mock.getMockEfficiencyReport(clusterId)));
      case 'namespaces': return NextResponse.json(addMockFlag(mock.getMockNamespaceReport(clusterId)));
      case 'workloads':  return NextResponse.json(addMockFlag(mock.getMockWorkloadCostReport(clusterId)));
      case 'nodes':      return NextResponse.json(addMockFlag(mock.getMockNodeMetrics(clusterId)));
      case 'savings':    return NextResponse.json(addMockFlag(mock.getMockSavingsRecommendation(clusterId)));
      default:           return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }
  }

  // Resolve the right API key for this cluster
  const apiKey = await resolveOrgKey(clusterId);

  try {
    switch (type) {

      // ─── Cluster metadata ───────────────────────────────────────────────────
      case 'cluster': {
        const realCluster = await getCluster(clusterId, apiKey);
        if (!realCluster) return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });

        const firstOp    = realCluster.firstOperationAt ?? realCluster.createdAt ?? new Date().toISOString();
        const regionName = realCluster.region?.displayName ?? realCluster.region?.name ?? '';
        const provider   = realCluster.providerType === 'aks' ? 'Azure AKS'
                         : realCluster.providerType === 'eks' ? 'AWS EKS'
                         : realCluster.providerType === 'gke' ? 'GCP GKE'
                         : realCluster.providerType ?? 'Kubernetes';

        return NextResponse.json({
          id: clusterId,
          name: realCluster.name,
          region: regionName,
          provider,
          createdAt: realCluster.createdAt ?? firstOp,
          status: realCluster.status,
          autoscalerEnabled: true,
          autoscalerEnabledAt: firstOp,
          workloadAutoscalerEnabledAt: firstOp,
          isLive: true,
        });
      }

      // ─── Cost history (derived from efficiency) ─────────────────────────────
      case 'cost': {
        // Fetch full history from cluster creation to now — chunked to avoid 365-day API limit
        const cluster = await getCluster(clusterId, apiKey);
        const fullStart = cluster?.createdAt ?? dateRange().startTime;
        const { endTime } = dateRange();
        const raw = await fetchEfficiencyChunked(clusterId, fullStart, endTime, apiKey);
        const daily = adaptEfficiencyToCostHistory(raw);
        const totalCost = daily.reduce((s, d) => s + d.totalCost, 0);
        const totalSpot = daily.reduce((s, d) => s + d.spotCost, 0);
        return NextResponse.json({ clusterId, isLive: true, summary: { totalCost, computeCost: totalCost, spotSavings: totalSpot }, daily });
      }

      // ─── Efficiency / waste ─────────────────────────────────────────────────
      case 'efficiency': {
        // Fetch full history from cluster creation to now — chunked to avoid 365-day API limit
        const effCluster = await getCluster(clusterId, apiKey);
        const fullStart = effCluster?.createdAt ?? dateRange().startTime;
        const { endTime } = dateRange();
        const raw = await fetchEfficiencyChunked(clusterId, fullStart, endTime, apiKey);
        return NextResponse.json({ ...adaptEfficiencyReport(raw), isLive: true });
      }

      // ─── Savings ────────────────────────────────────────────────────────────
      case 'savings': {
        const { startTime, endTime } = savingsRange();
        const data = await getSavings(clusterId, startTime, endTime, apiKey);
        const totalSavings = parseFloat(data.summary.totalSavings);
        const totalCost    = parseFloat(data.summary.totalCost);
        return NextResponse.json({
          clusterId,
          isLive: true,
          projectedMonthlySavings: totalSavings / 3,
          currentMonthlyCost:      totalCost / 3,
          optimizedMonthlyCost:    (totalCost - totalSavings) / 3,
          totalSavings,
          totalCost,
          savingsItems: data.items,
          recommendations: [{
            type:          'downscaling',
            description:   'Workload Autoscaler downscaling savings',
            savingsAmount: Math.round(totalSavings / 3),
          }],
        });
      }

      // ─── Workloads (7-day window) ────────────────────────────────────────────
      case 'workloads': {
        const { startTime, endTime } = shortRange(7);
        const data = await getWorkloadCosts(clusterId, startTime, endTime, apiKey);
        const workloads = data.items.map((w) => {
          const metrics = w.costMetrics ?? [];
          const cost     = metrics.reduce((s, m) => s + parseFloat(m.costOnDemand) + parseFloat(m.costSpot), 0);
          const cpuReq   = metrics.reduce((s, m) => s + parseFloat(m.cpuCountOnDemand), 0);
          const cpuCost  = metrics.reduce((s, m) => s + parseFloat(m.cpuCostOnDemand ?? '0'), 0);
          const ramCost  = metrics.reduce((s, m) => s + parseFloat(m.ramCostOnDemand ?? '0'), 0);
          const pods     = metrics.reduce((s, m) => s + parseFloat(m.podCountOnDemand), 0);
          return {
            workloadName:    w.workloadName,
            namespace:       w.namespace,
            workloadType:    w.workloadType,
            cpuRequest:      Math.round(cpuReq * 10) / 10,
            cpuCost:         Math.round(cpuCost * 100) / 100,
            ramCost:         Math.round(ramCost * 100) / 100,
            cost:            Math.round(cost * 100) / 100,
            pods:            Math.round(pods),
          };
        });
        return NextResponse.json({ clusterId, isLive: true, workloads });
      }

      // ─── Namespaces ─────────────────────────────────────────────────────────
      case 'namespaces': {
        const { startTime, endTime } = shortRange(7);
        const data = await getWorkloadCosts(clusterId, startTime, endTime, apiKey);
        const nsMap: Record<string, { cost: number; cpuReq: number; cpuCost: number; ramCost: number; pods: number }> = {};
        for (const w of data.items) {
          const cost    = (w.costMetrics ?? []).reduce((s, m) => s + parseFloat(m.costOnDemand) + parseFloat(m.costSpot), 0);
          const cpuReq  = (w.costMetrics ?? []).reduce((s, m) => s + parseFloat(m.cpuCountOnDemand), 0);
          const cpuCost = (w.costMetrics ?? []).reduce((s, m) => s + parseFloat(m.cpuCostOnDemand ?? '0'), 0);
          const ramCost = (w.costMetrics ?? []).reduce((s, m) => s + parseFloat(m.ramCostOnDemand ?? '0'), 0);
          const pods    = (w.costMetrics ?? []).reduce((s, m) => s + parseFloat(m.podCountOnDemand), 0);
          if (!nsMap[w.namespace]) nsMap[w.namespace] = { cost: 0, cpuReq: 0, cpuCost: 0, ramCost: 0, pods: 0 };
          nsMap[w.namespace].cost    += cost;
          nsMap[w.namespace].cpuReq  += cpuReq;
          nsMap[w.namespace].cpuCost += cpuCost;
          nsMap[w.namespace].ramCost += ramCost;
          nsMap[w.namespace].pods    += pods;
        }
        const namespaces = Object.entries(nsMap)
          .sort(([, a], [, b]) => b.cost - a.cost)
          .map(([namespace, v]) => ({
            namespace,
            cpuRequest:      Math.round(v.cpuReq * 10) / 10,
            cpuCost:         Math.round(v.cpuCost * 100) / 100,
            ramCost:         Math.round(v.ramCost * 100) / 100,
            cost:            Math.round(v.cost * 100) / 100,
            pods:            Math.round(v.pods),
          }));
        return NextResponse.json({ clusterId, isLive: true, namespaces });
      }

      // ─── Nodes (real, with correct spot detection) ──────────────────────────
      case 'nodes': {
        const items = await listNodes(clusterId, apiKey);
        const spotNodes    = items.filter((n) => n.spotConfig?.isSpot).length;

        // Group by instanceType + isSpot so the breakdown chart is accurate
        const typeKey = (n: typeof items[number]) =>
          `${n.instanceType}||${n.spotConfig?.isSpot ? 'spot' : 'od'}`;
        const buckets: Record<string, { count: number; isSpot: boolean }> = {};
        for (const n of items) {
          const k = typeKey(n);
          if (!buckets[k]) buckets[k] = { count: 0, isSpot: n.spotConfig?.isSpot ?? false };
          buckets[k].count++;
        }

        const nodes = Object.entries(buckets).map(([key, v], i) => ({
          nodeId:       `node-type-${i}`,
          instanceType: key.split('||')[0],
          isSpot:       v.isSpot,
          count:        v.count,
        }));

        return NextResponse.json({
          clusterId,
          isLive: true,
          timestamp:      new Date().toISOString().slice(0, 10),
          totalNodes:     items.length,
          spotNodes,
          onDemandNodes:  items.length - spotNodes,
          nodes,
        });
      }

      // ─── Rebalancing schedules ──────────────────────────────────────────────
      case 'rebalancing': {
        const schedules = await getRebalancingSchedules(apiKey);
        const relevant  = schedules
          .map((s) => ({ ...s, jobs: s.jobs.filter((j) => j.clusterId === clusterId) }))
          .filter((s) => s.jobs.length > 0);
        return NextResponse.json({ clusterId, isLive: true, schedules: relevant });
      }

      // ─── Autoscaler events (derived from efficiency dips) ───────────────────
      case 'events': {
        const { startTime, endTime } = dateRange();
        const raw    = await getEfficiency(clusterId, startTime, endTime, apiKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const events = detectAutoscalerEvents(raw.items as any);
        return NextResponse.json({ clusterId, isLive: true, events });
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }
  } catch (err) {
    console.error('[castai route]', type, err);
    const message = err instanceof Error ? err.message : 'Unknown API error';
    return NextResponse.json(
      { error: true, message, type, clusterId, isMock: false },
      { status: 502 }
    );
  }
}
