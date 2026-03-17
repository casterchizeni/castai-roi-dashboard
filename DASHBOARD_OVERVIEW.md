# CAST AI ROI Dashboard — Complete Technical Overview

## What Is This?

A Next.js 14 web application that connects to the CAST AI API to show the ROI (Return on Investment) a customer gets from deploying CAST AI on their Kubernetes clusters. It is designed to be used in customer conversations, demos, and business reviews.

---

## Architecture

```
castai-roi-dashboard/
├── app/
│   ├── page.tsx                    — Home: lists all clusters grouped by env
│   ├── dashboard/[clusterId]/
│   │   └── page.tsx                — Main dashboard for one cluster
│   └── api/
│       ├── castai/[clusterId]/
│       │   └── route.ts            — Backend API proxy to CAST AI
│       └── customers/
│           └── route.ts            — Lists all org clusters
├── components/
│   ├── cards/
│   │   ├── OverviewCard.tsx        — ROI headline stats (4-stat grid)
│   │   ├── PaybackCard.tsx         — Payback period calculator
│   │   ├── NodeConsolidation.tsx   — Node count + utilisation
│   │   ├── WasteCalculator.tsx     — CPU/RAM waste breakdown
│   │   └── RebalancingCard.tsx     — Rebalancing schedules + job status
│   ├── charts/
│   │   ├── CostTrendChart.tsx      — 90-day cost line chart
│   │   ├── ForecastChart.tsx       — 30/90-day cost forecast
│   │   ├── SpotOnDemandRatio.tsx   — Spot vs on-demand node split
│   │   ├── InstanceBreakdown.tsx   — Bar chart of node types
│   │   ├── UsageGrowthChart.tsx    — Cost vs CPU usage correlation
│   │   └── AutoscalerEventsChart.tsx — Annotated cost chart + event log
│   ├── tables/
│   │   ├── NamespaceTable.tsx      — Cost + waste by namespace
│   │   └── WorkloadTable.tsx       — Cost by workload/deployment
│   ├── Timeline.tsx                — Visual timeline of CAST AI enablement
│   └── ROIStory.tsx                — 6-step narrative of how savings happened
├── hooks/
│   ├── useClusterData.ts           — SWR hooks for all API endpoints
│   └── useROI.ts                   — Memoised ROI/forecast/payback computation
├── lib/
│   ├── castai/
│   │   ├── real-api.ts             — CAST AI API fetcher (with proper User-Agent)
│   │   ├── efficiency-adapter.ts   — Maps raw efficiency API to internal types
│   │   └── baseline.ts             — Detects pre-optimisation baseline window
│   ├── calculations/
│   │   ├── roi.ts                  — calculateROI(baseline, actuals) → ROIResult
│   │   ├── forecast.ts             — Linear regression → 30/90-day forecasts
│   │   ├── waste.ts                — Derives over-provisioning waste $ from efficiency
│   │   ├── payback.ts              — Payback period = fee / monthly savings
│   │   └── events.ts               — Detects autoscaler events from cost dips/spikes
│   ├── export/
│   │   └── pdf.ts                  — html2canvas + jsPDF export
│   └── mock-data.ts                — Realistic mock data (used when no API key)
├── types/
│   └── castai.ts                   — All TypeScript interfaces
└── .env.local                      — API key + cluster ID (not committed)
```

---

## Real vs Mock Data

| Data Type | Source | Notes |
|---|---|---|
| Cluster metadata | **Real** (hardcoded in route.ts) | CAST AI `/external-clusters` doesn't expose the fields we need |
| Daily cost history | **Real** | From `/efficiency` endpoint, adapted |
| Efficiency / waste | **Real** | From `/efficiency` endpoint |
| Savings (downscaling) | **Real** | From `/savings` endpoint — $139K over 90 days |
| Workload costs | **Real** | From `/workload-costs` (7-day window) |
| Namespace costs | **Real** | Aggregated from workload-costs |
| Node list | **Real** | From `/nodes` — 43-46 real Azure nodes |
| Autoscaler events | **Derived** | Detected from day-over-day cost dips >12% in efficiency data |
| Rebalancing schedules | **Real** | From `/rebalancing-schedules` org-wide endpoint |
| Spot nodes | **Real** | From `/nodes` spotConfig.isSpot field |

