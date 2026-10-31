import { describe, expect, it } from 'vitest';
import { dimColour, GRAPH_COLOURS } from '../src/functions/FA';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe("FA's graph colours (TE04 05:19)", () => {
  it('draws the lines orange, green, yellow and violet in the order ticked', () => {
    expect(GRAPH_COLOURS.slice(0, 4)).toEqual(['#fe9f11', '#29c828', '#eadb1c', '#cf66fd']);
  });

  it("dims an estimate year's bar to the frame's colours, within a JPEG's error", () => {
    // Measured on the frame: orange #FE9F11 dims to #664E2A, green #29C828 to #325831.
    for (const [bright, dim] of [['#fe9f11', '#664e2a'], ['#29c828', '#325831']]) {
      const got = rgb(dimColour(bright));
      rgb(dim).forEach((v, i) => expect(Math.abs(got[i] - v)).toBeLessThanOrEqual(2));
    }
  });
});
