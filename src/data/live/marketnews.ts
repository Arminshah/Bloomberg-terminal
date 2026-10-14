import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { parseFeed } from './officialnews';

/**
 * Market and company news, apart from the official announcements: Finnhub (market news and a company's
 * news, with the owner's key), Marketaux (ticker-tagged news with sentiment, with the owner's token),
 * MarketWatch's top stories (RSS, no key) and the SEC's latest 8-K filings (Atom, with SEC_USER_AGENT).
 * The desktop app's main process asks each source within its limits and keeps answers (electron/news.cjs);
 * here the answers become one list without duplicates. Only headlines, publishers, times, short summaries
 * and links are shown; no article text is fetched.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type NewsSource = 'finnhub-market' | 'finnhub-company' | 'marketaux' | 'marketwatch' | 'edgar-8k';
export type NewsFeed = 'Finnhub' | 'Marketaux' | 'MarketWatch' | 'SEC EDGAR';

export interface MarketStory {
  /** The canonical link, which also identifies the story. */
  id: string;
  title: string;
  url: string;
  /** Who published it: Reuters, MarketWatch, a company filing with the SEC, and so on. */
  publisher: string;
  /** The feeds that carried it. */
  feeds: NewsFeed[];
  /** When it was published (epoch ms). */
  time: number;
  summary?: string;
  /** US tickers the source tags it with. */
  tickers: string[];
  /** Marketaux's sentiment for each tagged company, -1 to 1. */
  sentiment?: { symbol: string; score: number }[];
  /** An SEC filing rather than an article. */
  filing?: boolean;
}

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** A link without tracking parameters, fragment, "www." or a trailing slash, for spotting the same story twice. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|mod$|ref$|cmpid$|src$|siteid$|yptr$|ncid$|guccounter$)/i.test(k)) u.searchParams.delete(k);
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const q = u.searchParams.toString();
    return `${host}${path}${q ? `?${q}` : ''}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** A title reduced to letters and digits, for spotting the same story under two links. */
export function titleKey(title: string): string {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Finnhub market or company news: [{category, datetime (s), headline, id, image, related, source, summary, url}]. */
export function parseFinnhubNews(text: string): MarketStory[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'The answer was not JSON' };
  }
  if (!Array.isArray(j)) return { error: String(j?.error ?? 'No list in the answer').slice(0, 200) };
  return j
    .map((r: any) => {
      const url = String(r?.url ?? '');
      const time = Number(r?.datetime) * 1000;
      const title = String(r?.headline ?? '').trim();
      const tickers = String(r?.related ?? '')
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter((t) => TICKER.test(t));
      return { id: canonicalUrl(url), title, url, publisher: String(r?.source ?? 'Finnhub').trim() || 'Finnhub', feeds: ['Finnhub'] as NewsFeed[], time, ...(r?.summary ? { summary: String(r.summary).trim().slice(0, 400) } : {}), tickers };
    })
    .filter((s: MarketStory) => s.title && /^https?:\/\//.test(s.url) && Number.isFinite(s.time) && s.time > 0);
}

/**
 * Marketaux news/all: {meta, data: [{uuid, title, description, snippet, url, published_at, source, entities:
 * [{symbol, name, type, match_score, sentiment_score}]}]}; errors as {error: {code, message}}.
 */
export function parseMarketaux(text: string): MarketStory[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'The answer was not JSON' };
  }
  if (j?.error) return { error: String(j.error.message ?? j.error.code ?? 'error').slice(0, 200) };
  const rows = Array.isArray(j?.data) ? j.data : [];
  return rows
    .map((r: any) => {
      const url = String(r?.url ?? '');
      const entities = Array.isArray(r?.entities) ? r.entities : [];
      const tagged = entities.filter((e: any) => TICKER.test(String(e?.symbol ?? '')));
      const sentiment = tagged.filter((e: any) => Number.isFinite(Number(e?.sentiment_score)) && e?.sentiment_score !== null).map((e: any) => ({ symbol: String(e.symbol), score: Number(e.sentiment_score) }));
      const summary = String(r?.description ?? r?.snippet ?? '').trim();
      return {
        id: canonicalUrl(url),
        title: String(r?.title ?? '').trim(),
        url,
        publisher: String(r?.source ?? 'Marketaux').trim() || 'Marketaux',
        feeds: ['Marketaux'] as NewsFeed[],
        time: Date.parse(String(r?.published_at ?? '')),
        ...(summary ? { summary: summary.slice(0, 400) } : {}),
        tickers: [...new Set(tagged.map((e: any) => String(e.symbol)))] as string[],
        ...(sentiment.length ? { sentiment } : {}),
      };
    })
    .filter((s: MarketStory) => s.title && /^https?:\/\//.test(s.url) && Number.isFinite(s.time));
}

/** MarketWatch's RSS feed as stories. */
export function parseMarketWatch(text: string): MarketStory[] {
  return parseFeed(text).map((it) => ({ id: canonicalUrl(it.link), title: it.title, url: it.link, publisher: 'MarketWatch', feeds: ['MarketWatch'] as NewsFeed[], time: it.published, ...(it.summary ? { summary: it.summary.slice(0, 400) } : {}), tickers: [] }));
}

/**
 * The SEC's latest 8-K filings (Atom). An entry's title is "8-K - COMPANY NAME (CIK) (Filer)" and its summary
 * gives the filing date, accession number and the 8-K items ("Item 2.02: Results of Operations ...").
 * A filing listed once per role (filer, subject) is kept once.
 */
export function parseEdgar8k(text: string): MarketStory[] {
  const seen = new Set<string>();
  const out: MarketStory[] = [];
  for (const it of parseFeed(text)) {
    const m = /^(8-K(?:\/A)?)\s+-\s+(.+?)\s+\((\d{10})\)/.exec(it.title);
    if (!m) continue;
    const acc = /AccNo:\s*([0-9-]+)/.exec(it.summary ?? '')?.[1] ?? it.link;
    if (seen.has(acc)) continue;
    seen.add(acc);
    const items = [...(it.summary ?? '').matchAll(/Item\s+(\d+\.\d+):\s*([^:]+?)(?=\s*Item\s+\d+\.\d+:|$)/g)].map((x) => `${x[1]} ${x[2].trim()}`);
    out.push({
      id: canonicalUrl(it.link),
      title: `${m[2]} filed a ${m[1]}${items.length ? `: ${items.map((x) => x.replace(/^\d+\.\d+ /, '')).join('; ')}` : ''}`,
      url: it.link,
      publisher: 'SEC EDGAR (company filing)',
      feeds: ['SEC EDGAR'],
      time: it.published,
      ...(items.length ? { summary: items.map((x) => `Item ${x}`).join(' · ') } : {}),
      tickers: [],
      filing: true,
    });
  }
  return out;
}

/** One list from several sources: a story carried twice (same link, or same title) is kept once, with both feeds. */
export function mergeStories(lists: MarketStory[][]): MarketStory[] {
  const byId = new Map<string, MarketStory>();
  const byTitle = new Map<string, MarketStory>();
  for (const s of lists.flat()) {
    const tk = titleKey(s.title);
    const dup = byId.get(s.id) ?? (tk.length > 20 ? byTitle.get(tk) : undefined);
    if (dup) {
      dup.feeds = [...new Set([...dup.feeds, ...s.feeds])];
      dup.tickers = [...new Set([...dup.tickers, ...s.tickers])];
      if (s.sentiment && !dup.sentiment) dup.sentiment = s.sentiment;
      if (!dup.summary && s.summary) dup.summary = s.summary;
      // The earliest time a source gives is when it was published.
      dup.time = Math.min(dup.time, s.time);
      continue;
    }
    const copy = { ...s, feeds: [...s.feeds], tickers: [...s.tickers] };
    byId.set(copy.id, copy);
    if (tk.length > 20) byTitle.set(tk, copy);
  }
  return [...byId.values()].sort((a, b) => b.time - a.time);
}

export interface FeedState {
  state: 'idle' | 'loading' | 'ok' | 'error' | 'needs-key' | 'budget' | 'off';
  message?: string;
  /** When the answer arrived. */
  at?: number;
  stale?: boolean;
  count?: number;
}

/** Answers per request ("marketwatch", "finnhub-company:AAPL", "marketaux:AAPL,MSFT"), and their state. */
export const marketNews = createStore<{ v: number; lists: Record<string, MarketStory[]>; feeds: Record<string, FeedState> }>({ v: 0, lists: {}, feeds: {} });

export function newsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.news === 'function';
}

const PARSE: Record<NewsSource, (t: string) => MarketStory[] | { error: string }> = {
  'finnhub-market': parseFinnhubNews,
  'finnhub-company': parseFinnhubNews,
  marketaux: parseMarketaux,
  marketwatch: parseMarketWatch,
  'edgar-8k': parseEdgar8k,
};

const lastAsked = new Map<string, number>();

/** Asks one source; at most once in `minMs` per request, whatever the screens ask for. */
export async function loadNews(source: NewsSource, arg = '', minMs = 60_000): Promise<void> {
  const key = arg ? `${source}:${arg}` : source;
  if (!newsAvailable() || Date.now() - (lastAsked.get(key) ?? 0) < minMs) return;
  lastAsked.set(key, Date.now());
  const set = (f: FeedState, list?: MarketStory[]) =>
    marketNews.set((s) => ({ v: s.v + 1, feeds: { ...s.feeds, [key]: f }, lists: list ? { ...s.lists, [key]: list } : s.lists }));
  if (!marketNews.get().feeds[key]) set({ state: 'loading' });
  try {
    const res = await window.arminDesktop!.news!(source, arg);
    if (res.gated) return set({ state: 'off', message: `off until ${res.gated} is switched on (PROVIDERS)` });
    if (res.missing || res.refused) return set({ state: 'needs-key', message: res.refused ? `The configured ${res.missing ?? 'key'} has the wrong format.` : `Needs ${res.missing} (PROVIDERS).` });
    if (!res.text) {
      if (!res.budget) retryLater(key, minMs);
      return set({ state: res.budget ? 'budget' : 'error', message: res.budget ? "Today's allowance for this source is spent; it resets at midnight UTC." : res.error ?? `HTTP ${res.status}` });
    }
    const parsed = PARSE[source](res.text);
    if (!Array.isArray(parsed)) return set({ state: 'error', message: parsed.error, at: res.at });
    // A stale answer means the newest request failed: keep backing off, but show what arrived before.
    if (res.stale) retryLater(key, minMs);
    else failures.delete(key);
    set({ state: 'ok', at: res.at, stale: res.stale, count: parsed.length }, parsed);
  } catch (err) {
    retryLater(key, minMs);
    set({ state: 'error', message: String((err as Error)?.message ?? err) });
  }
}

/** Failures in a row per request. */
const failures = new Map<string, number>();

/**
 * After a failure the next try waits 1, 2, 4, 8... minutes, never longer than the source's usual interval, so
 * an outage does not spend a small daily allowance (Marketaux: 100 a day) on requests that cannot succeed.
 */
function retryLater(key: string, minMs: number) {
  const n = (failures.get(key) ?? 0) + 1;
  failures.set(key, n);
  lastAsked.set(key, Date.now() - minMs + Math.min(minMs, 60_000 * 2 ** (n - 1)));
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Keeps the market news sources fresh while a screen shows them: Finnhub every 5 minutes, the feeds every 10. */
export function useMarketNews(watch: string[]) {
  const v = marketNews.use((s) => s.v);
  const symbols = watch.filter((t) => TICKER.test(t)).slice(0, 50).join(',');
  useEffect(() => {
    if (!newsAvailable()) return;
    const tick = () => {
      void loadNews('finnhub-market', '', 5 * 60_000);
      void loadNews('marketwatch', '', 10 * 60_000);
      void loadNews('edgar-8k', '', 10 * 60_000);
      // Marketaux: one request for the whole list, at most once an hour (the main process keeps it an hour).
      if (symbols) void loadNews('marketaux', symbols, 60 * 60_000);
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [symbols]);
  return v;
}

/**
 * A company's news while a screen shows it: Finnhub for the last week and, unless `marketaux` is false
 * (QUOTE, to spare its small daily allowance), Marketaux for the ticker.
 */
export function useCompanyNews(symbol: string | null, marketaux = true) {
  const v = marketNews.use((s) => s.v);
  useEffect(() => {
    if (!symbol || !newsAvailable()) return;
    const tick = () => {
      const now = Date.now();
      void loadNews('finnhub-company', `${symbol}|${isoDay(now - 7 * 86_400_000)}|${isoDay(now)}`, 15 * 60_000);
      if (marketaux) void loadNews('marketaux', symbol, 60 * 60_000);
    };
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [symbol, marketaux]);
  return v;
}

/** The stories of the requests whose keys start with one of `prefixes`, merged. */
export function storiesFor(prefixes: string[]): MarketStory[] {
  const lists = marketNews.get().lists;
  return mergeStories(Object.entries(lists).filter(([k]) => prefixes.some((p) => k === p || k.startsWith(`${p}:`))).map(([, l]) => l));
}

/** A company's stories: its Finnhub news and every Marketaux story tagged with its ticker. */
export function companyStories(symbol: string): MarketStory[] {
  const lists = marketNews.get().lists;
  const own = Object.entries(lists).filter(([k]) => k.startsWith(`finnhub-company:${symbol}|`)).map(([, l]) => l);
  const tagged = Object.entries(lists)
    .filter(([k]) => k.startsWith('marketaux:'))
    .map(([, l]) => l.filter((s) => s.tickers.includes(symbol)));
  return mergeStories([...own, ...tagged]);
}
