import { hashString, normal } from '../core/rng';
import { cleanFromYield, settlementDate, type BondTerms } from '../finance/bonds';
import { buildGrid, DAY_MS, dayNum, dayStart, isBusinessDay, isoToDay, MINUTE_MS, prevBusinessDay } from './calendar';
import { factorLoadings, idioWeight, type Loadings } from './factors';
import { makeSeries, type Series } from './series';
import type { Quote, SecurityDef, Trade } from './types';
import { ANCHORS, buildUniverse, CURRENCY_DEFS, CURRENCY_INFO } from './universe';

const HIST_YEARS = 10;
const MINUTES = 1440;
const TRADE_BUFFER = 400;

type Kind = 'base' | 'pair' | 'dxy' | 'bond';

interface Intra {
  day: number;
  /** Deterministic path points: x[k] is the level at the start of minute k. */
  x: Float64Array;
  filled: number;
  series: Series;
  /** Minute index of the bar currently forming (sim) or -1 for live series. */
  cur: number;
  totalVol: number;
}

interface LiveBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface State {
  def: SecurityDef;
  kind: Kind;
  seed: number;
  load: Loadings;
  idio: number;
  additive: boolean;
  allDays: boolean;
  drift: number;
  revert?: { target: number; kappa: number };
  daily: Series | null;
  dailyKey: string;
  intra: Intra | null;
  /** Externally supplied closes (day -> level) that the history must pass through. */
  extAnchors: Map<number, number>;
  /** Externally supplied full daily bars. */
  extBars: Map<number, LiveBar>;
  live: boolean;
  liveIntraday: boolean;
  trades: Trade[];
  last: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  volume: number;
  pair?: { base: string; quote: string };
  bond?: { terms: BondTerms; curveId: string; spread: number; issueDay: number };
}

export type EngineListener = (changed: Set<string>) => void;

const DXY_WEIGHTS: [string, number][] = [
  ['EUR', -0.576], ['JPY', 0.136], ['GBP', -0.119], ['CAD', 0.091], ['SEK', 0.042], ['CHF', 0.036],
];
const DXY_CONST = 50.14348112;

const VENUES_US = ['Q', 'N', 'Z', 'P', 'K', 'D', 'V', 'J'];
const VENUES: Record<string, string[]> = {
  US: VENUES_US, GB: ['L', 'B', 'X'], DE: ['X', 'F', 'B'], FR: ['P', 'B', 'X'], NL: ['A', 'B'], CH: ['S', 'B'],
  JP: ['T', 'J'], HK: ['H'], TW: ['T'], KR: ['K'], IN: ['N', 'B'], AU: ['A', 'C'], CA: ['T', 'A', 'O'], DK: ['C', 'B'],
};

