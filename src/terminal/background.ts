import { engine } from '../data/market';
import { news, newsTick, seedNews, type Story } from '../data/news';
import { chatTick, ensureRooms } from '../data/chat';
import { describe } from '../functions/ALRT';
import { startLiveFeeds } from '../data/live/feeds';
import { alerts, newsAlerts } from './userdata';
import { startOms } from './oms';
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
    const hit = a.cond === 'above' ? q.last >= a.value : a.cond === 'below' ? q.last <= a.value : a.cond === 'pctUp' ? q.pct >= a.value : q.pct <= -a.value;
    if (!hit) return a;
    fired++;
    toast({ title: 'ALERT', body: `${d.ticker} ${describe(a.cond, a.value, d.dec)} · last ${q.last.toFixed(d.dec)}`, kind: 'alert', command: `${d.id} GP` }, 12000);
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
      toast({ title: `NEWS ALERT · ${a.keyword}`, body: hit.headline.replace(/^\*/, ''), kind: 'alert', command: hit.tickers[0] ? `${hit.tickers[0]} CN` : `N ${a.keyword}` }, 12000);
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
  seedNews();
  ensureRooms();
  stops.push(engine.subscribe(() => checkAlerts()));
  stops.push(startOms());
  stops.push(watchNews());
  let lastFlash = 0;
  const newsTimer = setInterval(() => {
    const hot = newsTick();
    // At most one flash headline every 15 seconds keeps the screen readable.
    if (settings.get().newsFlashes && hot.length && Date.now() - lastFlash > 15_000) {
      lastFlash = Date.now();
      for (const s of hot.slice(0, 1)) {
        const ticker = s.tickers[0];
        toast({ title: s.source === 'ECO' ? 'ECONOMIC RELEASE' : 'FIRST WORD', body: s.headline.replace(/^\*/, ''), kind: 'news', command: ticker ? `${ticker} CN` : 'TOP' });
      }
    }
  }, 4000);
  stops.push(() => clearInterval(newsTimer));
  const chatTimer = setInterval(chatTick, 20_000);
  stops.push(() => clearInterval(chatTimer));
  stops.push(startLiveFeeds());
  return () => stops.forEach((s) => s());
}
