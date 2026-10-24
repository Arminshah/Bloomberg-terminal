import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePortfolio, holdsAnything, movePortfolio, newPortfolio, renamePortfolio, switchPortfolio } from '../src/terminal/portfolio-tabs';
import { emptyPortfolio, MAX_PORTFOLIOS, portfolio, portfolios, type Portfolio } from '../src/terminal/userdata';

const names = () => portfolios.get().list.map((p) => p.name);
const holding = (id: string, qty = 10, cost = 100) => ({ id, qty, cost });

beforeEach(() => {
  portfolios.set({ list: [emptyPortfolio('My portfolio')], active: 0 });
});

describe('portfolio tabs', () => {
  it('opens a new, empty portfolio after the others, in the currency and against the benchmark of the one beside it', () => {
    portfolio.set((s) => ({ ...s, base: 'EUR', benchmark: 'SX5E Index', cash: 1000, positions: [holding('AAPL US Equity')] }));
    expect(newPortfolio()).toBe(true);
    expect(names()).toEqual(['My portfolio', 'Portfolio 2']);
    expect(portfolios.get().active).toBe(1);
    expect(portfolio.get()).toEqual({ name: 'Portfolio 2', base: 'EUR', benchmark: 'SX5E Index', cash: 0, positions: [] });
    expect(newPortfolio('  DOMESTIC   BOND FUND ')).toBe(true);
    expect(names()[2]).toBe('DOMESTIC BOND FUND');
    // A free number, not one another portfolio already goes by.
    renamePortfolio(1, 'Portfolio 4');
    newPortfolio();
    expect(names()[3]).toBe('Portfolio 5');
  });

  it('keeps each portfolio\'s holdings and cash apart: screens read and change the one on screen', () => {
    portfolio.set((s) => ({ ...s, cash: 500, positions: [holding('AAPL US Equity')] }));
    newPortfolio('DOMESTIC BOND FUND');
    portfolio.set((s) => ({ ...s, cash: 2000, positions: [holding('TLT US Equity', 5, 90)] }));
    expect(portfolios.get().list[0]).toMatchObject({ cash: 500, positions: [holding('AAPL US Equity')] });
    switchPortfolio(0);
    expect(portfolio.get()).toMatchObject({ name: 'My portfolio', cash: 500, positions: [holding('AAPL US Equity')] });
    portfolio.set((s) => ({ ...s, positions: [] }));
    expect(portfolios.get().list[1]).toMatchObject({ cash: 2000, positions: [holding('TLT US Equity', 5, 90)] });
    // A change that changes nothing leaves the store as it was.
    const before = portfolios.get();
    portfolio.set((s) => s);
    expect(portfolios.get()).toBe(before);
  });

  it('tells every listener when a portfolio changes', () => {
    const seen: number[] = [];
    const off = portfolio.subscribe(() => seen.push(portfolio.get().cash));
    portfolio.set((s) => ({ ...s, cash: 7 }));
    newPortfolio();
    off();
    expect(seen).toEqual([7, 0]);
  });

  it('renames a portfolio; a blank name keeps the one it has', () => {
    renamePortfolio(0, '  EQUITY_LONG  ');
    expect(names()).toEqual(['EQUITY_LONG']);
    renamePortfolio(0, '   ');
    expect(names()).toEqual(['EQUITY_LONG']);
    renamePortfolio(0, 'x'.repeat(60));
    expect(names()[0]).toHaveLength(40);
  });

  it('closes a portfolio and shows its neighbour, but always keeps one', () => {
    expect(closePortfolio(0)).toBe(false);
    newPortfolio('B');
    newPortfolio('C');
    newPortfolio('D');
    switchPortfolio(1);
    // Closing one before the portfolio on screen keeps that portfolio on screen.
    expect(closePortfolio(0)).toBe(true);
    expect(portfolio.get().name).toBe('B');
    // Closing the one on screen shows the one to its right, else the one to its left.
    closePortfolio(0);
    expect(names()).toEqual(['C', 'D']);
    expect(portfolio.get().name).toBe('C');
    switchPortfolio(1);
    closePortfolio(1);
    expect(portfolio.get().name).toBe('C');
    expect(closePortfolio(0)).toBe(false);
    expect(closePortfolio(5)).toBe(false);
  });

  it('says whether closing would delete anything entered', () => {
    expect(holdsAnything(emptyPortfolio('A'))).toBe(false);
    expect(holdsAnything({ ...emptyPortfolio('A'), cash: -50 })).toBe(true);
    expect(holdsAnything({ ...emptyPortfolio('A'), positions: [holding('AAPL US Equity')] })).toBe(true);
  });

  it('reorders by dragging, keeping the portfolio on screen', () => {
    newPortfolio('B');
    newPortfolio('C');
    switchPortfolio(0);
    movePortfolio(0, 2);
    expect(names()).toEqual(['B', 'C', 'My portfolio']);
    expect(portfolio.get().name).toBe('My portfolio');
    movePortfolio(1, 0);
    expect(names()).toEqual(['C', 'B', 'My portfolio']);
    expect(portfolios.get().active).toBe(2);
    const before = portfolios.get();
    movePortfolio(1, 1);
    movePortfolio(9, 0);
    expect(portfolios.get()).toBe(before);
  });

  it('opens at most the allowed number', () => {
    for (let i = 1; i < MAX_PORTFOLIOS; i++) expect(newPortfolio()).toBe(true);
    expect(newPortfolio()).toBe(false);
    expect(portfolios.get().list).toHaveLength(MAX_PORTFOLIOS);
  });

  it('ignores a switch to a portfolio that does not exist', () => {
    switchPortfolio(4);
    switchPortfolio(-1);
    expect(portfolios.get().active).toBe(0);
  });
});

