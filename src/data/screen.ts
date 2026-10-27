import { localBeta, marketCapUsd, periodChange } from './analytics';
import { keyStats } from './fundamentals';
import { engine } from './market';
import type { Listing } from './live/earnings-calendar';

/**
 * SCREEN's criteria and how a stock meets them. Criteria in a group must all hold; a stock passes when any group
 * holds. A value can be missing (the source gives none) or not meaningful (a P/E on a loss). A criterion on a
 * missing value is undecided, and the screen says whether undecided stocks are left out or kept; a criterion on a
 * value that is not meaningful fails.
 */

export type Universe = 'app' | 'us';
export type FieldId = 'cap' | 'price' | 'chg' | 'volume' | 'ipoYear' | 'pe' | 'divYld' | 'roe' | 'beta' | 'ytd' | 'y1' | 'sector' | 'industry' | 'region' | 'country' | 'name';

export interface ScreenField {
  id: FieldId;
  label: string;
  kind: 'num' | 'text';
  category: 'Market' | 'Valuation' | 'Profitability' | 'Risk and return' | 'Classification';
  unit?: string;
  /** Where the value comes from in each universe; a universe without an entry does not offer the field. */
  from: Partial<Record<Universe, string>>;
}

const OWN = "the app's own stocks only; the list has none";

export const SCREEN_FIELDS: readonly ScreenField[] = [
  { id: 'cap', label: 'Market value', kind: 'num', category: 'Market', unit: '$bn', from: { app: 'shares times the last price, in dollars', us: "Nasdaq's stock list, in dollars" } },
  { id: 'price', label: 'Last price', kind: 'num', category: 'Market', from: { app: "the last price, in the stock's own currency", us: "Nasdaq's stock list: the last sale when the list loaded, in dollars" } },
  { id: 'chg', label: 'Change today', kind: 'num', category: 'Market', unit: '%', from: { app: "the change on the previous close", us: "Nasdaq's stock list, when it loaded" } },
  { id: 'volume', label: 'Volume', kind: 'num', category: 'Market', unit: 'shares', from: { app: 'shares traded today', us: "Nasdaq's stock list, when it loaded" } },
  { id: 'ipoYear', label: 'IPO year', kind: 'num', category: 'Market', from: { us: "Nasdaq's stock list" } },
  { id: 'pe', label: 'P/E', kind: 'num', category: 'Valuation', from: { app: "the price over the last 12 months' diluted EPS; not meaningful on a loss", us: OWN } },
  { id: 'divYld', label: 'Dividend yield', kind: 'num', category: 'Valuation', unit: '%', from: { app: 'dividends of the last 12 months over the price', us: OWN } },
  { id: 'roe', label: 'ROE', kind: 'num', category: 'Profitability', unit: '%', from: { app: "the last 12 months' net income over equity", us: OWN } },
  { id: 'beta', label: 'Beta', kind: 'num', category: 'Risk and return', from: { app: 'two years of weekly returns against the local index, as BETA works it out', us: OWN } },
  { id: 'ytd', label: 'YTD change', kind: 'num', category: 'Risk and return', unit: '%', from: { app: 'the price change since the end of last year', us: OWN } },
  { id: 'y1', label: '1Y change', kind: 'num', category: 'Risk and return', unit: '%', from: { app: 'the price change over a year', us: OWN } },
  { id: 'sector', label: 'Sector', kind: 'text', category: 'Classification', from: { app: "the app's security definition (GICS names)", us: "Nasdaq's classification, which is not GICS" } },
  { id: 'industry', label: 'Industry', kind: 'text', category: 'Classification', from: { app: "the app's security definition", us: "Nasdaq's classification, which is not GICS" } },
  { id: 'region', label: 'Region', kind: 'text', category: 'Classification', from: { app: 'Americas, EMEA or APAC' } },
  { id: 'country', label: 'Country', kind: 'text', category: 'Classification', from: { us: "the company's country in Nasdaq's stock list" } },
  { id: 'name', label: 'Name', kind: 'text', category: 'Classification', from: { app: "the security's name", us: "Nasdaq's stock list" } },
];

export const FIELD = Object.fromEntries(SCREEN_FIELDS.map((f) => [f.id, f])) as Record<FieldId, ScreenField>;

export type Op = 'gte' | 'lte' | 'between' | 'is' | 'isnot' | 'has' | 'hasnot';

export const OPS: Record<ScreenField['kind'], { id: Op; label: string }[]> = {
  num: [
    { id: 'gte', label: '≥' },
    { id: 'lte', label: '≤' },
    { id: 'between', label: 'between' },
  ],
  text: [
    { id: 'is', label: 'is' },
    { id: 'isnot', label: 'is not' },
    { id: 'has', label: 'contains' },
    { id: 'hasnot', label: 'does not contain' },
  ],
};

export interface Criterion {
  field: FieldId;
  op: Op;
  value: string;
  /** The upper bound of "between". */
  to?: string;
}

