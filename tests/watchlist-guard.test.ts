import { describe, expect, it } from 'vitest';
import { DEFAULT_WATCHLIST_COLUMNS, watchlistColumns } from '../src/data/watchlist-columns';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import { DEFAULT_SPLIT, defaultTerminal } from '../src/terminal/state';
import { suggest } from '../src/terminal/suggest';
import css from '../src/styles/global.css?raw';

// The owner built the watchlist on 27 October 2026 and fixed it on 31 October: its columns and their order, and its
// place as the right-hand column (panel 5) of the default layout. These tests fail if any of that changes. Never edit,
// weaken or remove them to let a change through; only the owner can change the watchlist, by asking in so many words.
// The look-alike work on the rest of the app (docs/parity-build-plan.md) leaves the watchlist as it is.
describe('the watchlist, fixed by the owner', () => {
  it('has the default columns in this order', () => {
    expect(DEFAULT_WATCHLIST_COLUMNS).toEqual([
      'NAME',
      'PX_LAST',
      'CHG_PCT_1D',
      'CHG_NET_1D',
      'ARMIN_PRE_MARKET',
      'ARMIN_AFTER_HOURS',
      'PX_VOLUME',
      'ARMIN_AVG_VOL_3M',
      'ARMIN_YTD',
      'ARMIN_1Y',
      'ARMIN_DAY_RANGE',
      'ARMIN_52W_RANGE',
      'ARMIN_TODAY',
      'CUR_MKT_CAP',
    ]);
    // After the Security column, which every list has.
    expect(watchlistColumns(undefined).map((c) => c.label)).toEqual([
      'Name',
      'Last Price',
      'Change (%)',
      'Change',
      'Pre-mkt',
      'After-hrs',
      'Volume',
      'Avg Vol (3M)',
      'YTD',
      '52-Wk %',
      'Day Range',
      '52-Wk Range',
      'Day Chart',
      'Market Cap',
    ]);
  });

  it('is panel 5 of the default layout, the right-hand column', () => {
    const t = defaultTerminal();
    expect(t.layout).toBe('5');
    expect(t.panels[4].history[t.panels[4].idx]).toEqual({ fn: 'WATCHLIST' });
    expect(DEFAULT_SPLIT['5']).toEqual({ cols: [0.4, 0.4, 0.2], rows: [0.5, 0.5] });
    expect(css).toContain(".workspace[data-layout='5'] { grid-template: 1fr 1fr / 1fr 1fr 0.5fr; }");
    expect(css).toContain(".workspace[data-layout='5'] > .panel:nth-child(5) { grid-column: 3; grid-row: 1 / span 2; }");
  });

  it('opens with WATCHLIST and WATCH, first in the suggestions for WATCH; W stays Worksheets', () => {
    expect(parseCommand('WATCHLIST', lookupFn)).toMatchObject({ kind: 'route', fn: 'WATCHLIST' });
    expect(parseCommand('WATCH', lookupFn)).toMatchObject({ kind: 'route', fn: 'WATCHLIST' });
    expect(parseCommand('W', lookupFn)).toMatchObject({ kind: 'route', fn: 'WORKSHEET' });
    const first = suggest('WATCH').find((s) => s.kind === 'fn');
    expect(first?.primary).toBe('WATCHLIST');
  });
});
