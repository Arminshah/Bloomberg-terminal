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