export interface ScreenDef {
  name?: string;
  universe: Universe;
  /** Criteria in a group must all hold; a stock passes when any group holds. */
  groups: Criterion[][];
  /** What an undecided stock does: one whose result turns on a value the source does not give. */
  missing: 'leave-out' | 'keep';
  /** Words, separated by commas: a stock whose sector or industry contains one is left out ("tobacco, casinos"). */
  exclude: string;
}

export const BLANK_SCREEN: ScreenDef = { universe: 'app', groups: [[{ field: 'cap', op: 'gte', value: '' }]], missing: 'leave-out', exclude: '' };

/** A value that exists but means nothing for the criterion, as a P/E on a loss: the criterion fails. */
export const NM = 'n.m.';

export interface Candidate {
  /** The ticker as the universe gives it. */
  ticker: string;
  name: string;
  /** The app's security, when it holds the stock. */
  id?: string;
  values: Partial<Record<FieldId, number | string>>;
}

const number = (s: string | undefined) => (s == null || s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));
const missing = (v: number | string | undefined) => v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && v.trim() === '');

/** Whether a criterion has what it needs to be applied; one that does not is shown but left out of the screen. */
export function complete(c: Criterion): boolean {
  const f = FIELD[c.field];
  if (!f || !OPS[f.kind].some((o) => o.id === c.op)) return false;
  if (f.kind === 'text') return c.value.trim() !== '';
  return Number.isFinite(number(c.value)) && (c.op !== 'between' || Number.isFinite(number(c.to)));
}

/** True or false, or null when the value is missing and the criterion cannot be decided. */
export function meets(c: Criterion, v: number | string | undefined): boolean | null {
  const f = FIELD[c.field];
  if (f.kind === 'num') {
    if (v === NM) return false;
    if (missing(v)) return null;
    const x = Number(v);
    const a = number(c.value);
    if (c.op === 'gte') return x >= a;
    if (c.op === 'lte') return x <= a;
    const b = number(c.to);
    return x >= Math.min(a, b) && x <= Math.max(a, b);
  }
  if (missing(v)) return null;
  const s = String(v).trim().toLowerCase();
  const w = c.value.trim().toLowerCase();
  if (c.op === 'is') return s === w;
  if (c.op === 'isnot') return s !== w;
  if (c.op === 'has') return s.includes(w);
  return !s.includes(w);
}

/** The groups that take part: those with at least one complete criterion, each keeping only its complete ones. */
export const activeGroups = (s: ScreenDef) => s.groups.map((g) => g.filter(complete)).filter((g) => g.length > 0);

/** A stock's result: true, false, or null when undecided, with the fields whose missing values left it undecided. */
export function evaluate(cand: Candidate, s: ScreenDef): { result: boolean | null; unknown: FieldId[] } {
  const groups = activeGroups(s);
  if (!groups.length) return { result: true, unknown: [] };
  const unknown = new Set<FieldId>();
  let any: boolean | null = false;
  for (const g of groups) {
    let all: boolean | null = true;
    const open: FieldId[] = [];
    for (const c of g) {
      const r = meets(c, cand.values[c.field]);
      if (r === false) {
        all = false;
        break;
      }
      if (r === null) {
        all = null;
        open.push(c.field);
      }
    }
    if (all === true) return { result: true, unknown: [] };
    if (all === null) {
      any = null;
      open.forEach((f) => unknown.add(f));
    }
  }
  return { result: any, unknown: any === null ? [...unknown] : [] };
}

/** The exclusion word a sector or industry contains, if any (case does not matter). */
export function excludedWord(sector: string | undefined, industry: string | undefined, exclude: string): string | undefined {
  const text = `${sector ?? ''} | ${industry ?? ''}`.toLowerCase();
  return exclude.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).find((w) => text.includes(w));
}

export interface ScreenRow {
  c: Candidate;
  /** Fields with no value that the stock was kept despite (keep), empty for a stock that met the criteria. */
  unknown: FieldId[];
}

export interface ScreenOutcome {
  rows: ScreenRow[];
  /** Stocks in the universe. */
  screened: number;
  /** Left out for an excluded industry. */
  excluded: number;
  /** Undecided for a missing value: left out, or kept and marked, as the screen says. */
  undecided: number;
  /** How many undecided stocks lacked each field. */
  missingBy: Partial<Record<FieldId, number>>;
}

export function runScreen(cands: readonly Candidate[], s: ScreenDef): ScreenOutcome {
  const out: ScreenOutcome = { rows: [], screened: cands.length, excluded: 0, undecided: 0, missingBy: {} };
  const words = s.exclude.trim();
  for (const c of cands) {
    if (words && excludedWord(String(c.values.sector ?? ''), String(c.values.industry ?? ''), words)) {
      out.excluded++;
      continue;
    }
    const { result, unknown } = evaluate(c, s);
    if (result === true) out.rows.push({ c, unknown: [] });
    else if (result === null) {
      out.undecided++;
      for (const f of unknown) out.missingBy[f] = (out.missingBy[f] ?? 0) + 1;
      if (s.missing === 'keep') out.rows.push({ c, unknown });
    }
  }
  return out;
}

