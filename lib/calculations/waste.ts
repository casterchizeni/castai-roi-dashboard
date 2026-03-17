import type { EfficiencyReport, NamespaceCost } from '@/types/castai';

export interface WasteSummary {
  wastePerDay: number;
  wastePerMonth: number;
  cpuWastePercent: number;
  memoryWastePercent: number;
  topWastefulNamespaces: { namespace: string; waste: number; overProvisionedPercent: number }[];
}

/**
 * Derives waste metrics from efficiency report + namespace data.
 */
export function calculateWaste(
  efficiency: EfficiencyReport,
  namespaces: NamespaceCost[]
): WasteSummary {
  const cpuWastePercent =
    efficiency.cpuProvisionedCores > 0
      ? ((efficiency.cpuProvisionedCores - efficiency.cpuUsedCores) /
          efficiency.cpuProvisionedCores) *
        100
      : 0;

  const memoryWastePercent =
    efficiency.memoryProvisionedGb > 0
      ? ((efficiency.memoryProvisionedGb - efficiency.memoryUsedGb) /
          efficiency.memoryProvisionedGb) *
        100
      : 0;

  const topWastefulNamespaces = namespaces
    .filter((ns) => (ns.overProvisionedPercent ?? 0) > 0)
    .sort((a, b) => (b.overProvisionedPercent ?? 0) - (a.overProvisionedPercent ?? 0))
    .slice(0, 5)
    .map((ns) => ({
      namespace: ns.namespace,
      waste: ns.cost * ((ns.overProvisionedPercent ?? 0) / 100),
      overProvisionedPercent: ns.overProvisionedPercent ?? 0,
    }));

  return {
    wastePerDay: efficiency.wastePerDay,
    wastePerMonth: efficiency.wastePerMonth,
    cpuWastePercent,
    memoryWastePercent,
    topWastefulNamespaces,
  };
}
