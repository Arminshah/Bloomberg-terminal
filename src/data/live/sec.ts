import { useCallback, useEffect, useState } from 'react';
import type { SecurityDef } from '../types';
import { useRefresh, type RefreshOutcome } from '../../terminal/refresh';

/**
 * SEC EDGAR, through the desktop app's main process (electron/sec.cjs): the
 * SEC's company list (ticker to CIK), each company's filing history
 * (data.sec.gov submissions) and the financial facts tagged in its XBRL
 * filings (data.sec.gov company facts). EDGAR is a filings and reported-figures
 * source, never a price source. Nothing goes to the SEC until the owner has
 * configured a User-Agent with their own contact email (SEC_USER_AGENT).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SecAnswer {
  status: number;
  text: string;
  /** When the main process fetched this copy (epoch ms). */
  at?: number;
  cached?: boolean;
  /** A refresh failed and this is the copy fetched at `at`. */
  stale?: boolean;
  missing?: string;
  refused?: string;
  error?: string;
}

export type SecKind = 'tickers' | 'submissions' | 'submissions-page' | 'facts' | 'filing-index' | 'filing-xbrl' | 'ownership-xml' | 'fts' | 'search';

export type SecResult<T> =
  | { ok: true; data: T; at: number; stale?: boolean }
  | { ok: false; reason: 'desktop-only' | 'needs-agent' | 'refused' | 'not-found' | 'error'; message: string };

export function secAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.sec === 'function';
}

export const SEC_DESKTOP_ONLY = 'SEC EDGAR is read by the desktop app: data.sec.gov does not accept requests from web pages on other sites.';
export const SEC_NEEDS_AGENT =
  'The SEC asks every program that reads EDGAR to identify itself with a name and a contact email. Set SEC_USER_AGENT on the provider screen (PROVIDERS), for example "Armin Terminal you@yourdomain.com". Nothing is sent to the SEC until it is set.';

/** Fetches one SEC file through the main process and parses it. */
async function secFetch<T>(kind: SecKind, arg: string, parse: (text: string) => T | null): Promise<SecResult<T>> {
  if (!secAvailable()) return { ok: false, reason: 'desktop-only', message: SEC_DESKTOP_ONLY };
  let res: SecAnswer;
  try {
    res = await window.arminDesktop!.sec!(kind, arg);
  } catch (err) {
    return { ok: false, reason: 'error', message: `The request did not complete: ${String((err as Error)?.message ?? err)}` };
  }
  if (res.missing) return { ok: false, reason: 'needs-agent', message: SEC_NEEDS_AGENT };
  if (res.refused) return { ok: false, reason: 'refused', message: res.refused };
  if (res.text) {
    const data = parse(res.text);
    if (data == null) return { ok: false, reason: 'error', message: 'The SEC answered in a format the app does not recognise.' };
    return { ok: true, data, at: res.at ?? Date.now(), ...(res.stale ? { stale: true } : {}) };
  }
  if (res.status === 404) return { ok: false, reason: 'not-found', message: 'The SEC has no such file.' };
  if (res.status === 403) return { ok: false, reason: 'refused', message: 'The SEC refused the request (HTTP 403). It refuses requests without a proper User-Agent and clients over its rate limit.' };
  return { ok: false, reason: 'error', message: res.error ? `The SEC did not answer: ${res.error}` : `The SEC answered HTTP ${res.status}.` };
}

// ------------------------------------------------------------ company list

export interface SecCompany {
  cik: number;
  ticker: string;
  title: string;
}

/**
 * www.sec.gov/files/company_tickers.json: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}.
 * The SEC notes the list is updated periodically, without a guarantee of accuracy or scope.
 */
export function parseTickers(text: string): SecCompany[] | null {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const out: SecCompany[] = [];
  for (const row of Object.values(json) as any[]) {
    const cik = Number(row?.cik_str);
    const ticker = typeof row?.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
    const title = typeof row?.title === 'string' ? row.title.trim() : '';
    if (Number.isInteger(cik) && cik > 0 && ticker) out.push({ cik, ticker, title });
  }
  return out.length ? out : null;
}

/** A ticker in the SEC's spelling: BRK/B, BRK.B and BRK-B all become BRK-B. */
export function secTickerKey(t: string): string {
  return t.trim().toUpperCase().replace(/[./]/g, '-');
}

/** The SEC ticker for a security in the app: US-listed equities only. */
export function secTicker(def: SecurityDef | undefined): string | null {
  if (!def || def.cls !== 'equity') return null;
  const m = /^(\S+) US$/.exec(def.ticker);
  return m ? secTickerKey(m[1]) : null;
}

export function findByTicker(list: SecCompany[], ticker: string): SecCompany | undefined {
  const key = secTickerKey(ticker);
  return list.find((c) => secTickerKey(c.ticker) === key);
}

