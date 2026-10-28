import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { parseNasdaqListings } from '../src/data/live/earnings-calendar';
import { toUsd } from '../src/data/analytics';
import { financials, keyStats } from '../src/data/fundamentals';
import { appCandidates, complete, describeScreen, evaluate, matchesAfterEach, meets, NM, periodOf, runScreen, usCandidates, valueKey, type Candidate, type Criterion, type ScreenDef } from '../src/data/screen';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import list from './fixtures/nasdaq-screener-2026-10.json';

// Rows of Nasdaq's stock list as it answered on 26 October 2026: large caps, an ADR, recent listings, rows with no
// market value or no sector, and a preferred share.
const parsed = parseNasdaqListings(JSON.stringify(list));
if ('error' in parsed) throw new Error(parsed.error);
const listings = parsed.data;

const screen = (groups: Criterion[][], missing: ScreenDef['missing'] = 'leave-out', exclude = ''): ScreenDef => ({ universe: 'us', groups, missing, exclude });
const cand = (values: Candidate['values'], ticker = 'X'): Candidate => ({ ticker, name: ticker, values });

describe('SCREEN criteria', () => {
  it('compares numbers and text, and cannot decide on a missing value', () => {
    expect(meets({ field: 'cap', op: 'gte', value: '10' }, 12)).toBe(true);
    expect(meets({ field: 'cap', op: 'lte', value: '10' }, 12)).toBe(false);
    expect(meets({ field: 'pe', op: 'between', value: '20', to: '10' }, 15)).toBe(true);
    expect(meets({ field: 'cap', op: 'gte', value: '1,000' }, 999)).toBe(false);
    expect(meets({ field: 'cap', op: 'gte', value: '10' }, NaN)).toBeNull();
    expect(meets({ field: 'cap', op: 'gte', value: '10' }, undefined)).toBeNull();
    // A P/E on a loss is known, not missing: the criterion fails whatever the screen does with missing values.
    expect(meets({ field: 'pe', op: 'lte', value: '16' }, NM)).toBe(false);
    expect(meets({ field: 'sector', op: 'is', value: 'technology' }, 'Technology')).toBe(true);
    expect(meets({ field: 'industry', op: 'has', value: 'SEMI' }, 'Semiconductors')).toBe(true);
    expect(meets({ field: 'industry', op: 'hasnot', value: 'bank' }, 'Major Banks')).toBe(false);
    expect(meets({ field: 'country', op: 'isnot', value: 'China' }, '')).toBeNull();
  });

  it('applies a criterion only once it has a value', () => {
    expect(complete({ field: 'cap', op: 'gte', value: '' })).toBe(false);
    expect(complete({ field: 'cap', op: 'gte', value: 'ten' })).toBe(false);
    expect(complete({ field: 'pe', op: 'between', value: '5' })).toBe(false);
    expect(complete({ field: 'sector', op: 'is', value: '  ' })).toBe(false);
    expect(complete({ field: 'pe', op: 'between', value: '5', to: '15' })).toBe(true);
  });

  it('joins criteria in a group by AND and groups by OR, and says which missing values left a stock undecided', () => {
    const s = screen([
      [{ field: 'cap', op: 'gte', value: '10' }, { field: 'pe', op: 'lte', value: '20' }],
      [{ field: 'divYld', op: 'gte', value: '4' }],
    ]);
    expect(evaluate(cand({ cap: 50, pe: 15 }), s)).toEqual({ result: true, unknown: [] });
    expect(evaluate(cand({ cap: 50, pe: 25, divYld: 5 }), s)).toEqual({ result: true, unknown: [] });
    expect(evaluate(cand({ cap: 50, pe: 25, divYld: 1 }), s)).toEqual({ result: false, unknown: [] });
    // A failed criterion decides its group, whatever is missing beside it.
    expect(evaluate(cand({ cap: 5, divYld: 1 }), s)).toEqual({ result: false, unknown: [] });
    // One group holds: the stock passes although the other has a missing value.
    expect(evaluate(cand({ cap: 50, pe: 15 }), s).result).toBe(true);
    expect(evaluate(cand({ cap: 50, divYld: 1 }), s)).toEqual({ result: null, unknown: ['pe'] });
    expect(evaluate(cand({ cap: 50 }), s)).toEqual({ result: null, unknown: ['pe', 'divYld'] });
    // Incomplete criteria and empty groups take no part; with none left every stock passes.
    expect(evaluate(cand({}), screen([[{ field: 'cap', op: 'gte', value: '' }]]))).toEqual({ result: true, unknown: [] });
    expect(describeScreen(s)).toBe('(Market value ≥ 10 $bn and P/E ≤ 20) or Dividend yield ≥ 4 %');
    expect(describeScreen(screen([[{ field: 'sector', op: 'is', value: 'Energy' }, { field: 'ytd', op: 'between', value: '0', to: '10' }]]))).toBe('Sector is "Energy" and YTD change between 0 and 10 %');
    expect(describeScreen(screen([[]]))).toBe('No criteria: every stock');
  });

  it('counts the stocks left after each criterion in its group, as the screen counts them', () => {
    const cands = [cand({ cap: 50, pe: 15, divYld: 1 }), cand({ cap: 50, pe: 25, divYld: 5 }), cand({ cap: 50 }), cand({ cap: 5, pe: 10, divYld: 6 }), cand({ cap: 20, pe: 12, sector: 'Tobacco' })];
    const groups: Criterion[][] = [
      [{ field: 'cap', op: 'gte', value: '10' }, { field: 'pe', op: 'between', value: '' }, { field: 'pe', op: 'lte', value: '20' }],
      [{ field: 'divYld', op: 'gte', value: '4' }],
    ];
    // Four, then two once P/E is set (the one without a P/E is left out); the unfinished criterion takes no part.
    expect(matchesAfterEach(cands, screen(groups))).toEqual([[4, null, 2], [2]]);
    // Kept when undecided, as the screen keeps it: the stocks without a P/E or a yield count too.
    expect(matchesAfterEach(cands, screen(groups, 'keep'))).toEqual([[4, null, 3], [4]]);
    // The exclusion words come first.
    expect(matchesAfterEach(cands, screen(groups, 'leave-out', 'tobacco'))).toEqual([[3, null, 1], [2]]);
    // Each group's last count is its own; the result joins them (two in each group, none in both).
    expect(runScreen(cands, screen(groups)).rows).toHaveLength(4);
  });
});

