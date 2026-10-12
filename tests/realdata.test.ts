import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { dayNum, DAY_MS } from '../src/data/calendar';
import { earningsEvents, keyStats, nextEarnings } from '../src/data/fundamentals';
import { buildRealFund, usTiming } from '../src/data/live/yfund';
import { impliedShares, yahooQuotes } from '../src/data/live/yahoo';
import { atmVolAt, realChain, type Leg } from '../src/data/live/yopt';
import { parseTreasuryCsv } from '../src/data/live/ust';
import { levelOn, parseBoeCsv, parseEcbCsv, parseNyFed, parseValet, policyRates, toChanges } from '../src/data/live/policy';
import { centralBanks, ecoEvents } from '../src/data/eco';

import summary from './fixtures/yahoo-apld-summary.json';
import timeseries from './fixtures/yahoo-apld-timeseries.json';
import options from './fixtures/yahoo-apld-options.json';
import treasuryCsv from './fixtures/treasury-2026.csv?raw';
import stream from './fixtures/yahoo-stream.json';

const APLD = 'APLD US Equity';
const NOW = Date.UTC(2026, 9, 12, 12);
const apldFund = () => buildRealFund(engine.get(APLD)!, structuredClone(summary), structuredClone(timeseries), structuredClone(timeseries), structuredClone(timeseries), NOW);

describe('real company data (Applied Digital, from Yahoo Finance)', () => {
  it('reads the analyst consensus and broker actions as reported', () => {
    const f = apldFund();
    expect(f.consensus).toMatchObject({ n: 15, strongBuy: 2, buy: 13, hold: 2, sell: 0, hi: 93, lo: 22 });
    expect(f.consensus!.avg).toBeCloseTo(64.27, 2);
    const wells = f.views.find((v) => v.firm === 'Wells Fargo')!;
    expect(wells).toMatchObject({ rating: 'Overweight', target: 55, prevTarget: 50, action: 'Raise PT' });
    expect(f.views.find((v) => v.firm === 'Needham')).toMatchObject({ target: 70, prevTarget: 83, action: 'Cut PT' });
    expect(f.views.find((v) => v.firm === 'Rothschild & Co')).toMatchObject({ rating: 'Neutral', action: 'Initiate', target: 22 });
  });

  it('uses the real report dates and times, and the next date as an estimate', () => {
    const f = apldFund();
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const done = f.earnings.filter((e) => e.actual != null);
    expect(done.map((e) => iso(e.date))).toEqual(['2026-01-07', '2026-04-08', '2026-07-27', '2026-10-07']);
    expect(done.every((e) => !e.approx && e.timing === 'Aft-mkt')).toBe(true);
    expect(done.map((e) => e.actual)).toEqual([0, 0.09, 0.04, -0.01]);
    const next = f.earnings[f.earnings.length - 1];
    expect(iso(next.date)).toBe('2027-01-06');
    expect(next).toMatchObject({ actual: null, approx: true, timing: '--' });
  });

  it('builds statements from filings, hides impossible figures and rolls the latest quarter into LTM', () => {
    const f = apldFund();
    expect(f.annual.map((p) => [p.label, Math.round(p.rev * 10) / 10])).toEqual([
      ['FY 2023', 55.4],
      ['FY 2024', 165.6],
      ['FY 2025', 228.6],
      ['FY 2026', 611.3],
    ]);
    // The feed reports -33.3M revenue for the May 2025 quarter: shown as missing, not as a number.
    expect(f.quarterly[0].rev).toBeNaN();
    // The newest quarter (Aug 2026) comes from the earnings module before the statements feed has it.
    const last = f.quarterly[f.quarterly.length - 1];
    expect(last.label).toBe('Q1 27');
    expect(last.rev).toBeCloseTo(341.875, 3);
    expect(f.ltm!.rev).toBeCloseTo(126.589 + 126.637 + 258.749 + 341.875, 2);
    expect(f.estimates!.fy1).toMatchObject({ label: 'FY 2027' });
    expect(f.estimates!.fy1.eps).toBeCloseTo(-1.063, 3);
    expect(f.estimates!.fy2.rev).toBeCloseTo(1956.8, 1);
  });

  it('lists holders and the ownership breakdown as filed', () => {
    const f = apldFund();
    expect(f.holders[0].name).toBe('Hood River Capital Management LLC');
    expect(f.holders[0].pct).toBeCloseTo(7.45, 2);
    expect(f.breakdown!.insiders).toBeCloseTo(7.59, 1);
    expect(f.breakdown!.institutions).toBeCloseTo(73.59, 1);
  });

  it('times US reports against the New York session', () => {
    expect(usTiming(Date.UTC(2026, 9, 7, 20, 27))).toBe('Aft-mkt');
    expect(usTiming(Date.UTC(2026, 9, 7, 11, 0))).toBe('Bef-mkt');
    expect(usTiming(Date.UTC(2026, 9, 7, 4, 0))).toBe('--');
  });
});

