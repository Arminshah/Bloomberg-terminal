import { engine } from './market';

export interface Level {
  px: number;
  size: number;
  orders: number;
}

const state = new Map<string, { tick: number; bid: number[]; ask: number[] }>();

function lot(id: string): number {
  const d = engine.get(id)!;
  if (d.cls === 'crypto') return 0.01;
  if (d.cls === 'fx') return 1_000_000;
  if (d.cls === 'commodity') return 1;
  return d.country === 'US' || d.country === 'CA' ? 100 : d.country === 'JP' ? 100 : 1;
}

function step(id: string): number {
  const d = engine.get(id)!;
  const q = engine.quote(id)!;
  const tick = 10 ** -d.dec;
  if (d.cls === 'crypto') return Math.max(tick, q.last * 0.00005);
  if (d.cls === 'equity') return Math.max(tick, Math.round((q.last * 0.0001) / tick) * tick);
  return tick;
}

/** Simulated limit order book around the current bid/ask. */
export function orderBook(id: string, levels = 10): { bids: Level[]; asks: Level[]; step: number } {
  const d = engine.get(id)!;
  const q = engine.quote(id)!;
  const adv = d.cls === 'fx' ? 4e9 : (d.adv ?? 1e6) / (d.cls === 'crypto' ? d.px : 1);
  const base = Math.max(lot(id), adv / 23_400 / 1.5);
  let st = state.get(id);
  if (!st) {
    st = { tick: -1, bid: [], ask: [] };
    for (let i = 0; i < 25; i++) {
      st.bid.push(base * (0.6 + i * 0.25) * Math.exp(Math.random() - 0.5));
      st.ask.push(base * (0.6 + i * 0.25) * Math.exp(Math.random() - 0.5));
    }
    state.set(id, st);
  }
  if (st.tick !== engine.tickCount) {
    st.tick = engine.tickCount;
    for (const side of [st.bid, st.ask]) {
      for (let i = 0; i < side.length; i++) {
        const target = base * (0.6 + i * 0.25);
        side[i] = Math.max(lot(id), side[i] * Math.exp((Math.random() - 0.5) * 0.35) * 0.9 + target * 0.1);
      }
    }
  }
  const s = step(id);
  const bid = Number.isFinite(q.bid) ? q.bid : q.last - s / 2;
  const ask = Number.isFinite(q.ask) ? q.ask : q.last + s / 2;
  const roundSize = (x: number) => {
    const l = lot(id);
    return l >= 1 ? Math.max(l, Math.round(x / l) * l) : Number(x.toPrecision(3));
  };
  const mk = (side: number[], start: number, dir: -1 | 1): Level[] =>
    side.slice(0, levels).map((sz, i) => ({ px: start + dir * i * s, size: roundSize(sz), orders: Math.max(1, Math.round(Math.sqrt(sz / lot(id)) / 2)) }));
  return { bids: mk(st.bid, bid, -1), asks: mk(st.ask, ask, 1), step: s };
}
