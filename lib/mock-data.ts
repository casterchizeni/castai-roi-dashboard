import { subDays, formatISO, addDays } from 'date-fns';
import type {
  Cluster,
  ClusterCostReport,
  WorkloadCostReport,
  EfficiencyReport,
  NamespaceReport,
  NodeMetrics,
  SavingsRecommendation,
  OrgEfficiencySummary,
  CustomerConfig,
} from '@/types/castai';

const today = new Date();
const fmt = (d: Date) => formatISO(d, { representation: 'date' });

// Generate 90 days of daily cost history with a downward trend post-CAST AI
function generateCostHistory(
  baselineCost: number,
  daysBack: number,
  savingsFactor: number
) {
  return Array.from({ length: daysBack }, (_, i) => {
    const date = fmt(subDays(today, daysBack - i));
    const daysSinceStart = i;
    // Simulate workload growth + CAST AI savings
    const growth = 1 + (daysSinceStart / daysBack) * 0.3;
    const savings = daysSinceStart > 14 ? savingsFactor : 1;
    const noise = 0.9 + Math.random() * 0.2;
    const totalCost = baselineCost * growth * savings * noise;
    const cpuHours = totalCost * 0.6 * 100;
    const memoryGbHours = totalCost * 0.4 * 200;
    return {
      date,
      totalCost: +totalCost.toFixed(2),
      computeCost: +(totalCost * 0.9).toFixed(2),
      cpuHours: +cpuHours.toFixed(0),
      memoryGbHours: +memoryGbHours.toFixed(0),
      spotCost: +(totalCost * 0.35).toFixed(2),
      onDemandCost: +(totalCost * 0.55).toFixed(2),
      listPrice: +(totalCost * 1.4).toFixed(2),
      discountedPrice: +totalCost.toFixed(2),
    };
  });
}

export const MOCK_CUSTOMERS: CustomerConfig[] = [
  { id: 'acme', name: 'Acme Corp', apiKey: 'demo-key-acme', clusterIds: ['cluster-1', 'cluster-2'], monthlyFee: 1200 },
  { id: 'globex', name: 'Globex Inc', apiKey: 'demo-key-globex', clusterIds: ['cluster-3'], monthlyFee: 800 },
  { id: 'initech', name: 'Initech', apiKey: 'demo-key-initech', clusterIds: ['cluster-4', 'cluster-5'], monthlyFee: 2000 },
];

export const MOCK_CLUSTERS: Record<string, Cluster> = {
  'cluster-1': {
    id: 'cluster-1',
    name: 'prod-us-east-1',
    region: 'us-east-1',
    provider: 'AWS',
    createdAt: fmt(subDays(today, 90)),
    status: 'running',
    autoscalerEnabled: true,
    autoscalerEnabledAt: fmt(subDays(today, 88)),
    workloadAutoscalerEnabledAt: fmt(subDays(today, 85)),
  },
  'cluster-2': {
    id: 'cluster-2',
    name: 'staging-us-west-2',
    region: 'us-west-2',
    provider: 'AWS',
    createdAt: fmt(subDays(today, 60)),
    status: 'running',
    autoscalerEnabled: true,
    autoscalerEnabledAt: fmt(subDays(today, 58)),
  },
  'cluster-3': {
    id: 'cluster-3',
    name: 'prod-eu-west-1',
    region: 'eu-west-1',
    provider: 'GCP',
    createdAt: fmt(subDays(today, 75)),
    status: 'running',
    autoscalerEnabled: true,
    autoscalerEnabledAt: fmt(subDays(today, 73)),
  },
  'cluster-4': {
    id: 'cluster-4',
    name: 'prod-us-central',
    region: 'us-central1',
    provider: 'GCP',
    createdAt: fmt(subDays(today, 120)),
    status: 'running',
    autoscalerEnabled: true,
    autoscalerEnabledAt: fmt(subDays(today, 115)),
  },
  'cluster-5': {
    id: 'cluster-5',
    name: 'dev-cluster',
    region: 'us-east-1',
    provider: 'AWS',
    createdAt: fmt(subDays(today, 45)),
    status: 'running',
    autoscalerEnabled: true,
    autoscalerEnabledAt: fmt(subDays(today, 44)),
  },
};

export function getMockClusterCostReport(clusterId: string): ClusterCostReport {
  const base = clusterId === 'cluster-1' ? 350 : clusterId === 'cluster-4' ? 500 : 200;
  const daily = generateCostHistory(base, 90, 0.65);
  return {
    clusterId,
    summary: {
      totalCost: daily.reduce((s, d) => s + d.totalCost, 0),
      computeCost: daily.reduce((s, d) => s + d.computeCost, 0),
      spotSavings: daily.reduce((s, d) => s + (d.listPrice - d.discountedPrice), 0),
    },
    daily,
  };
}

export function getMockEfficiencyReport(clusterId: string): EfficiencyReport {
  return {
    clusterId,
    cpuProvisionedCores: 128,
    cpuRequestedCores: 96,
    cpuUsedCores: 68,
    memoryProvisionedGb: 512,
    memoryRequestedGb: 384,
    memoryUsedGb: 290,
    overProvisionedCostPerHour: 12.4,
    wastePerDay: 297.6,
    wastePerMonth: 8928,
    utilizationPercent: 53,
  };
}

