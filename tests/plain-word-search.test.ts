import { describe, expect, it } from 'vitest';
import { plainWords } from '../src/terminal/plain-words';
import { searchFunctions, searchWords } from '../src/functions/SEAR';
import { suggest } from '../src/terminal/suggest';

// Plain words or a question typed on the command line run a search of the app (SEAR, TE01 02:05 and 02:11); a
// command keeps its own meaning.
describe('plain-word search on the command line', () => {
  it('tells words from commands', () => {
    expect(plainWords('what green bonds were issued last year?')).toBe(true);
    expect(plainWords('car makers in europe')).toBe(true);
    expect(plainWords('dividend growth')).toBe(true);
    // A function or a market sector makes it a command; one word, or a number, is never a search.
    for (const cmd of ['GP QZZX 1D', 'ZZZZ CHART', 'IBM US EQUITY', 'AAPL US Equity DES', 'apple', '12', 'AAPL MSFT', 'DES?']) expect(plainWords(cmd)).toBe(false);
  });

  it('keeps the words that carry the meaning', () => {
    expect(searchWords('What green bonds were issued last year?')).toEqual(['GREEN', 'BONDS', 'ISSUED']);
  });

  it('finds functions by mnemonic, name and description', () => {
    expect(searchFunctions(['DIVIDEND']).map((f) => f.code)).toContain('DIVIDENDS');
    expect(searchFunctions(['WEI'])[0].code).toBe('MARKET');
  });

  it('offers SEARCH <words> first for plain words, and not for a single word or a command', () => {
    expect(suggest('green bonds issued')[0]).toMatchObject({ key: 'search', execute: 'SEAR green bonds issued', search: 'GREEN BONDS ISSUED' });
    for (const typed of ['qqqqx', 'WEI', 'apple', 'AAPL US Equity DES']) expect(suggest(typed).some((s) => s.key === 'search')).toBe(false);
  });
});