/** Companies whose ticker starts with, or whose name contains, the query; exact tickers first. */
export function searchCompanies(list: SecCompany[], query: string, max = 40): SecCompany[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  if (/^(CIK)?\d{1,10}$/.test(q)) {
    const cik = Number(q.replace(/^CIK/, ''));
    return list.filter((c) => c.cik === cik).slice(0, max);
  }
  const key = secTickerKey(q);
  const exact = list.filter((c) => secTickerKey(c.ticker) === key);
  const prefix = list.filter((c) => secTickerKey(c.ticker) !== key && secTickerKey(c.ticker).startsWith(key));
  const named = list.filter((c) => !secTickerKey(c.ticker).startsWith(key) && c.title.toUpperCase().includes(q));
  const seen = new Set<string>();
  const out: SecCompany[] = [];
  for (const c of [...exact, ...prefix, ...named]) {
    const k = `${c.cik}:${c.ticker}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export function cik10(cik: number): string {
  return String(cik).padStart(10, '0');
}

// ------------------------------------------------------------- filings

export interface Filing {
  accession: string;
  form: string;
  /** Filing date (YYYY-MM-DD), the date the SEC deems the filing made. */
  filed: string;
  /** Period of the report, when the form has one. */
  report?: string;
  /** EDGAR's acceptance timestamp exactly as the submissions file gives it. */
  accepted?: string;
  /** Primary document file name. */
  doc?: string;
  /** Primary document description. */
  desc?: string;
  /** 8-K item numbers, e.g. ["2.02", "9.01"]. */
  items?: string[];
  size?: number;
  xbrl?: boolean;
}

export interface FilingPage {
  name: string;
  count: number;
  from: string;
  to: string;
}

export interface SecFiler {
  cik: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic?: string;
  sicDescription?: string;
  category?: string;
  entityType?: string;
  /** Fiscal year end as MMDD. */
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  /** The business address's city and state (or country), as EDGAR gives them. */
  address?: { city: string; region?: string };
  formerNames: { name: string; from?: string; to?: string }[];
  /** Recent filings, newest first. */
  filings: Filing[];
  /** Older filings, in extra files. */
  pages: FilingPage[];
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filings from the SEC's column arrays (filings.recent, or the top level of an extra file). */
export function parseFilingColumns(cols: any): Filing[] {
  const acc: unknown[] = Array.isArray(cols?.accessionNumber) ? cols.accessionNumber : [];
  const col = (name: string, i: number): unknown => (Array.isArray(cols?.[name]) ? cols[name][i] : undefined);
  const out: Filing[] = [];
  for (let i = 0; i < acc.length; i++) {
    const accession = str(acc[i]);
    const form = str(col('form', i));
    const filed = str(col('filingDate', i));
    if (!accession || !/^\d{10}-\d{2}-\d{6}$/.test(accession) || !form || !filed || !DATE.test(filed)) continue;
    const report = str(col('reportDate', i));
    const items = str(col('items', i));
    const size = Number(col('size', i));
    const xbrl = col('isXBRL', i);
    out.push({
      accession,
      form,
      filed,
      ...(report && DATE.test(report) ? { report } : {}),
      ...(str(col('acceptanceDateTime', i)) ? { accepted: str(col('acceptanceDateTime', i)) } : {}),
      ...(str(col('primaryDocument', i)) ? { doc: str(col('primaryDocument', i)) } : {}),
      ...(str(col('primaryDocDescription', i)) ? { desc: str(col('primaryDocDescription', i)) } : {}),
      ...(items ? { items: items.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
      ...(Number.isFinite(size) && size > 0 ? { size } : {}),
      ...(xbrl === 1 || xbrl === true ? { xbrl: true } : {}),
    });
  }
  return out.sort((a, b) => (a.filed === b.filed ? (b.accepted ?? '').localeCompare(a.accepted ?? '') : b.filed.localeCompare(a.filed)));
}

/** data.sec.gov/submissions/CIK##########.json. */
export function parseSubmissions(text: string): SecFiler | null {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const cik = Number(json?.cik);
  if (!Number.isInteger(cik) || cik <= 0 || !json?.filings) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
  const pages: FilingPage[] = [];
  for (const f of Array.isArray(json.filings.files) ? json.filings.files : []) {
    const name = str(f?.name);
    if (name && /^CIK\d{10}-submissions-\d{3}\.json$/.test(name)) pages.push({ name, count: Number(f.filingCount) || 0, from: str(f.filingFrom) ?? '', to: str(f.filingTo) ?? '' });
  }
  return {
    cik,
    name: str(json.name) ?? `CIK ${cik}`,
    tickers: list(json.tickers),
    exchanges: list(json.exchanges),
    ...(str(json.sic) ? { sic: str(json.sic) } : {}),
    ...(str(json.sicDescription) ? { sicDescription: str(json.sicDescription) } : {}),
    ...(str(json.category) ? { category: str(json.category) } : {}),
    ...(str(json.entityType) ? { entityType: str(json.entityType) } : {}),
    ...(str(json.fiscalYearEnd) && /^\d{4}$/.test(json.fiscalYearEnd) ? { fiscalYearEnd: json.fiscalYearEnd } : {}),
    ...(str(json.stateOfIncorporation) ? { stateOfIncorporation: str(json.stateOfIncorporation) } : {}),
    ...(str(json.addresses?.business?.city) ? { address: { city: str(json.addresses.business.city)!, ...(str(json.addresses.business.stateOrCountryDescription ?? json.addresses.business.stateOrCountry) ? { region: str(json.addresses.business.stateOrCountryDescription ?? json.addresses.business.stateOrCountry) } : {}) } } : {}),
    formerNames: (Array.isArray(json.formerNames) ? json.formerNames : [])
      .map((n: any) => ({ name: str(n?.name) ?? '', from: str(n?.from)?.slice(0, 10), to: str(n?.to)?.slice(0, 10) }))
      .filter((n: { name: string }) => n.name),
    filings: parseFilingColumns(json.filings.recent),
    pages,
  };
}

/** An earnings release as the company filed it: an 8-K with item 2.02 (results of operations). */
export interface EarningsRelease {
  /** Filing date, YYYY-MM-DD (the SEC's date, US Eastern). */
  date: string;
  /** EDGAR's acceptance time (ms), when given. */
  at?: number;
  /** Before the open or after the close, from the acceptance time; '--' during the session or without a time. */
  timing: 'Bef-mkt' | 'Aft-mkt' | '--';
  accession: string;
}

/** The New York hour (with minutes as a fraction) of an instant. */
function newYorkHour(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms));
  return Number(parts.find((p) => p.type === 'hour')?.value) + Number(parts.find((p) => p.type === 'minute')?.value) / 60;
}

/**
 * The company's earnings releases (8-K item 2.02), newest first. The 8-K can follow the press release by hours, so its
 * acceptance time proves only an earlier release: accepted before 9:30 New York time means a release before the open;
 * accepted from 16:00 on is counted after the close; one accepted during the session leaves the session unknown.
 */
export function earningsReleases(filings: Filing[]): EarningsRelease[] {
  return filings
    .filter((f) => /^8-K$/.test(f.form) && f.items?.includes('2.02'))
    .map((f) => {
      const at = f.accepted ? Date.parse(f.accepted) : NaN;
      const h = Number.isFinite(at) ? newYorkHour(at) : NaN;
      // The day of the release is the New York day of the acceptance (EDGAR can date an evening filing the next day).
      const day = Number.isFinite(at) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(at)) : f.filed;
      const timing: EarningsRelease['timing'] = !Number.isFinite(h) ? '--' : h < 9.5 ? 'Bef-mkt' : h >= 16 ? 'Aft-mkt' : '--';
      return { date: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : f.filed, ...(Number.isFinite(at) ? { at } : {}), timing, accession: f.accession };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** An extra submissions file: the same columns at the top level. */
export function parseFilingPage(text: string): Filing[] | null {
  try {
    const json = JSON.parse(text);
    return Array.isArray(json?.accessionNumber) ? parseFilingColumns(json) : null;
  } catch {
    return null;
  }
}

/** Links to a filing on sec.gov: its primary document and its index page (all documents). */
export function filingLinks(cik: number, f: Filing): { doc?: string; index: string } {
  const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accession.replace(/-/g, '')}`;
  return {
    ...(f.doc ? { doc: `${folder}/${f.doc}` } : {}),
    index: `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accession}-index.html`,
  };
}

export type FormGroup = 'periodic' | 'current' | 'ownership' | 'proxy' | 'offering' | 'other';

export const FORM_GROUPS: { group: FormGroup; label: string; about: string }[] = [
  { group: 'periodic', label: 'Annual & quarterly', about: '10-K, 10-Q, 20-F, 40-F and their amendments and late-filing notices' },
  { group: 'current', label: 'Current reports', about: '8-K (and 6-K for foreign issuers): results, agreements, officer changes and other events' },
  { group: 'ownership', label: 'Ownership', about: 'Insiders\' Forms 3, 4 and 5, Form 144 notices, and Schedules 13D and 13G' },
  { group: 'proxy', label: 'Proxies', about: 'Proxy and information statements (DEF 14A and related)' },
  { group: 'offering', label: 'Offerings', about: 'Registration statements and prospectuses (S-1, S-3, S-8, F-1, 424B and related)' },
  { group: 'other', label: 'Other', about: 'Everything else, such as SEC correspondence and exhibits filed on their own' },
];

export function formGroup(form: string): FormGroup {
  const f = form.toUpperCase().trim();
  if (/^(10-K|10-Q|20-F|40-F|10-KT|10-QT|NT 10-K|NT 10-Q|NT 20-F|10-K405|ARS)(\/A)?\b/.test(f)) return 'periodic';
  if (/^(8-K|6-K)/.test(f)) return 'current';
  if (/^(3|4|5|144)(\/A)?$/.test(f) || /^(SC|SCHEDULE) 13[DG]/.test(f)) return 'ownership';
  if (/^(DEF|PRE|DFAN|PRER|DEFR|DEFM|PREM)\s?14[AC]|^DEFA14|^PX14A6/.test(f)) return 'proxy';
  if (/^(S-1|S-3|S-4|S-8|S-11|F-1|F-3|F-4|F-10|424B|FWP|POS AM|POSASR|S-3ASR|RW|EFFECT)/.test(f)) return 'offering';
  return 'other';
}

/** Form 8-K items, by number (Form 8-K general instructions). */
export const EIGHT_K_ITEMS: Record<string, string> = {
  '1.01': 'Entry into a material definitive agreement',
  '1.02': 'Termination of a material definitive agreement',
  '1.03': 'Bankruptcy or receivership',
  '1.04': 'Mine safety: shutdowns and patterns of violations',
  '1.05': 'Material cybersecurity incidents',
  '2.01': 'Completion of acquisition or disposition of assets',
  '2.02': 'Results of operations and financial condition',
  '2.03': 'Creation of a direct financial obligation',
  '2.04': 'Triggering events that accelerate or increase a financial obligation',
  '2.05': 'Costs associated with exit or disposal activities',
  '2.06': 'Material impairments',
  '3.01': 'Delisting or failure to satisfy a listing rule; transfer of listing',
  '3.02': 'Unregistered sales of equity securities',
  '3.03': 'Material modification to rights of security holders',
  '4.01': 'Changes in the certifying accountant',
  '4.02': 'Non-reliance on previously issued financial statements',
  '5.01': 'Changes in control of the registrant',
  '5.02': 'Departure or election of directors or officers; compensatory arrangements',
  '5.03': 'Amendments to articles or bylaws; change in fiscal year',
  '5.04': 'Temporary suspension of trading under employee benefit plans',
  '5.05': 'Amendments to or waivers of the code of ethics',
  '5.06': 'Change in shell company status',
  '5.07': 'Submission of matters to a vote of security holders',
  '5.08': 'Shareholder director nominations',
  '6.01': 'ABS informational and computational material',
  '6.02': 'Change of servicer or trustee',
  '6.03': 'Change in credit enhancement or other external support',
  '6.04': 'Failure to make a required distribution',
  '6.05': 'Securities Act updating disclosure',
  '6.06': 'Static pool',
  '7.01': 'Regulation FD disclosure',
  '8.01': 'Other events',
  '9.01': 'Financial statements and exhibits',
};

// ----------------------------------------------------- reported facts (XBRL)

export interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}

