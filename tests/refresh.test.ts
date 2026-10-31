import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRefresh, KEEP_MS, WINDOW_MS } from '../electron/refresh.cjs';
import { createRequester, type RequesterResponse, type RequestPace } from '../electron/requests.cjs';
import { canRefresh, createWants, keptOutcomes, mergeOutcomes, refreshAll, refreshState, refreshSummary, registerRefresh, type RefreshOutcome } from '../src/terminal/refresh';

// No request leaves these tests: the transport, the clock and the desktop bridge are stubs.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  refreshState.set({ running: false, last: null });
});

describe('the refresh registry', () => {
  it('runs every available refresher at once, after marking the main process, and reports each source', async () => {
    const order: string[] = [];
    vi.stubGlobal('window', { arminDesktop: { refresh: vi.fn(async () => { order.push('main'); return { at: 1, windowMs: WINDOW_MS, keepMs: KEEP_MS, kept: ['marketaux', 'fmp', 'tipranks'] }; }) } });
    const offs = [
      registerRefresh({ source: 'Quotes', run: async () => { order.push('quotes'); return { source: 'Quotes', state: 'asked', detail: '3 of 3 symbols answered' }; } }),
      registerRefresh({ source: 'News', run: () => { order.push('news'); } }),
      registerRefresh({ source: 'Off here', available: () => false, run: () => { order.push('off'); } }),
      registerRefresh({ source: 'Nothing open', run: async () => [] }),
      registerRefresh({ source: 'Broken', run: async () => { throw new Error('HTTP 503'); } }),
    ];
    try {
      const report = await refreshAll();
      expect(order).toEqual(['main', 'quotes', 'news']);
      expect(report?.outcomes).toEqual([
        { source: 'Marketaux, Financial Modeling Prep', state: 'skipped', detail: 'answers younger than an hour kept (daily allowance)' },
        { source: 'TipRanks', state: 'skipped', detail: 'asked only when you ask on ANALYSTS (monthly allowance)' },
        { source: 'Quotes', state: 'asked', detail: '3 of 3 symbols answered' },
        { source: 'News', state: 'asked' },
        { source: 'Broken', state: 'failed', detail: 'HTTP 503' },
      ]);
      expect(refreshState.get()).toMatchObject({ running: false, last: report });
      const text = refreshSummary(report);
      expect(text).toMatch(/^Refreshed at \d\d:\d\d:\d\d, in 1 s\./);
      expect(text).toContain('Asked again:\n  Quotes: 3 of 3 symbols answered\n  News');
      expect(text).toContain('Failed:\n  Broken: HTTP 503');
      expect(text).toContain('Not asked again:\n  Marketaux, Financial Modeling Prep: answers younger than an hour kept (daily allowance)');
    } finally {
      offs.forEach((off) => off());
    }
  });

  it('does nothing when clicked again while a refresh runs', async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((done) => { finish = done; }));
    const off = registerRefresh({ source: 'Slow', run });
    try {
      const first = refreshAll();
      await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
      expect(refreshState.get().running).toBe(true);
      expect(await refreshAll()).toBeNull();
      expect(run).toHaveBeenCalledTimes(1);
      finish();
      expect((await first)?.outcomes).toEqual([{ source: 'Slow', state: 'asked' }]);
      expect(refreshState.get().running).toBe(false);
    } finally {
      off();
    }
  });

  it('reports a source that has not answered in time as still loading, without waiting for it', async () => {
    vi.useFakeTimers();
    const off = registerRefresh({ source: 'Stuck', run: () => new Promise(() => undefined) });
    try {
      const pending = refreshAll({ timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      const report = await pending;
      expect(report?.outcomes).toEqual([{ source: 'Stuck', state: 'waiting', detail: 'no answer within 1 s; it shows when it arrives' }]);
      expect(refreshSummary(report)).toContain('Still loading:\n  Stuck');
    } finally {
      off();
    }
  });

  it('shows the button only where something can be refreshed', () => {
    const off = registerRefresh({ source: 'Desktop only', available: () => false, run: () => undefined });
    expect(canRefresh()).toBe(false);
    const on = registerRefresh({ source: 'Here', run: () => undefined });
    expect(canRefresh()).toBe(true);
    on();
    off();
    expect(canRefresh()).toBe(false);
  });

  it('keeps one line per source, with its worst state and every detail', () => {
    const list: RefreshOutcome[] = [
      { source: 'SEC EDGAR', state: 'asked' },
      { source: 'SEC EDGAR', state: 'failed', detail: 'HTTP 403' },
      { source: 'SEC EDGAR', state: 'asked', detail: 'HTTP 403' },
      { source: 'News', state: 'skipped', detail: 'off' },
    ];
    expect(mergeOutcomes(list)).toEqual([{ source: 'SEC EDGAR', state: 'failed', detail: 'HTTP 403' }, { source: 'News', state: 'skipped', detail: 'off' }]);
    expect(keptOutcomes({ keepMs: KEEP_MS, kept: [] })).toEqual([]);
  });

  it('counts what mounted screens want until each lets go', () => {
    const wants = createWants<string>();
    const a = wants.add('AAPL', 'AAPL');
    const b = wants.add('AAPL', 'AAPL');
    const c = wants.add('MSFT', 'MSFT');
    expect(wants.values()).toEqual(['AAPL', 'MSFT']);
    a();
    a();
    expect(wants.values()).toEqual(['AAPL', 'MSFT']);
    b();
    c();
    expect(wants.size).toBe(0);
  });
});

