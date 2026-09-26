import { describe, expect, it } from 'vitest';
import { BATTERY_KWH, ESSENTIALS_SHARE, OUTAGE_COST_TOTAL, OUTAGE_COSTS, backupHours } from './battery';

describe('backupHours', () => {
  it('gives more essentials-only hours than whole-home hours', () => {
    const { wholeHome, essentials } = backupHours(1000);
    expect(essentials).toBeGreaterThan(wholeHome);
  });

  it('scales inversely with monthly usage', () => {
    const low = backupHours(500);
    const high = backupHours(2000);
    expect(low.wholeHome).toBeGreaterThan(high.wholeHome);
    expect(low.essentials).toBeGreaterThan(high.essentials);
  });

  it('essentials hours = wholeHome / ESSENTIALS_SHARE', () => {
    const { wholeHome, essentials } = backupHours(1200);
    expect(essentials).toBeCloseTo(wholeHome / ESSENTIALS_SHARE, 5);
  });

  it('matches a hand-computed value at a known usage', () => {
    // avgKw = 730 kWh / 730 h = 1 kW -> wholeHome = BATTERY_KWH / 1kW = BATTERY_KWH hours
    const { wholeHome } = backupHours(730);
    expect(wholeHome).toBeCloseTo(BATTERY_KWH, 5);
  });
});

describe('OUTAGE_COST_TOTAL', () => {
  it('is the sum of the itemized costs', () => {
    const sum = OUTAGE_COSTS.reduce((s, c) => s + c.amount, 0);
    expect(OUTAGE_COST_TOTAL).toBe(sum);
  });
});
