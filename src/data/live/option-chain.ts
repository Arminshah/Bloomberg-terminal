import { useEffect, useState } from 'react';
import { alpacaSymbol, alpacaTime } from './alpaca';
import { contractDate } from '../../finance/contracts';
import type { SecurityDef } from '../types';
import type { KeyedAnswer } from './lookup';

type Json = Record<string, unknown>;
const object = (v: unknown): Json | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Json : null;
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : NaN;
const nonnegative = (v: unknown) => number(v) >= 0 ? number(v) : NaN;

export interface OptionContract {
  symbol: string;
  root: string;
  expiry: string;
  type: 'C' | 'P';
  strike: number;
}

/** OCC compact symbol. Adjusted roots are retained, never assigned a standard multiplier. */
export function optionContract(symbol: string): OptionContract | null {
  const match = /^([A-Z][A-Z0-9.]{0,9})(\d{6})([CP])(\d{8})$/.exec(symbol);
  if (!match) return null;
  const [, root, date, type, strike] = match;
  const expiry = `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)}`;
  const value = Number(strike) / 1000;
  return Number.isFinite(contractDate(expiry).getTime()) && value > 0 ? { symbol, root, expiry, type: type as 'C' | 'P', strike: value } : null;
}

export interface OptionSnapshot extends OptionContract {
  bid: number; ask: number; bidSize: number; askSize: number; quoteAt: number;
  last: number; lastSize: number; tradeAt: number;
  iv: number; delta: number; gamma: number; theta: number; vega: number; rho: number;
}

export interface ChainPage { contracts: OptionSnapshot[]; next?: string; rejected: number }

export function parseOptionChain(text: string, underlying: string): ChainPage | { error: string } {
  let json: Json | null;
  try { json = object(JSON.parse(text)); } catch { return { error: 'The option answer was not JSON.' }; }
  if (!json) return { error: 'No option snapshot map in the answer.' };
  if (typeof json.message === 'string' && !json.snapshots) return { error: json.message.slice(0, 200) };
  const snapshots = object(json.snapshots);
  if (!snapshots) return { error: 'No option snapshot map in the answer.' };
  if (json.next_page_token !== undefined && json.next_page_token !== null && json.next_page_token !== '' &&
      (typeof json.next_page_token !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(json.next_page_token))) return { error: 'Invalid option pagination token.' };
  const contracts: OptionSnapshot[] = [];
  let rejected = 0;
  for (const [symbol, value] of Object.entries(snapshots)) {
    const contract = optionContract(symbol);
    const row = object(value);
    // Class shares can omit their dot in the OCC root; numeric suffixes are adjustments.
    const root = contract?.root.replace(/\./g, '') ?? '';
    const base = underlying.replace(/\./g, '');
    if (!contract || !(root === base || root.startsWith(base) && /^\d+$/.test(root.slice(base.length))) || !row) { rejected++; continue; }
    const quote = object(row.latestQuote) ?? {};
    const trade = object(row.latestTrade) ?? {};
    const greeks = object(row.greeks) ?? {};
    const quoteAt = alpacaTime(quote.t);
    const tradeAt = alpacaTime(trade.t);
    const hasQuote = Number.isFinite(quoteAt) && (number(quote.bp) > 0 || number(quote.ap) > 0);
    const hasTrade = Number.isFinite(tradeAt) && number(trade.p) > 0;
    contracts.push({ ...contract,
      bid: hasQuote ? nonnegative(quote.bp) : NaN, ask: hasQuote && number(quote.ap) > 0 ? number(quote.ap) : NaN,
      bidSize: hasQuote ? nonnegative(quote.bs) : NaN, askSize: hasQuote ? nonnegative(quote.as) : NaN, quoteAt: hasQuote ? quoteAt : NaN,
      last: hasTrade ? number(trade.p) : NaN, lastSize: hasTrade ? nonnegative(trade.s) : NaN, tradeAt: hasTrade ? tradeAt : NaN,
      iv: nonnegative(row.impliedVolatility), delta: number(greeks.delta), gamma: nonnegative(greeks.gamma),
      theta: number(greeks.theta), vega: nonnegative(greeks.vega), rho: number(greeks.rho),
    });
  }
  return { contracts: contracts.sort((a, b) => a.expiry.localeCompare(b.expiry) || a.strike - b.strike || a.type.localeCompare(b.type) || a.symbol.localeCompare(b.symbol)),
    next: typeof json.next_page_token === 'string' ? json.next_page_token : undefined, rejected };
}

