import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardMoves, ftseMoves, IndexMembers, IndexMembersView, leadersLaggers, memberBreadth, type MemberMove } from '../src/functions/DESIndexMembers';
import { DES } from '../src/functions/DES';
import { engine } from '../src/data/market';
import { indexData, type Member } from '../src/data/live/index-members';
import { ftse100, ftseFigures, type DailyFigures, type FtseMember, type MemberFigures } from '../src/data/live/ftse100';

// Server rendering has no market subscriptions (the page redraws on the engine's ticks in the app).
vi.mock('../src/data/market', async (original) => {
  const market = await original<typeof import('../src/data/market')>();
  return { ...market, useTick: () => 0, useQuote: (id: string) => market.engine.quote(id) };
});

const move = (ticker: string, pct: number): MemberMove => ({ ticker, name: ticker, pct, lookup: ticker });
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

describe("PROFILE's Members line for an index, as DES counts the members", () => {
  it('counts the members rising, falling and unchanged on the day, leaving those without a price out of all three', () => {
    const moves = [move('A US', 1.2), move('B US', -0.4), move('C US', 0), move('D US', 3), move('E US', NaN), move('F US', -2)];
    expect(memberBreadth(moves)).toEqual({ members: 6, priced: 5, up: 2, down: 2, unch: 1 });
    expect(memberBreadth([])).toEqual({ members: 0, priced: 0, up: 0, down: 0, unch: 0 });
  });
});

describe("PROFILE's Movers table, as DES picks the leaders and laggers", () => {
  const moves = [move('A', 1), move('B', 5.68), move('C', -6.26), move('D', 4.86), move('E', -0.95), move('F', 3.37), move('G', 2.95), move('H', -2.09), move('I', -1.2), move('J', 0.5), move('K', -0.1), move('L', NaN), move('M', 0)];

  it('takes the four largest rises, largest first, and the four largest falls, largest first', () => {
    const { leaders, laggers } = leadersLaggers(moves);
    expect(leaders.map((m) => m.ticker)).toEqual(['B', 'D', 'F', 'G']);
    expect(laggers.map((m) => m.ticker)).toEqual(['C', 'H', 'I', 'E']);
  });

  it('puts no fall among the leaders, nor a rise among the laggers, on a day few members moved one way', () => {
    const { leaders, laggers } = leadersLaggers([move('A', -1), move('B', 2), move('C', -3), move('D', 0), move('E', NaN)]);
    expect(leaders.map((m) => m.ticker)).toEqual(['B']);
    expect(laggers.map((m) => m.ticker)).toEqual(['C', 'A']);
  });

  it('orders equal changes by ticker', () => {
    const { leaders } = leadersLaggers([move('ZZ', 1), move('AA', 1), move('MM', 2)], 2);
    expect(leaders.map((m) => m.ticker)).toEqual(['MM', 'AA']);
  });
});

