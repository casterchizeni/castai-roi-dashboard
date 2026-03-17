'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Collapsible from '@/components/Collapsible';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ClusterOrgSummary } from '@/app/api/org/[orgName]/route';
import { computeMultiClusterROI } from '@/lib/calculations/multi-cluster-roi';
import type { Recommendation } from '@/lib/calculations/multi-cluster-roi';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(0)}%`;
}

const REC_TYPE_STYLES: Record<Recommendation['type'], { bg: string; icon: string; border: string; label: string }> = {
  'high-overprovisioning': { bg: 'bg-orange-50', icon: '!', border: 'border-orange-200', label: 'Overprovisioning' },
  'low-spot-adoption': { bg: 'bg-blue-50', icon: '~', border: 'border-blue-200', label: 'Low Optimization' },
  'no-baseline': { bg: 'bg-gray-50', icon: '?', border: 'border-gray-200', label: 'No Baseline' },
};

const BASELINE_BADGE: Record<ClusterOrgSummary['baselineQuality'], { bg: string; dot: string; label: string }> = {
  strong: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Strong' },
  weak: { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400', label: 'Weak' },
  none: { bg: 'bg-gray-50 text-gray-500 border-gray-200', dot: 'bg-gray-300', label: 'None' },
};


// ── MetricCard ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = 'emerald' }: { label: string; value: string; sub?: string; accent?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[accent] ?? colors.slate}`}>
      <div className="text-[10px] font-medium opacity-70 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xl font-extrabold">{value}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}


// ── Props ────────────────────────────────────────────────────────────────────

