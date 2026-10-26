import { describe, expect, it } from 'vitest';
import { rankMovers } from '../src/functions/RATES';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

const parse = (s: string) => parseCommand(s, lookupFn);

describe('World Bond Movers (WBMV)', () => {
  it('ranks yields by the size of their move, rises and falls together, and leaves out lines without a change', () => {
    const lines = [{ id: 'a', chg: 0.03 }, { id: 'b', chg: -0.11 }, { id: 'c', chg: NaN }, { id: 'd', chg: 0.07 }, { id: 'e', chg: 0 }];
    expect(rankMovers(lines).map((l) => l.id)).toEqual(['b', 'd', 'a', 'e']);
  });

  it('opens under its terminal mnemonic', () => {
    expect(parse('WBMV')).toEqual({ kind: 'route', fn: 'BONDMOVERS' });
  });
});

describe('Regression Analysis (HRA)', () => {
  it('regresses the loaded security on the one typed after the function', () => {
    expect(parse('AAPL HRA MSFT')).toMatchObject({ kind: 'route', fn: 'REGRESSION', sec: { id: 'AAPL US Equity' }, args: 'MSFT' });
    expect(parse('HRA AAPL')).toMatchObject({ kind: 'route', fn: 'REGRESSION', sec: { id: 'AAPL US Equity' } });
  });
});

describe('Index Directory (IN)', () => {
  it('opens under IN, and INDICES still opens MARKET', () => {
    expect(parse('IN')).toEqual({ kind: 'route', fn: 'INDEXLIST' });
    expect(parse('INDICES')).toEqual({ kind: 'route', fn: 'MARKET' });
  });
});
