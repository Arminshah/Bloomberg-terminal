import { createStore } from '../../core/store';
import { couponFraction } from '../../finance/bonds';
import { isoToDay } from '../calendar';
import { engine } from '../market';
import type { SecurityDef } from '../types';

/**
 * FedInvest (TreasuryDirect, Bureau of the Fiscal Service): the day's Buy, Sell and End of Day prices of every
 * marketable Treasury, by CUSIP, per 100 of face. The desktop app asks for the latest day that has prices and the
 * day before it, when a Treasury's prices are first needed, and adds each note and bond as a security of its own
 * ("T 4 5/8 05/15/54 Govt", its CUSIP as an alias). Sell sits at or below Buy, so the screens show them as bid and
 * ask. A price the page gives as 0 is one it does not have that day.
 */

export type FedType = 'Bills' | 'Notes' | 'Bonds' | 'TIPS' | 'FRN' | 'Other';

export interface FedRow {
  cusip: string;
  type: FedType;
  /** Coupon, percent a year (0 for a bill). */
  rate: number;
  /** YYYY-MM-DD */
  maturity: string;
  buy: number;
  sell: number;
  /** End of day price; NaN until the page fills it in. */
  eod: number;
}

export interface FedDay {
  /** YYYY-MM-DD, the day the prices are for. */
  date: string;
  rows: Map<string, FedRow>;
}

const TYPES: [RegExp, FedType][] = [
  [/BILL/, 'Bills'],
  [/TIPS/, 'TIPS'],
  [/FRN|FLOATING/, 'FRN'],
  [/NOTE/, 'Notes'],
  [/BOND/, 'Bonds'],
];

const cellText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const price = (s: string) => {
  const v = Number(s.replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : NaN;
};

/** The price table's rows: CUSIP, security type, rate, maturity date, call date, Buy, Sell, End of Day. */
export function parseFedInvest(html: string): FedRow[] {
  const out: FedRow[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(cellText);
    if (cells.length < 8 || !/^[0-9A-Z]{9}$/.test(cells[0])) continue;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[3]);
    if (!m) continue;
    const rate = Number(cells[2].replace('%', ''));
    const kind = cells[1].toUpperCase();
    out.push({
      cusip: cells[0],
      type: TYPES.find(([re]) => re.test(kind))?.[1] ?? 'Other',
      rate: Number.isFinite(rate) ? rate : NaN,
      maturity: `${m[3]}-${m[1]}-${m[2]}`,
      buy: price(cells[5]),
      sell: price(cells[6]),
      eod: price(cells[7]),
    });
  }
  return out;
}

/** A day's table holds prices when some security has a Sell price (a day not yet published comes back empty). */
export function hasPrices(rows: FedRow[]): boolean {
  return rows.some((r) => Number.isFinite(r.sell));
}

/** The coupon as Treasuries are named, in eighths where it is one ("4 5/8"), otherwise in decimals ("4.6"). */
export function couponText(rate: number): string {
  if (!Number.isFinite(rate)) return '0';
  return Math.abs(rate * 8 - Math.round(rate * 8)) < 1e-6 ? couponFraction(rate) : String(Number(rate.toFixed(3)));
}

/** "T 4 5/8 05/15/54", as the terminal names a Treasury note or bond. */
export function treasuryTicker(r: Pick<FedRow, 'rate' | 'maturity'>): string {
  const [y, m, d] = r.maturity.split('-');
  return `T ${couponText(r.rate)} ${m}/${d}/${y.slice(2)}`;
}

/** The app's security for a Treasury note or bond on FedInvest's list. */
export function treasuryDef(r: FedRow, ticker = treasuryTicker(r)): SecurityDef {
  const [y, m, d] = r.maturity.split('-');
  const suffix = ticker.slice(treasuryTicker(r).length);
  const decimal = `T ${String(Number(r.rate.toFixed(3)))} ${m}/${d}/${y.slice(2)}${suffix}`;
  return {
    id: `${ticker} Govt`,
    ticker,
    yk: 'Govt',
    name: `US TREASURY N/B ${r.rate.toFixed(3)}% ${y}`,
    cls: 'bond',
    ccy: 'USD',
    country: 'US',
    region: 'Americas',
    px: Number.isFinite(r.sell) ? r.sell : 100,
    vol: 0,
    dec: 4,
    quote: 'price',
    // The CUSIP, and the name with a decimal coupon as SRCH writes it ("T 4.625 08/15/36").
    alias: [r.cusip, ...(decimal !== ticker ? [decimal] : [])],
    // FedInvest gives no issue date; the coupon schedule runs back from the maturity, which is all YAS needs.
    bond: { coupon: r.rate, maturity: r.maturity, issue: '', legs: [], spread: 0, freq: 2, rating: 'AA+', seniority: 'Govt' },
  };
}

