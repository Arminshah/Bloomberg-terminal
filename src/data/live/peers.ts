import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { engine } from '../market';
import { marketCapUsd } from '../analytics';
import type { SecurityDef } from '../types';
import { finnhubAvailable, finnhubSymbol, loadFinnhub } from './finnhub';
import { lookupSecurity, normalizeTicker } from './lookup';
import { desktopData, yahooGet, yahooSymbolFor } from './yahoo';
import { parseSp500, type MemberInfo } from './index-members';
import { parseNasdaqListings, tickerKey, type Listing } from './earnings-calendar';

/**
 * A stock's peers for PEERS: companies in the same line of business, not the same broad sector. First the
 * companies in its own industry as Yahoo Finance's company profiles name it: Finnhub's companies in the same
 * sub-industry (FINNHUB_API_KEY, US-listed stocks), the app's own stocks in that industry, and those among the stocks
 * Yahoo finds similar (followed through the similar stocks that share the industry). Yahoo's industries can split a
 * young niche (AI data-centre operators sit in four), so when fewer than four companies share the industry, the
 * stocks Yahoo links to it both ways fill the list: named by at least two of the lists read, and naming it back.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface PeerPick {
  symbol: string;
  /** The app's security, for a stock the app already has. */
  id?: string;
  name: string;
  industry: string;
  marketCap: number;
  /** Why it is a peer: Finnhub's sub-industry, the same industry, or Yahoo's similar stocks. */
  basis: 'sub-industry' | 'industry' | 'similar';
}

export interface PeerGroup {
  /** The stock's industry and sector as Yahoo names them. */
  industry: string;
  sector: string;
  picks: PeerPick[];
  /** The sources that answered. */
  sources: string[];
  at: number;
}

export interface Candidate {
  symbol: string;
  /** Finnhub put it in the same sub-industry. */
  finnhub: boolean;
  /** Yahoo's similarity to the stock, or through one of its similar stocks (the product). */
  score: number;
  /** How many of the similar-stock lists read name it (the stock's own and its similar stocks'). */
  lists: number;
  /** Its own similar stocks name the stock back. */
  mutual: boolean;
}

export interface Profile {
  name: string;
  industry: string;
  sector: string;
  marketCap: number;
}

/** Fewer companies than this in the industry and Yahoo's linked stocks fill the list. */
const ENOUGH = 4;

/** Picks the peers: the same industry (Finnhub's sub-industry included) by size, then, if few, the linked stocks. */
export function choosePeers(me: Profile, candidates: Candidate[], profiles: Map<string, Profile | null>, own: PeerPick[] = [], max = 10): PeerPick[] {
  const pick = (c: Candidate, basis: PeerPick['basis']): PeerPick => {
    const p = profiles.get(c.symbol)!;
    return { symbol: c.symbol, name: p.name, industry: p.industry, marketCap: p.marketCap, basis };
  };
  const known = candidates.filter((c) => profiles.get(c.symbol));
  const sameIndustry = (c: Candidate) => !!me.industry && profiles.get(c.symbol)!.industry === me.industry;
  const close = known.filter((c) => c.finnhub || sameIndustry(c)).map((c) => pick(c, c.finnhub && !sameIndustry(c) ? 'sub-industry' : 'industry'));
  const symbols = new Set(close.map((p) => p.symbol));
  for (const o of own) if (!symbols.has(o.symbol)) close.push(o);
  const size = (p: PeerPick) => (Number.isFinite(p.marketCap) ? p.marketCap : -1);
  const out = close.sort((a, b) => size(b) - size(a)).slice(0, max);
  if (out.length < ENOUGH) {
    const linked = known
      .filter((c) => !c.finnhub && !sameIndustry(c) && c.lists >= 2 && c.mutual)
      .sort((a, b) => b.lists - a.lists || b.score - a.score)
      .slice(0, Math.max(0, Math.min(max, 6) - out.length))
      .map((c) => pick(c, 'similar'));
    out.push(...linked);
  }
  return out;
}

const profileCache = new Map<string, Profile | null>();

