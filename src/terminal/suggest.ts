import { resolveSecurity, searchSecurities, YELLOW_KEYS, CLASS_LABEL } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { FUNCTIONS, lookupFn } from './registry';
import type { FnDef } from './types';
import { lookupSource, normalizeTicker } from '../data/live/lookup';
import { engine } from '../data/market';
import { fmtNum, fmtPct } from '../core/format';
import { favourites } from './userdata';
import { CHART_STYLES } from './legacy';

export interface Suggestion {
  /** fav and recent: the list the command line shows before anything is typed. */
  kind: 'fn' | 'sec' | 'fav' | 'recent';
  key: string;
  primary: string;
  secondary: string;
  tag: string;
  /** Run this command immediately. */
  execute?: string;
  /** Or replace the input with this text and keep typing. */
  fill?: string;
}

const applies = (f: FnDef, sec?: SecurityDef) => !sec || !f.classes || f.classes.includes(sec.cls);

function matchFns(partial: string, sec: SecurityDef | undefined, onlySec: boolean, limit: number): FnDef[] {
  const p = partial.toUpperCase();
  const scored: [FnDef, number][] = [];
  for (const f of FUNCTIONS) {
    if (onlySec && (!applies(f, sec) || (!f.needsSec && !f.classes))) continue;
    const codes = [f.code, ...(f.aliases ?? [])];
    let score = 0;
    if (!p) score = f.needsSec ? 10 : 1;
    else if (codes.some((c) => c === p)) score = 100;
    else if (codes.some((c) => c.startsWith(p))) score = 70 - f.code.length;
    else if (p.length >= 2 && f.name.toUpperCase().split(/\W+/).some((w) => w.startsWith(p))) score = 40;
    else if (p.length >= 3 && (f.name + ' ' + f.desc).toUpperCase().includes(p)) score = 20;
    if (score > 0) scored.push([f, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => f);
}

/** A chart style mnemonic (GPO, GPC) typed in full keeps its style when the suggestion is chosen. */
const STYLE_NAMES: Record<string, string> = { BAR: 'open-high-low-close bars', CANDLE: 'candlesticks' };

function fnSuggestion(f: FnDef, prefix: string, typed = ''): Suggestion {
  const word = typed.trim().toUpperCase();
  const style = f.code === 'CHART' ? CHART_STYLES[word] : undefined;
  const code = style ? word : f.code;
  return {
    kind: 'fn',
    key: `fn:${f.code}`,
    primary: f.code,
    secondary: style ? `${f.name}, ${STYLE_NAMES[style]}` : f.name,
    tag: f.category,
    execute: prefix ? `${prefix} ${code}` : code,
  };
}

function secSuggestion(d: SecurityDef, star = false): Suggestion {
  return {
    kind: 'sec',
    key: `sec:${d.id}`,
    primary: star ? `★ ${d.id}` : d.id,
    secondary: d.name,
    tag: CLASS_LABEL[d.cls],
    fill: `${d.id.toUpperCase()} `,
  };
}

/** The last price and day's change of a security, for the list shown before anything is typed. */
function priceTag(d: SecurityDef): string {
  const q = engine.quote(d.id);
  if (!q || !Number.isFinite(q.last) || !q.last) return CLASS_LABEL[d.cls];
  return d.quote === 'yield' ? `${fmtNum(q.last, d.dec)}` : `${fmtNum(q.last, d.dec)} ${q.pct >= 0 ? '+' : ''}${fmtPct(q.pct, 2)}`;
}

/**
 * What the command line offers as soon as it is clicked, before anything is typed: your favourites, then the
 * securities you opened last that are not among them. Choosing one fills it in, ready for a function.
 */
export function startSuggestions(favs: string[], recent: string[], recentMax = 5): Suggestion[] {
  const at = (id: string) => engine.get(id) ?? resolveSecurity(id);
  const fav = favs.map(at).filter((d): d is SecurityDef => !!d);
  const seen = new Set(fav.map((d) => d.id));
  const rec = recent
    .map(at)
    .filter((d): d is SecurityDef => !!d && !seen.has(d.id))
    .slice(0, recentMax);
  const item = (kind: 'fav' | 'recent') => (d: SecurityDef): Suggestion => ({ kind, key: `${kind}:${d.id}`, primary: d.id, secondary: d.name, tag: priceTag(d), fill: `${d.id.toUpperCase()} ` });
  return [...fav.map(item('fav')), ...rec.map(item('recent'))];
}

export function suggest(input: string): Suggestion[] {
  const raw = input.replace(/<\s*GO\s*>/gi, ' ').replace(/[<>]/g, ' ').replace(/(^|\s)\$(?=[A-Za-z])/g, '$1');
  const trailing = /\s$/.test(raw);
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  if (/^\d+$/.test(tokens[0])) return [];
  if (tokens[0].toUpperCase() === 'HELP' && (tokens.length > 1 || trailing)) {
    return matchFns(tokens.slice(1).join(' '), undefined, false, 12).map((f) => fnSuggestion(f, 'HELP'));
  }

  // Security with a yellow key typed: suggest its functions.
  const ykAt = tokens.findIndex((t, i) => i > 0 && YELLOW_KEYS[t.toUpperCase()]);
  if (ykAt > 0) {
    const sec = resolveSecurity(tokens.slice(0, ykAt).join(' '), YELLOW_KEYS[tokens[ykAt].toUpperCase()]);
    if (!sec) return [];
    const partial = tokens.slice(ykAt + 1).join(' ');
    return matchFns(partial, sec, true, 14).map((f) => fnSuggestion(f, sec.id, partial));
  }

  // "AAPL G" -> functions for AAPL starting with G; "AAPL " -> all its functions.
  // A bare function remains a function even when its alias is a loaded ticker.
  const bareFunction = tokens.length === 1 && !!lookupFn(tokens[0]);
  for (let j = bareFunction ? 0 : tokens.length - (trailing ? 0 : 1); j >= 1; j--) {
    const sec = resolveSecurity(tokens.slice(0, j).join(' '));
    if (!sec) continue;
    const partial = tokens.slice(j).join(' ');
    if (!partial && !trailing) break;
    const fns = matchFns(partial, sec, true, 12).map((f) => fnSuggestion(f, sec.id, partial));
    if (fns.length) return fns;
    break;
  }

  const q = tokens.join(' ');
  const fns = matchFns(q, undefined, false, 6).map((f) => fnSuggestion(f, '', q));
  // Favourites that match come first among the securities, starred.
  const favs = new Set(favourites.get().ids);
  const found = searchSecurities(q, 30).map((h) => h.def);
  const secs = [...found.filter((d) => favs.has(d.id)), ...found.filter((d) => !favs.has(d.id))].slice(0, 9).map((d) => secSuggestion(d, favs.has(d.id)));
  const exactFn = !!lookupFn(q);
  const out = exactFn ? [...fns, ...secs] : [...secs.slice(0, 1), ...fns, ...secs.slice(1)];
  // A ticker that is not built in can be loaded online.
  const ticker = tokens.length === 1 ? normalizeTicker(tokens[0]) : null;
  const source = ticker && !resolveSecurity(ticker) ? lookupSource() : null;
  if (ticker && source && !exactFn) {
    out.unshift({ kind: 'sec', key: `online:${ticker}`, primary: `${ticker} US Equity`, secondary: `Load from ${source === 'yahoo' ? 'Yahoo Finance' : 'Finnhub'}`, tag: 'Online', execute: `${ticker} US EQUITY` });
  }
  return out;
}
