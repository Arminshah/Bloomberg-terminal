import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { monthlyShares } from '../src/data/anr';
import { RecommendationBars } from '../src/functions/ANR';
import { settings } from '../src/terminal/settings';

// Finnhub's /stock/recommendation for Microsoft on 31 October 2026, newest first as the source sorts it.
const MSFT = [
  { period: '2026-10-01', strongBuy: 22, buy: 40, hold: 3, sell: 0, strongSell: 0 },
  { period: '2026-09-01', strongBuy: 23, buy: 41, hold: 5, sell: 0, strongSell: 0 },
  { period: '2026-08-01', strongBuy: 23, buy: 41, hold: 5, sell: 0, strongSell: 0 },
  { period: '2026-07-01', strongBuy: 23, buy: 40, hold: 5, sell: 0, strongSell: 0 },
];
// In the form of Yahoo's recommendationTrend, months relative to its snapshot, newest first (0m holds Finnhub's counts
// for Apple of 1 October 2026; the earlier months are made up for the test).
const RELATIVE = [
  { period: '0m', strongBuy: 11, buy: 20, hold: 14, sell: 3, strongSell: 1 },
  { period: '-1m', strongBuy: 10, buy: 20, hold: 15, sell: 2, strongSell: 1 },
  { period: '-2m', strongBuy: 10, buy: 21, hold: 15, sell: 2, strongSell: 0 },
  { period: '-3m', strongBuy: 9, buy: 21, hold: 15, sell: 2, strongSell: 0 },
];

