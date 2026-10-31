import { describe, expect, it } from 'vitest';
import { contractLines, findContracts } from '../src/functions/CTM';
import { engine } from '../src/data/market';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

describe('Exchange Contracts (CTM)', () => {
  const lines = contractLines(engine.securities);
  const line = (t: string) => lines.find((l) => l.def.ticker === t)!;

  it('lists every future the app carries with its terms', () => {
    expect(line('CL1')).toMatchObject({ sector: 'Energy', exchange: 'NYMEX', size: '1,000 bbl', unit: 'USD/bbl.', months: 'All months' });
    expect(line('TY1')).toMatchObject({ sector: 'Rates', exchange: 'CBOT', months: 'H,M,U,Z' });
    expect(line('ES1')).toMatchObject({ sector: 'Equity index', exchange: 'CME', size: '50 USD × index', unit: 'Tick 0.25', months: 'H,M,U,Z' });
    expect(lines.every((l) => l.def.cls === 'commodity' || l.def.cls === 'future')).toBe(true);
  });

  it('finds contracts by sector, exchange and words in the ticker, name, exchange or aliases', () => {
    expect(findContracts(lines, '', 'COMEX', '').map((l) => l.def.ticker).sort()).toEqual(['GC1', 'HG1', 'SI1']);
    expect(findContracts(lines, 'Energy', '', 'crude').map((l) => l.def.ticker)).toEqual(['CL1']);
    expect(findContracts(lines, '', '', 'gold').map((l) => l.def.ticker)).toEqual(['GC1']);
    expect(findContracts(lines, 'Rates', 'CME', '').map((l) => l.def.ticker)).toEqual(['SFR1']);
  });

  it('opens under CTM, on a contract when one is named', () => {
    expect(parseCommand('CTM', lookupFn)).toEqual({ kind: 'route', fn: 'CONTRACTS' });
    expect(parseCommand('CTM CRUDE', lookupFn)).toMatchObject({ kind: 'route', fn: 'CONTRACTS', sec: { id: 'CL1 Comdty' } });
  });
});
