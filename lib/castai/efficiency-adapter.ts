/**
 * Adapts the real CAST AI /efficiency API response into our internal types.
 *
 * The efficiency endpoint returns per-day items where cost fields are HOURLY
 * rates (not daily totals). We multiply by 24 to get daily costs.
 *
 * Fields: cpuCostOnDemand, cpuCostSpot, ramCostOnDemand, ramCostSpot ($/hr)
 *   cpuCountOnDemand/Spot (provisioned CPU core-hours per day)
 *   requestedCpuCountOnDemand/Spot, cpuUsedOnDemand/Spot
 *   ramGibOnDemand/Spot, requestedRamGibOnDemand/Spot, ramUsedGibOnDemand/Spot
 *   cpuOverprovisioning*, ramOverprovisioning*
 */

export interface RawEfficiencyItem {
  timestamp: string;
  cpuCostOnDemand: string;
  cpuCostSpot: string;
  cpuCostSpotFallback: string;
  ramCostOnDemand: string;
  ramCostSpot: string;
  ramCostSpotFallback: string;
  cpuCountOnDemand: string;
  cpuCountSpot: string;
  ramGibOnDemand: string;
  ramGibSpot: string;
  requestedCpuCountOnDemand: string;
  requestedCpuCountSpot: string;
  requestedRamGibOnDemand: string;
  requestedRamGibSpot: string;
  cpuOverprovisioningOnDemand: string;
  cpuOverprovisioningOnDemandPercent: string;
  cpuOverprovisioningSpotPercent: string;
  ramOverprovisioningOnDemand: string;
  ramOverprovisioningOnDemandPercent: string;
  ramOverprovisioningSpotPercent: string;
  cpuUsedOnDemand: string;
  cpuUsedSpot: string;
  ramUsedGibOnDemand: string;
  ramUsedGibSpot: string;
  storageCost: string;
}

export interface RawEfficiencySummary {
  cpuOverprovisioningPercent: string;
  ramOverprovisioningPercent: string;
  costPerCpuProvisioned: string;
  costPerCpuRequested: string;
  costPerCpuUsed: string;
  costPerRamGibProvisioned: string;
  costPerRamGibRequested: string;
  costPerRamGibUsed: string;
}

export interface RawEfficiencyCurrent {
  cpuProvisioned: string;
  cpuRequested: string;
  cpuUsed: string;
  ramGibProvisioned: string;
  ramGibRequested: string;
  ramGibUsed: string;
  cpuOverprovisioningPercent: string;
  ramOverprovisioningPercent: string;
}

export interface RawEfficiencyResponse {
  clusterId: string;
  items: RawEfficiencyItem[];
  summary: RawEfficiencySummary;
  current: RawEfficiencyCurrent;
}

const n = (s: string) => parseFloat(s) || 0;

export function adaptEfficiencyToCostHistory(raw: RawEfficiencyResponse) {
  return raw.items.map((item) => {
    // API returns hourly rates — multiply by 24 to get daily costs
    const cpuCost = (n(item.cpuCostOnDemand) + n(item.cpuCostSpot) + n(item.cpuCostSpotFallback)) * 24;
    const ramCost = (n(item.ramCostOnDemand) + n(item.ramCostSpot) + n(item.ramCostSpotFallback)) * 24;
    const totalCost = cpuCost + ramCost + n(item.storageCost) * 24;
    const spotCost = (n(item.cpuCostSpot) + n(item.ramCostSpot) + n(item.cpuCostSpotFallback) + n(item.ramCostSpotFallback)) * 24;
    const onDemandCost = (n(item.cpuCostOnDemand) + n(item.ramCostOnDemand)) * 24;

    const cpuProvisionedHours = n(item.cpuCountOnDemand) + n(item.cpuCountSpot);
    const ramProvisionedGbHours = n(item.ramGibOnDemand) + n(item.ramGibSpot);
    const cpuRequestedHours = n(item.requestedCpuCountOnDemand) + n(item.requestedCpuCountSpot);
    const ramRequestedGbHours = n(item.requestedRamGibOnDemand) + n(item.requestedRamGibSpot);
    const cpuUsedHours = n(item.cpuUsedOnDemand) + n(item.cpuUsedSpot);
    const ramUsedGbHours = n(item.ramUsedGibOnDemand) + n(item.ramUsedGibSpot);

    const cpuOverprovisioningPct =
      (n(item.cpuOverprovisioningOnDemandPercent) + n(item.cpuOverprovisioningSpotPercent)) / 2;
    const ramOverprovisioningPct =
      (n(item.ramOverprovisioningOnDemandPercent) + n(item.ramOverprovisioningSpotPercent)) / 2;

    return {
      date: item.timestamp.slice(0, 10),
      totalCost,
      computeCost: totalCost,
      cpuCost,
      ramCost,
      spotCost,
      onDemandCost,
      // Use provisioned hours as a proxy for "CPU hours" in our calculations
      cpuHours: cpuProvisionedHours,
      memoryGbHours: ramProvisionedGbHours,
      cpuRequestedHours,
      ramRequestedGbHours,
      cpuUsedHours,
      ramUsedGbHours,
      cpuOverprovisioningPct,
      ramOverprovisioningPct,
    };
  });
}

