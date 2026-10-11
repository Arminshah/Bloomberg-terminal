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
