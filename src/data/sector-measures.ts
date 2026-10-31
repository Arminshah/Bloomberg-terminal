// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * The standard relative measures of the commodity sector pages (AGS, MINE, GAS, OIL), worked out from the
 * front-month contracts' own prices: a ratio of two prices, or the spread between two in the same unit. Each is
 * worked out on the days both contracts closed, never on a day one of them lacks.
 */

export interface Measure {
  id: string;
  name: string;
  /** How it is worked out, in words: "GC1 ÷ SI1". */
  formula: string;
  a: string;
  b: string;
  kind: 'ratio' | 'spread';
  /** The unit of a spread, or of a ratio of unlike units. */
  unit: string;
  dec: number;
  /** What it is read for, in a sentence. */
  about: string;
}

/** The measures each sector page shows, by the page's function code. */
export const SECTOR_MEASURES: Record<string, Measure[]> = {
  OILMARKET: [
    { id: 'brent-wti', name: 'Brent − WTI spread', formula: 'CO1 − CL1', a: 'CO1 Comdty', b: 'CL1 Comdty', kind: 'spread', unit: 'USD/bbl.', dec: 2, about: 'The premium of the seaborne benchmark over the US inland one.' },
    { id: 'crack-ho', name: 'Heating oil − WTI', formula: 'HO1 × 42 − CL1', a: 'HO1 Comdty', b: 'CL1 Comdty', kind: 'spread', unit: 'USD/bbl.', dec: 2, about: 'A distillate crack spread: heating oil in dollars a barrel (42 gallons) less crude.' },
    { id: 'crack-rb', name: 'Gasoline − WTI', formula: 'XB1 × 42 − CL1', a: 'XB1 Comdty', b: 'CL1 Comdty', kind: 'spread', unit: 'USD/bbl.', dec: 2, about: 'A gasoline crack spread: RBOB in dollars a barrel (42 gallons) less crude.' },
  ],
  NATURALGAS: [
    { id: 'oil-gas', name: 'Crude to gas ratio', formula: 'CL1 ÷ NG1', a: 'CL1 Comdty', b: 'NG1 Comdty', kind: 'ratio', unit: 'MMBtu per bbl.', dec: 2, about: 'Dollars a barrel of crude over dollars a million British thermal units of gas.' },
  ],
  METALS: [
    { id: 'gold-silver', name: 'Gold to silver ratio', formula: 'GC1 ÷ SI1', a: 'GC1 Comdty', b: 'SI1 Comdty', kind: 'ratio', unit: '', dec: 2, about: 'Ounces of silver for one ounce of gold.' },
    { id: 'gold-platinum', name: 'Gold to platinum ratio', formula: 'GC1 ÷ PL1', a: 'GC1 Comdty', b: 'PL1 Comdty', kind: 'ratio', unit: '', dec: 3, about: 'Ounces of platinum for one ounce of gold.' },
  ],
  AGRICULTURE: [
    { id: 'soy-corn', name: 'Soybean to corn ratio', formula: 'S 1 ÷ C 1', a: 'S 1 Comdty', b: 'C 1 Comdty', kind: 'ratio', unit: '', dec: 3, about: 'Read by farmers choosing what to plant: both in cents a bushel.' },
    { id: 'wheat-corn', name: 'Wheat − corn spread', formula: 'W 1 − C 1', a: 'W 1 Comdty', b: 'C 1 Comdty', kind: 'spread', unit: 'USd/bu.', dec: 2, about: 'The premium of wheat over corn, both in cents a bushel.' },
  ],
};

/** The value of a measure from the two prices; products in gallons are put in barrels (42 US gallons). */
export function measureValue(m: Measure, a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return NaN;
  const perBarrel = m.formula.includes('× 42') ? 42 : 1;
  return m.kind === 'ratio' ? a / b : a * perBarrel - b;
}

export interface MeasureStats {
  last: number;
  /** The value at the previous closes of both. */
  previous: number;
  /** Over the last year of days both closed: low, high, mean and where the latest close stands (0 low, 1 high). */
  low: number;
  high: number;
  mean: number;
  position: number;
  days: number;
}

const DAY_MS = 86_400_000;

/**
 * The measure now and over the year: from the two daily close histories (time in ms, close), on the days both
 * have, within 365 days of the latest such day. NaN parts when there is no such day.
 */
export function measureStats(m: Measure, now: { a: number; b: number; prevA: number; prevB: number }, histA: readonly { t: number; c: number }[], histB: readonly { t: number; c: number }[]): MeasureStats {
  const day = (t: number) => Math.floor(t / DAY_MS);
  const bByDay = new Map(histB.filter((x) => x.c > 0).map((x) => [day(x.t), x.c]));
  const both = histA.filter((x) => x.c > 0 && bByDay.has(day(x.t))).map((x) => ({ d: day(x.t), v: measureValue(m, x.c, bByDay.get(day(x.t))!) }));
  const lastDay = both.length ? both[both.length - 1].d : NaN;
  const year = both.filter((x) => x.d > lastDay - 365).map((x) => x.v);
  const low = year.length ? Math.min(...year) : NaN;
  const high = year.length ? Math.max(...year) : NaN;
  const last = measureValue(m, now.a, now.b);
  return {
    last,
    previous: measureValue(m, now.prevA, now.prevB),
    low,
    high,
    mean: year.length ? year.reduce((s, v) => s + v, 0) / year.length : NaN,
    position: high > low && Number.isFinite(last) ? Math.min(1, Math.max(0, (last - low) / (high - low))) : NaN,
    days: year.length,
  };
}
