import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gemini = require('../electron/gemini.cjs') as {
  ground: (parsed: unknown, text: string) => { answer: string; points: { point: string; quote: string }[]; dropped: number };
  checkQuestion: (q: unknown) => string;
  errorText: (err: unknown, key: string) => string;
  requestBody: (q: string, text: string) => { contents: { parts: { text: string }[] }[] };
  MAX_DOC: number;
};

const FILING = 'Net sales increased 6% to $391,035 million in fiscal 2024. The Company faces intense competition in all of its markets. Gross margin was 46.2% of net sales.';

describe("DS's Ask a Question keeps only what the filing says (electron/gemini.cjs)", () => {
  it('keeps a point whose quote is in the filing, whatever the case, quotes or spacing', () => {
    const r = gemini.ground({ answer: 'Sales grew.', points: [{ point: 'Sales rose 6% to $391,035 million.', quote: 'net sales increased  6% to $391,035 MILLION in fiscal 2024' }] }, FILING);
    expect(r.points).toHaveLength(1);
    expect(r.dropped).toBe(0);
  });

  it('drops a point whose quote is not in the filing, and one whose figure is not in its quote', () => {
    const r = gemini.ground({
      answer: 'Mixed.',
      points: [
        { point: 'Margins expanded sharply.', quote: 'Gross margin expanded to a record level' },
        { point: 'Gross margin was 48%.', quote: 'Gross margin was 46.2% of net sales' },
        { point: 'Competition is intense.', quote: 'The Company faces intense competition in all of its markets' },
      ],
    }, FILING);
    expect(r.points.map((p) => p.point)).toEqual(['Competition is intense.']);
    expect(r.dropped).toBe(2);
  });

  it('keeps a quote shortened with an ellipsis when each piece is in the filing, in order', () => {
    const keep = gemini.ground({ answer: '', points: [{ point: 'Sales grew and competition is intense.', quote: 'Net sales increased 6% to $391,035 million … faces intense competition in all of its markets' }] }, FILING);
    expect(keep.points).toHaveLength(1);
    const swapped = gemini.ground({ answer: '', points: [{ point: 'Out of order.', quote: 'faces intense competition in all of its markets … Net sales increased 6% to $391,035 million' }] }, FILING);
    expect(swapped.points).toHaveLength(0);
  });

  it('drops an answer sentence carrying a figure the filing does not contain', () => {
    expect(gemini.ground({ answer: 'Sales rose 9%.', points: [] }, FILING).answer).toBe('');
    expect(gemini.ground({ answer: 'Sales rose 6%.', points: [] }, FILING).answer).toBe('Sales rose 6%.');
  });

  it('checks the question, keeps the key out of errors and sends at most the filing limit', () => {
    expect(gemini.checkQuestion('  ')).toBe('Type a question.');
    expect(gemini.checkQuestion('x'.repeat(501))).toMatch(/under 500/);
    expect(gemini.checkQuestion('What risks?')).toBe('');
    expect(gemini.errorText(new Error('bad key AQ.secret at https://x.y/z'), 'AQ.secret')).toBe('bad key <key> at <url>');
    const body = gemini.requestBody('Q?', 'a'.repeat(gemini.MAX_DOC + 10));
    expect(body.contents[0].parts[0].text.length).toBeLessThan(gemini.MAX_DOC + 40);
  });
});
