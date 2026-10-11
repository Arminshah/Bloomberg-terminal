import { engine } from '../market';
import { dayNum, DAY_MS } from '../calendar';
import { addRealStories, type Story } from '../news';
import { settings } from '../../terminal/settings';
import { setFeed } from './status';
import { CURRENCIES } from '../universe/markets';

const COINBASE_REST = 'https://api.exchange.coinbase.com';
const COINBASE_WS = 'wss://ws-feed.exchange.coinbase.com';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const FINNHUB = 'https://finnhub.io/api/v1';
const FINNHUB_WS = 'wss://ws.finnhub.io';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function isBlocked(err: unknown): boolean {
  // Network/CSP failures surface as TypeError from fetch.
  return err instanceof TypeError;
}

// ------------------------------------------------------------------ crypto

type Candle = [number, number, number, number, number, number]; // time, low, high, open, close, volume

class CryptoFeed {
  private ctrl = new AbortController();
  private ws: WebSocket | null = null;
  private pending = new Map<string, { px: number; size: number; t: number }>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private retry = 0;
  private stopped = false;
  private products = new Map<string, string>(); // coinbase product -> security id

  async start() {
    for (const d of engine.securities) if (d.cls === 'crypto' && d.cry) this.products.set(d.cry.coinbase, d.id);
    setFeed('crypto', 'connecting', 'Loading Coinbase history');
    try {
      const today = engine.today;
      let loaded = 0;
      for (const [product, id] of this.products) {
        const daily = await getJson<Candle[]>(`${COINBASE_REST}/products/${product}/candles?granularity=86400`, this.ctrl.signal);
        const bars = daily
          .map((c) => ({ day: dayNum(c[0] * 1000), o: c[3], h: c[2], l: c[1], c: c[4], v: c[5] }))
          .filter((b) => b.day < today)
          .sort((a, b) => a.day - b.day);
        if (bars.length) engine.setDailyBars(id, bars);
        const todayBar = daily.find((c) => dayNum(c[0] * 1000) === today);
        const prev = bars[bars.length - 1];
        const intra = await getJson<Candle[]>(`${COINBASE_REST}/products/${product}/candles?granularity=300`, this.ctrl.signal);
        const start = today * DAY_MS;
        const ib = intra
          .filter((c) => c[0] * 1000 >= start)
          .sort((a, b) => a[0] - b[0])
          .map((c) => ({ t: c[0] * 1000, o: c[3], h: c[2], l: c[1], c: c[4], v: c[5] }));
        if (ib.length) engine.setIntradayBars(id, ib, 300_000);
        const last = ib.length ? ib[ib.length - 1].c : todayBar?.[4];
        if (last) {
          engine.applyLive(id, {
            last,
            prevClose: prev?.c,
            open: todayBar?.[3] ?? ib[0]?.o,
            high: todayBar?.[2],
            low: todayBar?.[1],
            volume: todayBar?.[5],
          });
        }
        loaded++;
        await sleep(120);
      }
      engine.flush(this.products.values());
      setFeed('crypto', 'live', `Coinbase · ${loaded} assets streaming`);
      this.connect();
    } catch (err) {
      if (this.stopped) return;
      setFeed('crypto', isBlocked(err) ? 'blocked' : 'error', isBlocked(err) ? 'Network blocked here; using simulator' : String(err));
      for (const id of this.products.values()) engine.unlive(id);
    }
  }

