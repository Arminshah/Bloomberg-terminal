import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { Quote } from '../types';
import { nasdaqNumber } from './earnings-calendar';

/**
 * The real-time bid and ask (with sizes) and the day's volume of US-listed stocks from Nasdaq's quote page (Nasdaq
 * Basic, no key; desktop app), for the lines a monitor shows without a bid or ask from its price source.
 */

export interface Book {
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  volume: number;
  /** When the app received it. */
  at: number;
}

/** Nasdaq's quote answer as a book; null without a bid or an ask. */
export function parseBook(text: string, at: number): Book | null {
  try {
    const p = JSON.parse(text)?.data?.primaryData;
    if (!p) return null;
    const book = { bid: nasdaqNumber(p.bidPrice), ask: nasdaqNumber(p.askPrice), bidSize: nasdaqNumber(p.bidSize), askSize: nasdaqNumber(p.askSize), volume: Math.round(nasdaqNumber(p.volume)), at };
    // A crossed or one-sided book is not shown as a quote.
    return book.bid > 0 && book.ask >= book.bid ? book : null;
  } catch {
    return null;
  }
}

export const books = createStore<{ v: number; by: Record<string, Book> }>({ v: 0, by: {} });
const asked = new Map<string, number>();

/** The app's US stock ticker in Nasdaq's spelling (BRK.B), or null for anything else. */
export function nasdaqTicker(id: string): string | null {
  const m = /^([A-Z][A-Z0-9]{0,6})(?:\/([A-Z]{1,2}))? US Equity$/.exec(id);
  return m ? (m[2] ? `${m[1]}.${m[2]}` : m[1]) : null;
}

async function ask(symbol: string) {
  const api = window.arminDesktop;
  if (!api?.nasdaq) return;
  asked.set(symbol, Date.now());
  try {
    const res = await api.nasdaq('info', symbol);
    const book = res.text ? parseBook(res.text, res.at ?? Date.now()) : null;
    if (book) books.set((s) => ({ v: s.v + 1, by: { ...s.by, [symbol]: book } }));
  } catch {
    /* the monitor keeps what it has */
  }
}

/** Keeps the books of the US stocks among `ids` (the first 20), each once a minute. */
export function useBooks(ids: string[]) {
  const v = books.use((s) => s.v);
  const key = ids.join(',');
  useEffect(() => {
    if (typeof window === 'undefined' || !window.arminDesktop?.nasdaq) return;
    const tick = () => {
      const now = Date.now();
      for (const id of key.split(',').slice(0, 20)) {
        const symbol = nasdaqTicker(id);
        if (!symbol) continue;
        // Every US stock: a source's own bid and ask can be one venue's or stale (a $10 spread on Alphabet).
        if (now - (asked.get(symbol) ?? 0) >= 60_000) void ask(symbol);
      }
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [key]);
  return v;
}

/**
 * A quote with Nasdaq's bid and ask where its own source has none, or one much wider than Nasdaq's (a single venue's
 * or a stale quote), and Nasdaq's volume where the source has none; the book no older than three minutes.
 */
export function withBook(id: string, q: Quote | undefined): Quote | undefined {
  const symbol = nasdaqTicker(id);
  const b = symbol ? books.get().by[symbol] : undefined;
  if (!q || !b || Date.now() - b.at > 180_000) return q;
  const tight = (spread: number) => spread <= 3 * (b.ask - b.bid) + 0.02 * Math.max(1, b.ask / 100);
  const hasBbo = q.bid > 0 && q.ask >= q.bid && tight(q.ask - q.bid);
  return {
    ...q,
    ...(hasBbo ? {} : { bid: b.bid, ask: b.ask, bboSource: `Nasdaq real-time quote (bid ${b.bidSize} × ask ${b.askSize} shares)` }),
    ...(!(q.volume > 0) && b.volume > 0 ? { volume: b.volume } : {}),
  };
}
