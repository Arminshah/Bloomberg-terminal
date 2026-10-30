import { localBeta, marketCapUsd, periodChange, toUsd, type Horizon } from './analytics';
import { financials, keyStats, parentIncomeMargin, type FinPeriod } from './fundamentals';
import { engine } from './market';
import type { Listing } from './live/earnings-calendar';

/**
 * SCREEN's criteria and how a stock meets them. Criteria in a group must all hold; a stock passes when any group
 * holds. A value can be missing (the source gives none) or not meaningful (a P/E on a loss). A criterion on a
 * missing value is undecided, and the screen says whether undecided stocks are left out or kept; a criterion on a
 * value that is not meaningful fails. Criteria apply in their order: a rank ("the 20 largest") keeps the best of the
 * stocks the criteria above it left, as the reference screener's "Sequential Rank" does. A field can have periods (P/E
 * on the trailing 12 months or the latest fiscal year): each criterion picks one.
 */

export type Universe = 'app' | 'us';
export type FieldId =
  | 'cap' | 'price' | 'chg' | 'volume' | 'ipoYear' | 'pe' | 'divYld' | 'roe' | 'beta' | 'ytd' | 'y1'
  | 'rev' | 'ebitda' | 'ni' | 'revGrowth' | 'epsGrowth' | 'opMargin' | 'netMargin'
  | 'sector' | 'industry' | 'region' | 'country' | 'name';

/** The period a figure covers: a statement's (trailing 12 months, latest quarter, latest fiscal year) or a price change's. */
export type PeriodId = 'ltm' | 'lq' | 'lfy' | Horizon;

export const PERIOD_LABEL: Record<PeriodId, string> = {
  ltm: 'trailing 12 months', lq: 'latest quarter', lfy: 'latest fiscal year',
  '1D': '1 day', '5D': '5 days', '1M': '1 month', '3M': '3 months', '6M': '6 months', YTD: 'year to date', '1Y': '1 year', '2Y': '2 years', '5Y': '5 years',
};
/** The short form on a column: "T12M", "LQ", "LFY", "3M". */
export const PERIOD_SHORT: Record<PeriodId, string> = { ltm: 'T12M', lq: 'LQ', lfy: 'LFY', '1D': '1D', '5D': '5D', '1M': '1M', '3M': '3M', '6M': '6M', YTD: 'YTD', '1Y': '1Y', '2Y': '2Y', '5Y': '5Y' };

export interface ScreenField {
  id: FieldId;
  label: string;
  kind: 'num' | 'text';
  category: 'Market' | 'Valuation' | 'Size and growth' | 'Profitability' | 'Risk and return' | 'Classification';
  unit?: string;
  /** Where the value comes from in each universe; a universe without an entry does not offer the field. */
  from: Partial<Record<Universe, string>>;
  /** The periods it can be read for, the default first; a field without periods has one. */
  periods?: readonly PeriodId[];
}

const OWN = "the app's own stocks only; the list has none";

