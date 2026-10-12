import { engine } from '../market';
import { addRealStories, type Story } from '../news';
import { desktopData, yahooGet, yahooSymbolFor } from './yahoo';
import { setFeed } from './status';

/**
 * Real headlines for the desktop app from Yahoo Finance search: a set of
 * market topics on a timer, and company headlines whenever a security's news
 * is opened. Stories carry the publisher and a link; there is no invented copy.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const TOPICS: [query: string, topics: string[]][] = [
  ['stock market', ['STK']],
  ['S&P 500', ['STK']],
  ['Nasdaq', ['STK', 'TECH']],
  ['Federal Reserve', ['CB', 'ECO', 'RATES']],
  ['Treasury yields', ['RATES']],
  ['inflation', ['ECO']],
  ['oil prices', ['CMDTY']],
  ['gold price', ['CMDTY']],
  ['dollar', ['FX']],
  ['bitcoin', ['CRYPTO']],
  ['earnings', ['EARN', 'STK']],
  ['analyst upgrade', ['ANALYST', 'STK']],
  ['European stocks', ['STK']],
  ['Asian markets', ['STK']],
  ['artificial intelligence stocks', ['TECH', 'STK']],
];

let symbolIndex: Map<string, string> | null = null;
let indexedCount = 0;

function idFor(symbol: string): string | undefined {
  if (!symbolIndex || indexedCount !== engine.securities.length) {
    symbolIndex = new Map();
    indexedCount = engine.securities.length;
    for (const d of engine.securities) {
      const s = yahooSymbolFor(d) ?? d.yahoo;
      if (s) symbolIndex.set(s.toUpperCase(), d.id);
    }
  }
  return symbolIndex.get(symbol.toUpperCase());
}

export function storyFromYahoo(n: Json, topics: string[], ticker?: string): Story | null {
  if (!n?.title || !n?.providerPublishTime) return null;
  const tickers = ((n.relatedTickers ?? []) as string[]).map(idFor).filter((x): x is string => !!x);
  if (ticker && !tickers.includes(ticker)) tickers.unshift(ticker);
  const publisher = String(n.publisher ?? 'Yahoo Finance');
  return {
    id: `yh:${n.uuid ?? n.link}`,
    time: n.providerPublishTime * 1000,
    headline: String(n.title),
    body: [`Headline from ${publisher} via Yahoo Finance. Open the link for the full story.`],
    tickers,
    topics: ['TOP', ...topics],
    source: publisher.toUpperCase().slice(0, 18),
    url: n.link,
    real: true,
  };
}

async function search(query: string, count: number): Promise<Json[]> {
  const res = await yahooGet(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=${count}`);
  return (res?.news ?? []) as Json[];
}

async function loadTopics() {
  let n = 0;
  for (const [query, topics] of TOPICS) {
    try {
      const items = await search(query, 10);
      const stories = items.map((x) => storyFromYahoo(x, topics)).filter((x): x is Story => !!x);
      addRealStories(stories);
      n += stories.length;
    } catch {
      /* next topic */
    }
  }
  setFeed('news', n ? 'live' : 'error', n ? `Yahoo Finance · ${n} headlines` : 'Yahoo Finance headlines unavailable');
}

const companyAt = new Map<string, number>();

/** Real headlines for one security (throttled to one request per 5 minutes). */
export function requestYahooCompanyNews(id: string) {
  if (!desktopData()) return;
  const d = engine.get(id);
  const symbol = d ? (yahooSymbolFor(d) ?? d.yahoo) : undefined;
  if (!d || !symbol) return;
  if (Date.now() - (companyAt.get(id) ?? 0) < 5 * 60_000) return;
  companyAt.set(id, Date.now());
  void search(symbol, 25)
    .then((items) => addRealStories(items.map((x) => storyFromYahoo(x, d.cls === 'equity' ? ['STK'] : [], id)).filter((x): x is Story => !!x)))
    .catch(() => companyAt.delete(id));
}

/** Starts real headlines in the desktop app. Returns false in the browser. */
export function startYahooNews(): (() => void) | false {
  if (!desktopData()) return false;
  setFeed('news', 'connecting', 'Yahoo Finance headlines');
  void loadTopics();
  const timer = setInterval(() => void loadTopics(), 10 * 60_000);
  return () => clearInterval(timer);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
