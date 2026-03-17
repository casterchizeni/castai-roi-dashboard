import type { ClusterOrgSummary } from '@/app/api/org/[orgName]/route';
import type { CommitmentSummary } from '@/types/castai';

export interface Recommendation {
  clusterId: string;
  clusterName: string;
  type: 'high-overprovisioning' | 'low-spot-adoption' | 'no-baseline' | 'inactive-ri';
  message: string;
  potentialSavings?: number;
}

export interface ClusterStory {
  cluster: ClusterOrgSummary;
  hasBaseline: boolean;
  dailySavings: number;
  monthlySavings: number;
  costReductionPct: number;
  story: string;
}

export interface CommitmentROILayer {
  totalActiveRIs: number;
  coveragePct: number;
  avgRiCostPerCpuHr: number | null;
  estimatedMonthlyRiSpend: number;
  inactiveCount: number;
  missingCostCount: number;
  preCastCount: number;
  postCastCount: number;
  // Three-layer decomposition
  onDemandRatePerCpuHr: number | null;  // from baseline costPerCpuHr
  riRatePerCpuHr: number | null;         // from commitment totalCost
  castaiRatePerCpuHr: number | null;     // from current efficiency
}

export interface MultiClusterROI {
  // Baseline-derived (the REAL numbers — daily cost before vs after)
  clustersWithBaseline: number;
  clustersWithoutBaseline: number;
  totalBaselineDailyCost: number;
  totalCastaiDailyCost: number;
  dailySavings: number;
  monthlySavings: number;       // dailySavings × 30
  annualSavings: number;        // dailySavings × 365
  costReductionPct: number;     // (baseline - castai) / baseline × 100

  // Fee-based ROI (only meaningful when monthlyFee > 0)
  monthlyFee: number;
  netMonthlyBenefit: number;    // monthlySavings - monthlyFee
  roiMultiple: number;          // monthlySavings / monthlyFee
  annualNetBenefit: number;

  // Efficiency — before vs after
  avgCpuOverprovBefore: number;
  avgCpuOverprovAfter: number;
  avgCpuUtilBefore: number;
  avgCpuUtilAfter: number;

  // Savings decomposition (from CAST AI model — 90d spot vs rightsizing)
  totalSpotSavings: number;
  totalRightsizingSavings: number;
  savingsDecompositionSource: 'cast-ai-model';

  // Commitment layer (optional — only when org has RIs)
  commitments?: CommitmentROILayer;

  // Per-cluster stories
  clusterStories: ClusterStory[];

  // Recommendations
  recommendations: Recommendation[];
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}

function buildClusterStory(c: ClusterOrgSummary): ClusterStory {
  const hasBaseline = c.baselineDailyCost > 0 && c.castaiDailyCost > 0;
  const dailySavings = hasBaseline ? c.baselineDailyCost - c.castaiDailyCost : 0;
  const monthlySavings = dailySavings * 30;
  const costReductionPct = hasBaseline && c.baselineDailyCost > 0
    ? (dailySavings / c.baselineDailyCost) * 100 : 0;

  let story: string;
  if (hasBaseline) {
    const parts: string[] = [];
    parts.push(`Daily cost dropped from ${fmt$(c.baselineDailyCost)}/day to ${fmt$(c.castaiDailyCost)}/day (${fmtPct(costReductionPct)} reduction), saving ${fmt$(monthlySavings)}/mo.`);

    if (c.baselineCpuUtil > 0 && c.castaiCpuUtil > 0) {
      const utilDelta = c.castaiCpuUtil - c.baselineCpuUtil;
      if (utilDelta > 5) {
        parts.push(`CPU utilization improved from ${fmtPct(c.baselineCpuUtil)} to ${fmtPct(c.castaiCpuUtil)} — CAST AI is packing workloads more efficiently.`);
      }
    }

    if (c.baselineCpuOverprov > 0 && c.castaiCpuOverprov > 0) {
      const overprovDrop = c.baselineCpuOverprov - c.castaiCpuOverprov;
      if (overprovDrop > 10) {
        parts.push(`Overprovisioning cut from ${fmtPct(c.baselineCpuOverprov)} to ${fmtPct(c.castaiCpuOverprov)} — ${fmtPct(overprovDrop)} less waste.`);
      } else if (c.castaiCpuOverprov > 40) {
        parts.push(`Still ${fmtPct(c.castaiCpuOverprov)} overprovisioned — further optimization possible.`);
      }
    }

    story = parts.join(' ');
  } else if (c.castaiDailyCost > 0) {
    story = `Currently spending ${fmt$(c.castaiDailyCost)}/day (${fmt$(c.castaiDailyCost * 30)}/mo). No pre-CAST AI baseline data available for before/after comparison.`;
    if (c.castaiCpuOverprov > 40) {
      story += ` Note: ${fmtPct(c.castaiCpuOverprov)} CPU overprovisioning suggests room for further savings.`;
    }
  } else {
    story = 'Limited data available for this cluster.';
  }

  return { cluster: c, hasBaseline, dailySavings, monthlySavings, costReductionPct, story };
}

