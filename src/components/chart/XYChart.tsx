import { useEffect, useRef } from 'react';
import { CHART_THEME } from './PriceChart';
import { fmtNum } from '../../core/format';
import { backingSize, crispDash, crispEdge, crispLine, crispWidth, deviceBox, watchPixelRatio } from './pixels';

export interface XYPoint {
  x: number;
  y: number;
  label?: string;
}

export interface XYSeries {
  label: string;
  color: string;
  points: XYPoint[];
  kind?: 'line' | 'scatter' | 'bar';
  dash?: number[];
  width?: number;
  markers?: boolean;
  /** Plot against a second scale whose labels are at the left (a yield beside a dividend, say). */
  axis?: 'left';
}

interface Props {
  series: XYSeries[];
  xTicks?: { v: number; label: string }[];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  /** Plot x on a square-root scale (tenor curves). */
  xScale?: 'linear' | 'sqrt';
  yZero?: boolean;
  symmetricY?: boolean;
  refLines?: { y?: number; x?: number; color: string; label?: string }[];
  height?: number | string;
  legend?: boolean;
  xLabel?: string;
  /** Labels of the second (left) scale. */
  y2Format?: (v: number) => string;
}

const AXIS_W = 62;
const AXIS_H = 20;

/**
 * Room left at each end of the x axis: 3% of the range, 6% with bars, and at least half the step between bars, as a
 * bar is 70% of a step wide and a chart of few bars would otherwise draw the outer ones past its edges.
 */
export function xPadding(series: XYSeries[], x0: number, x1: number, tx: (x: number) => number = (x) => x): number {
  const bars = series.filter((s) => s.kind === 'bar');
  const steps = bars.flatMap((s) => {
    const xs = s.points.map((q) => tx(q.x)).sort((a, b) => a - b);
    return xs.slice(1).map((x, i) => x - xs[i]).filter((d) => d > 0);
  });
  const halfStep = steps.length ? Math.min(...steps) / 2 : 0;
  return Math.max((x1 - x0) * (bars.length ? 0.06 : 0.03), halfStep) || 1;
}

