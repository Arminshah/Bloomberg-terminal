import { bollinger, ema, macd, rsi, sma } from '../../finance/indicators';
import type { Series } from '../../data/series';
import { fmtBig, fmtDay, fmtMonthDayNum, fmtNum, MONTHS } from '../../core/format';
import { onColourScheme, palette, withAlpha } from '../../terminal/palette';
import { backingSize, crispDash, crispEdge, crispLine, crispWidth, deviceBox, watchPixelRatio } from './pixels';

export type ChartType = 'line' | 'mountain' | 'candle' | 'bar';
export type LowerKind = 'VOL' | 'RSI' | 'MACD';

export interface Overlay {
  kind: 'SMA' | 'EMA' | 'BOLL';
  n: number;
  color: string;
}

export interface CompareInput {
  label: string;
  series: Series;
  color: string;
}

export interface ChartOptions {
  type: ChartType;
  dec: number;
  label: string;
  intraday: boolean;
  overlays: Overlay[];
  lower: LowerKind[];
  compare: CompareInput[];
  percent: boolean;
  annotate: boolean;
  refLine?: { value: number; label: string };
  /** Number of bars visible when the view is reset. */
  initialBars: number;
  /** The n-bar simple average of volume, drawn as a line over the volume bars. */
  volumeAverage?: number;
  /** Bars left out after the visible window when the view is reset (a typed end date before the latest bar). */
  initialEnd?: number;
  color?: string;
  /** Formats times in the user's display zone (intraday labels). */
  timeLabel?: (ms: number) => string;
  dateLabel?: (ms: number) => string;
}

/** A snapshot of the inspected bar, so the DOM readout also updates on live ticks. */
export interface ChartObservation {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  from: number;
  to: number;
  hovered: boolean;
}


export const CHART_THEME = {
  bg: '#000000',
  // The terminal's charts draw a dotted grey grid that stays visible on black.
  grid: '#333a42',
  gridStrong: '#4a525c',
  axis: '#8f8f8f',
  axisText: '#c8c8c8',
  text: '#e8e8e8',
  amber: '#ff9e1b',
  // GP's default: a white last-price line over a blue mountain, with the last value tagged in white.
  line: '#f4f4f4',
  mountainTop: 'rgba(54,124,184,0.78)',
  mountainBottom: 'rgba(10,32,58,0.30)',
  // A rise and a fall in the colour scheme's colours (palette.ts).
  get up() {
    return palette().up;
  },
  get dn() {
    return palette().dn;
  },
  get upFill() {
    return withAlpha(palette().up, 0.55);
  },
  get dnFill() {
    return withAlpha(palette().dn, 0.55);
  },
  cross: 'rgba(255,255,255,0.45)',
  ref: '#6d6d6d',
  // The charts' labels: IBM Plex Mono, fixed (the owner's choice; tests/typeface.test.ts).
  font: '11px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
  fontB: '600 11px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
};

export const COMPARE_COLORS = ['#45d3e6', '#d77bff', '#2fd36b', '#ffd23f', '#ff6f91', '#7aa2ff'];

interface Pane {
  kind: 'MAIN' | LowerKind;
  top: number;
  h: number;
}

const AXIS_W = 70;
const AXIS_H = 18;
const LEFT = 4;
const TOP = 6;

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const nice = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return nice * mag;
}

function decimalsFor(step: number, base: number): number {
  if (step >= 1) return Math.min(base, step % 1 === 0 ? 0 : 1);
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) + 0.001)));
}

