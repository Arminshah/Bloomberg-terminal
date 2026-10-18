import { describe, expect, it, vi } from 'vitest';
import * as online from '../src/data/live/lookup';
import { engine } from '../src/data/market';
import { execute } from '../src/terminal/exec';
import { applyPreset, currentRoute, defaultTerminal, navigate, terminal } from '../src/terminal/state';

describe('asynchronous ticker lookup navigation', () => {
  it('does not overwrite a newer linked selection when an older lookup resolves', async () => {
    terminal.set(defaultTerminal());
    applyPreset([{ fn: 'CHART', sec: 'AAPL US Equity' }, { fn: 'PROFILE', sec: 'AAPL US Equity' }], '2', [1, 1]);
    const def = { ...engine.get('AAPL US Equity')!, id: 'SOFI US Equity', ticker: 'SOFI US', name: 'Lookup fixture', alias: [] };
    let resolve!: (value: Awaited<ReturnType<typeof online.lookupSecurity>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof online.lookupSecurity>>>((done) => { resolve = done; });
    const source = vi.spyOn(online, 'lookupSource').mockReturnValue('yahoo');
    const lookup = vi.spyOn(online, 'lookupSecurity').mockReturnValue(pending);
    try {
      expect(execute(0, 'SOFI GP')).toBe(true);
      expect(lookup).toHaveBeenCalledOnce();
      navigate(1, { fn: 'PROFILE', sec: 'MSFT US Equity' });
      expect(currentRoute(terminal.get(), 0)).toEqual({ fn: 'CHART', sec: 'MSFT US Equity' });
      // A real online lookup registers its result before completing.
      expect(engine.addSecurity(def)).toBe(true);
      resolve({ ok: true, def });
      await pending;
      await Promise.resolve();
      expect(currentRoute(terminal.get(), 0)).toEqual({ fn: 'CHART', sec: 'MSFT US Equity' });
      expect(currentRoute(terminal.get(), 1)).toEqual({ fn: 'PROFILE', sec: 'MSFT US Equity' });
    } finally {
      source.mockRestore();
      lookup.mockRestore();
    }
  });
});