/** A company's name, industry, sector and market value from Yahoo's company profile; null when Yahoo has none. */
async function profileOf(symbol: string): Promise<Profile | null> {
  if (profileCache.has(symbol)) return profileCache.get(symbol)!;
  let p: Profile | null = null;
  try {
    const r = (await yahooGet(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,price`))?.quoteSummary?.result?.[0];
    const ap = r?.assetProfile ?? {};
    const mc = Number(r?.price?.marketCap?.raw ?? r?.price?.marketCap);
    if (r && (ap.industry || ap.sector)) p = { name: String(r.price?.longName ?? r.price?.shortName ?? symbol), industry: String(ap.industry ?? ''), sector: String(ap.sector ?? ''), marketCap: Number.isFinite(mc) ? mc : NaN };
  } catch {
    return null;
  }
  profileCache.set(symbol, p);
  if (profileCache.size > 500) profileCache.delete(profileCache.keys().next().value!);
  return p;
}

/** The stocks Yahoo finds similar to one, with its score. */
async function similar(symbol: string): Promise<{ symbol: string; score: number }[]> {
  try {
    const res: Json = await yahooGet(`/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`);
    const list = res?.finance?.result?.[0]?.recommendedSymbols;
    return Array.isArray(list) ? list.filter((x: Json) => typeof x?.symbol === 'string').map((x: Json) => ({ symbol: String(x.symbol), score: Number(x.score) || 0 })) : [];
  } catch {
    return [];
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/** At most this many company profiles and similar-stock lists are read for one stock. */
const MAX_PROFILES = 30;
const MAX_LISTS = 9;

/** The app's own stocks in the industry (built in or looked up), by the industry name. */
function ownInIndustry(def: SecurityDef, industry: string): PeerPick[] {
  if (!industry) return [];
  return engine.securities
    .filter((d) => d.cls === 'equity' && d.id !== def.id && d.eq?.industry === industry)
    .map((d) => ({ symbol: d.ticker.split(' ')[0].replace('/', '-'), id: d.id, name: d.name, industry, marketCap: marketCapUsd(d.id), basis: 'industry' as const }));
}

/** Finds a stock's peers (desktop app). */
/**
 * Peers without Yahoo's company profiles (it refuses some sessions): an S&P 500 member's companies in the same GICS
 * sub-industry (the index's member list), else US-listed companies in the same industry as Nasdaq's stock list names
 * it, largest first.
 */
export function classifiedPeers(symbol: string, sp500: MemberInfo[], listings: Map<string, Listing>, max = 10): PeerGroup | null {
  const key = tickerKey(symbol);
  const cap = (s: string) => listings.get(s)?.cap ?? NaN;
  const byCap = (a: { symbol: string }, b: { symbol: string }) => (Number.isFinite(cap(b.symbol)) ? cap(b.symbol) : -1) - (Number.isFinite(cap(a.symbol)) ? cap(a.symbol) : -1);
  const pick = (s: string, name: string, industry: string): PeerPick => ({ symbol: s.replace('.', '-'), name, industry, marketCap: cap(s), basis: 'industry' });
  const member = sp500.find((m) => m.symbol === key);
  if (member?.industry) {
    let same = sp500.filter((m) => m.symbol !== key && m.industry === member.industry);
    // A sub-industry of few companies is widened to its sector.
    if (same.length < 4) same = [...same, ...sp500.filter((m) => m.symbol !== key && m.sector === member.sector && !same.includes(m)).sort(byCap)].slice(0, max);
    return { industry: member.industry, sector: member.sector, picks: same.sort(byCap).slice(0, max).map((m) => pick(m.symbol, m.name, m.industry)), sources: ['S&P 500 member list (GICS sub-industry)', "Nasdaq's market values"], at: Date.now() };
  }
  const me = listings.get(key);
  if (!me?.industry) return null;
  const same = [...listings.entries()]
    .filter(([s, l]) => s !== key && l.industry === me.industry && l.country === me.country && Number.isFinite(l.cap) && l.cap > 0 && !/\.(W|U|R)$|[.](WS|RT)$/.test(s))
    .map(([s, l]) => ({ symbol: s, name: l.name.replace(/\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares|American Depositary Shares).*$/i, '').trim(), l }))
    .sort(byCap)
    .slice(0, max);
  return same.length ? { industry: me.industry, sector: me.sector, picks: same.map((x) => pick(x.symbol, x.name, me.industry ?? '')), sources: ["Nasdaq's stock list (industry)"], at: Date.now() } : null;
}

async function keylessPeers(symbol: string, max: number): Promise<PeerGroup | null> {
  const api = window.arminDesktop;
  if (!api?.indexMembers || !api.earningsCalendar) return null;
  const [sp, list] = await Promise.all([api.indexMembers('sp500').catch(() => null), api.earningsCalendar('nasdaq-caps', '', '').catch(() => null)]);
  const members = sp?.text ? parseSp500(sp.text) : null;
  const listings = list?.text ? parseNasdaqListings(list.text) : null;
  return classifiedPeers(symbol, members && 'data' in members ? members.data : [], listings && 'data' in listings ? listings.data : new Map(), max);
}

export async function findPeers(def: SecurityDef, max = 10): Promise<PeerGroup | null> {
  const symbol = yahooSymbolFor(def) ?? def.yahoo;
  if (!symbol || !def.eq) return null;
  const me = await profileOf(symbol);
  if (!me) return def.country === 'US' ? keylessPeers(symbol, max) : null;
  const sources: string[] = [];
  const candidates = new Map<string, Candidate>();
  const add = (s: string, c: Partial<Candidate>) => {
    if (s === symbol) return;
    const was = candidates.get(s) ?? { symbol: s, finnhub: false, score: 0, lists: 0, mutual: false };
    candidates.set(s, { ...was, finnhub: was.finnhub || !!c.finnhub, score: Math.max(was.score, c.score ?? 0), lists: was.lists + (c.lists ?? 0), mutual: was.mutual || !!c.mutual });
  };
  const fs = finnhubSymbol(def);
  if (fs && finnhubAvailable()) {
    const part = await loadFinnhub(fs, 'peers');
    const list = part?.state === 'ok' ? (part.data as string[]) : [];
    if (list.length > 1) sources.push('Finnhub sub-industry');
    // Finnhub writes class shares with a dot; Yahoo with a dash.
    for (const t of list.slice(0, 12)) add(t.replace('.', '-'), { finnhub: true, score: 1 });
  }
  const profiles = new Map<string, Profile | null>();
  const profile = async (list: string[]) => {
    const todo = list.filter((x) => !profiles.has(x)).slice(0, Math.max(0, MAX_PROFILES - profiles.size));
    await pool(todo, 3, async (x) => profiles.set(x, await profileOf(x)));
  };
  // The stock's similar stocks, then theirs: who names whom, and how often.
  let lists = 0;
  const read = async (from: string, weight: number) => {
    lists++;
    const got = await similar(from);
    if (from !== symbol && got.some((x) => x.symbol === symbol)) add(from, { mutual: true });
    for (const x of got) add(x.symbol, { score: weight * x.score, lists: 1 });
    return got;
  };
  const first = await read(symbol, 1);
  if (first.length) sources.push('Yahoo Finance similar stocks');
  await pool(first, 3, (x) => read(x.symbol, x.score));
  const ranked = () => [...candidates.values()].sort((a, b) => Number(b.finnhub) - Number(a.finnhub) || b.lists - a.lists || b.score - a.score);
  await profile(ranked().filter((c) => c.finnhub || c.lists >= 2 || first.some((x) => x.symbol === c.symbol)).map((c) => c.symbol));
  // Follow the similar stocks that share the industry, for more companies in it.
  const same = () => ranked().filter((c) => profiles.get(c.symbol)?.industry === me.industry);
  const followed = new Set(first.map((x) => x.symbol));
  while (lists < MAX_LISTS && same().length < max) {
    const next = same().find((c) => !followed.has(c.symbol));
    if (!next) break;
    followed.add(next.symbol);
    const got = await read(next.symbol, next.score || 0.5);
    await profile(got.map((x) => x.symbol));
  }
  const own = ownInIndustry(def, me.industry);
  if (own.length) sources.push("the app's stocks in the industry");
  return { industry: me.industry, sector: me.sector, picks: choosePeers(me, ranked(), profiles, own, max), sources, at: Date.now() };
}

// ------------------------------------------------------------------ the screen's state

interface Entry {
  state: 'loading' | 'ok' | 'error';
  group?: PeerGroup;
  /** The peers registered in the app, in the group's order. */
  ids: string[];
  message?: string;
}

export const peerData = createStore<{ v: number; by: Record<string, Entry> }>({ v: 0, by: {} });
/** Peer lists are kept for a day across restarts; the securities are looked up again when PEERS opens. */
const keptGroups = createStore<{ by: Record<string, PeerGroup> }>({ by: {} }, 'peer-groups', 1);
const DAY = 86_400_000;

const put = (id: string, e: Entry) => peerData.set((s) => ({ v: s.v + 1, by: { ...s.by, [id]: e } }));

/** The app's securities for the picks, looked up for this session where the app has not loaded them. */
async function register(group: PeerGroup): Promise<string[]> {
  const ids = await pool(group.picks, 3, async (p) => {
    if (p.id && engine.get(p.id)) return p.id;
    const t = normalizeTicker(p.symbol);
    if (!t) return null;
    const have = engine.get(`${t} US Equity`);
    if (have) return have.id;
    const r = await lookupSecurity(t, false);
    return r.ok ? r.def.id : null;
  });
  return ids.filter((x): x is string => !!x);
}

export function requestPeers(def: SecurityDef | undefined) {
  if (!def?.eq || !desktopData()) return;
  const have = peerData.get().by[def.id];
  if (have && (have.state === 'loading' || (have.state === 'ok' && Date.now() - (have.group?.at ?? 0) < DAY))) return;
  put(def.id, { state: 'loading', ids: have?.ids ?? [] });
  void (async () => {
    try {
      const kept = keptGroups.get().by[def.id];
      const group = kept && Date.now() - kept.at < DAY ? kept : await findPeers(def);
      if (!group) {
        put(def.id, { state: 'error', ids: [], message: 'Neither Yahoo Finance nor the S&P 500 and Nasdaq lists classify this stock, so its industry is not known.' });
        return;
      }
      if (group !== kept) keptGroups.set((s) => ({ by: { ...Object.fromEntries(Object.entries(s.by).filter(([, g]) => Date.now() - g.at < DAY)), [def.id]: group } }));
      // The group shows at once; rows appear as each peer is registered.
      put(def.id, { state: 'loading', group, ids: [] });
      put(def.id, { state: 'ok', group, ids: await register(group) });
    } catch (err) {
      put(def.id, { state: 'error', ids: [], message: err instanceof Error ? err.message : String(err) });
    }
  })();
}

/** A stock's peers while a screen shows them. */
export function usePeers(def: SecurityDef | undefined): Entry | undefined {
  const entry = peerData.use((s) => (def ? s.by[def.id] : undefined));
  useEffect(() => requestPeers(def), [def]);
  return entry;
}
