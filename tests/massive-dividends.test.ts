import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dividendDisagreement, dividends, yahooRounded } from '../src/data/fundamentals';
import { massiveDividendData, parseMassiveDividends } from '../src/data/live/massive-dividends';
import { nasdaqData } from '../src/data/live/nasdaq-company';
import { realFund } from '../src/data/live/yfund';
import { realDividends } from '../src/data/live/yahoo';
import { engine } from '../src/data/market';
// Massive's dividend record for Coca-Cola as it answered on 28 October 2026 (newest 8 rows).
import KO from './fixtures/massive-dividends-ko-2026-10-28.json?raw';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const ID = 'KO US Equity';

describe("Massive's dividend record", () => {
  it('reads each dividend with its four dates and the amount as declared', () => {
    const rows = parseMassiveDividends(KO);
    if ('error' in rows) throw new Error(rows.error);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ ex: day('2026-12-01'), declared: day('2026-10-15'), record: day('2026-12-01'), pay: day('2026-12-15'), amount: 0.53, type: 'Cash', currency: 'USD' });
    expect(parseMassiveDividends('{"status":"ERROR","error":"Unknown API Key"}')).toEqual({ error: 'Massive: Unknown API Key' });
    expect(parseMassiveDividends('<html>')).toEqual({ error: 'Massive answered with something other than its data.' });
  });
});

describe("DIVIDENDS for a stock Nasdaq's record does not cover", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-28T20:00:00Z'));
    realFund.set(ID, { nextDividend: null } as never);
    // Yahoo's price history: the dividends already paid, ex-date and amount only.
    realDividends.set(ID, [
      { day: day('2026-03-13') / 86_400_000, amount: 0.53 },
      { day: day('2026-06-15') / 86_400_000, amount: 0.53 },
      { day: day('2026-09-15') / 86_400_000, amount: 0.53 },
    ]);
    nasdaqData.set((s) => ({ v: s.v + 1, by: { ...s.by, KO: { dividends: { state: 'ok', data: null } } } }));
    const rows = parseMassiveDividends(KO);
    if ('error' in rows) throw new Error(rows.error);
    massiveDividendData.set((s) => ({ v: s.v + 1, by: { ...s.by, KO: { state: 'ok', rows } } }));
  });
  afterEach(() => {
    vi.useRealTimers();
    realFund.delete(ID);
    realDividends.delete(ID);
    nasdaqData.set((s) => ({ v: s.v + 1, by: {} }));
    massiveDividendData.set((s) => ({ v: s.v + 1, by: {} }));
  });

  it("shows Coca-Cola's dividend declared on 15 October 2026, which no source gave before", () => {
    const list = dividends(engine.get(ID)!);
    expect(list[0]).toMatchObject({ ex: day('2026-12-01'), declared: day('2026-10-15'), record: day('2026-12-01'), pay: day('2026-12-15'), amount: 0.53, type: 'Declared' });
    // The paid ones gain their declaration, record and payable dates; nothing disagrees.
    expect(list.find((d) => d.ex === day('2026-09-15'))).toMatchObject({ declared: day('2026-07-15'), pay: day('2026-10-01'), amount: 0.53 });
    expect(list.some((d) => d.disagree)).toBe(false);
  });

  it("says when Massive's record and Yahoo's history disagree, naming Massive", () => {
    realDividends.set(ID, [{ day: day('2026-09-15') / 86_400_000, amount: 0.56 }]);
    const row = dividends(engine.get(ID)!).find((d) => d.ex === day('2026-09-15'))!;
    expect(row.disagree).toBe('The sources disagree: amount 0.56 (Yahoo Finance) against 0.53 (Massive).');
  });
});

describe("Sources disagree: Yahoo's rounding is the same dividend", () => {
  it("reads Walmart's 0.248 in Yahoo's history as Nasdaq's 0.2475, not a disagreement", () => {
    // Walmart paid $0.2475 a quarter in 2026 and $0.2075 in 2024 (Nasdaq's record); Yahoo's history gives 0.248 and 0.208.
    expect(yahooRounded(0.248, 0.2475)).toBe(true);
    expect(yahooRounded(0.208, 0.2075)).toBe(true);
    const row = { ex: day('2026-08-21'), pay: day('2026-09-02'), amount: 0.248 };
    expect(dividendDisagreement(row, { ...row, amount: 0.2475 })).toBeUndefined();
    // Not rounding: an amount with three decimals that differs, or Yahoo's with more decimals than three.
    expect(yahooRounded(0.25, 0.248)).toBe(false);
    expect(yahooRounded(0.2475, 0.248)).toBe(false);
    expect(dividendDisagreement(row, { ...row, amount: 0.246 })).toContain('amount 0.248 (Yahoo Finance) against 0.246 (Nasdaq)');
  });
});
