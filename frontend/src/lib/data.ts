import Papa from 'papaparse';

// ---------- Types ----------

export interface Reliability {
  utility: string;
  year: number;
  saidi_minutes: number;
  saifi_times: number | null;
  saidi_minutes_no_major_events: number | null;
  source: string;
}

export interface Plan {
  utility: string;
  company: string;
  product: string;
  kwh500: number;
  kwh1000: number;
  kwh2000: number;
  rate_type: string;
  term_months: number;
  renewable_pct: number;
  prepaid: boolean;
  time_of_use: boolean;
  min_usage: boolean;
  fees_credits: string;
  cancel_fee: string;
  facts_url: string;
}

export interface ZipRow {
  zip: string;
  city: string;
  utility: string;
}

export interface UtilityInfo {
  code: string;
  name: string;
  // Can the customer pick a retail provider (deregulated area)?
  choice: boolean;
  region: string;
}

// ---------- Static utility metadata ----------

export const UTILITIES: Record<string, UtilityInfo> = {
  ONCOR: { code: 'ONCOR', name: 'Oncor', choice: true, region: 'Dallas–Fort Worth & Central Texas' },
  CENTERPOINT: { code: 'CENTERPOINT', name: 'CenterPoint', choice: true, region: 'Greater Houston' },
  AEP_CENTRAL: { code: 'AEP_CENTRAL', name: 'AEP Texas Central', choice: true, region: 'Corpus Christi & the Valley' },
  AEP_NORTH: { code: 'AEP_NORTH', name: 'AEP Texas North', choice: true, region: 'Abilene & West Central Texas' },
  TNMP: { code: 'TNMP', name: 'TNMP', choice: true, region: 'Galveston County & North Texas' },
  LPL: { code: 'LPL', name: 'Lubbock Power & Light', choice: true, region: 'Lubbock' },
  AUSTIN_ENERGY: { code: 'AUSTIN_ENERGY', name: 'Austin Energy', choice: false, region: 'City of Austin' },
  CPS: { code: 'CPS', name: 'CPS Energy', choice: false, region: 'San Antonio' },
  PEDERNALES: { code: 'PEDERNALES', name: 'Pedernales Electric Co-op', choice: false, region: 'Hill Country' },
  BLUEBONNET: { code: 'BLUEBONNET', name: 'Bluebonnet Electric Co-op', choice: false, region: 'Central Texas' },
};

// Major events that explain the spikes in the reliability data
export const MAJOR_EVENTS: Record<number, string> = {
  2021: 'Winter Storm Uri',
  2023: 'Winter Storm Mara',
  2024: 'Hurricane Beryl & derecho',
};

// ---------- CSV loading ----------

const cache = new Map<string, Promise<unknown[]>>();

function loadCsv<T>(file: string): Promise<T[]> {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(`${import.meta.env.BASE_URL}data/${file}`)
        .then(r => {
          if (!r.ok) throw new Error(`Failed to load ${file}`);
          return r.text();
        })
        .then(text => Papa.parse<T>(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data),
    );
  }
  return cache.get(file) as Promise<T[]>;
}

export const loadReliability = () => loadCsv<Reliability>('utility_reliability.csv');
// Booleans may arrive as "True"/"False" strings; normalize so filters can't be fooled
const bool = (v: unknown) => v === true || String(v).toLowerCase() === 'true';
export const loadPlans = () =>
  loadCsv<Plan>('plans.csv').then(rows =>
    rows.map(p => ({ ...p, prepaid: bool(p.prepaid), time_of_use: bool(p.time_of_use), min_usage: bool(p.min_usage) })),
  );
// dynamicTyping would turn ZIPs into numbers, so normalize back to strings
export const loadZips = () =>
  loadCsv<ZipRow>('zip_utility.csv').then(rows => rows.map(r => ({ ...r, zip: String(r.zip) })));

// ---------- Lookups ----------

/** Utility from the URL param if Base already passed one, else the ZIP table. */
export async function resolveUtility(
  zip: string,
  utilityParam?: string | null,
): Promise<{ info: UtilityInfo | null; city: string | null }> {
  const zips = await loadZips();
  const row = zips.find(z => z.zip === zip);
  const code = (utilityParam || row?.utility || '').toUpperCase();
  // Record<string, UtilityInfo> indexing is typed as always-present, so without this
  // explicit return type, TS infers `info: UtilityInfo` (never null) here - masking
  // the real, exercised null case (unmapped ZIP) that NewFunnel.tsx already checks for.
  return { info: UTILITIES[code] ?? null, city: row?.city ?? null };
}

export async function reliabilityFor(utility: string) {
  const rows = await loadReliability();
  return rows.filter(r => r.utility === utility).sort((a, b) => a.year - b.year);
}

// ---------- Plan math (PowerToChoose-style) ----------

/**
 * Average ¢/kWh at a given monthly usage. PowerToChoose publishes the EFL price at
 * 500, 1000 and 2000 kWh; interpolate linearly between those points and clamp outside.
 */
export function priceAt(plan: Plan, kwh: number): number {
  const pts: [number, number][] = [
    [500, plan.kwh500],
    [1000, plan.kwh1000],
    [2000, plan.kwh2000],
  ];
  if (kwh <= 500) return plan.kwh500;
  if (kwh >= 2000) return plan.kwh2000;
  const i = kwh <= 1000 ? 0 : 1;
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  return y0 + ((y1 - y0) * (kwh - x0)) / (x1 - x0);
}

export const monthlyBill = (plan: Plan, kwh: number) => priceAt(plan, kwh) * kwh;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function plansFor(utility: string) {
  const plans = await loadPlans();
  return plans.filter(p => p.utility === utility && p.kwh500 && p.kwh1000 && p.kwh2000);
}

/**
 * Minimum-usage "traps": plans whose advertised 1000 kWh price looks great but whose
 * price jumps when usage falls below a threshold (a fee or a lost bill credit).
 */
export function minUsageTraps(plans: Plan[]) {
  return plans
    .filter(p => p.min_usage)
    .map(p => ({ plan: p, jumpPct: (p.kwh500 / p.kwh1000 - 1) * 100 }))
    .sort((a, b) => b.jumpPct - a.jumpPct);
}
