import { describe, expect, it } from 'vitest';
import { bestHit, commandFor, nameKey, nameQuery } from '../src/terminal/name-search';

describe('finding a stock by its company name', () => {
  it('folds case, accents, punctuation and legal forms', () => {
    expect(nameKey('The Coca-Cola Company')).toBe('coca cola');
    expect(nameKey('Nestlé S.A.')).toBe('nestle');
    expect(nameKey('Applied Digital Corp.')).toBe('applied digital');
  });

  it('reads the name and the function typed before or after it', () => {
    expect(nameQuery('acme widgets')).toEqual({ name: 'acme widgets' });
    expect(nameQuery('acme widgets SPLC')).toEqual({ name: 'acme widgets', fn: 'SPLC' });
    expect(nameQuery('PROFILE acme widgets')).toEqual({ name: 'acme widgets', lead: 'PROFILE' });
    expect(nameQuery('acme widgets us equity')).toEqual({ name: 'acme widgets' });
    // A company the app holds is found by its name without searching.
    expect(nameQuery('applied digital')).toBeNull();
    // Not a name: a function alone, a menu number, a security the app holds with a mistyped function.
    expect(nameQuery('SPLC')).toBeNull();
    expect(nameQuery('12')).toBeNull();
    expect(nameQuery('AAPL DESS')).toBeNull();
  });

  it('picks the stock whose name the words begin, else one with every word, else the ticker', () => {
    const hits = [
      { symbol: 'APLE', name: 'Apple Hospitality REIT, Inc.', exchange: 'NYSE' },
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
      { symbol: 'KO', name: 'The Coca-Cola Company', exchange: 'NYSE' },
      { symbol: 'APLD', name: 'Applied Digital Corporation', exchange: 'NASDAQ' },
      { symbol: 'KBC BB', name: 'KBC Group NV', exchange: 'Brussels' },
    ];
    expect(bestHit('apple', hits)?.symbol).toBe('AAPL');
    expect(bestHit('apple hosp', hits)?.symbol).toBe('APLE');
    expect(bestHit('apple inc', hits)?.symbol).toBe('AAPL');
    expect(bestHit('coca cola', hits)?.symbol).toBe('KO');
    expect(bestHit('cocacola', hits)?.symbol).toBe('KO');
    expect(bestHit('digital applied', hits)?.symbol).toBe('APLD');
    expect(bestHit('kbc', hits)?.symbol).toBe('KBC BB');
    expect(bestHit('tesla', hits)).toBeNull();
  });

  it('builds the command that opens the stock with the function typed', () => {
    expect(commandFor({ symbol: 'APLD', name: 'Applied Digital Corporation', exchange: 'NASDAQ' }, { fn: 'SPLC' })).toBe('APLD US EQUITY SPLC');
    expect(commandFor({ symbol: 'KBC BB', name: 'KBC Group NV', exchange: 'Brussels' }, { lead: 'PROFILE' })).toBe('PROFILE KBC BB EQUITY');
  });
});
