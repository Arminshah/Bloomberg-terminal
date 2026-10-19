import { createStore } from '../core/store';
import { sameTicker, titleKey, type MarketStory } from '../data/live/marketnews';

/**
 * Pop-ups for news about your favourites. Unlike other pop-ups they stay on screen until you close one or click
 * it, so a story is not missed while you look elsewhere; the ones not dismissed are kept across a restart and
 * listed on BREAKING's ★ Favourites tab. A story pops up once: its link and its title are remembered, so the same
 * story from a second source, or after a restart, does not pop up again.
 */

/** A story about one or more favourites that popped up. */
export interface FavAlert {
  /** The story's id: its canonical link. */
  id: string;
  title: string;
  url: string;
  publisher: string;
  /** Publication time, as the source gives it. */
  time: number;
  /** The favourites it is about, by ticker ("NVDA"), and the first one's security, for COMPANYNEWS. */
  tickers: string[];
  sec?: string;
  /** When it popped up. */
  at: number;
}

/** Pop-ups not dismissed that are kept; beyond this the oldest go. */
export const OPEN_CAP = 50;
/** Links and titles remembered as already popped up; beyond this the oldest go. */
export const SEEN_CAP = 600;
/** How many pop-ups show at once; the others wait behind "+N more". */
export const VISIBLE = 5;
/** After a restart, stories published while the app was closed pop up if they are at most this old. */
export const LOOKBACK_MS = 60 * 60_000;

/** `open`: newest first. `seen`: keys of every story that popped up. `until`: when the watch last looked. */
export const favAlerts = createStore<{ open: FavAlert[]; seen: string[]; until: number }>({ open: [], seen: [], until: 0 }, 'fav-alerts', 1);

/** The keys that make two stories the same: the link, and a title long enough to tell stories apart. */
function keysOf(a: Pick<FavAlert, 'id' | 'title'>): string[] {
  const t = titleKey(a.title);
  return t.length > 20 ? [a.id, `title:${t}`] : [a.id];
}

/** Adds alerts not seen before, newest on top; returns those added. */
export function addFavAlerts(list: FavAlert[]): FavAlert[] {
  const seen = new Set(favAlerts.get().seen);
  const fresh: FavAlert[] = [];
  for (const a of [...list].sort((x, y) => y.time - x.time)) {
    const keys = keysOf(a);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    fresh.push(a);
  }
  if (!fresh.length) return [];
  favAlerts.set((s) => ({
    ...s,
    open: [...fresh, ...s.open].slice(0, OPEN_CAP),
    seen: [...s.seen, ...fresh.flatMap(keysOf)].slice(-SEEN_CAP),
  }));
  return fresh;
}

/** Closes one pop-up; its story stays remembered, so it does not come back. */
export function dismissFavAlert(id: string) {
  favAlerts.set((s) => (s.open.some((a) => a.id === id) ? { ...s, open: s.open.filter((a) => a.id !== id) } : s));
}

export function dismissAllFavAlerts() {
  favAlerts.set((s) => (s.open.length ? { ...s, open: [] } : s));
}

/** Notes that the watch looked at the news now, so a restart knows from when stories were missed. */
export function markWatched(now = Date.now()) {
  favAlerts.set((s) => ({ ...s, until: now }));
}

/** From when a watch starting `now` pops up stories: since the last look if that was within the hour, else from now. */
export function watchSince(now = Date.now()): number {
  const last = favAlerts.get().until;
  return last > 0 && last < now ? Math.max(last, now - LOOKBACK_MS) : now;
}

type Fav = { id: string; ticker: string };
const root = (f: Fav) => f.ticker.split(' ')[0];

/**
 * The favourites' stories as alerts: those found for each favourite, and the market's stories tagged with a
 * favourite's ticker, published since `since`. A time more than five minutes ahead is a source's error, not news.
 */
export function favAlertsFrom(found: { def: Fav; stories: MarketStory[] }[], market: MarketStory[], since: number, now = Date.now()): FavAlert[] {
  const by = new Map<string, { story: MarketStory; favs: Fav[] }>();
  const about = (story: MarketStory, fav: Fav) => {
    const e = by.get(story.id) ?? { story, favs: [] };
    if (!e.favs.some((f) => f.id === fav.id)) e.favs.push(fav);
    by.set(story.id, e);
  };
  const favs = found.map((f) => f.def);
  for (const { def, stories } of found) for (const s of stories) about(s, def);
  for (const s of market) for (const f of favs) if (s.tickers.some((t) => sameTicker(t, root(f)))) about(s, f);
  const out: FavAlert[] = [];
  for (const { story: s, favs: mine } of by.values()) {
    if (s.time < since || s.time > now + 5 * 60_000 || !/^https?:\/\//.test(s.url)) continue;
    out.push({ id: s.id, title: s.title, url: s.url, publisher: s.publisher.replace(/ \(company filing\)$/, ''), time: s.time, tickers: mine.map(root).slice(0, 3), sec: mine[0].id, at: now });
  }
  return out.sort((a, b) => b.time - a.time);
}
