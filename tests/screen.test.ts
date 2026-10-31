import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { parseNasdaqListings } from '../src/data/live/earnings-calendar';
import { toUsd } from '../src/data/analytics';
import { financials, keyStats } from '../src/data/fundamentals';
import { appCandidates, columnMean, complete, describeScreen, evaluate, FIELD, ftseCandidates, grossMargin, matchesAfterEach, meets, NM, periodOf, PRESETS, returnOnCommonEquity, runScreen, unitOf, usCandidates, valueKey, type Candidate, type Criterion, type ScreenDef } from '../src/data/screen';
import { annualFigures, dailyFigures, type FtseMember } from '../src/data/live/ftse100';
import { resultsCsv } from '../src/functions/ScreenResults';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import list from './fixtures/nasdaq-screener-2026-10.json';
// Yahoo's answers of 30 October 2026 (tests/ftse100.test.ts says what they hold).
import STATEMENTS from './fixtures/yahoo-ftse100-statements-2026-10-30.json';
import BATS_DAILY from './fixtures/yahoo-bats-daily-2026-10-30.json';

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

describe("SCREEN over the FTSE 100: the first portfolio paper's screen", () => {
  it('works out gross margin and return on common equity as the paper defines them', () => {
    // British American Tobacco, FY2025 (Yahoo's annual statements, in £m): gross profit 21,384 on revenue 25,610;
    // net income to common shareholders 7,677 on common equity of 47,926 at the end and 49,643 a year before.
    expect(grossMargin(21_384, 25_610)).toBeCloseTo(83.4986, 4);
    expect(returnOnCommonEquity(7_677, 47_926, 49_643)).toBeCloseTo(15.7366, 4);
    // On the average equity (48,784.5), not the closing (16.02%) or the opening (15.46%).
    expect(returnOnCommonEquity(7_677, 47_926, 49_643)).toBeCloseTo((7_677 / ((47_926 + 49_643) / 2)) * 100, 10);
    // Missing figures are missing; no revenue, or negative average equity, is not meaningful.
    expect(grossMargin(NaN, 25_610)).toBeNaN();
    expect(returnOnCommonEquity(7_677, 47_926, NaN)).toBeNaN();
    expect(grossMargin(5, 0)).toBe(NM);
    // IHG's common equity was negative at both ends of 2025.
    expect(returnOnCommonEquity(758, -2_741, -2_312)).toBe(NM);
    // Equity that turned positive during the year: the average is small and positive, the return meaningless.
    expect(returnOnCommonEquity(2_500, 1_200, -400)).toBe(NM);
    expect(returnOnCommonEquity(2_500, -400, 1_200)).toBe(NM);
  });

  it('compares strictly above and below, as "> 25" in the paper', () => {
    expect(meets({ field: 'gm', op: 'gt', value: '25' }, 25)).toBe(false);
    expect(meets({ field: 'gm', op: 'gt', value: '25' }, 25.01)).toBe(true);
    expect(meets({ field: 'gm', op: 'gte', value: '25' }, 25)).toBe(true);
    expect(meets({ field: 'roce', op: 'lt', value: '25' }, 25)).toBe(false);
    expect(meets({ field: 'roce', op: 'lt', value: '25' }, 24.99)).toBe(true);
    expect(meets({ field: 'roce', op: 'gt', value: '25' }, NM)).toBe(false);
    expect(meets({ field: 'gm', op: 'gt', value: '25' }, NaN)).toBeNull();
  });

  const members: FtseMember[] = [
    { name: 'British American Tobacco', ticker: 'BATS', root: 'BATS', yahoo: 'BATS.L', isin: 'GB0002875804', sector: 'Tobacco' },
    { name: 'HSBC', ticker: 'HSBA', root: 'HSBA', yahoo: 'HSBA.L', isin: 'GB0005405286', sector: 'Banks' },
    { name: 'Smiths Group', ticker: 'SMIN', root: 'SMIN', yahoo: 'SMIN.L', isin: 'GB00B1WY2338', sector: 'General Industrials' },
    { name: 'BT Group', ticker: 'BT.A', root: 'BT/A', yahoo: 'BT-A.L', isin: 'GB0030913577', sector: 'Telecommunications Service Providers' },
  ];
  const NOW = Date.UTC(2026, 9, 30, 18);
  const usd = (c: string) => ({ USD: 1, GBP: 1.25 })[c] ?? NaN;

  it("gives each member its latest fiscal year's ratios, its market value in pounds and the year's returns", () => {
    const by = {
      'BATS.L': { annual: annualFigures(STATEMENTS['BATS.L']), daily: dailyFigures(BATS_DAILY, NOW) },
      // HSBC reports in dollars and trades in pence: its P/E converts the price at the rate given.
      'HSBA.L': { annual: annualFigures(STATEMENTS['HSBA.L']), daily: { currency: 'GBp', last: 1277, lastDay: '2026-10-30', prev: 1292.6, base: NaN, priceReturn: NaN, totalReturn: NaN, dividends: [] } },
      'SMIN.L': { annual: annualFigures(STATEMENTS['SMIN.L']) },
    };
    const [bats, hsbc, smiths, bt] = ftseCandidates(members, by, usd);
    expect(bats).toMatchObject({ ticker: 'BATS', name: 'British American Tobacco', lookup: 'BATS LN' });
    expect(bats.values.gm).toBeCloseTo(83.4986, 4);
    expect(bats.values.roce).toBeCloseTo(15.7366, 4);
    // 2,159,189,751 shares (30 June 2026) at 45.92 pounds; P/E 45.92 over the diluted EPS of 3.491 pounds.
    expect(bats.values.cap).toBeCloseTo((2_159_189_751 * 45.92) / 1e9, 9);
    expect(bats.values['pe@lfy']).toBeCloseTo(45.92 / 3.491, 9);
    expect(bats.values).toMatchObject({ price: 4592, prev: 4516, ccy: 'GBp', fy: '2025-12-31', day: '2026-10-30', sector: 'Tobacco' });
    expect(bats.values.chg).toBeCloseTo((4592 / 4516 - 1) * 100, 9);
    expect(bats.values.tr).toBeCloseTo(13.74, 4);
    expect(bats.values.ytd).toBeCloseTo(8.9701, 4);
    // A bank has no gross margin: missing, for the screen's choice on missing values.
    expect(hsbc.values.gm).toBeNaN();
    expect(hsbc.values.roce).toBeCloseTo((21_102 / ((198_225 + 184_973) / 2)) * 100, 9);
    expect(hsbc.values['pe@lfy']).toBeCloseTo((12.77 * 1.25) / 1.2, 9);
    expect(hsbc.values.cap).toBeCloseTo((17_148_209_505 * 12.77) / 1e9, 9);
    // No starting equity, no ROE; no chart, no price, return or market value.
    expect(smiths.values.gm).toBeCloseTo((808 / 1_937) * 100, 9);
    expect(smiths.values.roce).toBeNaN();
    expect(smiths.values.cap).toBeNaN();
    expect(smiths.values.tr).toBeNaN();
    // No figures yet: every number missing, the list's name and sector kept.
    expect(bt).toMatchObject({ ticker: 'BT/A', lookup: 'BT/A LN', values: { name: 'BT Group', sector: 'Telecommunications Service Providers' } });
    expect(bt.values.gm).toBeNaN();
    expect(bt.values['pe@lfy']).toBeNaN();
    // A loss is not a P/E.
    const loss = structuredClone(STATEMENTS['BATS.L']);
    for (const r of loss.timeseries.result) if (r.meta.type[0] === 'annualDilutedEPS') r.annualDilutedEPS!.at(-1)!.reportedValue.raw = -1;
    expect(ftseCandidates(members.slice(0, 1), { 'BATS.L': { annual: annualFigures(loss), daily: dailyFigures(BATS_DAILY, NOW) } }, usd)[0].values['pe@lfy']).toBe(NM);
  });

  it("is a preset: the FTSE 100, then gross margin above 25%, then return on common equity above 25%, with the count after each", () => {
    const p = PRESETS.find((x) => x.name === 'FTSE 100: gross margin and ROE above 25%')!;
    expect(p.universe).toBe('ftse');
    const s: ScreenDef = { universe: 'ftse', groups: p.groups, missing: 'leave-out', exclude: '' };
    expect(describeScreen(s)).toBe('Gross margin, latest fiscal year > 25 % and Return on common equity, latest fiscal year > 25 %');
    // Synthetic members: margins and returns on either side of 25, a bank with no margin, one without a return.
    const cands = [
      cand({ gm: 83.5, roce: 15.7 }, 'A'),
      cand({ gm: 72.4, roce: 38.1 }, 'B'),
      cand({ gm: 25, roce: 40 }, 'C'),
      cand({ gm: NaN, roce: 11 }, 'D'),
      cand({ gm: 41.7, roce: NaN }, 'E'),
      cand({ gm: 31.3, roce: NM }, 'F'),
      cand({ gm: 93.9, roce: 27.7 }, 'G'),
    ];
    expect(matchesAfterEach(cands, s)).toEqual([[5, 2]]);
    expect(runScreen(cands, s).rows.map((r) => r.c.ticker)).toEqual(['B', 'G']);
    // Kept when undecided: the bank passes the margin and the one without a return passes both, marked.
    expect(matchesAfterEach(cands, { ...s, missing: 'keep' })).toEqual([[6, 3]]);
    // Only the FTSE 100 has these fields; its market values are in pounds.
    expect(FIELD.gm.from.app).toBeUndefined();
    expect(FIELD.roce.from.us).toBeUndefined();
    expect(unitOf(FIELD.cap, 'ftse')).toBe('£bn');
    expect(unitOf(FIELD.cap, 'us')).toBe('$bn');
    expect(describeScreen({ ...s, groups: [[{ field: 'cap', op: 'gte', value: '10' }]] })).toBe('Market value ≥ 10 £bn');
  });

  it('heads the results with "Investable Universe (n)", the plain mean of each column', () => {
    // As the paper's summary row: the simple average of the rows below, each column on its own.
    expect(columnMean([48.4, 60, 71.6])).toEqual({ mean: 60, n: 3 });
    expect(columnMean([83.4986, 72.4, 93.87]).mean).toBeCloseTo((83.4986 + 72.4 + 93.87) / 3, 12);
    // A missing or not meaningful value is left out of the mean and of the count, never read as zero.
    expect(columnMean([10, NaN, NM, 20, undefined])).toEqual({ mean: 15, n: 2 });
    expect(columnMean([]).mean).toBeNaN();
    // The export carries the same row first. Synthetic rows: two pence prices and a loss's P/E.
    const row = (ticker: string, values: Candidate['values']) => ({ c: cand(values, ticker), unknown: [] });
    const rows = [
      row('A', { gm: 80, roce: 30, cap: 10, prev: 1000, ccy: 'GBp', 'pe@lfy': 12, tr: 5, fy: '2025-12-31' }),
      row('B', { gm: 40, roce: 50, cap: 30, prev: 3000, ccy: 'GBp', 'pe@lfy': NM, tr: -5, fy: '2026-03-31' }),
    ];
    const table = resultsCsv(rows);
    expect(table[0]).toEqual(['Name', 'Ticker', 'GM LF (%)', 'ROE LF (%)', 'Market Cap (GBP bn)', 'Price:D-1', 'Currency', 'P/E', 'Total Return YTD (%)', 'Fiscal year end']);
    expect(table[1]).toEqual(['Investable Universe (2)', '', 60, 40, 20, 2000, 'GBp', 12, 0, '']);
    expect(table[3]).toEqual(['B', 'B', 40, 50, 30, 3000, 'GBp', NM, -5, '2026-03-31']);
    // Prices in different currencies have no mean.
    const mixed = resultsCsv([...rows, row('C', { prev: 33.71, ccy: 'USD' })]);
    expect(mixed[1][5]).toBe('');
    expect(mixed[1][0]).toBe('Investable Universe (3)');
  });
});
