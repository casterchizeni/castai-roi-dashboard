'use client';

import useSWR from 'swr';
import type {
  Cluster,
  ClusterCostReport,
  EfficiencyReport,
  NamespaceReport,
  WorkloadCostReport,
  NodeMetrics,
  SavingsRecommendation,
} from '@/types/castai';
import { getClusterKey } from '@/lib/dynamic-keys';

const fetcher = (url: string) => {
  const headers: Record<string, string> = {};
  // Check if we have a dynamic API key for this cluster
  const match = url.match(/\/api\/castai\/([^?/]+)/);
  if (match) {
    const key = getClusterKey(match[1]);
    if (key) headers['x-castai-key'] = key;
  }
  return fetch(url, { headers }).then((r) => r.json());
};

function useClusterFetch<T>(clusterId: string, type: string) {
  return useSWR<T>(
    clusterId ? `/api/castai/${clusterId}?type=${type}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
}

export function useCluster(clusterId: string) {
  return useClusterFetch<Cluster>(clusterId, 'cluster');
}

export function useClusterCost(clusterId: string) {
  return useClusterFetch<ClusterCostReport>(clusterId, 'cost');
}

export function useEfficiency(clusterId: string) {
  return useClusterFetch<EfficiencyReport>(clusterId, 'efficiency');
}

export function useNamespaces(clusterId: string) {
  return useClusterFetch<NamespaceReport>(clusterId, 'namespaces');
}

export function useWorkloads(clusterId: string) {
  return useClusterFetch<WorkloadCostReport>(clusterId, 'workloads');
}

export function useNodeMetrics(clusterId: string) {
  return useClusterFetch<NodeMetrics>(clusterId, 'nodes');
}

export function useSavings(clusterId: string) {
  return useClusterFetch<SavingsRecommendation>(clusterId, 'savings');
}

export function useRebalancing(clusterId: string) {
  return useClusterFetch<{
    schedules: import('@/lib/castai/real-api').RebalancingSchedule[];
    isLive?: boolean;
  }>(clusterId, 'rebalancing');
}

export function useAutoscalerEvents(clusterId: string) {
  return useClusterFetch<{
    events: import('@/lib/calculations/events').AutoscalerEvent[];
    isLive?: boolean;
  }>(clusterId, 'events');
}