describe('real quotes fill gaps with nothing, not with generated figures', () => {
  it('has no P/E for a loss-maker and no invented forward multiple', () => {
    const def = engine.get('MSFT US Equity')!;
    yahooQuotes.set(def.id, { trailingPE: undefined, forwardPE: -38.8, priceToBook: 4.39, trailingAnnualDividendYield: 0, epsTrailingTwelveMonths: -1.62 });
    const ks = keyStats(def);
    expect(ks.pe).toBeNaN();
    expect(ks.fpe).toBeNaN();
    expect(ks.pb).toBeCloseTo(4.39, 2);
    // The yield comes from the dividends paid, which arrive with the price history, not from the quote's own field.
    expect(ks.divYld).toBeNaN();
    expect(ks.epsLtm).toBe(-1.62);
    yahooQuotes.delete(def.id);
  });

  it('takes earnings dates from the quote when company data is not loaded', () => {
    const def = engine.get('KO US Equity')!;
    const now = engine.now();
    yahooQuotes.set(def.id, { earningsTimestamp: (now - 5 * DAY_MS) / 1000, earningsTimestampStart: (now + 80 * DAY_MS) / 1000, isEarningsDateEstimate: true });
    const ev = earningsEvents(def);
    expect(ev).toHaveLength(2);
    expect(ev[0].actual).toBeNaN();
    expect(ev[1]).toMatchObject({ actual: null, approx: true, timing: '--' });
    expect(nextEarnings(def)?.date).toBe(ev[1].date);
    yahooQuotes.delete(def.id);
  });

  it('derives share counts from the provider market cap, fixing pence', () => {
    const def = engine.get(APLD)!;
    expect(impliedShares(def, 7_160_527_360, 23.68)).toBeCloseTo(302.39, 1);
    const shell = engine.securities.find((d) => d.minor && d.eq)!;
    const px = 2700;
    const shares = shell.eq!.shares;
    // A cap quoted in pence comes out 100x too large and is scaled back.
    expect(impliedShares(shell, shares * 1e6 * px, px)).toBeCloseTo(shares, 0);
    expect(impliedShares(shell, (shares * 1e6 * px) / 100, px)).toBeCloseTo(shares, 0);
  });
});

describe('external lines in the engine', () => {
  it('shows no spread without a real bid and offer, and marks end-of-day sources', () => {
    const id = 'USGG7YR Index';
    const today = engine.today;
    const bars = Array.from({ length: 30 }, (_, i) => ({ day: today - 30 + i, o: 5, h: 5, l: 5, c: 5 + i / 100, v: 0 }));
    engine.setExternalDaily(id, bars, { eod: true });
    const q = engine.quote(id)!;
    expect(q.src).toBe('EOD');
    expect(q.last).toBeCloseTo(5.29, 6);
    expect(q.prevClose).toBeCloseTo(5.28, 6);
    expect(q.bid).toBeNaN();
    expect(engine.daily(id).c[engine.daily(id).length - 1]).toBeCloseTo(5.29, 6);
  });
});

