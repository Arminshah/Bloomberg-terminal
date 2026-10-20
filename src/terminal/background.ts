import { engine } from '../data/market';
import { news, type Story } from '../data/news';
import { chatTick, ensureRooms } from '../data/chat';
import { describe } from '../functions/ALRT';
import { startLiveFeeds } from '../data/live/feeds';
import { startDynamicFeeds } from '../data/live/lookup';
import { startYahooData } from '../data/live/yahoo';
import { startShareCounts } from '../data/live/shares';
import { startTreasury } from '../data/live/ust';
import { startPolicyRates } from '../data/live/policy';
import { startGovYields } from '../data/live/govyields';
import { startFred } from '../data/live/fred';
import { startOfficialNews } from '../data/live/officialnews';
import { startKraken } from '../data/live/kraken';
import { startCoinGecko } from '../data/live/coingecko';
import { alerts, favourites, newsAlerts } from './userdata';
import { marketNews, newsAvailable, refreshBreaking, storiesFor, BREAKING_SOURCES } from '../data/live/marketnews';
import { LIST_REACH, refreshSecuritiesNews, securityNews } from '../data/live/secnews';
import type { SecurityDef } from '../data/types';
import { settings } from './settings';
import { toast } from './toasts';
import { addFavAlerts, favAlertsFrom, markWatched, watchSince } from './favalerts';

let audio: AudioContext | null = null;
function beep() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.18);
  } catch {
    /* audio unavailable */
  }
}

function checkAlerts() {
  const st = alerts.get();
  if (!st.list.some((a) => a.active)) return;
  let fired = 0;
  let lapsed = 0;
  const list = st.list.map((a) => {
    if (!a.active) return a;
    if (a.expires && Date.now() > a.expires) {
      lapsed++;
      return { ...a, active: false, expired: true };
    }
    const q = engine.quote(a.sec);
    const d = engine.get(a.sec);
    if (!q || !d) return a;
    // A percent alert waits for a day change against a confirmed previous close.
    const pctOk = Number.isFinite(q.pct) && q.chgCheck !== 'unverified';
    const hit = a.cond === 'above' ? q.last >= a.value : a.cond === 'below' ? q.last <= a.value : !pctOk ? false : a.cond === 'pctUp' ? q.pct >= a.value : q.pct <= -a.value;
    if (!hit) return a;
    fired++;
    toast({ title: 'ALERT', body: `${d.ticker} ${describe(a.cond, a.value, d.dec)} · last ${q.last.toFixed(d.dec)}`, kind: 'alert', command: `${d.id} CHART` }, 12000);
    return { ...a, active: false, triggered: engine.now(), triggeredPx: q.last };
  });
  if (fired || lapsed) {
    alerts.set((s) => ({ ...s, list, unseen: s.unseen + fired }));
    if (fired && settings.get().sound) beep();
  }
}

/**
 * Keyword news alerts: any new headline or ticker containing a watched word, among the official announcements and
 * the market news the app has loaded (MARKETNEWS, BREAKING, company screens, the breaking watch). Stories the app
 * held when it started, or before an alert's sources first answered, do not alert.
 */
function watchNews(): () => void {
  const seen = new Set(news.get().stories.map((s) => s.id));
  const seenMarket = new Set<string>();
  const since = Date.now() - 10 * 60_000;
  const marketFresh = (): Story[] => {
    const out: Story[] = [];
    for (const s of storiesFor(BREAKING_SOURCES)) {
      if (seenMarket.has(s.id)) continue;
      seenMarket.add(s.id);
      if (s.time >= since) out.push({ id: s.id, time: s.time, headline: s.title, body: s.summary ? [s.summary] : [], tickers: s.tickers.map((t) => `${t} US Equity`), topics: [], source: s.publisher, url: s.url });
    }
    return out;
  };
  const check = (fromMarket: boolean) => {
    const fresh: Story[] = [];
    if (fromMarket) fresh.push(...marketFresh());
    else
      for (const s of news.get().stories) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        fresh.push(s);
      }
    const st = newsAlerts.get();
    if (!fresh.length || !st.list.some((a) => a.active)) return;
    let changed = false;
    const list = st.list.map((a) => {
      if (!a.active) return a;
      const k = a.keyword.toUpperCase();
      const hit = fresh.find((s) => s.headline.toUpperCase().includes(k) || s.tickers.some((t) => t.split(' ')[0] === k));
      if (!hit) return a;
      changed = true;
      toast({ title: `NEWS ALERT · ${a.keyword}`, body: hit.headline.replace(/^\*/, ''), kind: 'alert', command: hit.tickers[0] ? `${hit.tickers[0]} COMPANYNEWS` : `NEWS ${a.keyword}` }, 12000);
      return { ...a, hits: a.hits + 1, lastHit: engine.now(), lastHeadline: hit.headline };
    });
    if (changed) {
      newsAlerts.set((x) => ({ ...x, list }));
      if (settings.get().sound) beep();
    }
  };
  const offNews = news.subscribe(() => check(false));
  const offMarket = marketNews.subscribe(() => check(true));
  return () => {
    offNews();
    offMarket();
  };
}

