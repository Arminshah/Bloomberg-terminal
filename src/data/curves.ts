import { engine } from './market';
import { closeAt } from './analytics';
import { DAY_MS } from './calendar';

export interface CurvePoint {
  id: string;
  tenor: number;
  y: number;
}

export const CURVES: { code: string; name: string; country: string }[] = [
  { code: 'US', name: 'US Treasuries', country: 'US' },
  { code: 'DE', name: 'German Bunds', country: 'DE' },
  { code: 'GB', name: 'UK Gilts', country: 'GB' },
  { code: 'JP', name: 'Japan JGBs', country: 'JP' },
];

export function curveMembers(code: string) {
  return engine.securities.filter((d) => d.cls === 'rate' && d.curve === code).sort((a, b) => a.tenor! - b.tenor!);
}

/** Curve as of `daysAgo` calendar days back, each tenor's close on or before then (0 = live). */
export function curveAt(code: string, daysAgo: number): CurvePoint[] {
  return curveMembers(code).map((d) => {
    if (daysAgo === 0) return { id: d.id, tenor: d.tenor!, y: engine.quote(d.id)!.last };
    const t = engine.now() - daysAgo * DAY_MS;
    return { id: d.id, tenor: d.tenor!, y: closeAt(engine.daily(d.id), t) };
  });
}

/** Linear interpolation of a yield curve in tenor (years). */
export function interp(points: { tenor: number; y: number }[], t: number): number {
  if (!points.length) return NaN;
  if (t <= points[0].tenor) return points[0].y;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].tenor) {
      const a = points[i - 1];
      const b = points[i];
      return a.y + ((t - a.tenor) / (b.tenor - a.tenor)) * (b.y - a.y);
    }
  }
  return points[points.length - 1].y;
}

export const tenorLabel = (t: number) => (t < 1 ? `${Math.round(t * 12)}M` : `${t}Y`);
