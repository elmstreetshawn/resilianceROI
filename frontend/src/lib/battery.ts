// Assumptions behind the "Help me decide" numbers. Kept in one place so they are
// easy to audit and change; every figure shown to the customer traces back here.

/** Usable capacity of one Base home battery (kWh). ASSUMPTION: confirm with Base. */
export const BATTERY_KWH = 25;

/** Share of a home's average load that is "essentials" (fridge, lights, Wi-Fi, fans). */
export const ESSENTIALS_SHARE = 0.35;

/** Typical Texas home, used when the customer skips the usage step (EIA RECS). */
export const DEFAULT_MONTHLY_KWH = 1150;

const HOURS_PER_MONTH = 730;

export function backupHours(monthlyKwh: number) {
  const avgKw = monthlyKwh / HOURS_PER_MONTH;
  return {
    wholeHome: BATTERY_KWH / avgKw,
    essentials: BATTERY_KWH / (avgKw * ESSENTIALS_SHARE),
  };
}

/** Rough out-of-pocket cost of one long outage without backup. */
export const OUTAGE_COSTS = [
  { label: 'Spoiled fridge & freezer food', amount: 250 },
  { label: 'Hotel for 2 nights', amount: 300 },
  { label: 'Eating out while the power is off', amount: 150 },
];
export const OUTAGE_COST_TOTAL = OUTAGE_COSTS.reduce((s, c) => s + c.amount, 0);
