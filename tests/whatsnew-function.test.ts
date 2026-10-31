import { describe, expect, it } from 'vitest';
import { changesFor } from '../src/functions/WHATSNEW';

// "See What's New in DES" (the help menu, TE01 04:45) lists the release-note lines that name the function by its
// code or its mnemonic, and nothing else.
describe("what's new for one function", () => {
  it('keeps only list lines that name the function, by code or mnemonic, as a whole word', () => {
    const changes = changesFor('PROFILE');
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) {
      for (const line of c.lines) {
        expect(line).toMatch(/^\s*[-*]/);
        expect(line).toMatch(/(^|[^A-Za-z0-9])(PROFILE|DES)(?![A-Za-z0-9])/);
      }
    }
    // DESC or DESIGN are not DES.
    expect(changes.flatMap((c) => c.lines).some((l) => /(^|[^A-Za-z0-9])(PROFILE|DES)(?![A-Za-z0-9])/.test(l))).toBe(true);
  });
});
