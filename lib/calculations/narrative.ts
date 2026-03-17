import type { MultiClusterROI } from './multi-cluster-roi';
import type { ClusterOrgSummary } from '@/app/api/org/[orgName]/route';

export interface NarrativeSection {
  heading: string;
  paragraphs: string[];
  tone: 'positive' | 'neutral' | 'caution';
  annotation?: string; // connective callout between graph sections
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}

export function generateROINarrative(
  roi: MultiClusterROI,
  orgName: string,
  clusters: ClusterOrgSummary[],
): NarrativeSection[] {
  const sections: NarrativeSection[] = [];
  const n = clusters.length;

  if (n === 0) {
    sections.push({
      heading: 'Executive Summary',
      paragraphs: ['No clusters selected. Use the cluster filter to add clusters and build the ROI story.'],
      tone: 'neutral',
    });
    return sections;
  }

  const hasFee = roi.monthlyFee > 0;
  const fee = fmt$(roi.monthlyFee);
  const feeExceedsSavings = hasFee && roi.monthlySavings < roi.monthlyFee;
  const hasBaseline = roi.clustersWithBaseline > 0;
  const strongClusters = clusters.filter((c) => c.baselineQuality === 'strong');
  const weakClusters = clusters.filter((c) => c.baselineQuality === 'weak');
  const noClusters = clusters.filter((c) => c.baselineQuality === 'none');

  // ── Executive Summary ──────────────────────────────────────────────────────
  if (n === 1) {
    const c = clusters[0];
    const paragraphs: string[] = [];
    if (hasBaseline) {
      paragraphs.push(
        `CAST AI manages ${c.name}, reducing daily infrastructure cost from ${fmt$(c.baselineDailyCost)}/day to ${fmt$(c.castaiDailyCost)}/day — a ${fmtPct(roi.costReductionPct)} reduction backed by real before-and-after monitoring data.`,
      );
      paragraphs.push(
        `That translates to ${fmt$(roi.monthlySavings)}/mo in verified savings, or ${fmt$(roi.annualSavings)}/year at the current rate.`,
      );
    } else {
      paragraphs.push(
        `CAST AI is actively managing ${c.name} with a current daily cost of ${fmt$(c.castaiDailyCost)}/day (${fmt$(c.castaiDailyCost * 30)}/mo). This cluster doesn't have pre-CAST AI baseline data, so the savings comparison uses CAST AI's optimization model.`,
      );
    }
    if (hasFee) {
      paragraphs.push(
        roi.netMonthlyBenefit >= 0
          ? `At ${fee}/mo, the investment delivers a ${roi.roiMultiple.toFixed(1)}x return with ${fmt$(roi.netMonthlyBenefit)}/mo net benefit.`
          : `At ${fee}/mo, the current savings of ${fmt$(roi.monthlySavings)}/mo leave a ${fmt$(Math.abs(roi.netMonthlyBenefit))}/mo gap — see recommendations below for closing it.`,
      );
    }
    sections.push({
      heading: 'Executive Summary',
      paragraphs,
      tone: feeExceedsSavings ? 'caution' : 'positive',
    });
  } else if (hasBaseline) {
    const paragraphs: string[] = [];
    paragraphs.push(
      `Across ${roi.clustersWithBaseline} of ${n} clusters with verified baseline data, CAST AI reduced total daily cost from ${fmt$(roi.totalBaselineDailyCost)}/day to ${fmt$(roi.totalCastaiDailyCost)}/day — a ${fmtPct(roi.costReductionPct)} reduction. That's ${fmt$(roi.monthlySavings)}/mo in real, measurable savings.`,
    );
    if (roi.clustersWithoutBaseline > 0) {
      paragraphs.push(
        `${roi.clustersWithoutBaseline} additional cluster${roi.clustersWithoutBaseline !== 1 ? 's lack' : ' lacks'} pre-CAST AI data. ${noClusters.length > 0 ? `These are included in the report but flagged — their savings can't be independently verified yet.` : ''}`,
      );
    }
    if (hasFee) {
      paragraphs.push(
        roi.netMonthlyBenefit >= 0
          ? `At ${fee}/mo, the ROI is ${roi.roiMultiple.toFixed(1)}x — ${orgName} nets ${fmt$(roi.netMonthlyBenefit)}/mo after the CAST AI fee, or ${fmt$(roi.annualNetBenefit)}/year.`
          : `At ${fee}/mo, savings of ${fmt$(roi.monthlySavings)}/mo create a ${fmt$(Math.abs(roi.netMonthlyBenefit))}/mo shortfall. However, optimization opportunities exist to close this gap.`,
      );
    }
    sections.push({
      heading: 'Executive Summary',
      paragraphs,
      tone: feeExceedsSavings ? 'caution' : 'positive',
    });
  } else {
    // No baseline data at all
    sections.push({
      heading: 'Executive Summary',
      paragraphs: [
        `${n} cluster${n !== 1 ? 's are' : ' is'} managed by CAST AI, with a combined current daily cost of ${fmt$(clusters.reduce((s, c) => s + c.castaiDailyCost, 0))}/day. None have pre-CAST AI baseline data for before/after comparison.`,
        'The cost trend below shows current optimized spend. For stronger renewal evidence, enable monitoring on new clusters before CAST AI starts acting.',
      ],
      tone: 'neutral',
    });
  }

  // ── Cost Trend Transition ──────────────────────────────────────────────────
  if (hasBaseline) {
    const topSavers = roi.clusterStories
      .filter((s) => s.hasBaseline && s.dailySavings > 0)
      .sort((a, b) => b.dailySavings - a.dailySavings)
      .slice(0, 3);

    if (topSavers.length > 0) {
      const topNames = topSavers.map((s) => `${s.cluster.name} (${fmt$(s.monthlySavings)}/mo)`).join(', ');
      sections.push({
        heading: 'Cost Trend Analysis',
        paragraphs: [
          `The chart below shows the real dollar-per-day trend for each cluster — before CAST AI started vs current. The biggest contributors to savings: ${topNames}.`,
          roi.costReductionPct > 30
            ? `A ${fmtPct(roi.costReductionPct)} aggregate cost reduction is significant. This correlates directly with the efficiency gains shown in the utilization data below — CAST AI eliminated idle capacity and shifted workloads to spot instances.`
            : `The ${fmtPct(roi.costReductionPct)} reduction reflects CAST AI's optimization. The efficiency section below breaks down exactly where these savings come from — utilization improvements and overprovisioning reduction.`,
        ],
        tone: 'positive',
        annotation: 'The daily cost bars below directly visualize this before-and-after comparison.',
      });
    }
  }

  // ── Efficiency Transition ──────────────────────────────────────────────────
  if (roi.avgCpuUtilBefore > 0 && roi.avgCpuUtilAfter > 0) {
    const utilImproved = roi.avgCpuUtilAfter > roi.avgCpuUtilBefore;
    const overprovImproved = roi.avgCpuOverprovBefore > 0 && roi.avgCpuOverprovAfter < roi.avgCpuOverprovBefore;

    const paragraphs: string[] = [];
    paragraphs.push(
      `CPU utilization ${utilImproved ? 'improved' : 'shifted'} from ${fmtPct(roi.avgCpuUtilBefore)} to ${fmtPct(roi.avgCpuUtilAfter)}${utilImproved ? ' — more work extracted per dollar of compute' : ''}.`,
    );

    if (overprovImproved) {
      const drop = roi.avgCpuOverprovBefore - roi.avgCpuOverprovAfter;
      paragraphs.push(
        `Overprovisioning dropped ${fmtPct(drop)} (from ${fmtPct(roi.avgCpuOverprovBefore)} to ${fmtPct(roi.avgCpuOverprovAfter)}). This is the independent validation of cost savings — fewer idle resources directly translates to lower spend, which matches the daily cost reduction above.`,
      );
    } else if (roi.avgCpuOverprovAfter > 0) {
      paragraphs.push(
        `Current overprovisioning averages ${fmtPct(roi.avgCpuOverprovAfter)}. There's still room to tighten resource allocation further.`,
      );
    }

    sections.push({
      heading: 'Resource Efficiency',
      paragraphs,
      tone: overprovImproved ? 'positive' : 'neutral',
      annotation: utilImproved
        ? 'Higher utilization + lower overprovisioning = the mechanism behind the cost savings above.'
        : undefined,
    });
  }

  // ── Fee Analysis ───────────────────────────────────────────────────────────
  if (hasFee) {
    if (feeExceedsSavings) {
      const overprovClusters = clusters.filter((c) => c.castaiCpuOverprov > 30);
      const totalPotential = roi.recommendations
        .filter((r) => r.potentialSavings)
        .reduce((s, r) => s + (r.potentialSavings ?? 0), 0);

      sections.push({
        heading: 'Investment Analysis',
        paragraphs: [
          `Current verified savings of ${fmt$(roi.monthlySavings)}/mo against the ${fee}/mo fee show a ${fmt$(Math.abs(roi.netMonthlyBenefit))}/mo gap. The ROI multiple is ${roi.roiMultiple.toFixed(1)}x.`,
          overprovClusters.length > 0
            ? `However, ${overprovClusters.length} cluster${overprovClusters.length > 1 ? 's' : ''} still ${overprovClusters.length > 1 ? 'have' : 'has'} significant overprovisioning. ${totalPotential > 0 ? `Implementing the recommendations below could unlock an additional ~${fmt$(totalPotential)}/mo — potentially closing the gap entirely.` : 'Tightening policies could close this gap.'}`
            : 'Review cluster policies and recommendations below for paths to positive ROI.',
        ],
        tone: 'caution',
      });
    } else {
      sections.push({
        heading: 'Investment Analysis',
        paragraphs: [
          `The ${fee}/mo CAST AI investment generates ${fmt$(roi.monthlySavings)}/mo in verified savings — a ${roi.roiMultiple.toFixed(1)}x return.`,
          `Net benefit: ${fmt$(roi.netMonthlyBenefit)}/mo (${fmt$(roi.annualNetBenefit)}/year). For every $1 invested, ${orgName} receives $${roi.roiMultiple.toFixed(2)} back in infrastructure savings.`,
        ],
        tone: 'positive',
      });
    }
  }

  // ── Baseline Quality ───────────────────────────────────────────────────────
  if (strongClusters.length > 0 || weakClusters.length > 0 || noClusters.length > 0) {
    const parts: string[] = [];
    if (strongClusters.length > 0) {
      parts.push(`${strongClusters.length} cluster${strongClusters.length !== 1 ? 's' : ''} with strong baselines (14+ days of pre-CAST data) — these provide the most credible savings evidence.`);
    }
    if (weakClusters.length > 0) {
      parts.push(`${weakClusters.length} with limited baseline (3-13 days) — directionally valid but less conclusive.`);
    }
    if (noClusters.length > 0) {
      parts.push(`${noClusters.length} without pre-CAST AI data — included in the report but flagged. Consider enabling monitoring before CAST AI acts on new clusters for future renewals.`);
    }

    sections.push({
      heading: 'Data Quality',
      paragraphs: parts,
      tone: noClusters.length > strongClusters.length ? 'caution' : 'neutral',
    });
  }

  // ── Recommendations Transition ─────────────────────────────────────────────
  if (roi.recommendations.length > 0) {
    const totalPotential = roi.recommendations
      .filter((r) => r.potentialSavings)
      .reduce((s, r) => s + (r.potentialSavings ?? 0), 0);

    sections.push({
      heading: 'Untapped Opportunities',
      paragraphs: [
        `${roi.recommendations.length} optimization${roi.recommendations.length > 1 ? 's' : ''} identified across the selected clusters${totalPotential > 0 ? `, with an estimated ~${fmt$(totalPotential)}/mo in additional savings potential` : ''}.`,
        'These represent the gap between current CAST AI optimization and what\'s achievable with tighter policies — the "next wave" of savings for the renewal conversation.',
      ],
      tone: 'neutral',
      annotation: 'The recommendation cards below detail each opportunity with estimated savings impact.',
    });
  }

  return sections;
}