  private connect() {
    if (this.stopped) return;
    try {
      this.ws = new WebSocket(COINBASE_WS);
    } catch {
      setFeed('crypto', 'blocked', 'WebSocket blocked; prices from last snapshot');
      return;
    }
    this.ws.onopen = () => {
      this.retry = 0;
      this.ws?.send(JSON.stringify({ type: 'subscribe', product_ids: [...this.products.keys()], channels: ['ticker'] }));
    };
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as { type: string; product_id: string; price: string; last_size?: string; time?: string };
        if (m.type !== 'ticker') return;
        const id = this.products.get(m.product_id);
        if (!id) return;
        const prev = this.pending.get(id);
        this.pending.set(id, { px: Number(m.price), size: (prev?.size ?? 0) + Number(m.last_size ?? 0), t: m.time ? Date.parse(m.time) : Date.now() });
      } catch {
        /* ignore malformed frames */
      }
    };
    let opened = false;
    this.ws.addEventListener('open', () => (opened = true));
    this.ws.onclose = () => {
      if (this.stopped) return;
      this.retry++;
      if (!opened && this.retry >= 2) {
        // Streaming is unavailable (proxy or firewall): poll the REST ticker instead.
        this.poll();
        return;
      }
      setFeed('crypto', 'connecting', `Reconnecting (attempt ${this.retry})`);
      setTimeout(() => this.connect(), Math.min(30_000, 1000 * 2 ** this.retry));
    };
    this.ws.onerror = () => this.ws?.close();
    this.flushTimer ??= setInterval(() => this.flush(), 500);
  }

  private polling = false;

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    setFeed('crypto', 'live', `Coinbase · polling ${this.products.size} assets`);
    while (!this.stopped) {
      for (const [product, id] of this.products) {
        if (this.stopped) return;
        try {
          const t = await getJson<{ price: string; size: string; time: string }>(`${COINBASE_REST}/products/${product}/ticker`, this.ctrl.signal);
          const prev = this.pending.get(id);
          this.pending.set(id, { px: Number(t.price), size: (prev?.size ?? 0) + Number(t.size || 0), t: Date.parse(t.time) || Date.now() });
        } catch {
          /* skip this round */
        }
        await sleep(250);
      }
      await sleep(1500);
    }
  }

  private flush() {
    if (!this.pending.size) return;
    const ids: string[] = [];
    for (const [id, u] of this.pending) {
      engine.applyLive(id, { last: u.px, size: u.size, time: u.t });
      ids.push(id);
    }
    this.pending.clear();
    engine.flush(ids);
    if (!this.polling) setFeed('crypto', 'live', `Coinbase · ${this.products.size} assets streaming`);
  }

  stop() {
    this.stopped = true;
    this.ctrl.abort();
    this.ws?.close();
    if (this.flushTimer) clearInterval(this.flushTimer);
    for (const id of this.products.values()) engine.unlive(id);
    setFeed('crypto', 'off');
  }
}

// ---------------------------------------------------------------------- FX

async function loadFx(signal: AbortSignal) {
  setFeed('fx', 'connecting', 'Loading ECB reference rates');
  try {
    const from = new Date(Date.now() - 3 * 365 * DAY_MS).toISOString().slice(0, 10);
    const res = await getJson<{ rates: Record<string, Record<string, number>>; end_date?: string }>(`${FRANKFURTER}/${from}..?base=USD`, signal);
    const dates = Object.keys(res.rates).sort();
    let n = 0;
    for (const c of CURRENCIES) {
      const code = c.code === 'CNH' ? 'CNY' : c.code;
      const pts: [number, number][] = [];
      for (const d of dates) {
        const v = res.rates[d][code];
        if (v) pts.push([dayNum(Date.parse(`${d}T00:00:00Z`)), 1 / v]);
      }
      // Only fixings before today; today's session stays simulated around the latest fix.
      const hist = pts.filter(([day]) => day < engine.today);
      if (hist.length) {
        engine.setDailyAnchors(`CCY:${c.code}`, hist);
        engine.rebaseSimulated(`CCY:${c.code}`);
        n++;
      }
    }
    engine.flush([]);
    setFeed('fx', 'live', `ECB fixings to ${dates[dates.length - 1]} · ${n} currencies`);
  } catch (err) {
    if (signal.aborted) return;
    setFeed('fx', isBlocked(err) ? 'blocked' : 'error', isBlocked(err) ? 'Network blocked here; using simulator' : String(err));
  }
}

// ---------------------------------------------------------------- Finnhub

const FINNHUB_SYMBOL: Record<string, string> = { 'BRK/B US Equity': 'BRK.B' };