/**
 * Breaking pop-ups, while "Pop up flash headlines" is on (SETTINGS) in the desktop app: keeps the fast news sources
 * and your favourites' news fresh. Each story about a favourite pops up once and stays until you close it or click
 * it (src/terminal/favalerts.ts), including one published while the app was closed, up to an hour before it
 * opened. Each central bank announcement published while the app is open pops up for a few seconds, at most three
 * a round; more say how many.
 */
function watchBreaking(): () => void {
  if (!newsAvailable()) return () => undefined;
  const started = Date.now();
  // Favourites' stories from the last look before a restart; after pop-ups are switched back on, only new ones.
  let favSince = watchSince(started);
  let flashes = settings.get().newsFlashes;
  const seenBanks = new Set<string>();
  const favDefs = () => favourites.get().ids.map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d);
  const refresh = () => {
    if (!settings.get().newsFlashes) return;
    refreshBreaking();
    refreshSecuritiesNews(favDefs(), LIST_REACH);
    markWatched();
  };
  const check = () => {
    if (!settings.get().newsFlashes) return;
    const now = Date.now();
    const found = favDefs()
      .slice(0, 20)
      .map((def) => ({ def, stories: securityNews(def, LIST_REACH).stories }));
    const added = addFavAlerts(favAlertsFrom(found, storiesFor(BREAKING_SOURCES), favSince, now));
    const banks = news.get().stories.filter((s) => s.topics.includes('CB') && s.time >= started && !seenBanks.has(s.id));
    banks.forEach((s) => seenBanks.add(s.id));
    banks.slice(0, 3).forEach((s) => toast({ title: `BREAKING · ${s.source}`, body: s.headline, command: 'BREAKING', kind: 'news' }, 12000));
    if (banks.length > 3) toast({ title: 'BREAKING', body: `${banks.length - 3} more central bank announcements`, kind: 'news', command: 'BREAKING' }, 12000);
    if ((added.length || banks.length) && settings.get().sound) beep();
  };
  const offSettings = settings.subscribe(() => {
    const on = settings.get().newsFlashes;
    if (on && !flashes) {
      favSince = Date.now();
      refresh();
    }
    flashes = on;
  });
  refresh();
  const timer = setInterval(refresh, 60_000);
  const offMarket = marketNews.subscribe(check);
  const offNews = news.subscribe(check);
  return () => {
    clearInterval(timer);
    offSettings();
    offMarket();
    offNews();
  };
}

/** Starts app-wide background services; returns a cleanup function. */
export function startBackground(): () => void {
  const stops: (() => void)[] = [];
  // Headlines come only from official publishers' feeds (desktop app); nothing is generated anywhere.
  const officialNews = startOfficialNews();
  if (officialNews) stops.push(officialNews);
  ensureRooms();
  stops.push(engine.subscribe(() => checkAlerts()));
  stops.push(watchNews());
  stops.push(watchBreaking());
  const chatTimer = setInterval(chatTick, 20_000);
  stops.push(() => clearInterval(chatTimer));
  stops.push(startLiveFeeds());
  stops.push(startDynamicFeeds());
  stops.push(startYahooData());
  stops.push(startShareCounts());
  stops.push(startKraken());
  stops.push(startCoinGecko());
  stops.push(startTreasury());
  stops.push(startPolicyRates());
  stops.push(startGovYields());
  stops.push(startFred());
  return () => stops.forEach((s) => s());
}
