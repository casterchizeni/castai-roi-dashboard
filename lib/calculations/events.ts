/**
 * Detects CAST AI autoscaler events by analysing cost and resource changes
 * in the efficiency time-series data.
 *
 * Since CAST AI does not expose a public audit/events API, we derive events
 * by detecting statistically significant day-over-day changes in cost and
 * CPU provisioning. A large drop = scale-down (savings event).
 * A large rise = scale-up (demand response event).
 */

export type EventType =
  | 'scale_down'   // CAST AI removed nodes (cost dropped)
  | 'scale_up'     // CAST AI added nodes (demand spike)
  | 'weekend_down' // Predictable weekly pattern — weekend scale-down
  | 'weekend_up';  // Monday scale-back-up

export interface AutoscalerEvent {
  date: string;
  type: EventType;
  label: string;
  costBefore: number;
  costAfter: number;
  changePct: number;
  cpuHoursDelta: number;
  savingsFromEvent: number;
  dayOfWeek: string;
}

function dayName(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

interface EfficiencyDay {
  timestamp: string;
  cpuCostOnDemand: string;
  cpuCostSpot: string;
  ramCostOnDemand: string;
  ramCostSpot: string;
  cpuCountOnDemand: string;
  cpuCountSpot: string;
}

export function detectAutoscalerEvents(
  items: EfficiencyDay[],
  dropThresholdPct = 7,    // flag if cost drops more than 7%
  riseThresholdPct = 20    // flag if cost rises more than 20%
): AutoscalerEvent[] {
  const sorted = [...items].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const events: AutoscalerEvent[] = [];

  // Calculate the median daily cost so we can set a meaningful minimum $ threshold.
  // Tiny clusters ($1/day) produce noisy events from normal variance — ignore those.
  const allCosts = sorted.map((item) =>
    parseFloat(item.cpuCostOnDemand) + parseFloat(item.ramCostOnDemand) +
    parseFloat(item.cpuCostSpot) + parseFloat(item.ramCostSpot)
  ).filter((c) => c > 0);
  const medianCost = allCosts.length
    ? [...allCosts].sort((a, b) => a - b)[Math.floor(allCosts.length / 2)]
    : 0;
  // Minimum absolute drop required to be flagged as an event: $5 or 1% of median, whichever is larger
  const minAbsoluteDrop = Math.max(5, medianCost * 0.01);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const prevCost = parseFloat(prev.cpuCostOnDemand) + parseFloat(prev.ramCostOnDemand) +
                     parseFloat(prev.cpuCostSpot) + parseFloat(prev.ramCostSpot);
    const currCost = parseFloat(curr.cpuCostOnDemand) + parseFloat(curr.ramCostOnDemand) +
                     parseFloat(curr.cpuCostSpot) + parseFloat(curr.ramCostSpot);

    if (prevCost <= 0) continue;
    // Ignore changes too small to be meaningful (noise in small clusters)
    if (Math.abs(prevCost - currCost) < minAbsoluteDrop) continue;

    const changePct = ((currCost - prevCost) / prevCost) * 100;
    const prevCpu = parseFloat(prev.cpuCountOnDemand) + parseFloat(prev.cpuCountSpot);
    const currCpu = parseFloat(curr.cpuCountOnDemand) + parseFloat(curr.cpuCountSpot);
    const cpuDelta = currCpu - prevCpu;

    const date = curr.timestamp.slice(0, 10);
    const dow = dayName(date);

    if (changePct < -dropThresholdPct) {
      const isWeekend = dow === 'Monday'; // Monday = came back after weekend scale-down
      events.push({
        date,
        type: isWeekend ? 'weekend_down' : 'scale_down',
        label: isWeekend
          ? `Weekend scale-down (${Math.abs(changePct).toFixed(0)}% cost drop)`
          : `Autoscaler scale-down (${Math.abs(changePct).toFixed(0)}% cost drop)`,
        costBefore: prevCost,
        costAfter: currCost,
        changePct,
        cpuHoursDelta: cpuDelta,
        savingsFromEvent: prevCost - currCost,
        dayOfWeek: dow,
      });
    } else if (changePct > riseThresholdPct) {
      const isMonday = dow === 'Tuesday'; // Tuesday after weekend = scale back up
      events.push({
        date,
        type: isMonday ? 'weekend_up' : 'scale_up',
        label: isMonday
          ? `Scale back up after weekend (${changePct.toFixed(0)}% cost rise)`
          : `Autoscaler scale-up — demand spike (${changePct.toFixed(0)}% cost rise)`,
        costBefore: prevCost,
        costAfter: currCost,
        changePct,
        cpuHoursDelta: cpuDelta,
        savingsFromEvent: 0,
        dayOfWeek: dow,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

