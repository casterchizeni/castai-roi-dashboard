import type { Commitment, CommitmentSummary } from '@/types/castai';
import type { RawCommitment } from './real-api';

// ─── Parse raw API commitments ───────────────────────────────────────────────

export function adaptCommitments(raw: RawCommitment[]): Commitment[] {
  return raw.map((r) => {
    const parsed = r.totalCost ? parseFloat(r.totalCost) : NaN;
    return {
      id: r.id,
      allowedUsage: r.allowedUsage,
      count: r.count,
      instanceTypeCpu: r.instanceTypeCpu,
      effectiveCpu: r.effectiveCpu,
      totalCost: !isNaN(parsed) && parsed > 0 ? parsed : null,
      plan: r.plan,
      state: r.state,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
      region: r.region,
      cloudServiceProvider: r.cloudServiceProvider,
    };
  });
}

// ─── Instance family extraction ──────────────────────────────────────────────
// Azure: Standard_E32as_v4 → Standard_E
// AWS:   m5.xlarge          → m5
// GCP:   n2-standard-4      → n2-standard

export function extractInstanceFamily(instanceType: string): string {
  // Azure: Standard_<Family><Size><Options>_v<N>
  if (instanceType.startsWith('Standard_')) {
    const match = instanceType.match(/^(Standard_[A-Za-z])[a-z]*/);
    return match ? match[1] : instanceType;
  }
  // AWS: family.size
  if (instanceType.includes('.')) {
    return instanceType.split('.')[0];
  }
  // GCP: family-type-size
  const parts = instanceType.split('-');
  if (parts.length >= 3) {
    return parts.slice(0, -1).join('-');
  }
  return instanceType;
}

// ─── Cross-reference nodes with commitments ──────────────────────────────────

export function isNodeCoveredByCommitment(
  nodeInstanceType: string,
  commitment: Commitment,
): boolean {
  // Exact instance type match
  if (
    commitment.allowedUsage.instanceType &&
    nodeInstanceType === commitment.allowedUsage.instanceType
  ) {
    return true;
  }
  // Instance family match (Azure instance size flexibility)
  if (commitment.allowedUsage.instanceFamily) {
    const nodeFamily = extractInstanceFamily(nodeInstanceType);
    const commitFamily = extractInstanceFamily(commitment.allowedUsage.instanceFamily);
    return nodeFamily === commitFamily;
  }
  // Fallback: extract family from both and compare
  const nodeFamily = extractInstanceFamily(nodeInstanceType);
  const commitType = commitment.allowedUsage.instanceType;
  if (commitType) {
    return nodeFamily === extractInstanceFamily(commitType);
  }
  return false;
}

// ─── Compute org-level commitment summary ────────────────────────────────────

export function computeCommitmentSummary(
  commitments: Commitment[],
  firstOperationAt: string | undefined,
  provisionedNodeTypes: { instanceType: string; cpuCores: number; count: number }[],
): CommitmentSummary {
  const active = commitments.filter((c) => c.state === 'ACTIVE' || c.state === 'STATE_ACTIVE');
  const expired = commitments.filter((c) => c.state === 'EXPIRED' || c.state === 'STATE_EXPIRED');
  const activeInCast = active.filter((c) => c.status === 'Active');
  const inactiveInCast = active.filter((c) => c.status !== 'Active');

  // Cost metrics (only from commitments with totalCost)
  const withCost = active.filter((c) => c.totalCost !== null);
  const missingCostCount = active.length - withCost.length;
  const totalHourlyCost = withCost.reduce((s, c) => s + c.totalCost! * c.count, 0);
  const totalCommittedCpu = active.reduce((s, c) => s + c.effectiveCpu, 0);
  const avgCostPerCpuHr = totalCommittedCpu > 0 ? totalHourlyCost / totalCommittedCpu : null;

  // Timing classification (pre vs post CAST AI)
  let preCastAICount = 0;
  let postCastAICount = 0;
  if (firstOperationAt) {
    const opTime = new Date(firstOperationAt).getTime();
    for (const c of active) {
      if (new Date(c.startDate).getTime() < opTime) preCastAICount++;
      else postCastAICount++;
    }
  } else {
    preCastAICount = active.length;
  }

  // Coverage: match node instance types against commitment instance types/families
  let riCoveredCpuCores = 0;
  const totalProvisionedCpuCores = provisionedNodeTypes.reduce(
    (s, n) => s + n.cpuCores * n.count,
    0,
  );

  for (const node of provisionedNodeTypes) {
    const isCovered = active.some((c) => isNodeCoveredByCommitment(node.instanceType, c));
    if (isCovered) {
      riCoveredCpuCores += node.cpuCores * node.count;
    }
  }

  const coveragePct =
    totalProvisionedCpuCores > 0
      ? (riCoveredCpuCores / totalProvisionedCpuCores) * 100
      : 0;

  const estimatedMonthlyRiSpend = totalHourlyCost * 24 * 30;

  return {
    totalCommitments: commitments.length,
    activeCommitments: active.length,
    expiredCommitments: expired.length,
    activeInCastAI: activeInCast.length,
    inactiveInCastAI: inactiveInCast.length,
    totalHourlyCost,
    totalCommittedCpu,
    avgCostPerCpuHr,
    estimatedMonthlyRiSpend,
    preCastAICount,
    postCastAICount,
    coveragePct,
    missingCostCount,
    commitments,
  };
}
