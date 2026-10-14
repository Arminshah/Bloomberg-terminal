import { engine } from '../data/market';
import { news, type Story } from '../data/news';
import { chatTick, ensureRooms } from '../data/chat';
import { describe } from '../functions/ALRT';
import { startLiveFeeds } from '../data/live/feeds';
import { startDynamicFeeds } from '../data/live/lookup';
import { startYahooData } from '../data/live/yahoo';
import { startTreasury } from '../data/live/ust';
import { startPolicyRates } from '../data/live/policy';
import { startGovYields } from '../data/live/govyields';
import { startFred } from '../data/live/fred';
import { startOfficialNews } from '../data/live/officialnews';
import { startKraken } from '../data/live/kraken';
import { startCoinGecko } from '../data/live/coingecko';
import { alerts, newsAlerts } from './userdata';
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

/** Keyword news alerts: any new headline or ticker containing a watched word. */
function watchNews(): () => void {
  const seen = new Set(news.get().stories.map((s) => s.id));
  return news.subscribe(() => {
    const fresh: Story[] = [];
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
  });
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
  const chatTimer = setInterval(chatTick, 20_000);
  stops.push(() => clearInterval(chatTimer));
  stops.push(startLiveFeeds());
  stops.push(startDynamicFeeds());
  stops.push(startYahooData());
  stops.push(startKraken());
  stops.push(startCoinGecko());
  stops.push(startTreasury());
  stops.push(startPolicyRates());
  stops.push(startGovYields());
  stops.push(startFred());
  return () => stops.forEach((s) => s());
}
