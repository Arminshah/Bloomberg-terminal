import { fmtBig, fmtBp, fmtNum, fmtPct } from '../core/format';
import { freshnessOf } from './freshness';
import { engine } from './market';
import { periodChange } from './analytics';
import { resolveSecurity, searchSecurities } from './registry';
import { news, shortName } from './news';
import { ecoEvents } from './eco';
import { chats, type ChatRoom } from '../terminal/userdata';

export const CONTACTS: Omit<ChatRoom, 'messages' | 'unread'>[] = [
  { id: 'helpdesk', name: 'ARMN Help Desk', who: 'Help Desk (bot)' },
  { id: 'rates', name: 'Rates Desk', who: 'Rates Desk (sim)' },
  { id: 'fx', name: 'FX Sales', who: 'FX Sales (sim)' },
  { id: 'eq', name: 'Equity Sales Trading', who: 'EQ Sales Trading (sim)' },
  { id: 'crypto', name: 'Digital Assets', who: 'Digital Assets Desk (sim)' },
];

function quoteLine(id: string): string {
  const d = engine.get(id);
  const q = engine.quote(id);
  if (!d || !q) return '';
  if (!Number.isFinite(q.last)) return `No price for ${d.ticker} from the source yet.`;
  // The day's change only against a confirmed previous close, and where the price comes from and how fresh it is.
  const confirmed = Number.isFinite(q.chg) && q.chgCheck !== 'unverified';
  const f = freshnessOf(q, d, Date.now());
  const from = [q.provider, f?.label].filter(Boolean).join(', ');
  const tail = from ? ` · ${from}` : '';
  if (d.quote === 'yield') return `${d.ticker} ${fmtNum(q.last, 3)}%${confirmed ? ` (${fmtBp(q.chg)}bp)` : ''}${tail}`;
  return `${d.ticker} ${fmtNum(q.last, d.dec)}${confirmed ? ` ${fmtPct(q.pct)}` : ' (change not confirmed yet)'}${q.volume ? ` vol ${fmtBig(q.volume)}` : ''}${tail}`;
}

/** Help-desk bot: answers quotes, news, eco and function questions. */
export function botReply(text: string): string {
  const t = text.trim();
  const up = t.toUpperCase();
  if (!t) return '';
  const newsHint = engine.realOnly ? 'news FOMC' : 'news NVDA';
  if (/^(HI|HELLO|HEY)\b/.test(up)) return `Hi. Ask me for a quote (e.g. "AAPL", "px gold"), "${newsHint}", "eco" for the next releases, or "how do I chart?".`;
  if (/HELP|WHAT CAN/.test(up)) return `Try: AAPL · px EURUSD · ${newsHint} · eco · movers · how do I chart · how do I set an alert`;
  if (/HOW.*CHART/.test(up)) return 'Type CHART and a security, e.g. "CHART AAPL", or "CHART AAPL 1D" for today\'s intraday chart.';
  if (/HOW.*ALERT/.test(up)) return 'Type ALERTS and press Enter, then pick the security, a condition and a level. Alerts pop up on any screen while the app is open.';
  if (/HOW.*(PORT|PORTFOLIO)/.test(up)) return 'Type PORTFOLIO and press Enter for holdings, performance and risk. Add positions in the Holdings tab.';
  if (/^ECO|CALENDAR|DATA/.test(up)) {
    const now = engine.now();
    const next = ecoEvents(now, now + 7 * 86_400_000, now).filter((e) => e.relevance >= 3).slice(0, 4);
    // FRED gives US release dates without times; those say the date only.
    return next.length ? `Next key releases: ${next.map((e) => `${e.country} ${e.name} (${e.date ? `${new Date(`${e.date}T12:00:00Z`).toUTCString().slice(0, 11)}, time not published by the source` : `${new Date(e.time).toUTCString().slice(5, 22)} UTC`})`).join('; ')}` : 'No major releases this week.';
  }
  if (/MOVERS|GAINERS|LOSERS/.test(up)) {
    // Only changes against a confirmed previous close count.
    const eq = engine.securities
      .filter((d) => d.cls === 'equity')
      .map((d) => ({ d, p: periodChange(d.id, '1D') }))
      .filter((x) => Number.isFinite(x.p))
      .sort((a, b) => b.p - a.p);
    if (eq.length < 6) return 'Not enough confirmed day changes yet; try MOVERS in a moment.';
    return `Top: ${eq.slice(0, 3).map((x) => `${x.d.ticker} ${fmtPct(x.p, 1)}`).join(', ')} · Bottom: ${eq.slice(-3).map((x) => `${x.d.ticker} ${fmtPct(x.p, 1)}`).join(', ')}`;
  }
  const newsM = /^NEWS\s+(.+)$/i.exec(t);
  if (newsM) {
    const word = newsM[1].trim();
    const d = resolveSecurity(word);
    const stories = news.get().stories;
    const byTicker = d ? stories.find((x) => x.tickers.includes(d.id)) : undefined;
    const byWord = stories.find((x) => x.headline.toUpperCase().includes(word.toUpperCase()));
    const hit = byTicker ?? byWord;
    if (hit) return `${hit.headline.replace(/^\*/, '')} (${hit.source}): type NEWS ${word} for more`;
    return engine.realOnly ? `No recent official announcement mentions "${word}". Company news has no permitted feed here; a company's announcements are in FILINGS.` : `No recent headlines for ${d?.ticker ?? word}.`;
  }
  const px = /^(?:PX|PRICE|QUOTE|Q)\s+(.+)$/i.exec(t);
  const target = px ? px[1] : t;
  const d = resolveSecurity(target) ?? (target.length >= 2 ? searchSecurities(target, 1)[0]?.def : undefined);
  if (d) return quoteLine(d.id);
  return "I didn't catch that. Type HELP for what I can do.";
}

