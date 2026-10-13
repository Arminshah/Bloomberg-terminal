import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { dayNum, DAY_MS } from '../src/data/calendar';
import { earningsEvents, keyStats, nextEarnings } from '../src/data/fundamentals';
import { buildRealFund, fundDue, FUND_TTL, realFund, usTiming } from '../src/data/live/yfund';
import { dropVolumeSpikes, impliedShares, yahooQuotes } from '../src/data/live/yahoo';
import { parseTreasuryCsv } from '../src/data/live/ust';
import { rangeStats } from '../src/data/analytics';
import { levelOn, parseBoeCsv, parseEcbCsv, parseNyFed, parseValet, policyRates, toChanges } from '../src/data/live/policy';
import { centralBanks, ecoEvents } from '../src/data/eco';

import summary from './fixtures/yahoo-apld-summary.json';
import timeseries from './fixtures/yahoo-apld-timeseries.json';
import treasuryCsv from './fixtures/treasury-2026.csv?raw';
import stream from './fixtures/yahoo-stream.json';

const APLD = 'APLD US Equity';
const NOW = Date.UTC(2026, 9, 12, 12);
const apldFund = () => buildRealFund(engine.get(APLD)!, structuredClone(summary), structuredClone(timeseries), structuredClone(timeseries), structuredClone(timeseries), NOW);

describe('company data refresh', () => {
  const report = (date: number, actual: number | null) => ({ period: 'Q3 26', date, estimate: -0.5, actual, surprise: null, timing: '--' as const, revEst: NaN, revAct: null });
  it('reloads after 6 hours, or hourly once a pending report is due', () => {
    const t0 = Date.UTC(2026, 9, 12, 12);
    const quiet = { fetched: t0, earnings: [report(Date.UTC(2026, 10, 10, 12), null)] };
    expect(fundDue(quiet, t0 + 30 * 60_000)).toBe(false);
    expect(fundDue(quiet, t0 + FUND_TTL - 1)).toBe(false);
    expect(fundDue(quiet, t0 + FUND_TTL)).toBe(true);
    // The report was due this morning and the loaded data has no actual for it yet.
    const waiting = { fetched: t0, earnings: [report(t0 - 3 * 3600_000, null)] };
    expect(fundDue(waiting, t0 + 30 * 60_000)).toBe(false);
    expect(fundDue(waiting, t0 + 3600_000)).toBe(true);
    // Reported: back to the 6-hour rule.
    const done = { fetched: t0, earnings: [report(t0 - 3 * 3600_000, -0.4)] };
    expect(fundDue(done, t0 + 3600_000)).toBe(false);
  });
});

