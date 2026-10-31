import { describe, expect, it } from 'vitest';
import { addSection, MAX_SECTIONS } from '../src/functions/MYN';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

const one = { pages: [{ name: 'My news', sections: [] as { title: string; query: string }[] }] };

describe('MYN: pages of news sections', () => {
  it('adds a section with its words, titled by them when no title is given', () => {
    const r = addSection(one, 0, '', '  NVDA   earnings ');
    expect(r).toEqual({ pages: [{ name: 'My news', sections: [{ title: 'NVDA earnings', query: 'NVDA earnings' }] }] });
    const t = addSection(one, 0, 'Fed watch', 'FOMC');
    expect(typeof t !== 'string' && t.pages[0].sections[0]).toEqual({ title: 'Fed watch', query: 'FOMC' });
  });

  it('refuses a section without words, the same search twice, or a full page', () => {
    expect(addSection(one, 0, 'x', ' ')).toBe('Type the words to follow: a ticker, a company or a topic.');
    const r = addSection(one, 0, '', 'FOMC') as typeof one;
    expect(addSection(r, 0, 'Again', 'fomc')).toBe('"fomc" is on this page already.');
    const full = { pages: [{ name: 'p', sections: Array.from({ length: MAX_SECTIONS }, (_, i) => ({ title: `${i}`, query: `q${i}` })) }] };
    expect(addSection(full, 0, '', 'more')).toBe(`A page holds ${MAX_SECTIONS} sections at most.`);
    expect(addSection(one, 3, '', 'FOMC')).toBe('That page is no longer there.');
  });

  it('opens under MYN', () => {
    expect(parseCommand('MYN', lookupFn)).toEqual({ kind: 'route', fn: 'MYNEWS' });
  });
});
