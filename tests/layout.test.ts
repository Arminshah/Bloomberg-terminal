import { describe, expect, it } from 'vitest';
import { defaultTerminal, LAYOUT_PANELS, migrateTerminal, type TerminalState } from '../src/terminal/state';

const panel = (fn: string, sec?: string) => ({ history: [sec ? { fn, sec } : { fn }], idx: 0 });

describe('workspace layout', () => {
  it('opens with four panels and the watchlist column', () => {
    const s = defaultTerminal();
    expect(s.layout).toBe('5');
    expect(LAYOUT_PANELS['5']).toBe(5);
    expect(s.panels[4].history[0].fn).toBe('W');
  });

  it('gives a saved four-panel workspace the watchlist column and keeps its panels', () => {
    const old: TerminalState = { ...defaultTerminal(), layout: '4', panels: [panel('DES', 'NBIS US Equity'), panel('GP', 'AAPL US Equity'), panel('TOP'), panel('IMAP'), panel('FXC'), panel('WEI')] };
    const { v, s } = migrateTerminal({ v: 2, s: old });
    expect(v).toBe(3);
    expect(s.layout).toBe('5');
    expect(s.panels[0].history[0]).toEqual({ fn: 'DES', sec: 'NBIS US Equity' });
    expect(s.panels[4].history[0].fn).toBe('W');
    // Another layout the user chose stays as it was.
    const six = migrateTerminal({ v: 2, s: { ...old, layout: '6' } });
    expect(six.s.layout).toBe('6');
    expect(six.s.panels[4].history[0].fn).toBe('FXC');
  });
});
