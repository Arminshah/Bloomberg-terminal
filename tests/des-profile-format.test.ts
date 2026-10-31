import { describe, expect, it } from 'vitest';
import { inMillions, marketCapText } from '../src/functions/DESEquity';

// DES writes the market value in billions from a billion up, shares in millions (brochure 2025 p.13: "2,400.3B",
// "5,534.0M/4,755.5M").
describe('DES profile figures', () => {
  it('writes the market value in billions from a billion up', () => {
    expect(marketCapText(2_400_312)).toBe('2,400.3B');
    expect(marketCapText(1000)).toBe('1.0B');
    expect(marketCapText(512.25)).toBe('512.3M');
    expect(marketCapText(NaN)).toBe('--');
    expect(inMillions(5534)).toBe('5,534.0M');
  });
});
