import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import { searchSecurities } from '../src/data/registry';
import { suggest } from '../src/terminal/suggest';

const parse = (s: string) => parseCommand(s, lookupFn);

describe('command parser', () => {
  it('parses ticker, yellow key and function', () => {
    const p = parse('AAPL US <EQUITY> GP <GO>');
    expect(p).toMatchObject({ kind: 'route', fn: 'GP' });
    expect(p.kind === 'route' && p.sec?.id).toBe('AAPL US Equity');
  });

  it('accepts shorthand tickers and aliases', () => {
    const p = parse('aapl gp');
    expect(p.kind === 'route' && p.sec?.id).toBe('AAPL US Equity');
    expect(parse('BTC GIP')).toMatchObject({ kind: 'route', fn: 'GIP' });
    const g = parse('gold');
    expect(g.kind === 'route' && g.sec?.id).toBe('GC1 Comdty');
  });

  it('resolves multi-word securities with yellow keys', () => {
    const p = parse('CT10 GOVT YAS');
    expect(p.kind === 'route' && p.sec?.yk).toBe('Govt');
    expect(p.kind === 'route' && p.fn).toBe('YAS');
    const fx = parse('EURUSD CRNCY DES');
    expect(fx.kind === 'route' && fx.sec?.id).toBe('EURUSD Curncy');
  });

  it('handles bare functions, aliases, arguments and menu numbers', () => {
    expect(parse('TOP')).toMatchObject({ kind: 'route', fn: 'TOP' });
    expect(parse('msg')).toMatchObject({ kind: 'route', fn: 'IB' });
    expect(parse('N CRYPTO')).toMatchObject({ kind: 'route', fn: 'N', args: 'CRYPTO' });
    expect(parse('3 <GO>')).toEqual({ kind: 'menu', n: 3 });
    expect(parse('GP?')).toEqual({ kind: 'help', topic: 'GP' });
  });

  it('loads a bare security into its related functions menu', () => {
    const p = parse('IBM US <EQUITY> <GO>');
    expect(p).toMatchObject({ kind: 'route' });
    expect(p.kind === 'route' && p.sec?.id).toBe('IBM US Equity');
    expect(p.kind === 'route' && p.fn).toBeUndefined();
  });

  it('opens market sector menus and the portfolio from yellow keys', () => {
    expect(parse('EQUITY <GO>')).toEqual({ kind: 'route', fn: 'MENU', args: 'EQUITY' });
    expect(parse('<CRNCY>')).toEqual({ kind: 'route', fn: 'MENU', args: 'CURNCY' });
    expect(parse('M-MKT')).toEqual({ kind: 'route', fn: 'MENU', args: 'M-MKT' });
    expect(parse('CLIENT')).toEqual({ kind: 'route', fn: 'PORT' });
  });

  it('lists an issuer\'s bonds for TICKER <CORP> and T <GOVT>', () => {
    expect(parse('AAPL <CORP> <GO>')).toEqual({ kind: 'route', fn: 'SRCH', args: 'AAPL CORP' });
    expect(parse('JPM CORP DDIS')).toEqual({ kind: 'route', fn: 'DDIS', args: 'JPM CORP' });
    expect(parse('T GOVT')).toEqual({ kind: 'route', fn: 'SRCH', args: 'T GOVT' });
    const bond = parse('AAPL 4.65 02/23/46 CORP YAS');
    expect(bond.kind === 'route' && bond.sec?.id).toBe('AAPL 4.65 02/23/46 Corp');
  });

  it('explains sectors that are not covered', () => {
    const p = parse('XYZ 4 01/01/30 MUNI');
    expect(p.kind).toBe('error');
    expect(p.kind === 'error' && p.message).toContain('not covered');
  });

  it('resolves futures, new functions and HELP HELP', () => {
    const es = parse('ES1 INDEX WEIF');
    expect(es.kind === 'route' && es.sec?.id).toBe('ES1 Index');
    expect(parse('HELP HELP')).toMatchObject({ kind: 'route', fn: 'HELP', args: 'HELP' });
    for (const code of ['EMSX', 'SRCH', 'DDIS', 'ALLQ', 'WEIF', 'MOV', 'TRA', 'GF', 'HVT', 'VWAP', 'FRD', 'OVML', 'SWPM', 'CDR', 'CENB', 'MENU']) {
      expect(lookupFn(code)?.code, code).toBe(code);
    }
  });

  it('reports unknown input', () => {
    expect(parse('ZZZZZ')).toMatchObject({ kind: 'error' });
    expect(parse('AAPL US EQUITY NOPE')).toMatchObject({ kind: 'error' });
    expect(parse('   ')).toEqual({ kind: 'empty' });
  });
});

describe('search and autocomplete', () => {
  it('ranks exact tickers first', () => {
    expect(searchSecurities('MSFT')[0].def.id).toBe('MSFT US Equity');
    expect(searchSecurities('nvid')[0].def.id).toBe('NVDA US Equity');
  });

  it('suggests functions for a loaded security', () => {
    const s = suggest('AAPL US EQUITY ');
    expect(s.length).toBeGreaterThan(5);
    expect(s.every((x) => x.kind === 'fn')).toBe(true);
    expect(s.some((x) => x.primary === 'FA')).toBe(true);
    const fx = suggest('EURUSD CRNCY ');
    expect(fx.some((x) => x.primary === 'FA')).toBe(false);
  });

  it('mixes securities and functions for free text', () => {
    const s = suggest('GP');
    expect(s[0]).toMatchObject({ kind: 'fn', primary: 'GP' });
  });
});
