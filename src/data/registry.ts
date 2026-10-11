import { engine } from './market';
import type { AssetClass, SecurityDef, YellowKey } from './types';

export const YELLOW_KEYS: Record<string, YellowKey> = {
  EQUITY: 'Equity', EQUI: 'Equity', EQ: 'Equity', EQY: 'Equity',
  INDEX: 'Index', INDX: 'Index', IDX: 'Index', IND: 'Index',
  CURNCY: 'Curncy', CRNCY: 'Curncy', CURRENCY: 'Curncy', CURN: 'Curncy',
  COMDTY: 'Comdty', CMDTY: 'Comdty', COMMODITY: 'Comdty', CMDT: 'Comdty',
  GOVT: 'Govt', GOV: 'Govt',
  CORP: 'Corp',
};

export const CLASS_LABEL: Record<AssetClass, string> = {
  equity: 'Equity', index: 'Index', fx: 'Currency', commodity: 'Commodity', rate: 'Rate', crypto: 'Crypto', bond: 'Govt Bond',
};

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

let tickerIndex: Map<string, SecurityDef[]> | null = null;

function index(): Map<string, SecurityDef[]> {
  if (tickerIndex) return tickerIndex;
  tickerIndex = new Map();
  const add = (k: string, d: SecurityDef) => {
    const key = norm(k);
    const list = tickerIndex!.get(key) ?? [];
    if (!list.includes(d)) list.push(d);
    tickerIndex!.set(key, list);
  };
  for (const d of engine.securities) {
    add(d.ticker, d);
    add(d.id, d);
    // "AAPL" for "AAPL US", "BRK/B" etc.
    const root = d.ticker.split(' ')[0];
    if (d.cls === 'equity') add(root, d);
    for (const a of d.alias ?? []) add(a, d);
    if (d.cls === 'commodity') add(d.ticker.replace(/\s+/g, ''), d);
  }
  return tickerIndex;
}

const CLASS_PRIORITY: Record<AssetClass, number> = { equity: 0, index: 1, fx: 2, crypto: 3, commodity: 4, rate: 5, bond: 6 };

function prefer(list: SecurityDef[]): SecurityDef {
  return [...list].sort((a, b) => {
    const us = (d: SecurityDef) => (d.country === 'US' ? 0 : 1);
    return CLASS_PRIORITY[a.cls] - CLASS_PRIORITY[b.cls] || us(a) - us(b);
  })[0];
}

/** Resolves typed text (optionally with a yellow key) to a security. */
export function resolveSecurity(text: string, yk?: YellowKey): SecurityDef | undefined {
  const t = norm(text);
  if (!t) return undefined;
  if (yk) {
    const exact = engine.get(`${text.trim()} ${yk}`);
    if (exact) return exact;
    const list = (index().get(t) ?? []).filter((d) => d.yk === yk);
    if (list.length) return prefer(list);
    // "XBT Curncy" style shorthands.
    const loose = (index().get(t.replace(/\s+/g, '')) ?? []).filter((d) => d.yk === yk);
    return loose.length ? prefer(loose) : undefined;
  }
  const list = index().get(t);
  if (list?.length) return prefer(list);
  return undefined;
}

export interface SecurityHit {
  def: SecurityDef;
  score: number;
}

/** Ranked search over tickers, aliases and names. */
export function searchSecurities(query: string, limit = 8, filter?: (d: SecurityDef) => boolean): SecurityHit[] {
  const q = norm(query);
  if (!q) return [];
  const hits: SecurityHit[] = [];
  for (const d of engine.securities) {
    if (filter && !filter(d)) continue;
    const ticker = d.ticker.toUpperCase();
    const root = ticker.split(' ')[0];
    const name = d.name.toUpperCase();
    let score = 0;
    if (ticker === q || root === q) score = 100;
    else if ((d.alias ?? []).some((a) => a.toUpperCase() === q)) score = 90;
    else if (ticker.startsWith(q) || root.startsWith(q)) score = 70 - Math.min(20, ticker.length - q.length);
    else if ((d.alias ?? []).some((a) => a.toUpperCase().startsWith(q))) score = 60;
    else if (name.startsWith(q)) score = 55;
    else if (name.split(/[\s\-/.]+/).some((w) => w.startsWith(q))) score = 45;
    else if (q.length >= 3 && name.includes(q)) score = 30;
    if (score > 0) {
      score -= CLASS_PRIORITY[d.cls] * 0.5;
      hits.push({ def: d, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function byClass(cls: AssetClass): SecurityDef[] {
  return engine.securities.filter((d) => d.cls === cls);
}

export function equities(): SecurityDef[] {
  return byClass('equity');
}

/** Display label for headers: "AAPL US Equity". */
export const label = (d: SecurityDef) => d.id;
