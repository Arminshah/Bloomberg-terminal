import { describe, expect, it } from 'vitest';
import { buildDirectory, classify, ownStatements, targetNames, targetPattern } from '../src/data/live/supply-chain';
import reviewed from './fixtures/splc-review-round5.json';

/**
 * Statements an independent review of 27 companies' supply chains found misread (round 5: 910 relations, 124 wrong).
 * Each is a sentence as the filing wrote it; the role or share it was wrongly given must not come back.
 */
interface ReviewCase {
  ticker: string;
  title: string;
  filer: string;
  side: 'own' | 'theirs';
  sentence: string;
  wrongRole: string;
  wrongShare?: number;
  kind: string;
  why: string;
}

const cases = reviewed as ReviewCase[];

const read = (c: ReviewCase) => {
  const names = targetNames(c.ticker, c.title);
  const pattern = targetPattern(names.names);
  if (names.exclude && new RegExp(names.exclude).test(c.sentence)) return [];
  if (c.side === 'own') return ownStatements(c.sentence, buildDirectory([]), pattern).map((x) => ({ role: x.role, share: undefined as number | undefined }));
  const got = classify(c.sentence, pattern, targetPattern(targetNames(undefined, c.filer).names));
  return got ? [{ role: got.role, share: got.share }] : [];
};

describe('SPLC: what the fifth review found', () => {
  it('has the reviewed statements', () => {
    expect(cases.length).toBeGreaterThan(100);
  });
  it.each(cases.map((c) => [`${c.ticker} ← ${c.filer}: not ${c.wrongRole}${c.wrongShare != null ? ` ${c.wrongShare}%` : ''} (${c.kind})`, c] as const))('%s', (_, c) => {
    const got = read(c);
    if (c.kind === 'wrong_share') expect(got.some((g) => g.role === c.wrongRole && g.share === c.wrongShare)).toBe(false);
    else expect(got.some((g) => g.role === c.wrongRole)).toBe(false);
  });
});
