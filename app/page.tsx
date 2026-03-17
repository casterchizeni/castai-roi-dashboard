'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { OrgCard, ClusterSummary, HomeResponse } from '@/app/api/customers/route';
import {
  getDynamicOrgs,
  addDynamicOrg,
  removeDynamicOrg,
  setClusterKeys,
} from '@/lib/dynamic-keys';

const GROUP_ORDER = ['Production', 'Non-Prod', 'Testing', 'DR', 'Other'];

const PROVIDER_COLORS: Record<string, string> = {
  'AWS EKS':   'bg-orange-100 text-orange-700',
  'GCP GKE':   'bg-blue-100 text-blue-700',
  'Azure AKS': 'bg-sky-100 text-sky-700',
};

function ProviderBadge({ provider }: { provider: string }) {
  const cls = PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{provider}</span>;
}

function GroupBadge({ group }: { group: string }) {
  const cls =
    group === 'Production' ? 'bg-emerald-100 text-emerald-700' :
    group === 'Non-Prod'   ? 'bg-amber-100 text-amber-700' :
    group === 'Testing'    ? 'bg-purple-100 text-purple-700' :
    group === 'DR'         ? 'bg-red-100 text-red-700' :
                             'bg-gray-100 text-gray-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{group}</span>;
}

function OrgCardComponent({ org, isDynamic, onRemove }: { org: OrgCard; isDynamic?: boolean; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);

  const providers = [...new Set(org.clusters.map((c) => c.provider))];
  const groups    = GROUP_ORDER.filter((g) => org.clusters.some((c) => c.group === g));
  const regions   = [...new Set(org.clusters.map((c) => c.region))].slice(0, 3);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${isDynamic ? 'border-indigo-200' : 'border-gray-200'}`}>
      {/* Org header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-6 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{org.name}</h2>
              {isDynamic && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-semibold rounded-full">
                  Added via API key
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {org.clusters.length} cluster{org.clusters.length !== 1 ? 's' : ''}
              {regions.length > 0 && (
                <> · {regions.join(', ')}{regions.length < [...new Set(org.clusters.map((c) => c.region))].length ? ' +more' : ''}</>
              )}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {providers.map((p) => <ProviderBadge key={p} provider={p} />)}
              {groups.map((g) => <GroupBadge key={g} group={g} />)}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            {isDynamic && onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                Remove
              </button>
            )}
            <Link
              href={`/org/${org.id === 'Default' ? 'my-org' : org.id}`}
              onClick={(e) => e.stopPropagation()}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap"
            >
              Org View
            </Link>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{org.clusters.length}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">clusters</div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Cluster list */}
      {open && (
        <div className="border-t border-gray-100">
          {GROUP_ORDER.filter((g) => org.clusters.some((c) => c.group === g)).map((g) => {
            const inGroup = org.clusters.filter((c) => c.group === g);
            return (
              <div key={g}>
                <div className="px-6 py-2 bg-gray-50 border-b border-gray-100">
                  <GroupBadge group={g} />
                  <span className="ml-2 text-xs text-gray-400">{inGroup.length} cluster{inGroup.length !== 1 ? 's' : ''}</span>
                </div>
                {inGroup.map((cluster) => (
                  <Link
                    key={cluster.id}
                    href={`/dashboard/${cluster.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-gray-800 group-hover:text-emerald-700">
                          {cluster.name}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{cluster.region}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProviderBadge provider={cluster.provider} />
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Add Organization Form ───────────────────────────────────────────────────

function AddOrgForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;
    setLoading(true);
    setErr('');

    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErr(data.error ?? 'Failed to validate key');
        return;
      }

      if (!data.clusters?.length) {
        setErr('Key is valid but no ready clusters found');
        return;
      }

      // Save to localStorage
      addDynamicOrg(name.trim(), key.trim());
      setClusterKeys(
        data.clusters.map((c: ClusterSummary) => c.id),
        key.trim()
      );

      setName('');
      setKey('');
      setOpen(false);
      onAdded();
    } catch {
      setErr('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors group"
      >
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-700 group-hover:text-indigo-700">Add Organization</p>
            <p className="text-xs text-gray-400">Paste a CAST AI API key to load any org</p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl border-2 border-indigo-200 p-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Add Organization</h3>
        <button type="button" onClick={() => { setOpen(false); setErr(''); }} className="text-xs text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Organization Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corp"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">CAST AI API Key</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your API key"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Key is stored in your browser only — never sent to our servers.</p>
        <button
          type="submit"
          disabled={loading || !name.trim() || !key.trim()}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Validating...' : 'Add'}
        </button>
      </div>
    </form>
  );
}

