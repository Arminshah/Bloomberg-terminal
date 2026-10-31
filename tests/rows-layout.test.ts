import { beforeEach, describe, expect, it } from 'vitest';
import { evenRows, fits, MIN_SHARE, normalizeRows, resizeRow, resizeTile, rowsGrid, rowsOf, tileCount } from '../src/terminal/rows-layout';
import { applyPreset, defaultTerminal, panelCount, setRows, splitFor, terminal } from '../src/terminal/state';
import { applySaved, saveLayout, snapshotLayout, unsavedLayout } from '../src/terminal/layouts';
import { savedLayouts } from '../src/terminal/userdata';
import { routeFromCommand } from '../src/functions/TOOLS';

describe('a layout of your own', () => {
  it('starts with even rows and tiles, within the limits', () => {
    expect(rowsOf([1, 2])).toEqual({ rows: [{ h: 0.5, tiles: [1] }, { h: 0.5, tiles: [0.5, 0.5] }] });
    expect(tileCount(rowsOf([2, 2, 2]))).toBe(6);
    expect(fits([1, 2])).toBe(true);
    expect(fits([4, 2])).toBe(true);
    expect(fits([4, 3])).toBe(false); // seven tiles
    expect(fits([5])).toBe(false); // five in a row
    expect(fits([1, 1, 1, 1, 1])).toBe(false); // five rows
    expect(fits([])).toBe(false);
  });

  it('is one grid: every tile edge of any row is a column line', () => {
    // A heat map across the top; headlines and a stock below, a third and two thirds.
    const g = rowsGrid({ rows: [{ h: 0.4, tiles: [1] }, { h: 0.6, tiles: [1 / 3, 2 / 3] }] });
    expect(g.columns.map((c) => Math.round(c * 1000) / 1000)).toEqual([0.333, 0.667]);
    expect(g.heights).toEqual([0.4, 0.6]);
    expect(g.places).toEqual([{ row: 1, from: 1, to: 3 }, { row: 2, from: 1, to: 2 }, { row: 2, from: 2, to: 3 }]);
    // Halves above thirds: the lines at a third, a half and two thirds.
    const h = rowsGrid(rowsOf([2, 3]));
    expect(h.columns.map((c) => Math.round(c * 1000) / 1000)).toEqual([0.333, 0.167, 0.167, 0.333]);
    expect(h.places).toEqual([{ row: 1, from: 1, to: 3 }, { row: 1, from: 3, to: 5 }, { row: 2, from: 1, to: 2 }, { row: 2, from: 2, to: 4 }, { row: 2, from: 4, to: 5 }]);
  });

  it('resizes a row or a tile by its divider, keeping every one at least a little', () => {
    const r = rowsOf([1, 2]);
    expect(resizeRow(r, 0, 0.3).rows.map((x) => x.h)).toEqual([0.3, 0.7]);
    expect(resizeRow(r, 0, 0.99).rows[1].h).toBeCloseTo(MIN_SHARE, 9);
    const t = resizeTile(r, 1, 0, 0.25);
    expect(t.rows[1].tiles).toEqual([0.25, 0.75]);
    expect(t.rows[0]).toBe(r.rows[0]);
    // A divider that does not exist changes nothing.
    expect(resizeTile(r, 0, 0, 0.5)).toBe(r);
    expect(resizeRow(r, 1, 0.5)).toBe(r);
    expect(evenRows(t)).toEqual(r);
  });

  it('reads stored layouts back, mending sums and refusing damaged ones', () => {
    expect(normalizeRows({ rows: [{ h: 2, tiles: [1, 3] }, { h: 2, tiles: [5] }] })).toEqual({ rows: [{ h: 0.5, tiles: [0.25, 0.75] }, { h: 0.5, tiles: [1] }] });
    for (const bad of [undefined, {}, { rows: [] }, { rows: [{ h: 1, tiles: [] }] }, { rows: [{ h: -1, tiles: [1] }] }, { rows: [{ h: 1, tiles: [1, 1, 1, 1, 1] }] }, { rows: [{ h: 1, tiles: ['x'] }] }]) {
      expect(normalizeRows(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe('making, sizing and saving it', () => {
  beforeEach(() => {
    terminal.set(defaultTerminal());
    savedLayouts.set({ list: [] });
  });

  it('sets the workspace to it, counts its panels and saves it with its sizes', () => {
    applyPreset([{ fn: 'HEATMAP' }, { fn: 'MARKETNEWS' }, { fn: 'CHART', sec: 'AAPL US Equity' }], 'rows', undefined, rowsOf([1, 2]), 'Morning');
    expect(panelCount(terminal.get())).toBe(3);
    // Screens read the divider sizes while drawing: one object, or React redraws without end.
    expect(splitFor(terminal.get())).toBe(splitFor(terminal.get()));
    saveLayout('Morning');
    expect(terminal.get().layoutName).toBe('Morning');
    expect(unsavedLayout(terminal.get(), savedLayouts.get().list)).toBeUndefined();
    // Dragging a divider is a change the menu offers to save.
    setRows(resizeTile(terminal.get().rows!, 1, 0, 0.3));
    expect(unsavedLayout(terminal.get(), savedLayouts.get().list)?.name).toBe('Morning');
    saveLayout('Morning');
    const kept = savedLayouts.get().list[0];
    expect(kept.rows!.rows[1].tiles[0]).toBeCloseTo(0.3, 9);
    expect(kept.routes.map((r) => r.fn)).toEqual(['HEATMAP', 'MARKETNEWS', 'CHART']);
    expect(savedLayouts.get().list).toHaveLength(1);
    // Another layout, then back: the same tiles, at the sizes saved.
    applyPreset([{ fn: 'MARKET' }], '1');
    expect(panelCount(terminal.get())).toBe(1);
    applySaved(kept);
    expect(terminal.get().layout).toBe('rows');
    expect(terminal.get().rows!.rows[1].tiles[0]).toBeCloseTo(0.3, 9);
    expect(terminal.get().panels[2].history.at(-1)).toEqual({ fn: 'CHART', sec: 'AAPL US Equity' });
    expect(unsavedLayout(terminal.get(), savedLayouts.get().list)).toBeUndefined();
  });

  it('counts another screen in a tile as a change too, and a preset as no saved layout', () => {
    applyPreset([{ fn: 'HEATMAP' }, { fn: 'MARKETNEWS' }], 'rows', undefined, rowsOf([2]), 'Two');
    saveLayout('Two');
    terminal.set((s) => ({ ...s, panels: s.panels.map((p, i) => (i === 1 ? { ...p, history: [...p.history, { fn: 'WATCHLIST' }], idx: p.history.length } : p)) }));
    expect(unsavedLayout(terminal.get(), savedLayouts.get().list)?.name).toBe('Two');
    expect(snapshotLayout('x').routes.map((r) => r.fn)).toEqual(['HEATMAP', 'WATCHLIST']);
    applyPreset([{ fn: 'MARKET' }], '1');
    expect(terminal.get().layoutName).toBeUndefined();
    expect(unsavedLayout(terminal.get(), savedLayouts.get().list)).toBeUndefined();
  });
});

describe("a tile's screen as typed", () => {
  it('takes what the command line takes, and says what is wrong', () => {
    expect(routeFromCommand('HEATMAP')).toEqual({ fn: 'HEATMAP' });
    expect(routeFromCommand('AAPL US Equity CHART')).toEqual({ fn: 'CHART', sec: 'AAPL US Equity' });
    expect(routeFromCommand(' nvda gp ')).toEqual({ fn: 'CHART', sec: 'NVDA US Equity' });
    expect(routeFromCommand('AAPL US Equity')).toEqual({ fn: 'MENU', sec: 'AAPL US Equity' });
    expect(routeFromCommand('')).toEqual({ error: expect.stringContaining('type a screen') });
    expect(routeFromCommand('PROFILE')).toEqual({ error: expect.stringContaining('needs a security') });
    expect('error' in routeFromCommand('ZZZZ NOPE')).toBe(true);
  });
});
