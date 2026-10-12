import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import { engine } from '../src/data/market';
import { resolveSecurity } from '../src/data/registry';
import { keyStats } from '../src/data/fundamentals';
import { dayNum } from '../src/data/calendar';
import { anchorsFromBars, defFromFinnhub, defFromYahoo, lookupSecurity, normalizeTicker, sectorFromIndustry } from '../src/data/live/lookup';

import sofiChart from './fixtures/yahoo-sofi-chart.json';
import sofiSummary from './fixtures/yahoo-sofi-summary.json';

const FIXTURES: Record<string, unknown> = { 'yahoo-sofi-chart.json': sofiChart, 'yahoo-sofi-summary.json': sofiSummary };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixture = (name: string): any => structuredClone(FIXTURES[name]);
const parse = (s: string) => parseCommand(s, lookupFn);

describe('ticker input', () => {
  it('accepts cashtags and resolves built-in APLD', () => {
    for (const s of ['APLD', '$APLD', '$apld DES', 'APLD US <EQUITY> GP <GO>']) {
      const p = parse(s);
      expect(p.kind === 'route' && p.sec?.id, s).toBe('APLD US Equity');
    }
  });

  it('marks unknown tickers for online lookup', () => {
    expect(parse('SOFI')).toMatchObject({ kind: 'error', lookup: 'SOFI' });
    expect(parse('$SOFI DES')).toMatchObject({ kind: 'error', lookup: 'SOFI' });
    expect(parse('SOFI US EQUITY GP')).toMatchObject({ kind: 'error', lookup: 'SOFI' });
    expect(parse('SOFI US')).toMatchObject({ kind: 'error', lookup: 'SOFI' });
    expect(parse('ZZZZ NOPE')).toMatchObject({ kind: 'error', lookup: undefined });
    expect(parse('hello world again')).toMatchObject({ kind: 'error', lookup: undefined });
  });

  it('normalises ticker spellings', () => {
    expect(normalizeTicker('$sofi')).toBe('SOFI');
    expect(normalizeTicker('BRK.B')).toBe('BRK/B');
    expect(normalizeTicker('brk-b us equity')).toBe('BRK/B');
    expect(normalizeTicker('not a ticker')).toBeNull();
  });

  it('explains how to enable lookups when no source is configured', async () => {
    const r = await lookupSecurity('SOFI');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Finnhub key|desktop app/);
  });
});

