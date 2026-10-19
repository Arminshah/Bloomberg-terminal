import { describe, expect, it } from 'vitest';
import { favourites, toggleFavourite } from '../src/terminal/userdata';
import { startSuggestions, suggest } from '../src/terminal/suggest';
import { defaultTerminal, frontPageNews } from '../src/terminal/state';

describe('favourites', () => {
  it('stars and unstars a security, in the order starred', () => {
    favourites.set({ ids: [] });
    expect(toggleFavourite('NVDA US Equity')).toBe(true);
    expect(toggleFavourite('AAPL US Equity')).toBe(true);
    expect(favourites.get().ids).toEqual(['NVDA US Equity', 'AAPL US Equity']);
    expect(toggleFavourite('NVDA US Equity')).toBe(false);
    expect(favourites.get().ids).toEqual(['AAPL US Equity']);
    favourites.set({ ids: [] });
  });

  it('lists favourites first on an empty command line, then recent securities not among them', () => {
    const items = startSuggestions(['MSFT US Equity', 'AAPL US Equity'], ['AAPL US Equity', 'SPX Index', 'EURUSD Curncy', 'NOT A SECURITY'], 5);
    expect(items.map((s) => [s.kind, s.primary])).toEqual([
      ['fav', 'MSFT US Equity'],
      ['fav', 'AAPL US Equity'],
      ['recent', 'SPX Index'],
      ['recent', 'EURUSD Curncy'],
    ]);
    // Choosing one fills it in, ready for a function.
    expect(items[0].fill).toBe('MSFT US EQUITY ');
    expect(startSuggestions([], [], 5)).toEqual([]);
  });

  it('ranks a matching favourite first among typed suggestions, starred', () => {
    favourites.set({ ids: ['AMZN US Equity'] });
    const secs = suggest('AM').filter((s) => s.kind === 'sec');
    expect(secs[0].primary).toBe('★ AMZN US Equity');
    favourites.set({ ids: [] });
    expect(suggest('AM').filter((s) => s.kind === 'sec').some((s) => s.primary.startsWith('★'))).toBe(false);
  });
});

describe('the front page news panel', () => {
  it('opens on market news, and moves an untouched official-announcements panel there once', () => {
    expect(defaultTerminal().panels.map((p) => p.history[0].fn)).toContain('MARKETNEWS');
    const s = { ...defaultTerminal(), panels: [{ history: [{ fn: 'HEADLINES' }], idx: 0 }, { history: [{ fn: 'MARKET' }, { fn: 'HEADLINES' }], idx: 1 }, { history: [{ fn: 'HEADLINES', args: 'CB' }], idx: 0 }] };
    const after = frontPageNews(s);
    expect(after.panels[0].history).toEqual([{ fn: 'MARKETNEWS' }]);
    // A panel where HEADLINES was opened, or opened on a topic, keeps it.
    expect(after.panels[1]).toBe(s.panels[1]);
    expect(after.panels[2]).toBe(s.panels[2]);
    expect(frontPageNews(after)).toBe(after);
  });
});