describe("ANR's monthly bars: the shares of buys, holds and sells", () => {
  it('gives each month the source gives, oldest first, labelled by month with its year', () => {
    const bars = monthlyShares(MSFT);
    expect(bars.map((b) => [b.period, b.label, b.year])).toEqual([
      ['2026-07-01', 'Jul', '2026'],
      ['2026-08-01', 'Aug', '2026'],
      ['2026-09-01', 'Sep', '2026'],
      ['2026-10-01', 'Oct', '2026'],
    ]);
    // October: 22 strong buys and 40 buys of 65 ratings.
    expect(bars[3]).toMatchObject({ buys: 62, holds: 3, sells: 0, total: 65 });
    expect(bars[3].buyPct).toBeCloseTo((62 / 65) * 100, 10);
    expect(bars[3].holdPct).toBeCloseTo((3 / 65) * 100, 10);
    expect(bars[3].sellPct).toBe(0);
    expect(bars[0].buyPct).toBeCloseTo((63 / 68) * 100, 10);
  });

  it('counts strong buys with buys and strong sells with sells, the three adding up to 100', () => {
    const [now] = monthlyShares([RELATIVE[0]]);
    expect(now).toMatchObject({ buys: 31, holds: 14, sells: 4, total: 49 });
    expect(now.buyPct).toBeCloseTo((31 / 49) * 100, 10);
    expect(now.holdPct).toBeCloseTo((14 / 49) * 100, 10);
    expect(now.sellPct).toBeCloseTo((4 / 49) * 100, 10);
    for (const b of monthlyShares([...MSFT, ...RELATIVE.slice(1)])) expect(b.buyPct + b.holdPct + b.sellPct).toBeCloseTo(100, 10);
  });

  it("keeps Yahoo's relative months relative, oldest first", () => {
    expect(monthlyShares(RELATIVE).map((b) => [b.label, b.year])).toEqual([
      ['-3m', ''],
      ['-2m', ''],
      ['-1m', ''],
      ['0m', ''],
    ]);
  });

  it('keeps a month without ratings as a gap and leaves out a period with no place on the axis', () => {
    const bars = monthlyShares([
      { period: '2026-10-01', strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
      { period: '2026-09-01', strongBuy: 1, buy: 0, hold: 1, sell: 0, strongSell: 0 },
      { period: '2026-13-01', strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 },
      { period: 'latest', strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 },
      { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 },
    ]);
    expect(bars.map((b) => b.period)).toEqual(['2026-09-01', '2026-10-01']);
    expect(bars[0].buyPct).toBe(50);
    expect(bars[1].total).toBe(0);
    expect(bars[1].buyPct).toBeNaN();
    expect(bars[1].holdPct).toBeNaN();
    expect(bars[1].sellPct).toBeNaN();
  });
});

describe("ANR's monthly bars on ANALYSTS", () => {
  afterEach(() => settings.set((s) => ({ ...s, scheme: 'default' })));
  const render = (months: typeof MSFT, source: string) => renderToStaticMarkup(createElement(RecommendationBars, { months, source }));
  const heights = (html: string, fill: string) => [...html.matchAll(new RegExp(`<rect [^>]*width="40" height="([\\d.]+)" fill="${fill}"`, 'g'))].map((m) => Number(m[1]));

  it('stacks %Buy green at the bottom, %Hold khaki, %Sell dark red on top, one bar a month, with the legend and a note', () => {
    const html = render(MSFT, 'Finnhub');
    expect([...html.matchAll(/data-period="([^"]+)"/g)].map((m) => m[1])).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    // The bars stand 96 pixels high: October's buys are 62 of 65 ratings.
    expect(heights(html, '#00a220')[3]).toBeCloseTo((62 / 65) * 96, 6);
    expect(heights(html, '#bcb266')[3]).toBeCloseTo((3 / 65) * 96, 6);
    // No sells, no red segment: the legend's key is the only dark red.
    expect(heights(html, '#a1122c')).toEqual([]);
    expect(html).toContain('>%Sell</text>');
    for (const label of ['Jul', 'Aug', 'Sep', 'Oct', '%Buy', '%Hold', '0', '50', '100']) expect(html).toContain(`>${label}</text>`);
    expect(html.match(/>2026<\/text>/g)).toHaveLength(1);
    expect(html).toContain('Oct 2026: %Buy 95.4% (62 of 65 ratings)');
    expect(html).toContain('a bar for each month of rating counts Finnhub gives (4 here; the free sources give at most the last four)');
  });

  it('draws sells on top of holds on top of buys, and labels relative months as the source gives them', () => {
    const html = render(RELATIVE, 'Yahoo Finance');
    const ys = (fill: string) => [...html.matchAll(new RegExp(`<rect [^>]*y="([\\d.]+)" width="40" height="[\\d.]+" fill="${fill}"`, 'g'))].map((m) => Number(m[1]));
    const [buy, hold, sell] = [ys('#00a220')[3], ys('#bcb266')[3], ys('#a1122c')[3]];
    expect(sell).toBeLessThan(hold);
    expect(hold).toBeLessThan(buy);
    expect(heights(html, '#a1122c')[3]).toBeCloseTo((4 / 49) * 96, 6);
    for (const label of ['-3m', '-2m', '-1m', '0m']) expect(html).toContain(`>${label}</text>`);
    expect(html).toContain('a bar for each month of rating counts Yahoo Finance gives (4 here');
  });

  it("draws buys and sells in a colour-blind scheme's own colours", () => {
    settings.set((s) => ({ ...s, scheme: 'deuteranopia' }));
    const html = render(RELATIVE, 'Yahoo Finance');
    expect(heights(html, '#0072c4')[3]).toBeCloseTo((31 / 49) * 96, 6);
    expect(heights(html, '#bcb266')[3]).toBeCloseTo((14 / 49) * 96, 6);
    expect(heights(html, '#a83c3d')[3]).toBeCloseTo((4 / 49) * 96, 6);
    expect(html).not.toContain('#00a220');
  });

  it('shows a month without ratings as a labelled gap, and nothing without months', () => {
    const html = render([{ period: '2026-10-01', strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }], 'Finnhub');
    expect(html).toContain('--<title>Oct 2026: the source counts no ratings for this month</title>');
    expect(heights(html, '#00a220')).toEqual([]);
    expect(render([], 'Finnhub')).toBe('');
  });
});