/** Canvas XY chart for curves, scatter plots and bar profiles. */
export function XYChart(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const drawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const el = host.current!;
    const cv = canvas.current!;
    // Opaque, as the chart paints its own black background: Chromium then skips blending and draws sharper text.
    const ctx = cv.getContext('2d', { alpha: false })!;
    let w = 0;
    let h = 0;
    // The canvas's device-pixel box, from the resize observer where the browser reports it.
    let device: { width: number; height: number } | undefined;
    const draw = () => {
      // Points without a value (a missing estimate, say) are left out rather than breaking the scale.
      const p = { ...propsRef.current, series: propsRef.current.series.map((s) => ({ ...s, points: s.points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)) })) };
      // The backing store matches the element's device pixels at the real ratio (125%, 150% or 250% scaling alike).
      const dpr = window.devicePixelRatio || 1;
      const r = el.getBoundingClientRect();
      w = Math.max(10, r.width);
      h = Math.max(10, r.height);
      const fits = device && Math.abs(device.width - w * dpr) < 2 && Math.abs(device.height - h * dpr) < 2;
      const size = backingSize(w, h, dpr, fits ? device : undefined);
      if (cv.width !== size.width) cv.width = size.width;
      if (cv.height !== size.height) cv.height = size.height;
      const sx = size.width / w;
      const sy = size.height / h;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      // Straight lines and filled edges on whole device pixels.
      const lx = (x: number) => crispLine(x, sx);
      const ly = (y: number) => crispLine(y, sy);
      const hair = crispWidth(Math.min(sx, sy));
      const dash = (d: number[]) => crispDash(d, Math.min(sx, sy));
      const box = (x: number, y: number, bw: number, bh: number) => {
        const x0 = crispEdge(x, sx);
        const y0 = crispEdge(y, sy);
        ctx.fillRect(x0, y0, Math.max(1 / sx, crispEdge(x + bw, sx) - x0), Math.max(1 / sy, crispEdge(y + bh, sy) - y0));
      };
      ctx.lineWidth = hair;
      const T = CHART_THEME;
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, w, h);
      const pts = p.series.flatMap((s) => s.points);
      if (!pts.length) return;
      const tx = (x: number) => (p.xScale === 'sqrt' ? Math.sqrt(Math.max(0, x)) : x);
      let x0 = Math.min(...pts.map((q) => tx(q.x)));
      let x1 = Math.max(...pts.map((q) => tx(q.x)));
      for (const t of p.xTicks ?? []) {
        x0 = Math.min(x0, tx(t.v));
        x1 = Math.max(x1, tx(t.v));
      }
      const second = p.series.filter((s) => s.axis === 'left');
      const firstPts = p.series.filter((s) => s.axis !== 'left').flatMap((s) => s.points);
      const yPts = firstPts.length ? firstPts : pts;
      let y0 = Math.min(...yPts.map((q) => q.y), ...(p.refLines ?? []).filter((l) => l.y != null).map((l) => l.y!));
      let y1 = Math.max(...yPts.map((q) => q.y), ...(p.refLines ?? []).filter((l) => l.y != null).map((l) => l.y!));
      // The second scale: its own range, padded the same way.
      const secondPts = second.flatMap((s) => s.points);
      let b0 = secondPts.length ? Math.min(...secondPts.map((q) => q.y)) : 0;
      let b1 = secondPts.length ? Math.max(...secondPts.map((q) => q.y)) : 1;
      if (b1 - b0 < 1e-9) {
        b1 += 1;
        b0 -= 1;
      }
      const pb = (b1 - b0) * 0.08;
      b0 -= pb;
      b1 += pb;
      if (p.yZero) {
        y0 = Math.min(0, y0);
        y1 = Math.max(0, y1);
      }
      if (p.symmetricY) {
        const m = Math.max(Math.abs(y0), Math.abs(y1));
        y0 = -m;
        y1 = m;
      }
      if (y1 - y0 < 1e-9) {
        y1 += 1;
        y0 -= 1;
      }
      const py = (y1 - y0) * 0.08;
      y0 -= py;
      y1 += py;
      const px = xPadding(p.series, x0, x1, tx);
      x0 -= px;
      x1 += px;
      const L = second.length ? AXIS_W : 8;
      const R = w - AXIS_W;
      const top = p.legend === false ? 8 : 22;
      const bottom = h - AXIS_H;
      const X = (x: number) => L + ((tx(x) - x0) / (x1 - x0)) * (R - L);
      const Y1 = (y: number) => top + ((y1 - y) / (y1 - y0)) * (bottom - top);
      const Y2 = (y: number) => top + ((b1 - y) / (b1 - b0)) * (bottom - top);
      let Y = Y1;
      ctx.font = T.font;
      ctx.textBaseline = 'middle';
      // y grid
      const raw = (y1 - y0) / Math.max(3, Math.floor((bottom - top) / 40));
      const mag = 10 ** Math.floor(Math.log10(raw));
      const f = raw / mag;
      const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
      ctx.fillStyle = T.axisText;
      ctx.textAlign = 'left';
      for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
        const y = ly(Y(v));
        ctx.strokeStyle = Math.abs(v) < step / 2 ? T.gridStrong : T.grid;
        ctx.setLineDash(Math.abs(v) < step / 2 ? [] : dash([2, 3]));
        ctx.beginPath();
        ctx.moveTo(L, y);
        ctx.lineTo(R, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(p.yFormat ? p.yFormat(v) : fmtNum(v, step < 0.1 ? 2 : step < 1 ? 1 : 0), R + 6, y);
      }
      if (second.length) {
        const raw2 = (b1 - b0) / Math.max(3, Math.floor((bottom - top) / 40));
        const mag2 = 10 ** Math.floor(Math.log10(raw2));
        const f2 = raw2 / mag2;
        const step2 = (f2 < 1.5 ? 1 : f2 < 3 ? 2 : f2 < 7 ? 5 : 10) * mag2;
        ctx.textAlign = 'right';
        ctx.fillStyle = second[0].color;
        for (let v = Math.ceil(b0 / step2) * step2; v <= b1; v += step2) ctx.fillText(p.y2Format ? p.y2Format(v) : fmtNum(v, step2 < 0.1 ? 2 : step2 < 1 ? 1 : 0), L - 6, ly(Y2(v)));
        ctx.strokeStyle = T.gridStrong;
        ctx.beginPath();
        ctx.moveTo(lx(L - 0.5), top);
        ctx.lineTo(lx(L - 0.5), bottom);
        ctx.stroke();
      }
      // x ticks
      const ticks = p.xTicks ?? (() => {
        const sx = (x1 - x0) / Math.max(2, Math.floor((R - L) / 80));
        const m2 = 10 ** Math.floor(Math.log10(sx));
        const s2 = (sx / m2 < 1.5 ? 1 : sx / m2 < 3 ? 2 : sx / m2 < 7 ? 5 : 10) * m2;
        const out: { v: number; label: string }[] = [];
        for (let v = Math.ceil(x0 / s2) * s2; v <= x1; v += s2) out.push({ v, label: p.xFormat ? p.xFormat(v) : fmtNum(v, s2 < 1 ? 2 : 0) });
        return out;
      })();
      ctx.textAlign = 'center';
      let lastX = -Infinity;
      for (const t of ticks) {
        const x = lx(X(t.v));
        ctx.strokeStyle = T.grid;
        ctx.setLineDash(dash([2, 3]));
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        const tw = ctx.measureText(t.label).width;
        if (x - tw / 2 > lastX + 4) {
          ctx.fillStyle = T.axisText;
          ctx.fillText(t.label, x, bottom + AXIS_H / 2);
          lastX = x + tw / 2;
        }
      }
      ctx.strokeStyle = T.gridStrong;
      ctx.beginPath();
      ctx.moveTo(lx(R), top);
      ctx.lineTo(lx(R), bottom);
      ctx.moveTo(L, ly(bottom));
      ctx.lineTo(R, ly(bottom));
      ctx.stroke();
      for (const rl of p.refLines ?? []) {
        ctx.strokeStyle = rl.color;
        ctx.setLineDash(dash([4, 4]));
        ctx.beginPath();
        if (rl.y != null) {
          ctx.moveTo(L, ly(Y(rl.y)));
          ctx.lineTo(R, ly(Y(rl.y)));
        } else if (rl.x != null) {
          ctx.moveTo(lx(X(rl.x)), top);
          ctx.lineTo(lx(X(rl.x)), bottom);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (rl.label) {
          ctx.fillStyle = rl.color;
          ctx.textAlign = 'left';
          if (rl.y != null) ctx.fillText(rl.label, L + 4, Y(rl.y) - 8);
          else if (rl.x != null) ctx.fillText(rl.label, X(rl.x) + 4, top + 8);
        }
      }
      // series
      const barSeries = p.series.filter((s) => s.kind === 'bar');
      p.series.forEach((s) => {
        Y = s.axis === 'left' ? Y2 : Y1;
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = s.width ?? 1.6;
        if (s.kind === 'bar') {
          const bi = barSeries.indexOf(s);
          const xs = s.points.map((q) => X(q.x));
          const gap = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i])) : (R - L) / 4;
          const bw = Math.max(2, (gap * 0.7) / barSeries.length);
          for (const q of s.points) {
            const x = X(q.x) - (bw * barSeries.length) / 2 + bi * bw;
            const ya = Y(0);
            const yb = Y(q.y);
            box(x, Math.min(ya, yb), bw - 1, Math.max(1, Math.abs(yb - ya)));
          }
          return;
        }
        if (s.kind === 'scatter') {
          for (const q of s.points) {
            ctx.beginPath();
            ctx.arc(X(q.x), Y(q.y), 2.2, 0, Math.PI * 2);
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          return;
        }
        ctx.setLineDash(s.dash ?? []);
        ctx.beginPath();
        s.points.forEach((q, i) => (i === 0 ? ctx.moveTo(X(q.x), Y(q.y)) : ctx.lineTo(X(q.x), Y(q.y))));
        ctx.stroke();
        ctx.setLineDash([]);
        if (s.markers) {
          for (const q of s.points) {
            ctx.beginPath();
            ctx.arc(X(q.x), Y(q.y), 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      // legend
      if (p.legend !== false) {
        let keyX = L + 4;
        ctx.textAlign = 'left';
        for (const s of p.series) {
          if (!s.label) continue;
          ctx.fillStyle = s.color;
          box(keyX, 10, 10, 3);
          ctx.fillStyle = T.text;
          ctx.fillText(s.label, keyX + 14, 11);
          keyX += ctx.measureText(s.label).width + 30;
        }
      }
      // hover: nearest point per series by x
      const hv = hover.current;
      if (hv && hv.x >= L && hv.x <= R && hv.y >= top && hv.y <= bottom) {
        ctx.strokeStyle = T.cross;
        ctx.lineWidth = hair;
        ctx.setLineDash(dash([3, 3]));
        ctx.beginPath();
        ctx.moveTo(lx(hv.x), top);
        ctx.lineTo(lx(hv.x), bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        const lines: { c: string; t: string }[] = [];
        for (const s of p.series) {
          if (!s.points.length || s.kind === 'scatter') continue;
          let best = s.points[0];
          for (const q of s.points) if (Math.abs(X(q.x) - hv.x) < Math.abs(X(best.x) - hv.x)) best = q;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(X(best.x), (s.axis === 'left' ? Y2 : Y1)(best.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
          const fy = s.axis === 'left' ? p.y2Format : p.yFormat;
          lines.push({ c: s.color, t: `${s.label ? s.label + ': ' : ''}${best.label ?? (p.xFormat ? p.xFormat(best.x) : fmtNum(best.x, 2))}  ${fy ? fy(best.y) : fmtNum(best.y, 3)}` });
        }
        if (lines.length) {
          const bw = Math.max(...lines.map((l) => ctx.measureText(l.t).width)) + 16;
          const bx = hv.x + bw + 12 > R ? hv.x - bw - 8 : hv.x + 8;
          const by = Math.max(top, Math.min(hv.y - 10, bottom - lines.length * 15 - 8));
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          box(bx, by, bw, lines.length * 15 + 6);
          ctx.strokeStyle = '#333';
          ctx.strokeRect(lx(bx), ly(by), crispEdge(bw, sx), crispEdge(lines.length * 15 + 6, sy));
          lines.forEach((l, i) => {
            ctx.fillStyle = l.c;
            ctx.textAlign = 'left';
            ctx.fillText(l.t, bx + 8, by + 11 + i * 15);
          });
        }
      }
    };
    drawRef.current = draw;
    const ro = new ResizeObserver((entries) => {
      device = deviceBox(entries.find((e) => e.target === cv)) ?? device;
      draw();
    });
    ro.observe(el);
    try {
      ro.observe(cv, { box: 'device-pixel-content-box' });
    } catch {
      // Without device-pixel boxes, the size comes from the element's exact size times the ratio.
    }
    const stopRatio = watchPixelRatio(draw);
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      hover.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      draw();
    };
    const leave = () => {
      hover.current = null;
      draw();
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerleave', leave);
    return () => {
      ro.disconnect();
      stopRatio();
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerleave', leave);
    };
  }, []);

  useEffect(() => {
    drawRef.current();
  });

  return (
    <div ref={host} style={{ position: 'relative', height: props.height ?? 260, minHeight: 120 }}>
      <canvas ref={canvas} style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }} />
    </div>
  );
}
