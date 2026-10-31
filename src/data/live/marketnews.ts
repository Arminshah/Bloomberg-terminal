// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { isBreakingStory } from './breaking';
import { createStore } from '../../core/store';
import { shortName } from '../news';
import type { SecurityDef } from '../types';
import { feedText, parseFeed } from './officialnews';
import { registerRefresh, type RefreshOutcome } from '../../terminal/refresh';

/**
 * Market and company news, apart from the official announcements: Finnhub (market news, mergers and a
 * company's news, with the owner's key), Alpaca (Benzinga's wire, with the owner's Alpaca keys), Massive
 * (ticker news, with the owner's key), Marketaux (ticker-tagged news with sentiment, with the owner's token),
 * MarketWatch's top stories (RSS, no key), the SEC's latest 8-K filings (Atom, with SEC_USER_AGENT), Yahoo
 * Finance's headlines for one ticker, Euronext's latest company press releases, and Google News's market and
 * company searches (RSS, no key).
 * The desktop app's main process asks each source within its limits and keeps answers (electron/news.cjs);
 * here the answers become one list without duplicates. Only headlines, publishers, times, short summaries
 * and links are shown; no article text is fetched.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type NewsSource =
  | 'finnhub-market'
  | 'finnhub-company'
  | 'marketaux'
  | 'marketwatch'
  | 'edgar-8k'
  | 'yahoo-rss'
  | 'euronext-pr'
  | 'alpaca-market'
  | 'alpaca-company'
  | 'massive-market'
  | 'massive-company'
  | 'google-news-market'
  | 'google-news-breaking'
  | 'google-news-search'
  | 'google-news-company';
export type NewsFeed = 'Finnhub' | 'Marketaux' | 'MarketWatch' | 'SEC EDGAR' | 'Yahoo Finance' | 'Euronext' | 'Alpaca' | 'Massive' | 'Google News' | 'Official';

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
  /** A press release's issuer, where its title names it ("COMPANY : HEADLINE"). */
  issuer?: string;
}

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** Tickers compared without caring how a class share is written: BRK-B, BRK.B and BRK/B are one. */
export const sameTicker = (a: string, b: string) => a.replace(/[./]/g, '-') === b.replace(/[./]/g, '-');

/** Finnhub writes class shares with a dot (BRK.B), as the app's earlier Finnhub lookup did. */
export const finnhubSymbol = (symbol: string) => symbol.replace(/-/g, '.');

/** A ticker with a class share, in both spellings, for Marketaux, whose spelling could not be checked. */
const marketauxSymbols = (symbol: string) => [...new Set([symbol, symbol.replace(/-/g, '.')])];

/** The watchlist as one Marketaux request: at most 50 symbols. */
export const watchSymbols = (watch: string[]) => [...new Set(watch.filter((t) => TICKER.test(t)).flatMap(marketauxSymbols))].slice(0, 50).join(',');

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

const usable = (s: MarketStory) => !!s.title && /^https?:\/\//.test(s.url) && Number.isFinite(s.time);

/** The US tickers in a list a source gives, upper case, once each. */
const tickersIn = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).map((t) => String(t).trim().toUpperCase()).filter((t) => TICKER.test(t)))];

/**
 * Alpaca's news, Benzinga's wire: {news: [{id, headline, author, created_at, updated_at, summary, content, images,
 * symbols, source, url}], next_page_token}; errors as {code, message}. A story without a link is left out.
 */
export function parseAlpacaNews(text: string): MarketStory[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'The answer was not JSON' };
  }
  if (!Array.isArray(j?.news)) return { error: String(j?.message ?? 'No news list in the answer').slice(0, 200) };
  return j.news
    .map((r: any) => {
      const url = String(r?.url ?? '');
      const summary = feedText(String(r?.summary ?? ''));
      // Alpaca writes its source in lower case: "benzinga".
      const source = String(r?.source ?? '').trim();
      return {
        id: canonicalUrl(url),
        title: feedText(String(r?.headline ?? '')),
        url,
        publisher: source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Benzinga',
        feeds: ['Alpaca'] as NewsFeed[],
        time: Date.parse(String(r?.created_at ?? '')),
        ...(summary ? { summary: summary.slice(0, 400) } : {}),
        tickers: tickersIn(r?.symbols),
      };
    })
    .filter(usable);
}

