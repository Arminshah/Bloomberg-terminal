/** Tiny inline line chart; colour follows first-to-last direction. */
export function Sparkline({ values, width = 80, height = 16, color, fluid }: { values: ArrayLike<number>; width?: number; height?: number; color?: string; fluid?: boolean }) {
  const n = values.length;
  if (n < 2) return <svg width={width} height={height} aria-hidden="true" />;
  let lo = Infinity;
  let hi = -Infinity;
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
  const stroke = color ?? (values[n - 1] >= values[0] ? 'var(--up)' : 'var(--dn)');
  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {fluid && <path d={`${d}L${width - 1},${height}L1,${height}Z`} fill={stroke} opacity="0.12" />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {!fluid && <circle cx={width - 1} cy={lastY} r="1.6" fill={stroke} />}
    </svg>
  );
}
