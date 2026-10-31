import { describe, expect, it } from 'vitest';
import { indexPeriodRows } from '../src/functions/DES';
import { makeSeries } from '../src/data/series';
import { engine } from '../src/data/market';

const DAY = 86_400_000;

describe("PROFILE's period table for an index, as DES gives it", () => {
  // Daily closes for two years up to the engine's today: the close on each day is 1,000 plus the day's number in the series.
  const today = engine.today * DAY;
  const n = 730;
  const s = makeSeries(n, DAY);
  for (let i = 0; i < n; i++) {
    s.t[i] = today - (n - 1 - i) * DAY;
    s.c[i] = 1_000 + i;
  }
  s.length = n;
  const last = s.c[n - 1];
  const rows = indexPeriodRows(s, last, 1_800, today - 10 * DAY, 1_100, today - 600 * DAY);

  it('measures the year to date from the last close of the year before', () => {
    // Bars here are dated at midnight UTC; the year before's last one is dated 31 December.
    const yearStart = Date.UTC(new Date(today).getUTCFullYear(), 0, 0);
    const base = 1_000 + Math.max(...Array.from({ length: n }, (_, i) => i).filter((i) => s.t[i] <= yearStart));
    expect(rows[0]).toMatchObject({ label: 'Year to Date', level: base });
    expect(rows[0].pct).toBeCloseTo((last / base - 1) * 100, 9);
    expect(rows[0].net).toBe(last - base);
  });

  it('measures from the close a year before the latest one, and gives the high and low with their dates', () => {
    const yearAgo = 1_000 + (n - 1 - 365);
    expect(rows[1]).toMatchObject({ label: '52 Week Ago', level: yearAgo, net: last - yearAgo });
    expect(rows[2]).toMatchObject({ label: '52 Week High', level: 1_800, date: today - 10 * DAY });
    expect(rows[3]).toMatchObject({ label: '52 Week Low', level: 1_100, date: today - 600 * DAY });
    expect(rows[2].pct).toBeNaN();
  });
});