describe('listed options (Yahoo Finance)', () => {
  const r = options.optionChain.result[0];
  const leg: Leg = { calls: r.options[0].calls, puts: r.options[0].puts, at: Date.now() };
  const exp = r.options[0].expirationDate * 1000;

  it('builds the chain around spot with real quotes and computed Greeks', () => {
    const def = engine.get(APLD)!;
    const today = engine.today;
    engine.setExternalDaily(APLD, [
      { day: today - 2, o: 24, h: 24.2, l: 23.5, c: 23.85, v: 1e7 },
      { day: today - 1, o: 23.8, h: 24.1, l: 22.8, c: 23.68, v: 2e7 },
    ]);
    const chain = realChain(def, exp, leg, 3, exp - 4 * DAY_MS);
    // Listed strikes, half-dollar ones included, three each side of the strike nearest 23.68.
    expect(chain.rows.map((x) => x.strike)).toEqual([22, 22.5, 23, 23.5, 24, 24.5, 25]);
    const atm = chain.rows.find((x) => x.strike === 24)!;
    const c = r.options[0].calls.find((x: { strike: number }) => x.strike === 24)!;
    expect(atm.call.bid).toBe(c.bid);
    expect(atm.call.ask).toBe(c.ask);
    expect(atm.call.oi).toBe(c.openInterest);
    expect(atm.call.iv).toBeCloseTo(c.impliedVolatility * 100, 6);
    expect(atm.call.delta).toBeGreaterThan(0.2);
    expect(atm.call.delta).toBeLessThan(0.8);
    expect(atm.put.delta).toBeLessThan(0);
    expect(chain.atmIv).toBeGreaterThan(20);
    expect(atm.call.ticker).toBe('APLD US 10/16/26 C24 Equity');
  });

  it('interpolates ATM vol in total variance between expiries', () => {
    const now = Date.UTC(2026, 0, 1);
    const term = [
      { expiry: now + 10 * DAY_MS - 20 * 3600_000, iv: 50 },
      { expiry: now + 40 * DAY_MS - 20 * 3600_000, iv: 40 },
    ];
    expect(atmVolAt(term, 5, now)).toBe(50);
    expect(atmVolAt(term, 60, now)).toBe(40);
    const mid = atmVolAt(term, 25, now);
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(50);
  });
});

