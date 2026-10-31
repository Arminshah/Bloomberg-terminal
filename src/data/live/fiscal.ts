import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { KeyedAnswer } from './lookup';

/**
 * The U.S. Treasury's marketable debt for DEBTPROFILE T (desktop app, no key), from Fiscal Data: the Monthly Statement
 * of the Public Debt's table 3 (every marketable security outstanding at the month's end, with its CUSIP, interest
 * rate, maturity and amount) and the Treasury's average interest rates. Amounts are in millions of dollars as the
 * statement gives them; TIPS include their inflation adjustment. Not prices or yields.
 */

export type DebtClass = 'Bills' | 'Notes' | 'Bonds' | 'TIPS' | 'FRN';

export interface TreasurySecurity {
  cusip: string;
  cls: DebtClass;
  /** The interest rate the statement gives (a TIPS' real coupon, an FRN's spread); NaN for bills. */
  rate: number;
  /** YYYY-MM-DD */
  maturity: string;
  /** Millions of dollars outstanding (all issues of the CUSIP together). */
  outstanding: number;
  /** The first issue's date (YYYY-MM-DD; reopenings come later), or '' when the statement gives none. */
  issue: string;
}

export interface PublicDebt {
  /** The statement's date, the month's last day (YYYY-MM-DD). */
  recordDate: string;
  securities: TreasurySecurity[];
  /** The statement's own unmatured totals by class, in millions. */
  statedByClass: Partial<Record<DebtClass, number>>;
  /** The statement's total marketable debt (unmatured, matured not yet redeemed and the Federal Financing Bank). */
  statedTotal: number;
}

const CLASS: Record<string, DebtClass> = {
  'Bills Maturity Value': 'Bills',
  Notes: 'Notes',
  Bonds: 'Bonds',
  'Inflation-Protected Securities': 'TIPS',
  'Floating Rate Notes': 'FRN',
};
/** The statement's subtotal rows of unmatured securities, by class. */
const UNMATURED: Record<string, DebtClass> = {
  'Total Unmatured Treasury Bills': 'Bills',
  'Total Unmatured Treasury Notes': 'Notes',
  'Total Unmatured Treasury Bonds': 'Bonds',
  'Total Treasury TIPS': 'TIPS',
  'Total Treasury Floating Rate Notes': 'FRN',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const amount = (v: any) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The latest statement in an answer of table 3 (newest first), or what is wrong with it. */
export function parseMspd(text: string): PublicDebt | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Fiscal Data answered with something other than its data.' };
  }
  const rows: any[] = Array.isArray(j?.data) ? j.data : [];
  if (!rows.length) return { error: j?.error ? `Fiscal Data: ${String(j.message ?? j.error).slice(0, 120)}` : 'Fiscal Data gave no rows.' };
  const recordDate = rows.map((r) => String(r?.record_date ?? '')).filter((d) => ISO.test(d)).sort().pop() ?? '';
  const month = rows.filter((r) => r?.record_date === recordDate);
  const total = month.find((r) => r?.security_class1_desc === 'Total Marketable');
  // The month's total row closes the statement: without it the answer was cut short.
  if (!recordDate || !total) return { error: "Fiscal Data's answer did not hold the whole statement." };
  const securities: TreasurySecurity[] = [];
  const statedByClass: Partial<Record<DebtClass, number>> = {};
  for (const r of month) {
    const cls = CLASS[String(r?.security_class1_desc ?? '')];
    const id = String(r?.security_class2_desc ?? '');
    const out = amount(r?.outstanding_amt);
    if (UNMATURED[id] && Number.isFinite(out)) statedByClass[UNMATURED[id]] = out;
    // One line per CUSIP carries the amount outstanding; the lines after it are its reopenings (amount "null").
    if (!cls || !/^[0-9A-Z]{9}$/.test(id) || !Number.isFinite(out) || !ISO.test(String(r?.maturity_date ?? ''))) continue;
    securities.push({ cusip: id, cls, rate: amount(r?.interest_rate_pct), maturity: r.maturity_date, outstanding: out, issue: ISO.test(String(r?.issue_date ?? '')) ? r.issue_date : '' });
  }
  return { recordDate, securities, statedByClass, statedTotal: amount(total.outstanding_amt) };
}

export interface AvgRate {
  recordDate: string;
  /** "Treasury Bills", ..., "Total Marketable", in percent. */
  rates: Record<string, number>;
}

