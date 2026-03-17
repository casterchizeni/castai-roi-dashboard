import type { ClusterOrgSummary } from '@/app/api/org/[orgName]/route';

export interface Recommendation {
  clusterId: string;
  clusterName: string;
  type: 'high-overprovisioning' | 'low-spot-adoption' | 'no-baseline';
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
    clusterStories,
    recommendations,
  };
}