interface OrgReportViewProps {
  clusters: ClusterOrgSummary[];
  orgName: string;
  monthlyFee: number;
  loading?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function OrgReportView({ clusters, orgName, monthlyFee, loading }: OrgReportViewProps) {
  const router = useRouter();
  const [clusterSearch, setClusterSearch] = useState('');

  const roi = useMemo(
    () => computeMultiClusterROI(clusters, monthlyFee),
    [clusters, monthlyFee],
  );

  const costComparisonData = useMemo(
    () => [...clusters]
      .filter((c) => c.baselineDailyCost > 0 || c.castaiDailyCost > 0)
      .sort((a, b) => (b.baselineDailyCost - b.castaiDailyCost) - (a.baselineDailyCost - a.castaiDailyCost))
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        name: c.name.replace(/^xano-/, ''),
        before: Math.round(c.baselineDailyCost),
        after: Math.round(c.castaiDailyCost),
        savings: Math.round(c.baselineDailyCost - c.castaiDailyCost),
        hasBaseline: c.baselineDailyCost > 0,
      })),
    [clusters],
  );

  const efficiencyData = useMemo(
    () => [...clusters]
      .filter((c) => c.baselineCpuUtil > 0 || c.castaiCpuUtil > 0)
      .sort((a, b) => (b.castaiCpuUtil - b.baselineCpuUtil) - (a.castaiCpuUtil - a.baselineCpuUtil))
      .slice(0, 15)
      .map((c) => ({
        id: c.id,
        name: c.name.replace(/^xano-/, ''),
        utilBefore: Math.round(c.baselineCpuUtil),
        utilAfter: Math.round(c.castaiCpuUtil),
      })),
    [clusters],
  );

  const filteredStories = useMemo(() => {
    const q = clusterSearch.toLowerCase();
    return roi.clusterStories
      .filter((s) => !q || s.cluster.name.toLowerCase().includes(q))
      .sort((a, b) => b.monthlySavings - a.monthlySavings);
  }, [roi.clusterStories, clusterSearch]);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Select clusters to build the ROI story</h3>
        <p className="text-sm text-gray-500">Use the cluster filter above to search and pick clusters. The report builds as you select.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="text-center pb-4 border-b border-emerald-200">
        <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-emerald-50 rounded-full">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">ROI Report</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">{orgName}</h1>
        <p className="text-gray-400 text-xs mt-1">
          {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
          {roi.clustersWithBaseline > 0 && <> · {roi.clustersWithBaseline} verified</>}
          {monthlyFee > 0 && <> · {fmt$(monthlyFee)}/mo fee</>}
          {' · '}{today}
        </p>
      </header>

      {/* ── Key Metrics (always visible) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Monthly Savings"
          value={roi.monthlySavings > 0 ? fmt$(roi.monthlySavings) + '/mo' : '—'}
          sub={roi.clustersWithBaseline > 0 ? `${roi.clustersWithBaseline} baseline cluster${roi.clustersWithBaseline !== 1 ? 's' : ''}` : 'no baseline data'}
          accent="emerald"
        />
        <MetricCard
          label="Cost Reduction"
          value={roi.costReductionPct > 0 ? fmtPct(roi.costReductionPct) : '—'}
          sub="daily cost before vs after"
          accent="blue"
        />
        <MetricCard
          label="ROI Multiple"
          value={roi.roiMultiple > 0 ? `${roi.roiMultiple.toFixed(1)}x` : '—'}
          sub={monthlyFee > 0 ? `on ${fmt$(monthlyFee)}/mo` : 'enter fee to calculate'}
          accent={roi.roiMultiple >= 2 ? 'emerald' : roi.roiMultiple >= 1 ? 'blue' : roi.roiMultiple > 0 ? 'orange' : 'slate'}
        />
        <MetricCard
          label="Annual Savings"
          value={roi.annualSavings > 0 ? fmt$(roi.annualSavings) : '—'}
          sub={monthlyFee > 0 && roi.annualNetBenefit !== 0 ? `${fmt$(roi.annualNetBenefit)} net` : 'at current rate'}
          accent={roi.annualNetBenefit > 0 ? 'purple' : roi.annualNetBenefit < 0 ? 'red' : 'slate'}
        />
      </div>

      {/* ── Daily Cost Chart ─────────────────────────────────────────────────── */}
      {costComparisonData.length > 0 && (
        <Collapsible title="Daily Cost — Before vs After" color="emerald">
          <p className="text-[11px] text-gray-400 mb-3">Real $/day. Grey = pre-CAST AI. Green = with CAST AI.</p>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <ResponsiveContainer width="100%" height={Math.max(200, costComparisonData.length * 28)}>
              <BarChart data={costComparisonData} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v, name) => [fmt$(v as number), name === 'before' ? 'Before' : 'After']} />
                <Legend formatter={(v) => v === 'before' ? 'Before ($/day)' : 'After ($/day)'} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="before" fill="#94a3b8" radius={[0, 3, 3, 0]} opacity={0.6} cursor="pointer" onClick={(data) => data?.id && router.push(`/dashboard/${data.id}`)} />
                <Bar dataKey="after" fill="#10b981" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(data) => data?.id && router.push(`/dashboard/${data.id}`)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {roi.dailySavings > 0 && (
            <p className="text-[11px] text-emerald-600 mt-2 font-medium">
              ↳ Gap = {fmt$(roi.dailySavings)}/day saved across {roi.clustersWithBaseline} clusters
            </p>
          )}
        </Collapsible>
      )}

      {/* ── CPU Utilization Chart ────────────────────────────────────────────── */}
      {efficiencyData.length > 0 && (
        <Collapsible title="CPU Utilization — Before vs After" color="orange">
          <p className="text-[11px] text-gray-400 mb-3">Higher = more efficient. This drives the cost savings above.</p>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <ResponsiveContainer width="100%" height={Math.max(180, efficiencyData.length * 26)}>
              <BarChart data={efficiencyData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v, name) => [`${v}%`, name === 'utilBefore' ? 'Before' : 'After']} />
                <Legend formatter={(v) => v === 'utilBefore' ? 'Before' : 'After'} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="utilBefore" fill="#94a3b8" radius={[0, 3, 3, 0]} opacity={0.6} cursor="pointer" onClick={(data) => data?.id && router.push(`/dashboard/${data.id}`)} />
                <Bar dataKey="utilAfter" fill="#f59e0b" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(data) => data?.id && router.push(`/dashboard/${data.id}`)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {roi.avgCpuUtilAfter > roi.avgCpuUtilBefore && (
            <p className="text-[11px] text-orange-600 mt-2 font-medium">
              ↳ Avg util: {fmtPct(roi.avgCpuUtilBefore)} → {fmtPct(roi.avgCpuUtilAfter)}
            </p>
          )}
        </Collapsible>
      )}

      {/* ── Overprovisioning ─────────────────────────────────────────────────── */}
      {roi.avgCpuOverprovBefore > 0 && (
        <Collapsible title="CPU Overprovisioning — Before vs After" color="red">
          <p className="text-[11px] text-gray-400 mb-3">Lower = less waste. Validates that cost savings are real.</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Before</div>
              <div className="text-2xl font-extrabold text-red-400">{fmtPct(roi.avgCpuOverprovBefore)}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">After</div>
              <div className={`text-2xl font-extrabold ${roi.avgCpuOverprovAfter < roi.avgCpuOverprovBefore ? 'text-emerald-600' : 'text-red-500'}`}>
                {fmtPct(roi.avgCpuOverprovAfter)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">Reduced</div>
              <div className="text-2xl font-extrabold text-indigo-600">
                {fmtPct(roi.avgCpuOverprovBefore - roi.avgCpuOverprovAfter)}
              </div>
            </div>
          </div>
          {roi.costReductionPct > 0 && (
            <p className="text-[11px] text-indigo-600 mt-2 font-medium">
              ↳ Overprov drop validates the {fmtPct(roi.costReductionPct)} cost reduction — fewer idle resources = lower spend
            </p>
          )}
        </Collapsible>
      )}

      {/* ── Per-Cluster Stories ───────────────────────────────────────────────── */}
      <Collapsible title={`Cluster Analysis (${clusters.length})`} color="purple">
          <div className="mb-3 print:hidden">
            <input
              type="text"
              placeholder="Filter clusters..."
              value={clusterSearch}
              onChange={(e) => setClusterSearch(e.target.value)}
              className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            {filteredStories.map((s) => {
              const badge = BASELINE_BADGE[s.cluster.baselineQuality];
              return (
                <Link
                  key={s.cluster.id}
                  href={`/dashboard/${s.cluster.id}`}
                  className="group block bg-white rounded-lg border border-gray-200 p-4 transition-all hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm text-gray-900 truncate">{s.cluster.name}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full border flex-shrink-0 ${badge.bg}`}>
                        <span className={`w-1 h-1 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{s.cluster.provider}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.hasBaseline && s.monthlySavings > 0 && (
                        <span className="text-sm font-bold text-emerald-600">{fmt$(s.monthlySavings)}/mo</span>
                      )}
                      <span className="text-gray-300 group-hover:text-indigo-500 transition-colors text-sm">→</span>
                    </div>
                  </div>
                  {/* Compact metrics row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 mt-2">
                    {s.hasBaseline && (
                      <span>Cost: <span className="text-gray-400 line-through">{fmt$(s.cluster.baselineDailyCost)}</span> → <span className="text-emerald-600 font-semibold">{fmt$(s.cluster.castaiDailyCost)}</span>/day</span>
                    )}
                    {s.cluster.castaiCpuUtil > 0 && (
                      <span>CPU: {s.cluster.baselineCpuUtil > 0 && <><span className="text-gray-400">{fmtPct(s.cluster.baselineCpuUtil)}</span> → </>}<span className="font-semibold">{fmtPct(s.cluster.castaiCpuUtil)}</span></span>
                    )}
                    {s.cluster.castaiCpuOverprov > 0 && (
                      <span>Overprov: {s.cluster.baselineCpuOverprov > 0 && <><span className="text-red-400">{fmtPct(s.cluster.baselineCpuOverprov)}</span> → </>}<span className={s.cluster.castaiCpuOverprov < s.cluster.baselineCpuOverprov ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{fmtPct(s.cluster.castaiCpuOverprov)}</span></span>
                    )}
                    <span>Baseline: {s.cluster.baselineDays > 0 ? `${s.cluster.baselineDays}d` : 'None'}</span>
                  </div>
                </Link>
              );
            })}
          </div>
      </Collapsible>

      {/* ── Recommendations ──────────────────────────────────────────────────── */}
      {roi.recommendations.length > 0 && (
        <Collapsible title={`Actions (${roi.recommendations.length})`} color="orange">
          <div className="space-y-2">
            {roi.recommendations.map((rec, i) => {
              const style = REC_TYPE_STYLES[rec.type];
              return (
                <Link
                  key={i}
                  href={`/dashboard/${rec.clusterId}`}
                  className={`group block rounded-lg border p-3 flex items-center gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${style.bg} ${style.border} hover:border-indigo-300`}
                >
                  <div className="w-6 h-6 rounded bg-white/80 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500 border border-gray-200">
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-800 truncate">{rec.clusterName}</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded-full bg-white/60 text-gray-500 flex-shrink-0">{style.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">{rec.message}</p>
                  </div>
                  {rec.potentialSavings != null && rec.potentialSavings > 0 && (
                    <span className="text-xs font-bold text-orange-600 flex-shrink-0">+{fmt$(rec.potentialSavings)}/mo</span>
                  )}
                  <span className="text-gray-300 group-hover:text-indigo-500 transition-colors text-sm flex-shrink-0">→</span>
                </Link>
              );
            })}
          </div>
        </Collapsible>
      )}

      {/* ── Bottom Line (always visible) ─────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 text-white">
        <h2 className="text-sm font-bold mb-3 text-gray-300 uppercase tracking-wide">Bottom Line</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase">Daily Before</div>
            <div className="text-lg font-extrabold mt-0.5">
              {roi.totalBaselineDailyCost > 0 ? fmt$(roi.totalBaselineDailyCost) : '—'}
              <span className="text-xs font-normal text-gray-500">/day</span>
            </div>
          </div>
          <div className="bg-emerald-500/20 rounded-lg p-3 border border-emerald-400/30">
            <div className="text-[10px] text-emerald-300 uppercase">Daily Now</div>
            <div className="text-lg font-extrabold mt-0.5 text-emerald-400">
              {fmt$(roi.totalCastaiDailyCost)}<span className="text-xs font-normal text-emerald-300/60">/day</span>
            </div>
          </div>
          <div className="bg-blue-500/20 rounded-lg p-3 border border-blue-400/30">
            <div className="text-[10px] text-blue-300 uppercase">Monthly Saved</div>
            <div className="text-lg font-extrabold mt-0.5 text-blue-400">
              {roi.monthlySavings > 0 ? fmt$(roi.monthlySavings) : '—'}<span className="text-xs font-normal text-blue-300/60">/mo</span>
            </div>
          </div>
          {monthlyFee > 0 ? (
            <div className={`rounded-lg p-3 border ${roi.netMonthlyBenefit >= 0 ? 'bg-emerald-500/20 border-emerald-400/30' : 'bg-red-500/20 border-red-400/30'}`}>
              <div className={`text-[10px] uppercase ${roi.netMonthlyBenefit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>ROI</div>
              <div className={`text-lg font-extrabold mt-0.5 ${roi.netMonthlyBenefit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {roi.roiMultiple > 0 ? `${roi.roiMultiple.toFixed(1)}x` : '—'}
              </div>
            </div>
          ) : (
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-[10px] text-gray-400 uppercase">Reduction</div>
              <div className="text-lg font-extrabold mt-0.5">{roi.costReductionPct > 0 ? fmtPct(roi.costReductionPct) : '—'}</div>
            </div>
          )}
        </div>
        <p className="text-gray-300 text-xs leading-relaxed">
          {roi.monthlySavings > 0 ? (
            monthlyFee > 0 && roi.netMonthlyBenefit >= 0
              ? <>CAST AI delivers <strong className="text-emerald-400">{fmt$(roi.monthlySavings)}/mo</strong> in verified savings. At <strong className="text-white">{fmt$(monthlyFee)}/mo</strong>, every $1 returns <strong className="text-emerald-400">${roi.roiMultiple.toFixed(2)}</strong> — data-backed positive ROI.</>
              : monthlyFee > 0
                ? <>Verified savings of <strong className="text-blue-400">{fmt$(roi.monthlySavings)}/mo</strong> against <strong className="text-white">{fmt$(monthlyFee)}/mo</strong> fee. {roi.recommendations.filter(r => r.potentialSavings).length} optimization{roi.recommendations.filter(r => r.potentialSavings).length !== 1 ? 's' : ''} identified to improve ROI.</>
                : <>CAST AI saves <strong className="text-emerald-400">{fmt$(roi.monthlySavings)}/mo</strong> ({fmtPct(roi.costReductionPct)} reduction) across {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}, verified by real daily cost data.</>
          ) : (
            <>Select clusters with baseline data to build a verified savings story.</>
          )}
        </p>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="text-center text-[10px] text-gray-400 pt-2 border-t border-gray-100">
        {today} · {clusters.length} clusters · {roi.clustersWithBaseline} with baseline · CAST AI Efficiency API · {orgName}
      </footer>
    </div>
  );
}
