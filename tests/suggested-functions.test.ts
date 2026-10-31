import { describe, expect, it } from 'vitest';
import { FUNCTIONS, lookupFn } from '../src/terminal/registry';

// The "Suggested Functions" footer names two functions of the app's own; each must exist, differ from the screen and
// from each other, so a renamed or removed function cannot leave a footer pointing nowhere.
describe('suggested functions', () => {
  it('point at two other functions that exist', () => {
    const withFooter = FUNCTIONS.filter((f) => f.suggested);
    expect(withFooter.map((f) => f.code).sort()).toEqual(['DEALERQUOTES', 'ESTIMATEGRAPH', 'FXFORWARD']);
    for (const f of withFooter) {
      const [a, b] = f.suggested!;
      expect(lookupFn(a)?.code).toBe(a);
      expect(lookupFn(b)?.code).toBe(b);
      expect(new Set([f.code, a, b]).size).toBe(3);
    }
  });
});