// ── Home ────────────────────────────────────────────────────────────────────

export default function Home() {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState(false);
  const [dynamicOrgs, setDynamicOrgs] = useState<OrgCard[]>([]);
  const [dynamicVersion, setDynamicVersion] = useState(0);

  // Fetch server-side orgs (from env vars)
  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  // Fetch dynamic orgs (from localStorage keys)
  useEffect(() => {
    const stored = getDynamicOrgs();
    if (!stored.length) { setDynamicOrgs([]); return; }

    // Filter out orgs that already exist server-side
    const serverNames = new Set(data?.orgs.map((o) => o.name.toLowerCase()) ?? []);
    const toFetch = stored.filter((o) => !serverNames.has(o.name.toLowerCase()));
    if (!toFetch.length) { setDynamicOrgs([]); return; }

    Promise.allSettled(
      toFetch.map(async ({ name, key }) => {
        const res = await fetch('/api/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        if (!res.ok) return null;
        const { clusters } = await res.json() as { clusters: ClusterSummary[] };
        if (!clusters?.length) return null;
        // Cache cluster→key mapping
        setClusterKeys(clusters.map((c) => c.id), key);
        return { id: name, name, clusters } as OrgCard;
      })
    ).then((results) => {
      const orgs = results
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => (r as PromiseFulfilledResult<OrgCard>).value);
      setDynamicOrgs(orgs);
    });
  }, [data, dynamicVersion]);

  const allOrgs = [...(data?.orgs ?? []), ...dynamicOrgs];
  const dynamicNames = new Set(dynamicOrgs.map((o) => o.name));
  const totalClusters = allOrgs.reduce((s, o) => s + o.clusters.length, 0);

  function handleRemove(orgName: string) {
    removeDynamicOrg(orgName);
    setDynamicVersion((v) => v + 1);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">CAST AI ROI Dashboard</h1>
            <p className="text-sm text-gray-500">Kubernetes cost intelligence</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Stats bar */}
        {(data || dynamicOrgs.length > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-3xl font-bold text-gray-900">{allOrgs.length}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Organisations</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-3xl font-bold text-gray-900">{totalClusters}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Clusters</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-3xl font-bold text-emerald-600">
                {[...new Set(allOrgs.flatMap((o) => o.clusters.map((c) => c.provider)))].length}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Cloud Providers</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">
                {[...new Set(allOrgs.flatMap((o) => o.clusters.map((c) => c.region)))].length}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Regions</div>
            </div>
          </div>
        )}

        {/* Org cards */}
        {!data && !error && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse h-36 bg-white rounded-2xl border border-gray-200" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 font-medium">Failed to load clusters. Check your API keys.</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Server-side orgs */}
          {data?.orgs.map((org) => <OrgCardComponent key={org.id} org={org} />)}

          {/* Dynamic orgs (from localStorage) */}
          {dynamicOrgs.map((org) => (
            <OrgCardComponent
              key={`dynamic-${org.id}`}
              org={org}
              isDynamic
              onRemove={() => handleRemove(org.name)}
            />
          ))}

          {/* Add org form */}
          <AddOrgForm onAdded={() => setDynamicVersion((v) => v + 1)} />
        </div>
      </div>
    </div>
  );
}
