import { fmtBig, fmtBp, fmtNum, fmtPct } from '../core/format';
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
  if (d.quote === 'yield') return `${d.ticker} ${fmtNum(q.last, 3)}% (${fmtBp(q.chg)}bp)`;
  return `${d.ticker} ${fmtNum(q.last, d.dec)} ${fmtPct(q.pct)}${q.volume ? ` vol ${fmtBig(q.volume)}` : ''}`;
}

/** Help-desk bot: answers quotes, news, eco and function questions. */
export function botReply(text: string): string {
  const t = text.trim();
  const up = t.toUpperCase();
  if (!t) return '';
  if (/^(HI|HELLO|HEY)\b/.test(up)) return 'Hi. Ask me for a quote (e.g. "AAPL", "px gold"), "news NVDA", "eco" for the next releases, or "how do I chart?".';
  if (/HELP|WHAT CAN/.test(up)) return 'Try: AAPL · px EURUSD · news TSLA · eco · movers · how do I chart · how do I set an alert';
  if (/HOW.*CHART/.test(up)) return 'Load a security and type GP, e.g. "AAPL US <EQUITY> GP <GO>" or simply "AAPL GP". GIP gives intraday.';
  if (/HOW.*ALERT/.test(up)) return 'Type ALRT <GO>, pick the security, a condition and a level. Alerts fire as a pop-up even when ALRT is closed.';
  if (/HOW.*(PORT|PORTFOLIO)/.test(up)) return 'PORT <GO> shows holdings, performance and risk. Add positions in the Holdings tab.';
  if (/^ECO|CALENDAR|DATA/.test(up)) {
    const now = engine.now();
    const next = ecoEvents(now, now + 7 * 86_400_000, now).filter((e) => e.relevance >= 3).slice(0, 4);
    return next.length ? `Next key releases: ${next.map((e) => `${e.country} ${e.name} (${new Date(e.time).toUTCString().slice(5, 22)} UTC)`).join('; ')}` : 'No major releases this week.';
  }
  if (/MOVERS|GAINERS|LOSERS/.test(up)) {
    const eq = engine.securities.filter((d) => d.cls === 'equity').map((d) => ({ d, p: engine.quote(d.id)!.pct })).sort((a, b) => b.p - a.p);
    return `Top: ${eq.slice(0, 3).map((x) => `${x.d.ticker} ${fmtPct(x.p, 1)}`).join(', ')} · Bottom: ${eq.slice(-3).map((x) => `${x.d.ticker} ${fmtPct(x.p, 1)}`).join(', ')}`;
  }
  const newsM = /^NEWS\s+(.+)$/i.exec(t);
  if (newsM) {
    const d = resolveSecurity(newsM[1]) ?? searchSecurities(newsM[1], 1)[0]?.def;
    if (!d) return `I could not find "${newsM[1]}".`;
    const s = news.get().stories.find((x) => x.tickers.includes(d.id));
    return s ? `${s.headline} — type ${d.ticker.split(' ')[0]} CN <GO> for more` : `No recent headlines for ${d.ticker}.`;
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

export function ensureRooms() {
  const st = chats.get();
  const have = new Set(st.rooms.map((r) => r.id));
  const missing = CONTACTS.filter((c) => !have.has(c.id));
  if (!missing.length) return;
  let seq = st.seq;
  const rooms = [
    ...st.rooms,
    ...missing.map((c) => ({
      ...c,
      unread: c.id === 'helpdesk' ? 1 : 0,
      messages:
        c.id === 'helpdesk'
          ? [{ id: seq++, from: c.who, text: 'Welcome to Armin Terminal. I can answer quick questions: try "AAPL", "news NVDA" or "eco". Desk channels post simulated market color during the session.', at: now() }]
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
  if (Math.random() > 0.18) return;
  const desks = ['rates', 'fx', 'eq', 'crypto'];
  const room = desks[Math.floor(Math.random() * desks.length)];
  const text = deskColor(room);
  const c = CONTACTS.find((x) => x.id === room)!;
  if (text) postMessage(room, c.who, text);
}
