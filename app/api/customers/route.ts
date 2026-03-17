import { NextResponse } from 'next/server';
import { ORG_KEYS, listClustersForKey } from '@/lib/castai/real-api';
import type { RealCluster } from '@/lib/castai/real-api';

function providerLabel(p?: string) {
  if (p === 'aks') return 'Azure AKS';
  if (p === 'eks') return 'AWS EKS';
  if (p === 'gke') return 'GCP GKE';
  return p ?? 'Kubernetes';
}

function groupLabel(name: string) {
  if (/\bprod\b/.test(name) && !/non.?prod/.test(name)) return 'Production';
  if (/non.?prod|nonprod|uat|staging|sit/.test(name)) return 'Non-Prod';
  if (/\btest(ing)?\b|\bqa\b|\bdev\b/.test(name)) return 'Testing';
  if (/\bdr\b/.test(name)) return 'DR';
  return 'Other';
}

export interface ClusterSummary {
  id: string;
  name: string;
  region: string;
  provider: string;
  status: string;
  group: string;
  firstOperationAt?: string;
}

export interface OrgCard {
  id: string;          // org name key e.g. "C2FO"
  name: string;        // display name
  clusters: ClusterSummary[];
}

export interface HomeResponse {
  orgs: OrgCard[];
}

export async function GET() {
  if (!ORG_KEYS.length) {
    return NextResponse.json({ orgs: [] });
  }

  try {
    const orgResults = await Promise.allSettled(
      ORG_KEYS.map(async ({ name, key }) => {
        const clusters: RealCluster[] = await listClustersForKey(key);
        const summaries: ClusterSummary[] = clusters
          .filter((c) => c.status === 'ready')
          .map((c) => ({
            id:               c.id,
            name:             c.name,
            region:           c.region?.displayName ?? c.region?.name ?? '',
            provider:         providerLabel(c.providerType),
            status:           c.status,
            group:            groupLabel(c.name),
            firstOperationAt: c.firstOperationAt ?? undefined,
          }));

        return { id: name, name: name === 'Default' ? 'My Org' : name, clusters: summaries } as OrgCard;
      })
    );

    const orgs: OrgCard[] = orgResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<OrgCard>).value)
      .filter((o) => o.clusters.length > 0);

    return NextResponse.json({ orgs });
  } catch (err) {
    console.error('[customers route]', err);
    return NextResponse.json({ orgs: [] });
  }
}
