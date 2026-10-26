import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHART_LOOK_EVENT, CHART_THEME, setChartFont } from '../src/components/chart/PriceChart';
import { fontChoice } from '../src/terminal/settings';

describe("the charts' look", () => {
  afterEach(() => {
    setChartFont('terminal');
    vi.unstubAllGlobals();
  });

  it('draws text in the chosen typeface and tells open charts to draw again', () => {
    const sent: string[] = [];
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => sent.push(e.type) });
    expect(CHART_THEME.font).toBe('11px "Bergoom", "IBM Plex Sans", system-ui, sans-serif');
    setChartFont('plex');
    expect(CHART_THEME.font).toBe('11px "IBM Plex Sans", system-ui, sans-serif');
    expect(CHART_THEME.fontB).toBe('600 11px "IBM Plex Sans", system-ui, sans-serif');
    setChartFont('mono');
    expect(CHART_THEME.font).toMatch(/^11px "IBM Plex Mono"/);
    expect(sent).toEqual([CHART_LOOK_EVENT, CHART_LOOK_EVENT]);
    // The same choice again changes nothing.
    setChartFont('mono');
    expect(sent).toHaveLength(2);
  });

  it('reads a saved typeface, and anything else as the default', () => {
    expect(fontChoice('plex')).toBe('plex');
    expect(fontChoice('mono')).toBe('mono');
    expect(fontChoice('terminal')).toBe('terminal');
    expect(fontChoice('comic')).toBe('terminal');
    expect(fontChoice(undefined)).toBe('terminal');
  });
});
