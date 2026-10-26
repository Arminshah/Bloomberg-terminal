import { settings, type ColourScheme } from './settings';

export type { ColourScheme };

/**
 * The colours that carry a direction (a rise and a fall, a buy and a sell) and the heat scale, for each colour scheme
 * SETTINGS offers. Code that computes a colour (charts, heat maps, bars) reads it here, from the setting itself, so a
 * screen never draws with the scheme before; stylesheets read the same colours as --up, --dn and --amber
 * (html[data-scheme] in global.css).
 *
 * The default keeps the app's green and red; its heat scale runs through the tiles measured from the terminal's
 * published heat maps (docs/visual-research-2026-10.md): #014A0F, #1BBD3D and #50EF6E for a rise, #7B0C24, #A1122C and
 * #FD2D4A for a fall. The two colour-blind schemes are the terminal's own swatches: a rise in blue, a fall in a red
 * or an orange those viewers tell apart from it, and the amber of plain text a little lighter. Their heat scales are
 * the swatch's colour darkened and lightened, not measured.
 */
export interface Palette {
  up: string;
  dn: string;
  /** Text with no direction. */
  amber: string;
  /** Weak, middle and strong: a change near nothing, half the scale, and the full scale or more. */
  heatUp: [string, string, string];
  heatDn: [string, string, string];
}

export const PALETTES: Record<ColourScheme, Palette> = {
  default: { up: '#2fd36b', dn: '#ff4d4f', amber: '#ff9e1b', heatUp: ['#014a0f', '#1bbd3d', '#50ef6e'], heatDn: ['#7b0c24', '#a1122c', '#fd2d4a'] },
  deuteranopia: { up: '#0089e8', dn: '#cd4b4c', amber: '#fea028', heatUp: ['#00305a', '#0072c4', '#3aa8f5'], heatDn: ['#5a1f20', '#a83c3d', '#e8605f'] },
  protanomaly: { up: '#0089e8', dn: '#fb5b28', amber: '#feba12', heatUp: ['#00305a', '#0072c4', '#3aa8f5'], heatDn: ['#5e2410', '#c24a1f', '#ff7a45'] },
};

/** A saved scheme, or the default for anything else. */
export function colourScheme(v: unknown): ColourScheme {
  return v === 'deuteranopia' || v === 'protanomaly' ? v : 'default';
}

export function palette(): Palette {
  return PALETTES[colourScheme(settings.get().scheme)];
}

/** Re-renders a component when the scheme changes; returns it. */
export function useColourScheme(): ColourScheme {
  return colourScheme(settings.use((s) => s.scheme));
}

/** Calls `fn` when the scheme changes; returns a function that stops. */
export function onColourScheme(fn: () => void): () => void {
  let last = settings.get().scheme;
  return settings.subscribe(() => {
    const now = settings.get().scheme;
    if (now === last) return;
    last = now;
    fn();
  });
}

function rgbOf(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** A colour at `alpha`, as rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** The heat colour of a change in percent: weak near nothing, full at ±`scale`% and beyond; dark grey without one. */
export function heatColour(pct: number, scale = 3): string {
  if (!Number.isFinite(pct)) return '#262626';
  const p = palette();
  const [weak, mid, strong] = pct >= 0 ? p.heatUp : p.heatDn;
  const a = Math.min(1, Math.abs(pct) / scale);
  return a <= 0.5 ? mix(weak, mid, a / 0.5) : mix(mid, strong, (a - 0.5) / 0.5);
}
