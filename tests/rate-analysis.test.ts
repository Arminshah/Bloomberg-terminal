import { describe, expect, it } from 'vitest';
import ecbDfr from './fixtures/central-banks/ecb-dfr.csv?raw';
import { meetingsOf } from '../src/data/eco';
import { parseEcbCsv, toChanges, type PolicySeries } from '../src/data/live/policy';
import { changeSince, movesSince, rateMoves, stepPoints } from '../src/data/rate-analysis';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

const series: PolicySeries = { changes: [['2025-01-01', 3], ['2025-02-05', 2.75], ['2025-06-11', 2], ['2026-06-17', 2.25], ['2026-09-16', 2.5]], last: 2.5, asOf: '2026-10-27' };

describe('central bank rate analysis', () => {
  it('lists observed moves and keeps calendar comparisons separate from confirmed decision linkage', () => {
    const moves = rateMoves(series, meetingsOf('ECB'));
    expect(moves.map((m) => [m.date, m.change])).toEqual([['2025-02-05', -0.25], ['2025-06-11', -0.75], ['2026-06-17', 0.25], ['2026-09-16', 0.25]]);
    // The calendar the app holds starts in 2026: the 2025 moves have no meeting named.
    expect(moves.map((m) => m.scheduledCandidate)).toEqual([undefined, undefined, '2026-06-11', '2026-09-10']);
    expect(moves.every((m) => m.meeting === undefined)).toBe(true);
    expect(moves[0].gapDays).toBeNaN();
    expect(moves[3].gapDays).toBe(91);
    // The rate series proves the move; the calendar alone does not prove which meeting decided it.
    expect(rateMoves(toChanges(parseEcbCsv(ecbDfr))!, meetingsOf('ECB'))).toEqual([{ date: '2026-09-16', level: 2.5, change: 0.25, scheduledCandidate: '2026-09-10', gapDays: NaN }]);
  });

  it('works out the change over a period and counts the rises and cuts', () => {
    expect(changeSince(series, '2025-10-27')).toBe(0.5);
    expect(changeSince(series, '2024-06-01')).toBeNaN();
    expect(movesSince(rateMoves(series, []), '2025-10-27')).toEqual({ up: 2, down: 0 });
    expect(movesSince(rateMoves(series, []), '2025-01-01')).toEqual({ up: 2, down: 2 });
  });

  it('draws the level as steps: flat between moves, vertical on the day of each', () => {
    const until = Date.parse('2026-10-27T00:00:00Z');
    const pts = stepPoints({ changes: [['2026-01-01', 2], ['2026-06-17', 2.25]], last: 2.25, asOf: '2026-10-27' }, until);
    const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    expect(pts).toEqual([{ x: at('2026-01-01'), y: 2 }, { x: at('2026-06-17'), y: 2 }, { x: at('2026-06-17'), y: 2.25 }, { x: until, y: 2.25 }]);
  });

  it('opens under CBRT', () => {
    expect(parseCommand('CBRT', lookupFn)).toEqual({ kind: 'route', fn: 'RATEANALYSIS' });
  });

  it('caps a stale chart at its dated source and excludes future rows even if its requested endpoint is later', () => {
    const s: PolicySeries = { changes: [['2026-10-01', 4], ['2026-11-02', 3.75]], last: 3.75, asOf: '2026-10-27' };
    expect(stepPoints(s, Date.parse('2026-11-03T00:00:00Z'))).toEqual([
      { x: Date.parse('2026-10-01T00:00:00Z'), y: 4 }, { x: Date.parse('2026-10-27T00:00:00Z'), y: 4 },
    ]);
    expect(stepPoints(s, Date.parse('2026-09-30T23:59:59Z'))).toEqual([]);
  });
});