export function getMockNamespaceReport(clusterId: string): NamespaceReport {
  return {
    clusterId,
    namespaces: [
      { namespace: 'production', cpuRequest: 32, cost: 4200, overProvisionedPercent: 25 },
      { namespace: 'staging', cpuRequest: 16, cost: 1100, overProvisionedPercent: 62 },
      { namespace: 'monitoring', cpuRequest: 8, cost: 640, overProvisionedPercent: 31 },
      { namespace: 'logging', cpuRequest: 12, cost: 980, overProvisionedPercent: 20 },
      { namespace: 'default', cpuRequest: 4, cost: 200, overProvisionedPercent: 70 },
      { namespace: 'ingress-nginx', cpuRequest: 2, cost: 180, overProvisionedPercent: 10 },
    ],
  };
}

export function getMockWorkloadCostReport(clusterId: string): WorkloadCostReport {
  return {
    clusterId,
    workloads: [
      { workloadName: 'api-server', namespace: 'production', cpuRequest: 8, cost: 1800 },
      { workloadName: 'web-frontend', namespace: 'production', cpuRequest: 4, cost: 820 },
      { workloadName: 'worker-queue', namespace: 'production', cpuRequest: 12, cost: 1580 },
      { workloadName: 'postgres', namespace: 'production', cpuRequest: 8, cost: 1100 },
      { workloadName: 'redis', namespace: 'production', cpuRequest: 2, cost: 340 },
      { workloadName: 'prometheus', namespace: 'monitoring', cpuRequest: 4, cost: 380 },
      { workloadName: 'grafana', namespace: 'monitoring', cpuRequest: 2, cost: 180 },
      { workloadName: 'loki', namespace: 'logging', cpuRequest: 6, cost: 620 },
    ],
  };
}

export function getMockNodeMetrics(clusterId: string): NodeMetrics {
  return {
    clusterId,
    timestamp: fmt(today),
    totalNodes: 18,
    spotNodes: 12,
    onDemandNodes: 6,
    nodes: [
      { nodeId: 'n1', instanceType: 'm5.2xlarge', isSpot: true, cpuCores: 8, memoryGb: 32, costPerHour: 0.192, zone: 'us-east-1a' },
      { nodeId: 'n2', instanceType: 'm5.2xlarge', isSpot: true, cpuCores: 8, memoryGb: 32, costPerHour: 0.192, zone: 'us-east-1b' },
      { nodeId: 'n3', instanceType: 'c5.4xlarge', isSpot: true, cpuCores: 16, memoryGb: 32, costPerHour: 0.272, zone: 'us-east-1a' },
      { nodeId: 'n4', instanceType: 'c5.4xlarge', isSpot: true, cpuCores: 16, memoryGb: 32, costPerHour: 0.272, zone: 'us-east-1c' },
      { nodeId: 'n5', instanceType: 'r5.2xlarge', isSpot: false, cpuCores: 8, memoryGb: 64, costPerHour: 0.504, zone: 'us-east-1b' },
      { nodeId: 'n6', instanceType: 'r5.2xlarge', isSpot: false, cpuCores: 8, memoryGb: 64, costPerHour: 0.504, zone: 'us-east-1a' },
    ],
  };
}

export function getMockSavingsRecommendation(clusterId: string): SavingsRecommendation {
  return {
    clusterId,
    projectedMonthlySavings: 4200,
    currentMonthlyCost: 14000,
    optimizedMonthlyCost: 9800,
    recommendations: [
      { type: 'spot', description: 'Increase spot usage from 67% to 80%', savingsAmount: 1800 },
      { type: 'rightsizing', description: 'Rightsize over-provisioned workloads in staging', savingsAmount: 1200 },
      { type: 'scheduling', description: 'Enable bin-packing for dev namespace', savingsAmount: 1200 },
    ],
  };
}

export function getMockOrgSummary(): OrgEfficiencySummary {
  return {
    totalClusters: 5,
    totalMonthlyCost: 48000,
    totalMonthlySavings: 18500,
    averageUtilization: 61,
    clusters: [
      { clusterId: 'cluster-1', clusterName: 'prod-us-east-1', monthlyCost: 18000, monthlySavings: 7200, utilizationPercent: 53 },
      { clusterId: 'cluster-2', clusterName: 'staging-us-west-2', monthlyCost: 6000, monthlySavings: 2400, utilizationPercent: 55 },
      { clusterId: 'cluster-3', clusterName: 'prod-eu-west-1', monthlyCost: 12000, monthlySavings: 4800, utilizationPercent: 62 },
      { clusterId: 'cluster-4', clusterName: 'prod-us-central', monthlyCost: 9000, monthlySavings: 3600, utilizationPercent: 68 },
      { clusterId: 'cluster-5', clusterName: 'dev-cluster', monthlyCost: 3000, monthlySavings: 500, utilizationPercent: 45 },
    ],
  };
}