export const SCREEN_FIELDS: readonly ScreenField[] = [
  { id: 'cap', label: 'Market value', kind: 'num', category: 'Market', unit: '$bn', from: { app: 'shares times the last price, in dollars', us: "Nasdaq's stock list, in dollars" } },
  { id: 'price', label: 'Last price', kind: 'num', category: 'Market', from: { app: "the last price, in the stock's own currency", us: "Nasdaq's stock list: the last sale when the list loaded, in dollars" } },
  { id: 'chg', label: 'Change today', kind: 'num', category: 'Market', unit: '%', from: { app: "the change on the previous close", us: "Nasdaq's stock list, when it loaded" } },
  { id: 'volume', label: 'Volume', kind: 'num', category: 'Market', unit: 'shares', from: { app: 'shares traded today', us: "Nasdaq's stock list, when it loaded" } },
  { id: 'ipoYear', label: 'IPO year', kind: 'num', category: 'Market', from: { us: "Nasdaq's stock list" } },
  { id: 'pe', label: 'P/E', kind: 'num', category: 'Valuation', periods: ['ltm', 'lfy'], from: { app: "the price over the period's diluted EPS (the statements' currency); not meaningful on a loss", us: OWN } },
  { id: 'divYld', label: 'Dividend yield', kind: 'num', category: 'Valuation', unit: '%', from: { app: 'dividends of the last 12 months over the price', us: OWN } },
  { id: 'rev', label: 'Revenue', kind: 'num', category: 'Size and growth', unit: '$M', periods: ['ltm', 'lq', 'lfy'], from: { app: "the period's revenue from the statements, in dollars at today's rate", us: OWN } },
  { id: 'ebitda', label: 'EBITDA', kind: 'num', category: 'Size and growth', unit: '$M', periods: ['ltm', 'lq', 'lfy'], from: { app: "the period's operating income before depreciation and amortisation, in dollars at today's rate", us: OWN } },
  { id: 'ni', label: 'Net income', kind: 'num', category: 'Size and growth', unit: '$M', periods: ['ltm', 'lq', 'lfy'], from: { app: "the period's net income, in dollars at today's rate", us: OWN } },
  { id: 'revGrowth', label: 'Revenue growth', kind: 'num', category: 'Size and growth', unit: '%', periods: ['lfy', 'lq'], from: { app: 'the latest fiscal year on the one before, or the latest quarter on the same quarter a year earlier', us: OWN } },
  { id: 'epsGrowth', label: 'EPS growth', kind: 'num', category: 'Size and growth', unit: '%', periods: ['lfy', 'lq'], from: { app: 'diluted EPS on the year before (fiscal year or same quarter); not meaningful from a loss', us: OWN } },
  { id: 'roe', label: 'ROE', kind: 'num', category: 'Profitability', unit: '%', periods: ['ltm', 'lfy'], from: { app: "the period's net income over its closing equity", us: OWN } },
  { id: 'opMargin', label: 'Operating margin', kind: 'num', category: 'Profitability', unit: '%', periods: ['ltm', 'lq', 'lfy'], from: { app: "the period's operating income over its revenue", us: OWN } },
  { id: 'netMargin', label: 'Net margin', kind: 'num', category: 'Profitability', unit: '%', periods: ['ltm', 'lq', 'lfy'], from: { app: "the period's net income over its revenue", us: OWN } },
  { id: 'beta', label: 'Beta', kind: 'num', category: 'Risk and return', from: { app: 'two years of weekly returns against the local index, as BETA works it out', us: OWN } },
  { id: 'ytd', label: 'YTD change', kind: 'num', category: 'Risk and return', unit: '%', from: { app: 'the price change since the end of last year', us: OWN } },
  { id: 'y1', label: 'Price change', kind: 'num', category: 'Risk and return', unit: '%', periods: ['1Y', '1D', '5D', '1M', '3M', '6M', 'YTD', '2Y', '5Y'], from: { app: "the price change over the period, from the daily closes (1 day: on the previous close)", us: OWN } },
  { id: 'sector', label: 'Sector', kind: 'text', category: 'Classification', from: { app: "the app's security definition (GICS names)", us: "Nasdaq's classification, which is not GICS" } },
  { id: 'industry', label: 'Industry', kind: 'text', category: 'Classification', from: { app: "the app's security definition", us: "Nasdaq's classification, which is not GICS" } },
  { id: 'region', label: 'Region', kind: 'text', category: 'Classification', from: { app: 'Americas, EMEA or APAC' } },
  { id: 'country', label: 'Country', kind: 'text', category: 'Classification', from: { us: "the company's country in Nasdaq's stock list" } },
  { id: 'name', label: 'Name', kind: 'text', category: 'Classification', from: { app: "the security's name", us: "Nasdaq's stock list" } },
];

export const FIELD = Object.fromEntries(SCREEN_FIELDS.map((f) => [f.id, f])) as Record<FieldId, ScreenField>;

export type Op = 'gte' | 'lte' | 'between' | 'top' | 'bottom' | 'is' | 'isnot' | 'has' | 'hasnot';

