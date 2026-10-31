// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * Yahoo Finance's streaming quotes for the desktop app: the same push feed
 * Yahoo's own pages use. Each message is a base64 protobuf PricingData record
 * sent when a price changes. The page opens the socket itself; where that is
 * not possible (some proxies), the desktop app's main process relays it.
 */

export interface Tick {
  id: string;
  price: number;
  /** Epoch ms. */
  time: number;
  currency?: string;
  exchange?: string;
  quoteType?: number;
  /** 0 pre-market, 1 regular session, 2 post-market, 3 extended, 4 overnight (absent means 0). */
  marketHours: number;
  changePercent?: number;
  change?: number;
  dayVolume?: number;
  dayHigh?: number;
  dayLow?: number;
  openPrice?: number;
  previousClose?: number;
  openInterest?: number;
  lastSize?: number;
  bid?: number;
  bidSize?: number;
  ask?: number;
  askSize?: number;
  priceHint?: number;
  circulatingSupply?: number;
  marketCap?: number;
}

const FLOAT = new DataView(new ArrayBuffer(8));

function base64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Rounds a float32 price to the digits it can carry, so 336.9599914 reads 336.96. */
export function cleanPrice(x: number, hint?: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(x))) + 1);
  const dec = Math.max(hint ?? 0, Math.min(8, 7 - intDigits));
  const f = 10 ** Math.max(0, dec);
  return Math.round(x * f) / f;
}

/** Decodes one PricingData message (fields per Yahoo's published pricing.proto). */
export function decodeTick(b64: string): Tick | null {
  let b: Uint8Array;
  try {
    b = base64(b64);
  } catch {
    return null;
  }
  let i = 0;
  const varint = (): number => {
    let r = 0;
    let mul = 1;
    for (let k = 0; k < 10 && i < b.length; k++) {
      const x = b[i++];
      r += (x & 0x7f) * mul;
      if (!(x & 0x80)) return r;
      mul *= 128;
    }
    return r;
  };
  // sint64: zigzag. Safe for timestamps and volumes (< 2^53).
  const zigzag = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);
  const t: Partial<Tick> & { marketHours: number } = { marketHours: 0 };
  const text = (len: number) => {
    const s = new TextDecoder().decode(b.subarray(i, i + len));
    i += len;
    return s;
  };
  while (i < b.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) {
      const v = varint();
      switch (field) {
        case 3: t.time = zigzag(v); break;
        case 6: t.quoteType = v; break;
        case 7: t.marketHours = v; break;
        case 9: t.dayVolume = zigzag(v); break;
        case 19: t.openInterest = zigzag(v); break;
        case 22: t.lastSize = zigzag(v); break;
        case 24: t.bidSize = zigzag(v); break;
        case 26: t.askSize = zigzag(v); break;
        case 27: t.priceHint = zigzag(v); break;
        default: break;
      }
    } else if (wire === 5) {
      if (i + 4 > b.length) return null;
      for (let k = 0; k < 4; k++) FLOAT.setUint8(k, b[i + k]);
      const v = FLOAT.getFloat32(0, true);
      i += 4;
      switch (field) {
        case 2: t.price = v; break;
        case 8: t.changePercent = v; break;
        case 10: t.dayHigh = v; break;
        case 11: t.dayLow = v; break;
        case 12: t.change = v; break;
        case 15: t.openPrice = v; break;
        case 16: t.previousClose = v; break;
        case 23: t.bid = v; break;
        case 25: t.ask = v; break;
        default: break;
      }
    } else if (wire === 1) {
      if (i + 8 > b.length) return null;
      for (let k = 0; k < 8; k++) FLOAT.setUint8(k, b[i + k]);
      const v = FLOAT.getFloat64(0, true);
      i += 8;
      if (field === 32) t.circulatingSupply = v;
      else if (field === 33) t.marketCap = v;
    } else if (wire === 2) {
      const len = varint();
      if (i + len > b.length) return null;
      if (field === 1) t.id = text(len);
      else if (field === 4) t.currency = text(len);
      else if (field === 5) t.exchange = text(len);
      else i += len;
    } else {
      return null; // groups are not used by this message
    }
  }
  if (!t.id || t.price == null || !Number.isFinite(t.price) || t.time == null) return null;
  const hint = t.priceHint;
  const clean = (x: number | undefined) => (x == null ? undefined : cleanPrice(x, hint));
  return {
    ...t,
    id: t.id,
    price: cleanPrice(t.price, hint),
    time: t.time,
    dayHigh: clean(t.dayHigh),
    dayLow: clean(t.dayLow),
    openPrice: clean(t.openPrice),
    previousClose: clean(t.previousClose),
    bid: clean(t.bid),
    ask: clean(t.ask),
    change: clean(t.change),
  };
}

type Listener = (t: Tick) => void;

/** Keeps one streaming connection subscribed to a set of symbols, reconnecting as needed. */
export class YahooStream {
  private symbols = new Set<string>();
  private ws: WebSocket | null = null;
  private relay = false;
  private relayOff: (() => void) | null = null;
  private stopped = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastMessage = 0;
  connected = false;

  constructor(private onTick: Listener, private onState: (connected: boolean) => void) {}

  start() {
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.relayOff?.();
    window.arminDesktop?.streamClose?.();
  }

  subscribe(symbols: string[]) {
    const fresh = symbols.filter((s) => !this.symbols.has(s));
    if (!fresh.length) return;
    for (const s of fresh) this.symbols.add(s);
    this.send(fresh);
  }

  private send(symbols: string[]) {
    if (!this.connected || !symbols.length) return;
    // Large subscriptions go in batches; the stream accepts repeated subscribe messages.
    for (let k = 0; k < symbols.length; k += 150) {
      const msg = JSON.stringify({ subscribe: symbols.slice(k, k + 150) });
      if (this.relay) void window.arminDesktop?.streamSend?.(msg);
      else this.ws?.send(msg);
    }
  }

  private handle(data: string) {
    this.lastMessage = Date.now();
    let msg: { message?: string } | null = null;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg?.message) return;
    const t = decodeTick(msg.message);
    if (t) this.onTick(t);
  }

  private opened() {
    this.connected = true;
    this.failures = 0;
    this.onState(true);
    this.send([...this.symbols]);
  }

  private closed() {
    this.connected = false;
    this.onState(false);
    if (this.stopped) return;
    this.failures++;
    // After two failed attempts in the page, the main process opens the stream instead.
    if (!this.relay && this.failures >= 2 && window.arminDesktop?.streamOpen) this.relay = true;
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(6, this.failures));
    this.timer = setTimeout(() => this.connect(), delay);
  }

  private connect() {
    if (this.stopped) return;
    if (this.relay) {
      this.relayOff?.();
      this.relayOff = window.arminDesktop!.onStream!((kind, data) => {
        if (kind === 'open') this.opened();
        else if (kind === 'message' && data) this.handle(data);
        else if (kind === 'close') this.closed();
      });
      void window.arminDesktop!.streamOpen!();
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket('wss://streamer.finance.yahoo.com/?version=2');
    } catch {
      this.closed();
      return;
    }
    this.ws = ws;
    ws.onopen = () => this.opened();
    ws.onmessage = (e) => this.handle(String(e.data));
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.closed();
    };
    ws.onerror = () => ws.close();
  }
}