/** The Treasury's average interest rates on marketable debt for `recordDate` (or its latest month). */
export function parseAvgRates(text: string, recordDate?: string): AvgRate | { error: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'Fiscal Data answered with something other than its data.' };
  }
  const rows: any[] = (Array.isArray(j?.data) ? j.data : []).filter((r: any) => r?.security_type_desc === 'Marketable');
  const date = recordDate && rows.some((r) => r.record_date === recordDate) ? recordDate : rows.map((r) => String(r.record_date)).sort().pop();
  if (!date) return { error: 'Fiscal Data gave no average interest rates.' };
  const rates: Record<string, number> = {};
  for (const r of rows) if (r.record_date === date && Number.isFinite(amount(r.avg_interest_rate_amt))) rates[String(r.security_desc)] = amount(r.avg_interest_rate_amt);
  return { recordDate: date, rates };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface DebtYear {
  year: number;
  /** Millions of dollars maturing in the year. */
  amount: number;
  count: number;
  byClass: Partial<Record<DebtClass, number>>;
}

export interface DebtProfile {
  years: DebtYear[];
  /** Sum of the securities listed, by class and in all, in millions. */
  byClass: Record<DebtClass, { amount: number; count: number }>;
  total: number;
  /** Weighted by amount outstanding: years to maturity from the statement's date. */
  averageYears: number;
  /** Classes whose listed securities do not add up to the statement's own total (more than half a million apart). */
  mismatches: { cls: DebtClass; listed: number; stated: number }[];
}

export const CLASSES: DebtClass[] = ['Bills', 'Notes', 'Bonds', 'TIPS', 'FRN'];

/** The debt by maturity year and class, and whether it adds up to the statement's totals. */
export function debtProfile(d: PublicDebt): DebtProfile {
  const byYear = new Map<number, DebtYear>();
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, { amount: 0, count: 0 }])) as DebtProfile['byClass'];
  const at = Date.parse(`${d.recordDate}T00:00:00Z`);
  let total = 0;
  let years = 0;
  for (const s of d.securities) {
    const y = Number(s.maturity.slice(0, 4));
    const row = byYear.get(y) ?? { year: y, amount: 0, count: 0, byClass: {} };
    row.amount += s.outstanding;
    row.count++;
    row.byClass[s.cls] = (row.byClass[s.cls] ?? 0) + s.outstanding;
    byYear.set(y, row);
    byClass[s.cls].amount += s.outstanding;
    byClass[s.cls].count++;
    total += s.outstanding;
    years += s.outstanding * ((Date.parse(`${s.maturity}T00:00:00Z`) - at) / (365.25 * 86_400_000));
  }
  const mismatches = CLASSES.filter((c) => d.statedByClass[c] != null && Math.abs(byClass[c].amount - d.statedByClass[c]!) > 0.5).map((c) => ({ cls: c, listed: byClass[c].amount, stated: d.statedByClass[c]! }));
  return { years: [...byYear.values()].sort((a, b) => a.year - b.year), byClass, total, averageYears: total > 0 ? years / total : NaN, mismatches };
}

// ------------------------------------------------------------------ loading

export interface FiscalPart {
  state: 'loading' | 'ok' | 'error';
  text?: string;
  at?: number;
  message?: string;
}

export const fiscalData = createStore<{ v: number; by: Record<string, FiscalPart> }>({ v: 0, by: {} });

export function fiscalAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.fiscal === 'function';
}

export function fiscalProblem(res: KeyedAnswer): string {
  if (res.status === 429 || res.throttled) return 'Fiscal Data asked the app to wait (rate limit); it asks again later.';
  if (res.status >= 500) return `Fiscal Data failed (HTTP ${res.status}).`;
  if (!res.status) return res.error ? `Fiscal Data: ${res.error.slice(0, 100)}` : 'Fiscal Data did not answer (network or service).';
  return `Fiscal Data answered HTTP ${res.status}.`;
}

const asked = new Map<string, number>();

async function load(kind: 'mspd' | 'avg-rates') {
  const api = window.arminDesktop;
  if (!api?.fiscal) return;
  asked.set(kind, Date.now());
  const put = (p: FiscalPart) => fiscalData.set((s) => ({ v: s.v + 1, by: { ...s.by, [kind]: p } }));
  if (!fiscalData.get().by[kind]) put({ state: 'loading' });
  try {
    const res = await api.fiscal(kind);
    if (res.text) put({ state: 'ok', text: res.text, at: res.at ?? Date.now() });
    else put({ state: 'error', message: fiscalProblem(res) });
  } catch {
    put({ state: 'error', message: 'The Fiscal Data request could not be completed.' });
  }
}

/** The statement and the average rates while DEBTPROFILE T shows them: asked on opening, then every six hours. */
export function useFiscal(): { mspd?: FiscalPart; rates?: FiscalPart } {
  fiscalData.use((s) => s.v);
  useEffect(() => {
    if (!fiscalAvailable()) return;
    for (const k of ['mspd', 'avg-rates'] as const) if (Date.now() - (asked.get(k) ?? 0) > 60_000) void load(k);
    const t = setInterval(() => {
      void load('mspd');
      void load('avg-rates');
    }, 6 * 3_600_000);
    return () => clearInterval(t);
  }, []);
  const by = fiscalData.get().by;
  return { mspd: by.mspd, rates: by['avg-rates'] };
}