describe('real company data (Applied Digital, from Yahoo Finance)', () => {
  it('keeps no analyst data, even from an answer that carries it', () => {
    // The fixture is a raw answer captured before the main process stripped analyst modules.
    const f = apldFund() as unknown as Record<string, unknown>;
    for (const k of ['consensus', 'views', 'estimates']) expect(f[k]).toBeUndefined();
    expect((f.stats as Record<string, unknown>).fpe).toBeUndefined();
  });

  it('uses the real report dates and times, and the next date as an estimate', () => {
    const f = apldFund();
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const done = f.earnings.filter((e) => e.actual != null || e.revAct != null);
    expect(done.map((e) => iso(e.date))).toEqual(['2026-01-07', '2026-04-08', '2026-07-27', '2026-10-07']);
    expect(done.every((e) => !e.approx && e.timing === 'Aft-mkt')).toBe(true);
    // Reported diluted EPS from the statements; the latest quarter's EPS is not in them yet, its revenue is.
    expect(done.map((e) => e.actual)).toEqual([-0.07, -0.36, -0.39, null]);
    expect(done.map((e) => e.revAct)).toEqual([126.589, 126.637, 258.749, 341.875]);
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

describe('figures that sit side by side agree', () => {
  it('works P/E and enterprise value out from the EPS, market cap and balance sheet shown', () => {
    const def = engine.get(APLD)!;
    const today = engine.today;
    engine.setExternalDaily(APLD, [
      { day: today - 2, o: 24, h: 24.2, l: 23.5, c: 23.85, v: 1e7 },
      { day: today - 1, o: 23.8, h: 24.1, l: 22.8, c: 23.68, v: 2e7 },
    ]);
    const fund = apldFund();
    // The source's own ratios on other bases (as for Nebius: P/E 164.1 next to an LTM EPS of -0.08).
    fund.stats.pe = 164.1;
    fund.stats.ev = 999_999;
    fund.stats.evEbitda = 243.2;
    fund.ltm = { ...fund.ltm!, eps: -0.08 };
    realFund.set(def.id, fund);
    let ks = keyStats(def);
    expect(ks.epsLtm).toBe(-0.08);
    expect(ks.pe).toBeNaN();
    expect(ks.ev).not.toBe(999_999);
    expect(ks.ev).toBeCloseTo(ks.mcap + def.eq!.netDebt, 6);
    fund.ltm = { ...fund.ltm!, eps: 2 };
    ks = keyStats(def);
    expect(ks.pe).toBeCloseTo(ks.price / 2, 6);
    realFund.delete(def.id);
  });

  it('drops the volume of a minute bar that the day volume rules out, and keeps a real closing print', () => {
    const bars = Array.from({ length: 390 }, () => ({ v: 20_000 }));
    bars[200].v = 10_552_546;
    expect(dropVolumeSpikes(bars, 13_918_067)).toBe(1);
    expect(bars[200].v).toBe(0);
    const ok = Array.from({ length: 390 }, () => ({ v: 20_000 }));
    ok[389].v = 2_000_000;
    expect(dropVolumeSpikes(ok, 389 * 20_000 + 2_000_000)).toBe(0);
    expect(ok[389].v).toBe(2_000_000);
  });
});

describe('second audit round (15 stocks)', () => {
  it("uses the company's reported revenue when the statements feed adds other items", () => {
    const s = structuredClone(summary);
    // As for Berkshire, whose feed adds investment gains: the latest year differs from the reported figure by over 2%.
    const yearly = s.quoteSummary.result[0].earnings.financialsChart.yearly;
    yearly[yearly.length - 1].revenue = { raw: 500_000_000, fmt: '500M', longFmt: '500,000,000' };
    const f = buildRealFund(engine.get(APLD)!, s, structuredClone(timeseries), structuredClone(timeseries), structuredClone(timeseries), NOW);
    expect(f.annual[f.annual.length - 1].rev).toBe(500);
    const fq = s.quoteSummary.result[0].earnings.financialsChart.quarterly;
    const aug = f.quarterly.find((p) => new Date(p.end).toISOString().startsWith('2026-08'));
    if (aug) expect(aug.rev).toBeCloseTo(fq[fq.length - 1].revenue.raw / 1e6, 6);
  });

  it('gives a report stamped at midnight UTC no time of day', () => {
    expect(usTiming(Date.UTC(2026, 3, 28))).toBe('--');
  });

  it('takes the 52-week high and low from the last 365 days, not the last 252 sessions', () => {
    const id = 'TSLA US Equity';
    const today = engine.today;
    // The high on the first weekday more than a year back (HOOD's was 367 days back).
    let hiDay = today - 366;
    while ([0, 6].includes(new Date(hiDay * DAY_MS).getUTCDay())) hiDay--;
    const bars = [];
    for (let d = today - 400; d <= today; d++) {
      const dow = new Date(d * DAY_MS).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      // Market holidays: with them, 252 sessions reach back past a year.
      if (d % 12 === 0 && d !== hiDay && d !== today) continue;
      bars.push({ day: d, o: 100, h: d === hiDay ? 153.56 : 101, l: 100, c: 100.5, v: 1e6 });
    }
    // The old 252-session window would have taken that high.
    expect(bars.findIndex((b) => b.day === hiDay)).toBeGreaterThanOrEqual(bars.length - 252);
    engine.setExternalDaily(id, bars);
    expect(rangeStats(id).hi52).toBeLessThan(150);
  });
});

describe('real quotes fill gaps with nothing, not with generated figures', () => {
  it('has no P/E for a loss-maker and no invented forward multiple', () => {
    const def = engine.get('MSFT US Equity')!;
    yahooQuotes.set(def.id, { trailingPE: undefined, forwardPE: -38.8, priceToBook: 4.39, trailingAnnualDividendYield: 0, epsTrailingTwelveMonths: -1.62 });
    const ks = keyStats(def);
    expect(ks.pe).toBeNaN();
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

describe('the quote before the first poll', () => {
  it('gives only the date of the daily bar, then the trade time once a quote arrives', () => {
    const id = 'MSFT US Equity';
    const today = engine.today;
    engine.setExternalDaily(id, [
      { day: today - 1, o: 400, h: 405, l: 398, c: 402, v: 1e7 },
      { day: today, o: 402, h: 410, l: 401, c: 409, v: 2e7 },
    ]);
    let q = engine.quote(id)!;
    // Not "00:00" and not "Market closed": the bar has a date, and whether the market is open is not known yet.
    expect(q.dayOnly).toBe(true);
    expect(q.src).toBe('UNCONFIRMED');
    expect(dayNum(q.time)).toBe(today);
    const t = today * DAY_MS + 20 * 3600_000;
    engine.setExternalQuote(id, { last: 409.5, time: t, day: today, marketOpen: false, timing: 'realtime' });
    q = engine.quote(id)!;
    expect(q.dayOnly).toBeUndefined();
    expect(q.src).toBe('CLOSE');
    expect(q.time).toBe(t);
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
