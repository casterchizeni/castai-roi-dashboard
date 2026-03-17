// ─── Cluster ─────────────────────────────────────────────────────────────────

export interface Cluster {
  id: string;
  name: string;
  region: string;
  provider: string;
  createdAt: string; // ISO8601
  status: string;
  autoscalerEnabled?: boolean;
  autoscalerEnabledAt?: string; // ISO8601
  workloadAutoscalerEnabledAt?: string; // ISO8601
}

// ─── Cost Reports ─────────────────────────────────────────────────────────────

export interface CostDataPoint {
  date: string; // ISO8601
  totalCost: number;
  computeCost: number;
  cpuCost?: number;
  memoryCost?: number;
  spotCost?: number;
  onDemandCost?: number;
  listPrice?: number;
  discountedPrice?: number;
  // provisioned (what you pay for)
  cpuHours?: number;
  memoryGbHours?: number;
  // requested by pods (after CAST AI right-sizing)
  cpuRequestedHours?: number;
  ramRequestedGbHours?: number;
  // actually used
  cpuUsedHours?: number;
  ramUsedGbHours?: number;
  // over-provisioning %
  cpuOverprovisioningPct?: number;
  ramOverprovisioningPct?: number;
  ramCost?: number;
}

export interface ClusterCostReport {
  clusterId: string;
  summary: {
    totalCost: number;
    computeCost: number;
    spotSavings?: number;
  };
  daily: CostDataPoint[];
}

export interface WorkloadCost {
  workloadName: string;
  namespace: string;
  cpuRequest: number;
  cpuCost?: number;
  ramCost?: number;
  cost: number;
}

export interface WorkloadCostReport {
  clusterId: string;
  workloads: WorkloadCost[];
}

// ─── Efficiency ───────────────────────────────────────────────────────────────

export interface EfficiencyReport {
  clusterId: string;
  cpuProvisionedCores: number;
  cpuRequestedCores: number;
  cpuUsedCores: number;
  memoryProvisionedGb: number;
  memoryRequestedGb: number;
  memoryUsedGb: number;
  overProvisionedCostPerHour: number;
  wastePerDay: number;
  wastePerMonth: number;
  utilizationPercent: number;
}

// ─── Namespaces ───────────────────────────────────────────────────────────────

export interface NamespaceCost {
  namespace: string;
  cpuRequest: number;
  cpuCost?: number;
  ramCost?: number;
  cost: number;
  overProvisionedPercent?: number;
}

export interface NamespaceReport {
  clusterId: string;
  namespaces: NamespaceCost[];
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

export interface NodeInfo {
  nodeId: string;
  instanceType: string;
  isSpot: boolean;
  cpuCores?: number;
  memoryGb?: number;
  costPerHour?: number;
  count?: number; // number of physical nodes of this type (condensed API response)
  zone?: string;
  labels?: Record<string, string>;
}

export interface NodeMetrics {
  clusterId: string;
  timestamp: string;
  totalNodes: number;
  spotNodes: number;
  onDemandNodes: number;
  nodes: NodeInfo[];
}

// ─── Savings Recommendation ───────────────────────────────────────────────────

export interface SavingsRecommendation {
  clusterId: string;
  projectedMonthlySavings: number;
  currentMonthlyCost: number;
  optimizedMonthlyCost: number;
  recommendations: {
    type: string;
    description: string;
    savingsAmount: number;
  }[];
}

// ─── Commitments (RIs / Savings Plans / CUDs) ────────────────────────────────

export interface Commitment {
  id: string;
  allowedUsage: { instanceType: string; instanceFamily: string; region: string };
  count: number;
  instanceTypeCpu: number;
  effectiveCpu: number;
  totalCost: number | null;      // hourly RI rate per unit; null when API omits it
  plan: string;                  // '1yr' | '3yr'
  state: string;                 // 'ACTIVE' | 'EXPIRED'
  status: string;                // 'Active' | 'Inactive' in CAST AI
  startDate: string;
  endDate: string;
  region: string;
  cloudServiceProvider: string;
}

export interface CommitmentSummary {
  totalCommitments: number;
  activeCommitments: number;
  expiredCommitments: number;
  activeInCastAI: number;
  inactiveInCastAI: number;
  totalHourlyCost: number;
  totalCommittedCpu: number;
  avgCostPerCpuHr: number | null;
  estimatedMonthlyRiSpend: number;
  preCastAICount: number;
  postCastAICount: number;
  coveragePct: number;
  missingCostCount: number;
  commitments: Commitment[];
}

// ─── Org Efficiency Summary ───────────────────────────────────────────────────

export interface OrgEfficiencySummary {
  totalClusters: number;
  totalMonthlyCost: number;
  totalMonthlySavings: number;
  averageUtilization: number;
  clusters: {
    clusterId: string;
    clusterName: string;
    monthlyCost: number;
    monthlySavings: number;
    utilizationPercent: number;
  }[];
}

// ─── Calculated ROI ───────────────────────────────────────────────────────────

export interface BaselineMetrics {
  startDate: string;
  endDate: string;
  avgDailyCost: number;
  costPerCpuHour: number;
  costPerGbHour: number;
  totalCpuHours: number;
  totalMemoryGbHours: number;
  avgNodeCount: number;
}

export interface ROIResult {
  baselineMetrics: BaselineMetrics;
  currentPeriod: {
    startDate: string;
    endDate: string;
    actualCost: number;
    expectedCost: number;
  };
  totalSavings: number;
  roiPercent: number;
  monthlySavings: number;
  monthsSinceBaseline: number;
}

export interface ForecastResult {
  forecast30day: number;
  forecast90day: number;
  // Range based on actual min/max daily cost observed
  rangeLow30day: number;
  rangeHigh30day: number;
  avgDailyCost: number;
  minDailyCost: number;
  maxDailyCost: number;
  dataPointsUsed: number;     // how many days of data the forecast is based on
  // Savings run rate (from real data, not modeled)
  savingsRunRate30day: number; // actual savings per 30 days (from savings API or baseline delta)
  savingsRunRate90day: number;
  dailyForecasts: { date: string; cost: number; low: number; high: number }[];
  // Keep for backward compat (set to 0 / empty)
  withoutCastAI30day: number;
  withoutCastAI90day: number;
  trendSlope: number;
  confidenceLow?: number;
  confidenceHigh?: number;
}

export interface PaybackResult {
  monthlyFee: number;
  monthlySavings: number;
  paybackMonths: number;
  breakEvenDate: string;
  netSavingsToDate: number;
}

// ─── Customer Config ──────────────────────────────────────────────────────────

export interface CustomerConfig {
  id: string;
  name: string;
  apiKey: string;
  clusterIds: string[];
  monthlyFee?: number;
}
