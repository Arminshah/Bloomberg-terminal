// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { describe, expect, it } from 'vitest';
import { ECST_COUNTRIES, currentAndPrevious, ecstTree, history, tickerOf, type StatDef } from '../src/data/ecst';
import type { Obs } from '../src/data/live/fred';

const monthly: Obs = [
  ['2025-08-01', 300],
  ['2025-09-01', 301.5],
  ['2026-07-01', 309],
  ['2026-08-01', 310.545],
  ['2026-09-01', 311.166],
];

describe("ECST's figures", () => {
  it('works out a monthly change from the published index, with the month before as Previous', () => {
    const def: StatDef = { label: 'CPI (mom %, sa)', series: 'CPIAUCSL', calc: 'mom', freq: 'm', dec: 1, source: 'BLS' };
    const { cur, prev } = currentAndPrevious(def, monthly);
    expect(cur!.v).toBeCloseTo((311.166 / 310.545 - 1) * 100, 10);
    expect(cur!.period).toBe('Sep 2026');
    expect(prev!.v).toBeCloseTo((310.545 / 309 - 1) * 100, 10);
    expect(prev!.period).toBe('Aug 2026');
  });

  it('works out a yearly change, and has no Previous when the year before it is missing', () => {
    const def: StatDef = { label: 'CPI (yoy %)', series: 'CPIAUCNS', calc: 'yoy', freq: 'm', dec: 1, source: 'BLS' };
    const { cur, prev } = currentAndPrevious(def, monthly);
    expect(cur!.v).toBeCloseTo((311.166 / 301.5 - 1) * 100, 10);
    expect(prev!.v).toBeCloseTo((310.545 / 300 - 1) * 100, 10);
    expect(currentAndPrevious(def, monthly.slice(1)).prev).toBeNull();
  });

  it('names a quarter as the terminal does, and a daily series by its last two days', () => {
    const q: StatDef = { label: 'Real GDP (qoq %, saar)', series: 'A191RL1Q225SBEA', calc: 'level', freq: 'q', dec: 1, source: 'BEA' };
    const { cur, prev } = currentAndPrevious(q, [['2026-04-01', 3.8], ['2026-07-01', 2.9]]);
    expect(cur).toMatchObject({ v: 2.9, period: 'Q3 2026' });
    expect(prev).toMatchObject({ v: 3.8, period: 'Q2 2026' });
    const d: StatDef = { label: '10-Year Treasury Yield (%)', series: 'DGS10', calc: 'level', freq: 'd', dec: 2, source: 'Fed' };
    const daily = currentAndPrevious(d, [['2026-10-29', 4.91], ['2026-10-30', 4.94]]);
    expect(daily.cur!.v).toBe(4.94);
    expect(daily.prev!.v).toBe(4.91);
    expect(currentAndPrevious(d, undefined)).toEqual({ cur: null, prev: null });
    // A rate set in steps: the level and the day it took effect, and the level before it.
    const target: StatDef = { ...d, label: 'Fed Funds Target Rate, Upper Bound (%)', series: 'DFEDTARU', step: true };
    const steps = currentAndPrevious(target, [['2026-09-16', 4.5], ['2026-09-17', 4.25], ['2026-09-18', 4.25], ['2026-10-29', 4], ['2026-10-30', 4], ['2026-10-31', 4]]);
    expect(steps.cur).toMatchObject({ v: 4, at: '2026-10-29' });
    expect(steps.prev).toMatchObject({ v: 4.25, at: '2026-09-17' });
  });

  it('charts the figure as worked out, oldest first, over the years asked for', () => {
    const def: StatDef = { label: 'Claims', series: 'ICSA', calc: 'level', freq: 'w', dec: 0, scale: 0.001, source: 'DOL' };
    const h = history(def, [['2019-01-05', 220000], ['2026-10-24', 231000]], 5);
    expect(h).toEqual([{ t: Date.parse('2026-10-24T00:00:00Z'), v: 231 }]);
  });
});

describe("ECST's categories", () => {
  it('gives the United States its tree, Key Indicators first', () => {
    const us = ecstTree('US');
    expect(us.map((c) => c.name)).toEqual(['Key Indicators', 'National Accounts (GDP)', 'Prices', 'Labor Market', 'Retail & Wholesale Sector', 'Industrial Sector', 'Housing and Real Estate', 'Intl Trade & BoP', 'Monetary Sector', 'Financial Indicators']);
    expect(us[0].sections.map((s) => s.title)).toContain('National Accounts');
    expect(us[0].sections[0].rows[0].label).toBe('Real GDP (qoq %, saar)');
  });

  it("gives other countries what their statistics offices publish, and no category without a figure", () => {
    expect(ecstTree('DE')[0].sections.flatMap((s) => s.rows.map((r) => r.label))).toEqual(['Real GDP (yoy %)', 'HICP (yoy %)', 'Unemployment Rate (%)']);
    // Japan's inflation is not connected: no Prices category.
    expect(ecstTree('JP').map((c) => c.name)).toEqual(['Key Indicators', 'National Accounts (GDP)', 'Labor Market']);
    expect(ecstTree('JP')[0].sections[0].rows[0].note).toMatch(/worked out/i);
    expect(ecstTree('XX')).toEqual([]);
    expect(ECST_COUNTRIES).toContain('GB');
  });

  it("shows each series by its source's own code", () => {
    expect(tickerOf('ESTAT:HICP:DE')).toBe('Eurostat HICP DE');
    expect(tickerOf('ONS:IHYR')).toBe('ONS IHYR');
    expect(tickerOf('UNRATE')).toBe('UNRATE');
  });
});