export function adaptEfficiencyReport(raw: RawEfficiencyResponse) {
  const cur = raw.current;
  const sum = raw.summary;

  const cpuProvisionedCores = n(cur.cpuProvisioned);
  const cpuUsedCores = n(cur.cpuUsed);
  const cpuRequestedCores = n(cur.cpuRequested);
  const memoryProvisionedGb = n(cur.ramGibProvisioned);
  const memoryUsedGb = n(cur.ramGibUsed);
  const memoryRequestedGb = n(cur.ramGibRequested);

  const cpuWastePercent = n(cur.cpuOverprovisioningPercent);
  const ramWastePercent = n(cur.ramOverprovisioningPercent);

  // Estimate cost-based waste using summary rates
  const cpuProvisionedCostPerHour = n(sum.costPerCpuProvisioned);
  const ramProvisionedCostPerGbHour = n(sum.costPerRamGibProvisioned);

  const wastefulCpuCores = cpuProvisionedCores * (cpuWastePercent / 100);
  const wastefulRamGb = memoryProvisionedGb * (ramWastePercent / 100);
  const overProvisionedCostPerHour =
    wastefulCpuCores * cpuProvisionedCostPerHour +
    wastefulRamGb * ramProvisionedCostPerGbHour;

  const wastePerDay = overProvisionedCostPerHour * 24;
  const wastePerMonth = wastePerDay * 30;
  const utilizationPercent = cpuProvisionedCores > 0
    ? Math.round((cpuUsedCores / cpuProvisionedCores) * 100)
    : 0;

  return {
    clusterId: raw.clusterId,
    cpuProvisionedCores,
    cpuRequestedCores,
    cpuUsedCores,
    memoryProvisionedGb,
    memoryRequestedGb,
    memoryUsedGb,
    overProvisionedCostPerHour,
    wastePerDay,
    wastePerMonth,
    utilizationPercent,
  };
}

export function adaptSpotOnDemandFromHistory(
  history: ReturnType<typeof adaptEfficiencyToCostHistory>
) {
  // Use the last 7 days to estimate current spot vs on-demand node ratio
  const recent = history.slice(-7);
  const totalSpot = recent.reduce((s, d) => s + d.spotCost, 0);
  const totalOnDemand = recent.reduce((s, d) => s + d.onDemandCost, 0);
  const total = totalSpot + totalOnDemand;

  const spotPct = total > 0 ? totalSpot / total : 0;

  // Estimate node counts (rough heuristic: spot nodes cost ~70% less than on-demand)
  // We'll use cost proportion as a proxy
  const estimatedTotalNodes = 20;
  const spotNodes = Math.round(estimatedTotalNodes * spotPct);
  const onDemandNodes = estimatedTotalNodes - spotNodes;

  return {
    totalNodes: estimatedTotalNodes,
    spotNodes,
    onDemandNodes,
    spotCostPct: spotPct * 100,
    nodes: [],
  };
}