---

## CAST AI API Findings

### Base URL
`https://api.cast.ai/v1`

### Authentication
Header: `X-API-Key: <key>`

### CRITICAL: Cloudflare WAF
The API is behind Cloudflare. Requests **without a proper User-Agent** return HTTP 403.
Always include: `User-Agent: castai-roi-dashboard/1.0` or similar.

### Working Endpoints

| Endpoint | Method | Notes |
|---|---|---|
| `/cost-reports/clusters/{id}/efficiency` | GET | Daily CPU+RAM cost, provisioned/requested/used. String fields. |
| `/cost-reports/clusters/{id}/savings` | GET | Daily downscaling savings + summary. |
| `/cost-reports/clusters/{id}/workload-costs` | GET | Per-workload cost. Max 7-day range. 312 workloads. |
| `/kubernetes/external-clusters/{id}/nodes` | GET | Real node list. 43-46 nodes. spotConfig.isSpot field. |
| `/kubernetes/external-clusters` | GET | Lists all 12 clusters in the org. |
| `/workload-autoscaling/clusters/{id}/policies` | GET | 9 WA policies (managementOption, applyType). |
| `/rebalancing-schedules` | GET | All org-wide rebalancing schedules + jobs per cluster. |

### Not Available / 404

| Endpoint | Why |
|---|---|
| `/autoscaler/policies/{id}` | Different path for external clusters |
| `/rebalancing-plans/{planId}` | Individual plan details 404 |
| `/kubernetes/external-clusters/{id}/lifecycle` | Not exposed |
| `/kubernetes/external-clusters/{id}/node-events` | Not exposed |
| `/audit` | Times out (exists but slow/blocked) |
| `/workload-autoscaling/clusters/{id}/events` | 404 |

---

## Real Data: This Cluster

