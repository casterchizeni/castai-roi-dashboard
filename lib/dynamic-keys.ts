'use client';

const STORAGE_KEY = 'castai-dynamic-orgs';
const CLUSTER_KEY_MAP = 'castai-cluster-keys';

export interface DynamicOrg {
  name: string;
  key: string;
}

export function getDynamicOrgs(): DynamicOrg[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

export function addDynamicOrg(name: string, key: string) {
  const orgs = getDynamicOrgs().filter((o) => o.name !== name);
  orgs.push({ name, key });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orgs));
}

export function removeDynamicOrg(name: string) {
  const orgs = getDynamicOrgs().filter((o) => o.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orgs));
  // Also clean up cluster keys for this org
  clearClusterKeysForOrg(name);
}

export function getDynamicKeyForOrg(orgName: string): string | null {
  return getDynamicOrgs().find((o) => o.name.toLowerCase() === orgName.toLowerCase())?.key ?? null;
}

/** Store clusterId → apiKey mapping so drill-down works */
export function setClusterKeys(clusterIds: string[], key: string) {
  if (typeof window === 'undefined') return;
  try {
    const map = JSON.parse(localStorage.getItem(CLUSTER_KEY_MAP) ?? '{}');
    for (const id of clusterIds) map[id] = key;
    localStorage.setItem(CLUSTER_KEY_MAP, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getClusterKey(clusterId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const map = JSON.parse(localStorage.getItem(CLUSTER_KEY_MAP) ?? '{}');
    return map[clusterId] ?? null;
  } catch { return null; }
}

function clearClusterKeysForOrg(_orgName: string) {
  // We don't track which clusters belong to which org in the key map,
  // so just leave them — they'll be overwritten or ignored.
}
