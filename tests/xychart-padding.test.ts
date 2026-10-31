import { describe, expect, it } from 'vitest';
import { xPadding, type XYSeries } from '../src/components/chart/XYChart';

const bars = (xs: number[]): XYSeries => ({ label: 'b', color: '#fff', kind: 'bar', points: xs.map((x) => ({ x, y: 1 })) });

describe('room at the ends of the x axis', () => {
  it('keeps the outer bars of a short bar chart inside: at least half a step', () => {
    // Four quarters, a step of 1: 6% of the range (0.18) is less than the half bar (0.35) that hangs past each end.
    expect(xPadding([bars([0, 1, 2, 3])], 0, 3)).toBe(0.5);
    // Many bars: 6% of the range is already more than half a step.
    expect(xPadding([bars([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])], 0, 20)).toBeCloseTo(1.2, 9);
  });

  it('leaves lines and single bars as before', () => {
    expect(xPadding([{ label: 'l', color: '#fff', points: [{ x: 0, y: 1 }, { x: 10, y: 2 }] }], 0, 10)).toBeCloseTo(0.3, 9);
    expect(xPadding([bars([5])], 5, 5)).toBe(1);
  });
});