/**
 * Massive's ticker news: {status: "OK", results: [{id, publisher: {name, homepage_url}, title, author, published_utc,
 * article_url, tickers, description, keywords, insights}], next_url}; errors as {status: "ERROR", error}.
 */
export function parseMassiveNews(text: string): MarketStory[] | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'The answer was not JSON' };
  }
  if (!Array.isArray(j?.results)) return j?.status === 'OK' ? [] : { error: String(j?.error ?? j?.message ?? 'No results in the answer').slice(0, 200) };
  return j.results
    .map((r: any) => {
      const url = String(r?.article_url ?? '');
      const summary = String(r?.description ?? '').trim();
      return {
        id: canonicalUrl(url),
        title: String(r?.title ?? '').trim(),
        url,
        publisher: String(r?.publisher?.name ?? '').trim() || publisherOf(url),
        feeds: ['Massive'] as NewsFeed[],
        time: Date.parse(String(r?.published_utc ?? '')),
        ...(summary ? { summary: summary.slice(0, 400) } : {}),
        tickers: tickersIn(r?.tickers),
      };
    })
    .filter(usable);
}

/**
 * Pages about a stock that Google lists among stories: "ABI.BR Stock Price, News, Quote & History - Yahoo Finance",
 * and MarketScreener's and Zonebourse's, whose titles end with the ISIN ("Graphique de cours | KBC | BE0003565737").
 */
const QUOTE_PAGE = /(?:stock|share) price,? news,? quote|latest stock news and headlines|stock forum & discussion|stock forecast & (?:analyst )?predictions|exchange rate chart|\|\s*[A-Z]{2}[A-Z0-9]{9}\d\b/i;

/**
 * Google News RSS: each item's title ends with " - Publisher", the publisher is also its <source>, and its link goes
 * through news.google.com to the article. The description only repeats the title and publisher, so it is not
 * shown. A company search's stories are tagged with the ticker it was for; quote pages are left out.
 */
export function parseGoogleNews(text: string, ticker?: string): MarketStory[] | { error: string } {
  // Outside the feed (a consent or error page) Google answers with a web page.
  if (!/<rss\b/i.test(text)) return { error: 'Google answered with a web page, not the feed' };
  return parseFeed(text)
    .map((it) => {
      const publisher = it.source?.trim() || 'Google News';
      const tail = ` - ${publisher}`;
      return {
        id: canonicalUrl(it.link),
        title: it.source && it.title.endsWith(tail) ? it.title.slice(0, -tail.length).trim() : it.title,
        url: it.link,
        publisher,
        feeds: ['Google News'] as NewsFeed[],
        time: it.published,
        tickers: ticker ? [ticker] : [],
      };
    })
    .filter((s) => usable(s) && !QUOTE_PAGE.test(s.title));
}

/** MarketWatch's RSS feed as stories. */
export function parseMarketWatch(text: string): MarketStory[] {
  return parseFeed(text).map((it) => ({ id: canonicalUrl(it.link), title: it.title, url: it.link, publisher: 'MarketWatch', feeds: ['MarketWatch'] as NewsFeed[], time: it.published, ...(it.summary ? { summary: it.summary.slice(0, 400) } : {}), tickers: [] }));
}

/** A publisher's name from an article link: "www.fool.com" is fool.com. */
export function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|finance|news|m)\./, '');
  } catch {
    return 'Yahoo Finance';
  }
}

/**
 * Yahoo Finance's headlines RSS for one ticker: items with title, link (the original article), pubDate and a
 * short description. Every story is tagged with the ticker asked for; the publisher is the article's site.
 */