export function computeMultiClusterROI(
  clusters: ClusterOrgSummary[],
  monthlyFee: number,
  commitmentSummary?: CommitmentSummary,
): MultiClusterROI {
  // Baseline-derived savings (the core method)
  const withBaseline = clusters.filter(
    (c) => c.baselineDailyCost > 0 && c.castaiDailyCost > 0,
  );
  const totalBaselineDailyCost = withBaseline.reduce(
    (s, c) => s + c.baselineDailyCost, 0,
  );
  const totalCastaiDailyCost = withBaseline.reduce(
    (s, c) => s + c.castaiDailyCost, 0,
  );
  const dailySavings = totalBaselineDailyCost - totalCastaiDailyCost;
  const monthlySavings = dailySavings * 30;
  const annualSavings = dailySavings * 365;
  const costReductionPct = totalBaselineDailyCost > 0
    ? (dailySavings / totalBaselineDailyCost) * 100 : 0;

  // Fee-based ROI
  const netMonthlyBenefit = monthlySavings - monthlyFee;
  const roiMultiple = monthlyFee > 0 ? monthlySavings / monthlyFee : 0;
  const annualNetBenefit = netMonthlyBenefit * 12;

  // Efficiency averages
  const withOverprovBefore = clusters.filter((c) => c.baselineCpuOverprov > 0);
  const withOverprovAfter = clusters.filter((c) => c.castaiCpuOverprov > 0);
  const withUtilBefore = clusters.filter((c) => c.baselineCpuUtil > 0);
  const withUtilAfter = clusters.filter((c) => c.castaiCpuUtil > 0);

  const avgCpuOverprovBefore = withOverprovBefore.length
    ? withOverprovBefore.reduce((s, c) => s + c.baselineCpuOverprov, 0) / withOverprovBefore.length
    : 0;
  const avgCpuOverprovAfter = withOverprovAfter.length
    ? withOverprovAfter.reduce((s, c) => s + c.castaiCpuOverprov, 0) / withOverprovAfter.length
    : 0;
  const avgCpuUtilBefore = withUtilBefore.length
    ? withUtilBefore.reduce((s, c) => s + c.baselineCpuUtil, 0) / withUtilBefore.length
    : 0;
  const avgCpuUtilAfter = withUtilAfter.length
    ? withUtilAfter.reduce((s, c) => s + c.castaiCpuUtil, 0) / withUtilAfter.length
    : 0;

  // Savings decomposition (from CAST AI savings API)
  const totalSpotSavings = clusters.reduce((s, c) => s + c.spotSavings90d, 0);
  const totalRightsizingSavings = clusters.reduce((s, c) => s + c.rightsizingSavings90d, 0);

  // Per-cluster stories
  const clusterStories = clusters.map(buildClusterStory);

  // Recommendations
  const recommendations: Recommendation[] = [];

  for (const c of clusters) {
    if (c.castaiCpuOverprov > 40) {
      const potentialSavings = c.castaiDailyCost * (c.castaiCpuOverprov / 100) * 0.5 * 30;
      recommendations.push({
        clusterId: c.id,
        clusterName: c.name,
        type: 'high-overprovisioning',
        message: `Still ${c.castaiCpuOverprov.toFixed(0)}% overprovisioned — tightening policies could save ~${fmt$(potentialSavings)}/mo more.`,
        potentialSavings,
      });
    }
    if (c.savingsPct < 20 && c.cost90d > 0) {
      recommendations.push({
        clusterId: c.id,
        clusterName: c.name,
        type: 'low-spot-adoption',
        message: `Only ${c.savingsPct.toFixed(0)}% optimized — review CAST AI policies for higher spot adoption and rightsizing.`,
      });
    }
    if (c.baselineQuality === 'none') {
      recommendations.push({
        clusterId: c.id,
        clusterName: c.name,
        type: 'no-baseline',
        message: 'No pre-CAST AI data available — enable monitoring earlier for future renewal evidence.',
      });
    }
  }

  // Commitment layer (optional)
  let commitments: CommitmentROILayer | undefined;
  if (commitmentSummary && commitmentSummary.activeCommitments > 0) {
    // On-demand rate: weighted avg of baseline costPerCpuHr across clusters with baseline
    const clustersWithCpuRate = withBaseline.filter((c) => c.baselineCostPerCpuHr > 0);
    const onDemandRatePerCpuHr = clustersWithCpuRate.length > 0
      ? clustersWithCpuRate.reduce((s, c) => s + c.baselineCostPerCpuHr, 0) / clustersWithCpuRate.length
      : null;

    const riRatePerCpuHr = commitmentSummary.avgCostPerCpuHr;

    // CAST AI optimized rate: weighted avg of castaiCostPerCpuHr
    const clustersWithCurrentRate = clusters.filter((c) => c.castaiCostPerCpuHr > 0);
    const castaiRatePerCpuHr = clustersWithCurrentRate.length > 0
      ? clustersWithCurrentRate.reduce((s, c) => s + c.castaiCostPerCpuHr, 0) / clustersWithCurrentRate.length
      : null;

    commitments = {
      totalActiveRIs: commitmentSummary.activeCommitments,
      coveragePct: commitmentSummary.coveragePct,
      avgRiCostPerCpuHr: riRatePerCpuHr,
      estimatedMonthlyRiSpend: commitmentSummary.estimatedMonthlyRiSpend,
      inactiveCount: commitmentSummary.inactiveInCastAI,
      missingCostCount: commitmentSummary.missingCostCount,
      preCastCount: commitmentSummary.preCastAICount,
      postCastCount: commitmentSummary.postCastAICount,
      onDemandRatePerCpuHr,
      riRatePerCpuHr,
      castaiRatePerCpuHr,
    };

    // Inactive RI recommendation
    if (commitmentSummary.inactiveInCastAI > 0) {
      recommendations.push({
        clusterId: '',
        clusterName: 'Organization',
        type: 'inactive-ri',
        message: `${commitmentSummary.inactiveInCastAI} reserved instance${commitmentSummary.inactiveInCastAI !== 1 ? 's are' : ' is'} active but not orchestrated by CAST AI. Enabling orchestration could improve RI utilization.`,
      });
    }
  }

  return {
    clustersWithBaseline: withBaseline.length,
    clustersWithoutBaseline: clusters.length - withBaseline.length,
    totalBaselineDailyCost,
    totalCastaiDailyCost,
    dailySavings,
    monthlySavings,
    annualSavings,
    costReductionPct,
    monthlyFee,
    netMonthlyBenefit,
    roiMultiple,
    annualNetBenefit,
    avgCpuOverprovBefore,
    avgCpuOverprovAfter,
    avgCpuUtilBefore,
    avgCpuUtilAfter,
    totalSpotSavings,
    totalRightsizingSavings,
    savingsDecompositionSource: 'cast-ai-model',
    commitments,
    clusterStories,
    recommendations,
  };
}