describe("the members' moves from the app's real member lists", () => {
  it("gives the US indices' members as MEMBERS writes them, with Yahoo's change on the day", () => {
    const m = { symbol: 'BRK.B', name: 'Berkshire Hathaway', pct: -0.37 } as Member;
    const n = { symbol: 'AAPL', name: 'Apple', pct: 1.5, id: 'AAPL US Equity' } as Member;
    expect(boardMoves([m, n])).toEqual([
      { ticker: 'BRK.B US', name: 'Berkshire Hathaway', pct: -0.37, lookup: 'BRK/B US' },
      { ticker: 'AAPL US', name: 'Apple', pct: 1.5, id: 'AAPL US Equity', lookup: 'AAPL US' },
    ]);
  });

  it("gives the FTSE 100's members their change on the latest session, and none to a member whose prices stop before it", () => {
    const member = (ticker: string, root: string, yahoo: string): FtseMember => ({ name: ticker, ticker, root, yahoo, isin: '', sector: '' });
    const daily = (lastDay: string, last: number, prev: number): MemberFigures => ({ daily: { last, lastDay, prev } as DailyFigures });
    const members = [member('BATS', 'BATS', 'BATS.L'), member('BT.A', 'BT/A', 'BT-A.L'), member('OLD', 'OLD', 'OLD.L'), member('NONE', 'NONE', 'NONE.L')];
    const by = { 'BATS.L': daily('2026-10-30', 2800, 2650), 'BT-A.L': daily('2026-10-30', 190, 200), 'OLD.L': daily('2026-10-29', 110, 100) };
    const moves = ftseMoves(members, by, (id) => id === 'BATS LN Equity');
    expect(moves.map((m) => m.ticker)).toEqual(['BATS LN', 'BT/A LN', 'OLD LN', 'NONE LN']);
    expect(moves[0].pct).toBeCloseTo((2800 / 2650 - 1) * 100, 10);
    expect(moves[0].id).toBe('BATS LN Equity');
    expect(moves[1].pct).toBeCloseTo(-5, 10);
    expect(moves[1].lookup).toBe('BT/A LN');
    expect(moves[1].id).toBeUndefined();
    expect(moves[2].pct).toBeNaN();
    expect(moves[3].pct).toBeNaN();
    expect(memberBreadth(moves)).toEqual({ members: 4, priced: 2, up: 1, down: 1, unch: 0 });
  });
});

describe("PROFILE's Members line and Movers table on the page", () => {
  const spx = engine.get('SPX Index')!;

  it('writes the count, then the members up, down and unchanged, and numbers the leaders from 9) and the laggers from 13)', () => {
    const moves = [move('B US', 5.68), move('C US', -6.26), move('D US', 4.86), move('M US', 0), move('L US', NaN)];
    const html = renderToStaticMarkup(createElement(IndexMembersView, { sec: spx, moves, members: 'MEMBERS', movers: 'CONTRIB' }));
    const t = text(html);
    expect(t).toMatch(/6\) Members \| MEMB »5↑2↓1→ 1\(4 of 5 priced\)/);
    expect(t).toContain('8) Movers | MOV »');
    expect(t).toContain('Leaders% ChgLaggers% Chg');
    expect(t).toContain('9) B US+5.6813) C US-6.26');
    expect(t).toContain('10) D US+4.86');
    expect(html).toContain('<span class="up">+5.68</span>');
    expect(html).toContain('<span class="dn">-6.26</span>');
    expect(t).not.toContain('11)');
    expect(t).not.toContain('14)');
  });

  it('leaves labelled blanks, with the link to MEMBERS, for an index whose members the app cannot load', () => {
    const dax = engine.get('DAX Index')!;
    const html = renderToStaticMarkup(createElement(IndexMembers, { sec: dax }));
    const t = text(html);
    expect(t).toContain('6) Members | MEMB »');
    expect(t).toContain('8) Movers | MOV »');
    expect(html).toMatch(/<span title="The index&#x27;s members need the desktop app[^"]*">--<\/span>/);
    expect(t).not.toContain('↑');
    expect(renderToStaticMarkup(createElement(IndexMembers, { sec: engine.get('VIX Index')! }))).toBe('');
  });

  it("is on the index's PROFILE page", () => {
    const html = renderToStaticMarkup(createElement(DES, { sec: spx, route: { fn: 'PROFILE', sec: spx.id } }));
    expect(text(html)).toContain('6) Members | MEMB »');
    expect(text(html)).toContain('8) Movers | MOV »');
  });
});

