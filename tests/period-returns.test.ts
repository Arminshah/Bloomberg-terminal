import { afterEach, describe, expect, it } from 'vitest';
import { periodChange, periodStart } from '../src/data/analytics';
import { dayNum } from '../src/data/calendar';
import { engine } from '../src/data/market';
import { realDividends } from '../src/data/live/yahoo';
import { totalReturn1Y } from '../src/functions/DESEquity';

describe('returns over a year count from the close a year before the latest session', () => {
  // NVIDIA, read before the open on 28 October 2026: the last close was the 27th's. Counted from the calendar day the
  // year started on 28 October 2025, the day after a 5% rise (DES showed +8.67%; Tiingo's adjusted closes give +14.09%).
  const ID = 'NVDA US Equity';
  const day = (iso: string) => dayNum(Date.parse(`${iso}T00:00:00Z`));
  const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  afterEach(() => realDividends.delete(ID));

  it('anchors on the last bar, and reinvests the dividends on their ex-dates', () => {
    const bars = [
      ['2025-10-24', 186.26],
      ['2025-10-27', 191.49],
      ['2025-10-28', 201.03],
      ['2026-10-26', 216],
      ['2026-10-27', 217.94],
    ] as const;
    realDividends.set(ID, [
      { day: day('2025-12-04'), amount: 0.01 },
      { day: day('2026-03-11'), amount: 0.01 },
      { day: day('2026-06-04'), amount: 0.25 },
      { day: day('2026-09-10'), amount: 0.25 },
    ]);
    engine.setExternalDaily(ID, bars.map(([d, c]) => ({ day: day(d), o: c, h: c, l: c, c, v: 1 })));
    const s = engine.daily(ID);
    expect(periodStart(s, '1Y')).toBe(ms('2025-10-27'));
    expect(periodStart(s, '1M')).toBe(ms('2026-09-27'));
    expect(periodChange(ID, '1Y')).toBeCloseTo((217.94 / 191.49 - 1) * 100, 6);
    expect(totalReturn1Y(engine.get(ID)!)).toBeCloseTo(14.09, 2);
  });
});