export function parseYahooRss(text: string, symbol: string): MarketStory[] {
  return parseFeed(text).map((it) => ({
    id: canonicalUrl(it.link),
    title: it.title,
    url: it.link,
    publisher: publisherOf(it.link),
    feeds: ['Yahoo Finance'] as NewsFeed[],
    time: it.published,
    ...(it.summary ? { summary: it.summary.slice(0, 400) } : {}),
    tickers: [symbol.toUpperCase()],
  }));
}

/**
 * Euronext's company press releases RSS (the latest 10). A title reads "COMPANY : HEADLINE"; the company becomes
 * the publisher. The item description is page markup and the full text, so it is not shown.
 */
export function parseEuronextPr(text: string): MarketStory[] {
  return parseFeed(text).map((it) => {
    const m = /^(.{2,80}?)\s+:\s+(.+)$/.exec(it.title);
    return {
      id: canonicalUrl(it.link),
      title: it.title,
      url: it.link,
      publisher: `${m ? m[1].trim() : 'Euronext issuer'} (press release)`,
      feeds: ['Euronext'] as NewsFeed[],
      time: it.published,
      tickers: [],
      filing: false,
      ...(m ? { issuer: m[1].trim() } : {}),
    };
  });
}

/** Countries whose stock exchange is Euronext's: Brussels, Paris, Amsterdam, Lisbon and Dublin. */
const EURONEXT_COUNTRIES = new Set(['BE', 'FR', 'NL', 'PT', 'IE']);

/** A stock listed on a Euronext market, whose own press releases can be in Euronext's feed. */
export function onEuronext(d: { cls: string; country: string; exch?: string }): boolean {
  return d.cls === 'equity' && (EURONEXT_COUNTRIES.has(d.country) || /^EN /.test(d.exch ?? ''));
}

/** Legal forms, written without their dots: "N.V." is nv, "S.A." is sa, "SA/NV" is two of them. */
const LEGAL_FORMS = new Set(['sa', 'nv', 'plc', 'ag', 'se', 'spa', 'sgps', 'bv', 'asa', 'sca', 'cva', 'ltd', 'limited', 'inc', 'corp', 'co']);
const LEGAL_PAIRS = new Set(['societe anonyme', 'naamloze vennootschap', 'sociedade anonima', 'comm va']);

/**
 * A company's name as words without case, accents, punctuation or legal forms: "Anheuser-Busch InBev SA/NV" is
 * anheuser busch inbev, "L’ORÉAL" and "L'Oreal SA" are both loreal, "NV Bekaert SA" is bekaert.
 */
export function companyWords(name: string): string[] {
  const w = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // A legal form ends the name (at times two of them), or starts it; a name that is only one word keeps it.
  for (;;) {
    if (w.length > 2 && LEGAL_PAIRS.has(w.slice(-2).join(' '))) w.splice(-2);
    else if (w.length > 1 && LEGAL_FORMS.has(w[w.length - 1])) w.pop();
    else if (w.length > 1 && LEGAL_FORMS.has(w[0])) w.shift();
    else return w;
  }
}

/**
 * Whether two names are one company's: the same words (see companyWords), or one name the first words of the
 * other ("LVMH" and "LVMH Moet Hennessy Louis Vuitton SE"). A first word of three letters or fewer is not
 * enough alone: "KBC" begins both "KBC Groep NV" and "KBC Ancora", which are two companies.
 */
export function sameCompany(a: string, b: string): boolean {
  const x = companyWords(a);
  const y = companyWords(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!short.every((w, i) => long[i] === w)) return false;
  return short.length === long.length || short.length >= 2 || short[0].length > 3;
}

/**
 * The Euronext press releases of one company: those whose issuer is the company and, for a title that does
 * not name its issuer ("Mercialys Appoints ..."), those whose title starts with the company's name.
 */
