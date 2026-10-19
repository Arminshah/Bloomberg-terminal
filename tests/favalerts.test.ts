import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketStory } from '../src/data/live/marketnews';
import type { FavAlert } from '../src/terminal/favalerts';

// Made-up stories; no request leaves the test. Each test loads the store afresh over its own stubbed storage.

const NOW = Date.parse('2026-10-19T14:00:00Z');
const MIN = 60_000;

function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), key: () => null, length: 0 });
  const host = new EventTarget();
  vi.stubGlobal('window', host);
  return { data, host };
}

async function fresh() {
  vi.resetModules();
  return import('../src/terminal/favalerts');
}

const alert = (n: number, over: Partial<FavAlert> = {}): FavAlert => ({
  id: `example.com/story-${n}`,
  title: `Synthetic story number ${n} about the company and its results`,
  url: `https://example.com/story-${n}`,
  publisher: 'Example Wire',
  time: NOW - n * MIN,
  tickers: ['NVDA'],
  sec: 'NVDA US Equity',
  at: NOW,
  ...over,
});

const story = (n: number, over: Partial<MarketStory> = {}): MarketStory => ({
  id: `example.com/s${n}`,
  title: `Story ${n}`,
  url: `https://example.com/s${n}`,
  publisher: 'Example Wire',
  feeds: ['Finnhub'],
  time: NOW - n * MIN,
  tickers: [],
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pop-ups about favourites', () => {
  it('adds each story once, newest on top, and leaves out one seen before by link or by title', async () => {
    storage();
    const f = await fresh();
    expect(f.addFavAlerts([alert(5), alert(1)]).map((a) => a.id)).toEqual(['example.com/story-1', 'example.com/story-5']);
    expect(f.favAlerts.get().open.map((a) => a.id)).toEqual(['example.com/story-1', 'example.com/story-5']);
    // The same link again, and the same story from a second source under another link.
    expect(f.addFavAlerts([alert(1), alert(5, { id: 'other.example/copy', url: 'https://other.example/copy' })])).toEqual([]);
    expect(f.addFavAlerts([alert(0)]).map((a) => a.id)).toEqual(['example.com/story-0']);
    expect(f.favAlerts.get().open[0].id).toBe('example.com/story-0');
  });

  it('closes one or all; a closed story does not pop up again', async () => {
    storage();
    const f = await fresh();
    f.addFavAlerts([alert(1), alert(2), alert(3)]);
    f.dismissFavAlert('example.com/story-2');
    expect(f.favAlerts.get().open.map((a) => a.id)).toEqual(['example.com/story-1', 'example.com/story-3']);
    expect(f.addFavAlerts([alert(2)])).toEqual([]);
    f.dismissAllFavAlerts();
    expect(f.favAlerts.get().open).toEqual([]);
    expect(f.addFavAlerts([alert(1), alert(3)])).toEqual([]);
  });

  it('keeps at most 50 open and remembers at most 600 keys, dropping the oldest', async () => {
    storage();
    const f = await fresh();
    f.addFavAlerts(Array.from({ length: 70 }, (_, i) => alert(i + 1)));
    const st = f.favAlerts.get();
    expect(st.open).toHaveLength(f.OPEN_CAP);
    expect(st.open[0].id).toBe('example.com/story-1');
    expect(st.open.at(-1)!.id).toBe('example.com/story-50');
    for (let round = 0; round < 6; round++) f.addFavAlerts(Array.from({ length: 70 }, (_, i) => alert(1000 + round * 100 + i)));
    expect(f.favAlerts.get().seen.length).toBe(f.SEEN_CAP);
    expect(f.favAlerts.get().open).toHaveLength(f.OPEN_CAP);
    // Every open pop-up is still remembered, so it cannot pop up twice.
    const seen = new Set(f.favAlerts.get().seen);
    expect(f.favAlerts.get().open.every((a) => seen.has(a.id))).toBe(true);
  });

  it('keeps the pop-ups not dismissed, and what popped up, across a restart', async () => {
    vi.useFakeTimers();
    const { data } = storage();
    const first = await fresh();
    first.addFavAlerts([alert(1), alert(2)]);
    first.dismissFavAlert('example.com/story-2');
    first.markWatched(NOW);
    vi.advanceTimersByTime(200);
    expect(JSON.parse(data.get('armin:fav-alerts')!).v).toBe(1);
    const again = await fresh();
    expect(again.favAlerts.get().open.map((a) => a.id)).toEqual(['example.com/story-1']);
    expect(again.addFavAlerts([alert(1), alert(2)])).toEqual([]);
    // Stories published while the app was closed pop up, back to an hour before it opened at most.
    expect(again.watchSince(NOW + 10 * MIN)).toBe(NOW);
    expect(again.watchSince(NOW + 3 * 60 * MIN)).toBe(NOW + 2 * 60 * MIN);
  });

  it('starts from now on a first run', async () => {
    storage();
    const f = await fresh();
    expect(f.watchSince(NOW)).toBe(NOW);
  });
});

describe('which stories pop up', () => {
  it('takes stories found for a favourite and market stories tagged with its ticker, published since the watch began', async () => {
    storage();
    const { favAlertsFrom } = await fresh();
    const nvda = { id: 'NVDA US Equity', ticker: 'NVDA US' };
    const brk = { id: 'BRK/B US Equity', ticker: 'BRK/B US' };
    const found = [
      { def: nvda, stories: [story(1), story(90)] },
      { def: brk, stories: [] },
    ];
    const market = [story(2, { tickers: ['BRK.B'] }), story(3, { tickers: ['AAPL'] }), story(1, { tickers: ['BRK-B'] }), story(4, { time: NOW + 10 * MIN, tickers: ['NVDA'] }), story(5, { url: 'javascript:alert(1)', tickers: ['NVDA'] })];
    const out = favAlertsFrom(found, market, NOW - 30 * MIN, NOW);
    expect(out.map((a) => [a.id, a.tickers, a.sec])).toEqual([
      // Found for NVDA and tagged BRK-B: about both.
      ['example.com/s1', ['NVDA', 'BRK/B'], 'NVDA US Equity'],
      ['example.com/s2', ['BRK/B'], 'BRK/B US Equity'],
    ]);
    expect(out[0]).toMatchObject({ title: 'Story 1', url: 'https://example.com/s1', publisher: 'Example Wire', time: NOW - MIN, at: NOW });
  });
});