/**
 * The stocks left after each criterion and the ones above it in its group (the fixed income search's "Matches" column,
 * seen on an April 2023 screenshot), counted as the screen counts them: after the exclusion words, and with an
 * undecided stock kept or left out as the screen says. One number per criterion, in the groups' order; null for a
 * criterion that has no value yet and takes no part. A group's last number is that group's count; the screen's
 * result joins the groups.
 */
export function matchesAfterEach(cands: readonly Candidate[], s: ScreenDef): (number | null)[][] {
  const words = s.exclude.trim();
  const pool = words ? cands.filter((c) => !excludedWord(String(c.values.sector ?? ''), String(c.values.industry ?? ''), words)) : cands;
  return s.groups.map((g) => {
    let left: readonly Candidate[] = pool;
    return g.map((c) => {
      if (!complete(c)) return null;
      left = left.filter((x) => {
        const r = meets(c, x.values[c.field]);
        return r === true || (r === null && s.missing === 'keep');
      });
      return left.length;
    });
  });
}

function criterionText(c: Criterion): string {
  const f = FIELD[c.field];
  const op = OPS[f.kind].find((o) => o.id === c.op)?.label ?? c.op;
  const unit = f.unit && f.unit !== 'shares' ? ` ${f.unit}` : '';
  if (f.kind === 'text') return `${f.label} ${op} "${c.value.trim()}"`;
  return c.op === 'between' ? `${f.label} between ${c.value.trim()} and ${c.to?.trim()}${unit}` : `${f.label} ${op} ${c.value.trim()}${unit}`;
}

/** The screen in words: "(Market value ≥ 10 $bn and P/E ≤ 20) or Dividend yield ≥ 4 %". */
export function describeScreen(s: ScreenDef): string {
  const groups = activeGroups(s);
  if (!groups.length) return 'No criteria: every stock';
  return groups.map((g) => (groups.length > 1 && g.length > 1 ? `(${g.map(criterionText).join(' and ')})` : g.map(criterionText).join(' and '))).join(' or ');
}

/** The app's figures for one of its stocks, the same in either universe. */
function ownValues(id: string): Partial<Record<FieldId, number | string>> {
  const d = engine.get(id);
  if (!d?.eq) return {};
  const k = keyStats(d);
  return {
    pe: Number.isFinite(k.pe) ? k.pe : Number.isFinite(k.epsLtm) && k.epsLtm <= 0 ? NM : NaN,
    divYld: k.divYld,
    roe: k.roe,
    // Beta worked out the same way for every stock (BETA's default), not one provider's figure for some of them.
    beta: engine.realOnly ? localBeta(id) : d.eq.beta,
    ytd: periodChange(id, 'YTD'),
    y1: periodChange(id, '1Y'),
  };
}

/** The stocks the app holds, with every field from the app's own figures. */
export function appCandidates(): Candidate[] {
  return engine.securities
    .filter((d) => d.cls === 'equity' && d.eq)
    .map((d) => {
      const q = engine.quote(d.id);
      return {
        ticker: d.ticker,
        name: d.name,
        id: d.id,
        values: {
          cap: marketCapUsd(d.id) / 1e9,
          price: q?.last ?? NaN,
          chg: q?.pct ?? NaN,
          volume: q?.volume ?? NaN,
          ...ownValues(d.id),
          sector: d.eq!.sector,
          industry: d.eq!.industry,
          region: d.region,
          name: d.name,
        },
      };
    });
}

/** The app's id of a US ticker in Nasdaq's list: BRK.B is BRK/B US Equity. */
export const usId = (ticker: string) => `${ticker.replace('.', '/')} US Equity`;

/**
 * Every stock in Nasdaq's list, with the list's figures; the ratios only for stocks the app holds. A market value
 * of zero is the list's blank, not a value.
 */
export function usCandidates(listings: ReadonlyMap<string, Listing>): Candidate[] {
  const out: Candidate[] = [];
  for (const [ticker, l] of listings) {
    const id = engine.get(usId(ticker)) ? usId(ticker) : undefined;
    out.push({
      ticker,
      name: l.name,
      ...(id ? { id } : {}),
      values: {
        cap: l.cap > 0 ? l.cap / 1e9 : NaN,
        price: l.price ?? NaN,
        chg: l.change ?? NaN,
        volume: l.volume ?? NaN,
        ipoYear: l.ipoYear ?? NaN,
        ...(id ? ownValues(id) : {}),
        sector: l.sector,
        industry: l.industry ?? '',
        country: l.country,
        name: l.name,
      },
    });
  }
  return out;
}

export const PRESETS: { name: string; groups: Criterion[][] }[] = [
  { name: 'Mega caps', groups: [[{ field: 'cap', op: 'gte', value: '500' }]] },
  { name: 'Value', groups: [[{ field: 'pe', op: 'lte', value: '16' }, { field: 'divYld', op: 'gte', value: '2' }]] },
  { name: 'Dividend', groups: [[{ field: 'divYld', op: 'gte', value: '3' }]] },
  { name: 'Momentum', groups: [[{ field: 'ytd', op: 'gte', value: '25' }]] },
  { name: 'Low beta', groups: [[{ field: 'beta', op: 'lte', value: '0.7' }]] },
  { name: 'Quality', groups: [[{ field: 'roe', op: 'gte', value: '25' }]] },
];