describe('a refresh in the main process', () => {
  const START = Date.parse('2026-10-19T12:00:00Z');

  it('expires answers kept from before the click for two minutes, and keeps young answers of sources with an allowance', () => {
    let time = START;
    const r = createRefresh({ capped: (p) => p === 'marketaux', now: () => time });
    expect(r.expired('finnhub', START - 1000)).toBe(false);
    r.mark();
    expect(r.at()).toBe(START);
    expect(r.expired('finnhub', START - 1000)).toBe(true);
    // An answer that arrived after the click is current.
    expect(r.expired('finnhub', START)).toBe(false);
    // A daily allowance keeps answers younger than an hour, and only those.
    expect(r.expired('marketaux', START - KEEP_MS + 1)).toBe(false);
    expect(r.expired('marketaux', START - KEEP_MS)).toBe(true);
    time += WINDOW_MS + 1;
    expect(r.expired('finnhub', START - 1000)).toBe(false);
  });

  function harness(capped: (provider: string) => boolean) {
    let time = START;
    const providers = {
      providerMessage: vi.fn((text: string) => text),
      providerPayloadProblem: vi.fn(() => null),
      withinDailyCap: vi.fn((_provider: string) => true),
      slot: vi.fn(async (_provider: string, _max: number, _windowMs: number) => undefined),
      recordRequest: vi.fn(() => time),
      recordResult: vi.fn(),
      recordProblem: vi.fn(),
      errorKind: vi.fn(() => 'provider-error'),
    };
    const response = (text: string): RequesterResponse => ({ status: 200, ok: true, headers: new Headers(), text: async () => text });
    let n = 0;
    const fetch = vi.fn(async () => response(`{"n":${++n}}`));
    const refresh = createRefresh({ capped, now: () => time });
    const request = createRequester({ providers, fetch, agent: () => 'TestTerminal/1', now: () => time, sleep: async () => undefined, random: () => 0, refresh });
    const ask = (provider: string, ttl: number, pace: RequestPace = [30, 60_000]) => request(provider, `https://data.example.test/${provider}`, {}, ttl, pace, []);
    return { providers, fetch, refresh, ask, advance: (ms: number) => { time += ms; } };
  }

  it('asks a source again after a refresh instead of answering from its kept copy, through the same pacing', async () => {
    const h = harness(() => false);
    expect(await h.ask('finnhub', 6 * 3_600_000)).toMatchObject({ text: '{"n":1}' });
    h.advance(5_000);
    expect(await h.ask('finnhub', 6 * 3_600_000)).toMatchObject({ text: '{"n":1}', cached: true });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.refresh.mark();
    expect(await h.ask('finnhub', 6 * 3_600_000)).toMatchObject({ text: '{"n":2}' });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.providers.slot).toHaveBeenLastCalledWith('finnhub', 30, 60_000);
    // The new answer is kept as usual: the refresh does not ask twice.
    expect(await h.ask('finnhub', 6 * 3_600_000)).toMatchObject({ text: '{"n":2}', cached: true });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps answers younger than an hour from sources with a daily allowance, and never passes a daily cap', async () => {
    const h = harness((p) => p === 'fmp' || p === 'marketaux');
    await h.ask('fmp', 6 * 3_600_000);
    await h.ask('marketaux', 6 * 3_600_000);
    h.advance(30 * 60_000);
    h.refresh.mark();
    expect(await h.ask('fmp', 6 * 3_600_000)).toMatchObject({ cached: true });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    // An hour old: asked again, within the app's daily cap.
    h.advance(30 * 60_000);
    h.refresh.mark();
    expect(await h.ask('fmp', 6 * 3_600_000)).toMatchObject({ text: '{"n":3}' });
    expect(h.providers.withinDailyCap).toHaveBeenCalledWith('fmp');
    // With the day's cap reached the kept answer comes back marked stale; nothing is sent.
    h.providers.withinDailyCap.mockReturnValue(false);
    const capped = await h.ask('marketaux', 6 * 3_600_000);
    expect(capped).toMatchObject({ budget: true, stale: true, text: '{"n":2}' });
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });

  it('answers from kept copies again once the refresh is two minutes old', async () => {
    const h = harness(() => false);
    await h.ask('alpaca-news', 10 * 60_000);
    h.advance(1000);
    h.refresh.mark();
    h.advance(WINDOW_MS + 1);
    expect(await h.ask('alpaca-news', 10 * 60_000)).toMatchObject({ cached: true });
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('a refresh of the news', () => {
  it('asks every request a screen or the background is using again now, whatever its interval', async () => {
    const answers: Record<string, { status: number; text: string; error?: string }> = {};
    const news = vi.fn(async (source: string, arg = '') => answers[`${source}:${arg}`] ?? { status: 200, text: '[]', at: Date.now() });
    vi.stubGlobal('window', { arminDesktop: { news } });
    vi.resetModules();
    const m = await import('../src/data/live/marketnews');
    await m.loadNews('finnhub-market', '', 2 * 60_000);
    await m.loadNews('finnhub-company', 'AAPL|2026-10-12|2026-10-19', 15 * 60_000);
    await m.loadNews('finnhub-market', '', 2 * 60_000);
    expect(news).toHaveBeenCalledTimes(2);
    answers['finnhub-company:AAPL|2026-10-12|2026-10-19'] = { status: 503, text: '', error: 'HTTP 503' };
    expect(await m.refreshNews()).toEqual([
      { source: 'Market and breaking news', state: 'asked', detail: '1 asked' },
      { source: 'Company news', state: 'failed', detail: '1 asked; 1 did not answer (Finnhub)' },
    ]);
    expect(news).toHaveBeenCalledTimes(4);
    // A request no screen has asked for in six minutes belongs to a closed screen: it is left alone.
    expect(await m.refreshNews(Date.now() + 7 * 60_000)).toEqual([]);
    expect(news).toHaveBeenCalledTimes(4);
  });
});