export function releasesOf(company: string, stories: MarketStory[]): MarketStory[] {
  const own = companyWords(company);
  const distinct = own.length >= 2 || (own.length === 1 && own[0].length > 3);
  return stories.filter((s) => {
    if (s.issuer) return sameCompany(s.issuer, company);
    const t = companyWords(s.title);
    return distinct && own.every((w, i) => t[i] === w);
  });
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
    // An item's name can hold a colon itself (5.02: "... Appointment of Certain Officers: Compensatory ..."), so it
    // runs to the next "Item n.nn:" or the end.
    const items = [...(it.summary ?? '').matchAll(/Item\s+(\d+\.\d+):\s*(.+?)(?=\s*Item\s+\d+\.\d+:|$)/g)].map((x) => `${x[1]} ${x[2].trim()}`);
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

const PARSE: Record<NewsSource, (t: string, arg: string) => MarketStory[] | { error: string }> = {
  'yahoo-rss': (t, arg) => parseYahooRss(t, arg),
  'euronext-pr': (t) => parseEuronextPr(t),
  'finnhub-market': parseFinnhubNews,
  'finnhub-company': parseFinnhubNews,
  marketaux: parseMarketaux,
  marketwatch: parseMarketWatch,
  'edgar-8k': parseEdgar8k,
  'alpaca-market': parseAlpacaNews,
  'alpaca-company': parseAlpacaNews,
  'massive-market': parseMassiveNews,
  'massive-company': parseMassiveNews,
  'google-news-market': (t) => parseGoogleNews(t),
  'google-news-breaking': (t) => parseGoogleNews(t),
  'google-news-search': (t) => parseGoogleNews(t),
  // arg: "BE:nl|KBC|KBC", the ticker last.
  'google-news-company': (t, arg) => parseGoogleNews(t, arg.split('|')[2] || undefined),
};

const lastAsked = new Map<string, number>();
/** Each request a screen or the background asked for, with its interval, and when it last asked (throttled or not). */
const wanted = new Map<string, { source: NewsSource; arg: string; minMs: number; at: number }>();

/** Asks one source; at most once in `minMs` per request, whatever the screens ask for. */
export async function loadNews(source: NewsSource, arg = '', minMs = 60_000): Promise<void> {
  const key = arg ? `${source}:${arg}` : source;
  if (!newsAvailable()) return;
  wanted.delete(key);
  wanted.set(key, { source, arg, minMs, at: Date.now() });
  if (wanted.size > 400) wanted.delete(wanted.keys().next().value!);
  if (Date.now() - (lastAsked.get(key) ?? 0) < minMs) return;
  lastAsked.set(key, Date.now());
  const set = (f: FeedState, list?: MarketStory[]) =>
    marketNews.set((s) => ({ v: s.v + 1, feeds: { ...s.feeds, [key]: f }, lists: list ? { ...s.lists, [key]: list } : s.lists }));
  if (!marketNews.get().feeds[key]) set({ state: 'loading' });
  try {
    const res = await window.arminDesktop!.news!(source, arg);
    // No key or the switch off costs no request: ask again at the next tick, in case they were set meanwhile.
    if (res.gated || res.missing || res.refused) lastAsked.delete(key);
    if (res.gated) return set({ state: 'off', message: `off until ${res.gated} is switched on (PROVIDERS)` });
    if (res.missing || res.refused) return set({ state: 'needs-key', message: res.refused ? `The configured ${res.missing ?? 'key'} has the wrong format.` : `Needs ${res.missing} (PROVIDERS).` });
    if (!res.text) {
      if (!res.budget) retryLater(key, minMs);
      return set({ state: res.budget ? 'budget' : 'error', message: res.budget ? "Today's allowance for this source is spent; it resets at midnight UTC." : res.error ?? `HTTP ${res.status}` });
    }
    const parsed = PARSE[source](res.text, arg);
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

/** Every screen and the background ask for their news at least every five minutes: a request wanted within this is in use. */
const IN_USE_MS = 6 * 60_000;
/** The sources about one company; the rest are market news. */
const COMPANY_SOURCES: NewsSource[] = ['finnhub-company', 'alpaca-company', 'massive-company', 'yahoo-rss', 'google-news-company', 'marketaux'];
const PROVIDER_WORD: [string, string][] = [
  ['finnhub', 'Finnhub'], ['alpaca', 'Alpaca'], ['massive', 'Massive'], ['google-news', 'Google News'], ['yahoo-rss', 'Yahoo Finance'],
  ['euronext', 'Euronext'], ['edgar', 'SEC 8-K'], ['marketwatch', 'MarketWatch'], ['marketaux', 'Marketaux'],
];
const providerWord = (source: string) => PROVIDER_WORD.find(([p]) => source.startsWith(p))?.[1] ?? source;

/**
 * The top bar's REFRESH: every request in use (asked for in the last six minutes by a screen or the background) is
 * asked again now, whatever its interval, and the report says how many answered. The main process still keeps
 * Marketaux's answers for an hour, for its daily allowance.
 */
export async function refreshNews(now = Date.now()): Promise<RefreshOutcome[]> {
  const list = [...wanted.entries()].filter(([, w]) => now - w.at < IN_USE_MS);
  for (const [key] of list) {
    lastAsked.delete(key);
    failures.delete(key);
  }
  await Promise.all(list.map(([, w]) => loadNews(w.source, w.arg, w.minMs)));
  const feeds = marketNews.get().feeds;
  const outcome = (source: string, keys: string[]): RefreshOutcome[] => {
    if (!keys.length) return [];
    const failed = keys.filter((k) => feeds[k]?.state === 'error' || feeds[k]?.stale);
    const off = keys.filter((k) => ['off', 'needs-key', 'budget'].includes(feeds[k]?.state ?? '')).length;
    const names = [...new Set(failed.map(providerWord))];
    const asked = `${keys.length - off} asked${off ? `; ${off} not sent (switched off, no key or allowance spent)` : ''}`;
    return [{ source, state: failed.length ? 'failed' : 'asked', detail: failed.length ? `${asked}; ${failed.length} did not answer (${names.join(', ')})` : asked }];
  };
  const company = list.filter(([, w]) => COMPANY_SOURCES.includes(w.source)).map(([k]) => k);
  const market = list.filter(([, w]) => !COMPANY_SOURCES.includes(w.source)).map(([k]) => k);
  return [...outcome('Market and breaking news', market), ...outcome('Company news', company)];
}

registerRefresh({ source: 'News', available: newsAvailable, run: () => refreshNews() });

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Words Google News's search accepts from NEWS and the help desk (the main process checks them again). */
export const SEARCHABLE = /^["\p{L}\p{N}$][\p{L}\p{N} &'’".:$%/+-]{1,79}$/u;

/** Google News editions MARKETNEWS searches for the day's market news. */
export const MARKET_EDITIONS = ['US:en', 'GB:en'];

/** The market news requests, in the order their stories are merged (see storiesFor). */
export const MARKET_SOURCES = ['finnhub-market', 'alpaca-market', 'massive-market', 'marketwatch', 'edgar-8k', 'marketaux', 'euronext-pr', 'google-news-market'];

/** BREAKING reads the market sources and Google's search of the last hour. */
export const BREAKING_SOURCES = [...MARKET_SOURCES, 'google-news-breaking'];

/**
 * Keeps the fast market sources fresh for BREAKING and the breaking pop-ups: Finnhub (general and mergers), Alpaca,
 * Google's last-hour search every 2 to 3 minutes; MarketWatch, SEC and Euronext every 10; Massive every 15. Marketaux
 * is left to MARKETNEWS, for its daily allowance.
 */
export function refreshBreaking() {
  if (!newsAvailable()) return;
  void loadNews('finnhub-market', '', 2 * 60_000);
  void loadNews('finnhub-market', 'merger', 2 * 60_000);
  void loadNews('alpaca-market', '', 2 * 60_000);
  for (const e of MARKET_EDITIONS) void loadNews('google-news-breaking', e, 3 * 60_000);
  for (const e of MARKET_EDITIONS) void loadNews('google-news-market', e, 10 * 60_000);
  void loadNews('marketwatch', '', 10 * 60_000);
  void loadNews('edgar-8k', '', 10 * 60_000);
  void loadNews('euronext-pr', '', 10 * 60_000);
  void loadNews('massive-market', '', 15 * 60_000);
}

/** Refreshes the breaking sources every minute while a screen shows them (each within its own interval). */
export function useBreakingNews() {
  const v = marketNews.use((s) => s.v);
  useEffect(() => {
    refreshBreaking();
    const t = setInterval(refreshBreaking, 60_000);
    return () => clearInterval(t);
  }, []);
  return v;
}

/**
 * Breaking stories of the last 15 minutes among the breaking sources, for the top bar: only those reporting an event
 * that moves a stock (src/data/live/breaking.ts), not every headline.
 */
export function breakingCount(now = Date.now()): number {
  return storiesFor(BREAKING_SOURCES).filter((s) => isBreakingStory(s, now, 15 * 60_000)).length;
}

/** Official announcements (HEADLINES) as stories beside the market's, for BREAKING. */
export function officialStories(list: { id: string; time: number; headline: string; body: string[]; source: string; url?: string; tickers: string[] }[]): MarketStory[] {
  return list
    .filter((s) => s.url && /^https?:\/\//.test(s.url))
    .map((s) => ({ id: canonicalUrl(s.url!), title: s.headline, url: s.url!, publisher: s.source, feeds: ['Official'] as NewsFeed[], time: s.time, ...(s.body[0] ? { summary: s.body[0].slice(0, 400) } : {}), tickers: [] }));
}

/**
 * Keeps the market news sources fresh while a screen shows them: Finnhub (general news and mergers) and Alpaca
 * every 5 minutes, the feeds every 10, Massive every 15 (5 calls a minute, shared with CROSSCHECK).
 */
export function useMarketNews(watch: string[]) {
  const v = marketNews.use((s) => s.v);
  const symbols = watchSymbols(watch);
  useEffect(() => {
    if (!newsAvailable()) return;
    const tick = () => {
      void loadNews('finnhub-market', '', 5 * 60_000);
      void loadNews('finnhub-market', 'merger', 5 * 60_000);
      void loadNews('alpaca-market', '', 5 * 60_000);
      void loadNews('massive-market', '', 15 * 60_000);
      for (const e of MARKET_EDITIONS) void loadNews('google-news-market', e, 10 * 60_000);
      void loadNews('marketwatch', '', 10 * 60_000);
      void loadNews('edgar-8k', '', 10 * 60_000);
      void loadNews('euronext-pr', '', 10 * 60_000);
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
 * A US company's news while a screen shows it: Finnhub for the last week, Alpaca's latest 50 stories of the last
 * month and, unless switched off here, Massive's latest 50 (QUOTE spares its 5 calls a minute) and Marketaux for
 * the ticker (QUOTE spares its small daily allowance).
 */
export function useCompanyNews(symbol: string | null, { marketaux = true, massive = true } = {}) {
  const v = marketNews.use((s) => s.v);
  useEffect(() => {
    if (!symbol || !newsAvailable()) return;
    const tick = () => {
      const now = Date.now();
      void loadNews('finnhub-company', `${finnhubSymbol(symbol)}|${isoDay(now - 7 * 86_400_000)}|${isoDay(now)}`, 15 * 60_000);
      void loadNews('alpaca-company', finnhubSymbol(symbol), 10 * 60_000);
      if (massive) void loadNews('massive-company', finnhubSymbol(symbol), 30 * 60_000);
      if (marketaux) void loadNews('marketaux', marketauxSymbols(symbol).join(','), 60 * 60_000);
    };
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [symbol, marketaux, massive]);
  return v;
}

/**
 * Google News editions for a listing's country: each of its languages, and the UK's English edition outside
 * English-speaking markets, where the local press has most of a company's news (KBC: 26 Dutch stories in a week
 * against 2 in English) and the English one adds the international wires. Anywhere else, the US edition.
 */
const GOOGLE_EDITIONS: Record<string, string[]> = {
  US: ['US:en'],
  CA: ['CA:en'],
  GB: ['GB:en'],
  IE: ['IE:en'],
  BE: ['BE:nl', 'BE:fr', 'GB:en'],
  NL: ['NL:nl', 'GB:en'],
  FR: ['FR:fr', 'GB:en'],
  DE: ['DE:de', 'GB:en'],
  AT: ['AT:de', 'GB:en'],
  CH: ['CH:de', 'CH:fr', 'GB:en'],
  IT: ['IT:it', 'GB:en'],
  ES: ['ES:es', 'GB:en'],
  PT: ['PT:pt-150', 'GB:en'],
  SE: ['SE:sv', 'GB:en'],
  DK: ['DK:da', 'GB:en'],
  FI: ['FI:fi', 'GB:en'],
  NO: ['NO:no', 'GB:en'],
};

/**
 * The Google News searches for a security, "edition|name|ticker" for each edition. A stock or an index: the name as
 * the press writes it (shortName: "KBC Groep NV" is KBC, SPX is S&P 500), a stock's ticker when it starts with a
 * letter, and in the English edition of one listed on the continent, "|BE" for its country. A currency pair, a
 * commodity or index future and a coin: "US:en|EUR/USD|||fx", searched with words about prices. Bonds and rates
 * have none.
 */
export function googleSearches(def: Pick<SecurityDef, 'id' | 'name' | 'cls' | 'ticker' | 'country' | 'fx'>): string[] {
  const kind = def.cls === 'fx' ? 'fx' : def.cls === 'commodity' || def.cls === 'future' ? 'commodity' : def.cls === 'crypto' ? 'crypto' : '';
  if (!kind && def.cls !== 'equity' && def.cls !== 'index') return [];
  const full = def.cls === 'fx' && def.fx ? `${def.fx.base}/${def.fx.quote}` : shortName(def as SecurityDef);
  const name = full
    .normalize('NFC')
    // Swedish companies are "(publ)": a remark in brackets is not part of the name the press writes.
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}&'’. /-]+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
    .trim();
  if (name.length < 2) return [];
  if (kind) return [`US:en|${name}|||${kind}`];
  const ticker = def.cls === 'equity' ? (/^[A-Z][A-Z0-9]{1,9}/.exec(def.ticker.split(' ')[0].toUpperCase())?.[0] ?? '') : '';
  const own = GOOGLE_EDITIONS[def.country];
  // The UK edition for a stock listed on the continent: the main process adds that country's words to the search.
  return (own ?? ['US:en']).map((e) => (e === 'GB:en' && def.country !== 'GB' ? `${e}|${name}|${ticker}|${def.country}` : `${e}|${name}|${ticker}`));
}

/** Google News's stories on a stock while a screen shows it, from each of its editions every 15 minutes. */
export function useGoogleNews(def: SecurityDef | null | undefined) {
  const v = marketNews.use((x) => x.v);
  const searches = def ? googleSearches(def).join('\n') : '';
  useEffect(() => {
    if (!searches || !newsAvailable()) return;
    const tick = () => {
      for (const a of searches.split('\n')) void loadNews('google-news-company', a, 15 * 60_000);
    };
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [searches]);
  return v;
}

/** Several requests to one source as one state: once any has answered, the stories they returned together. */
export function combinedFeed(states: (FeedState | undefined)[]): FeedState | undefined {
  const known = states.filter((f): f is FeedState => !!f);
  const ok = known.filter((f) => f.state === 'ok');
  if (!ok.length) return known.find((f) => f.state !== 'loading') ?? known[0];
  const at = Math.max(...ok.map((f) => f.at ?? 0));
  return { state: 'ok', count: ok.reduce((n, f) => n + (f.count ?? 0), 0), stale: ok.some((f) => f.stale), ...(at > 0 ? { at } : {}) };
}

/** Google News's stories on a stock from all its editions, once each, and the state of those requests. */
export function googleNews(def: SecurityDef | null | undefined): { stories: MarketStory[]; feed?: FeedState } {
  const keys = def ? googleSearches(def).map((a) => `google-news-company:${a}`) : [];
  if (!keys.length) return { stories: [] };
  const s = marketNews.get();
  const stories = mergeStories(keys.map((k) => s.lists[k] ?? []));
  const feed = combinedFeed(keys.map((k) => s.feeds[k]));
  // A story found in two editions counts once.
  return { stories, feed: feed?.state === 'ok' ? { ...feed, count: stories.length } : feed };
}

/** Yahoo Finance's headlines for one Yahoo symbol (any market it lists) while a screen shows them. */
export function useYahooHeadlines(yahooSymbol: string | null | undefined) {
  const v = marketNews.use((x) => x.v);
  useEffect(() => {
    if (!yahooSymbol || !newsAvailable()) return;
    const tick = () => void loadNews('yahoo-rss', yahooSymbol.toUpperCase(), 15 * 60_000);
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [yahooSymbol]);
  return v;
}

/** Yahoo's headlines for a symbol, and the state of that request. */
export function yahooHeadlines(yahooSymbol: string | null | undefined): { stories: MarketStory[]; feed?: FeedState } {
  if (!yahooSymbol) return { stories: [] };
  const key = `yahoo-rss:${yahooSymbol.toUpperCase()}`;
  const s = marketNews.get();
  return { stories: s.lists[key] ?? [], feed: s.feeds[key] };
}

/** Euronext's latest press releases while a screen shows a stock listed there, every 10 minutes as on MARKETNEWS. */
export function useEuronextReleases(on: boolean) {
  const v = marketNews.use((x) => x.v);
  useEffect(() => {
    if (!on || !newsAvailable()) return;
    const tick = () => void loadNews('euronext-pr', '', 10 * 60_000);
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [on]);
  return v;
}

/** One company's releases among Euronext's latest, and the state of that request. */
export function euronextReleases(company: string): { stories: MarketStory[]; feed?: FeedState } {
  const s = marketNews.get();
  return { stories: releasesOf(company, s.lists['euronext-pr'] ?? []), feed: s.feeds['euronext-pr'] };
}

const ofSource = (k: string, p: string) => k === p || k.startsWith(`${p}:`);

/**
 * The stories of the requests whose keys start with one of `prefixes`, merged in the order of `prefixes`: a story
 * two sources carry keeps the first one's link and publisher, so a direct link wins over Google's redirect.
 */
export function storiesFor(prefixes: string[]): MarketStory[] {
  const lists = Object.entries(marketNews.get().lists);
  return mergeStories(prefixes.flatMap((p) => lists.filter(([k]) => ofSource(k, p)).map(([, l]) => l)));
}

/**
 * A company's stories: its Finnhub, Alpaca and Massive news, and every story tagged with its ticker in Marketaux's
 * answers and the market news lists.
 */
export function companyStories(symbol: string): MarketStory[] {
  const lists = marketNews.get().lists;
  const fs = finnhubSymbol(symbol);
  const own = Object.entries(lists).filter(([k]) => k.startsWith(`finnhub-company:${fs}|`)).map(([, l]) => l);
  const direct = [lists[`alpaca-company:${fs}`], lists[`massive-company:${fs}`]].filter((l): l is MarketStory[] => !!l);
  const tagged = Object.entries(lists)
    .filter(([k]) => k.startsWith('marketaux:') || ['finnhub-market', 'alpaca-market', 'massive-market'].some((p) => ofSource(k, p)))
    .map(([, l]) => l.filter((s) => s.tickers.some((t) => sameTicker(t, symbol))));
  return mergeStories([...own, ...direct, ...tagged]);
}

/** The state of a company's news requests, for the screens' status lines. */
export function companyFeeds(feeds: Record<string, FeedState>, symbol: string): { finnhub?: FeedState; marketaux?: FeedState; alpaca?: FeedState; massive?: FeedState } {
  const fs = finnhubSymbol(symbol);
  return {
    // Its request names the dates, so after midnight UTC the day before's is also there: the last is today's.
    finnhub: Object.entries(feeds)
      .filter(([k]) => k.startsWith(`finnhub-company:${fs}|`))
      .pop()?.[1],
    marketaux: feeds[`marketaux:${marketauxSymbols(symbol).join(',')}`],
    alpaca: feeds[`alpaca-company:${fs}`],
    massive: feeds[`massive-company:${fs}`],
  };
}