describe('securities from Yahoo Finance', () => {
  it('builds a calibrated equity from chart and profile data', () => {
    const built = defFromYahoo('SOFI', fixture('yahoo-sofi-chart.json'), fixture('yahoo-sofi-summary.json'));
    if ('error' in built) throw new Error(built.error);
    const { def, bars } = built;
    expect(def.id).toBe('SOFI US Equity');
    expect(def.exch).toBe('NASDAQ GS');
    expect(def.eq!.sector).toBe('Financials');
    expect(def.eq!.shares).toBeGreaterThan(500);
    expect(def.eq!.ceo).toBe('Anthony J. Noto');
    expect(def.vol).toBeGreaterThan(0.1);
    expect(def.dynamic!.anchors.length).toBeGreaterThan(4);

    expect(engine.addSecurity(def, { bars })).toBe(true);
    expect(engine.addSecurity(def, { bars })).toBe(false);
    expect(resolveSecurity('SOFI')?.id).toBe('SOFI US Equity');
    expect(parse('SOFI DES')).toMatchObject({ kind: 'route', fn: 'DES' });
    // History passes through the real closes.
    const last = bars.filter((b) => b.day < engine.today).at(-1)!;
    const s = engine.daily(def.id);
    const i = [...s.t.subarray(0, s.length)].findIndex((t) => dayNum(t) === last.day);
    expect(s.c[i]).toBeCloseTo(last.c, 6);
    expect(Number.isFinite(engine.quote(def.id)!.last)).toBe(true);
    expect(Number.isFinite(keyStats(def).mcap)).toBe(true);
  });

  it('leaves figures the source does not give missing instead of inventing them', () => {
    const summary = fixture('yahoo-sofi-summary.json');
    const r = summary.quoteSummary.result[0];
    delete r.defaultKeyStatistics.beta;
    delete r.defaultKeyStatistics.bookValue;
    delete r.financialData.totalDebt;
    delete r.assetProfile.fullTimeEmployees;
    delete r.summaryDetail.dividendRate;
    const built = defFromYahoo('SOFIX', fixture('yahoo-sofi-chart.json'), summary);
    if ('error' in built) throw new Error(built.error);
    const eq = built.def.eq!;
    // Before, these read 1, a third of market cap, cash only, 0 and 0.
    expect(eq.beta).toBeNaN();
    expect(eq.book).toBeNaN();
    expect(eq.netDebt).toBeNaN();
    expect(eq.emp).toBeNaN();
    expect(eq.dps).toBeNaN();
  });

  it('rejects funds and non-US listings', () => {
    const chart = fixture('yahoo-sofi-chart.json');
    chart.chart.result[0].meta.instrumentType = 'ETF';
    expect(defFromYahoo('XYZ', chart, null)).toMatchObject({ error: expect.stringMatching(/only stocks/) });
    const foreign = fixture('yahoo-sofi-chart.json');
    foreign.chart.result[0].meta.exchangeName = 'LSE';
    foreign.chart.result[0].meta.currency = 'GBp';
    expect(defFromYahoo('XYZ', foreign, null)).toMatchObject({ error: expect.stringMatching(/US exchange/) });
  });

  it('keeps snapshot-style anchors', () => {
    const bars = Array.from({ length: 600 }, (_, i) => ({ day: 19000 + i, o: 1, h: 1, l: 1, c: 1 + i, v: 1 }));
    const a = anchorsFromBars(bars);
    expect(a[0][1]).toBe(600);
    expect(a.map(([, v]) => v)).toContain(600 - 252);
  });
});

describe('securities from Finnhub', () => {
  it('turns period returns into calibration anchors', () => {
    const today = dayNum(Date.parse('2026-10-12T15:00:00Z'));
    const profile = { country: 'US', currency: 'USD', exchange: 'NASDAQ NMS - GLOBAL MARKET', name: 'Example Robotics Inc', shareOutstanding: 120, marketCapitalization: 6000, finnhubIndustry: 'Machinery', ipo: '2019-05-01' };
    const metric = { metric: { '52WeekPriceReturnDaily': 25, '13WeekPriceReturnDaily': -10, beta: 1.4, revenuePerShareTTM: 8, netProfitMarginTTM: 12, bookValuePerShareQuarterly: 10, '3MonthAverageTradingVolume': 2.5, '3MonthADReturnStd': 48 } };
    const quote = { c: 50, pc: 49, o: 49.5, h: 50.5, l: 48.8, t: Date.parse('2026-10-12T15:00:00Z') / 1000 };
    const built = defFromFinnhub('EXRB', profile, metric, quote, today);
    if ('error' in built) throw new Error(built.error);
    expect(built.def.eq!.sector).toBe('Industrials');
    expect(built.def.eq!.rev).toBeCloseTo(960, 6);
    expect(built.def.vol).toBeCloseTo(0.48, 6);
    expect(built.def.adv).toBe(2_500_000);
    // Market open: yesterday's close is the previous close anchor; a 25% 1Y gain means 40 a year ago.
    expect(built.anchors[0]).toEqual([dayNum(Date.parse('2026-10-09T00:00:00Z')), 49]);
    expect(built.anchors.some(([, v]) => Math.abs(v - 40) < 1e-9)).toBe(true);
    expect(defFromFinnhub('ZZZ', {}, {}, { c: 0 }, today)).toMatchObject({ error: expect.stringMatching(/not found/) });
  });

  it('maps industries to sectors', () => {
    expect(sectorFromIndustry('Semiconductors')).toBe('Information Technology');
    expect(sectorFromIndustry('Banking')).toBe('Financials');
    expect(sectorFromIndustry('Biotechnology')).toBe('Health Care');
    expect(sectorFromIndustry('Media')).toBe('Communication Services');
    expect(sectorFromIndustry('Oil & Gas')).toBe('Energy');
  });
});