describe("SCREEN over Nasdaq's list of US-listed stocks", () => {
  it('reads every stock with its change, volume and IPO year, without preferred shares', () => {
    expect(list.data.rows).toHaveLength(23);
    expect(listings.has('BRK.B')).toBe(true);
    expect([...listings.keys()].some((t) => t.startsWith('ABR'))).toBe(false);
    expect(listings.get('AAPL')).toMatchObject({ name: 'Apple Inc.', price: 347.725, change: -0.142, volume: 39539912, ipoYear: 1980, sector: 'Technology', industry: 'Computer Manufacturing' });
    expect(listings.get('T')!.change).toBe(-7.96);
    expect(listings.get('JPM')!.ipoYear).toBeNaN();
  });

  it("gives the list's figures, the app's ratios only for its own stocks, and no value for a zero market value", () => {
    const cands = usCandidates(listings);
    const by = new Map(cands.map((c) => [c.ticker, c]));
    expect(by.get('AAPL')!.id).toBe('AAPL US Equity');
    expect(by.get('AAPL')!.values.cap).toBeCloseTo(5074.76124, 4);
    expect(by.get('AAPL')!.values).toHaveProperty('pe');
    expect(by.get('BRK.B')!.values.sector).toBe('');
    // ABEO is not one of the app's stocks: no P/E, not a made-up one.
    expect(engine.get('ABEO US Equity')).toBeUndefined();
    expect(by.get('ABEO')!.values.pe).toBeUndefined();
    expect(by.get('AACI')!.values.cap).toBeNaN();
  });

  it('leaves out or keeps the stocks a missing value leaves undecided, as chosen, and counts them by field', () => {
    const cands = usCandidates(listings);
    const tech = [[{ field: 'sector', op: 'is', value: 'Technology' } as Criterion]];
    const out = runScreen(cands, screen(tech));
    expect(out.screened).toBe(22);
    expect(out.rows.map((r) => r.c.ticker).sort()).toEqual(['AAPL', 'MSFT', 'NVDA', 'TSM']);
    // BRK.B, AAUC and ACOG have no sector in the list.
    expect(out.undecided).toBe(3);
    expect(out.missingBy).toEqual({ sector: 3 });
    const kept = runScreen(cands, screen(tech, 'keep'));
    expect(kept.rows).toHaveLength(7);
    expect(kept.rows.filter((r) => r.unknown.length).map((r) => r.c.ticker).sort()).toEqual(['AAUC', 'ACOG', 'BRK.B']);
    // A ratio the list does not have: only the app's own stocks can be decided.
    const pe = runScreen(cands, screen([[{ field: 'pe', op: 'gte', value: '-1000' }]]));
    expect(pe.rows.every((r) => r.c.id)).toBe(true);
    expect(pe.undecided).toBeGreaterThan(5);
  });

  it("uses Nasdaq's own classification, so an exclusion word matches its names, not GICS's", () => {
    const cands = usCandidates(listings);
    // Nasdaq files Altria under Health Care, "Medicinal Chemicals and Botanical Products": "tobacco" does not catch it.
    expect(cands.find((c) => c.ticker === 'MO')!.values.sector).toBe('Health Care');
    const out = runScreen(cands, screen([], 'leave-out', 'tobacco, hotels'));
    expect(out.excluded).toBe(1);
    expect(out.rows.some((r) => r.c.ticker === 'LVS')).toBe(false);
    expect(out.rows.some((r) => r.c.ticker === 'MO')).toBe(true);
  });
});