export class PriceChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private w = 0;
  private h = 0;
  /** Backing-store pixels per CSS pixel, across and down. */
  private sx = 1;
  private sy = 1;
  private stopRatio: () => void;
  private redraw = () => this.schedule();
  private stopScheme: () => void;
  private s: Series | null = null;
  private opt: ChartOptions | null = null;
  private v0 = 0;
  private v1 = 1;
  private hover: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; v0: number; v1: number; dist?: number } | null = null;
  private raf = 0;
  private lastLen = 0;
  private ind: {
    overlays: { o: Overlay; a: Float64Array; b?: Float64Array; c?: Float64Array }[];
    rsi?: Float64Array;
    macd?: { macd: Float64Array; signal: Float64Array; hist: Float64Array };
    cmp: Float64Array[];
    vma?: Float64Array;
  } = { overlays: [], cmp: [] };
  private indKey = '';
  onHover?: (index: number | null) => void;
  onObservation?: (observation: ChartObservation | null) => void;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'crosshair';
    host.appendChild(this.canvas);
    // Opaque: the chart paints its own black background, and Chromium then skips blending and draws sharper text.
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.ro = new ResizeObserver((entries) => this.resize(deviceBox(entries.find((e) => e.target === this.canvas))));
    this.ro.observe(host);
    try {
      this.ro.observe(this.canvas, { box: 'device-pixel-content-box' });
    } catch {
      // Without device-pixel boxes, the size comes from the element's exact size times the ratio.
    }
    this.stopRatio = watchPixelRatio(() => this.resize());
    this.stopScheme = onColourScheme(this.redraw);
    this.resize();
    this.bind();
    if (document.fonts?.ready) document.fonts.ready.then(() => this.schedule()).catch(() => undefined);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.stopRatio();
    this.stopScheme();
    this.canvas.remove();
  }

  setData(s: Series, opt: ChartOptions, resetView: boolean) {
    const prevLen = this.lastLen;
    const wasAtEdge = this.v1 >= prevLen - 0.5;
    this.s = s;
    this.opt = opt;
    if (resetView || prevLen === 0) this.resetView();
    else if (s.length !== prevLen && wasAtEdge) {
      const d = s.length - prevLen;
      this.v0 += d;
      this.v1 += d;
    }
    this.lastLen = s.length;
    this.indKey = '';
    this.schedule();
  }

  /** The underlying arrays changed in place (live tick). */
  refresh() {
    if (!this.s) return;
    if (this.s.length !== this.lastLen) {
      const d = this.s.length - this.lastLen;
      if (this.v1 >= this.lastLen - 0.5) {
        this.v0 += d;
        this.v1 += d;
      }
      this.lastLen = this.s.length;
      this.indKey = '';
    } else {
      // Indicators depend on the last close too.
      this.indKey = '';
    }
    this.schedule();
  }

  resetView() {
    if (!this.s || !this.opt) return;
    const n = this.s.length;
    const end = n - Math.min(Math.max(0, this.opt.initialEnd ?? 0), Math.max(0, n - 5));
    const count = Math.min(end, Math.max(5, this.opt.initialBars));
    const pad = Math.max(1, count * 0.02);
    this.v1 = end + pad;
    this.v0 = end - count;
    this.schedule();
  }

  zoom(factor: number) {
    const mid = (this.v0 + this.v1) / 2;
    this.zoomAt(mid, factor);
  }

  /** Sizes the backing store to the element's device pixels, at the real ratio (125%, 150% or 250% scaling alike). */
  private resize(device?: { width: number; height: number }) {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(10, r.width);
    this.h = Math.max(10, r.height);
    // The canvas's own device box, unless it is not the host's size (yet).
    const fits = device && Math.abs(device.width - this.w * dpr) < 2 && Math.abs(device.height - this.h * dpr) < 2;
    const size = backingSize(this.w, this.h, dpr, fits ? device : undefined);
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    this.sx = size.width / this.w;
    this.sy = size.height / this.h;
    this.draw();
  }

  /** A vertical line's x, a horizontal line's y, on whole device pixels. */
  private lx(x: number) {
    return crispLine(x, this.sx);
  }

  private ly(y: number) {
    return crispLine(y, this.sy);
  }

  /** One device pixel or more: the hairline of grids, axes and wicks. */
  private hair() {
    return crispWidth(Math.min(this.sx, this.sy));
  }

  private dash(pattern: number[]) {
    return crispDash(pattern, Math.min(this.sx, this.sy));
  }

  /** A filled rectangle whose edges are on device pixels, at least one device pixel each way. */
  private box(x: number, y: number, w: number, h: number) {
    const x0 = crispEdge(x, this.sx);
    const y0 = crispEdge(y, this.sy);
    const x1 = Math.max(x0 + 1 / this.sx, crispEdge(x + w, this.sx));
    const y1 = Math.max(y0 + 1 / this.sy, crispEdge(y + h, this.sy));
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  // ------------------------------------------------------------- input

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      const p = this.local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.drag && this.pointers.size >= 2 && this.drag.dist) {
        const pts = [...this.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const count = (this.drag.v1 - this.drag.v0) * (this.drag.dist / Math.max(20, dist));
        const mid = (this.drag.v0 + this.drag.v1) / 2;
        this.setWindow(mid - count / 2, mid + count / 2);
        return;
      }
      if (this.drag && this.pointers.size === 1) {
        const bw = this.plotW() / (this.drag.v1 - this.drag.v0);
        const shift = (this.drag.x - p.x) / bw;
        this.setWindow(this.drag.v0 + shift, this.drag.v1 + shift);
        this.hover = e.pointerType === 'mouse' ? p : null;
        return;
      }
      this.hover = p;
      this.schedule();
    });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const pts = [...this.pointers.values()];
        this.drag = { x: p.x, v0: this.v0, v1: this.v1, dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
      } else {
        this.drag = { x: p.x, v0: this.v0, v1: this.v1 };
      }
      if (e.pointerType !== 'mouse') this.hover = p;
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) this.drag = null;
      else {
        const rest = [...this.pointers.values()][0];
        this.drag = { x: rest.x, v0: this.v0, v1: this.v1 };
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        this.hover = null;
        this.onHover?.(null);
        this.schedule();
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        const anchor = this.indexAt(p.x);
        const factor = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0022);
        this.zoomAt(anchor, factor);
      },
      { passive: false },
    );
    c.addEventListener('dblclick', () => this.resetView());
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private zoomAt(anchor: number, factor: number) {
    const count = this.v1 - this.v0;
    const n = this.s?.length ?? 0;
    const next = Math.min(Math.max(count * factor, 8), Math.max(n * 1.05, 10));
    const k = next / count;
    this.setWindow(anchor - (anchor - this.v0) * k, anchor + (this.v1 - anchor) * k);
  }

  private setWindow(a: number, b: number) {
    const n = this.s?.length ?? 0;
    const count = b - a;
    const maxRight = n + count * 0.25;
    const minLeft = -count * 0.25;
    if (b > maxRight) {
      a -= b - maxRight;
      b = maxRight;
    }
    if (a < minLeft) {
      b += minLeft - a;
      a = minLeft;
    }
    this.v0 = a;
    this.v1 = b;
    this.schedule();
  }

  // ------------------------------------------------------------- geometry

  private plotW() {
    return this.w - AXIS_W - LEFT;
  }

  private indexAt(x: number): number {
    return this.v0 + ((x - LEFT) / this.plotW()) * (this.v1 - this.v0);
  }

  private xAt(i: number): number {
    return LEFT + ((i + 0.5 - this.v0) / (this.v1 - this.v0)) * this.plotW();
  }

  private panes(): Pane[] {
    const lower = this.opt?.lower ?? [];
    const total = this.h - AXIS_H - TOP;
    const share: Record<LowerKind, number> = { VOL: 0.16, RSI: 0.16, MACD: 0.18 };
    let used = 0;
    const lowerPanes: Pane[] = [];
    for (const k of lower) used += share[k];
    const mainH = Math.max(60, total * (1 - used));
    let y = TOP + mainH;
    for (const k of lower) {
      const ph = (total - mainH) * (share[k] / used);
      lowerPanes.push({ kind: k, top: y, h: ph });
      y += ph;
    }
    return [{ kind: 'MAIN', top: TOP, h: mainH }, ...lowerPanes];
  }

  // ------------------------------------------------------------ indicators

  private computeIndicators() {
    const s = this.s!;
    const opt = this.opt!;
    const key = `${s.length}:${s.c[s.length - 1]}:${opt.overlays.map((o) => o.kind + o.n).join()}:${opt.lower.join()}:${opt.compare.length}:${opt.volumeAverage ?? ''}`;
    if (key === this.indKey) return;
    this.indKey = key;
    const closes = s.c.subarray(0, s.length);
    this.ind.overlays = opt.overlays.map((o) => {
      if (o.kind === 'BOLL') {
        const b = bollinger(closes, o.n, 2);
        return { o, a: b.mid, b: b.upper, c: b.lower };
      }
      return { o, a: o.kind === 'SMA' ? sma(closes, o.n) : ema(closes, o.n) };
    });
    this.ind.rsi = opt.lower.includes('RSI') ? rsi(closes, 14) : undefined;
    this.ind.macd = opt.lower.includes('MACD') ? macd(closes) : undefined;
    this.ind.vma = opt.volumeAverage && opt.lower.includes('VOL') ? sma(s.v.subarray(0, s.length), opt.volumeAverage) : undefined;
    // Align comparison series to the primary timestamps (last value at or before).
    this.ind.cmp = opt.compare.map((cmp) => {
      const out = new Float64Array(s.length).fill(NaN);
      const cs = cmp.series;
      let j = 0;
      for (let i = 0; i < s.length; i++) {
        while (j + 1 < cs.length && cs.t[j + 1] <= s.t[i] + (opt.intraday ? 0 : 43_200_000)) j++;
        if (cs.length && cs.t[j] <= s.t[i] + (opt.intraday ? 0 : 43_200_000)) out[i] = cs.c[j];
      }
      return out;
    });
  }

  // ------------------------------------------------------------------ draw

  private draw() {
    const ctx = this.ctx;
    const T = CHART_THEME;
    ctx.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    const s = this.s;
    const opt = this.opt;
    if (!s || !opt || s.length === 0) {
      ctx.fillStyle = T.axis;
      ctx.font = T.font;
      ctx.fillText('No price history from the source yet (PROVIDERS shows its status)', 10, 20);
      this.onObservation?.(null);
      return;
    }
    this.computeIndicators();
    const n = s.length;
    const i0 = Math.max(0, Math.floor(this.v0));
    const i1 = Math.min(n - 1, Math.ceil(this.v1) - 1);
    if (i1 < i0) return;
    const panes = this.panes();
    const main = panes[0];
    const pct = opt.percent || opt.compare.length > 0;
    const base = s.c[i0];
    const tr = (v: number) => (pct ? (v / base - 1) * 100 : v);

    // Y range on visible bars.
    let lo = Infinity;
    let hi = -Infinity;
    const useHL = opt.type === 'candle' || opt.type === 'bar';
    for (let i = i0; i <= i1; i++) {
      const a = tr(useHL ? s.l[i] : s.c[i]);
      const b = tr(useHL ? s.h[i] : s.c[i]);
      if (a < lo) lo = a;
      if (b > hi) hi = b;
    }
    for (const ov of this.ind.overlays) {
      for (let i = i0; i <= i1; i++) {
        for (const arr of [ov.a, ov.b, ov.c]) {
          if (!arr) continue;
          const v = arr[i];
          if (!Number.isFinite(v)) continue;
          lo = Math.min(lo, tr(v));
          hi = Math.max(hi, tr(v));
        }
      }
    }
    this.ind.cmp.forEach((arr) => {
      const b0 = firstFinite(arr, i0, i1);
      if (!Number.isFinite(b0)) return;
      for (let i = i0; i <= i1; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) continue;
        const p = (v / b0 - 1) * 100;
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    });
    if (opt.refLine && !pct && Number.isFinite(opt.refLine.value)) {
      lo = Math.min(lo, opt.refLine.value);
      hi = Math.max(hi, opt.refLine.value);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    if (hi - lo < 1e-9) {
      hi += Math.abs(hi) * 0.01 || 1;
      lo -= Math.abs(lo) * 0.01 || 1;
    }
    const padY = (hi - lo) * 0.07;
    lo -= padY;
    hi += padY;
    const yAt = (v: number) => main.top + ((hi - v) / (hi - lo)) * main.h;
    const plotRight = LEFT + this.plotW();
    const bw = this.plotW() / (this.v1 - this.v0);

    // Grid and axes.
    ctx.font = T.font;
    ctx.textBaseline = 'middle';
    const step = niceStep(hi - lo, Math.max(3, Math.floor(main.h / 46)));
    const tickDec = pct ? decimalsFor(step, 2) : Math.max(decimalsFor(step, opt.dec), Math.min(opt.dec, decimalsFor(step, 6)));
    ctx.strokeStyle = T.grid;
    ctx.lineWidth = this.hair();
    ctx.fillStyle = T.axisText;
    ctx.textAlign = 'left';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = this.ly(yAt(v));
      ctx.setLineDash(this.dash([2, 3]));
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(pct ? `${fmtNum(v, tickDec)}%` : fmtNum(v, tickDec), plotRight + 6, y);
    }
    this.drawTimeAxis(i0, i1, panes);

    // Pane separators.
    ctx.strokeStyle = T.gridStrong;
    for (const p of panes.slice(1)) {
      ctx.beginPath();
      ctx.moveTo(LEFT, this.ly(p.top));
      ctx.lineTo(this.w, this.ly(p.top));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(this.lx(plotRight), TOP);
    ctx.lineTo(this.lx(plotRight), this.h - AXIS_H);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT, main.top, this.plotW(), main.h);
    ctx.clip();

    // Reference line (previous close).
    if (opt.refLine && !pct && Number.isFinite(opt.refLine.value)) {
      const y = this.ly(yAt(opt.refLine.value));
      ctx.strokeStyle = T.ref;
      ctx.setLineDash(this.dash([5, 4]));
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bollinger fill under lines.
    for (const ov of this.ind.overlays) {
      if (ov.o.kind !== 'BOLL' || !ov.b || !ov.c) continue;
      ctx.fillStyle = 'rgba(160,160,160,0.08)';
      ctx.beginPath();
      let started = false;
      for (let i = i0; i <= i1; i++) {
        if (!Number.isFinite(ov.b[i])) continue;
        const x = this.xAt(i);
        const y = yAt(tr(ov.b[i]));
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      for (let i = i1; i >= i0; i--) {
        if (!Number.isFinite(ov.c[i])) continue;
        ctx.lineTo(this.xAt(i), yAt(tr(ov.c[i])));
      }
      ctx.closePath();
      if (started) ctx.fill();
    }

    const color = opt.color ?? T.line;
    if (opt.type === 'candle' || opt.type === 'bar') {
      const body = Math.max(1, Math.min(bw * 0.7, 18));
      for (let i = i0; i <= i1; i++) {
        const x = this.xAt(i);
        const o = yAt(tr(s.o[i]));
        const c = yAt(tr(s.c[i]));
        const h = yAt(tr(s.h[i]));
        const l = yAt(tr(s.l[i]));
        const up = s.c[i] >= s.o[i];
        ctx.strokeStyle = up ? T.up : T.dn;
        ctx.fillStyle = up ? T.up : T.dn;
        ctx.lineWidth = this.hair();
        const xr = this.lx(x);
        if (opt.type === 'candle') {
          ctx.beginPath();
          ctx.moveTo(xr, h);
          ctx.lineTo(xr, l);
          ctx.stroke();
          const top = Math.min(o, c);
          const hgt = Math.max(1, Math.abs(c - o));
          if (body >= 3) this.box(x - body / 2, top, body, hgt);
          else this.box(xr - this.hair() / 2, top, this.hair(), hgt);
        } else {
          const tick = Math.max(1, body / 2);
          ctx.beginPath();
          ctx.moveTo(xr, h);
          ctx.lineTo(xr, l);
          ctx.moveTo(xr - tick, this.ly(o));
          ctx.lineTo(xr, this.ly(o));
          ctx.moveTo(xr, this.ly(c));
          ctx.lineTo(xr + tick, this.ly(c));
          ctx.stroke();
        }
      }
    } else {
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = this.xAt(i);
        const y = yAt(tr(s.c[i]));
        if (i === i0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (opt.type === 'mountain') {
        const grad = ctx.createLinearGradient(0, main.top, 0, main.top + main.h);
        // The default series fills in the terminal's blue; a series given its own colour fills in that colour.
        grad.addColorStop(0, opt.color ? hexAlpha(color, 0.38) : T.mountainTop);
        grad.addColorStop(1, opt.color ? hexAlpha(color, 0.02) : T.mountainBottom);
        ctx.save();
        ctx.lineTo(this.xAt(i1), main.top + main.h);
        ctx.lineTo(this.xAt(i0), main.top + main.h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        for (let i = i0; i <= i1; i++) {
          const x = this.xAt(i);
          const y = yAt(tr(s.c[i]));
          if (i === i0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Overlays.
    for (const ov of this.ind.overlays) {
      const lines = ov.o.kind === 'BOLL' ? [ov.a, ov.b!, ov.c!] : [ov.a];
      lines.forEach((arr, k) => {
        ctx.strokeStyle = ov.o.color;
        ctx.lineWidth = k === 0 ? 1.2 : 1;
        ctx.setLineDash(k === 0 ? [] : [3, 3]);
        ctx.beginPath();
        let started = false;
        for (let i = i0; i <= i1; i++) {
          const v = arr[i];
          if (!Number.isFinite(v)) continue;
          const x = this.xAt(i);
          const y = yAt(tr(v));
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // Comparison lines (percent from first visible value).
    const cmpLast: { y: number; v: number; color: string }[] = [];
    this.ind.cmp.forEach((arr, k) => {
      const b0 = firstFinite(arr, i0, i1);
      if (!Number.isFinite(b0)) return;
      const col = opt.compare[k].color;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let started = false;
      let lastV = NaN;
      for (let i = i0; i <= i1; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) continue;
        const p = (v / b0 - 1) * 100;
        const x = this.xAt(i);
        const y = yAt(p);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
        lastV = p;
      }
      ctx.stroke();
      if (Number.isFinite(lastV)) cmpLast.push({ y: yAt(lastV), v: lastV, color: col });
    });

    // High / low annotations.
    let hiI = i0;
    let loI = i0;
    let sum = 0;
    for (let i = i0; i <= i1; i++) {
      const hv = useHL ? s.h[i] : s.c[i];
      const lv = useHL ? s.l[i] : s.c[i];
      if (hv > (useHL ? s.h[hiI] : s.c[hiI])) hiI = i;
      if (lv < (useHL ? s.l[loI] : s.c[loI])) loI = i;
      sum += s.c[i];
    }
    const avg = sum / (i1 - i0 + 1);
    const hiV = useHL ? s.h[hiI] : s.c[hiI];
    const loV = useHL ? s.l[loI] : s.c[loI];
    if (opt.annotate && !pct) {
      ctx.strokeStyle = 'rgba(255,158,27,0.45)';
      ctx.lineWidth = this.hair();
      ctx.setLineDash(this.dash([1, 3]));
      const ya = this.ly(yAt(avg));
      ctx.beginPath();
      ctx.moveTo(LEFT, ya);
      ctx.lineTo(plotRight, ya);
      ctx.stroke();
      ctx.setLineDash([]);
      this.marker(this.xAt(hiI), yAt(hiV), true, fmtNum(hiV, opt.dec));
      this.marker(this.xAt(loI), yAt(loV), false, fmtNum(loV, opt.dec));
    }
    ctx.restore();

    const inPlot = this.hover && this.hover.x >= LEFT && this.hover.x <= plotRight && this.hover.y >= TOP && this.hover.y <= this.h - AXIS_H;
    const candidate = inPlot ? Math.round(this.indexAt(this.hover!.x) - 0.5) : -1;
    const hoverIndex = candidate >= i0 && candidate <= i1 ? candidate : null;
    const inspected = hoverIndex ?? i1;

    // Studies and the readout always describe the same inspected observation.
    for (const p of panes.slice(1)) this.drawLower(p, i0, i1, bw, inspected);

    // Axis tags: average, reference, comparisons, last.
    if (opt.annotate && !pct) this.axisTag(yAt(avg), fmtNum(avg, opt.dec), '#3a2a10', T.amber, main);
    if (opt.refLine && !pct && Number.isFinite(opt.refLine.value)) this.axisTag(yAt(opt.refLine.value), fmtNum(opt.refLine.value, opt.dec), '#2a2a2a', T.axisText, main);
    for (const c of cmpLast) this.axisTag(c.y, `${fmtNum(c.v, 2)}%`, c.color, '#000', main);
    const lastV = tr(s.c[i1]);
    this.axisTag(yAt(lastV), pct ? `${fmtNum(lastV, 2)}%` : fmtNum(s.c[i1], opt.dec), color, '#000', main, true);

    // Crosshair.
    if (this.hover && hoverIndex != null) {
      const idx = hoverIndex;
      const x = this.lx(this.xAt(idx));
      const y = this.ly(this.hover.y);
      ctx.strokeStyle = T.cross;
      ctx.lineWidth = this.hair();
      ctx.setLineDash(this.dash([3, 3]));
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, this.h - AXIS_H);
      ctx.moveTo(LEFT, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.hover.y <= main.top + main.h) {
        const v = hi - ((this.hover.y - main.top) / main.h) * (hi - lo);
        this.axisTag(this.hover.y, pct ? `${fmtNum(v, 2)}%` : fmtNum(v, opt.dec), '#e8e8e8', '#000', main);
      }
      const label = opt.intraday ? `${this.dateText(s.t[idx], true)} ${this.timeText(s.t[idx], true)}` : this.dateText(s.t[idx], true);
      ctx.font = T.font;
      const tw = ctx.measureText(label).width + 10;
      const tx = Math.min(Math.max(LEFT, x - tw / 2), plotRight - tw);
      ctx.fillStyle = '#e8e8e8';
      this.box(tx, this.h - AXIS_H + 1, tw, AXIS_H - 2);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.fillText(label, tx + 5, this.h - AXIS_H / 2);
    }
    this.drawLegend(hoverIndex, { hiI, loI, hiV, loV, avg, pct, i0, i1 });
    this.onHover?.(hoverIndex);
    this.onObservation?.({
      time: s.t[inspected], open: s.o[inspected], high: s.h[inspected], low: s.l[inspected],
      close: s.c[inspected], volume: s.v[inspected], from: s.t[i0], to: s.t[i1], hovered: hoverIndex != null,
    });
  }

  private marker(x: number, y: number, top: boolean, text: string) {
    const ctx = this.ctx;
    const T = CHART_THEME;
    ctx.fillStyle = top ? T.up : T.dn;
    ctx.beginPath();
    if (top) {
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x - 4, y - 9);
      ctx.lineTo(x + 4, y - 9);
    } else {
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x - 4, y + 9);
      ctx.lineTo(x + 4, y + 9);
    }
    ctx.closePath();
    ctx.fill();
    ctx.font = T.font;
    const tw = ctx.measureText(text).width;
    const right = LEFT + this.plotW();
    const tx = x + 6 + tw > right ? x - 6 - tw : x + 6;
    ctx.fillStyle = T.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tx, top ? y - 9 : y + 9);
  }

  private axisTag(y: number, text: string, bg: string, fg: string, pane: Pane, bold = false) {
    if (y < pane.top - 2 || y > pane.top + pane.h + 2) return;
    const ctx = this.ctx;
    const x = LEFT + this.plotW() + 1;
    ctx.fillStyle = bg;
    this.box(x, y - 8, AXIS_W - 2, 16);
    ctx.fillStyle = fg;
    ctx.font = bold ? CHART_THEME.fontB : CHART_THEME.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y + 0.5);
  }

  private timeText(t: number, full: boolean): string {
    if (this.opt?.timeLabel) return this.opt.timeLabel(t);
    const d = new Date(t);
    const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return full ? s : s;
  }

  private dateText(t: number, full: boolean): string {
    if (full && this.opt?.dateLabel) return this.opt.dateLabel(t);
    return fmtDay(t);
  }

  private drawTimeAxis(i0: number, i1: number, panes: Pane[]) {
    const ctx = this.ctx;
    const T = CHART_THEME;
    const s = this.s!;
    const opt = this.opt!;
    const span = s.t[i1] - s.t[i0];
    const ticks: { i: number; label: string; strong: boolean }[] = [];
    const maxTicks = Math.max(3, Math.floor(this.plotW() / 62));
    if (opt.intraday) {
      const choices = [5, 10, 15, 30, 60, 120, 180, 240, 360, 720].map((m) => m * 60_000);
      const stepMs = choices.find((c) => span / c <= maxTicks) ?? 1_440 * 60_000;
      let last = -1;
      for (let i = i0; i <= i1; i++) {
        const b = Math.floor(s.t[i] / stepMs);
        if (b !== last && last !== -1) {
          const d = new Date(s.t[i]);
          ticks.push({ i, label: this.timeText(s.t[i], false), strong: d.getHours() === 0 && d.getMinutes() === 0 });
        }
        last = b;
      }
    } else {
      const days = span / 86_400_000;
      type Unit = 'week' | 'month' | 'quarter' | 'year' | 'year2' | 'year5';
      const units: [Unit, number][] = [['week', 7], ['month', 30.4], ['quarter', 91], ['year', 365], ['year2', 730], ['year5', 1826]];
      const unit = (units.find(([, d]) => days / d <= maxTicks) ?? units[units.length - 1])[0];
      const key = (t: number) => {
        const d = new Date(t);
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        switch (unit) {
          case 'week':
            return Math.floor((t / 86_400_000 - 4) / 7);
          case 'month':
            return y * 12 + m;
          case 'quarter':
            return y * 4 + Math.floor(m / 3);
          case 'year':
            return y;
          case 'year2':
            return Math.floor(y / 2);
          default:
            return Math.floor(y / 5);
        }
      };
      let last = key(s.t[i0]);
      for (let i = i0 + 1; i <= i1; i++) {
        const k = key(s.t[i]);
        if (k === last) continue;
        last = k;
        const d = new Date(s.t[i]);
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        let label: string;
        if (unit === 'week') label = fmtMonthDayNum(m + 1, d.getUTCDate());
        else if (unit === 'month' || unit === 'quarter') label = m === 0 ? String(y) : `${MONTHS[m]}`;
        else label = String(y);
        ticks.push({ i, label, strong: m === 0 && unit !== 'week' });
      }
    }
    ctx.font = T.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let lastX = -Infinity;
    for (const tk of ticks) {
      const x = this.lx(this.xAt(tk.i) - this.plotW() / (this.v1 - this.v0) / 2);
      ctx.strokeStyle = tk.strong ? T.gridStrong : T.grid;
      ctx.setLineDash(tk.strong ? [] : this.dash([2, 3]));
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, this.h - AXIS_H);
      ctx.stroke();
      ctx.setLineDash([]);
      const tw = ctx.measureText(tk.label).width;
      if (x - tw / 2 > lastX + 6 && x + tw / 2 < LEFT + this.plotW()) {
        ctx.fillStyle = tk.strong ? T.amber : T.axisText;
        ctx.fillText(tk.label, x, this.h - AXIS_H / 2);
        lastX = x + tw / 2;
      }
    }
    void panes;
  }

  private drawLower(p: Pane, i0: number, i1: number, bw: number, inspected: number) {
    const ctx = this.ctx;
    const T = CHART_THEME;
    const s = this.s!;
    const right = LEFT + this.plotW();
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT, p.top, this.plotW(), p.h);
    ctx.clip();
    ctx.font = T.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const label = (txt: string, color = T.amber) => {
      ctx.fillStyle = color;
      ctx.fillText(txt, LEFT + 4, p.top + 9);
    };
    if (p.kind === 'VOL') {
      const vma = this.ind.vma;
      let max = 0;
      for (let i = i0; i <= i1; i++) max = Math.max(max, s.v[i], vma && Number.isFinite(vma[i]) ? vma[i] : 0);
      if (max <= 0) {
        ctx.restore();
        return;
      }
      const w = Math.max(1, Math.min(bw * 0.7, 18));
      for (let i = i0; i <= i1; i++) {
        const hgt = (s.v[i] / max) * (p.h - 14);
        if (!(hgt > 0)) continue;
        ctx.fillStyle = s.c[i] >= s.o[i] ? T.upFill : T.dnFill;
        this.box(this.xAt(i) - w / 2, p.top + p.h - hgt, w, hgt);
      }
      if (vma) {
        ctx.strokeStyle = T.text;
        ctx.lineWidth = this.hair();
        ctx.beginPath();
        let on = false;
        for (let i = i0; i <= i1; i++) {
          if (!Number.isFinite(vma[i])) {
            on = false;
            continue;
          }
          const y = p.top + p.h - (vma[i] / max) * (p.h - 14);
          if (on) ctx.lineTo(this.xAt(i), y);
          else ctx.moveTo(this.xAt(i), y);
          on = true;
        }
        ctx.stroke();
      }
      label(`Volume ${fmtBig(s.v[inspected])}${vma ? `  SMA(${this.opt!.volumeAverage}) ${Number.isFinite(vma[inspected]) ? fmtBig(vma[inspected]) : '--'}` : ''}`);
      ctx.restore();
      this.lowerAxis(p, [[0, '0'], [max, fmtBig(max)]], 0, max);
      return;
    }
    if (p.kind === 'RSI' && this.ind.rsi) {
      const r = this.ind.rsi;
      const y = (v: number) => p.top + 4 + ((100 - v) / 100) * (p.h - 8);
      ctx.strokeStyle = T.gridStrong;
      ctx.lineWidth = this.hair();
      ctx.setLineDash(this.dash([3, 3]));
      for (const lv of [30, 70]) {
        ctx.beginPath();
        ctx.moveTo(LEFT, this.ly(y(lv)));
        ctx.lineTo(right, this.ly(y(lv)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = '#d77bff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      for (let i = i0; i <= i1; i++) {
        if (!Number.isFinite(r[i])) continue;
        const x = this.xAt(i);
        if (!started) {
          ctx.moveTo(x, y(r[i]));
          started = true;
        } else ctx.lineTo(x, y(r[i]));
      }
      ctx.stroke();
      label(`RSI(14) ${fmtNum(r[inspected], 2)}`, '#d77bff');
      ctx.restore();
      this.lowerAxis(p, [[30, '30'], [70, '70']], 0, 100, true);
      return;
    }
    if (p.kind === 'MACD' && this.ind.macd) {
      const m = this.ind.macd;
      let ext = 0;
      for (let i = i0; i <= i1; i++) {
        for (const v of [m.macd[i], m.signal[i], m.hist[i]]) if (Number.isFinite(v)) ext = Math.max(ext, Math.abs(v));
      }
      if (ext === 0) ext = 1;
      const y = (v: number) => p.top + p.h / 2 - (v / ext) * (p.h / 2 - 6);
      const w = Math.max(1, Math.min(bw * 0.6, 14));
      for (let i = i0; i <= i1; i++) {
        const v = m.hist[i];
        if (!Number.isFinite(v)) continue;
        ctx.fillStyle = v >= 0 ? T.upFill : T.dnFill;
        const y0 = y(0);
        const y1 = y(v);
        if (y1 !== y0) this.box(this.xAt(i) - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0));
      }
      for (const [arr, col] of [[m.macd, '#45d3e6'], [m.signal, '#ff9e1b']] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        let started = false;
        for (let i = i0; i <= i1; i++) {
          if (!Number.isFinite(arr[i])) continue;
          const x = this.xAt(i);
          if (!started) {
            ctx.moveTo(x, y(arr[i]));
            started = true;
          } else ctx.lineTo(x, y(arr[i]));
        }
        ctx.stroke();
      }
      label(`MACD(12,26,9) ${fmtNum(m.macd[inspected], 3)}  Sig ${fmtNum(m.signal[inspected], 3)}`, '#45d3e6');
      ctx.restore();
      this.lowerAxis(p, [[0, '0']], -ext, ext);
      return;
    }
    ctx.restore();
  }

  private lowerAxis(p: Pane, ticks: [number, string][], lo: number, hi: number, inset = false) {
    const ctx = this.ctx;
    ctx.font = CHART_THEME.font;
    ctx.fillStyle = CHART_THEME.axisText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const [v, txt] of ticks) {
      const pad = inset ? 4 : 8;
      const y = p.top + pad + ((hi - v) / (hi - lo || 1)) * (p.h - pad * 2);
      ctx.fillText(txt, LEFT + this.plotW() + 6, Math.min(Math.max(y, p.top + 7), p.top + p.h - 7));
    }
  }

  private drawLegend(idx: number | null, a: { hiI: number; loI: number; hiV: number; loV: number; avg: number; pct: boolean; i0: number; i1: number }) {
    const ctx = this.ctx;
    const T = CHART_THEME;
    const s = this.s!;
    const opt = this.opt!;
    const color = opt.color ?? T.line;
    const rows: { k: string; v: string; c: string }[] = [];
    const dt = (t: number) => (opt.intraday ? this.timeText(t, true) : this.dateText(t, true));
    if (idx != null) {
      const prev = idx > 0 ? s.c[idx - 1] : s.o[idx];
      const chg = s.c[idx] - prev;
      rows.push({ k: dt(s.t[idx]), v: '', c: T.amber });
      rows.push({ k: 'O', v: fmtNum(s.o[idx], opt.dec), c: T.text });
      rows.push({ k: 'H', v: fmtNum(s.h[idx], opt.dec), c: T.text });
      rows.push({ k: 'L', v: fmtNum(s.l[idx], opt.dec), c: T.text });
      rows.push({ k: 'C', v: `${fmtNum(s.c[idx], opt.dec)} ${chg >= 0 ? '+' : ''}${fmtNum((chg / prev) * 100, 2)}%`, c: chg >= 0 ? T.up : T.dn });
      if (s.v[idx] > 0) rows.push({ k: 'Vol', v: fmtBig(s.v[idx]), c: T.text });
    } else {
      rows.push({ k: opt.label, v: fmtNum(s.c[a.i1], opt.dec), c: color });
      if (opt.annotate && !a.pct) {
        rows.push({ k: `High on ${dt(s.t[a.hiI])}`, v: fmtNum(a.hiV, opt.dec), c: T.up });
        rows.push({ k: 'Average', v: fmtNum(a.avg, opt.dec), c: T.amber });
        rows.push({ k: `Low on ${dt(s.t[a.loI])}`, v: fmtNum(a.loV, opt.dec), c: T.dn });
      }
    }
    const legendIdx = idx ?? a.i1;
    // A study is drawn on the security's own scale, so in percent mode its figure is its change from the same base.
    const studyText = (v: number) => (a.pct && idx == null ? (Number.isFinite(v) ? `${fmtNum((v / s.c[a.i0] - 1) * 100, 2)}%` : '--') : fmtNum(v, opt.dec));
    for (const ov of this.ind.overlays) {
      const v = ov.a[legendIdx];
      rows.push({ k: ov.o.kind === 'BOLL' ? `BOLL(${ov.o.n},2)` : `${ov.o.kind}(${ov.o.n})`, v: studyText(v), c: ov.o.color });
    }
    this.ind.cmp.forEach((arr, k) => {
      const b0 = firstFinite(arr, a.i0, a.i1);
      const v = arr[legendIdx];
      rows.push({ k: opt.compare[k].label, v: Number.isFinite(v) && Number.isFinite(b0) ? `${fmtNum((v / b0 - 1) * 100, 2)}%` : '--', c: opt.compare[k].color });
    });
    if (a.pct && idx == null) {
      const b0 = s.c[a.i0];
      rows[0] = { k: opt.label, v: `${fmtNum((s.c[legendIdx] / b0 - 1) * 100, 2)}%`, c: color };
    }
    ctx.font = T.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const lineH = 15;
    let maxW = 0;
    for (const r of rows) maxW = Math.max(maxW, ctx.measureText(`${r.k}  ${r.v}`).width);
    const boxW = maxW + 22;
    const boxH = rows.length * lineH + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    this.box(LEFT + 4, TOP + 2, boxW, boxH);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = this.hair();
    ctx.strokeRect(this.lx(LEFT + 4), this.ly(TOP + 2), crispEdge(boxW, this.sx), crispEdge(boxH, this.sy));
    rows.forEach((r, i) => {
      const y = TOP + 2 + 3 + lineH * i + lineH / 2;
      ctx.fillStyle = r.c;
      this.box(LEFT + 10, y - 1, 7, 2);
      ctx.fillStyle = r.k === opt.label || i === 0 ? T.text : T.axisText;
      ctx.fillText(r.k, LEFT + 21, y);
      ctx.fillStyle = r.c;
      ctx.textAlign = 'right';
      ctx.fillText(r.v, LEFT + 4 + boxW - 6, y);
      ctx.textAlign = 'left';
    });
  }
}

function firstFinite(arr: Float64Array, from: number, to: number): number {
  for (let i = from; i <= to; i++) if (Number.isFinite(arr[i])) return arr[i];
  return NaN;
}

function hexAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