class FinnhubFeed {
  private ctrl = new AbortController();
  private ws: WebSocket | null = null;
  private stopped = false;
  private symbols = new Map<string, string>(); // finnhub symbol -> id
  private pending = new Map<string, { px: number; size: number; t: number }>();
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(readonly key: string) {}

  async start() {
    for (const d of engine.securities) {
      if (d.cls !== 'equity' || d.country !== 'US') continue;
      this.symbols.set(d.dynamic?.source === 'finnhub' ? d.dynamic.symbol : (FINNHUB_SYMBOL[d.id] ?? d.ticker.split(' ')[0].replace('/', '.')), d.id);
    }
    setFeed('equities', 'connecting', 'Requesting quotes');
    setFeed('news', 'connecting', 'Requesting headlines');
    void this.loadNews();
    this.timers.push(setInterval(() => void this.loadNews(), 5 * 60_000));
    let ok = 0;
    try {
      for (const [sym, id] of this.symbols) {
        if (this.stopped) return;
        const q = await getJson<{ c: number; h: number; l: number; o: number; pc: number; t: number }>(`${FINNHUB}/quote?symbol=${encodeURIComponent(sym)}&token=${this.key}`, this.ctrl.signal);
        if (q.c > 0) {
          engine.applyLive(id, { last: q.c, prevClose: q.pc, open: q.o, high: q.h, low: q.l, time: q.t * 1000 });
          engine.flush([id]);
          ok++;
          setFeed('equities', 'live', `Finnhub · ${ok}/${this.symbols.size} quotes`);
        }
        await sleep(1100);
      }
      this.connect();
    } catch (err) {
      if (this.stopped) return;
      const blocked = isBlocked(err);
      setFeed('equities', blocked ? 'blocked' : 'error', blocked ? 'Network blocked here; using simulator' : `Finnhub: ${String(err)}`);
    }
  }

  /** Adds a security found at runtime: one quote now, then streaming trades. */
  async track(sym: string, id: string) {
    if (this.stopped || [...this.symbols.values()].includes(id)) return;
    this.symbols.set(sym, id);
    try {
      const q = await getJson<{ c: number; h: number; l: number; o: number; pc: number; t: number }>(`${FINNHUB}/quote?symbol=${encodeURIComponent(sym)}&token=${this.key}`, this.ctrl.signal);
      if (q.c > 0) {
        engine.applyLive(id, { last: q.c, prevClose: q.pc, open: q.o, high: q.h, low: q.l, time: q.t * 1000 });
        engine.flush([id]);
      }
    } catch {
      /* streaming may still deliver trades */
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
  }

  private connect() {
    if (this.stopped) return;
    try {
      this.ws = new WebSocket(`${FINNHUB_WS}?token=${this.key}`);
    } catch {
      return;
    }
    this.ws.onopen = () => {
      for (const sym of [...this.symbols.keys()].slice(0, 50)) this.ws?.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
    };
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as { type: string; data?: { p: number; s: string; t: number; v: number }[] };
        if (m.type !== 'trade' || !m.data) return;
        for (const tr of m.data) {
          const id = this.symbols.get(tr.s);
          if (!id) continue;
          const prev = this.pending.get(id);
          this.pending.set(id, { px: tr.p, size: (prev?.size ?? 0) + tr.v, t: tr.t });
        }
      } catch {
        /* ignore */
      }
    };
    this.ws.onclose = () => {
      if (!this.stopped) setTimeout(() => this.connect(), 15_000);
    };
    this.timers.push(
      setInterval(() => {
        if (!this.pending.size) return;
        const ids: string[] = [];
        for (const [id, u] of this.pending) {
          engine.applyLive(id, { last: u.px, size: u.size, time: u.t });
          ids.push(id);
        }
        this.pending.clear();
        engine.flush(ids);
      }, 500),
    );
  }

  private async loadNews() {
    try {
      const items = await getJson<{ id: number; datetime: number; headline: string; summary: string; source: string; url: string; related: string; category: string }[]>(
        `${FINNHUB}/news?category=general&token=${this.key}`,
        this.ctrl.signal,
      );
      addRealStories(items.slice(0, 80).map((n) => toStory(n, this.symbols)));
      setFeed('news', 'live', `Finnhub · ${items.length} headlines`);
    } catch (err) {
      if (!this.stopped) setFeed('news', isBlocked(err) ? 'blocked' : 'error', String(err));
    }
  }

  async companyNews(id: string) {
    const sym = [...this.symbols.entries()].find(([, v]) => v === id)?.[0];
    if (!sym) return;
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
    try {
      const items = await getJson<{ id: number; datetime: number; headline: string; summary: string; source: string; url: string; related: string; category: string }[]>(
        `${FINNHUB}/company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${this.key}`,
        this.ctrl.signal,
      );
      addRealStories(items.slice(0, 40).map((n) => ({ ...toStory(n, this.symbols), tickers: [id] })));
    } catch {
      /* company news is best-effort */
    }
  }

  stop() {
    this.stopped = true;
    this.ctrl.abort();
    this.ws?.close();
    this.timers.forEach(clearInterval);
    for (const id of this.symbols.values()) engine.unlive(id);
    setFeed('equities', 'off');
    setFeed('news', 'off');
  }
}

