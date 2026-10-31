// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { addRealStories, type Story } from '../news';
import { setFeed } from './status';
import { officialAvailable } from './official';
import type { OfficialSource } from './lookup';
import { registerRefresh, type RefreshOutcome } from '../../terminal/refresh';

/**
 * Official announcements for the news screens, from each publisher's own RSS
 * feed: central banks, a regulator and a statistics office. Each headline keeps
 * its publisher, its link and the time the publisher gives, apart from the time
 * the app received it. Nothing is summarised or generated, and nothing is shown
 * as breaking: these are press releases, published a few times a day.
 */

export interface FeedItem {
  title: string;
  link: string;
  /** Publication time from the feed (epoch ms). */
  published: number;
  summary?: string;
  category?: string;
  /** An RSS item's <source>: the publisher, in a feed that gathers several (Google News). */
  source?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text of a feed field: CDATA unwrapped, tags removed, entities decoded, whitespace collapsed. */
export function feedText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  let t = cdata ? cdata[1] : raw;
  // HTML inside a description (escaped or in CDATA) is reduced to its text.
  t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  t = t.replace(/<[^>]*>/g, ' ');
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  return t.replace(/\s+/g, ' ').trim();
}

function field(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? feedText(m[1]) : undefined;
}

/** Items of an RSS 2.0 or Atom feed, newest first; items without a title, a link or a readable date are left out. */
export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const atom = blocks.length ? [] : [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  for (const b of [...blocks, ...atom]) {
    const title = field(b, 'title');
    // An Atom entry's <source> holds a whole feed's metadata, not a name.
    const source = atom.length ? undefined : field(b, 'source');
    const link = field(b, 'link') || /<link\b[^>]*href="([^"]+)"/i.exec(b)?.[1] || '';
    const when = field(b, 'pubDate') ?? field(b, 'dc:date') ?? field(b, 'published') ?? field(b, 'updated');
    const published = when ? Date.parse(when) : NaN;
    if (!title || !/^https?:\/\//.test(link) || !Number.isFinite(published)) continue;
    const summary = field(b, 'description') ?? field(b, 'summary');
    const category = field(b, 'category');
    out.push({ title, link, published, ...(summary && summary !== title ? { summary } : {}), ...(category ? { category } : {}), ...(source ? { source } : {}) });
  }
  return out.sort((a, b) => b.published - a.published);
}

export interface OfficialFeed {
  source: OfficialSource;
  publisher: string;
  /** News topic code (see NEWS_TOPICS). */
  topic: 'CB' | 'REG' | 'STATS' | 'SPEECH';
  /** Terms, briefly, for the provider screen and the docs. */
  terms: string;
}

export const OFFICIAL_FEEDS: OfficialFeed[] = [
  { source: 'newsFed', publisher: 'Federal Reserve Board', topic: 'CB', terms: 'Public domain; cite the Board as the source.' },
  { source: 'newsEcb', publisher: 'European Central Bank', topic: 'CB', terms: 'Free use with the ECB cited as the source.' },
  { source: 'newsBoe', publisher: 'Bank of England', topic: 'CB', terms: 'Display for personal, non-commercial use.' },
  { source: 'newsBoc', publisher: 'Bank of Canada', topic: 'CB', terms: 'Free use with the Bank of Canada as the source.' },
  { source: 'newsRba', publisher: 'Reserve Bank of Australia', topic: 'CB', terms: 'CC BY 4.0 with attribution to the RBA.' },
  { source: 'newsBea', publisher: 'US Bureau of Economic Analysis', topic: 'STATS', terms: 'US federal government work.' },
  { source: 'newsEsma', publisher: 'ESMA', topic: 'REG', terms: 'Reproduction allowed with the source acknowledged.' },
  { source: 'newsBoj', publisher: 'Bank of Japan', topic: 'CB', terms: 'Copying allowed with the Bank of Japan named as the source, except for commercial use.' },
  { source: 'newsSec', publisher: 'US Securities and Exchange Commission', topic: 'REG', terms: 'Public information; may be copied with the SEC cited. Asked with SEC_USER_AGENT.' },
  { source: 'newsFedSpeeches', publisher: 'Federal Reserve Board (speeches)', topic: 'SPEECH', terms: 'Public domain; cite the Board as the source.' },
  { source: 'newsEcbBlog', publisher: 'European Central Bank (blog)', topic: 'SPEECH', terms: 'Free use with the ECB cited as the source.' },
  { source: 'newsBis', publisher: "BIS central bankers' speeches", topic: 'SPEECH', terms: 'Display for non-commercial purposes; BIS cited.' },
];

/** A feed's items as stories, with the publisher, its link and both times. */
export function storiesFrom(feed: OfficialFeed, items: FeedItem[], fetched: number): Story[] {
  return items.map((it) => ({
    id: `${feed.source}:${it.link}`,
    time: it.published,
    headline: it.title,
    body: it.summary ? [it.summary] : [],
    tickers: [],
    topics: [feed.topic],
    source: feed.publisher,
    url: it.link,
    real: true,
    fetched,
  }));
}

const REFRESH_MS = 10 * 60_000;

/** Loads every official feed now and every 10 minutes, and on the top bar's REFRESH; a no-op outside the desktop app. */
export function startOfficialNews(): (() => void) | null {
  if (!officialAvailable()) return null;
  let stopped = false;
  const load = async (): Promise<RefreshOutcome | undefined> => {
    const since = new Date().toISOString().slice(0, 10);
    let ok = 0;
    let asked = 0;
    let items = 0;
    const failed: string[] = [];
    await Promise.all(
      OFFICIAL_FEEDS.map(async (feed) => {
        try {
          const answer = await window.arminDesktop!.official(feed.source, since);
          // A feed that needs your SEC contact is not asked without it, and is not a failure.
          if (answer.missing) return;
          asked++;
          const text = answer.status === 200 ? answer.text : '';
          const list = text ? parseFeed(text) : [];
          if (!list.length) throw new Error('no items');
          if (stopped) return;
          addRealStories(storiesFrom(answer.sourceLabel ? { ...feed, publisher: answer.sourceLabel } : feed, list, Date.now()));
          ok++;
          items += list.length;
        } catch {
          failed.push(feed.publisher);
        }
      }),
    );
    if (stopped) return;
    const detail = `Official announcements: ${ok} of ${asked} feeds, ${items} items${failed.length ? ` · not answering: ${failed.join(', ')}` : ''}${asked < OFFICIAL_FEEDS.length ? ' · SEC press releases need SEC_USER_AGENT' : ''}`;
    setFeed('news', ok ? 'live' : 'error', detail);
    return { source: 'Official announcements', state: failed.length ? 'failed' : 'asked', detail: `${ok} of ${asked} feeds${failed.length ? `; not answering: ${failed.join(', ')}` : ''}` };
  };
  setFeed('news', 'connecting', 'Official announcements: loading');
  void load();
  const timer = setInterval(() => void load(), REFRESH_MS);
  const offRefresh = registerRefresh({ source: 'Official announcements', run: load });
  return () => {
    stopped = true;
    clearInterval(timer);
    offRefresh();
  };
}
