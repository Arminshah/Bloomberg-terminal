import { describe, expect, it } from 'vitest';
import { MarketEngine } from '../src/data/engine';
import { dayNum } from '../src/data/calendar';
import { settlementDate, yieldFromClean } from '../src/finance/bonds';

const NOW = Date.parse('2026-10-12T15:30:00Z'); // a Monday

describe('MarketEngine', () => {
  const engine = new MarketEngine(() => NOW);

  it('publishes a quote for every listed security', () => {
    for (const d of engine.securities) {
      const q = engine.quote(d.id);
      expect(q, d.id).toBeDefined();
      expect(Number.isFinite(q!.last), d.id).toBe(true);
      expect(Number.isFinite(q!.prevClose), d.id).toBe(true);
    }
  });

  it('anchors yesterday close to the calibration snapshot', () => {
    // Snapshot closes are for Friday 2026-10-09; Monday prev close equals it.
    const q = engine.quote('SPX Index')!;
    expect(q.prevClose).toBeCloseTo(7811.54, 2);
    const aapl = engine.quote('AAPL US Equity')!;
    expect(aapl.prevClose).toBeCloseTo(336.64, 2);
  });

  it('keeps day moves within a plausible range', () => {
    for (const d of engine.securities) {
      const q = engine.quote(d.id)!;
      if (d.quote === 'yield') expect(Math.abs(q.chg), d.id).toBeLessThan(0.6);
      else expect(Math.abs(q.pct), d.id).toBeLessThan(d.cls === 'crypto' || d.ticker === 'VIX' ? 40 : 15);
    }
  });

  it('builds ten years of daily history ending with today', () => {
    const s = engine.daily('MSFT US Equity');
    expect(s.length).toBeGreaterThan(2500);
    expect(dayNum(s.t[s.length - 1])).toBe(dayNum(NOW));
    for (let i = 0; i < s.length; i++) {
      expect(s.h[i]).toBeGreaterThanOrEqual(Math.max(s.o[i], s.c[i]) - 1e-9);
      expect(s.l[i]).toBeLessThanOrEqual(Math.min(s.o[i], s.c[i]) + 1e-9);
      expect(s.c[i]).toBeGreaterThan(0);
    }
  });

  it('passes history through the 1-year calibration anchor', () => {
    const s = engine.daily('SPX Index');
    const target = Date.parse('2025-10-08T00:00:00Z');
    const i = Array.from(s.t).findIndex((t) => t === target);
    expect(i).toBeGreaterThan(0);
    expect(s.c[i]).toBeCloseTo(6753.72, 1);
  });

  it('derives FX crosses consistently', () => {
    const eurusd = engine.quote('EURUSD Curncy')!.last;
    const usdjpy = engine.quote('USDJPY Curncy')!.last;
    const eurjpy = engine.quote('EURJPY Curncy')!.last;
    expect(eurjpy).toBeCloseTo(eurusd * usdjpy, 6);
    const dxy = engine.quote('DXY Curncy')!.last;
    expect(dxy).toBeGreaterThan(80);
    expect(dxy).toBeLessThan(130);
  });

  it('builds intraday bars up to now', () => {
    const s = engine.intraday('AAPL US Equity');
    const minutes = Math.floor((NOW - dayNum(NOW) * 86_400_000) / 60_000);
    expect(s.length).toBe(minutes + 1);
    const q = engine.quote('AAPL US Equity')!;
    expect(s.c[s.length - 1]).toBeCloseTo(q.last, 8);
  });

  it('prices treasuries near par', () => {
    const bonds = engine.securities.filter((d) => d.yk === 'Govt');
    expect(bonds.length).toBe(7);
    for (const b of bonds) {
      const q = engine.quote(b.id)!;
      expect(q.last, b.id).toBeGreaterThan(85);
      expect(q.last, b.id).toBeLessThan(110);
    }
  });

  it('prices corporate bonds off the Treasury curve plus a credit spread', () => {
    const corps = engine.securities.filter((d) => d.yk === 'Corp');
    expect(corps.length).toBeGreaterThan(30);
    const settle = settlementDate(new Date(NOW));
    for (const b of corps) {
      const q = engine.quote(b.id)!;
      const y = engine.bondYields(b.id)!;
      expect(q.last, b.id).toBeGreaterThan(40);
      expect(q.last, b.id).toBeLessThan(130);
      expect(y.spread, b.id).toBeGreaterThan(15);
      expect(y.spread, b.id).toBeLessThan(400);
      const terms = { coupon: b.bond!.coupon, maturity: new Date(`${b.bond!.maturity}T00:00:00Z`), freq: 2 };
      expect(yieldFromClean(terms, settle, q.last), b.id).toBeCloseTo(y.last, 6);
      expect(q.ask - q.bid, b.id).toBeCloseTo(0.125, 9);
    }
  });

  it('prices index futures at fair value on the tick grid', () => {
    const es = engine.futureContract('ES1 Index')!;
    expect(es.code).toBe('ESZ6');
    expect(es.days).toBe(dayNum(Date.parse('2026-12-18T00:00:00Z')) - dayNum(NOW));
    for (const d of engine.securities.filter((x) => x.cls === 'future')) {
      const q = engine.quote(d.id)!;
      const u = engine.quote(d.fut!.underlying)!;
      expect(Math.abs(q.last / u.last - 1), d.id).toBeLessThan(0.03);
      const ticks = q.last / d.fut!.tick;
      expect(Math.abs(ticks - Math.round(ticks)), d.id).toBeLessThan(1e-6);
      expect(q.ask - q.bid, d.id).toBeCloseTo(d.fut!.tick, 9);
      expect(q.volume, d.id).toBeGreaterThan(0);
    }
    expect(engine.futureContract('HI1 Index')!.code).toBe('HIV6');
  });

  it('is deterministic across instances', () => {
    const other = new MarketEngine(() => NOW);
    expect(other.quote('NVDA US Equity')!.last).toBe(engine.quote('NVDA US Equity')!.last);
    const a = other.daily('GC1 Comdty');
    const b = engine.daily('GC1 Comdty');
    expect(a.c[100]).toBe(b.c[100]);
  });
});

