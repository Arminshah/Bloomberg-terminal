import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { parseNasdaqListings } from '../src/data/live/earnings-calendar';
import { appCandidates, complete, describeScreen, evaluate, meets, NM, runScreen, usCandidates, type Candidate, type Criterion, type ScreenDef } from '../src/data/screen';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import list from './fixtures/nasdaq-screener-2026-10.json';

// Rows of Nasdaq's stock list as it answered on 26 October 2026: large caps, an ADR, recent listings, rows with no
// market value or no sector, and a preferred share.
const parsed = parseNasdaqListings(JSON.stringify(list));
if ('error' in parsed) throw new Error(parsed.error);
const listings = parsed.data;

const screen = (groups: Criterion[][], missing: ScreenDef['missing'] = 'leave-out', exclude = ''): ScreenDef => ({ universe: 'us', groups, missing, exclude });
const cand = (values: Candidate['values']): Candidate => ({ ticker: 'X', name: 'X', values });

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
