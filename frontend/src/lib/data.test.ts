import { describe, expect, it } from 'vitest';
import { median, minUsageTraps, monthlyBill, priceAt, type Plan } from './data';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    utility: 'ONCOR',
    company: 'Test Co',
    product: 'Test Plan',
    kwh500: 0.16,
    kwh1000: 0.14,
    kwh2000: 0.13,
    rate_type: 'Fixed',
    term_months: 12,
    renewable_pct: 0,
    prepaid: false,
    time_of_use: false,
    min_usage: false,
    fees_credits: '',
    cancel_fee: '',
    facts_url: '',
    ...overrides,
  };
}

describe('priceAt', () => {
  const p = plan();

  it('returns the exact published price at 500/1000/2000 kWh', () => {
    expect(priceAt(p, 500)).toBe(0.16);
    expect(priceAt(p, 1000)).toBe(0.14);
    expect(priceAt(p, 2000)).toBe(0.13);
  });

  it('clamps below 500 kWh to the 500 kWh price', () => {
    expect(priceAt(p, 100)).toBe(0.16);
  });

  it('clamps above 2000 kWh to the 2000 kWh price', () => {
    expect(priceAt(p, 5000)).toBe(0.13);
  });

  it('interpolates linearly between 500 and 1000', () => {
    expect(priceAt(p, 750)).toBeCloseTo(0.15, 5);
  });

  it('interpolates linearly between 1000 and 2000', () => {
    expect(priceAt(p, 1500)).toBeCloseTo(0.135, 5);
  });
});

describe('monthlyBill', () => {
  it('is price-per-kWh times kWh', () => {
    const p = plan({ kwh1000: 0.14 });
    expect(monthlyBill(p, 1000)).toBeCloseTo(140, 5);
  });
});

describe('median', () => {
  it('returns 0 for an empty list', () => {
    expect(median([])).toBe(0);
  });
  it('returns the middle value for an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('averages the two middle values for an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('minUsageTraps', () => {
  it('excludes plans without a minimum-usage fee', () => {
    const plans = [plan({ min_usage: false })];
    expect(minUsageTraps(plans)).toHaveLength(0);
  });

  it('computes the % price jump from 1000 kWh to 500 kWh for flagged plans', () => {
    const p = plan({ min_usage: true, kwh500: 0.2, kwh1000: 0.1 });
    const traps = minUsageTraps([p]);
    expect(traps).toHaveLength(1);
    expect(traps[0].jumpPct).toBeCloseTo(100, 5); // 0.2/0.1 - 1 = 100%
  });

  it('sorts the worst jump first', () => {
    const mild = plan({ min_usage: true, kwh500: 0.11, kwh1000: 0.1, product: 'mild' });
    const severe = plan({ min_usage: true, kwh500: 0.3, kwh1000: 0.1, product: 'severe' });
    const traps = minUsageTraps([mild, severe]);
    expect(traps[0].plan.product).toBe('severe');
  });
});
