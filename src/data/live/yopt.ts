import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { blackScholes, type OptType } from '../../finance/options';
import { DAY_MS } from '../calendar';
import { engine } from '../market';
import { dividendYield, riskFree, type ExpiryChain, type OptionQuote } from '../options';
import type { SecurityDef } from '../types';
import { desktopData, yahooGet, yahooSymbolFor } from './yahoo';

/**
 * Real listed option chains for the desktop app from Yahoo Finance: expiries,
 * strikes, bid, offer, last, volume, open interest and Yahoo's implied
 * volatility (15 minutes delayed for US options). Yahoo gives no Greeks, so
 * they are computed with Black-Scholes from each contract's own implied vol.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

/** Index options trade under a different symbol from the index quote. */
const INDEX_ROOT: Record<string, string> = { 'SPX Index': '^SPX', 'NDX Index': '^NDX', 'RTY Index': '^RUT', 'VIX Index': '^VIX' };

export function optionSymbol(def: SecurityDef): string | undefined {
  if (def.cls === 'index') return INDEX_ROOT[def.id];
  if (def.cls !== 'equity' || def.country !== 'US') return undefined;
  return yahooSymbolFor(def) ?? def.yahoo;
}

export interface Leg {
  calls: Json[];
  puts: Json[];
  at: number;
}

interface Entry {
  /** Expiry dates as Yahoo lists them (00:00 UTC of the expiry day). */
  expiries: number[];
  legs: Map<number, Leg>;
  status: 'loading' | 'ok' | 'none' | 'error';
}

const chains = new Map<string, Entry>();
const pending = new Set<string>();
export const optVersion = createStore({ v: 0 });
const bump = () => optVersion.set((x) => ({ v: x.v + 1 }));

/** Quotes are refreshed after a minute while the chain is on screen. */
const STALE_MS = 60_000;

async function load(symbol: string, date?: number) {
  const key = `${symbol}:${date ?? ''}`;
  if (pending.has(key)) return;
  pending.add(key);
  const entry = chains.get(symbol) ?? { expiries: [], legs: new Map(), status: 'loading' as const };
  chains.set(symbol, entry);
  try {
    const res = await yahooGet(`/v7/finance/options/${encodeURIComponent(symbol)}?${date ? `date=${date / 1000}` : 'straddle=false'}`);
    const r = res?.optionChain?.result?.[0];
    const exps = ((r?.expirationDates ?? []) as number[]).map((x) => x * 1000);
    if (exps.length) entry.expiries = exps;
    for (const o of (r?.options ?? []) as Json[]) {
      const exp = Number(o.expirationDate) * 1000;
      if (Number.isFinite(exp)) entry.legs.set(exp, { calls: o.calls ?? [], puts: o.puts ?? [], at: Date.now() });
    }
    entry.status = entry.expiries.length ? 'ok' : 'none';
  } catch {
    if (entry.status === 'loading') entry.status = 'error';
  } finally {
    pending.delete(key);
    bump();
  }
}

/**
 * The real expiry list for a security, loading it on first use, plus the
 * at-the-money vol of each expiry loaded so far. The first eight expiries load
 * one at a time in the background for the term structure.
 */
export function useRealExpiries(def: SecurityDef): { status: 'sim' | 'loading' | 'ok' | 'none' | 'error'; expiries: number[]; atmTerm: { expiry: number; iv: number }[] } {
  optVersion.use((x) => x.v);
  const symbol = desktopData() ? optionSymbol(def) : undefined;
  const entry = symbol ? chains.get(symbol) : undefined;
  const status = entry?.status;
  useEffect(() => {
    if (!symbol) return;
    const e = chains.get(symbol);
    if (!e || e.status === 'error') void load(symbol);
  }, [symbol]);
  useEffect(() => {
    const e = symbol ? chains.get(symbol) : undefined;
    if (!symbol || !e || status !== 'ok') return;
    let stop = false;
    void (async () => {
      for (const x of e.expiries.slice(0, 8)) {
        if (stop) return;
        if (!e.legs.has(x)) await load(symbol, x);
      }
    })();
    return () => {
      stop = true;
    };
  }, [symbol, status]);
  if (!symbol) return { status: 'sim', expiries: [], atmTerm: [] };
  if (!entry || entry.status === 'loading') return { status: 'loading', expiries: [], atmTerm: [] };
  const spot = engine.quote(def.id)?.last ?? def.px;
  const atmTerm = entry.expiries.map((e) => ({ expiry: e, iv: atmIv(entry.legs.get(e), spot) })).filter((x) => Number.isFinite(x.iv));
  return { status: entry.status, expiries: entry.expiries, atmTerm };
}

/** One expiry's real contracts, refreshed every minute while on screen. */
export function useRealLeg(def: SecurityDef, expiry: number | undefined): Leg | undefined {
  optVersion.use((x) => x.v);
  const symbol = desktopData() ? optionSymbol(def) : undefined;
  useEffect(() => {
    if (!symbol || expiry == null) return;
    const refresh = () => {
      const leg = chains.get(symbol)?.legs.get(expiry);
      if (!leg || Date.now() - leg.at > STALE_MS) void load(symbol, expiry);
    };
    refresh();
    const timer = setInterval(refresh, STALE_MS);
    return () => clearInterval(timer);
  }, [symbol, expiry]);
  return symbol && expiry != null ? chains.get(symbol)?.legs.get(expiry) : undefined;
}

