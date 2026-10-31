/**
 * One underlying's listed options from nasdaq.com's option-chain page (electron/nasdaq.cjs): per contract the
 * composite (all exchanges) bid, ask, last and change, the day's volume and the open interest at the start of the
 * day. Each strike row carries the call's OCC symbol in its link, which gives the root, expiry and strike exactly.
 * Nasdaq states no time for the quotes, only the underlying's "as of" date. "--" is Nasdaq's blank: no bid, no
 * trade today, no open interest.
 */
import { useEffect, useState } from 'react';
import { contractDate } from '../../finance/contracts';
import { useRefresh } from '../../terminal/refresh';
import type { SecurityDef } from '../types';
import { alpacaSymbol } from './alpaca';
import type { KeyedAnswer } from './lookup';
import type { OptionSnapshot } from './option-chain';

type Json = Record<string, unknown>;
const object = (v: unknown): Json | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Json : null;

/** A Nasdaq figure ("1,234.50"); "--", empty or anything else is NaN. */
export function nasdaqFigure(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string' || !/^[+-]?[\d,]*\.?\d+$/.test(v.trim())) return NaN;
  return Number(v.trim().replace(/,/g, ''));
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "LAST TRADE: $521.91 (AS OF OCT 30, 2026)" or "LATEST INDEX VALUE: 28,384.85 (AS OF ...)": the price and its date. */
export function nasdaqUnderlying(text: unknown): { price: number; asOf?: string; time?: string } {
  if (typeof text !== 'string') return { price: NaN };
  const price = nasdaqFigure(/(?:LAST TRADE|LATEST INDEX VALUE):\s*\$?([\d,]+(?:\.\d+)?)/i.exec(text)?.[1]);
  const at = /AS OF ([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i.exec(text);
  const month = at ? MONTHS.indexOf(at[1].toUpperCase()) : -1;
  const asOf = at && month >= 0 ? `${at[3]}-${String(month + 1).padStart(2, '0')}-${at[2].padStart(2, '0')}` : undefined;
  const valid = asOf && Number.isFinite(contractDate(asOf).getTime()) ? asOf : undefined;
  const hour = at?.[4] ? (Number(at[4]) % 12) + (at[6].toUpperCase() === 'PM' ? 12 : 0) : NaN;
  const time = valid && Number.isFinite(hour) ? `${String(hour).padStart(2, '0')}:${at![5]}` : undefined;
  return { price: price > 0 ? price : NaN, ...(valid ? { asOf: valid } : {}), ...(time ? { time } : {}) };
}

export interface NasdaqChain {
  contracts: OptionSnapshot[];
  /** The underlying's last price and the date (and time, when Nasdaq gives one) it is as of. */
  underlying: { price: number; asOf?: string; time?: string };
  rejected: number;
}

const OSI = /^([a-z0-9]{1,6})-*(\d{6})c(\d{8})$/i;

/**
 * Nasdaq's answer for `underlying` (its own style: BRK.B) as contracts, or `notFound` when Nasdaq files the symbol
 * under another asset class (or lists no options for it), or the reason the answer is unusable.
 */
export function parseNasdaqChain(text: string, underlying: string): NasdaqChain | { notFound: true } | { error: string } {
  let json: Json | null;
  try { json = object(JSON.parse(text)); } catch { return { error: 'Nasdaq returned a page that is not JSON.' }; }
  const status = object(json?.status);
  const messages = Array.isArray(status?.bCodeMessage) ? status!.bCodeMessage as unknown[] : [];
  if (status?.rCode === 400 && messages.some((m) => object(m)?.code === 1001)) return { notFound: true };
  const data = object(json?.data);
  const rows = object(data?.table)?.rows;
  if (!data || !Array.isArray(rows)) return { error: 'Nasdaq changed the option chain format.' };
  const base = underlying.replace(/\./g, '').toUpperCase();
  const contracts: OptionSnapshot[] = [];
  let rejected = 0;
  for (const value of rows) {
    const row = object(value);
    if (!row || row.strike === null || row.strike === undefined) continue; // an expiry's heading row
    const link = typeof row.drillDownURL === 'string' ? row.drillDownURL.split('/').pop() ?? '' : '';
    const m = OSI.exec(link);
    const strike = nasdaqFigure(row.strike);
    const root = m?.[1].toUpperCase() ?? '';
    const expiry = m ? `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}` : '';
    const linked = m ? Number(m[3]) / 1000 : NaN;
    // The link and the row must agree, and the root must be this underlying's (or an adjusted or PM-settled one).
    const label = typeof row.expiryDate === 'string' ? row.expiryDate.trim() : '';
    const day = expiry ? `${MONTHS[Number(expiry.slice(5, 7)) - 1]} ${Number(expiry.slice(8, 10))}` : '';
    if (!m || !(strike > 0) || Math.abs(strike - linked) > 1e-6 || !Number.isFinite(contractDate(expiry).getTime()) || (label && label.toUpperCase() !== day)
        || !(root === base || root.startsWith(base) && /^(\d+|P)$/.test(root.slice(base.length)))) { rejected++; continue; }
    for (const [type, side] of [['C', 'c_'], ['P', 'p_']] as const) {
      const bid = nasdaqFigure(row[`${side}Bid`]);
      const ask = nasdaqFigure(row[`${side}Ask`]);
      const last = nasdaqFigure(row[`${side}Last`]);
      contracts.push({
        symbol: `${root}${m[2]}${type}${m[3]}`, root, expiry, type, strike,
        bid: bid >= 0 ? bid : NaN, ask: ask > 0 ? ask : NaN, bidSize: NaN, askSize: NaN, quoteAt: NaN,
        last: last > 0 ? last : NaN, lastSize: NaN, tradeAt: NaN,
        change: nasdaqFigure(row[`${side}Change`]), volume: nasdaqFigure(row[`${side}Volume`]), openInterest: nasdaqFigure(row[`${side}Openinterest`]),
        iv: NaN, delta: NaN, gamma: NaN, theta: NaN, vega: NaN, rho: NaN,
      });
    }
  }
  contracts.sort((a, b) => a.expiry.localeCompare(b.expiry) || a.root.localeCompare(b.root) || a.strike - b.strike || a.type.localeCompare(b.type));
  return { contracts, underlying: nasdaqUnderlying(data.lastTrade), rejected };
}

/** Which of Nasdaq's asset classes an underlying is filed under, learnt per session (ETFs are not "stocks"). */
const filed = new Map<string, 'stocks' | 'etf'>();

/** The answer for a stock or ETF, trying the class it was last found under first, then the other. */
export async function nasdaqChainAnswer(request: (symbol: string, assetClass: 'stocks' | 'etf' | 'index') => Promise<KeyedAnswer>, symbol: string, index: boolean) {
  if (index) {
    const answer = await request(symbol, 'index');
    return { answer, parsed: answer.text ? parseNasdaqChain(answer.text, symbol) : null };
  }
  const order: ('stocks' | 'etf')[] = filed.get(symbol) === 'etf' ? ['etf', 'stocks'] : ['stocks', 'etf'];
  let last: { answer: KeyedAnswer; parsed: ReturnType<typeof parseNasdaqChain> | null } | undefined;
  for (const assetClass of order) {
    const answer = await request(symbol, assetClass);
    const parsed = answer.text ? parseNasdaqChain(answer.text, symbol) : null;
    last = { answer, parsed };
    if (parsed && 'notFound' in parsed) continue;
    if (parsed && 'contracts' in parsed) filed.set(symbol, assetClass);
    return last;
  }
  return last!;
}

/** Nasdaq's symbol for an underlying: a US-listed stock or ETF, or one of the two Nasdaq indices with listed options. */
export function nasdaqOptionSymbol(def: SecurityDef | undefined): { symbol: string; index: boolean } | null {
  if (def?.cls === 'index') return NASDAQ_OPTION_INDICES[def.id] ? { symbol: NASDAQ_OPTION_INDICES[def.id], index: true } : null;
  const symbol = alpacaSymbol(def);
  return symbol ? { symbol, index: false } : null;
}
const NASDAQ_OPTION_INDICES: Record<string, string> = { 'NDX Index': 'NDX', 'XND Index': 'XND' };

export interface NasdaqChainResult {
  state: 'loading' | 'ok' | 'error' | 'none';
  contracts: OptionSnapshot[];
  underlying: NasdaqChain['underlying'];
  rejected: number;
  /** When the app received the answer, and whether it is an earlier answer kept after a failure. */
  at?: number;
  stale?: boolean;
  message?: string;
}

export function useNasdaqChain(def: SecurityDef | undefined, enabled: boolean) {
  const target = nasdaqOptionSymbol(def);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; result: NasdaqChainResult }>();
  const key = `${target?.symbol ?? ''}:${revision}`;
  const request = typeof window !== 'undefined' ? window.arminDesktop?.nasdaqOptions : undefined;
  useEffect(() => {
    if (!target || !request || !enabled) return;
    let stopped = false;
    const done = (result: NasdaqChainResult) => { if (!stopped) setState({ key, result }); };
    const empty = { contracts: [], underlying: { price: NaN }, rejected: 0 };
    nasdaqChainAnswer(request, target.symbol, target.index).then(({ answer, parsed }) => {
      if (!parsed) return done({ ...empty, state: 'error', message: answer.error ?? `Nasdaq answered HTTP ${answer.status}.` });
      if ('notFound' in parsed) return done({ ...empty, state: 'none', message: `Nasdaq lists no options for ${target.symbol}.` });
      if ('error' in parsed) return done({ ...empty, state: 'error', message: parsed.error });
      done({ state: 'ok', ...parsed, at: answer.at, stale: !!answer.stale, ...(answer.stale ? { message: answer.error ?? 'Showing the last answer after a failed refresh.' } : {}) });
    }, () => done({ ...empty, state: 'error', message: 'Nasdaq did not answer.' }));
    return () => { stopped = true; };
  }, [target?.symbol, target?.index, request, enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const result: NasdaqChainResult = state?.key === key ? state.result : { state: 'loading', contracts: [], underlying: { price: NaN }, rejected: 0 };
  useRefresh('Nasdaq option chains', target && request && enabled ? () => setRevision((v) => v + 1) : null);
  return { symbol: target?.symbol ?? null, available: !!request, result, refresh: () => setRevision((v) => v + 1) };
}