describe("PROFILE's Members line and Movers table in the desktop app, from the index's real members", () => {
  // The desktop bridge is there; nothing is asked for in a server render, the lists come from the stores.
  const desktop = () => vi.stubGlobal('window', { arminDesktop: { yahoo: () => undefined, indexMembers: () => undefined } });
  const lists = indexData.get();
  afterEach(() => {
    vi.unstubAllGlobals();
    indexData.set(lists);
    ftse100.set({ v: 0 });
    ftseFigures.set({ v: 0, by: {} });
  });

  it("counts the Dow's listed members and ranks them by Yahoo's change on the day, linking MEMBERS and CONTRIB", () => {
    desktop();
    const symbols = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'];
    const closes: Record<string, [number, number]> = { AAA: [102, 100], BBB: [99, 100], CCC: [100, 100], DDD: [110, 100], EEE: [90, 100] };
    indexData.set((x) => ({
      ...x,
      lists: { INDU: { state: 'ok', members: symbols.map((symbol) => ({ symbol, name: `${symbol} Corp`, sector: '', industry: '' })) } },
      quotes: Object.fromEntries(Object.entries(closes).map(([k, [last, prevClose]]) => [k, { last, prevClose, time: 0 }])),
    }));
    const t = text(renderToStaticMarkup(createElement(IndexMembers, { sec: engine.get('INDU Index')! })));
    expect(t).toMatch(/6\) Members \| MEMB »6↑2↓2→ 1\(5 of 6 priced\)/);
    expect(t).toContain('9) DDD US+10.0013) EEE US-10.00');
    expect(t).toContain('10) AAA US+2.0014) BBB US-1.00');
    expect(t).toContain('8) Movers | MOV »');
    expect(t).toContain("Members from Yahoo's Dow membership");
  });

  it("says the members are loading until the list arrives, and that no member has a price before the prices do", () => {
    desktop();
    indexData.set((x) => ({ ...x, lists: { SPX: { state: 'loading' } }, quotes: {} }));
    const loading = renderToStaticMarkup(createElement(IndexMembers, { sec: engine.get('SPX Index')! }));
    expect(loading).toContain('<span title="Loading the members…">--</span>');
    indexData.set((x) => ({ ...x, lists: { SPX: { state: 'ok', members: [{ symbol: 'AAA', name: 'A', sector: '', industry: '' }] } } }));
    const t = text(renderToStaticMarkup(createElement(IndexMembers, { sec: engine.get('SPX Index')! })));
    expect(t).toMatch(/MEMB »1↑--↓--→ --/);
  });

  it("uses Wikipedia's FTSE 100 list and Yahoo's daily prices for UKX, numbering only what opens something", () => {
    desktop();
    const members: FtseMember[] = [
      { name: 'British American Tobacco', ticker: 'BATS', root: 'BATS', yahoo: 'BATS.L', isin: '', sector: '' },
      { name: 'BT Group', ticker: 'BT.A', root: 'BT/A', yahoo: 'BT-A.L', isin: '', sector: '' },
      { name: 'Unchanged', ticker: 'UNC', root: 'UNC', yahoo: 'UNC.L', isin: '', sector: '' },
    ];
    const daily = (last: number, prev: number): MemberFigures => ({ daily: { last, lastDay: '2026-10-30', prev } as DailyFigures, dailyAt: 0 });
    ftse100.set({ v: 1, list: { state: 'ok', members, at: 0 } });
    ftseFigures.set({ v: 1, by: { 'BATS.L': daily(2650 * 1.05, 2650), 'BT-A.L': daily(196, 200), 'UNC.L': daily(500, 500) } });
    const t = text(renderToStaticMarkup(createElement(IndexMembers, { sec: engine.get('UKX Index')! })));
    expect(t).toMatch(/^Members3↑1↓1→ 1 Movers/);
    expect(t).toContain('9) BATS LN+5.0013) BT/A LN-2.00');
    expect(t).not.toContain('MEMB »');
    expect(t).not.toContain('8)');
    expect(t).toContain("Members from Wikipedia's FTSE 100 Index article, Constituents table");
  });

  it('says the app does not load the membership of another index (public lists exist), and keeps the link to MEMBERS', () => {
    desktop();
    const html = renderToStaticMarkup(createElement(IndexMembers, { sec: engine.get('DAX Index')! }));
    expect(html).toContain('<span title="The app does not load the membership of DAX Index: it has the members of the S&amp;P 500, the Nasdaq-100, the Dow and the FTSE 100.">--</span>');
    expect(text(html)).toContain('6) Members | MEMB »');
  });
});
