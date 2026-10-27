import { describe, expect, it } from 'vitest';
import { inCurrency, MAP_TILES, ranked } from '../src/data/world-indices';
import { INDEX_GROUPS } from '../src/functions/WEI';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

describe("the world's indices compared", () => {
  it("turns a local return into another currency through each currency's move against the dollar", () => {
    // The DAX up 10% while the euro rose 5% on the dollar: 15.5% in dollars.
    expect(inCurrency(10, 5, 0)).toBeCloseTo(15.5, 12);
    // The Nikkei up 10% while the yen fell 8% on the dollar and the euro rose 4%: in euros, 1.1 × 0.92 / 1.04 − 1.
    expect(inCurrency(10, -8, 4)).toBeCloseTo((1.1 * 0.92 / 1.04 - 1) * 100, 12);
    expect(inCurrency(NaN, 0, 0)).toBeNaN();
    expect(inCurrency(5, -100, 0)).toBeNaN();
  });

  it('ranks the highest first and leaves the ones without a figure unranked at the end', () => {
    const r = ranked([{ k: 'a', v: 1 }, { k: 'b', v: NaN }, { k: 'c', v: 3 }, { k: 'd', v: -2 }], (x) => x.v);
    expect(r.map((x) => [x.row.k, x.rank])).toEqual([['c', 1], ['a', 2], ['d', 3], ['b', null]]);
  });

  it("puts on the map only indices MARKET lists, one per market, each in its own place", () => {
    const listed = new Set(INDEX_GROUPS.flatMap((g) => g.ids));
    for (const t of MAP_TILES) expect(listed.has(t.id), t.id).toBe(true);
    expect(new Set(MAP_TILES.map((t) => t.country)).size).toBe(MAP_TILES.length);
    expect(new Set(MAP_TILES.map((t) => `${t.col},${t.row}`)).size).toBe(MAP_TILES.length);
  });

  it('opens under WEIS and WM, while WM US is Waste Management', () => {
    expect(parseCommand('WEIS', lookupFn)).toEqual({ kind: 'route', fn: 'INDEXRANKING' });
    expect(parseCommand('WM', lookupFn)).toEqual({ kind: 'route', fn: 'WORLDMAP' });
    expect(parseCommand('WM US', lookupFn)).toMatchObject({ kind: 'error', lookup: 'WM' });
  });
});
