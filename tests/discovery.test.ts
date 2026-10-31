import { describe, expect, it } from 'vitest';
import { resolveSecurity } from '../src/data/registry';
import { parseCommand } from '../src/terminal/commands';
import { exampleCommand, FUNCTIONS, lookupFn } from '../src/terminal/registry';

describe('function discovery examples', () => {
  it('keeps the loaded security when a compatible analysis function is opened from help', () => {
    const sec = resolveSecurity('NVDA')!;
    expect(exampleCommand(lookupFn('GP')!, sec)).toBe('NVDA US Equity GP');
    expect(exampleCommand(lookupFn('DES')!, sec)).toBe('NVDA US Equity DES');
    expect(exampleCommand(lookupFn('FLDS')!, sec, false)).toBe('NVDA US Equity FIELDS');
    expect(exampleCommand(lookupFn('FILINGS')!, sec)).toBe('NVDA US Equity FILINGS');
  });

  it('offers a bond rather than a stock for the quote montage, including with an incompatible security loaded', () => {
    const fn = lookupFn('ALLQ')!;
    for (const sec of [undefined, resolveSecurity('AAPL')!]) {
      const parsed = parseCommand(exampleCommand(fn, sec), lookupFn);
      expect(parsed.kind).toBe('route');
      if (parsed.kind !== 'route') continue;
      expect(parsed.fn).toBe('DEALERQUOTES');
      expect(parsed.sec?.cls).toBe('bond');
    }
  });

  it('leaves broad market functions independent of the loaded security', () => {
    const sec = resolveSecurity('NVDA')!;
    expect(exampleCommand(lookupFn('WEI')!, sec)).toBe('WEI US');
    expect(exampleCommand(lookupFn('TOP')!, sec)).toBe('TOP NVDA');
    expect(exampleCommand(lookupFn('GC')!, sec)).toBe('GC');
  });

  it('provides a runnable command and compatible security for every required-security function', () => {
    for (const fn of FUNCTIONS.filter((f) => f.needsSec)) {
      const cmd = exampleCommand(fn);
      const parsed = parseCommand(cmd, lookupFn);
      expect(parsed.kind, `${fn.code}: ${cmd}`).toBe('route');
      if (parsed.kind !== 'route') continue;
      expect(parsed.sec, `${fn.code}: ${cmd}`).toBeDefined();
      if (fn.classes) expect(fn.classes, `${fn.code}: ${cmd}`).toContain(parsed.sec?.cls);
    }
  });
});
