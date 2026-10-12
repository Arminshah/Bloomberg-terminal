import { createStore } from '../core/store';
import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { portfolio } from './userdata';
import { toast } from './toasts';

/**
 * Paper-trading order management behind EMSX. Orders fill against the live
 * (or simulated) quote, fills update PORT positions and cash, and the blotter
 * is saved with the rest of the workspace.
 */

export type Side = 'BUY' | 'SELL';
export type OrderType = 'MKT' | 'LMT' | 'STP';
export type Tif = 'DAY' | 'GTC';
export type OrderStatus = 'WORKING' | 'PARTFILL' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';

export interface Fill {
  t: number;
  qty: number;
  px: number;
}

export interface Order {
  id: number;
  sec: string;
  side: Side;
  qty: number;
  type: OrderType;
  limit?: number;
  stop?: number;
  tif: Tif;
  broker: string;
  status: OrderStatus;
  filled: number;
  avgPx: number;
  commission: number;
  created: number;
  updated: number;
  day: number;
  fills: Fill[];
  note?: string;
}

export const BROKERS = ['DMA', 'ARMN ALGO VWAP', 'ARMN ALGO TWAP', 'SIM PRIME'];

export const TRADABLE_CLASSES = new Set(['equity', 'commodity', 'crypto', 'future']);

export const orders = createStore<{ list: Order[]; seq: number }>({ list: [], seq: 1 }, 'orders', 1);

/** Units of underlying per quantity unit (contract size for futures, 1/100 for bond face). */
export function multiplier(d: SecurityDef): number {
  if (d.cls === 'commodity') {
    const m = /([\d,]+)/.exec(d.cmd!.size);
    return m ? Number(m[1].replace(/,/g, '')) : 1;
  }
  if (d.cls === 'bond') return 0.01;
  if (d.fut) return d.fut.multiplier;
  return 1;
}

/** USD value of one unit of price for one unit of quantity. */
export function usdPerPrice(d: SecurityDef): number {
  const ccy = d.ccy === 'GBp' ? 'GBP' : d.ccy === 'USd' ? 'USD' : d.ccy;
  const minor = d.minor ? 0.01 : 1;
  return engine.usdValue(ccy) * minor * multiplier(d);
}

/** Futures (index and commodity generics) are margined: only P&L moves cash. */
export function isMargined(d: SecurityDef): boolean {
  return d.cls === 'future' || d.cls === 'commodity';
}

/** A position's contribution to net asset value in USD. */
export function navValue(d: SecurityDef, qty: number, px: number, cost: number): number {
  const k = usdPerPrice(d);
  return isMargined(d) ? qty * (px - cost) * k : qty * px * k;
}

/** Commission in USD, using typical retail-institutional schedules. */
export function commission(d: SecurityDef, qty: number, px: number): number {
  const q = Math.abs(qty);
  switch (d.cls) {
    case 'equity':
      return Math.max(1, q * 0.005 * (d.country === 'US' ? 1 : 0) + (d.country === 'US' ? 0 : q * px * usdPerPrice(d) * 0.0005));
    case 'crypto':
      return q * px * usdPerPrice(d) * 0.001;
    case 'future':
    case 'commodity':
      return q * 2.25;
    default:
      return 0;
  }
}

/** Smallest quantity step for a security. */
export function lotStep(d: SecurityDef): number {
  return d.cls === 'crypto' ? 0.0001 : 1;
}

/** Net asset value in USD: cash, securities at market and futures at unrealised P&L. */
export function netAssetValue(): number {
  const st = portfolio.get();
  let v = st.cash;
  for (const p of st.positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (d && q) v += navValue(d, p.qty, q.last, p.cost);
  }
  return v;
}

/** Sum of absolute position exposures in USD (futures at full notional). */
export function grossExposure(): number {
  let g = 0;
  for (const p of portfolio.get().positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (d && q) g += Math.abs(p.qty * q.last * usdPerPrice(d));
  }
  return g;
}

export function positionOf(id: string): number {
  return portfolio.get().positions.find((p) => p.id === id)?.qty ?? 0;
}

function update(id: number, fn: (o: Order) => Order) {
  orders.set((s) => ({ ...s, list: s.list.map((o) => (o.id === id ? fn(o) : o)) }));
}