function deskColor(room: string): string | null {
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  switch (room) {
    case 'rates': {
      const y2 = engine.quote('USGG2YR Index')!;
      const y10 = engine.quote('USGG10YR Index')!;
      const curve = (y10.last - y2.last) * 100;
      return pick([
        `UST 2y ${fmtNum(y2.last, 3)} (${fmtBp(y2.chg)}), 10y ${fmtNum(y10.last, 3)} (${fmtBp(y10.chg)}). 2s10s at ${fmtNum(curve, 1)}bp.`,
        `Seeing ${y10.chg > 0 ? 'real money selling in the belly' : 'buying from asset managers out the curve'}; 10y ${fmtNum(y10.last, 3)}.`,
        `Bunds ${fmtNum(engine.quote('GDBR10 Index')!.last, 3)}, gilts ${fmtNum(engine.quote('GUKG10 Index')!.last, 3)}. Spread to UST ${fmtNum((y10.last - engine.quote('GDBR10 Index')!.last) * 100, 0)}bp.`,
      ]);
    }
    case 'fx': {
      const e = engine.quote('EURUSD Curncy')!;
      const j = engine.quote('USDJPY Curncy')!;
      return pick([
        `EURUSD ${fmtNum(e.last, 4)} (${fmtPct(e.pct)}), range ${fmtNum(e.low, 4)}-${fmtNum(e.high, 4)}. Interest both ways.`,
        `USDJPY ${fmtNum(j.last, 2)} ${j.pct >= 0 ? 'grinding higher' : 'offered'}; DXY ${fmtNum(engine.quote('DXY Curncy')!.last, 2)}.`,
        `Cable ${fmtNum(engine.quote('GBPUSD Curncy')!.last, 4)}, AUD ${fmtNum(engine.quote('AUDUSD Curncy')!.last, 4)}. Vols quiet.`,
      ]);
    }
    case 'eq': {
      const spx = engine.quote('SPX Index')!;
      const eq = engine.securities.filter((d) => d.cls === 'equity' && d.country === 'US').map((d) => ({ d, p: engine.quote(d.id)!.pct })).sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
      const top = eq[0];
      return pick([
        `SPX ${fmtNum(spx.last, 2)} ${fmtPct(spx.pct)}. Biggest mover ${shortName(top.d)} ${fmtPct(top.p, 1)}.`,
        `Flow skewed to ${spx.pct >= 0 ? 'buyers' : 'sellers'} in mega-cap tech; NDX ${fmtPct(engine.quote('NDX Index')!.pct)}.`,
        `VIX ${fmtNum(engine.quote('VIX Index')!.last, 2)}. ${top.d.ticker} ${fmtPct(top.p, 1)} on ${fmtBig(engine.quote(top.d.id)!.volume)} shares.`,
      ]);
    }
    case 'crypto': {
      const b = engine.quote('XBTUSD Curncy')!;
      const e = engine.quote('XETUSD Curncy')!;
      return pick([
        `BTC ${fmtNum(b.last, 0)} (${fmtPct(b.pct)}), ETH ${fmtNum(e.last, 2)} (${fmtPct(e.pct)}).`,
        `ETH/BTC ${fmtNum(e.last / b.last, 5)}. BTC month to date ${fmtPct(periodChange('XBTUSD Curncy', '1M'), 1)}.`,
      ]);
    }
    default:
      return null;
  }
}

function now() {
  return Date.now();
}

/** Contacts on this app: the desktop app has no simulated desks, only the help desk bot. */
export function contacts() {
  return engine.realOnly ? CONTACTS.filter((c) => c.id === 'helpdesk') : CONTACTS;
}

export function ensureRooms() {
  const st = chats.get();
  const have = new Set(st.rooms.map((r) => r.id));
  const missing = contacts().filter((c) => !have.has(c.id));
  if (!missing.length) return;
  let seq = st.seq;
  const rooms = [
    ...st.rooms,
    ...missing.map((c) => ({
      ...c,
      unread: c.id === 'helpdesk' ? 1 : 0,
      messages:
        c.id === 'helpdesk'
          ? [{ id: seq++, from: c.who, text: engine.realOnly ? 'Welcome to Armin Terminal. I am a bot that answers quick questions from the data the app has loaded: try "AAPL", "news FOMC" or "eco".' : 'Welcome to Armin Terminal. I can answer quick questions: try "AAPL", "news NVDA" or "eco". Desk channels post simulated market color during the session.', at: now() }]
          : [],
    })),
  ];
  chats.set({ ...st, rooms, active: st.active || 'helpdesk', seq });
}

export function postMessage(roomId: string, from: string, text: string) {
  chats.set((s) => {
    const seq = s.seq + 1;
    return {
      ...s,
      seq,
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, messages: [...r.messages, { id: seq, from, text, at: now() }].slice(-200), unread: from === 'ME' ? r.unread : r.unread + 1 } : r)),
    };
  });
}

/** Called periodically: desks post market color now and then. */
export function chatTick() {
  // Desk color is written by the simulator; the desktop app has no simulated desks.
  if (engine.realOnly || Math.random() > 0.18) return;
  const desks = ['rates', 'fx', 'eq', 'crypto'];
  const room = desks[Math.floor(Math.random() * desks.length)];
  const text = deskColor(room);
  const c = CONTACTS.find((x) => x.id === room)!;
  if (text) postMessage(room, c.who, text);
}
