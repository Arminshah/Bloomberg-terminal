import { describe, expect, it } from 'vitest';
import { adjustedBeta, defaultBenchmark, lookbackStart, pairedReturns, periodCloses, periodKey } from '../src/finance/beta';
import { regress } from '../src/finance/stats';
import { isoToDay } from '../src/data/calendar';
import { engine } from '../src/data/market';

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const bars = (rows: [string, number][]) => ({ t: rows.map(([d]) => ms(d)), c: rows.map(([, c]) => c), length: rows.length });
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// Five weeks around Easter 2026. Good Friday (3 April) closes both markets, so that week ends on Thursday 2 April;
// Easter Monday (6 April) closes the European security but not the US index. Intraweek closes are noise that must
// not enter the weekly returns. Friday-to-Friday the index moves +2%, -2%, +4%, 0% and the security +3%, -1%, +5%, -1%.
const index = bars([
  ['2026-03-25', 98.5], ['2026-03-26', 99.2], ['2026-03-27', 100],
  ['2026-03-30', 101], ['2026-03-31', 100.4], ['2026-04-01', 101.7], ['2026-04-02', 102],
  ['2026-04-06', 101.2], ['2026-04-07', 100.5], ['2026-04-08', 100.9], ['2026-04-09', 100.1], ['2026-04-10', 99.96],
  ['2026-04-13', 101], ['2026-04-14', 102.5], ['2026-04-15', 103], ['2026-04-16', 103.5], ['2026-04-17', 103.9584],
  ['2026-04-20', 104.4], ['2026-04-21', 103.1], ['2026-04-22', 102.8], ['2026-04-23', 103.6], ['2026-04-24', 103.9584],
]);
const stock = bars([
  ['2026-03-25', 197], ['2026-03-26', 198.4], ['2026-03-27', 200],
  ['2026-03-30', 203], ['2026-03-31', 204.1], ['2026-04-01', 205.5], ['2026-04-02', 206],
  ['2026-04-07', 205], ['2026-04-08', 204.4], ['2026-04-09', 203.1], ['2026-04-10', 203.94],
  ['2026-04-13', 207], ['2026-04-14', 210.2], ['2026-04-15', 211], ['2026-04-16', 213.3], ['2026-04-17', 214.137],
  ['2026-04-20', 215], ['2026-04-21', 212.4], ['2026-04-22', 211.1], ['2026-04-23', 211.8], ['2026-04-24', 211.99563],
]);
const all = [-Infinity, Infinity] as const;

describe('calendar-week returns for BETA', () => {
  it('ends weeks on Friday and puts weekend bars in the following week', () => {
    expect(periodKey(isoToDay('2026-03-27'), 'W')).toBe(periodKey(isoToDay('2026-03-23'), 'W')); // Fri, Mon
    expect(periodKey(isoToDay('2026-03-28'), 'W')).toBe(periodKey(isoToDay('2026-04-03'), 'W')); // Sat, next Fri
    expect(periodKey(isoToDay('2026-03-28'), 'W')).toBe(periodKey(isoToDay('2026-03-27'), 'W') + 1);
  });

  it('takes the last available close of each week, Thursday when Friday is a holiday', () => {
    const w = periodCloses(index, 'W', ...all);
    expect(w.map((p) => iso(p.t))).toEqual(['2026-03-27', '2026-04-02', '2026-04-10', '2026-04-17', '2026-04-24']);
    expect(w.map((p) => p.c)).toEqual([100, 102, 99.96, 103.9584, 103.9584]);
    expect(periodCloses(stock, 'W', ...all).map((p) => p.c)).toEqual([200, 206, 203.94, 214.137, 211.99563]);
  });

  it('aligns weekly returns by week and regresses them (hand-computed)', () => {
    const r = pairedReturns(periodCloses(index, 'W', ...all), periodCloses(stock, 'W', ...all));
    [0.02, -0.02, 0.04, 0].forEach((v, i) => expect(r.x[i]).toBeCloseTo(v, 12));
    [0.03, -0.01, 0.05, -0.01].forEach((v, i) => expect(r.y[i]).toBeCloseTo(v, 12));
    // By hand: mean x 0.01, mean y 0.015; Sxx 0.002, Sxy 0.0022, Syy 0.0027.
    // beta = 0.0022/0.002 = 1.1; alpha = 0.015 - 1.1 × 0.01 = 0.004; R² = 0.0022²/(0.002 × 0.0027) = 484/540;
    // SSE = Syy - beta × Sxy = 0.00028; SE(beta) = sqrt(0.00028 / (4 - 2) / 0.002) = sqrt(0.07).
    const reg = regress(r.x, r.y);
    expect(reg.n).toBe(4);
    expect(reg.beta).toBeCloseTo(1.1, 10);
    expect(reg.alpha).toBeCloseTo(0.004, 10);
    expect(reg.r2).toBeCloseTo(484 / 540, 10);
    expect(reg.stdErr).toBeCloseTo(Math.sqrt(0.07), 10);
    // Adjusted beta = 0.67 × 1.1 + 0.33 = 1.067.
    expect(adjustedBeta(reg.beta)).toBeCloseTo(1.067, 10);
  });

  it('differs from grouping blocks of five sessions, which mixes weeks', () => {
    // The old grouping compounded consecutive blocks of five aligned daily returns; around a holiday the blocks
    // straddle weeks, so it cannot reproduce Friday-to-Friday returns.
    const r = pairedReturns(periodCloses(index, 'D', ...all), periodCloses(stock, 'D', ...all));
    const blocks = (a: number[]) => [0, 5, 10].map((i) => a.slice(i, i + 5).reduce((p, x) => p * (1 + x), 1) - 1);
    expect(blocks(r.x)[0]).not.toBeCloseTo(0.02, 4);
  });

  it('lets a whole week missing on one side span two weeks on both', () => {
    const shut = bars(stock.t.map((t, i) => [iso(t), stock.c[i]] as [string, number]).filter(([d]) => d < '2026-04-06' || d > '2026-04-10'));
    const r = pairedReturns(periodCloses(index, 'W', ...all), periodCloses(shut, 'W', ...all));
    expect(r.dates.map(iso)).toEqual(['2026-04-02', '2026-04-17', '2026-04-24']);
    expect(r.x[1]).toBeCloseTo(103.9584 / 102 - 1, 12);
    expect(r.y[1]).toBeCloseTo(214.137 / 206 - 1, 12);
  });

  it('ends months on their last session and uses yield changes for rates', () => {
    const m = bars([['2026-01-29', 4.1], ['2026-01-30', 4.2], ['2026-02-02', 4.0], ['2026-02-27', 4.35], ['2026-03-02', 4.3], ['2026-03-31', 4.05]]);
    const closes = periodCloses(m, 'M', ...all, true);
    expect(closes.map((p) => iso(p.t))).toEqual(['2026-01-30', '2026-02-27', '2026-03-31']);
    const r = pairedReturns(closes, closes, true, true);
    expect(r.x[0]).toBeCloseTo(0.15, 12);
    expect(r.x[1]).toBeCloseTo(-0.3, 12);
  });

  it('keeps only closes inside the lookback window and counts calendar years', () => {
    expect(iso(lookbackStart(ms('2026-10-16'), 24))).toBe('2024-10-16');
    expect(iso(lookbackStart(ms('2026-03-31'), 6))).toBe('2025-09-30');
    expect(iso(lookbackStart(ms('2028-02-29'), 12))).toBe('2027-02-28');
    const w = periodCloses(index, 'W', ms('2026-04-01'), ms('2026-04-16'));
    // The partial first week still ends on its last session; the partial last week on the last close in range.
    expect(w.map((p) => [iso(p.t), p.c])).toEqual([['2026-04-02', 102], ['2026-04-10', 99.96], ['2026-04-16', 103.5]]);
  });
});