/** Days to ask for, newest first: today and the nine days before it, weekends left out. */
export function candidateDays(today: Date, count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < count && i < count * 2; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const fedinvest = createStore<{ state: 'off' | 'loading' | 'ready' | 'error'; latest?: FedDay; prev?: FedDay; error?: string }>({ state: 'off' });

export function fedInvestAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.fedinvest === 'function';
}

/** The security of each priced note and bond, by CUSIP, once loaded. */
const byCusip = new Map<string, string>();
const owned = new Set<string>();

export function treasuryIdByCusip(cusip: string): string | undefined {
  return byCusip.get(cusip);
}

/** The desktop app's securities that FedInvest prices (its list of real sources counts them). */
export function fedinvestOwns(id: string): boolean {
  return owned.has(id);
}

/** Adds each note and bond with a price as a security, its Sell price as the day's close (Buy as the ask). */
function addSecurities(latest: FedDay, prev?: FedDay) {
  const seen = new Map<string, number>();
  const defs: SecurityDef[] = [];
  const daily: [string, { day: number; o: number; h: number; l: number; c: number; v: number }[]][] = [];
  for (const r of latest.rows.values()) {
    if ((r.type !== 'Notes' && r.type !== 'Bonds') || !Number.isFinite(r.sell)) continue;
    let ticker = treasuryTicker(r);
    // Two issues with the same coupon and maturity keep the name, told apart by CUSIP.
    const n = seen.get(ticker) ?? 0;
    seen.set(ticker, n + 1);
    if (n) ticker = `${ticker} ${r.cusip}`;
    const def = treasuryDef(r, ticker);
    const bars: { day: number; o: number; h: number; l: number; c: number; v: number }[] = [];
    const p = prev?.rows.get(r.cusip);
    if (p && Number.isFinite(p.sell)) bars.push({ day: isoToDay(prev!.date), o: p.sell, h: p.sell, l: p.sell, c: p.sell, v: 0 });
    bars.push({ day: isoToDay(latest.date), o: r.sell, h: r.sell, l: r.sell, c: r.sell, v: 0 });
    defs.push(def);
    daily.push([def.id, bars]);
    byCusip.set(r.cusip, def.id);
    owned.add(def.id);
  }
  // A def of the same name already there is the simulator's on-the-run note (the desktop app keeps it hidden, as it
  // has no source): the real one, with its CUSIP and terms, takes its place.
  engine.replaceSecurities(defs);
  for (const [id, bars] of daily) engine.setExternalDaily(id, bars, { eod: true, provider: 'TreasuryDirect FedInvest' });
  engine.flush(daily.map(([id]) => id));
}

let loading: Promise<void> | null = null;

/** Loads the latest day with prices and the one before it, once per session; the desktop app only. */
export function loadFedInvest(now = new Date()): Promise<void> {
  if (!fedInvestAvailable()) return Promise.resolve();
  if (loading) return loading;
  fedinvest.set((s) => ({ ...s, state: 'loading' }));
  loading = (async () => {
    const found: FedDay[] = [];
    try {
      for (const date of candidateDays(now)) {
        const res = await window.arminDesktop!.fedinvest(date);
        if (res.status !== 200) throw new Error(`FedInvest answered ${res.status}`);
        const rows = parseFedInvest(res.text);
        if (!hasPrices(rows)) continue;
        found.push({ date, rows: new Map(rows.map((r) => [r.cusip, r])) });
        if (found.length === 2) break;
      }
      if (!found.length) throw new Error('FedInvest has no prices for the last ten business days');
      addSecurities(found[0], found[1]);
      fedinvest.set({ state: 'ready', latest: found[0], prev: found[1] });
    } catch (e) {
      loading = null;
      fedinvest.set({ state: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return loading;
}