/** A fresh HTTP response does not make an old trade/quote fresh, or an indicative price real time. */
export function optionAge(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at > now + 5_000) return 'unknown time';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return `${seconds >= 1200 ? 'STALE · ' : ''}${seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`} ago`;
}

export interface ChainResult {
  state: 'loading' | 'ok' | 'error' | 'needs-key' | 'off';
  contracts: OptionSnapshot[];
  pages: number;
  partial?: boolean;
  stale?: boolean;
  rejected?: number;
  at?: number;
  message?: string;
}
type ChainRequest = (arg: { symbol: string; expiry?: string; pageToken?: string }) => Promise<KeyedAnswer>;

/** Bounded, sequential pagination; failures after page one preserve explicitly partial results. */
export async function fetchOptionChain(request: ChainRequest, symbol: string, expiry = '', cancelled = () => false): Promise<ChainResult> {
  const all = new Map<string, OptionSnapshot>();
  const seen = new Set<string>();
  let token: string | undefined;
  let pages = 0;
  let at: number | undefined;
  let stale = false;
  let rejected = 0;
  let message: string | undefined;
  const fail = (state: ChainResult['state'], message: string): ChainResult => ({ state: pages ? 'ok' : state, contracts: [...all.values()], pages, partial: pages > 0, stale: pages > 0, at, rejected, message });
  while (!cancelled()) {
    let answer: KeyedAnswer;
    try { answer = await request({ symbol, ...(expiry ? { expiry } : {}), ...(token ? { pageToken: token } : {}) }); }
    catch { return fail('error', 'Alpaca option snapshots did not answer.'); }
    if (answer.gated) return fail('off', 'Alpaca is switched off on PROVIDERS.');
    if (answer.missing || answer.refused) return fail('needs-key', answer.refused ? 'The configured Alpaca key has the wrong format. Check PROVIDERS.' : 'Configure both Alpaca keys on PROVIDERS.');
    if (!answer.text || answer.status !== 200 && !answer.stale) return fail('error', answer.error ?? `Alpaca options answered HTTP ${answer.status}. Check access or wait before retrying.`);
    const page = parseOptionChain(answer.text, symbol);
    if ('error' in page) return fail('error', page.error);
    pages++;
    if (answer.at) at = at === undefined ? answer.at : Math.min(at, answer.at);
    stale ||= !!answer.stale;
    if (answer.stale) message = answer.error ?? 'Showing cached option snapshots after a provider failure.';
    rejected += page.rejected;
    for (const c of page.contracts) {
      if (expiry && c.expiry !== expiry) { rejected++; continue; }
      all.set(c.symbol, c);
    }
    token = page.next;
    if (!token) return { state: 'ok', contracts: [...all.values()], pages, at, stale, rejected, message };
    if (seen.has(token) || pages >= 5) return { state: 'ok', contracts: [...all.values()], pages, at, stale, rejected, partial: true,
      message: seen.has(token) ? 'The provider repeated a pagination token. Narrow the expiry and retry.' : 'The five-page limit was reached. Request an exact expiry to load a smaller chain.' };
    seen.add(token);
  }
  return fail('error', 'Request cancelled.');
}

export function useOptionChain(def: SecurityDef | undefined, expiry: string) {
  const symbol = alpacaSymbol(def);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; result: ChainResult }>();
  const key = `${symbol ?? ''}:${expiry}:${revision}`;
  useEffect(() => {
    const request = window.arminDesktop?.optionChain;
    if (!symbol || !request) return;
    let stopped = false;
    void fetchOptionChain(request, symbol, expiry, () => stopped).then((result) => { if (!stopped) setState({ key, result }); });
    return () => { stopped = true; };
  }, [symbol, expiry, revision, key]);
  const result: ChainResult = state?.key === key ? state.result : { state: 'loading', contracts: [], pages: 0 };
  return { symbol, available: typeof window !== 'undefined' && !!window.arminDesktop?.optionChain, result, refresh: () => setRevision((v) => v + 1) };
}