/** ATM implied vol (%) at `days` to expiry, interpolated in total variance between listed expiries. */
export function atmVolAt(term: { expiry: number; iv: number }[], days: number, now = engine.now()): number {
  const pts = term.map((x) => ({ t: (expiryInstant(x.expiry) - now) / DAY_MS, v: x.iv })).filter((x) => x.t > 0.5).sort((a, b) => a.t - b.t);
  if (!pts.length) return NaN;
  if (days <= pts[0].t) return pts[0].v;
  const last = pts[pts.length - 1];
  if (days >= last.t) return last.v;
  const i = pts.findIndex((x) => x.t >= days);
  const a = pts[i - 1];
  const b = pts[i];
  const w = (days - a.t) / (b.t - a.t);
  const variance = (a.v * a.v * a.t * (1 - w) + b.v * b.v * b.t * w) / days;
  return Math.sqrt(Math.max(0, variance));
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** At-the-money implied vol: the mean of the call and put at the strike nearest spot. */
function atmIv(leg: Leg | undefined, spot: number): number {
  if (!leg) return NaN;
  const near = (list: Json[]) => list.reduce<Json | null>((b, x) => (!b || Math.abs(x.strike - spot) < Math.abs(b.strike - spot) ? x : b), null);
  const ivs = [near(leg.calls), near(leg.puts)].map((x) => num(x?.impliedVolatility)).filter((x) => x > 0.01 && x < 5);
  return ivs.length ? (ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100 : NaN;
}

/** Expiry as an instant: 16:00 New York on the listed day. */
export const expiryInstant = (yahooDate: number) => yahooDate + 20 * 3600_000;

const NY_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The New York trading date of an instant, as YYYY-MM-DD. */
export const nyDay = (ms: number) => NY_DAY.format(new Date(ms));

/** A Yahoo expiry's contracts as the OMON table rows, `count` strikes each side of the money. */
export function realChain(def: SecurityDef, yahooDate: number, leg: Leg, count: number, now = engine.now()): ExpiryChain {
  const spot = engine.quote(def.id)?.last ?? def.px;
  // The underlying's latest session: a contract's volume counts only if it traded in that session.
  const session = nyDay(engine.quote(def.id)?.time ?? now);
  const expiry = expiryInstant(yahooDate);
  const t = Math.max((expiry - now) / (365 * DAY_MS), 1 / (365 * 24));
  const r = riskFree(def);
  const q = dividendYield(def);
  const byStrike = (list: Json[]) => new Map<number, Json>(list.map((x) => [Number(x.strike), x]));
  const calls = byStrike(leg.calls);
  const puts = byStrike(leg.puts);
  const strikes = [...new Set([...calls.keys(), ...puts.keys()])].filter(Number.isFinite).sort((a, b) => a - b);
  let atm = 0;
  strikes.forEach((k, i) => {
    if (Math.abs(k - spot) < Math.abs(strikes[atm] - spot)) atm = i;
  });
  const chosen = strikes.slice(Math.max(0, atm - count), atm + count + 1);
  const d = new Date(yahooDate);
  const exp = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
  const root = def.ticker.split(' ')[0];
  const mk = (type: OptType, strike: number, c: Json | undefined): OptionQuote => {
    const iv = num(c?.impliedVolatility);
    const usable = iv > 0.01 && iv < 5;
    const g = usable ? blackScholes(type, spot, strike, t, r, q, iv) : null;
    const bid = num(c?.bid);
    const ask = num(c?.ask);
    const last = num(c?.lastPrice);
    const traded = num(c?.lastTradeDate) * 1000;
    const today = Number.isFinite(traded) && nyDay(traded) === session;
    return {
      type,
      strike,
      bid,
      ask,
      mid: ask > 0 ? (Math.max(0, bid) + ask) / 2 : last,
      last,
      iv: usable ? iv * 100 : NaN,
      delta: g?.delta ?? NaN,
      gamma: g?.gamma ?? NaN,
      theta: g?.theta ?? NaN,
      vega: g?.vega ?? NaN,
      // The source's volume is for the contract's last trading day, which may be an earlier one.
      volume: c ? (today ? num(c.volume) || 0 : 0) : NaN,
      lastTraded: Number.isFinite(traded) ? traded : undefined,
      oi: c ? num(c.openInterest) || 0 : NaN,
      ticker: c ? `${root} ${def.cls === 'equity' ? 'US ' : ''}${exp} ${type}${strike} ${def.cls === 'index' ? 'Index' : 'Equity'}` : '',
    };
  };
  const rows = chosen.map((strike) => ({ strike, call: mk('C', strike, calls.get(strike)), put: mk('P', strike, puts.get(strike)) }));
  return {
    expiry,
    days: Math.max(0, Math.ceil((expiry - now) / DAY_MS)),
    t,
    fwd: spot * Math.exp((r - q) * t),
    atmIv: atmIv(leg, spot),
    rate: r * 100,
    div: q * 100,
    rows,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