/** taxonomy:concept -> unit -> facts, for the concepts the app reads. */
export type FactTable = Record<string, Record<string, XbrlFact[]>>;

export interface CompanyFacts {
  cik: number;
  name: string;
  facts: FactTable;
  /**
   * Accession -> the end of the filing's own reporting period: the latest end
   * among its period figures. XBRL's fiscal year and period (fy, fp) describe
   * the filing, not each figure in it, so a prior-year comparative carries the
   * later filing's fy; this lets a column be named by counting back.
   */
  ownEnd: Record<string, string>;
}

export type Measure = 'money' | 'perShare' | 'shares';

export interface FactLine {
  key: string;
  label: string;
  section: 'income' | 'cash' | 'balance';
  /** flow: over a period (start to end); stock: at a date. */
  kind: 'flow' | 'stock';
  measure: Measure;
  /** Concepts in order of preference, as taxonomy:name. */
  concepts: string[];
}

/** The figures the app reads from company facts: US GAAP concepts first, IFRS for foreign filers. */
export const FACT_LINES: FactLine[] = [
  { key: 'revenue', label: 'Revenue', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:Revenues', 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax', 'us-gaap:SalesRevenueNet', 'ifrs-full:Revenue'] },
  { key: 'cost', label: 'Cost of revenue', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:CostOfRevenue', 'us-gaap:CostOfGoodsAndServicesSold', 'us-gaap:CostOfGoodsSold', 'ifrs-full:CostOfSales'] },
  { key: 'gross', label: 'Gross profit', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:GrossProfit', 'ifrs-full:GrossProfit'] },
  { key: 'rnd', label: 'Research and development', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:ResearchAndDevelopmentExpense', 'us-gaap:ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost', 'ifrs-full:ResearchAndDevelopmentExpense'] },
  { key: 'sga', label: 'Selling, general and administrative', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:SellingGeneralAndAdministrativeExpense', 'ifrs-full:SellingGeneralAndAdministrativeExpense'] },
  { key: 'opex', label: 'Operating expenses', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:OperatingExpenses'] },
  { key: 'opInc', label: 'Operating income', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:OperatingIncomeLoss', 'ifrs-full:ProfitLossFromOperatingActivities'] },
  { key: 'interest', label: 'Interest expense', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:InterestExpense', 'us-gaap:InterestExpenseNonoperating', 'ifrs-full:FinanceCosts'] },
  { key: 'pretax', label: 'Income before income taxes', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'ifrs-full:ProfitLossBeforeTax'] },
  { key: 'tax', label: 'Income tax expense', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:IncomeTaxExpenseBenefit', 'ifrs-full:IncomeTaxExpenseContinuingOperations'] },
  { key: 'netInc', label: 'Net income (to the company\'s shareholders)', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:NetIncomeLoss', 'ifrs-full:ProfitLossAttributableToOwnersOfParent'] },
  { key: 'netCommon', label: 'Net income available to common shareholders', section: 'income', kind: 'flow', measure: 'money', concepts: ['us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic'] },
  { key: 'epsBasic', label: 'EPS, basic', section: 'income', kind: 'flow', measure: 'perShare', concepts: ['us-gaap:EarningsPerShareBasic', 'us-gaap:EarningsPerShareBasicAndDiluted', 'ifrs-full:BasicEarningsLossPerShare'] },
  { key: 'epsDil', label: 'EPS, diluted', section: 'income', kind: 'flow', measure: 'perShare', concepts: ['us-gaap:EarningsPerShareDiluted', 'us-gaap:EarningsPerShareBasicAndDiluted', 'ifrs-full:DilutedEarningsLossPerShare'] },
  { key: 'dilShares', label: 'Diluted weighted shares', section: 'income', kind: 'flow', measure: 'shares', concepts: ['us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding', 'ifrs-full:AdjustedWeightedAverageShares'] },
  { key: 'da', label: 'Depreciation, depletion and amortization', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:DepreciationDepletionAndAmortization'] },
  { key: 'cfo', label: 'Cash from operating activities', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:NetCashProvidedByUsedInOperatingActivities', 'ifrs-full:CashFlowsFromUsedInOperatingActivities'] },
  { key: 'capex', label: 'Purchases of property and equipment', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', 'ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'] },
  { key: 'cfi', label: 'Cash from investing activities', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:NetCashProvidedByUsedInInvestingActivities', 'ifrs-full:CashFlowsFromUsedInInvestingActivities'] },
  { key: 'cff', label: 'Cash from financing activities', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:NetCashProvidedByUsedInFinancingActivities', 'ifrs-full:CashFlowsFromUsedInFinancingActivities'] },
  { key: 'divPaid', label: 'Dividends paid', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:PaymentsOfDividends', 'us-gaap:PaymentsOfDividendsCommonStock', 'ifrs-full:DividendsPaidClassifiedAsFinancingActivities'] },
  { key: 'buyback', label: 'Repurchases of common stock', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:PaymentsForRepurchaseOfCommonStock'] },
  { key: 'sbc', label: 'Share-based compensation', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:ShareBasedCompensation', 'us-gaap:AllocatedShareBasedCompensationExpense'] },
  { key: 'cash', label: 'Cash and cash equivalents', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', 'ifrs-full:CashAndCashEquivalents'] },
  { key: 'recv', label: 'Accounts receivable, net', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:AccountsReceivableNetCurrent'] },
  { key: 'inv', label: 'Inventories, net', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:InventoryNet', 'ifrs-full:Inventories'] },
  { key: 'ppe', label: 'Property, plant and equipment, net', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:PropertyPlantAndEquipmentNet', 'ifrs-full:PropertyPlantAndEquipment'] },
  { key: 'curAssets', label: 'Current assets', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:AssetsCurrent', 'ifrs-full:CurrentAssets'] },
  { key: 'assets', label: 'Total assets', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:Assets', 'ifrs-full:Assets'] },
  { key: 'curLiab', label: 'Current liabilities', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:LiabilitiesCurrent', 'ifrs-full:CurrentLiabilities'] },
  { key: 'liab', label: 'Total liabilities', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:Liabilities', 'ifrs-full:Liabilities'] },
  { key: 'debtCurrent', label: 'Total debt, current', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:DebtCurrent'] },
  { key: 'ltDebtCurrent', label: 'Current portion of long-term debt', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:LongTermDebtCurrent'] },
  { key: 'shortBorrowings', label: 'Short-term borrowings', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:ShortTermBorrowings'] },
  { key: 'ltDebt', label: 'Long-term debt, non-current', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:LongTermDebtNoncurrent'] },
  { key: 'equity', label: 'Shareholders\' equity', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:StockholdersEquity', 'ifrs-full:EquityAttributableToOwnersOfParent'] },
];

/** Shares outstanding as given on each filing's cover page (dei), for the header. */
export const COVER_SHARES = 'dei:EntityCommonStockSharesOutstanding';

/**
 * BBK's extra figures: shares bought back (from the equity statement) and the repurchase program's authorization
 * and remaining amount. Not in FACT_LINES, so the financial statements do not change.
 */
export const BUYBACK_LINES: FactLine[] = [
  { key: 'bbShares', label: 'Shares repurchased', section: 'cash', kind: 'flow', measure: 'shares', concepts: ['us-gaap:StockRepurchasedDuringPeriodShares', 'us-gaap:StockRepurchasedAndRetiredDuringPeriodShares', 'us-gaap:TreasuryStockSharesAcquired'] },
  { key: 'bbValue', label: 'Repurchases in the equity statement', section: 'cash', kind: 'flow', measure: 'money', concepts: ['us-gaap:StockRepurchasedDuringPeriodValue', 'us-gaap:StockRepurchasedAndRetiredDuringPeriodValue', 'us-gaap:TreasuryStockValueAcquiredCostMethod'] },
  { key: 'bbAuth', label: 'Repurchase program authorized', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:StockRepurchaseProgramAuthorizedAmount1', 'us-gaap:StockRepurchaseProgramAuthorizedAmount'] },
  { key: 'bbRemain', label: 'Authorization remaining', section: 'balance', kind: 'stock', measure: 'money', concepts: ['us-gaap:StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1', 'us-gaap:StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount'] },
];

const WANTED = new Set([...FACT_LINES.flatMap((l) => l.concepts), ...BUYBACK_LINES.flatMap((l) => l.concepts), COVER_SHARES]);

/**
 * data.sec.gov/api/xbrl/companyfacts/CIK##########.json:
 * {cik, entityName, facts: {taxonomy: {concept: {label, description, units: {unit: [{start?, end, val, accn, fy, fp, form, filed, frame?}]}}}}}.
 * Only the concepts in FACT_LINES (and the cover-page share count) are kept.
 */
export function parseCompanyFacts(text: string): CompanyFacts | null {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const cik = Number(json?.cik);
  if (!Number.isInteger(cik) || cik <= 0 || !json?.facts || typeof json.facts !== 'object') return null;
  const facts: FactTable = {};
  const ownEnd: Record<string, string> = {};
  for (const [tax, concepts] of Object.entries(json.facts as Record<string, any>)) {
    for (const [name, def] of Object.entries((concepts ?? {}) as Record<string, any>)) {
      const key = `${tax}:${name}`;
      if (!WANTED.has(key) || !def?.units || typeof def.units !== 'object') continue;
      const units: Record<string, XbrlFact[]> = {};
      for (const [unit, rows] of Object.entries(def.units as Record<string, any[]>)) {
        const list: XbrlFact[] = [];
        for (const r of Array.isArray(rows) ? rows : []) {
          const val = typeof r?.val === 'number' ? r.val : NaN;
          const end = str(r?.end);
          const filed = str(r?.filed);
          const accn = str(r?.accn);
          const form = str(r?.form);
          if (!Number.isFinite(val) || !end || !DATE.test(end) || !filed || !DATE.test(filed) || !accn || !form) continue;
          const start = str(r?.start);
          const fy = Number(r?.fy);
          if (start && DATE.test(start) && (!ownEnd[accn] || end > ownEnd[accn])) ownEnd[accn] = end;
          list.push({ ...(start && DATE.test(start) ? { start } : {}), end, val, accn, form, filed, ...(Number.isInteger(fy) ? { fy } : {}), ...(str(r?.fp) ? { fp: str(r?.fp) } : {}) });
        }
        if (list.length) units[unit] = list;
      }
      if (Object.keys(units).length) facts[key] = units;
    }
  }
  return { cik, name: str(json.entityName) ?? `CIK ${cik}`, facts, ownEnd };
}

const DAY = 86_400_000;
function days(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY);
}

export type PeriodKind = 'annual' | 'quarter';

/**
 * A year is 52 or 53 weeks or a calendar year. A quarter is a calendar quarter
 * or 12 to 16 weeks: some retailers report quarters of 12 and 16 weeks.
 */
export function periodKind(start: string | undefined, end: string): PeriodKind | null {
  if (!start) return null;
  const d = days(start, end);
  if (d >= 350 && d <= 380) return 'annual';
  if (d >= 80 && d <= 115) return 'quarter';
  return null;
}

/** Length of a period in days, for its description. */
export function periodDays(start: string, end: string): number {
  return days(start, end) + 1;
}

export interface ReportingCurrency {
  currency: string;
  latestPeriod: string;
  latestFiled: string;
  lines: number;
}

/** Latest monetary reporting period first; archive size must not favor an obsolete currency. */
export function reportingCurrencies(facts: FactTable): ReportingCurrency[] {
  const units = new Map<string, { latestPeriod: string; latestFiled: string; lines: Set<string> }>();
  for (const line of FACT_LINES) {
    if (line.measure !== 'money') continue;
    for (const c of line.concepts) for (const [u, rows] of Object.entries(facts[c] ?? {})) {
      if (!/^[A-Z]{3}$/.test(u)) continue;
      for (const r of rows) {
        const unit = units.get(u) ?? { latestPeriod: '', latestFiled: '', lines: new Set<string>() };
        if (r.end > unit.latestPeriod) {
          unit.latestPeriod = r.end;
          unit.latestFiled = r.filed;
          unit.lines.clear();
        }
        if (r.end === unit.latestPeriod) {
          unit.latestFiled = r.filed > unit.latestFiled ? r.filed : unit.latestFiled;
          unit.lines.add(line.key);
        }
        units.set(u, unit);
      }
    }
  }
  return [...units].map(([currency, unit]) => ({ currency, latestPeriod: unit.latestPeriod, latestFiled: unit.latestFiled, lines: unit.lines.size }))
    .sort((a, b) => b.latestPeriod.localeCompare(a.latestPeriod) || b.latestFiled.localeCompare(a.latestFiled) || b.lines - a.lines || a.currency.localeCompare(b.currency));
}

export function reportingCurrency(facts: FactTable): string {
  return reportingCurrencies(facts)[0]?.currency ?? 'USD';
}

export interface Reported {
  val: number;
  concept: string;
  unit: string;
  start?: string;
  end: string;
  /** The most recent filing that gave this period's figure. */
  form: string;
  filed: string;
  accn: string;
  /** The first filing that gave it, with the figure it gave then. */
  orig: { val: number; form: string; filed: string; accn: string; fy?: number; fp?: string };
  /** A later filing changed the figure (restated or reclassified). */
  restated: boolean;
  /** Additive quarterly money flow calculated from two cumulative disclosures. */
  derived?: { method: 'difference'; current: XbrlFact; previous: XbrlFact };
}

/** Facts for one period, reduced to the latest figure and the original one. */
function reported(concept: string, unit: string, group: XbrlFact[]): Reported {
  const byFiled = [...group].sort((a, b) => a.filed.localeCompare(b.filed) || a.accn.localeCompare(b.accn));
  const first = byFiled[0];
  const last = byFiled[byFiled.length - 1];
  return {
    val: last.val,
    concept,
    unit,
    ...(last.start ? { start: last.start } : {}),
    end: last.end,
    form: last.form,
    filed: last.filed,
    accn: last.accn,
    orig: { val: first.val, form: first.form, filed: first.filed, accn: first.accn, ...(first.fy != null ? { fy: first.fy } : {}), ...(first.fp ? { fp: first.fp } : {}) },
    restated: first.val !== last.val,
  };
}

/** Every reported period of a line, by period end, from the first concept that has that period. */
export function lineValues(facts: FactTable, line: FactLine, ccy: string, kind: PeriodKind): Map<string, Reported> {
  const unit = line.measure === 'money' ? ccy : line.measure === 'perShare' ? `${ccy}/shares` : 'shares';
  const out = new Map<string, Reported>();
  for (const concept of line.concepts) {
    const rows = facts[concept]?.[unit];
    if (!rows?.length) continue;
    const groups = new Map<string, XbrlFact[]>();
    for (const r of rows) {
      if (line.kind === 'flow' ? periodKind(r.start, r.end) !== kind : r.start != null) continue;
      const k = line.kind === 'flow' ? `${r.start}/${r.end}` : r.end;
      const g = groups.get(k);
      if (g) g.push(r);
      else groups.set(k, [r]);
    }
    for (const g of groups.values()) {
      // Twelve-month figures inside a 10-Q can be trailing totals rather than
      // fiscal years. Require an annual filing or explicit FY classification
      // for this exact start/end period before treating it as an annual column.
      if (line.kind === 'flow' && kind === 'annual' && !g.some((r) => r.fp === 'FY' || /^(?:10-K(?:405|T)?|20-F|40-F)(?:\/A)?$/.test(r.form))) continue;
      const rep = reported(concept, unit, g);
      // A period one concept already gave keeps it: the preferred concept wins.
      if (!out.has(rep.end)) out.set(rep.end, rep);
    }
  }
  return out;
}

/**
 * A standalone quarter from aligned cumulative disclosures. Only monetary
 * flows are additive: EPS and weighted share counts must never be subtracted.
 * Prefer the two disclosures in one filing, otherwise use the latest earlier
 * disclosure available when the cumulative total was filed. Preserve both
 * inputs so a calculated value can never be mistaken for a reported fact.
 */
export function standaloneQuarterValues(facts: FactTable, line: FactLine, ccy: string): Map<string, Reported> {
  const out = lineValues(facts, line, ccy, 'quarter');
  if (line.kind !== 'flow' || line.measure !== 'money') return out;
  for (const concept of line.concepts) {
    const rows = facts[concept]?.[ccy] ?? [];
    const cumulative = rows.filter((r) => r.start && days(r.start, r.end) >= 160 && days(r.start, r.end) <= 380);
    // Latest cumulative report at each end; a directly reported quarter always wins.
    cumulative.sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
    for (const current of cumulative) {
      if (out.has(current.end)) continue;
      const prior = rows.filter((r) => r.start === current.start && r.start != null && days(r.start, r.end) >= 80 && r.end < current.end && periodKind(new Date(Date.parse(r.end) + DAY).toISOString().slice(0, 10), current.end) === 'quarter' && r.filed <= current.filed)
        .sort((a, b) => Number(b.accn === current.accn) - Number(a.accn === current.accn) || b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))[0];
      if (!prior) continue;
      const start = new Date(Date.parse(prior.end) + DAY).toISOString().slice(0, 10);
      const val = current.val - prior.val;
      if (!Number.isFinite(val)) continue;
      const rep = reported(concept, ccy, [current]);
      out.set(current.end, { ...rep, start, val, derived: { method: 'difference', current, previous: prior } });
    }
  }
  return out;
}

export interface PeriodColumn {
  end: string;
  start?: string;
  kind: PeriodKind;
  /** Fiscal label, e.g. "FY2025" or "Q3 FY2025", when the filings establish it. */
  label?: string;
}

const YEAR_MS = 365.2425 * DAY;

/**
 * The fiscal name of a period from the first filing that reported it: that
 * filing's fiscal year and period, counted back by whole years when the
 * figure is a comparative for an earlier year. No name when the dates do not
 * line up (the filing's own period is unknown, or the gap is not whole years).
 */
export function fiscalLabel(rep: Reported, kind: PeriodKind, ownEnd: Record<string, string>): string | undefined {
  const { fy, fp, accn } = rep.orig;
  const own = ownEnd[accn];
  if (fy == null || !fp || !own) return undefined;
  const gap = Date.parse(own) - Date.parse(rep.end);
  const years = Math.round(gap / YEAR_MS);
  if (years < 0 || Math.abs(gap - years * YEAR_MS) > 20 * DAY) return undefined;
  const year = fy - years;
  if (kind === 'annual') return fp === 'FY' ? `FY${year}` : undefined;
  if (/^Q[1-3]$/.test(fp)) return `${fp} FY${year}`;
  // A three-month figure first given in an annual report is its fourth quarter.
  return fp === 'FY' ? `Q4 FY${year}` : undefined;
}

/**
 * The periods to show, oldest first: the ends of reported income statement
 * figures of the chosen length. For quarters, fiscal year ends are added
 * (their balance sheets are in the annual report, and most companies file no
 * separate fourth-quarter figures). With deriveQuarters enabled, cash-flow
 * disclosures also establish real period ends even if income tags are absent.
 */
export function periodColumns(cf: CompanyFacts, ccy: string, kind: PeriodKind, max: number, deriveQuarters = false): PeriodColumn[] {
  const cols = new Map<string, PeriodColumn>();
  let annualThrough: string | undefined;
  const consider = (k: PeriodKind) => {
    for (const line of FACT_LINES) {
      // Share counts carry no currency and must not create empty modern columns
      // while viewing a discontinued reporting currency.
      if (line.kind !== 'flow' || (line.section !== 'income' && !(deriveQuarters && line.section === 'cash')) || line.measure === 'shares') continue;
      for (const rep of (deriveQuarters && k === 'quarter' ? standaloneQuarterValues(cf.facts, line, ccy) : lineValues(cf.facts, line, ccy, k)).values()) {
        if (annualThrough && k === 'annual' && rep.end > annualThrough) continue;
        if (cols.has(rep.end)) continue;
        const label = fiscalLabel(rep, k, cf.ownEnd);
        cols.set(rep.end, { end: rep.end, ...(rep.start ? { start: rep.start } : {}), kind: k, ...(label ? { label } : {}) });
      }
    }
  };
  consider(kind);
  if (kind === 'quarter' && cols.size) {
    // Include the following fiscal year-end balance sheet, but never years of
    // empty annual columns after quarterly tagging stopped.
    const lastQuarter = [...cols.keys()].sort().at(-1)!;
    annualThrough = new Date(Date.parse(lastQuarter) + 120 * DAY).toISOString().slice(0, 10);
    consider('annual');
  }
  return [...cols.values()].sort((a, b) => a.end.localeCompare(b.end)).slice(-max);
}

/** The latest cover-page share count: shares outstanding as of the date on the filing's cover. */
export function coverShares(facts: FactTable): Reported | null {
  const rows = facts[COVER_SHARES]?.shares;
  if (!rows?.length) return null;
  const latest = [...rows].sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed)).pop()!;
  return reported(COVER_SHARES, 'shares', [latest]);
}

// ---------------------------------------------------------------- loading

interface Kept<T> {
  at: number;
  result: SecResult<T>;
  promise?: Promise<SecResult<T>>;
}

const kept = new Map<string, Kept<unknown>>();

/** One request per file at a time; a good answer is reused for `ttl`. */
function load<T>(kind: SecKind, arg: string, ttl: number, parse: (text: string) => T | null, force = false): Promise<SecResult<T>> {
  const key = `${kind}:${arg}`;
  const k = kept.get(key) as Kept<T> | undefined;
  if (k?.promise) return k.promise;
  if (k && !force && k.result.ok && Date.now() - k.at < ttl) return Promise.resolve(k.result);
  const promise = secFetch(kind, arg, parse).then((result) => {
    kept.set(key, { at: Date.now(), result });
    return result;
  });
  kept.set(key, { at: k?.at ?? 0, result: (k?.result ?? { ok: false, reason: 'error', message: 'loading' }) as SecResult<T>, promise });
  return promise;
}

export const loadSecCompanies = (force = false) => load('tickers', '', 24 * 3600_000, parseTickers, force);
export const loadFiler = (cik: number, force = false) => load('submissions', cik10(cik), 5 * 60_000, parseSubmissions, force);
export const loadFilingPage = (name: string) => load('submissions-page', name, 24 * 3600_000, parseFilingPage);
export const loadCompanyFacts = (cik: number, force = false) => load('facts', cik10(cik), 3600_000, parseCompanyFacts, force);

/** The file names in a filing's folder (EDGAR's index.json: {directory: {item: [{name, ...}]}}). */
export function parseFilingIndex(text: string): string[] | null {
  try {
    const items = JSON.parse(text)?.directory?.item;
    return Array.isArray(items) ? items.map((x: any) => String(x?.name ?? '')).filter(Boolean) : null;
  } catch {
    return null;
  }
}

const folder = (cik: number, accession: string) => `${cik}/${accession.replace(/-/g, '')}`;
export const loadFilingIndex = (cik: number, accession: string) => load('filing-index', folder(cik, accession), 24 * 3600_000, parseFilingIndex);
/** A filing's XBRL instance as text (the SEC extracts it from inline XBRL as name_htm.xml). */
export const loadFilingXbrl = (cik: number, accession: string, file: string) => load('filing-xbrl', `${folder(cik, accession)}/${file}`, 7 * 24 * 3600_000, (t) => (t.includes('<') ? t : null));
/** An ownership filing's XML (Form 4): `file` is its primary document without EDGAR's style-sheet folder. */
export const loadOwnershipXml = (cik: number, accession: string, file: string) => load('ownership-xml', `${folder(cik, accession)}/${file}`, 7 * 24 * 3600_000, (t) => (t.includes('<ownershipDocument') ? t : null));

/** Which SEC filer a security is: by its US ticker in the SEC's company list. */
export async function resolveFiler(ticker: string, force = false): Promise<SecResult<SecCompany>> {
  const list = await loadSecCompanies(force);
  if (!list.ok) return list;
  const hit = findByTicker(list.data, ticker);
  if (!hit) return { ok: false, reason: 'not-found', message: `${ticker} is not in the SEC's list of company tickers. EDGAR covers companies that file with the SEC: US companies and foreign companies with US-registered securities.` };
  return { ok: true, data: hit, at: list.at, ...(list.stale ? { stale: true } : {}) };
}

/** A SEC load as React state; `reload` asks the SEC again. */
export function useSecLoad<T>(key: string | null, fn: (force: boolean) => Promise<SecResult<T>>): { result: SecResult<T> | null; loading: boolean; reload: () => void } {
  // The answer and the request (key and reload count) it answers.
  const [state, setState] = useState<{ key: string | null; nonce: number; result: SecResult<T> | null }>({ key: null, nonce: 0, result: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void fn(nonce > 0).then((result) => {
      if (live) setState({ key, nonce, result });
    });
    return () => {
      live = false;
    };
    // fn is keyed by `key`; a new function for the same key must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // The top bar's REFRESH asks the SEC again (the main process answers again for filing lists and company facts).
  useRefresh(
    'SEC EDGAR filings and reported figures',
    key && secAvailable()
      ? async (): Promise<RefreshOutcome> => {
          const result = await fn(true);
          setState((s) => (s.key === key ? { ...s, result } : s));
          const source = 'SEC EDGAR filings and reported figures';
          if (result.ok) return { source, state: result.stale ? 'failed' : 'asked', ...(result.stale ? { detail: 'the SEC did not answer; the earlier copy stays' } : {}) };
          return { source, state: result.reason === 'needs-agent' ? 'skipped' : 'failed', detail: result.reason === 'needs-agent' ? 'needs SEC_USER_AGENT (PROVIDERS)' : result.message };
        }
      : null,
  );
  const current = state.key === key;
  return { result: current ? state.result : null, loading: !!key && (!current || state.nonce !== nonce), reload };
}