describe('a weekend', () => {
  const SAT = Date.parse('2026-10-24T15:30:00Z');
  const FRI = dayNum(Date.parse('2026-10-23T00:00:00Z'));
  const THU = FRI - 1;
  const sat = new MarketEngine(() => SAT);

  it('shows a stock with Friday as its latest session, finished, and nothing dated Saturday', () => {
    const s = sat.daily('AAPL US Equity');
    expect(dayNum(s.t[s.length - 1])).toBe(FRI);
    expect(dayNum(s.t[s.length - 2])).toBe(THU);
    const q = sat.quote('AAPL US Equity')!;
    expect(q.session).toBe('closed');
    expect(q.time).toBeLessThan(Date.parse('2026-10-24T00:00:00Z'));
    expect(q.last).toBeCloseTo(s.c[s.length - 1], 8);
    expect(q.prevClose).toBeCloseTo(s.c[s.length - 2], 8);
    const intra = sat.intraday('AAPL US Equity');
    expect(intra.length).toBe(1440);
    expect(dayNum(intra.t[intra.length - 1])).toBe(FRI);
    expect(intra.c[intra.length - 1]).toBeCloseTo(q.last, 8);
  });

  it('keeps closed markets still while crypto goes on trading', () => {
    const e = new MarketEngine(() => SAT);
    const before = new Map(e.securities.map((d) => [d.id, e.quote(d.id)!.last]));
    for (let i = 0; i < 5; i++) e.tick();
    for (const d of e.securities) {
      if (d.cls === 'crypto') continue;
      expect(e.quote(d.id)!.last, d.id).toBe(before.get(d.id));
    }
    const btc = e.daily('XBTUSD Curncy');
    expect(dayNum(btc.t[btc.length - 1])).toBe(dayNum(SAT));
    expect(e.quote('XBTUSD Curncy')!.session).toBeUndefined();
    e.backfillTrades('AAPL US Equity');
    const tape = e.trades('AAPL US Equity');
    expect(tape.length).toBeGreaterThan(0);
    for (const tr of tape) expect(dayNum(tr.t)).toBe(FRI);
  });

  it('shows the same Friday on Saturday and on Sunday', () => {
    const sun = new MarketEngine(() => Date.parse('2026-10-25T09:00:00Z'));
    for (const id of ['AAPL US Equity', 'SPX Index', 'EURUSD Curncy', 'ES1 Index', 'GC1 Comdty']) {
      expect(sun.quote(id)!.last, id).toBeCloseTo(sat.quote(id)!.last, 8);
      expect(sun.quote(id)!.prevClose, id).toBeCloseTo(sat.quote(id)!.prevClose, 8);
    }
  });

  it('ends a Friday that has a real close at that close, not the Thursday before it', () => {
    // The calibration snapshot is Friday 2026-10-09's closes.
    const e = new MarketEngine(() => Date.parse('2026-10-10T12:00:00Z'));
    const q = e.quote('AAPL US Equity')!;
    expect(q.last).toBeCloseTo(336.64, 2);
    expect(Math.abs(q.prevClose - 336.64)).toBeGreaterThan(1e-6);
    const s = e.daily('SPX Index');
    expect(s.c[s.length - 1]).toBeCloseTo(7811.54, 2);
    // Monday's previous close is the same Friday.
    expect(new MarketEngine(() => NOW).quote('AAPL US Equity')!.prevClose).toBeCloseTo(q.last, 2);

    const def = { ...e.get('AAPL US Equity')!, id: 'WKND US Equity', ticker: 'WKND' };
    const bar = (day: number, c: number) => ({ day, o: c - 1, h: c + 2, l: c - 2, c, v: 1_000_000 });
    expect(e.addSecurity(def, { bars: [bar(dayNum(Date.parse('2026-10-08T00:00:00Z')), 50), bar(dayNum(Date.parse('2026-10-09T00:00:00Z')), 55)] })).toBe(true);
    const w = e.quote('WKND US Equity')!;
    expect(w.last).toBeCloseTo(55, 8);
    expect(w.open).toBeCloseTo(54, 8);
    expect(w.prevClose).toBeCloseTo(50, 8);
  });

  it('agrees with the full history build on the previous close', () => {
    for (const d of sat.securities) {
      const s = sat.daily(d.id);
      expect(s.c[s.length - 2], d.id).toBeCloseTo(sat.quote(d.id)!.prevClose, 6);
    }
  });

  it('derives FX crosses from the same finished session', () => {
    const eurjpy = sat.quote('EURJPY Curncy')!.last;
    expect(eurjpy).toBeCloseTo(sat.quote('EURUSD Curncy')!.last * sat.quote('USDJPY Curncy')!.last, 6);
    const s = sat.daily('EURJPY Curncy');
    expect(dayNum(s.t[s.length - 1])).toBe(FRI);
  });
});

describe('fast previous close', () => {
  it('matches the full history build for every security', () => {
    const e = new MarketEngine(() => Date.parse('2026-10-14T09:00:00Z'));
    for (const d of e.securities) {
      const fast = e.quote(d.id)!.prevClose;
      const s = e.daily(d.id);
      expect(s.c[s.length - 2], d.id).toBeCloseTo(fast, 6);
    }
  });

  it('constructs quickly', () => {
    const t0 = performance.now();
    new MarketEngine(() => Date.parse('2026-10-14T23:59:00Z'));
    expect(performance.now() - t0).toBeLessThan(600);
  });
});
