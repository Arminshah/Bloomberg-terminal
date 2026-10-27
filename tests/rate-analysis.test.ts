import { describe, expect, it } from 'vitest';
import ecbDfr from './fixtures/central-banks/ecb-dfr.csv?raw';
import { meetingsOf } from '../src/data/eco';
import { parseEcbCsv, toChanges, type PolicySeries } from '../src/data/live/policy';
import { changeSince, movesSince, rateMoves, stepPoints } from '../src/data/rate-analysis';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

const series: PolicySeries = { changes: [['2025-01-01', 3], ['2025-02-05', 2.75], ['2025-06-11', 2], ['2026-06-17', 2.25], ['2026-09-16', 2.5]], last: 2.5, asOf: '2026-10-27' };

describe('central bank rate analysis', () => {
  it("lists each move with its size, the meeting that decided it, and the days since the one before", () => {
    const moves = rateMoves(series, meetingsOf('ECB'));
    expect(moves.map((m) => [m.date, m.change])).toEqual([['2025-02-05', -0.25], ['2025-06-11', -0.75], ['2026-06-17', 0.25], ['2026-09-16', 0.25]]);
    // The calendar the app holds starts in 2026: the 2025 moves have no meeting named.
    expect(moves.map((m) => m.meeting)).toEqual([undefined, undefined, '2026-06-11', '2026-09-10']);
    expect(moves[0].gapDays).toBeNaN();
    expect(moves[3].gapDays).toBe(91);
    // The ECB's own series as published: one move, decided on 10 September 2026.
    expect(rateMoves(toChanges(parseEcbCsv(ecbDfr))!, meetingsOf('ECB'))).toEqual([{ date: '2026-09-16', level: 2.5, change: 0.25, meeting: '2026-09-10', gapDays: NaN }]);
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
});