describe('official rates', () => {
  it('parses the Treasury par yield curve by tenor', () => {
    const curve = parseTreasuryCsv(treasuryCsv);
    const d = dayNum(Date.UTC(2026, 9, 9));
    expect(curve.get('USGG2YR Index')!.get(d)).toBe(4.8);
    expect(curve.get('USGG3M Index')!.get(d)).toBe(4.25);
    expect(curve.get('USGG20YR Index')!.get(d)).toBe(5.65);
    // Yahoo streams 10Y; the Treasury file does not override it.
    expect(curve.has('USGG10YR Index')).toBe(false);
  });

  it("reads each central bank's own format and turns it into moves", () => {
    const nyfed = JSON.stringify({
      refRates: [
        { effectiveDate: '2026-10-08', type: 'EFFR', percentRate: 3.88, targetRateFrom: 3.75, targetRateTo: 4.0 },
        { effectiveDate: '2026-09-17', type: 'EFFR', percentRate: 3.88, targetRateFrom: 3.75, targetRateTo: 4.0 },
        { effectiveDate: '2026-09-16', type: 'EFFR', percentRate: 3.63, targetRateFrom: 3.5, targetRateTo: 3.75 },
        { effectiveDate: '2026-06-16', type: 'EFFR', percentRate: 3.63, targetRateFrom: 3.5, targetRateTo: 3.75 },
      ],
    });
    const parsed = parseNyFed(nyfed);
    const fed = toChanges(parsed.upper)!;
    expect(fed.changes).toEqual([
      ['2026-06-16', 3.75],
      ['2026-09-17', 4],
    ]);
    expect(fed.asOf).toBe('2026-10-08');
    expect(levelOn(fed, '2026-09-16')).toBe(3.75);
    expect(levelOn(fed, '2026-09-20')).toBe(4);
    expect(toChanges(parsed.rate)!.last).toBe(3.88);

    const ecbCsv = [
      'KEY,FREQ,REF_AREA,CURRENCY,PROVIDER_FM,INSTRUMENT_FM,PROVIDER_FM_ID,DATA_TYPE_FM,TIME_PERIOD,OBS_VALUE,OBS_STATUS,TITLE',
      'FM.D.U2.EUR.4F.KR.DFR.LEV,D,U2,EUR,4F,KR,DFR,LEV,2026-06-16,2.0,A,"Deposit facility, level"',
      'FM.D.U2.EUR.4F.KR.DFR.LEV,D,U2,EUR,4F,KR,DFR,LEV,2026-06-17,2.25,A,"Deposit facility, level"',
      'FM.D.U2.EUR.4F.KR.DFR.LEV,D,U2,EUR,4F,KR,DFR,LEV,2026-09-16,2.5,A,"Deposit facility, level"',
    ].join('\n');
    const ecb = toChanges(parseEcbCsv(ecbCsv))!;
    expect(ecb.changes.map(([d]) => d)).toEqual(['2026-06-16', '2026-06-17', '2026-09-16']);
    expect(ecb.last).toBe(2.5);

    expect(parseBoeCsv('DATE,IUDBEDR\r\n01 Oct 2026,3.75\r\n08 Oct 2026,3.75\r\n')).toEqual([
      ['2026-10-01', 3.75],
      ['2026-10-08', 3.75],
    ]);
    expect(parseValet(JSON.stringify({ observations: [{ d: '2026-10-08', V39079: { v: '2.25' } }] }), 'V39079')).toEqual([['2026-10-08', 2.25]]);
  });

  it('uses real rates for the banks that have them and keeps the rest as reference settings', () => {
    const fed = toChanges([
      ['2026-06-16', 3.75],
      ['2026-09-17', 4],
      ['2026-10-08', 4],
    ])!;
    const ecb = toChanges([
      ['2026-06-17', 2.25],
      ['2026-09-16', 2.5],
      ['2026-10-08', 2.5],
    ])!;
    policyRates.set({ fedUpper: fed, ecb });
    const banks = centralBanks();
    const f = banks.find((b) => b.code === 'FED')!;
    expect(f).toMatchObject({ rate: 4, last: '2026-09-16', real: true });
    expect(f.lastMove).toBeCloseTo(0.25, 9);
    expect(banks.find((b) => b.code === 'ECB')).toMatchObject({ rate: 2.5, last: '2026-09-10', real: true });
    expect(banks.find((b) => b.code === 'BOE')!.real).toBeFalsy();
    const sep = ecoEvents(Date.UTC(2026, 8, 15), Date.UTC(2026, 8, 18), Date.UTC(2026, 9, 1)).find((e) => e.id === 'FED:2026-09-16')!;
    expect(sep).toMatchObject({ prior: 3.75, actual: 4, survey: null, real: true });
    policyRates.set({});
  });
});

describe('real quotes during a session', () => {
  it('extends the intraday series minute by minute past its first capacity', () => {
    const id = 'CCY:CHF';
    const today = engine.today;
    engine.setExternalDaily(id, [
      { day: today - 2, o: 1.24, h: 1.25, l: 1.23, c: 1.245, v: 0 },
      { day: today - 1, o: 1.245, h: 1.26, l: 1.24, c: 1.25, v: 0 },
    ]);
    const start = (today - 1) * DAY_MS;
    // 24 hours of quotes, one a minute: more bars than the series starts with.
    for (let m = 0; m < 1440; m++) engine.setExternalQuote(id, { last: 1.25 + m / 1e6, time: start + m * 60_000, day: today - 1, marketOpen: true });
    const s = engine.intraday(id);
    expect(s.length).toBe(1440);
    expect(s.c[s.length - 1]).toBeCloseTo(1.25 + 1439 / 1e6, 9);
    for (let i = 1; i < s.length; i++) expect(s.t[i] - s.t[i - 1]).toBe(60_000);
  });
});

