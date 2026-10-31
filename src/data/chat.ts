// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fmtBig, fmtBp, fmtNum, fmtPct } from '../core/format';
import { engine } from './market';
import { periodChange } from './analytics';
import { shortName } from './news';
import { chats, type ChatMessage, type ChatRoom } from '../terminal/userdata';
import type { Reply } from './assistant/answers';
import { claudeReply } from './assistant/claude';
import { localReply } from './assistant/local';

export const CONTACTS: Omit<ChatRoom, 'messages' | 'unread'>[] = [
  { id: 'helpdesk', name: 'ARMN Help Desk', who: 'Help Desk (bot)' },
  { id: 'rates', name: 'Rates Desk', who: 'Rates Desk (sim)' },
  { id: 'fx', name: 'FX Sales', who: 'FX Sales (sim)' },
  { id: 'eq', name: 'Equity Sales Trading', who: 'EQ Sales Trading (sim)' },
  { id: 'crypto', name: 'Digital Assets', who: 'Digital Assets Desk (sim)' },
];

/**
 * The help desk's answer to a message: Claude's, when an Anthropic key is set and Claude is switched on (desktop
 * app), else the built-in assistant's. `history` is the conversation before the message.
 */
export async function botReply(text: string, room: string, history: ChatMessage[] = [], onTool?: (name: string) => void): Promise<Reply & { model?: string }> {
  if (room === 'helpdesk') {
    const viaClaude = await claudeReply(text, history, onTool).catch((err: unknown) => ({ text: `Claude could not be asked: ${err instanceof Error ? err.message : String(err)}` }));
    if (viaClaude) return viaClaude;
  }
  return localReply(text, room);
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

export function postMessage(roomId: string, from: string, text: string, extra: Pick<ChatMessage, 'commands' | 'links'> = {}) {
  const commands = extra.commands?.length ? extra.commands : undefined;
  const links = extra.links?.length ? extra.links : undefined;
  chats.set((s) => {
    const seq = s.seq + 1;
    return {
      ...s,
      seq,
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, messages: [...r.messages, { id: seq, from, text, at: now(), ...(commands ? { commands } : {}), ...(links ? { links } : {}) }].slice(-200), unread: from === 'ME' ? r.unread : r.unread + 1 } : r)),
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