- **Cluster**: `prod-aks-qes-w` (efef70a7-be26-4ed5-b8fa-91c390dcfce4)
- **Provider**: Azure AKS
- **CAST AI enabled**: 2025-10-01
- **Autoscaler enabled**: 2025-10-03
- **Workload Autoscaler enabled**: 2025-10-05
- **Nodes**: 43-46 (Azure on-demand only — no spot)
- **Instance types**: Standard_E32as_v4, Standard_E8as_v4, Standard_F8s_v2, Standard_E64as_v4, Standard_E20as_v4, Standard_DS3_v2, Standard_E2as_v4
- **CAST AI savings** (90 days): ~$139,002
- **Actual cost** (90 days): ~$138,731
- **ROI**: ~100% (every dollar spent on CAST AI has saved a dollar in cloud costs)
- **Weekly rebalancing**: every Monday midnight CT — last job was Skipped (didn't meet 15% savings threshold)

---

## Autoscaler Event Detection

Since CAST AI doesn't expose a public audit or events API, we derive events from the efficiency time-series data by detecting statistically significant day-over-day cost changes:

- **Scale-down event**: cost drops >12% vs previous day → CAST AI removed nodes
- **Scale-up event**: cost rises >20% vs previous day → demand spike, CAST AI added nodes
- **Weekend pattern**: the cluster shows a repeating ~60-77% cost drop every Sunday and recovery on Monday/Tuesday — consistent with CAST AI weekend downscaling

Over 90 days, we detect approximately:
- **40 scale-down events** (~6 per week, including weekends)
- **36 scale-up events** (recoveries)

This is in `lib/calculations/events.ts` → `detectAutoscalerEvents()`.

---

## Rebalancing Schedules (Real Data)

The `/rebalancing-schedules` endpoint returns org-wide schedules. Our cluster participates in:

| Schedule | Frequency | Savings Threshold | Last Status |
|---|---|---|---|
| Weekly | Every Monday midnight CT | 15% | Skipped |

The cluster also has an **AKS Upgrade** schedule (daily at 9pm CT, `ignoreSavings: true`) but no explicit job was recorded for our cluster ID.

---

## ROI Calculation Methodology

1. **Baseline window**: First 7 days after `workloadAutoscalerEnabledAt + 3 days stabilization buffer`
   - For this cluster: ~2025-10-08 to 2025-10-15
2. **Baseline rates**: `avgDailyCost`, `costPerCpuHour`, `costPerGbHour` from that window
3. **Expected cost**: `baseline.costPerCpuHour × currentCpuHours + baseline.costPerGbHour × currentGbHours`
4. **Total savings**: `expectedCost - actualCost`
5. **ROI%**: `(savings / expectedCost) × 100`

### Caveats / Known Limitations

- The efficiency data uses **provisioned** CPU/RAM hours (not used), which may overstate the "baseline expected cost" — making ROI look higher than reality.
- The baseline window is short (7 days), which means seasonal variance can bias results.
- A more accurate ROI would compare same-period prior year or use CAST AI's own savings metric (which is $139K for this cluster).
- The `cpuCostSpotFallback` field is included in cost calculations — this represents spot fallback costs and is small but real.

---

## Waste Calculation

From the efficiency API's `cpuOverprovisioningPercent` and `ramOverprovisioningPercent` fields in `current`:

```
wastedCpuCores = provisionedCores × overprovisioningPct
costPerHour = wastedCpuCores × costPerCpuProvisioned + wastedRamGb × costPerRamGibProvisioned
wastePerDay = costPerHour × 24
wastePerMonth = wastePerDay × 30
```

---

## Instance Breakdown Fix (Important)

The CAST AI `/nodes` API returns one entry per **physical node**. The dashboard API route condenses these into one object per instance type with a `count` field:

```json
{ "instanceType": "Standard_E32as_v4", "count": 20, "isSpot": false, ... }
```

The `InstanceBreakdown` component was previously counting `+1` per array entry, ignoring `count`. This made all bars show height=1. **Fixed** in `InstanceBreakdown.tsx` to use `n.count ?? 1`.

---

## Forecast Methodology

`lib/calculations/forecast.ts` — linear regression over the last 14 days of actual cost:

- **trendSlope**: daily cost change direction
- **30-day forecast**: extrapolated from current slope
- **Without CAST AI**: projects baseline avg daily cost forward (i.e. "what would it have cost if you never adopted CAST AI")

---

## Dashboard Layout (Top to Bottom)

1. **Header** — cluster name, provider/region, live badge, PDF export button
2. **Timeline** — visual milestones (onboarded, autoscaler on, WA on)
3. **ROI Overview** — total savings, ROI%, monthly savings, months active
4. **Payback Card** — payback period calculator with adjustable monthly fee
5. **ROI Story** — 6-step narrative of how CAST AI saved money
6. **Autoscaler Events** — annotated cost chart + full event log table
7. **Rebalancing Schedules** — active schedules + last job status
8. **Cost Trend + Spot/On-Demand** — 90-day cost line + node type ratio
9. **Usage Growth** — cost vs CPU utilization correlation
10. **Forecast** — 30/90-day projected cost with and without CAST AI
11. **Node Consolidation + Waste Calculator** — current nodes + waste metrics
12. **Instance Breakdown** — bar chart of node types (spot vs on-demand)
13. **Namespace Table + Workload Table** — cost breakdown by namespace/workload

---

## Environment Variables

```
CASTAI_API_KEY=<key>
CASTAI_CLUSTER_ID=<default cluster id for single-cluster mode>
CASTAI_BASE_URL=https://api.cast.ai/v1
```

---

## Running Locally

```bash
npm install
# create .env.local with the vars above
npm run dev   # → http://localhost:3001
```

Visit `/` to see all clusters. Click any cluster to see its dashboard.
PDF export works via the "Export PDF" button in the header.

---

## Known Gaps / Future Improvements

| Gap | Notes |
|---|---|
| Spot nodes = 0% | All nodes are Azure on-demand. Spot chart shows 100% on-demand which is correct. |
| Workload cost window | Only 7 days of workload data available from API. Tables show recent snapshot only. |
| Namespace over-provisioning | Real data doesn't return this per-namespace; shown as 0% for all. |
| Rebalancing plan details | Individual plan IDs 404 — can't show what nodes were moved/replaced. |
| Multi-cluster view | Home page lists all 12 clusters but individual dashboards open per-cluster. |
| Node metrics are static | `cpuCores`, `memoryGb`, `costPerHour` in the nodes case are hardcoded estimates (no real price data from the nodes API). |
| Autoscaler events are derived | Not a real event log — threshold-based detection from cost deltas. May miss slow/gradual scaling or flag noise. |
