# CAST AI ROI Dashboard

A TAM tool for tracking CAST AI ROI across customer organizations. Built for honesty — every metric is sourced from real data, and limitations are shown, not hidden.

## Philosophy

Standard cloud optimization dashboards fabricate "without optimization" baselines by inflating current costs. This tool takes a different approach:

- **No made-up numbers.** Every metric comes from actual API data — either the CAST AI efficiency API or the savings API.
- **Before vs after, not hypothetical vs actual.** We compare real pre-CAST AI spend (from the monitoring-only period) to real post-optimization spend.
- **Limitations are visible.** If a cluster has only 4 days of baseline data, you see that. If there's no baseline at all, the dashboard says so rather than fabricating one.
- **Tiered confidence.** Strong baseline (≥14 days pre-CAST data), weak (3–13 days), none. ROI calculations default to strong-baseline clusters only.

## Problem Statement

TAMs need to demonstrate CAST AI value to customers with honest, defensible data — especially at renewal time. Customers are skeptical of vendor-reported savings because most vendors inflate numbers. This tool gives TAMs a data-backed story they can confidently present.

## Methodology

### Data Sources

All data comes from the CAST AI API:

- **Efficiency API** — daily resource provisioning, usage, and cost breakdowns per cluster
- **Savings API** — CAST AI's modeled savings (spot vs on-demand, downscaling)
- **Cluster API** — metadata including `createdAt` and `firstOperationAt` timestamps

### Baseline Detection

The pre-CAST AI baseline period is derived from two timestamps:

1. `createdAt` — when the cluster was first registered with CAST AI (monitoring begins)
2. `firstOperationAt` — when CAST AI first took an optimization action

The gap between these dates is the baseline period — real spend data before any optimization. This is the only honest way to establish a "before" picture.

### Baseline Quality Tiers

| Tier | Days | Confidence |
|------|------|------------|
| **Strong** | ≥14 days | High — enough data for reliable daily averages |
| **Weak** | 3–13 days | Directionally valid but noisy |
| **None** | <3 days | No pre-CAST comparison possible |

### ROI Computation

For each cluster with baseline data:
- **Baseline daily cost** = average $/day from efficiency API during `createdAt → firstOperationAt`
- **Current daily cost** = average $/day from efficiency API during `firstOperationAt → now`
- **Daily savings** = baseline daily cost − current daily cost
- **Monthly run rate** = daily savings × 30
- **Annual projection** = daily savings × 365

Org-level ROI aggregates across clusters, weighted by actual spend. The ROI calculator defaults to strong-baseline clusters only, with toggle buttons to progressively include weaker data.

### Forecasting

Uses weighted moving average of recent daily costs — not linear regression. This avoids extrapolating trends that may not continue. Forecasts are clearly labeled as projections based on current run rate.

### API Chunking

The CAST AI efficiency API has a 365-day limit per request. For clusters older than a year, we chunk requests into 365-day windows and stitch the results together.

## Architecture

- **Framework:** Next.js 16 with App Router
- **Charts:** Recharts
- **Data fetching:** SWR with 60s deduplication
- **Styling:** Tailwind CSS
- **Deployment:** Vercel (serverless)
- **Persistence:** None — all data is fetched on demand from CAST AI APIs

### Key Design Decisions

- **No database.** Data is always fresh from the source. Trade-off: if CAST AI purges old data, we lose it.
- **Request-driven.** Every page load fetches current data. SWR caches in-memory for the session.
- **Server-side API calls.** API keys never reach the browser. All CAST AI calls go through Next.js API routes.

## What's Done

- **Org dashboard** — multi-cluster overview with savings, efficiency, baseline quality per cluster
- **Per-cluster detail** — three views (Client Partner, Report, Technical) with daily cost charts, efficiency trends, autoscaler events, node analysis, workload costs
- **Multi-org support** — add orgs dynamically with API keys
- **Tiered ROI calculator** — org-level ROI with baseline confidence filtering
- **Forecast** — 30/90 day cost projections from weighted moving average
- **Efficiency tracking** — CPU/RAM provisioned vs requested vs used, overprovisioning detection
- **Node analysis** — pre-CAST vs now comparison of provisioned capacity, spot %, overprovisioning
- **Export** — PDF export and print-friendly report view

## What's To Be Done

- **Data snapshot/persistence layer** — store historical data points so we don't depend on API retention
- **Customer health scoring** — aggregate metrics into a simple health score per org
- **Onboarding tracker** — track new cluster onboarding progress and time-to-value
- **Multi-customer portfolio view** — TAM view across all their customer orgs
- **Alerting** — notify when a cluster's efficiency degrades or savings drop

## Limitations

- **No persistence.** If CAST AI purges historical efficiency data, that data is gone. We only have what the API returns right now.
- **Daily granularity only.** The efficiency API returns daily aggregates, not hourly. Short-lived spikes are smoothed out.
- **API rate limits.** Large orgs with many clusters may hit CAST AI rate limits during initial load. SWR deduplication helps but doesn't eliminate this.
- **Sparse data.** Some clusters have gaps in efficiency data (maintenance windows, connectivity issues). We compute averages from available data points only.
- **Baseline depends on monitoring gap.** If a customer connected CAST AI and immediately enabled optimization (no monitoring-only period), there's no baseline.
- **Savings API baseline is hypothetical.** The CAST AI savings API compares against an all-on-demand baseline, which may overstate savings if the customer already used spot instances. The efficiency-based before/after comparison is more honest — that's why it's the primary metric.

## Development

```bash
npm install
npm run dev
```

Create `.env.local` with your CAST AI API key:

```
CASTAI_API_KEY=your-key-here
```

## Deployment

```bash
npx vercel --prod
```

Live at: https://castai-roi-dashboard.vercel.app
