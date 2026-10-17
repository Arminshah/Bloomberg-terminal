import { resolveSecurity, searchSecurities, YELLOW_KEYS, CLASS_LABEL } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { FUNCTIONS, lookupFn } from './registry';
import type { FnDef } from './types';
import { lookupSource, normalizeTicker } from '../data/live/lookup';

export interface Suggestion {
  kind: 'fn' | 'sec';
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

function fnSuggestion(f: FnDef, prefix: string): Suggestion {
  return {
    kind: 'fn',
    key: `fn:${f.code}`,
    primary: f.code,
    secondary: f.name,
    tag: f.category,
    execute: prefix ? `${prefix} ${f.code}` : f.code,
  };
}

function secSuggestion(d: SecurityDef): Suggestion {
  return {
    kind: 'sec',
    key: `sec:${d.id}`,
    primary: d.id,
    secondary: d.name,
    tag: CLASS_LABEL[d.cls],
    fill: `${d.id.toUpperCase()} `,
  };
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
    return matchFns(partial, sec, true, 14).map((f) => fnSuggestion(f, sec.id));
  }

  // "AAPL G" -> functions for AAPL starting with G; "AAPL " -> all its functions.
  // A bare function remains a function even when its alias is a loaded ticker.
  const bareFunction = tokens.length === 1 && !!lookupFn(tokens[0]);
  for (let j = bareFunction ? 0 : tokens.length - (trailing ? 0 : 1); j >= 1; j--) {
    const sec = resolveSecurity(tokens.slice(0, j).join(' '));
    if (!sec) continue;
    const partial = tokens.slice(j).join(' ');
    if (!partial && !trailing) break;
    const fns = matchFns(partial, sec, true, 12).map((f) => fnSuggestion(f, sec.id));
    if (fns.length) return fns;
    break;
  }

  const q = tokens.join(' ');
  const fns = matchFns(q, undefined, false, 6).map((f) => fnSuggestion(f, ''));
  const secs = searchSecurities(q, 9).map((h) => secSuggestion(h.def));
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
