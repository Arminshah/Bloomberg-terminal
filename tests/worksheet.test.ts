import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { keyStats } from '../src/data/fundamentals';
import { realFund, type RealFund } from '../src/data/live/yfund';
import { fundamentalFields, FUNDAMENTAL_COLUMNS } from '../src/data/worksheet-fields';
import { sheetColumns, worksheetRow, WORKSHEET_COLUMNS } from '../src/functions/WS';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import { DEFAULT_WORKSHEET_COLUMNS } from '../src/terminal/userdata';

const emptyFund: RealFund = {
  fetched: 0,
  annual: [],
  quarterly: [],
  ltm: null,
  earnings: [],
  holders: [],
  breakdown: null,
  stats: {},
  nextDividend: null,
  float: { float: NaN, short: NaN, shortPctFloat: NaN, daysToCover: NaN, asOf: NaN, shortPrior: NaN, priorAsOf: NaN },
  officers: [],
};

describe('Worksheets (W)', () => {
  it('opens under W, as the official chapter list names it; WATCHLIST keeps WATCH', () => {
    expect(parseCommand('W', lookupFn)).toEqual({ kind: 'route', fn: 'WORKSHEET' });
    expect(parseCommand('WATCH', lookupFn)).toEqual({ kind: 'route', fn: 'WATCHLIST' });
  });

  it("offers the watchlist's market fields and the fundamentals, and keeps a sheet's own order", () => {
    expect(WORKSHEET_COLUMNS.map((c) => c.id)).toEqual(expect.arrayContaining(['PX_LAST', 'CHG_PCT_1D', 'ARMIN_MKT_CAP_USD', 'ARMIN_EV_USD', 'ARMIN_PE', 'ARMIN_EV_EBITDA']));
    expect(WORKSHEET_COLUMNS.some((c) => c.id === 'ARMIN_TODAY')).toBe(false);
    expect(sheetColumns(['ARMIN_PE', 'PX_LAST', 'ARMIN_PE', 'NOT_A_FIELD']).map((c) => c.id)).toEqual(['ARMIN_PE', 'PX_LAST']);
    expect(sheetColumns([]).map((c) => c.id)).toEqual(DEFAULT_WORKSHEET_COLUMNS);
  });

  it("gives a stock its fundamentals as PEERS works them out, with source and status, and nothing for other securities", () => {
    const def = engine.get('AAPL US Equity')!;
    const f = fundamentalFields(def);
    expect([...f.keys()]).toEqual(FUNDAMENTAL_COLUMNS.map((c) => c.id));
    const k = keyStats(def);
    expect(f.get('ARMIN_PE')!.value).toBe(k.pe);
    expect(f.get('ARMIN_EV_USD')!.value).toBeCloseTo(k.ev * engine.usdValue(k.ccy) * 1e6, 3);
    expect(f.get('ARMIN_SECTOR')!.value).toBe(def.eq!.sector);
    // The browser build's figures are the demo engine's, and say so.
    expect(f.get('ARMIN_PE')!.status).toBe('DEMO DATA');
    expect(f.get('ARMIN_PE')!.source).toBe('Demo engine');
    expect(fundamentalFields(engine.get('EURUSD Curncy')).size).toBe(0);
  });

  it('leaves a stock blank in the desktop app until its statements load, then names where they came from', () => {
    const def = engine.get('AAPL US Equity')!;
    const saved = { realOnly: engine.realOnly, fund: realFund.get(def.id) };
    try {
      engine.realOnly = true;
      realFund.delete(def.id);
      const before = fundamentalFields(def);
      expect(before.get('ARMIN_PE')).toMatchObject({ value: null, status: 'UNAVAILABLE', note: "The company's statements have not loaded." });
      // The sector is the app's own, so it shows before anything loads.
      expect(before.get('ARMIN_SECTOR')).toMatchObject({ value: def.eq!.sector, status: 'REFERENCE', source: "The app's security definition" });
      // Loaded, but with no statements and no beta in the answer: still blank, now for that reason, and the source named.
      realFund.set(def.id, { ...emptyFund, statementsFrom: 'SEC EDGAR' });
      const after = fundamentalFields(def);
      expect(after.get('ARMIN_PE')).toMatchObject({ value: null, source: "SEC EDGAR statements and the app's last price", note: 'Not meaningful or not available for this company.' });
      // No provider beta: a blank, not the security list's starting value.
      expect(after.get('ARMIN_BETA')!.value).toBeNull();
      expect(def.eq!.beta).toBeGreaterThan(0);
      realFund.set(def.id, { ...emptyFund, stats: { beta: 1.21 }, statsFrom: 'Finnhub' });
      expect(fundamentalFields(def).get('ARMIN_BETA')).toMatchObject({ value: 1.21, source: 'Finnhub company summary' });
    } finally {
      engine.realOnly = saved.realOnly;
      if (saved.fund) realFund.set(def.id, saved.fund);
      else realFund.delete(def.id);
    }
  });

  it('shows a zero dividend yield as zero, for a company that pays none', () => {
    const def = engine.securities.find((d) => d.cls === 'equity' && d.eq && keyStats(d).divYld === 0)!;
    expect(fundamentalFields(def).get('ARMIN_DIV_YLD')!.value).toBe(0);
  });

  it("puts a row's market and fundamental fields together", () => {
    const row = worksheetRow('AAPL US Equity', engine.get('AAPL US Equity'), engine.now());
    expect(row.fields.has('PX_LAST')).toBe(true);
    expect(row.fields.has('ARMIN_MKT_CAP_USD')).toBe(true);
  });
});
