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
import { marketNews, newsAvailable, refreshBreaking, sameTicker, storiesFor, BREAKING_SOURCES, type MarketStory } from '../data/live/marketnews';
import { LIST_REACH, refreshSecuritiesNews, securitiesNews } from '../data/live/secnews';
import type { SecurityDef } from '../data/types';
import { settings } from './settings';
import { toast } from './toasts';

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
  const list = st.list.map((a) => {
    if (!a.active) return a;
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
  if (fired) {
    alerts.set((s) => ({ ...s, list, unseen: s.unseen + fired }));
    if (settings.get().sound) beep();
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
 * and your favourites' news fresh, and pops up each story about a favourite and each central bank announcement
 * published while the app is open. Older stories never pop up, and at most three a round do; more say how many.
 */
function watchBreaking(): () => void {
  if (!newsAvailable()) return () => undefined;
  const since = Date.now();
  const seen = new Set<string>();
  const favDefs = () => favourites.get().ids.map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d);
  const refresh = () => {
    if (!settings.get().newsFlashes) return;
    refreshBreaking();
    refreshSecuritiesNews(favDefs(), LIST_REACH);
  };
  const check = () => {
    if (!settings.get().newsFlashes) return;
    const defs = favDefs();
    const tickers = defs.map((d) => d.ticker.split(' ')[0]);
    const found = securitiesNews(defs, LIST_REACH);
    const about = (s: MarketStory) => found.some((f) => f.id === s.id) || s.tickers.some((t) => tickers.some((x) => sameTicker(t, x)));
    const fresh = [...found, ...storiesFor(BREAKING_SOURCES).filter(about)].filter((s) => s.time >= since && !seen.has(s.id));
    const banks = news.get().stories.filter((s) => s.topics.includes('CB') && s.time >= since && !seen.has(`official:${s.id}`));
    fresh.forEach((s) => seen.add(s.id));
    banks.forEach((s) => seen.add(`official:${s.id}`));
    const pops = [...fresh.map((s) => ({ title: `★ ${s.tickers[0] ?? 'FAVOURITE'} · ${s.publisher}`, body: s.title, command: 'BREAKING FAV' })), ...banks.map((s) => ({ title: `BREAKING · ${s.source}`, body: s.headline, command: 'BREAKING' }))];
    pops.slice(0, 3).forEach((p) => toast({ ...p, kind: 'news' }, 12000));
    if (pops.length > 3) toast({ title: 'BREAKING', body: `${pops.length - 3} more new stories on your favourites and the central banks`, kind: 'news', command: 'BREAKING FAV' }, 12000);
    if (pops.length && settings.get().sound) beep();
  };
  refresh();
  const timer = setInterval(refresh, 60_000);
  const offMarket = marketNews.subscribe(check);
  const offNews = news.subscribe(check);
  return () => {
    clearInterval(timer);
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
