import { afterEach, describe, expect, it, vi } from 'vitest';
import { backingSize, crispDash, crispEdge, crispLine, crispWidth, watchPixelRatio } from '../src/components/chart/pixels';
import { PriceChart, type ChartOptions } from '../src/components/chart/PriceChart';
import { makeSeries } from '../src/data/series';

const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

describe('device-pixel geometry for canvas charts', () => {
  it('sizes the backing store from the exact element size at the real ratio, or from the device box', () => {
    expect(backingSize(801.6, 400.4, 1.25)).toEqual({ width: 1002, height: 501 });
    expect(backingSize(800, 400, 2.5)).toEqual({ width: 2000, height: 1000 });
    expect(backingSize(801.6, 400.4, 1.25, { width: 1003, height: 500 })).toEqual({ width: 1003, height: 500 });
  });

  it('puts a hairline on whole device pixels at 100%, 125%, 150%, 200% and 250%', () => {
    for (const scale of [1, 1.25, 1.5, 2, 2.5]) {
      const width = crispWidth(scale);
      expect(isWhole(width * scale)).toBe(true);
      expect(width * scale).toBeGreaterThanOrEqual(1);
      for (const v of [0, 10.2, 10.5, 99.9, 333.33]) {
        const c = crispLine(v, scale);
        const half = (width * scale) / 2;
        // Both edges of the line fall on device-pixel boundaries, within half a device pixel of where it was asked for.
        expect(isWhole(c * scale - half)).toBe(true);
        expect(isWhole(c * scale + half)).toBe(true);
        expect(Math.abs(c - v) * scale).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('rounds edges and dashes to device pixels', () => {
    expect(crispEdge(10.3, 1.25) * 1.25).toBe(13);
    expect(crispDash([2, 3], 1.25).map((d) => d * 1.25)).toEqual([3, 4]);
    expect(crispDash([2, 3], 1.5).map((d) => d * 1.5)).toEqual([3, 5]);
  });

  it('redraws when the ratio changes and listens again at the new ratio', () => {
    const queries: { media: string; listeners: (() => void)[] }[] = [];
    const win = {
      devicePixelRatio: 1.25,
      matchMedia: (media: string) => {
        const q = { media, listeners: [] as (() => void)[] };
        queries.push(q);
        return { addEventListener: (_: string, f: () => void) => q.listeners.push(f), removeEventListener: (_: string, f: () => void) => q.listeners.splice(q.listeners.indexOf(f), 1) };
      },
    };
    vi.stubGlobal('window', win);
    const changed = vi.fn();
    const stop = watchPixelRatio(changed);
    expect(queries[0].media).toBe('(resolution: 1.25dppx)');
    win.devicePixelRatio = 1.5;
    queries[0].listeners[0]();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(queries[0].listeners).toHaveLength(0);
    expect(queries[1].media).toBe('(resolution: 1.5dppx)');
    stop();
    expect(queries[1].listeners).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('PriceChart at 125% display scaling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws at the real ratio, opaque, with straight lines and bars on whole device pixels', () => {
    const series = makeSeries(60, 86_400_000);
    for (let i = 0; i < 60; i++) {
      series.t[i] = Date.UTC(2026, 0, i + 1);
      series.o[i] = 100 + Math.sin(i) * 3;
      series.c[i] = 100 + Math.cos(i) * 3;
      series.h[i] = Math.max(series.o[i], series.c[i]) + 1;
      series.l[i] = Math.min(series.o[i], series.c[i]) - 1;
      series.v[i] = 1000 + i * 37;
    }
    series.length = 60;
    const options: ChartOptions = {
      type: 'candle', dec: 2, label: 'Test', intraday: false, overlays: [], lower: ['VOL'],
      compare: [], percent: false, annotate: true, initialBars: 40,
    };
    // Records the calls a straight line or a filled rectangle is drawn with.
    const strokes: { width: number; pts: [number, number][] }[] = [];
    const rects: number[][] = [];
    let pts: [number, number][] = [];
    let transform: number[] = [];
    let attributes: unknown;
    const state = { lineWidth: 1 };
    const context = new Proxy(state as Record<string, unknown>, {
      get: (target, key) => {
        if (key === 'beginPath') return () => { pts = []; };
        if (key === 'moveTo' || key === 'lineTo') return (x: number, y: number) => pts.push([x, y]);
        if (key === 'stroke') return () => strokes.push({ width: state.lineWidth, pts: [...pts] });
        if (key === 'fillRect') return (...a: number[]) => rects.push(a);
        if (key === 'setTransform') return (...a: number[]) => { transform = a; };
        if (key === 'measureText') return (t: string) => ({ width: t.length * 6 });
        if (key in target) return target[key as string];
        return () => undefined;
      },
      set: (target, key, value) => { target[key as string] = value; return true; },
    });
    const bounds = () => ({ left: 0, top: 0, width: 800, height: 400 });
    const canvas = {
      style: {}, width: 0, height: 0, getBoundingClientRect: bounds, addEventListener: () => undefined, remove: () => undefined,
      getContext: (_: string, attrs: unknown) => { attributes = attrs; return context; },
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('window', { devicePixelRatio: 1.25 });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const chart = new PriceChart({ appendChild: () => undefined, getBoundingClientRect: bounds } as unknown as HTMLElement);
    chart.setData(series, options, true);
    frames.splice(0).forEach((f) => f(0));

    expect(attributes).toEqual({ alpha: false });
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(500);
    expect(transform).toEqual([1.25, 0, 0, 1.25, 0, 0]);

    const straight = strokes.filter((s) => s.pts.length === 2 && (s.pts[0][0] === s.pts[1][0] || s.pts[0][1] === s.pts[1][1]));
    expect(straight.length).toBeGreaterThan(10);
    for (const s of straight) {
      expect(isWhole(s.width * 1.25)).toBe(true);
      const [[x0, y0], [x1, y1]] = s.pts;
      const half = (s.width * 1.25) / 2;
      // A vertical line's x, or a horizontal line's y, has both edges on device-pixel boundaries.
      if (x0 === x1) expect(isWhole(x0 * 1.25 - half)).toBe(true);
      if (y0 === y1) expect(isWhole(y0 * 1.25 - half)).toBe(true);
    }
    // Candle bodies, volume bars and tags: every edge on a device pixel (the first rectangle is the background).
    expect(rects.length).toBeGreaterThan(40);
    for (const [x, y, w, h] of rects.slice(1)) {
      for (const v of [x, y, x + w, y + h]) expect(isWhole(v * 1.25)).toBe(true);
    }
    chart.destroy();
  });
});
