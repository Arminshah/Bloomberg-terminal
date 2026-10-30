import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  panels: [] as { history: { sec?: string }[]; idx: number }[],
  lists: [] as { ids: string[] }[],
  quotes: new Map<string, { src: string }>(),
  days: new Map<string, { length: number; t: number[] }>(),
  reads: [] as string[],
  terminal: new Set<() => void>(),
  watchlists: new Set<() => void>(),
  engine: new Set<(changed: Set<string>) => void>(),
  settleVolume: vi.fn(() => false),
  flush: vi.fn(),
}));
vi.mock('../src/data/market', () => ({ engine: {
  quote: (id: string) => { state.reads.push(id); return state.quotes.get(id); },
  daily: (id: string) => state.days.get(id) ?? { length: 0, t: [] },
  subscribe: (fn: (changed: Set<string>) => void) => { state.engine.add(fn); return () => state.engine.delete(fn); },
  settleVolume: state.settleVolume,
  flush: state.flush,
} }));
vi.mock('../src/terminal/state', () => ({ terminal: {
  get: () => ({ panels: state.panels }),
  subscribe: (fn: () => void) => { state.terminal.add(fn); return () => state.terminal.delete(fn); },
} }));
vi.mock('../src/terminal/userdata', () => ({ watchlists: {
  get: () => ({ lists: state.lists }),
  subscribe: (fn: () => void) => { state.watchlists.add(fn); return () => state.watchlists.delete(fn); },
} }));
vi.mock('../src/data/live/nasdaq-book', () => ({ nasdaqTicker: (id: string) => id.endsWith(' US Equity') ? id.split(' ')[0] : null }));
vi.mock('../src/data/live/earnings-calendar', () => ({ nasdaqNumber: (value: string) => Number(value.replace(/[$,]/g, '')) }));

// Scheduler examples only; no market-source fact is inferred from these inputs.
const NOW = Date.parse('2026-10-30T08:00:00Z');
const WMT = 'WMT US Equity';
const KO = 'KO US Equity';
const api = vi.fn(async () => ({ status: 200, text: '{"data":null}' }));
let start: typeof import('../src/data/live/settled-volume').startSettledVolumes;
let stop: (() => void) | undefined;
function ready(id: string, day = '2026-10-29') {
  state.quotes.set(id, { src: 'CLOSE' });
  state.days.set(id, { length: 1, t: [Date.parse(`${day}T00:00:00Z`)] });
}
function open(id: string) {
  state.panels = [{ history: [{ sec: id }], idx: 0 }];
  for (const fn of state.terminal) fn();
}
function changed(...ids: string[]) { for (const fn of state.engine) fn(new Set(ids)); }

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetModules();
  state.panels = []; state.lists = [];
  state.quotes.clear(); state.days.clear(); state.reads.length = 0;
  state.terminal.clear(); state.watchlists.clear(); state.engine.clear();
  state.settleVolume.mockClear(); state.flush.mockClear();
  api.mockReset().mockResolvedValue({ status: 200, text: '{"data":null}' });
  vi.stubGlobal('window', { arminDesktop: { nasdaq: api } });
  ({ startSettledVolumes: start } = await import('../src/data/live/settled-volume'));
});
afterEach(() => {
  stop?.(); stop = undefined;
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('settled-volume readiness', () => {
  it('requests a stock opened just after the minute poll before a twelve-second capture', async () => {
    stop = start();
    await vi.advanceTimersByTimeAsync(61_000);
    ready(WMT); open(WMT);
    expect(api).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(api).toHaveBeenCalledExactlyOnceWith('historical', 'WMT');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('checks when the first real history arrives and ignores unrelated or empty engine changes', async () => {
    open(KO); stop = start();
    await vi.advanceTimersByTimeAsync(100);
    expect(api).not.toHaveBeenCalled();
    ready(KO); changed(KO);
    await vi.advanceTimersByTimeAsync(100);
    expect(api).toHaveBeenCalledExactlyOnceWith('historical', 'KO');
    state.reads.length = 0;
    changed(); changed(WMT);
    await vi.advanceTimersByTimeAsync(100);
    expect(state.reads).toEqual([]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('coalesces panel, watchlist and history notifications without duplicate requests', async () => {
    ready(WMT); ready(KO); stop = start();
    open(WMT);
    state.lists = [{ ids: [WMT, KO] }];
    for (const fn of state.watchlists) fn();
    changed(WMT, KO); open(WMT);
    expect(state.reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(state.reads).toEqual([WMT, KO]);
    expect(api.mock.calls).toEqual([['historical', 'WMT'], ['historical', 'KO']]);
  });

  it('preserves thirty-minute spacing, four attempts per session and a new-session reset', async () => {
    const clocks: number[] = [];
    api.mockImplementation(async () => { clocks.push(Date.now()); return { status: 200, text: '{"data":null}' }; });
    ready(WMT); open(WMT); stop = start();
    await vi.advanceTimersByTimeAsync(100);
    for (let i = 0; i < 5; i++) {
      changed(WMT);
      await vi.advanceTimersByTimeAsync(31 * 60_000);
    }
    expect(api).toHaveBeenCalledTimes(4);
    expect(clocks.slice(1).every((clock, i) => clock - clocks[i] >= 30 * 60_000)).toBe(true);
    vi.setSystemTime(Date.parse('2026-10-31T08:00:00Z'));
    ready(WMT, '2026-10-30'); changed(WMT);
    await vi.advanceTimersByTimeAsync(100);
    expect(api).toHaveBeenCalledTimes(5);
  });

  it('does not request a session still trading, including after new history', async () => {
    vi.setSystemTime(Date.parse('2026-10-30T14:00:00Z'));
    ready(WMT, '2026-10-30'); open(WMT); stop = start();
    changed(WMT);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(api).not.toHaveBeenCalled();
  });

  it('cancels pending work and removes all subscriptions when stopped', async () => {
    ready(WMT); open(WMT); stop = start(); stop();
    expect([state.terminal.size, state.watchlists.size, state.engine.size]).toEqual([0, 0, 0]);
    open(KO); changed(WMT, KO);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(api).not.toHaveBeenCalled();
  });

  it('does not apply a response that completes after the service stops', async () => {
    let complete!: (value: { status: number; text: string }) => void;
    api.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    ready(WMT); open(WMT); stop = start();
    await vi.advanceTimersByTimeAsync(100);
    expect(api).toHaveBeenCalledTimes(1);
    stop();
    complete({ status: 200, text: JSON.stringify({ data: { tradesTable: { rows: [{ date: '10/29/2026', close: '$121.25', volume: '16,048,288' }] } } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.settleVolume).not.toHaveBeenCalled();
    expect(state.flush).not.toHaveBeenCalled();
  });
});