export const OPS: Record<ScreenField['kind'], { id: Op; label: string }[]> = {
  num: [
    { id: 'gte', label: '≥' },
    { id: 'lte', label: '≤' },
    { id: 'between', label: 'between' },
    // A rank: the N highest (or lowest) of the stocks the criteria above it left.
    { id: 'top', label: 'top N, higher is better' },
    { id: 'bottom', label: 'top N, lower is better' },
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
  /** The bound, or for a rank how many stocks it keeps. */
  value: string;
  /** The upper bound of "between". */
  to?: string;
  /** The field's period; its default when absent. */
  period?: PeriodId;
}

export const isRank = (c: Pick<Criterion, 'op'>) => c.op === 'top' || c.op === 'bottom';

/** The criterion's period, or the field's default. */
export function periodOf(c: Pick<Criterion, 'field' | 'period'>): PeriodId | undefined {
  const ps = FIELD[c.field]?.periods;
  if (!ps) return undefined;
  return c.period && ps.includes(c.period) ? c.period : ps[0];
}

/** Where a candidate keeps a field's value for a period: the field's id for its default period, "pe@lfy" for another. */
export function valueKey(c: Pick<Criterion, 'field' | 'period'>): string {
  const p = periodOf(c);
  return p && p !== FIELD[c.field].periods![0] ? `${c.field}@${p}` : c.field;
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
  /** By field, and by "field@period" for a period other than the field's default. */
  values: Partial<Record<FieldId, number | string>> & Record<string, number | string | undefined>;
}

const number = (s: string | undefined) => (s == null || s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));
const missing = (v: number | string | undefined) => v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && v.trim() === '');

/** Whether a criterion has what it needs to be applied; one that does not is shown but left out of the screen. */
export function complete(c: Criterion): boolean {
  const f = FIELD[c.field];
  if (!f || !OPS[f.kind].some((o) => o.id === c.op)) return false;
  if (f.kind === 'text') return c.value.trim() !== '';
  if (isRank(c)) return Number.isInteger(number(c.value)) && number(c.value) >= 1;
  return Number.isFinite(number(c.value)) && (c.op !== 'between' || Number.isFinite(number(c.to)));
}

/** True or false, or null when the value is missing and the criterion cannot be decided. A rank needs the other
 * stocks: on its own it holds (runScreen applies it). */
