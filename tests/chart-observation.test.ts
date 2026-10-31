import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceChart, type ChartObservation, type ChartOptions } from '../src/components/chart/PriceChart';
import { makeSeries } from '../src/data/series';

describe('chart observation and visible-window labels', () => {
  let frames: FrameRequestCallback[];
  let listeners: Map<string, (event: PointerEvent) => void>;
  let fillText: ReturnType<typeof vi.fn>;
  let chart: PriceChart;
  let observation: ChartObservation | null;
  const series = makeSeries(30, 86_400_000);
  for (let i = 0; i < 30; i++) {
    series.t[i] = Date.UTC(2026, 0, i + 1);
    series.o[i] = 99 + i;
    series.h[i] = 102 + i;
    series.l[i] = 98 + i;
    series.c[i] = 100 + i;
    series.v[i] = (i + 1) * 1000;
  }
  series.length = 30;
  const options: ChartOptions = {
    type: 'line', dec: 2, label: 'Test Last Price', intraday: false,
    overlays: [{ kind: 'SMA', n: 3, color: '#45d3e6' }], lower: ['VOL'],
    compare: [], percent: false, annotate: false, initialBars: 12,
    dateLabel: (t) => `DAY:${t}`,
  };
  const flush = () => { const pending = frames.splice(0); pending.forEach((frame) => frame(0)); };
  const pointer = (type: string, x: number, y = 100) => listeners.get(type)?.({ clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' } as PointerEvent);
  const texts = () => fillText.mock.calls.map((args) => args[0]);

  beforeEach(() => {
    frames = [];
    listeners = new Map();
    observation = null;
    fillText = vi.fn();
    const context = new Proxy({ fillText, measureText: (text: string) => ({ width: text.length * 6 }) }, {
      get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn(),
    });
    const bounds = () => ({ left: 0, top: 0, width: 800, height: 400 });
    const canvas = {
      style: {}, getContext: () => context, getBoundingClientRect: bounds,
      addEventListener: (name: string, callback: (event: PointerEvent) => void) => listeners.set(name, callback),
      setPointerCapture: vi.fn(), remove: vi.fn(),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    chart = new PriceChart({ appendChild: vi.fn(), getBoundingClientRect: bounds } as unknown as HTMLElement);
    chart.onObservation = (next) => { observation = next; };
    chart.setData(series, options, true);
    flush();
  });

  afterEach(() => { chart.destroy(); vi.unstubAllGlobals(); });

  it('uses the final visible observation for price, study and volume labels after panning into history', () => {
    fillText.mockClear();
    pointer('pointerdown', 400);
    pointer('pointermove', 800);
    pointer('pointerup', 800);
    flush();
    expect(observation).toMatchObject({ time: series.t[23], close: 123, to: series.t[23], hovered: false });
    expect(texts()).toContain('123.00');
    expect(texts()).toContain('122.00'); // SMA(3), at the same visible observation.
    expect(texts()).toContain('Volume 24.00K');
    expect(texts()).not.toContain('129.00'); // Latest data is outside this window.
  });

  it('synchronizes the OHLC snapshot and lower-study value with the crosshair, then restores the visible endpoint', () => {
    fillText.mockClear();
    pointer('pointermove', 400);
    flush();
    expect(observation).toMatchObject({ time: series.t[25], open: 124, high: 127, low: 123, close: 125, volume: 26000, hovered: true });
    expect(texts()).toContain('Volume 26.00K');
    expect(texts()).toContain(`DAY:${series.t[25]}`);
    pointer('pointerleave', 800);
    flush();
    expect(observation).toMatchObject({ close: 129, hovered: false });
  });

  it('clears the readout when the source has no observations', () => {
    chart.setData(makeSeries(0, 86_400_000), options, true);
    flush();
    expect(observation).toBeNull();
  });

  it('gives a study its change from the base in percent mode, as its line is drawn, not its price', () => {
    chart.setData(series, { ...options, percent: true }, true);
    fillText.mockClear();
    flush();
    // The visible window starts at the close of 118 and ends at 129; SMA(3) ends at 128. Three decimals, as GP.
    expect(texts()).toContain('9.322');
    expect(texts()).toContain('8.475'); // (128 / 118 - 1) x 100
    expect(texts()).not.toContain('128.00');
    expect(texts()).toContain(`Normalized As Of DAY:${series.t[18]}`);
  });

  it('keeps measuring from the normalisation date when the view is panned, as GP normalises as of a fixed date', () => {
    chart.setData(series, { ...options, percent: true }, true);
    flush();
    pointer('pointerdown', 400);
    pointer('pointermove', 800);
    pointer('pointerup', 800);
    fillText.mockClear();
    flush();
    // The view now ends at the close of 123 and starts before 118; the lines still measure from 118.
    expect(observation).toMatchObject({ time: series.t[23] });
    expect(texts()).toContain('4.237'); // (123 / 118 - 1) x 100
    expect(texts()).toContain(`Normalized As Of DAY:${series.t[18]}`);
  });

  it("draws the volume average over the bars and gives it beside the day's volume", () => {
    chart.setData(series, { ...options, volumeAverage: 3 }, true);
    fillText.mockClear();
    flush();
    // The last three volumes are 28,000, 29,000 and 30,000.
    expect(texts()).toContain('Volume 30.00K  SMA(3) 29.00K');
  });
});
