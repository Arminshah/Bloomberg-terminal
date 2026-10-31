import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { median } from '../src/finance/stats';
import { RV, rvCurrencies, rvRate } from '../src/functions/RV';

// Server rendering has no market subscriptions: the screen reads the engine's quotes as they stand.
vi.mock('../src/data/market', async (original) => {
  const market = await original<typeof import('../src/data/market')>();
  return { ...market, useTick: () => 0, useQuote: (id: string | undefined) => (id ? market.engine.quote(id) : undefined) };
});

afterEach(() => vi.restoreAllMocks());

// Test rates, US dollars per unit as the engine gives them: a pound at 1.30, a euro at 1.08; none for the yen.
const usd = (c: string) => ({ USD: 1, GBP: 1.3, EUR: 1.08 } as Record<string, number>)[c] ?? NaN;

describe("RV's Curr: market values and prices in the loaded security's currency or US dollars", () => {
  it("offers the loaded security's own currency in its main unit, then US dollars", () => {
    expect(rvCurrencies('GBp')).toEqual(['GBP', 'USD']);
    expect(rvCurrencies('EUR')).toEqual(['EUR', 'USD']);
    expect(rvCurrencies('USD')).toEqual(['USD']);
  });

  it('converts through the dollar, a price in pence into pounds, and gives no figure without a rate', () => {
    // A London price of 2,635.00 pence is 26.35 pounds, whatever the rates, as the terminal's Last Px shows it.
    expect(rvRate('GBp', 'GBP', usd)).toBe(0.01);
    expect(rvRate('GBp', 'GBP', () => NaN)).toBe(0.01);
    expect(2635 * rvRate('GBp', 'GBP', usd)).toBeCloseTo(26.35, 12);
    // In dollars: pence to pounds, then pounds at 1.30.
    expect(2635 * rvRate('GBp', 'USD', usd)).toBeCloseTo(34.255, 12);
    // A US or euro peer of a London stock, in pounds.
    expect(rvRate('USD', 'GBP', usd)).toBeCloseTo(1 / 1.3, 12);
    expect(rvRate('EUR', 'GBP', usd)).toBeCloseTo(1.08 / 1.3, 12);
    // The same currency needs no rate.
    expect(rvRate('USD', 'USD', () => NaN)).toBe(1);
    expect(rvRate('GBP', 'GBP', () => NaN)).toBe(1);
    // No rate, or a broken one: blank, never a figure in the wrong currency.
    expect(rvRate('JPY', 'GBP', usd)).toBeNaN();
    expect(rvRate('EUR', 'GBP', (c) => (c === 'GBP' ? 0 : 1))).toBeNaN();
  });
});

const html = (id: string) => renderToStaticMarkup(createElement(RV, { route: { fn: 'PEERS', sec: id }, sec: engine.get(id)! }));
/** The peers table, after the comp range panel. */
const table = (page: string) => page.slice(page.indexOf('<table', page.indexOf('rv-range') + 1));
const headers = (page: string) => [...table(page).slice(0, table(page).indexOf('</thead>')).matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s*[▲▼]$/, '').trim());
/** Each row of the peers table (the summary lines left out): its ticker and the exact figure under the header given. */
function column(page: string, label: string): Map<string, number> {
  const col = headers(page).indexOf(label);
  expect(col).toBeGreaterThan(0);
  // The summary lines have their own body, with a class; the rows' body has none.
  const body = table(page).slice(table(page).indexOf('<tbody>'));
  return new Map(
    [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => {
      const cells = [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1]);
      const value = /data-value="([^"]+)"/.exec(cells[col] ?? '');
      return [/class="sec-link[^"]*"[^>]*>([^<]+)</.exec(m[1])?.[1] ?? '', value ? Number(value[1]) : NaN];
    }),
  );
}
const lastPrice = (ticker: string) => engine.quote(`${ticker} Equity`)!.last;

describe('PEERS for a London stock, in pounds as RV opens', () => {
  const id = 'SHEL LN Equity';

  it('shows its market value and price in pounds, not pence, its peers converted, and the median on those figures', () => {
    const page = html(id);
    // The drop-down, pounds first and chosen, and the headers in pounds.
    expect(page).toMatch(/aria-label="Currency"><option value="GBP" selected="">GBP<\/option><option value="USD">USD<\/option><\/select>/);
    expect(headers(page)).toContain('Mkt Cap GBP');
    expect(headers(page)).toContain('Last Px');
    expect(headers(page).some((h) => h.includes('USD'))).toBe(false);

    const prices = column(page, 'Last Px');
    const caps = column(page, 'Mkt Cap GBP');
    const peers = [...prices.keys()].map((t) => engine.get(`${t} Equity`)!);
    // Shell's own price out of pence; the built-in list gives it peers in dollars and euros.
    expect(prices.get('SHEL LN')).toBeCloseTo(lastPrice('SHEL LN') / 100, 9);
    expect(caps.get('SHEL LN')).toBeCloseTo((lastPrice('SHEL LN') / 100) * engine.get(id)!.eq!.shares * 1e6, 3);
    const foreign = peers.filter((d) => d.ccy === 'USD' || d.ccy === 'EUR');
    expect(new Set(foreign.map((d) => d.ccy))).toEqual(new Set(['USD', 'EUR']));
    for (const d of foreign) {
      const inGbp = engine.usdValue(d.ccy) / engine.usdValue('GBP');
      expect(prices.get(d.ticker)).toBeCloseTo(lastPrice(d.ticker) * inGbp, 9);
      expect(caps.get(d.ticker)! / (lastPrice(d.ticker) * d.eq!.shares * 1e6 * inGbp)).toBeCloseTo(1, 9);
    }

    // The Median line takes the prices too, all in pounds.
    const cell = /data-testid="rv-median".*?<td[^>]*data-key="px"[^>]*><span data-value="([^"]+)"/.exec(page);
    expect(Number(cell?.[1])).toBeCloseTo(median([...prices.values()].filter(Number.isFinite)), 9);
  });

  it('leaves a figure blank, saying why, when there is no rate to convert it', () => {
    const real = engine.usdValue.bind(engine);
    vi.spyOn(engine, 'usdValue').mockImplementation((c: string) => (c === 'GBP' || c === 'GBp' ? NaN : real(c)));
    const page = html(id);
    const prices = column(page, 'Last Px');
    // Its own price needs no rate; the dollar peers have none into pounds.
    expect(prices.get('SHEL LN')).toBeCloseTo(lastPrice('SHEL LN') / 100, 9);
    expect(prices.get('XOM US')).toBeNaN();
    expect(page).toContain('title="No USD to GBP rate yet: left blank rather than shown in USD">--</span>');
  });
});

describe('PEERS for a US stock', () => {
  it('stays in US dollars, its only choice, with the headers it had', () => {
    const page = html('AAPL US Equity');
    expect(page).toMatch(/aria-label="Currency"><option value="USD" selected="">USD<\/option><\/select>/);
    expect(headers(page)).toEqual(['#', 'Name', '', 'Mkt Cap USD', 'Last Px', 'Chg Pct 1D', 'Chg Pct 1M', 'Rev - 1 Yr Gr:Y', 'EPS - 1 Yr Gr:Y', 'P/E', 'ROE', 'Dvd 12M Yld']);
  });
});