export function meets(c: Criterion, v: number | string | undefined): boolean | null {
  const f = FIELD[c.field];
  if (isRank(c)) return true;
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

/** A stock's result on the criteria that need no other stocks (not ranks): true, false, or null when undecided, with
 * the fields whose missing values left it undecided. */
export function evaluate(cand: Candidate, s: ScreenDef): { result: boolean | null; unknown: FieldId[] } {
  const groups = activeGroups(s);
  if (!groups.length) return { result: true, unknown: [] };
  const unknown = new Set<FieldId>();
  let any: boolean | null = false;
  for (const g of groups) {
    let all: boolean | null = true;
    const open: FieldId[] = [];
    for (const c of g) {
      if (isRank(c)) continue;
      const r = meets(c, cand.values[valueKey(c)]);
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
  /** Stocks a rank left out because they have no value to rank on, by field. */
  unranked: Partial<Record<FieldId, number>>;
}

type Status = { open: Set<FieldId> } | 'out';

/**
 * One group's criteria applied in order to the stocks: each stock's status after each criterion (in, or undecided on
 * the fields in `open`, or out), and the count left after each, as the screen shows them. A rank keeps the N best of
 * the stocks left (undecided ones too when the screen keeps them); a stock with no value to rank on is out.
 */
function runGroup(pool: readonly Candidate[], g: Criterion[], missing: ScreenDef['missing'], unranked: Partial<Record<FieldId, number>>) {
  const status = new Map<Candidate, Status>(pool.map((c) => [c, { open: new Set<FieldId>() }]));
  const counted = (st: Status) => st !== 'out' && (st.open.size === 0 || missing === 'keep');
  const left: (number | null)[] = [];
  for (const c of g) {
    if (!complete(c)) {
      left.push(null);
      continue;
    }
    const key = valueKey(c);
    if (isRank(c)) {
      const ranked: { cand: Candidate; v: number }[] = [];
      for (const [cand, st] of status) {
        if (!counted(st)) continue;
        const v = cand.values[key];
        if (typeof v === 'number' && Number.isFinite(v)) ranked.push({ cand, v });
        else {
          status.set(cand, 'out');
          unranked[c.field] = (unranked[c.field] ?? 0) + 1;
        }
      }
      const dir = c.op === 'top' ? -1 : 1;
      ranked.sort((a, b) => dir * (a.v - b.v) || a.cand.ticker.localeCompare(b.cand.ticker));
      for (const r of ranked.slice(Number(c.value))) status.set(r.cand, 'out');
    } else {
      for (const [cand, st] of status) {
        if (st === 'out') continue;
        const r = meets(c, cand.values[key]);
        if (r === false) status.set(cand, 'out');
        else if (r === null) st.open.add(c.field);
      }
    }
    let n = 0;
    for (const st of status.values()) if (counted(st)) n++;
    left.push(n);
  }
  return { status, left };
}

export function runScreen(cands: readonly Candidate[], s: ScreenDef): ScreenOutcome {
  const out: ScreenOutcome = { rows: [], screened: cands.length, excluded: 0, undecided: 0, missingBy: {}, unranked: {} };
  const words = s.exclude.trim();
  const pool = words ? cands.filter((c) => !excludedWord(String(c.values.sector ?? ''), String(c.values.industry ?? ''), words)) : cands;
  out.excluded = cands.length - pool.length;
  const groups = activeGroups(s);
  if (!groups.length) {
    out.rows = pool.map((c) => ({ c, unknown: [] }));
    return out;
  }
  const runs = groups.map((g) => runGroup(pool, g, s.missing, out.unranked).status);
  for (const c of pool) {
    const sts = runs.map((r) => r.get(c)!);
    if (sts.some((st) => st !== 'out' && st.open.size === 0)) {
      out.rows.push({ c, unknown: [] });
      continue;
    }
    const open = sts.filter((st): st is { open: Set<FieldId> } => st !== 'out');
    if (!open.length) continue;
    const unknown = [...new Set(open.flatMap((st) => [...st.open]))];
    out.undecided++;
    for (const f of unknown) out.missingBy[f] = (out.missingBy[f] ?? 0) + 1;
    if (s.missing === 'keep') out.rows.push({ c, unknown });
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
  return s.groups.map((g) => runGroup(pool, g, s.missing, {}).left);
}

/** "P/E" for the default period, "P/E, latest fiscal year" for another, "Price change, 3 months" (its default too). */
export function fieldText(c: Pick<Criterion, 'field' | 'period'>): string {
  const f = FIELD[c.field];
  const p = periodOf(c);
  return p && (p !== f.periods![0] || f.id === 'y1') ? `${f.label}, ${PERIOD_LABEL[p]}` : f.label;
}

function criterionText(c: Criterion): string {
  const f = FIELD[c.field];
  const op = OPS[f.kind].find((o) => o.id === c.op)?.label ?? c.op;
  const unit = f.unit && f.unit !== 'shares' ? ` ${f.unit}` : '';
  if (f.kind === 'text') return `${f.label} ${op} "${c.value.trim()}"`;
  if (isRank(c)) return `Top ${c.value.trim()} by ${fieldText(c)}, ${c.op === 'top' ? 'higher' : 'lower'} is better`;
  if (f.periods) return c.op === 'between' ? `${fieldText(c)} between ${c.value.trim()} and ${c.to?.trim()}${unit}` : `${fieldText(c)} ${op} ${c.value.trim()}${unit}`;
  return c.op === 'between' ? `${f.label} between ${c.value.trim()} and ${c.to?.trim()}${unit}` : `${f.label} ${op} ${c.value.trim()}${unit}`;
}

/** The screen in words: "(Market value ≥ 10 $bn and P/E ≤ 20) or Dividend yield ≥ 4 %". */
export function describeScreen(s: ScreenDef): string {
  const groups = activeGroups(s);
  if (!groups.length) return 'No criteria: every stock';
  return groups.map((g) => (groups.length > 1 && g.length > 1 ? `(${g.map(criterionText).join(' and ')})` : g.map(criterionText).join(' and '))).join(' or ');
}

const YEAR_MS = 365 * 86_400_000;

/** The period a year before `p` among `list` (a fiscal year, or the same quarter), within three weeks of a year earlier. */
function yearBefore(list: readonly FinPeriod[], p: FinPeriod | undefined): FinPeriod | undefined {
  if (!p) return undefined;
  return list.find((x) => Math.abs(p.end - x.end - YEAR_MS) <= 21 * 86_400_000);
}

const growth = (now: number | undefined, then: number | undefined, nmFromLoss = false): number | string => {
  if (now == null || then == null || !Number.isFinite(now) || !Number.isFinite(then) || then === 0) return NaN;
  if (then < 0) return nmFromLoss ? NM : NaN;
  return (now / then - 1) * 100;
};
const ratio = (a: number | undefined, b: number | undefined) => (a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? (a / b) * 100 : NaN);

/** The app's figures for one of its stocks, the same in either universe: each field for its default period, and for
 * the other periods under "field@period". */
function ownValues(id: string): Candidate['values'] {
  const d = engine.get(id);
  if (!d?.eq) return {};
  const k = keyStats(d);
  const f = financials(d);
  const periods: Partial<Record<'ltm' | 'lq' | 'lfy', FinPeriod>> = { ltm: f.ltm.end ? f.ltm : undefined, lq: f.quarterly.at(-1), lfy: f.annual.at(-1) };
  // Statements can be in another currency than the shares trade in; a P/E compares like with like.
  const fx = k.ccy === k.tradeCcy ? 1 : engine.usdValue(k.tradeCcy) / engine.usdValue(k.ccy);
  const usd = (v: number | undefined) => (v != null && Number.isFinite(v) ? toUsd(v, k.ccy) : NaN);
  const out: Candidate['values'] = {
    pe: Number.isFinite(k.pe) ? k.pe : Number.isFinite(k.epsLtm) && k.epsLtm <= 0 ? NM : NaN,
    divYld: k.divYld,
    roe: k.roe,
    // Beta worked out the same way for every stock (BETA's default), not one provider's figure for some of them.
    beta: engine.realOnly ? localBeta(id) : d.eq.beta,
    ytd: periodChange(id, 'YTD'),
  };
  const fy = periods.lfy;
  out['pe@lfy'] = fy && Number.isFinite(fy.eps) ? (fy.eps > 0 ? (k.price * fx) / fy.eps : NM) : NaN;
  out['roe@lfy'] = fy && fy.equity > 0 ? ratio(fy.ni, fy.equity) : NaN;
  for (const [pid, p] of Object.entries(periods) as ['ltm' | 'lq' | 'lfy', FinPeriod | undefined][]) {
    const at = (field: FieldId) => (pid === FIELD[field].periods![0] ? field : `${field}@${pid}`);
    out[at('rev')] = usd(p?.rev);
    out[at('ebitda')] = usd(p?.ebitda);
    // Net income as FINANCIALS shows it: attributable to the company's shareholders, before preferred dividends.
    out[at('ni')] = usd(p?.niTotal);
    out[at('opMargin')] = ratio(p?.opInc, p?.rev);
    out[at('netMargin')] = parentIncomeMargin(p);
  }
  const prevYear = yearBefore(f.annual, fy);
  const prevQuarter = yearBefore(f.quarterly, periods.lq);
  out.revGrowth = growth(fy?.rev, prevYear?.rev);
  out['revGrowth@lq'] = growth(periods.lq?.rev, prevQuarter?.rev);
  out.epsGrowth = growth(fy?.eps, prevYear?.eps, true);
  out['epsGrowth@lq'] = growth(periods.lq?.eps, prevQuarter?.eps, true);
  for (const h of FIELD.y1.periods! as Horizon[]) out[h === '1Y' ? 'y1' : `y1@${h}`] = periodChange(id, h);
  return out;
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