export interface OrderRequest {
  sec: string;
  side: Side;
  qty: number;
  type: OrderType;
  limit?: number;
  stop?: number;
  tif: Tif;
  broker: string;
}

/** Validates and routes an order. Returns the order or an error message. */
export function submitOrder(req: OrderRequest): Order | string {
  const d = engine.get(req.sec);
  if (!d) return `Unknown security ${req.sec}`;
  if (!TRADABLE_CLASSES.has(d.cls)) return `${d.ticker} cannot be traded in EMSX (equities, futures, commodities and crypto only)`;
  const step = lotStep(d);
  if (!(req.qty > 0)) return 'Quantity must be positive';
  if (Math.abs(req.qty / step - Math.round(req.qty / step)) > 1e-6) return `Quantity must be a multiple of ${step}`;
  if (req.type === 'LMT' && !(req.limit! > 0)) return 'Enter a limit price';
  if (req.type === 'STP' && !(req.stop! > 0)) return 'Enter a stop price';
  const q = engine.quote(d.id);
  if (!q) return 'No quote';
  const px = req.type === 'LMT' ? req.limit! : q.last;
  const notional = req.qty * px * usdPerPrice(d);
  const nav = netAssetValue();
  // Gross exposure after the trade may not exceed twice NAV (Reg T style).
  let gross = 0;
  for (const p of portfolio.get().positions) {
    const pd = engine.get(p.id);
    const pq = engine.quote(p.id);
    if (pd && pq) gross += Math.abs((p.id === d.id ? p.qty + (req.side === 'BUY' ? req.qty : -req.qty) : p.qty) * pq.last * usdPerPrice(pd));
  }
  if (!portfolio.get().positions.some((p) => p.id === d.id)) gross += notional;
  if (gross > 2 * nav) return `Rejected: gross exposure ${Math.round(gross).toLocaleString('en-US')} USD would exceed 2x NAV`;
  const now = engine.now();
  const o: Order = {
    id: orders.get().seq,
    sec: d.id,
    side: req.side,
    qty: req.qty,
    type: req.type,
    limit: req.type === 'LMT' ? req.limit : undefined,
    stop: req.type === 'STP' ? req.stop : undefined,
    tif: req.tif,
    broker: req.broker,
    status: 'WORKING',
    filled: 0,
    avgPx: 0,
    commission: 0,
    created: now,
    updated: now,
    day: engine.today,
    fills: [],
  };
  orders.set((s) => ({ list: [o, ...s.list].slice(0, 500), seq: s.seq + 1 }));
  if (leader) processOrders();
  return orders.get().list.find((x) => x.id === o.id)!;
}

export function cancelOrder(id: number): boolean {
  const o = orders.get().list.find((x) => x.id === id);
  if (!o || (o.status !== 'WORKING' && o.status !== 'PARTFILL')) return false;
  update(id, (x) => ({ ...x, status: 'CANCELLED', updated: engine.now() }));
  return true;
}

export function cancelAll(): number {
  let n = 0;
  for (const o of orders.get().list) if (cancelOrder(o.id)) n++;
  return n;
}

/** Books a fill into the portfolio: average cost on adds, realised P&L on reductions. */
function bookFill(d: SecurityDef, side: Side, qty: number, px: number, fee: number) {
  const k = usdPerPrice(d);
  const signed = side === 'BUY' ? qty : -qty;
  portfolio.set((s) => {
    const existing = s.positions.find((p) => p.id === d.id);
    let realised = 0;
    let positions = s.positions;
    if (!existing) {
      positions = [...s.positions, { id: d.id, qty: signed, cost: px }];
    } else {
      const q0 = existing.qty;
      const q1 = q0 + signed;
      let cost = existing.cost;
      if (q0 === 0 || Math.sign(q0) === Math.sign(signed)) {
        cost = (existing.cost * Math.abs(q0) + px * Math.abs(signed)) / Math.abs(q1);
      } else {
        const closed = Math.min(Math.abs(q0), Math.abs(signed));
        realised = closed * (px - existing.cost) * Math.sign(q0) * k;
        if (Math.sign(q1) !== Math.sign(q0) && q1 !== 0) cost = px;
      }
      positions = s.positions.map((p) => (p.id === d.id ? { ...p, qty: Number(q1.toPrecision(12)), cost } : p)).filter((p) => Math.abs(p.qty) > 1e-9);
    }
    // Securities settle the full price; futures settle only the realised P&L.
    const cashMove = isMargined(d) ? realised : -signed * px * k;
    return { ...s, positions, cash: s.cash + cashMove - fee, realised: (s.realised ?? 0) + realised - fee };
  });
}

