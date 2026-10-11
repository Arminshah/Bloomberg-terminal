import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { squarify } from '../src/functions/IMAP';
import { ecoEvents, zonedToUtc } from '../src/data/eco';
import { analystViews, consensus, dividends, earningsHistory, financials, fiscalQuarterLabel, keyStats } from '../src/data/fundamentals';
import { chainFor, expiries } from '../src/data/options';
import { aggregate } from '../src/data/series';

describe('treemap', () => {
  it('conserves area and stays inside the box', () => {
    const items = [6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ v, item: i }));
    const out = squarify(items, { x: 0, y: 0, w: 600, h: 400 });
    const area = out.reduce((a, o) => a + o.r.w * o.r.h, 0);
    expect(area).toBeCloseTo(600 * 400, 6);
    for (const o of out) {
      expect(o.r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(o.r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(o.r.x + o.r.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(o.r.y + o.r.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
});

describe('economic calendar', () => {
  it('converts zoned wall-clock time across DST', () => {
    expect(new Date(zonedToUtc(2026, 6, 15, 8, 30, 'America/New_York')).toISOString()).toBe('2026-07-15T12:30:00.000Z');
    expect(new Date(zonedToUtc(2026, 11, 15, 8, 30, 'America/New_York')).toISOString()).toBe('2026-12-15T13:30:00.000Z');
  });

  it('schedules payrolls on the first Friday and FOMC on decision days', () => {
    const ev = ecoEvents(Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-11-30T00:00:00Z'), Date.parse('2026-11-01T00:00:00Z'));
    const nfp = ev.find((e) => e.name === 'Change in Nonfarm Payrolls')!;
    expect(new Date(nfp.time).toISOString().slice(0, 10)).toBe('2026-11-06');
    expect(nfp.actual).toBeNull();
    const oct = ecoEvents(Date.parse('2026-10-26T00:00:00Z'), Date.parse('2026-10-31T00:00:00Z'), Date.parse('2026-10-31T00:00:00Z'));
    expect(oct.some((e) => e.name.startsWith('FOMC') && new Date(e.time).toISOString().startsWith('2026-10-28'))).toBe(true);
  });

  it('reveals actuals only after release', () => {
    const t = Date.parse('2026-10-14T12:30:00Z');
    const before = ecoEvents(t - 3600_000, t + 3600_000, t - 1).find((e) => e.name === 'CPI MoM')!;
    const after = ecoEvents(t - 3600_000, t + 3600_000, t + 1).find((e) => e.name === 'CPI MoM')!;
    expect(before.actual).toBeNull();
    expect(after.actual).not.toBeNull();
  });
});

describe('fundamentals', () => {
  const aapl = engine.get('AAPL US Equity')!;

  it('labels fiscal quarters from the fiscal year end', () => {
    expect(fiscalQuarterLabel(aapl, Date.parse('2026-06-27T00:00:00Z'))).toBe('Q3 26');
    expect(fiscalQuarterLabel(aapl, Date.parse('2026-12-31T00:00:00Z'))).toBe('Q1 27');
  });

  it('keeps statements internally consistent', () => {
    const f = financials(aapl);
    for (const p of [...f.annual, ...f.quarterly, f.ltm]) {
      expect(p.gp).toBeCloseTo(p.rev - p.cogs, 6);
      expect(p.ebitda).toBeCloseTo(p.opInc + p.da, 6);
      expect(p.fcf).toBeCloseTo(p.cfo - p.capex, 6);
      expect(p.totAssets).toBeCloseTo(p.totLiab + p.equity, 6);
    }
    expect(f.annual).toHaveLength(5);
    expect(f.quarterly).toHaveLength(8);
  });

  it('produces sensible valuation and consensus', () => {
    const k = keyStats(aapl);
    expect(k.mcap).toBeGreaterThan(1e6);
    expect(k.pe).toBeGreaterThan(5);
    expect(k.pe).toBeLessThan(80);
    const c = consensus(aapl);
    expect(c.buy + c.hold + c.sell).toBe(c.n);
    expect(analystViews(aapl).length).toBe(c.n);
  });

  it('never shows an actual for a future report', () => {
    const now = engine.today * 86_400_000;
    for (const d of engine.securities.filter((x) => x.cls === 'equity')) {
      for (const e of earningsHistory(d)) if (e.date > now) expect(e.actual).toBeNull();
    }
  });

  it('keeps one upcoming dividend and a history', () => {
    const list = dividends(aapl);
    const now = engine.today * 86_400_000;
    expect(list.filter((d) => d.ex > now).length).toBeLessThanOrEqual(1);
    expect(list.length).toBeGreaterThan(15);
    expect(dividends(engine.get('TSLA US Equity')!)).toHaveLength(0);
  });
});

describe('options', () => {
  it('builds a monotone chain around the money', () => {
    const nvda = engine.get('NVDA US Equity')!;
    const exp = expiries(engine.now());
    expect(exp.length).toBeGreaterThan(8);
    const ch = chainFor(nvda, exp[3], 8);
    for (let i = 1; i < ch.rows.length; i++) {
      expect(ch.rows[i].call.mid).toBeLessThanOrEqual(ch.rows[i - 1].call.mid + 1e-9);
      expect(ch.rows[i].put.mid).toBeGreaterThanOrEqual(ch.rows[i - 1].put.mid - 1e-9);
    }
    for (const r of ch.rows) expect(r.call.ask).toBeGreaterThanOrEqual(r.call.bid);
  });
});

describe('series aggregation', () => {
  it('aggregates daily bars into months without losing extremes', () => {
    const d = engine.daily('SPX Index');
    const m = aggregate(d, 'M');
    let maxD = -Infinity;
    let maxM = -Infinity;
    for (let i = 0; i < d.length; i++) maxD = Math.max(maxD, d.h[i]);
    for (let i = 0; i < m.length; i++) maxM = Math.max(maxM, m.h[i]);
    expect(maxM).toBe(maxD);
    expect(m.c[m.length - 1]).toBe(d.c[d.length - 1]);
  });
});