export class MarketEngine {
  readonly defs: SecurityDef[];
  readonly byId = new Map<string, SecurityDef>();
  private states = new Map<string, State>();
  private quotes = new Map<string, Quote>();
  private listeners = new Set<EngineListener>();
  private minuteFactor = new Map<number, Float64Array>();
  private minuteFactorDay = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private derivedCache = new Map<string, { key: string; series: Series }>();
  today: number;
  /** Bumps whenever histories are rebuilt (live anchors, day rollover). */
  version = 0;
  tickCount = 0;
  tickMs = 1000;
  now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
    const t = now();
    this.today = dayNum(t);
    this.defs = buildUniverse(new Date(dayStart(this.today)));
    for (const d of this.defs) this.byId.set(d.id, d);
    for (const c of CURRENCY_DEFS) this.addState(c, 'base');
    for (const d of this.defs) {
      if (d.fx && d.cls === 'fx') this.addState(d, 'pair');
      else if (d.id === 'DXY Curncy') this.addState(d, 'dxy');
      else if (d.bond) this.addState(d, 'bond');
      else this.addState(d, 'base');
    }
    this.refreshAll(t, false);
  }

  private addState(def: SecurityDef, kind: Kind) {
    const info = def.id.startsWith('CCY:') ? CURRENCY_INFO.get(def.ticker) : undefined;
    const load = kind === 'base' ? factorLoadings(def, info?.risk ?? 0) : [];
    const st: State = {
      def,
      kind,
      seed: hashString(def.id),
      load,
      idio: kind === 'base' ? idioWeight(load) : 0,
      additive: def.quote === 'yield',
      allDays: def.cls === 'crypto',
      drift: def.cls === 'equity' || def.cls === 'index' ? 0.07 : def.cls === 'crypto' ? (def.ticker === 'XBTUSD' ? 0.8 : 0.6) : 0,
      daily: null,
      dailyKey: '',
      intra: null,
      extAnchors: new Map(),
      extBars: new Map(),
      live: false,
      liveIntraday: false,
      trades: [],
      last: def.px,
      dayHigh: def.px,
      dayLow: def.px,
      dayOpen: def.px,
      prevClose: def.px,
      volume: 0,
    };
    if (def.ticker === 'VIX') st.revert = { target: Math.log(17), kappa: 0.025 };
    if (def.ticker === 'HKD') st.revert = { target: Math.log(1 / 7.82), kappa: 0.08 };
    if (def.cls === 'rate') st.revert = { target: Math.max(def.px * 0.6, 0.5), kappa: 0.0015 };
    if (kind === 'pair') {
      const id = (c: string) => (c === 'USD' ? 'USD' : `CCY:${c}`);
      st.pair = { base: id(def.fx!.base), quote: id(def.fx!.quote) };
    }
    if (kind === 'bond') {
      const b = def.bond!;
      st.bond = {
        terms: { coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: b.freq },
        curveId: b.curve,
        spread: b.spread,
        issueDay: isoToDay(b.issue),
      };
    }
    this.states.set(def.id, st);
  }

  // ---------------------------------------------------------------- queries

  get(id: string): SecurityDef | undefined {
    return this.byId.get(id);
  }

  quote(id: string): Quote | undefined {
    return this.quotes.get(id);
  }

  isLive(id: string): boolean {
    const st = this.states.get(id);
    return !!st && st.live;
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Daily bars including today's forming bar as the last element. */
  daily(id: string): Series {
    const st = this.states.get(id);
    if (!st) return makeSeries(0, DAY_MS);
    if (st.kind === 'base') {
      this.ensureDaily(st);
      return st.daily!;
    }
    return this.derivedDaily(st);
  }

  /** Today's intraday bars (1 minute for simulated lines). */
  intraday(id: string): Series {
    const st = this.states.get(id);
    if (!st) return makeSeries(0, MINUTE_MS);
    if (st.kind === 'base') {
      this.ensureIntra(st, this.now());
      return st.intra!.series;
    }
    return this.derivedIntraday(st);
  }

  trades(id: string): Trade[] {
    return this.states.get(id)?.trades ?? [];
  }

  /** USD value of one unit of a currency (live simulated). */
  usdValue(code: string): number {
    if (code === 'USD') return 1;
    if (code === 'GBp') return this.usdValue('GBP') / 100;
    if (code === 'USd') return 0.01;
    if (code === 'CNY') return this.usdValue('CNH');
    return this.states.get(`CCY:${code}`)?.last ?? NaN;
  }

  /** Previous close (last completed daily bar). */
  prevClose(id: string): number {
    return this.states.get(id)?.prevClose ?? NaN;
  }

  lastHistDay(allDays: boolean): number {
    return allDays ? this.today - 1 : prevBusinessDay(this.today);
  }

  // ------------------------------------------------------------ simulation

  start(intervalMs = this.tickMs) {
    this.stop();
    this.tickMs = intervalMs;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const t = this.now();
    if (dayNum(t) !== this.today) {
      this.rollover(t);
      return;
    }
    this.refreshAll(t, true);
  }

  private rollover(t: number) {
    this.today = dayNum(t);
    this.version++;
    this.derivedCache.clear();
    for (const st of this.states.values()) {
      st.daily = null;
      st.dailyKey = '';
      // Rolling feed windows (e.g. 24h of 5-minute crypto bars) survive midnight.
      const rolling = st.liveIntraday && st.intra && st.intra.series.span !== MINUTE_MS;
      if (rolling) {
        st.intra!.day = this.today;
      } else {
        st.intra = null;
        st.live = false;
        st.liveIntraday = false;
        st.trades = [];
      }
    }
    this.refreshAll(t, false);
  }

  private refreshAll(t: number, jitter: boolean) {
    const changed = new Set<string>();
    this.tickCount++;
    for (const st of this.states.values()) {
      if (st.kind !== 'base') continue;
      if (jitter && st.live) continue;
      if (jitter && Math.random() > this.tickProbability(st)) continue;
      this.updateBase(st, t, jitter);
      changed.add(st.def.id);
    }
    for (const st of this.states.values()) {
      if (st.kind === 'base') continue;
      if (jitter && Math.random() > this.tickProbability(st)) continue;
      this.updateDerived(st, t);
      changed.add(st.def.id);
    }
    for (const id of changed) {
      const st = this.states.get(id)!;
      if (id.startsWith('CCY:')) continue;
      this.publishQuote(st, t);
      if (jitter) this.maybeTrade(st, t);
    }
    for (const fn of this.listeners) fn(changed);
  }

  private tickProbability(st: State): number {
    switch (st.def.cls) {
      case 'fx':
        return 0.85;
      case 'crypto':
        return 0.9;
      case 'equity':
        return 0.55 + Math.min(0.35, (st.def.adv ?? 0) / 1e8);
      case 'index':
        return 0.9;
      case 'commodity':
        return 0.6;
      case 'rate':
        return 0.45;
      case 'bond':
        return 0.45;
      default:
        return 0.5;
    }
  }

  private enc(st: State, v: number) {
    return st.additive ? v : Math.log(v);
  }

  private dec(st: State, x: number) {
    return st.additive ? x : Math.exp(x);
  }

  private sigmaDaily(st: State) {
    return st.def.vol / Math.sqrt(st.allDays ? 365 : 252);
  }

  private regimeCache = new Map<number, number>();

  /** Smooth volatility regime: quiet and turbulent stretches. */
  private regime(st: State, day: number): number {
    let g = this.regimeCache.get(day);
    if (g === undefined) {
      g = 0.2 * valueNoise(0x51ed, day / 23);
      this.regimeCache.set(day, g);
    }
    return Math.exp(g + 0.08 * valueNoise(st.seed, day / 37) - 0.015);
  }

  /** Shock for one daily step (excluding drift and mean reversion). */
  private dayShock(st: State, day: number, reg = this.regime(st, day)): number {
    let z = 0;
    for (const [f, l] of st.load) z += l * normal(f, day, 1);
    z += st.idio * normal(st.seed, day, 2);
    return this.sigmaDaily(st) * reg * z;
  }

  /**
   * Previous close without building the full history: walk forward from the
   * most recent anchor. Must agree with ensureDaily (tested).
   */
  private fastPrevClose(st: State): number {
    const lastDay = this.lastHistDay(st.allDays);
    const onGrid = (d: number) => {
      let x = Math.min(d, lastDay);
      if (!st.allDays) while (!isBusinessDay(x)) x--;
      return x;
    };
    let best = -Infinity;
    let level = NaN;
    for (const [d, v] of st.extAnchors) {
      const g = onGrid(d);
      if (g > best) {
        best = g;
        level = v;
      }
    }
    const snap = ANCHORS.get(st.def.id);
    if (snap) {
      for (const [iso, v] of snap) {
        const g = onGrid(isoToDay(iso));
        if (g > best) {
          best = g;
          level = v;
        }
      }
    }
    if (!Number.isFinite(best)) return st.def.px;
    let x = this.enc(st, level);
    const perDayDrift = st.drift / (st.allDays ? 365 : 252);
    for (let d = best + 1; d <= lastDay; d++) {
      if (!st.allDays && !isBusinessDay(d)) continue;
      x = x + this.dayShock(st, d) + perDayDrift + this.revertStep(st, x, 1);
    }
    return this.floor(st, this.dec(st, x));
  }

  /** Soft floor for series that should not print absurd lows (VIX). */
  private floor(st: State, v: number): number {
    if (st.def.ticker !== 'VIX' || v >= 10) return v;
    return 10 - (10 - v) * 0.3;
  }

  private minuteFactors(f: number): Float64Array {
    if (this.minuteFactorDay !== this.today) {
      this.minuteFactor.clear();
      this.minuteFactorDay = this.today;
    }
    let arr = this.minuteFactor.get(f);
    if (!arr) {
      arr = new Float64Array(MINUTES);
      for (let m = 0; m < MINUTES; m++) arr[m] = normal(f, this.today, 10_000 + m);
      this.minuteFactor.set(f, arr);
    }
    return arr;
  }

  private revertStep(st: State, x: number, perDay: number): number {
    if (!st.revert) return 0;
    return st.revert.kappa * perDay * (st.revert.target - x);
  }

  // ---------------------------------------------------------------- history

  private anchorsFor(st: State, grid: Int32Array): Map<number, number> {
    const out = new Map<number, number>();
    const first = grid[0];
    const last = grid[grid.length - 1];
    const indexOf = (day: number) => {
      // Largest grid index with grid[i] <= day.
      let lo = 0;
      let hi = grid.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (grid[mid] <= day) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans;
    };
    const add = (day: number, level: number, override: boolean) => {
      if (day < first || !Number.isFinite(level) || level <= (st.additive ? -50 : 0)) return;
      const idx = indexOf(Math.min(day, last));
      if (idx < 0) return;
      if (!override && out.has(idx)) return;
      out.set(idx, this.enc(st, level));
    };
    for (const [d, v] of st.extAnchors) add(d, v, true);
    const snap = ANCHORS.get(st.def.id);
    if (snap) for (const [iso, v] of snap) add(isoToDay(iso), v, false);
    if (out.size === 0) out.set(grid.length - 1, this.enc(st, st.def.px));
    return out;
  }

  private ensureDaily(st: State) {
    const key = `${this.today}:${this.version}`;
    if (st.daily && st.dailyKey === key) return;
    const lastDay = this.lastHistDay(st.allDays);
    const n = Math.round(HIST_YEARS * (st.allDays ? 365 : 261));
    const grid = buildGrid(lastDay, n, st.allDays);
    const r = new Float64Array(n);
    const reg = new Float64Array(n);
    const perDayDrift = st.drift / (st.allDays ? 365 : 252);
    for (let i = 0; i < n; i++) reg[i] = this.regime(st, grid[i]);
    for (let i = 1; i < n; i++) r[i] = this.dayShock(st, grid[i], reg[i]) + perDayDrift;
    const anchors = this.anchorsFor(st, grid);
    const idx = [...anchors.keys()].sort((a, b) => b - a);
    const x = new Float64Array(n);
    const a0 = idx[0];
    x[a0] = anchors.get(a0)!;
    for (let i = a0 + 1; i < n; i++) x[i] = x[i - 1] + r[i] + this.revertStep(st, x[i - 1], 1);
    for (let j = 0; j < idx.length - 1; j++) {
      const hi = idx[j];
      const lo = idx[j + 1];
      x[lo] = anchors.get(lo)!;
      let sum = 0;
      for (let k = lo + 1; k <= hi; k++) sum += r[k];
      const c = (x[hi] - x[lo] - sum) / (hi - lo);
      for (let k = lo + 1; k < hi; k++) x[k] = x[k - 1] + r[k] + c;
    }
    const aLast = idx[idx.length - 1];
    for (let i = aLast - 1; i >= 0; i--) x[i] = x[i + 1] - r[i + 1] + this.revertStep(st, x[i + 1], 1);

    const s = makeSeries(n + 1, DAY_MS);
    const sd = this.sigmaDaily(st);
    const adv = this.advFor(st);
    for (let i = 0; i < n; i++) {
      const day = grid[i];
      const c = this.floor(st, this.dec(st, x[i]));
      const prev = i > 0 ? this.floor(st, this.dec(st, x[i - 1])) : c;
      const rg = reg[i];
      const gap = sd * rg * 0.22 * normal(st.seed, day, 3);
      const o = this.floor(st, st.additive ? prev + gap : prev * Math.exp(gap));
      const up = sd * rg * 0.55 * Math.abs(normal(st.seed, day, 4));
      const dn = sd * rg * 0.55 * Math.abs(normal(st.seed, day, 5));
      s.t[i] = dayStart(day);
      s.o[i] = o;
      s.c[i] = c;
      s.h[i] = st.additive ? Math.max(o, c) + up : Math.max(o, c) * Math.exp(up);
      s.l[i] = st.additive ? Math.min(o, c) - dn : Math.min(o, c) * Math.exp(-dn);
      const move = Math.min(3, Math.abs(i > 0 ? x[i] - x[i - 1] : 0) / (sd * rg || 1));
      s.v[i] = adv > 0 ? Math.round((adv * Math.exp(0.3 * normal(st.seed, day, 6) - 0.045) * (0.7 + 0.6 * move)) / 1.18) : 0;
      const ext = st.extBars.get(day);
      if (ext) {
        s.o[i] = ext.o;
        s.h[i] = ext.h;
        s.l[i] = ext.l;
        s.c[i] = ext.c;
        if (ext.v > 0) s.v[i] = ext.v;
      }
    }
    s.length = n + 1;
    st.daily = s;
    st.dailyKey = key;
    st.prevClose = s.c[n - 1];
    this.writeTodayBar(st);
  }

  private advFor(st: State): number {
    const adv = st.def.adv ?? 0;
    if (st.def.cls === 'crypto') return adv / Math.max(st.def.px, 1e-9);
    if (st.def.cls === 'index' && st.def.ticker === 'VIX') return 0;
    return adv;
  }

  /** Today's forming bar mirrors the intraday state. */
  private writeTodayBar(st: State) {
    const s = st.daily;
    if (!s) return;
    const n = s.length - 1;
    s.t[n] = dayStart(this.today);
    s.o[n] = st.dayOpen;
    s.h[n] = st.dayHigh;
    s.l[n] = st.dayLow;
    s.c[n] = st.last;
    s.v[n] = st.volume;
  }

  // --------------------------------------------------------------- intraday

  private ensureIntra(st: State, t: number) {
    if (!st.intra || st.intra.day !== this.today) {
      const key = `${this.today}:${this.version}`;
      const prev = st.daily && st.dailyKey === key ? st.daily.c[st.daily.length - 2] : this.fastPrevClose(st);
      st.prevClose = prev;
      const sd = this.sigmaDaily(st);
      const gap = sd * this.regime(st, this.today) * 0.22 * normal(st.seed, this.today, 3);
      const open = st.additive ? prev + gap : prev * Math.exp(gap);
      const x = new Float64Array(MINUTES + 1);
      x[0] = this.enc(st, open);
      st.intra = { day: this.today, x, filled: 1, series: makeSeries(MINUTES + 1, MINUTE_MS), cur: -1, totalVol: 0 };
      st.dayOpen = open;
      st.dayHigh = open;
      st.dayLow = open;
      st.volume = 0;
      st.last = open;
      st.liveIntraday = false;
    }
    if (st.liveIntraday) return;
    const m = Math.min(MINUTES - 1, Math.floor((t - dayStart(this.today)) / MINUTE_MS));
    this.fillPath(st, m + 1);
    const it = st.intra!;
    const s = it.series;
    const sm = (this.sigmaDaily(st) * this.regime(st, this.today)) / Math.sqrt(MINUTES);
    const advMin = this.advFor(st) / MINUTES;
    // Finalise completed minutes and open the current one.
    for (let k = Math.max(0, it.cur); k <= m; k++) {
      const o = this.dec(st, it.x[k]);
      const c = this.dec(st, it.x[k + 1]);
      const up = sm * 0.6 * Math.abs(normal(st.seed, this.today, 30_000 + k));
      const dn = sm * 0.6 * Math.abs(normal(st.seed, this.today, 40_000 + k));
      const vol = advMin > 0 ? Math.round(advMin * Math.exp(0.5 * normal(st.seed, this.today, 50_000 + k) - 0.125)) : 0;
      const complete = k < m;
      const hi = st.additive ? Math.max(o, c) + up : Math.max(o, c) * Math.exp(up);
      const lo = st.additive ? Math.min(o, c) - dn : Math.min(o, c) * Math.exp(-dn);
      if (k === it.cur && complete) {
        // The bar that was forming: keep observed extremes, settle the close.
        s.c[k] = c;
        s.h[k] = Math.max(s.h[k], hi, c);
        s.l[k] = Math.min(s.l[k], lo, c);
        it.totalVol += vol - s.v[k];
        s.v[k] = vol;
      } else if (k !== it.cur) {
        s.t[k] = dayStart(this.today) + k * MINUTE_MS;
        s.o[k] = o;
        s.c[k] = complete ? c : o;
        s.h[k] = complete ? hi : o;
        s.l[k] = complete ? lo : o;
        s.v[k] = complete ? vol : 0;
        it.totalVol += s.v[k];
      }
      if (complete) {
        st.dayHigh = Math.max(st.dayHigh, s.h[k]);
        st.dayLow = Math.min(st.dayLow, s.l[k]);
      }
    }
    it.cur = m;
    s.length = m + 1;
  }

  private fillPath(st: State, upto: number) {
    const it = st.intra!;
    if (it.filled > upto) return;
    const sm = (this.sigmaDaily(st) * this.regime(st, this.today)) / Math.sqrt(MINUTES);
    const fs = st.load.map(([f, l]) => [this.minuteFactors(f), l] as const);
    for (let k = it.filled; k <= upto; k++) {
      const minute = k - 1;
      let z = 0;
      for (const [arr, l] of fs) z += l * arr[minute];
      z += st.idio * normal(st.seed, this.today, 20_000 + minute);
      it.x[k] = it.x[k - 1] + sm * z + this.revertStep(st, it.x[k - 1], 1 / MINUTES);
    }
    it.filled = upto + 1;
  }

  /** Simulated level at time t, with optional Brownian-bridge jitter inside the minute. */
  private simLevel(st: State, t: number, jitter: boolean): number {
    const it = st.intra!;
    const pos = (t - dayStart(this.today)) / MINUTE_MS;
    const m = Math.min(MINUTES - 1, Math.floor(pos));
    const f = Math.min(1, pos - m);
    let x = it.x[m] + f * (it.x[m + 1] - it.x[m]);
    if (jitter) {
      const sm = (this.sigmaDaily(st) * this.regime(st, this.today)) / Math.sqrt(MINUTES);
      x += sm * 0.45 * Math.sqrt(f * (1 - f)) * gaussianRandom();
    }
    return this.dec(st, x);
  }

  private updateBase(st: State, t: number, jitter: boolean) {
    this.ensureIntra(st, t);
    if (st.live) {
      this.writeTodayBar(st);
      return;
    }
    const it = st.intra!;
    const px = this.simLevel(st, t, jitter);
    const s = it.series;
    const m = it.cur;
    s.c[m] = px;
    s.h[m] = Math.max(s.h[m], px);
    s.l[m] = Math.min(s.l[m], px);
    const advMin = this.advFor(st) / MINUTES;
    if (advMin > 0) {
      const frac = (t - s.t[m]) / MINUTE_MS;
      const target = Math.round(advMin * Math.exp(0.5 * normal(st.seed, this.today, 50_000 + m) - 0.125) * Math.min(1, frac));
      if (target > s.v[m]) {
        it.totalVol += target - s.v[m];
        s.v[m] = target;
      }
    }
    st.last = px;
    st.dayHigh = Math.max(st.dayHigh, px);
    st.dayLow = Math.min(st.dayLow, px);
    st.volume = it.totalVol;
    this.writeTodayBar(st);
  }

  // ---------------------------------------------------------------- derived

  private componentValue(id: string): number {
    if (id === 'USD') return 1;
    return this.states.get(id)!.last;
  }

  private derivedValue(st: State, val: (id: string) => number): number {
    if (st.kind === 'pair') return val(st.pair!.base) / val(st.pair!.quote);
    if (st.kind === 'dxy') {
      let ln = Math.log(DXY_CONST);
      for (const [c, w] of DXY_WEIGHTS) {
        // Weights apply to USD-quoted pairs (EURUSD, USDJPY...): EUR/GBP pairs are EURUSD, others USDxxx.
        const usdPer = val(`CCY:${c}`);
        const pair = c === 'EUR' || c === 'GBP' ? usdPer : 1 / usdPer;
        ln += w * Math.log(pair);
      }
      return Math.exp(ln);
    }
    return NaN;
  }

  private bondPrice(st: State, yieldPct: number, day: number): number {
    const b = st.bond!;
    const settle = settlementDate(new Date(dayStart(day)));
    if (settle.getTime() >= b.terms.maturity.getTime()) return 100;
    return cleanFromYield(b.terms, settle, yieldPct + b.spread / 100);
  }

  private updateDerived(st: State, t: number) {
    let px: number;
    if (st.kind === 'bond') {
      const curve = this.states.get(st.bond!.curveId)!;
      px = this.bondPrice(st, curve.last, this.today);
      if (!st.intra || st.intra.day !== this.today) {
        st.intra = { day: this.today, x: new Float64Array(0), filled: 0, series: makeSeries(0, MINUTE_MS), cur: -1, totalVol: 0 };
        st.prevClose = this.bondPrice(st, curve.prevClose, prevBusinessDay(this.today));
        st.dayOpen = this.bondPrice(st, curve.dayOpen, this.today);
        st.dayHigh = Math.max(st.dayOpen, px);
        st.dayLow = Math.min(st.dayOpen, px);
      }
    } else {
      const isNew = !st.intra || st.intra.day !== this.today;
      px = this.derivedValue(st, (id) => this.componentValue(id));
      if (isNew) {
        st.intra = { day: this.today, x: new Float64Array(0), filled: 0, series: makeSeries(0, MINUTE_MS), cur: -1, totalVol: 0 };
        const comps = this.componentIds(st);
        const prevVals = new Map(comps.map((c) => [c, c === 'USD' ? 1 : this.states.get(c)!.prevClose]));
        const openVals = new Map(comps.map((c) => [c, c === 'USD' ? 1 : this.states.get(c)!.dayOpen]));
        st.prevClose = this.derivedValue(st, (id) => prevVals.get(id)!);
        st.dayOpen = this.derivedValue(st, (id) => openVals.get(id)!);
        const intra = this.derivedIntraday(st);
        st.dayHigh = st.dayOpen;
        st.dayLow = st.dayOpen;
        for (let i = 0; i < intra.length; i++) {
          st.dayHigh = Math.max(st.dayHigh, intra.h[i]);
          st.dayLow = Math.min(st.dayLow, intra.l[i]);
        }
      }
    }
    st.last = px;
    st.dayHigh = Math.max(st.dayHigh, px);
    st.dayLow = Math.min(st.dayLow, px);
    void t;
  }

  private componentIds(st: State): string[] {
    if (st.kind === 'pair') return [st.pair!.base, st.pair!.quote];
    if (st.kind === 'dxy') return DXY_WEIGHTS.map(([c]) => `CCY:${c}`);
    if (st.kind === 'bond') return [st.bond!.curveId];
    return [];
  }

  private derivedDaily(st: State): Series {
    const comps = this.componentIds(st).filter((c) => c !== 'USD');
    const bases = comps.map((c) => {
      const cs = this.states.get(c)!;
      this.ensureDaily(cs);
      return cs.daily!;
    });
    const key = `D:${this.today}:${this.version}:${comps.map((c) => this.states.get(c)!.dailyKey).join('|')}`;
    const cached = this.derivedCache.get(`D:${st.def.id}`);
    if (cached && cached.key === key) {
      this.writeDerivedToday(st, cached.series, bases);
      return cached.series;
    }
    const n = bases[0].length;
    const out = makeSeries(n, DAY_MS);
    const sd = st.def.vol / Math.sqrt(252);
    let w = 0;
    for (let i = 0; i < n; i++) {
      if (st.kind === 'bond') {
        const day = dayNum(bases[0].t[i]);
        if (day < st.bond!.issueDay) continue;
        const yc = bases[0];
        out.t[w] = yc.t[i];
        out.o[w] = this.bondPrice(st, yc.o[i], day);
        out.c[w] = this.bondPrice(st, yc.c[i], day);
        // Price is inverse to yield: the yield low is the price high.
        out.h[w] = this.bondPrice(st, yc.l[i], day);
        out.l[w] = this.bondPrice(st, yc.h[i], day);
        out.v[w] = 0;
        w++;
        continue;
      }
      const at = (field: 'o' | 'c') => {
        const vals = new Map(comps.map((c, j) => [c, bases[j][field][i]]));
        return this.derivedValue(st, (id) => (id === 'USD' ? 1 : vals.get(id)!));
      };
      const o = at('o');
      const c = at('c');
      const day = dayNum(bases[0].t[i]);
      const up = sd * 0.5 * Math.abs(normal(st.seed, day, 4));
      const dn = sd * 0.5 * Math.abs(normal(st.seed, day, 5));
      out.t[w] = bases[0].t[i];
      out.o[w] = o;
      out.c[w] = c;
      out.h[w] = Math.max(o, c) * Math.exp(up);
      out.l[w] = Math.min(o, c) * Math.exp(-dn);
      out.v[w] = 0;
      w++;
    }
    out.length = w;
    this.derivedCache.set(`D:${st.def.id}`, { key, series: out });
    this.writeDerivedToday(st, out, bases);
    return out;
  }

  private writeDerivedToday(st: State, s: Series, bases: Series[]) {
    const n = s.length - 1;
    if (n < 0 || dayNum(s.t[n]) !== this.today) return;
    void bases;
    s.o[n] = st.dayOpen;
    s.h[n] = Math.max(st.dayHigh, st.dayLow);
    s.l[n] = Math.min(st.dayLow, st.dayHigh);
    s.c[n] = st.last;
  }

  private derivedIntraday(st: State): Series {
    const comps = this.componentIds(st).filter((c) => c !== 'USD');
    const t = this.now();
    const bases = comps.map((c) => {
      const cs = this.states.get(c)!;
      this.ensureIntra(cs, t);
      return cs.intra!.series;
    });
    const key = `I:${this.tickCount}:${this.version}:${bases.map((b) => b.length).join(',')}`;
    const cached = this.derivedCache.get(`I:${st.def.id}`);
    if (cached && cached.key === key) return cached.series;
    const n = Math.min(...bases.map((b) => b.length));
    const out = makeSeries(n, MINUTE_MS);
    const sm = st.def.vol / Math.sqrt(252) / Math.sqrt(MINUTES);
    for (let i = 0; i < n; i++) {
      const at = (field: 'o' | 'c' | 'h' | 'l') => {
        const vals = new Map(comps.map((c, j) => [c, bases[j][field][i]]));
        return vals;
      };
      let o: number;
      let c: number;
      if (st.kind === 'bond') {
        o = this.bondPrice(st, bases[0].o[i], this.today);
        c = this.bondPrice(st, bases[0].c[i], this.today);
      } else {
        const ov = at('o');
        const cv = at('c');
        o = this.derivedValue(st, (id) => (id === 'USD' ? 1 : ov.get(id)!));
        c = this.derivedValue(st, (id) => (id === 'USD' ? 1 : cv.get(id)!));
      }
      const up = sm * 0.5 * Math.abs(normal(st.seed, this.today, 30_000 + i));
      const dn = sm * 0.5 * Math.abs(normal(st.seed, this.today, 40_000 + i));
      out.t[i] = bases[0].t[i];
      out.o[i] = o;
      out.c[i] = c;
      out.h[i] = Math.max(o, c) * (1 + up);
      out.l[i] = Math.min(o, c) * (1 - dn);
      out.v[i] = 0;
    }
    if (n > 0) {
      out.c[n - 1] = st.last;
      out.h[n - 1] = Math.max(out.h[n - 1], st.last);
      out.l[n - 1] = Math.min(out.l[n - 1], st.last);
    }
    out.length = n;
    this.derivedCache.set(`I:${st.def.id}`, { key, series: out });
    return out;
  }

  // ----------------------------------------------------------------- quotes

  private spread(st: State, px: number): number {
    const d = st.def;
    const tick = 10 ** -d.dec;
    switch (d.cls) {
      case 'equity':
        return Math.max(tick, Math.round((px * 0.00012) / tick) * tick);
      case 'fx':
        return tick * (['EURUSD', 'USDJPY', 'GBPUSD'].includes(d.ticker) ? 1 : 2);
      case 'crypto':
        return Math.max(tick, px * 0.00004);
      case 'commodity':
        return tick * 2;
      case 'rate':
        return 0.004;
      case 'bond':
        return 1 / 128;
      default:
        return 0;
    }
  }

  private publishQuote(st: State, t: number) {
    const prev = this.quotes.get(st.def.id);
    const last = st.last;
    const sp = this.spread(st, last);
    const tick: -1 | 0 | 1 = prev ? (last > prev.last ? 1 : last < prev.last ? -1 : prev.tick) : 0;
    const chg = last - st.prevClose;
    const q: Quote = {
      id: st.def.id,
      last,
      bid: sp > 0 ? (st.additive ? last + sp / 2 : last - sp / 2) : NaN,
      ask: sp > 0 ? (st.additive ? last - sp / 2 : last + sp / 2) : NaN,
      open: st.dayOpen,
      high: st.dayHigh,
      low: st.dayLow,
      prevClose: st.prevClose,
      volume: st.volume,
      chg,
      pct: st.prevClose ? (chg / Math.abs(st.prevClose)) * 100 : 0,
      time: t,
      tick,
      src: st.live ? 'LIVE' : 'SIM',
    };
    this.quotes.set(st.def.id, q);
  }

  private maybeTrade(st: State, t: number) {
    const cls = st.def.cls;
    if (cls !== 'equity' && cls !== 'commodity' && cls !== 'crypto') return;
    if (st.live) return;
    const q = this.quotes.get(st.def.id)!;
    const n = Math.random() < 0.35 ? 0 : 1 + Math.floor(Math.random() * 3);
    const adv = this.advFor(st);
    const venues = cls === 'equity' ? (VENUES[st.def.country] ?? VENUES_US) : cls === 'crypto' ? ['CB', 'BS', 'KR'] : ['E'];
    for (let i = 0; i < n; i++) {
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const px = side > 0 ? q.ask : q.bid;
      const base = Math.max(1, adv / 23_400 / 3);
      let size = Math.max(1, Math.round(base * Math.exp(gaussianRandom() * 0.9)));
      if (cls === 'equity') size = size >= 100 ? Math.round(size / 100) * 100 : size;
      if (cls === 'crypto') size = Math.max(0.0001, Number((base * Math.exp(gaussianRandom() * 1.1)).toPrecision(3)));
      const cond = cls === 'equity' && size < 100 ? 'I' : Math.random() < 0.06 ? 'F' : '';
      this.pushTrade(st, { t: t - Math.floor(Math.random() * 900), px: Number.isFinite(px) ? px : q.last, size, side, venue: venues[Math.floor(Math.random() * venues.length)], cond });
    }
  }

  private pushTrade(st: State, tr: Trade) {
    st.trades.unshift(tr);
    if (st.trades.length > TRADE_BUFFER) st.trades.length = TRADE_BUFFER;
  }

  /** Seeds a recent tape so Time & Sales is never empty on open. */
  backfillTrades(id: string) {
    const st = this.states.get(id);
    if (!st || st.trades.length >= 100) return;
    const s = this.intraday(id);
    const q = this.quotes.get(id);
    if (!q || s.length === 0) return;
    const now = this.now();
    const adv = this.advFor(st);
    const cls = st.def.cls;
    if (cls !== 'equity' && cls !== 'commodity' && cls !== 'crypto') return;
    const venues = cls === 'equity' ? (VENUES[st.def.country] ?? VENUES_US) : cls === 'crypto' ? ['CB', 'BS', 'KR'] : ['E'];
    const sp = this.spread(st, q.last);
    const out: Trade[] = [];
    let t = st.trades.length ? st.trades[st.trades.length - 1].t : now;
    for (let i = 0; i < 150 - st.trades.length; i++) {
      t -= 400 + Math.random() * 2500;
      const idx = Math.max(0, Math.min(s.length - 1, Math.floor((t - s.t[0]) / s.span)));
      const mid = s.c[idx];
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const base = Math.max(1, adv / 23_400 / 3);
      let size = Math.max(1, Math.round(base * Math.exp(gaussianRandom() * 0.9)));
      if (cls === 'equity') size = size >= 100 ? Math.round(size / 100) * 100 : size;
      if (cls === 'crypto') size = Number((base * Math.exp(gaussianRandom() * 1.1)).toPrecision(3));
      out.push({ t, px: mid + (side * sp) / 2, size, side, venue: venues[i % venues.length], cond: size < 100 && cls === 'equity' ? 'I' : '' });
    }
    st.trades = [...st.trades, ...out];
  }

  // ------------------------------------------------------------ live feeds

  /** Feeds a live quote; the line stops simulating and follows the feed. */
  applyLive(id: string, u: { last: number; time?: number; prevClose?: number; open?: number; high?: number; low?: number; volume?: number; size?: number }) {
    const st = this.states.get(id);
    if (!st || st.kind !== 'base' || !Number.isFinite(u.last) || u.last <= 0) return;
    const t = u.time ?? this.now();
    if (u.prevClose && Number.isFinite(u.prevClose)) {
      const lastDay = this.lastHistDay(st.allDays);
      if (st.extAnchors.get(lastDay) !== u.prevClose) {
        st.extAnchors.set(lastDay, u.prevClose);
        st.dailyKey = '';
        this.version++;
      }
    }
    this.ensureIntra(st, t);
    if (!st.live) {
      st.live = true;
      if (!st.liveIntraday) this.bridgeIntradayTo(st, u.last, u.open);
    }
    if (u.open && Number.isFinite(u.open)) st.dayOpen = u.open;
    if (u.high && Number.isFinite(u.high)) st.dayHigh = Math.max(u.high, u.last);
    if (u.low && Number.isFinite(u.low)) st.dayLow = Math.min(u.low, u.last);
    st.dayHigh = Math.max(st.dayHigh, u.last);
    st.dayLow = Math.min(st.dayLow, u.last);
    if (u.volume != null && Number.isFinite(u.volume)) st.volume = u.volume;
    if (u.prevClose && Number.isFinite(u.prevClose)) st.prevClose = u.prevClose;
    this.appendLiveBar(st, t, u.last, u.size ?? 0);
    st.last = u.last;
    this.ensureDaily(st);
    this.writeTodayBar(st);
    if (u.size) {
      const q = this.quotes.get(id);
      const side: -1 | 0 | 1 = q ? (u.last > q.last ? 1 : u.last < q.last ? -1 : 0) : 0;
      this.pushTrade(st, { t, px: u.last, size: u.size, side, venue: st.def.cls === 'crypto' ? 'CB' : 'Q', cond: '' });
    }
    this.publishQuote(st, t);
  }

  /** Notifies listeners after a batch of live updates. */
  flush(ids: Iterable<string>) {
    const set = new Set(ids);
    for (const fn of this.listeners) fn(set);
  }

  private bridgeIntradayTo(st: State, last: number, open?: number) {
    const it = st.intra!;
    const s = it.series;
    const m = it.cur;
    if (m < 0) return;
    const x0 = this.enc(st, open && Number.isFinite(open) ? open : this.dec(st, it.x[0]));
    const xm = this.enc(st, last);
    const startDelta = x0 - it.x[0];
    const endDelta = xm - it.x[m + 1] - startDelta;
    let hi = -Infinity;
    let lo = Infinity;
    for (let k = 0; k <= m; k++) {
      const shift = (k2: number) => startDelta + (endDelta * k2) / (m + 1);
      const conv = (v: number, k2: number) => (st.additive ? v + shift(k2) : v * Math.exp(shift(k2)));
      s.o[k] = conv(s.o[k], k);
      s.c[k] = conv(s.c[k], k + 1);
      s.h[k] = Math.max(conv(s.h[k], k), s.o[k], s.c[k]);
      s.l[k] = Math.min(conv(s.l[k], k), s.o[k], s.c[k]);
      hi = Math.max(hi, s.h[k]);
      lo = Math.min(lo, s.l[k]);
    }
    s.c[m] = last;
    st.dayOpen = s.o[0];
    st.dayHigh = Math.max(hi, last);
    st.dayLow = Math.min(lo, last);
    st.liveIntraday = true;
  }

  private appendLiveBar(st: State, t: number, px: number, size: number) {
    const it = st.intra!;
    const s = it.series;
    if (s.length === 0) return;
    let n = s.length - 1;
    while (t >= s.t[n] + s.span) {
      if (s.length >= s.t.length) this.growSeries(it);
      const prevClose = it.series.c[n];
      const ns = it.series;
      ns.t[n + 1] = ns.t[n] + ns.span;
      ns.o[n + 1] = prevClose;
      ns.h[n + 1] = prevClose;
      ns.l[n + 1] = prevClose;
      ns.c[n + 1] = prevClose;
      ns.v[n + 1] = 0;
      ns.length = n + 2;
      n++;
    }
    const ns = it.series;
    ns.c[n] = px;
    ns.h[n] = Math.max(ns.h[n], px);
    ns.l[n] = Math.min(ns.l[n], px);
    ns.v[n] += size;
  }

  private growSeries(it: Intra) {
    const s = it.series;
    const bigger = makeSeries(Math.max(16, s.t.length * 2), s.span);
    for (const k of ['t', 'o', 'h', 'l', 'c', 'v'] as const) bigger[k].set(s[k]);
    bigger.length = s.length;
    it.series = bigger;
  }

  /** Replaces today's intraday bars with feed bars (any span). */
  setIntradayBars(id: string, bars: { t: number; o: number; h: number; l: number; c: number; v: number }[], span: number) {
    const st = this.states.get(id);
    if (!st || st.kind !== 'base' || bars.length === 0) return;
    this.ensureIntra(st, this.now());
    const s = makeSeries(bars.length + 64, span);
    bars.forEach((b, i) => {
      s.t[i] = b.t;
      s.o[i] = b.o;
      s.h[i] = b.h;
      s.l[i] = b.l;
      s.c[i] = b.c;
      s.v[i] = b.v;
    });
    s.length = bars.length;
    const it = st.intra!;
    it.series = s;
    it.cur = -1;
    st.liveIntraday = true;
    st.live = true;
    st.last = bars[bars.length - 1].c;
    this.version++;
  }

  /** External daily closes the simulated history must pass through. */
  setDailyAnchors(id: string, points: [day: number, level: number][]) {
    const st = this.states.get(id);
    if (!st || st.kind !== 'base') return;
    for (const [d, v] of points) st.extAnchors.set(d, v);
    st.dailyKey = '';
    this.version++;
    this.derivedCache.clear();
  }

  /** External full daily bars (also used as anchors). */
  setDailyBars(id: string, bars: { day: number; o: number; h: number; l: number; c: number; v: number }[]) {
    const st = this.states.get(id);
    if (!st || st.kind !== 'base') return;
    for (const b of bars) {
      st.extBars.set(b.day, b);
      st.extAnchors.set(b.day, b.c);
    }
    st.dailyKey = '';
    this.version++;
  }

  /** Re-derives prevClose/open/intraday after anchors changed (e.g. FX fixings). */
  rebaseSimulated(id: string) {
    const st = this.states.get(id);
    if (!st || st.kind !== 'base' || st.live) return;
    st.intra = null;
    st.dailyKey = '';
    this.derivedCache.clear();
    this.updateBase(st, this.now(), false);
    this.publishQuote(st, this.now());
    for (const other of this.states.values()) {
      if (other.kind === 'base') continue;
      if (this.componentIds(other).includes(id)) {
        other.intra = null;
        this.updateDerived(other, this.now());
        this.publishQuote(other, this.now());
      }
    }
  }

  /** Hands a line back to the simulator (feed switched off or lost). */
  unlive(id: string) {
    const st = this.states.get(id);
    if (!st || st.kind !== 'base' || !st.live) return;
    st.live = false;
    st.liveIntraday = false;
    st.intra = null;
    st.dailyKey = '';
    this.version++;
    const t = this.now();
    this.updateBase(st, t, false);
    this.publishQuote(st, t);
  }

  /** Every security that should appear in search and monitors. */
  get securities(): SecurityDef[] {
    return this.defs;
  }

  isBusinessToday(): boolean {
    return isBusinessDay(this.today);
  }
}

function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return normal(seed, i, 77) * (1 - s) + normal(seed, i + 1, 77) * s;
}

let spare: number | null = null;
function gaussianRandom(): number {
  if (spare != null) {
    const s = spare;
    spare = null;
    return s;
  }
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const r = Math.sqrt(-2 * Math.log(u));
  spare = r * Math.sin(2 * Math.PI * v);
  return r * Math.cos(2 * Math.PI * v);
}