function fillPrice(o: Order, d: SecurityDef): number | null {
  const q = engine.quote(d.id);
  if (!q) return null;
  // On real data an order works only while its market trades: never at a missing price, and
  // never at the last close of a closed market or at a price that has stopped updating.
  if (engine.realOnly && q.src !== 'LIVE' && q.src !== 'DELAYED') return null;
  const ask = Number.isFinite(q.ask) ? q.ask : q.last;
  const bid = Number.isFinite(q.bid) ? q.bid : q.last;
  const px = o.side === 'BUY' ? ask : bid;
  if (!Number.isFinite(px) || px <= 0) return null;
  if (o.type === 'LMT') {
    if (o.side === 'BUY' && px > o.limit!) return null;
    if (o.side === 'SELL' && px < o.limit!) return null;
    // Price improvement: a resting limit fills at the better of its limit and the market.
    return o.side === 'BUY' ? Math.min(px, o.limit!) : Math.max(px, o.limit!);
  }
  if (o.type === 'STP') {
    const triggered = o.side === 'BUY' ? q.last >= o.stop! : q.last <= o.stop!;
    if (!triggered) return null;
  }
  return px;
}

/** Works every open order against the current quotes. */
export function processOrders() {
  const st = orders.get();
  if (!st.list.some((o) => o.status === 'WORKING' || o.status === 'PARTFILL')) return;
  const now = engine.now();
  for (const o of st.list) {
    if (o.status !== 'WORKING' && o.status !== 'PARTFILL') continue;
    if (o.tif === 'DAY' && o.day !== engine.today) {
      update(o.id, (x) => ({ ...x, status: 'EXPIRED', updated: now }));
      continue;
    }
    const d = engine.get(o.sec);
    if (!d) continue;
    const px = fillPrice(o, d);
    if (px == null) continue;
    const step = lotStep(d);
    // Algorithmic brokers slice; DMA takes up to a few seconds of average volume at once.
    const adv = d.cls === 'crypto' ? (d.adv ?? 0) / Math.max(d.px, 1e-9) : (d.adv ?? 0);
    const perTick = adv / 23_400;
    const cap = o.broker.includes('ALGO') ? Math.max(step, perTick * 0.5) : Math.max(step, perTick * 4);
    const remaining = o.qty - o.filled;
    let qty = Math.min(remaining, Math.max(step, Math.floor(cap / step) * step));
    qty = Number(qty.toPrecision(12));
    if (qty <= 0) continue;
    const fee = commission(d, qty, px);
    bookFill(d, o.side, qty, px, fee);
    const filled = Number((o.filled + qty).toPrecision(12));
    const avgPx = (o.avgPx * o.filled + px * qty) / filled;
    const done = filled >= o.qty - 1e-9;
    update(o.id, (x) => ({ ...x, filled, avgPx, commission: x.commission + fee, status: done ? 'FILLED' : 'PARTFILL', updated: now, fills: [{ t: now, qty, px }, ...x.fills].slice(0, 200) }));
    if (done) {
      toast({ title: 'EMSX FILL', body: `${o.side === 'BUY' ? 'Bought' : 'Sold'} ${filled.toLocaleString('en-US')} ${d.ticker} @ ${avgPx.toFixed(d.dec)}`, kind: 'ok', command: 'EMSX' }, 6000);
    }
  }
}

const LEADER_KEY = 'armin:oms-leader';
const me = Math.random().toString(36).slice(2);
let leader = true;

/** With several windows open, one of them (the leader) works the orders. */
function electLeader() {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    const cur = raw ? (JSON.parse(raw) as { id: string; t: number }) : undefined;
    const now = Date.now();
    if (!cur || cur.id === me || now - cur.t > 3000) {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: me, t: now }));
      leader = true;
    } else leader = false;
  } catch {
    leader = true;
  }
}

/** Starts working orders on every engine tick. */
export function startOms(): () => void {
  electLeader();
  const timer = setInterval(electLeader, 1000);
  const unsub = engine.subscribe(() => {
    if (leader) processOrders();
  });
  return () => {
    clearInterval(timer);
    unsub();
  };
}
