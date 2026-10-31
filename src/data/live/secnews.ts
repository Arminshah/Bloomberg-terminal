// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import type { SecurityDef } from '../types';
import { secTicker } from './sec';
import { yahooSymbolFor } from './yahoo';
import {
  combinedFeed,
  companyFeeds,
  companyStories,
  finnhubSymbol,
  googleSearches,
  loadNews,
  marketNews,
  mergeStories,
  newsAvailable,
  onEuronext,
  releasesOf,
  type FeedState,
  type MarketStory,
} from './marketnews';

/**
 * The news of any security, from every source that covers it: for a US stock Finnhub, Alpaca, Massive and Marketaux
 * (with your keys); for anything Yahoo quotes, its headline feed (indices, currencies, commodities and coins
 * included); Google News's search for its name; and for a stock listed on Euronext, its press releases. COMPANYNEWS,
 * QUOTE, FAVOURITES and BREAKING read it here.
 */

/** Which sources to ask: QUOTE and lists of securities spare Massive's 5 calls a minute and Marketaux's daily 100. */
export interface NewsReach {
  massive?: boolean;
  marketaux?: boolean;
  /** How many of a security's Google News editions to ask (a Brussels stock has three). */
  google?: number;
}

const ALL: Required<NewsReach> = { massive: true, marketaux: true, google: 9 };
/** For a list of securities: the cheap sources, and each one's first Google edition. */
export const LIST_REACH: NewsReach = { massive: false, marketaux: false, google: 1 };

const YAHOO_RSS_SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The requests that cover a security's news. */
export function newsPlan(def: SecurityDef, reach: NewsReach = ALL) {
  const r = { ...ALL, ...reach };
  const yahoo = def.cls === 'bond' ? null : (yahooSymbolFor(def) ?? def.yahoo ?? null)?.toUpperCase() ?? null;
  return {
    us: secTicker(def),
    yahoo: yahoo && YAHOO_RSS_SYMBOL.test(yahoo) ? yahoo : null,
    google: googleSearches(def).slice(0, r.google),
    euronext: onEuronext(def),
    massive: r.massive,
    marketaux: r.marketaux,
  };
}

/** Asks each source in a security's plan, within the intervals the sources allow. */
function askFor(def: SecurityDef, reach: NewsReach) {
  const p = newsPlan(def, reach);
  const now = Date.now();
  if (p.us) {
    const fs = finnhubSymbol(p.us);
    void loadNews('finnhub-company', `${fs}|${isoDay(now - 7 * 86_400_000)}|${isoDay(now)}`, 15 * 60_000);
    void loadNews('alpaca-company', fs, 10 * 60_000);
    if (p.massive) void loadNews('massive-company', fs, 30 * 60_000);
    if (p.marketaux) void loadNews('marketaux', [...new Set([p.us, p.us.replace(/-/g, '.')])].join(','), 60 * 60_000);
  }
  if (p.yahoo) void loadNews('yahoo-rss', p.yahoo, 15 * 60_000);
  for (const a of p.google) void loadNews('google-news-company', a, 15 * 60_000);
  if (p.euronext) void loadNews('euronext-pr', '', 10 * 60_000);
}

/** Asks for the news of the first `max` securities, each source within its own interval. */
export function refreshSecuritiesNews(defs: SecurityDef[], reach: NewsReach = LIST_REACH, max = 20) {
  if (!newsAvailable()) return;
  defs.slice(0, max).forEach((d) => askFor(d, reach));
}

/** Keeps the news of some securities fresh while a screen shows them; at most the first `max`. */
export function useSecuritiesNews(defs: (SecurityDef | null | undefined)[], reach: NewsReach = ALL, max = 20) {
  const v = marketNews.use((x) => x.v);
  const list = defs.filter((d): d is SecurityDef => !!d).slice(0, max);
  const key = `${list.map((d) => d.id).join('\n')}|${JSON.stringify(reach)}`;
  useEffect(() => {
    if (!list.length || !newsAvailable()) return;
    const tick = () => list.forEach((d) => askFor(d, reach));
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** One source's name and the state of its requests, for a status line. */
export type SourceState = [string, FeedState | undefined];

/**
 * A security's stories, merged newest first, and each source's state. Google comes last, so a story another
 * source carries keeps that source's direct link rather than Google's redirect.
 */
export function securityNews(def: SecurityDef, reach: NewsReach = ALL): { stories: MarketStory[]; states: SourceState[] } {
  const p = newsPlan(def, reach);
  const { lists, feeds } = marketNews.get();
  const yahooKey = p.yahoo ? `yahoo-rss:${p.yahoo}` : '';
  const googleKeys = p.google.map((a) => `google-news-company:${a}`);
  const own = p.euronext ? releasesOf(def.name, lists['euronext-pr'] ?? []) : [];
  const google = mergeStories(googleKeys.map((k) => lists[k] ?? []));
  const stories = mergeStories([p.us ? companyStories(p.us) : [], yahooKey ? (lists[yahooKey] ?? []) : [], own, google]);
  const states: SourceState[] = [];
  if (p.us) {
    const f = companyFeeds(feeds, p.us);
    states.push(['Finnhub', f.finnhub], ['Alpaca', f.alpaca]);
    if (p.massive) states.push(['Massive', f.massive]);
    if (p.marketaux) states.push(['Marketaux', f.marketaux]);
  }
  if (yahooKey) states.push(['Yahoo Finance', feeds[yahooKey]]);
  if (googleKeys.length) {
    const g = combinedFeed(googleKeys.map((k) => feeds[k]));
    // A story found in two editions counts once.
    states.push(['Google News', g?.state === 'ok' ? { ...g, count: google.length } : g]);
  }
  if (p.euronext) {
    const e = feeds['euronext-pr'];
    states.push(['Euronext', e?.state === 'ok' ? { ...e, count: own.length, message: `among its latest ${e.count ?? 0}` } : e]);
  }
  return { stories, states };
}

/** Several securities' stories, merged; a story no source tagged is tagged with the security it was found for. */
export function securitiesNews(defs: SecurityDef[], reach: NewsReach = LIST_REACH, max = 20): MarketStory[] {
  return mergeStories(
    defs.slice(0, max).map((d) => {
      const tag = d.ticker.split(' ')[0];
      return securityNews(d, reach).stories.map((s) => (s.tickers.length ? s : { ...s, tickers: [tag] }));
    }),
  );
}