describe('streaming quotes (Yahoo pricing protobuf)', () => {
  it('decodes captured messages into clean prices', async () => {
    const { decodeTick, cleanPrice } = await import('../src/data/live/ystream');
    const fx = decodeTick(stream['EURUSD=X'])!;
    expect(fx.id).toBe('EURUSD=X');
    expect(fx.price).toBeCloseTo(1.12148, 5);
    expect(fx.exchange).toBe('CCY');
    expect(fx.quoteType).toBe(14);
    expect(fx.marketHours).toBe(1);
    expect(new Date(fx.time).toISOString().startsWith('2026-10-12T01:')).toBe(true);
    const btc = decodeTick(stream['BTC-USD'])!;
    expect(btc.price).toBeGreaterThan(80_000);
    expect(btc.dayHigh).toBeGreaterThan(btc.dayLow!);
    expect(btc.circulatingSupply).toBeGreaterThan(19_000_000);
    expect(btc.marketCap).toBeGreaterThan(1e12);
    // AAPL trading overnight: the stream flags it outside the regular session.
    const aapl = decodeTick(stream.AAPL)!;
    expect(aapl.price).toBe(336.96);
    expect(aapl.marketHours).not.toBe(1);
    expect(cleanPrice(336.9599914550781, 2)).toBe(336.96);
    expect(cleanPrice(83757.640625, 2)).toBe(83757.64);
    expect(decodeTick('not base64 at all!')).toBeNull();
  });

  it('counts weekend trading in Monday’s session except for crypto', async () => {
    const { sessionDay, barsFromChart } = await import('../src/data/live/yahoo');
    const sundayEvening = Date.UTC(2026, 9, 12, 1, 20); // Sunday 21:20 in New York
    const et = -4 * 3600_000;
    expect(new Date(sessionDay(sundayEvening, et, false) * DAY_MS).toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(new Date(sessionDay(sundayEvening, et, true) * DAY_MS).toISOString().slice(0, 10)).toBe('2026-10-11');
    // Yahoo's futures chart dates the open Sunday session on Sunday; it becomes Monday's bar.
    const ts = (iso: string) => Date.parse(iso) / 1000;
    const chart = {
      chart: {
        result: [
          {
            meta: { gmtoffset: -14400 },
            timestamp: [ts('2026-10-08T04:00:00Z'), ts('2026-10-09T04:00:00Z'), ts('2026-10-12T01:20:55Z')],
            indicators: { quote: [{ open: [7850, 7816, 7860], high: [7860, 7865, 7885], low: [7800, 7810, 7855], close: [7816.25, 7859.75, 7880.5], volume: [1, 2, 3] }] },
          },
        ],
      },
    };
    const { bars } = barsFromChart(chart, false, false);
    expect(bars.map((b) => new Date(b.day * DAY_MS).toISOString().slice(0, 10))).toEqual(['2026-10-08', '2026-10-09', '2026-10-12']);
    expect(bars[2].c).toBe(7880.5);
  });
});

describe('quote hygiene', () => {
  it('drops crossed or far-off bids and offers', async () => {
    const { saneTouch } = await import('../src/data/live/yahoo');
    expect(saneTouch(1.1206, 1.1199, 1.1216)).toEqual([NaN, NaN]);
    expect(saneTouch(23.54, 25.12, 23.68)).toEqual([23.54, NaN]);
    expect(saneTouch(23.6, 23.7, 23.68)).toEqual([23.6, 23.7]);
    expect(saneTouch(undefined, undefined, 10)).toEqual([undefined, undefined]);
  });
});

describe('futures contracts from the source', () => {
  it('reads the front contract from a continuous quote and lists contract months', async () => {
    const { frontContract, contractSymbols } = await import('../src/data/live/yquotes');
    expect(frontContract({ shortName: 'E-Mini S&P 500 Dec 26', expireIsoDate: '2026-12-18T00:00:00Z', openInterest: 1881988 })).toMatchObject({ code: 'Z26', month: 'Dec 26', openInterest: 1881988 });
    expect(frontContract({ shortName: 'Corn Futures,Dec-2026', expireIsoDate: '2026-12-14T00:00:00Z' })).toMatchObject({ code: 'Z26' });
    expect(frontContract({ shortName: 'Brent Crude Oil Last Day Financ', expireIsoDate: '2026-11-02T00:00:00Z' })).toBeNull();
    // Yahoo cuts some names short; the contract symbol still names the month.
    expect(frontContract({ underlyingSymbol: 'RTYZ26.CME', shortName: 'E-mini Russell 2000 Index Futur', expireIsoDate: '2026-12-18T00:00:00Z', openInterest: 433709 })).toMatchObject({ code: 'Z26', month: 'Dec 26', openInterest: 433709 });
    expect(frontContract({ underlyingSymbol: 'NQZ26.CME', expireIsoDate: '2026-12-18T00:00:00Z' })).toMatchObject({ code: 'Z26' });
    const from = new Date(Date.UTC(2026, 9, 12));
    expect(contractSymbols('CL', 'NYM', 'All months', 3, from).map((x) => x.symbol)).toEqual(['CLV26.NYM', 'CLX26.NYM', 'CLZ26.NYM']);
    expect(contractSymbols('GC', 'CMX', 'G,J,M,Q,V,Z', 3, from).map((x) => x.symbol)).toEqual(['GCV26.CMX', 'GCZ26.CMX', 'GCG27.CMX']);
    expect(contractSymbols('ZQ', 'CBT', 'All months', 2, from).map((x) => x.symbol)).toEqual(['ZQV26.CBT', 'ZQX26.CBT']);
  });
});

describe('dividend yields from paid dividends', () => {
  it('sums the dividends that went ex in the past year', async () => {
    const { paidInYear } = await import('../src/data/live/yahoo');
    const { isoToDay } = await import('../src/data/calendar');
    // SPY's dividends as Yahoo lists them on 12 Oct 2026.
    const spy = [
      ['2025-09-19', 1.831],
      ['2025-12-19', 1.993],
      ['2026-03-20', 1.797],
      ['2026-06-18', 1.904],
      ['2026-09-18', 1.889],
    ].map(([d, amount]) => ({ day: isoToDay(d as string), amount: amount as number }));
    expect(paidInYear(spy, isoToDay('2026-10-12'))).toBeCloseTo(7.583, 9);
    // On the anniversary of an ex-date, that dividend has dropped out and the new one counts.
    expect(paidInYear(spy, isoToDay('2026-09-19'))).toBeCloseTo(1.993 + 1.797 + 1.904 + 1.889, 9);
    expect(paidInYear(undefined, isoToDay('2026-10-12'))).toBe(0);
  });
});

describe('dividend amounts', () => {
  it('shows the digits the source gives and drops single-precision noise', async () => {
    const { fmtAmount } = await import('../src/functions/DVD');
    expect(fmtAmount(0.278)).toBe('0.278');
    expect(fmtAmount(0.2775)).toBe('0.2775');
    expect(fmtAmount(0.52)).toBe('0.52');
    expect(fmtAmount(29.179998)).toBe('29.18');
    expect(fmtAmount(18.279999)).toBe('18.28');
    expect(fmtAmount(NaN)).toBe('--');
  });
});
