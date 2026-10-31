import { describe, expect, it } from 'vitest';
import { storyStamp } from '../src/functions/MNEWS';

describe("COMPANYNEWS story header, as CN gives it", () => {
  it('gives the date with a four-digit year, the time to the second and the source code in brackets', () => {
    const stamp = storyStamp({ time: Date.parse('2026-10-30T14:05:09Z'), publisher: 'Benzinga' });
    expect(stamp).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:05:09 \[BZ\]$/);
  });
});
