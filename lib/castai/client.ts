const CASTAI_BASE_URL = process.env.CASTAI_BASE_URL || 'https://api.cast.ai/v1';

export class CastAIClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = CASTAI_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 300 }, // 5-minute cache for Next.js
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`CAST AI API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ─── Cluster ───────────────────────────────────────────────────────────────

  async getCluster(clusterId: string) {
    return this.fetch<Record<string, unknown>>(`/clusters/${clusterId}`);
  }

  async listClusters() {
    return this.fetch<{ items: Record<string, unknown>[] }>('/clusters');
  }

  // ─── Cost Reports ──────────────────────────────────────────────────────────

  async getClusterCostReport(
    clusterId: string,
    fromDate: string,
    toDate: string
  ) {
    return this.fetch<Record<string, unknown>>(
      `/cost-reports/clusters/${clusterId}`,
      { fromDate, toDate }
    );
  }

  async getWorkloadCostReport(
    clusterId: string,
    fromDate: string,
    toDate: string
  ) {
    return this.fetch<Record<string, unknown>>(
      `/cost-reports/clusters/${clusterId}/workloads`,
      { fromDate, toDate }
    );
  }

  async getClusterEfficiencyReport(
    clusterId: string,
    fromDate: string,
    toDate: string
  ) {
    return this.fetch<Record<string, unknown>>(
      `/cost-reports/clusters/${clusterId}/efficiency`,
      { fromDate, toDate }
    );
  }

  async getNamespaceReport(
    clusterId: string,
    fromDate: string,
    toDate: string
  ) {
    return this.fetch<Record<string, unknown>>(
      `/cost-reports/clusters/${clusterId}/namespaces`,
      { fromDate, toDate }
    );
  }

  async getClusterCostHistory(
    clusterId: string,
    fromDate: string,
    toDate: string
  ) {
    return this.fetch<Record<string, unknown>>(
      `/cost-reports/clusters/${clusterId}/history`,
      { fromDate, toDate }
    );
  }

  async getSavingsRecommendation(clusterId: string) {
    return this.fetch<Record<string, unknown>>(
      `/cost-reports/clusters/${clusterId}/savings`
    );
  }

  async getOrgEfficiencySummary(fromDate: string, toDate: string) {
    return this.fetch<Record<string, unknown>>(
      '/cost-reports/efficiency/summary',
      { fromDate, toDate }
    );
  }

  // ─── Node Metrics ──────────────────────────────────────────────────────────

  async getNodeMetrics(clusterId: string, fromDate: string, toDate: string) {
    return this.fetch<Record<string, unknown>>(
      `/metrics/clusters/${clusterId}/nodes`,
      { fromDate, toDate }
    );
  }
}

export function createClient(apiKey: string): CastAIClient {
  return new CastAIClient(apiKey);
}