describe('BETA default relative index', () => {
  const has = (id: string) => !!engine.get(id);
  const sec = (id: string, country: string, region: 'Americas' | 'EMEA' | 'APAC') => ({ id, country, region });

  it('uses the local index of the security’s country, by engine id', () => {
    expect(defaultBenchmark(sec('AAPL US Equity', 'US', 'Americas'), has)).toBe('SPX Index');
    expect(defaultBenchmark(sec('SAP GY Equity', 'DE', 'EMEA'), has)).toBe('DAX Index');
    expect(defaultBenchmark(sec('MC FP Equity', 'FR', 'EMEA'), has)).toBe('CAC Index');
    expect(defaultBenchmark(sec('ASML NA Equity', 'NL', 'EMEA'), has)).toBe('AEX Index');
    expect(defaultBenchmark(sec('SHEL LN Equity', 'GB', 'EMEA'), has)).toBe('UKX Index');
    expect(defaultBenchmark(sec('NESN SW Equity', 'CH', 'EMEA'), has)).toBe('SMI Index');
    expect(defaultBenchmark(sec('SAN SM Equity', 'ES', 'EMEA'), has)).toBe('IBEX Index');
    expect(defaultBenchmark(sec('ENI IM Equity', 'IT', 'EMEA'), has)).toBe('FTSEMIB Index');
    expect(defaultBenchmark(sec('7203 JT Equity', 'JP', 'APAC'), has)).toBe('NKY Index');
    expect(defaultBenchmark(sec('700 HK Equity', 'HK', 'APAC'), has)).toBe('HSI Index');
    for (const id of ['SPX Index', 'DAX Index', 'CAC Index', 'AEX Index', 'UKX Index', 'SMI Index', 'IBEX Index', 'FTSEMIB Index', 'NKY Index', 'HSI Index', 'SXXP Index']) {
      expect(engine.get(id)?.cls, id).toBe('index');
    }
  });

  it('falls back to STOXX Europe 600 for Belgium until BEL20 is in the engine', () => {
    const belgian = sec('ABI BB Equity', 'BE', 'EMEA');
    expect(defaultBenchmark(belgian, (id) => id !== 'BEL20 Index' && has(id))).toBe('SXXP Index');
    expect(defaultBenchmark(belgian, (id) => id === 'BEL20 Index' || has(id))).toBe('BEL20 Index');
  });

  it('keeps the regional rule elsewhere and never regresses an index on itself', () => {
    expect(defaultBenchmark(sec('VOLVB SS Equity', 'SE', 'EMEA'), has)).toBe('SXXP Index');
    expect(defaultBenchmark(sec('BHP AU Equity', 'AU', 'APAC'), has)).toBe('NKY Index');
    expect(defaultBenchmark(sec('SHOP CN Equity', 'CA', 'Americas'), has)).toBe('SPX Index');
    expect(defaultBenchmark(sec('SPX Index', 'US', 'Americas'), has)).toBe('INDU Index');
    expect(defaultBenchmark(sec('DAX Index', 'DE', 'EMEA'), has)).toBe('SXXP Index');
    expect(defaultBenchmark(sec('SXXP Index', 'EU', 'EMEA'), has)).toBe('SPX Index');
  });
});
