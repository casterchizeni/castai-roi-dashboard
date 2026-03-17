import { NextRequest, NextResponse } from 'next/server';
import { listClustersForKey } from '@/lib/castai/real-api';

function providerLabel(p?: string) {
  if (p === 'aks') return 'Azure AKS';
  if (p === 'eks') return 'AWS EKS';
  if (p === 'gke') return 'GCP GKE';
  return p ?? 'Kubernetes';
}

function groupLabel(name: string) {
  const n = name.toLowerCase();
  if (/\bprod\b/.test(n) && !/non.?prod/.test(n)) return 'Production';
  if (/non.?prod|nonprod|uat|staging|sit/.test(n)) return 'Non-Prod';
  if (/\btest(ing)?\b|\bqa\b|\bdev\b/.test(n)) return 'Testing';
  if (/\bdr\b/.test(n)) return 'DR';
  return 'Other';
}

/**
 * POST /api/probe
 * Body: { key: string }
 * Returns: { clusters: ClusterSummary[] } or { error: string }
 *
 * Used to validate a CAST AI API key and return its cluster list.
 */
export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const clusters = await listClustersForKey(key);
    const ready = clusters.filter((c) => c.status === 'ready');

    const summaries = ready.map((c) => ({
      id: c.id,
      name: c.name,
      region: c.region?.displayName ?? c.region?.name ?? '',
      provider: providerLabel(c.providerType),
      status: c.status,
      group: groupLabel(c.name),
      firstOperationAt: c.firstOperationAt ?? undefined,
    }));

    return NextResponse.json({ clusters: summaries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('401') || msg.includes('403')) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