describe('the portfolio kept before tabs', () => {
  let data: Map<string, string>;
  const saved: Portfolio = { name: 'EQUITY_LONG', base: 'EUR', benchmark: 'SX5E Index', cash: 1500, positions: [{ id: 'ASML NA Equity', qty: 4, cost: 610, entryFx: 1, entryBase: 'EUR' }] };

  async function load() {
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
      removeItem: (k: string) => data.delete(k),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    });
    return import('../src/terminal/userdata');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    data = new Map();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('becomes the first tab, with its holdings, cash, currency and benchmark; its saved copy is never changed', async () => {
    const old = JSON.stringify({ v: 2, s: saved });
    data.set('armin:portfolio', old);
    const u = await load();
    expect(u.portfolios.get()).toEqual({ list: [saved], active: 0 });
    expect(u.portfolio.get()).toEqual(saved);
    u.portfolio.set((s) => ({ ...s, cash: 0 }));
    vi.advanceTimersByTime(200);
    expect(JSON.parse(data.get('armin:portfolios')!).s.list[0]).toMatchObject({ name: 'EQUITY_LONG', cash: 0 });
    expect(data.get('armin:portfolio')).toBe(old);
    // From then on the tabs are read, not the earlier copy.
    const again = await load();
    expect(again.portfolio.get().cash).toBe(0);
  });

  it('starts with one empty portfolio when nothing was saved', async () => {
    const u = await load();
    expect(u.portfolios.get()).toEqual({ list: [{ name: 'My portfolio', base: 'USD', benchmark: 'SPX Index', cash: 0, positions: [] }], active: 0 });
  });

  it('mends damaged saved tabs instead of failing to open', async () => {
    data.set('armin:portfolio', JSON.stringify({ v: 2, s: saved }));
    data.set('armin:portfolios', JSON.stringify({ v: 1, s: { list: [], active: 0 } }));
    expect((await load()).portfolios.get().list).toEqual([saved]);
    data.set('armin:portfolios', JSON.stringify({ v: 1, s: { list: [saved, { name: 'B' }], active: 7 } }));
    const u = await load();
    expect(u.portfolios.get().active).toBe(0);
    expect(u.portfolios.get().list[1]).toEqual({ name: 'B', base: 'USD', benchmark: 'SPX Index', cash: 0, positions: [] });
  });
});