function toStory(n: { id: number; datetime: number; headline: string; summary: string; source: string; url: string; related: string; category: string }, symbols: Map<string, string>): Story {
  const tickers = (n.related || '')
    .split(',')
    .map((s) => symbols.get(s.trim()))
    .filter((x): x is string => !!x);
  const topics = ['TOP'];
  const cat = (n.category || '').toLowerCase();
  if (cat.includes('crypto')) topics.push('CRYPTO');
  if (cat.includes('forex')) topics.push('FX');
  if (cat.includes('merger') || cat === 'company') topics.push('STK');
  return {
    id: `fh:${n.id}`,
    time: n.datetime * 1000,
    headline: n.headline,
    body: [n.summary || 'Full story at the source.'],
    tickers,
    topics,
    source: (n.source || 'NEWS').toUpperCase(),
    url: n.url,
    real: true,
  };
}

// ------------------------------------------------------------- lifecycle

let crypto: CryptoFeed | null = null;
let finnhub: FinnhubFeed | null = null;
let fxCtrl: AbortController | null = null;

/** Streams a security that was looked up after the Finnhub feed started. */
export function trackFinnhubSymbol(sym: string, id: string) {
  void finnhub?.track(sym, id);
}

export function requestCompanyNews(id: string) {
  void finnhub?.companyNews(id);
}

function reconcile() {
  const s = settings.get();
  if (s.liveCrypto && !crypto) {
    crypto = new CryptoFeed();
    void crypto.start();
  } else if (!s.liveCrypto && crypto) {
    crypto.stop();
    crypto = null;
  }
  if (s.liveFx && !fxCtrl) {
    fxCtrl = new AbortController();
    void loadFx(fxCtrl.signal);
  } else if (!s.liveFx && fxCtrl) {
    fxCtrl.abort();
    fxCtrl = null;
    setFeed('fx', 'off');
  }
  const key = s.finnhubKey.trim();
  if (key && !finnhub) {
    finnhub = new FinnhubFeed(key);
    void finnhub.start();
  } else if (finnhub && finnhub.key !== key) {
    finnhub.stop();
    finnhub = key ? new FinnhubFeed(key) : null;
    if (finnhub) void finnhub.start();
  }
}

/** Starts the configured live feeds and follows settings changes. */
export function startLiveFeeds(): () => void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return () => undefined;
  // Let the first frame render before network work starts.
  const t = setTimeout(reconcile, 400);
  const unsub = settings.subscribe(reconcile);
  return () => {
    clearTimeout(t);
    unsub();
    crypto?.stop();
    finnhub?.stop();
    fxCtrl?.abort();
    crypto = null;
    finnhub = null;
    fxCtrl = null;
  };
}