describe("SCREEN over the app's stocks", () => {
  it('gives every stock the full set of fields', () => {
    const cands = appCandidates();
    expect(cands.length).toBe(engine.securities.filter((d) => d.cls === 'equity' && d.eq).length);
    const aapl = cands.find((c) => c.id === 'AAPL US Equity')!;
    expect(Object.keys(aapl.values)).toEqual(expect.arrayContaining(['cap', 'price', 'chg', 'volume', 'pe', 'divYld', 'roe', 'beta', 'ytd', 'y1', 'sector', 'industry', 'region']));
  });

  it('opens under SCREEN, EQS and SCREENER', () => {
    for (const c of ['SCREEN', 'EQS', 'SCREENER']) expect(parseCommand(c, lookupFn)).toEqual({ kind: 'route', fn: 'SCREEN' });
  });
});

describe('SCREEN: ranks and periods', () => {
  // Five stocks: market value in $bn, P/E on the trailing 12 months and on the latest fiscal year.
  const five = [
    cand({ cap: 900, pe: 30, 'pe@lfy': 35, sector: 'Tech' }, 'AAA'),
    cand({ cap: 500, pe: 12, 'pe@lfy': 11, sector: 'Banks' }, 'BBB'),
    cand({ cap: 300, pe: 18, 'pe@lfy': NM, sector: 'Tech' }, 'CCC'),
    cand({ cap: 300, pe: 9, 'pe@lfy': 10, sector: 'Energy' }, 'DDD'),
    cand({ pe: 14, sector: 'Tech' }, 'EEE'),
  ];
  const tickers = (s: ScreenDef) => runScreen(five, s).rows.map((r) => r.c.ticker).sort();

  it('keeps the N best of the stocks the criteria above left, in order', () => {
    const top2 = { field: 'cap', op: 'top', value: '2' } as Criterion;
    const tech = { field: 'sector', op: 'is', value: 'Tech' } as Criterion;
    expect(tickers(screen([[top2]]))).toEqual(['AAA', 'BBB']);
    // The two largest of the tech stocks; tech among the two largest is another screen.
    expect(tickers(screen([[tech, top2]]))).toEqual(['AAA', 'CCC']);
    expect(tickers(screen([[top2, tech]]))).toEqual(['AAA']);
    // Lower is better; equal values in ticker order.
    expect(tickers(screen([[{ field: 'cap', op: 'bottom', value: '1' }]]))).toEqual(['CCC']);
    // A stock with no value to rank on is out, and counted.
    const out = runScreen(five, screen([[tech, top2]]));
    expect(out.unranked).toEqual({ cap: 1 });
    expect(out.undecided).toBe(0);
    expect(matchesAfterEach(five, screen([[tech, top2]]))).toEqual([[3, 2]]);
    expect(describeScreen(screen([[tech, top2]]))).toBe('Sector is "Tech" and Top 2 by Market value, higher is better');
    // Only a whole number of stocks.
    expect(complete({ field: 'cap', op: 'top', value: '2.5' })).toBe(false);
    expect(complete({ field: 'cap', op: 'top', value: '0' })).toBe(false);
    // On its own a stock cannot be ranked: evaluate leaves ranks to the screen.
    expect(evaluate(five[4], screen([[top2]]))).toEqual({ result: true, unknown: [] });
  });

  it('ranks the stocks kept undecided too, when the screen keeps them', () => {
    const s = (missing: ScreenDef['missing']) => screen([[{ field: 'divYld', op: 'gte', value: '1' }, { field: 'pe', op: 'bottom', value: '2' }]], missing);
    // No stock has a yield: left out, all are undecided; kept, the two lowest P/Es stay.
    expect(runScreen(five, s('leave-out'))).toMatchObject({ rows: [], undecided: 5 });
    expect(tickers(s('keep'))).toEqual(['BBB', 'DDD']);
  });

  it('reads each criterion for its own period', () => {
    expect(periodOf({ field: 'pe' })).toBe('ltm');
    expect(valueKey({ field: 'pe' })).toBe('pe');
    expect(valueKey({ field: 'pe', period: 'ltm' })).toBe('pe');
    expect(valueKey({ field: 'pe', period: 'lfy' })).toBe('pe@lfy');
    // A period the field does not have is its default; a field without periods has none.
    expect(valueKey({ field: 'pe', period: '3M' })).toBe('pe');
    expect(periodOf({ field: 'cap', period: 'lfy' })).toBeUndefined();
    const lfy = { field: 'pe', op: 'lte', value: '12', period: 'lfy' } as Criterion;
    // CCC's last fiscal year was a loss: not meaningful, so it fails.
    expect(tickers(screen([[lfy]]))).toEqual(['BBB', 'DDD']);
    expect(tickers(screen([[{ ...lfy, period: 'ltm' }]]))).toEqual(['BBB', 'DDD']);
    expect(tickers(screen([[{ field: 'pe', op: 'top', value: '1', period: 'lfy' }]]))).toEqual(['AAA']);
    expect(describeScreen(screen([[lfy]]))).toBe('P/E, latest fiscal year ≤ 12');
    expect(describeScreen(screen([[{ field: 'y1', op: 'gte', value: '10', period: '3M' }]]))).toBe('Price change, 3 months ≥ 10 %');
    expect(describeScreen(screen([[{ field: 'y1', op: 'gte', value: '10' }]]))).toBe('Price change, 1 year ≥ 10 %');
  });

  it("gives the app's stocks each figure for each period, from their statements", () => {
    const aapl = appCandidates().find((c) => c.id === 'AAPL US Equity')!;
    const def = engine.get('AAPL US Equity')!;
    const f = financials(def);
    const k = keyStats(def);
    const fy = f.annual.at(-1)!;
    const q = f.quarterly.at(-1)!;
    expect(aapl.values.rev).toBeCloseTo(toUsd(f.ltm.rev, k.ccy), 6);
    expect(aapl.values['rev@lfy']).toBeCloseTo(toUsd(fy.rev, k.ccy), 6);
    expect(aapl.values['rev@lq']).toBeCloseTo(toUsd(q.rev, k.ccy), 6);
    expect(aapl.values['netMargin@lq']).toBeCloseTo((q.ni / q.rev) * 100, 6);
    expect(aapl.values['roe@lfy']).toBeCloseTo((fy.ni / fy.equity) * 100, 6);
    const prev = f.annual.at(-2)!;
    expect(aapl.values.revGrowth).toBeCloseTo((fy.rev / prev.rev - 1) * 100, 6);
    expect(aapl.values['pe@lfy']).toBeCloseTo(k.price / fy.eps, 6);
    for (const key of ['y1', 'y1@3M', 'y1@1D', 'y1@5Y', 'ebitda@lq', 'opMargin@lfy', 'epsGrowth@lq']) expect(aapl.values).toHaveProperty(key);
  });
});
