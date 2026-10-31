import { afterEach, describe, expect, it } from 'vitest';
import { CHART_THEME } from '../src/components/chart/PriceChart';
import { heatFill } from '../src/components/HeatTreemap';
import { colourScheme, heatColour, onColourScheme, palette } from '../src/terminal/palette';
import { settings } from '../src/terminal/settings';

const rgb = (s: string) => s.match(/\d+/g)!.map(Number);

describe('colour schemes and the heat scale', () => {
  afterEach(() => settings.set((s) => ({ ...s, scheme: 'default' })));

  it("runs the heat scale through the terminal's measured tiles", () => {
    expect(heatColour(0.0001)).toBe('rgb(1, 74, 15)');
    expect(heatColour(1.5)).toBe('rgb(27, 189, 61)');
    expect(heatColour(3)).toBe('rgb(80, 239, 110)');
    expect(heatColour(-1.5)).toBe('rgb(161, 18, 44)');
    expect(heatColour(-3)).toBe('rgb(253, 45, 74)');
    // Past the scale it stays at full colour; a missing change is dark grey.
    expect(heatColour(-9)).toBe(heatColour(-3));
    expect(heatColour(NaN)).toBe('#262626');
    expect(heatFill(2, 3)).toBe(heatColour(2, 3));
    // Half the scale is the middle tile, whatever the scale.
    expect(heatColour(5, 10)).toBe(heatColour(1.5));
  });

  it('turns rises blue in both colour-blind schemes, falls red or orange, with the chart and heat colours', () => {
    const changed: string[] = [];
    const stop = onColourScheme(() => changed.push(palette().up));
    settings.set((s) => ({ ...s, scheme: 'deuteranopia' }));
    expect(palette()).toMatchObject({ up: '#0089e8', dn: '#cd4b4c', amber: '#fea028' });
    expect(CHART_THEME.up).toBe('#0089e8');
    expect(CHART_THEME.dnFill).toBe('rgba(205, 75, 76, 0.55)');
    const [r, g, b] = rgb(heatColour(3));
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    settings.set((s) => ({ ...s, scheme: 'protanomaly' }));
    expect(palette()).toMatchObject({ up: '#0089e8', dn: '#fb5b28', amber: '#feba12' });
    const [r2, g2, b2] = rgb(heatColour(-3));
    expect(r2).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(b2);
    // Other settings do not count as a change of scheme.
    settings.set((s) => ({ ...s, tape: !s.tape }));
    stop();
    expect(changed).toEqual(['#0089e8', '#0089e8']);
  });

  it('reads a saved scheme, and anything else as the default', () => {
    expect(colourScheme('deuteranopia')).toBe('deuteranopia');
    expect(colourScheme('protanomaly')).toBe('protanomaly');
    expect(colourScheme('tritanopia')).toBe('default');
  });
});
