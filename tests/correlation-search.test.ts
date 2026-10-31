import { describe, expect, it } from 'vitest';
import { betaTo, correlationSearch } from '../src/data/analytics';
import { engine } from '../src/data/market';

describe('CORRELATION: the lines that moved most closely with one', () => {
  it('ranks every other line by the correlation of daily returns, with its beta and the days in common', () => {
    const pool = engine.securities.filter((d) => d.cls !== 'bond').map((d) => d.id);
    const { hits, short } = correlationSearch('SPX Index', pool, 252);
    expect(hits.some((h) => h.id === 'SPX Index')).toBe(false);
    expect(hits.length + short).toBe(pool.length - 1);
    for (const h of hits) {
      expect(h.corr).toBeGreaterThanOrEqual(-1);
      expect(h.corr).toBeLessThanOrEqual(1);
      expect(h.n).toBeGreaterThanOrEqual(Math.floor(252 * 0.6));
    }
    const byCorr = [...hits].sort((a, b) => b.corr - a.corr);
    // The S&P 500 future moves with the index; the volatility index against it.
    expect(byCorr[0].id).toBe('ES1 Index');
    expect(byCorr[0].corr).toBeGreaterThan(0.95);
    expect(byCorr.at(-1)!.id).toBe('VIX Index');
    expect(byCorr.at(-1)!.corr).toBeLessThan(-0.5);
    // The beta is the line's on the one searched from, as BETA works it out on the same days.
    expect(byCorr[0].beta).toBeCloseTo(betaTo('ES1 Index', 'SPX Index', 252).beta, 10);
  });

  it('does not rank a line with too little history in common', () => {
    // Over three years the need is 60% of 756 intervals; a line with none is counted, not ranked.
    const { hits, short } = correlationSearch('SPX Index', ['NOT A LINE', 'ES1 Index'], 756);
    expect(hits.map((h) => h.id)).toEqual(['ES1 Index']);
    expect(short).toBe(1);
  });
});
