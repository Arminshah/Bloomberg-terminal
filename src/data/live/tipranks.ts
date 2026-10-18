import type { SecurityDef } from '../types';
import { secTicker } from './sec';

/**
 * TipRanks answers, as the desktop app's main process passes them on (electron/tipranks.cjs): the tool, the
 * ticker asked for, and the tool's JSON. Field names follow the tool descriptions TipRanks publishes; anything
 * else in a row is kept and shown as it came.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TipRanksKind = 'consensus' | 'ratings';

/** The ticker TipRanks uses, where the app can tell: US as is, London GB:, Xetra DE:, Paris FR:. */
export function tipranksTicker(def: SecurityDef | undefined): string {
  if (!def || def.cls !== 'equity') return '';
  const us = secTicker(def);
  if (us) return us.replace(/-/g, '.');
  const m = /^(\S+) (LN|GY|FP)$/.exec(def.ticker);
  if (!m) return '';
  const prefix = { LN: 'GB', GY: 'DE', FP: 'FR' }[m[2] as 'LN' | 'GY' | 'FP'];
  return `${prefix}:${m[1].replace('/', '.')}`;
}

export interface TipRanksAsset {
  ticker: string;
  companyName?: string;
  url?: string;
  price?: number;
  smartScore?: number;
  analystConsensus?: string;
  bestAnalystConsensus?: string;
  priceTarget?: number;
  priceTargetUpside?: number;
  peRatio?: number;
  dividendYield?: number;
  newsSentiment?: number;
  hedgeFundsScore?: number;
  insiderScore?: number;
  nextEarningsDate?: string;
  daysUntilEarnings?: number;
}

export interface TipRanksRating {
  date: string;
  analyst: string;
  firm: string;
  rating: string;
  action: string;
  target: number;
  stars: number;
  extra: Record<string, unknown>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function envelope(text: string): { tool: string; ticker: string; data: any; text?: string } | null {
  try {
    const j = JSON.parse(text);
    return j && typeof j.tool === 'string' ? j : null;
  } catch {
    return null;
  }
}

/** get_assets_data: the entry for the ticker asked for. */
export function parseAsset(text: string): TipRanksAsset | null {
  const e = envelope(text);
  const list: any[] = Array.isArray(e?.data?.assetsData) ? e!.data.assetsData : Array.isArray(e?.data) ? e!.data : [];
  const want = e?.ticker.toUpperCase();
  const a = list.find((x) => typeof x?.ticker === 'string' && x.ticker.toUpperCase() === want) ?? (list.length === 1 ? list[0] : undefined);
  if (!a || typeof a !== 'object') return null;
  return {
    ticker: str(a.ticker) ?? want ?? '',
    companyName: str(a.companyName),
    url: typeof a.url === 'string' && /^https:\/\/(www\.)?tipranks\.com\//.test(a.url) ? a.url : undefined,
    price: num(a.price),
    smartScore: num(a.smartScore),
    analystConsensus: str(a.analystConsensus),
    bestAnalystConsensus: str(a.bestAnalystConsensus),
    priceTarget: num(a.priceTarget),
    priceTargetUpside: num(a.priceTargetUpside),
    peRatio: num(a.peRatio),
    dividendYield: num(a.dividendYield),
    newsSentiment: num(a.newsSentiment),
    hedgeFundsScore: num(a.hedgeFundsScore),
    insiderScore: num(a.insiderScore),
    nextEarningsDate: str(a.nextEarningsDate),
    daysUntilEarnings: num(a.daysUntilEarnings),
  };
}

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o?.[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

/** get_recent_analyst_ratings: one row per rating action, newest first. */
export function parseRatings(text: string): TipRanksRating[] | null {
  const e = envelope(text);
  if (!e) return null;
  const d = e.data;
  const rows: any[] | undefined = Array.isArray(d) ? d : d && typeof d === 'object' ? (Object.values(d).find((v) => Array.isArray(v)) as any[] | undefined) : undefined;
  if (!rows) return null;
  const known = ['recommendationDate', 'date', 'analystName', 'analyst', 'name', 'firm', 'firmName', 'rating', 'recommendation', 'action', 'ratingAction', 'priceTarget', 'target', 'numOfStars', 'stars'];
  return rows
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const raw = String(pick(r, ['recommendationDate', 'date']) ?? '');
      // TipRanks writes MM/DD/YYYY; shown as the app writes dates.
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (!known.includes(k) && (typeof v === 'string' || typeof v === 'number')) extra[k] = v;
      return {
        date: m ? `${m[3]}-${m[1]}-${m[2]}` : raw,
        analyst: String(pick(r, ['analystName', 'analyst', 'name']) ?? ''),
        firm: String(pick(r, ['firm', 'firmName']) ?? ''),
        rating: String(pick(r, ['rating', 'recommendation']) ?? ''),
        action: String(pick(r, ['action', 'ratingAction']) ?? ''),
        target: num(pick(r, ['priceTarget', 'target'])) ?? NaN,
        stars: num(pick(r, ['numOfStars', 'stars'])) ?? NaN,
        extra,
      };
    });
}

/** What get_my_usage reported, with the app's own count for the month. */
export function parseUsage(text: string): { used?: number; limit?: number; remaining?: number; appUsed: number; appCap: number } | null {
  try {
    const j = JSON.parse(text);
    if (!j?.app) return null;
    return { ...(j.usage ?? {}), appUsed: j.app.used, appCap: j.app.cap };
  } catch {
    return null;
  }
}

/** The raw text TipRanks returned when it was not JSON. */
export function rawText(text: string): string | undefined {
  return envelope(text)?.text;
}
