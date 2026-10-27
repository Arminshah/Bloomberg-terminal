import { useId } from 'react';

/**
 * Tiny inline line chart; colour follows first-to-last direction. `mountain` draws it as GP does by default, a white
 * line over a blue fill. With `base` (the previous close) it draws a dotted line there and shades the area above it
 * in the rise colour and below it in the fall colour, as a day chart does.
 */
export function Sparkline({ values, width = 80, height = 16, color, fluid, mountain, base }: { values: ArrayLike<number>; width?: number; height?: number; color?: string; fluid?: boolean; mountain?: boolean; base?: number }) {
  const gradient = useId();
  const n = values.length;
  if (n < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const hasBase = base !== undefined && Number.isFinite(base) && base > 0;
  let lo = hasBase ? base : Infinity;
  let hi = hasBase ? base : -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo || 1;
  const step = n > 400 ? Math.ceil(n / 400) : 1;
  let d = '';
  for (let i = 0; i < n; i += step) {
    const x = (i / (n - 1)) * (width - 2) + 1;
    const y = height - 1 - ((values[i] - lo) / span) * (height - 2);
    d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  const lastY = height - 1 - ((values[n - 1] - lo) / span) * (height - 2);
  d += `L${width - 1},${lastY.toFixed(1)}`;
  const stroke = mountain ? '#f4f4f4' : color ?? (values[n - 1] >= values[0] ? 'var(--up)' : 'var(--dn)');
  if (hasBase) {
    const baseY = height - 1 - ((base - lo) / span) * (height - 2);
    const area = `${d}L${width - 1},${baseY.toFixed(1)}L1,${baseY.toFixed(1)}Z`;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }} data-testid="day-chart">
        <defs>
          <clipPath id={`${gradient}a`}><rect x="0" y="0" width={width} height={baseY} /></clipPath>
          <clipPath id={`${gradient}b`}><rect x="0" y={baseY} width={width} height={height - baseY} /></clipPath>
        </defs>
        <path d={area} fill="var(--up)" opacity={0.18} clipPath={`url(#${gradient}a)`} />
        <path d={area} fill="var(--dn)" opacity={0.18} clipPath={`url(#${gradient}b)`} />
        <line x1="1" x2={width - 1} y1={baseY} y2={baseY} stroke="#9a9a9a" strokeWidth="0.8" strokeDasharray="1.5 1.5" data-testid="day-chart-base" />
        <path d={d} fill="none" stroke="var(--up)" strokeWidth="1.2" clipPath={`url(#${gradient}a)`} />
        <path d={d} fill="none" stroke="var(--dn)" strokeWidth="1.2" clipPath={`url(#${gradient}b)`} />
      </svg>
    );
  }
  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {mountain && (
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(54,124,184)" stopOpacity="0.8" />
            <stop offset="1" stopColor="rgb(10,32,58)" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      )}
      {fluid && <path d={`${d}L${width - 1},${height}L1,${height}Z`} fill={mountain ? `url(#${gradient})` : stroke} opacity={mountain ? 1 : 0.12} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {!fluid && <circle cx={width - 1} cy={lastY} r="1.6" fill={stroke} />}
    </svg>
  );
}
