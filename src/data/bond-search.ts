import type { PublicDebt } from './live/fiscal';

/** One bond SRCH can find: the Treasury's statement's securities, or the demo's bonds. */
export interface Instrument {
  id: string;
  /** "T 4.625 05/15/54" for a Treasury, the ticker for a demo bond. */
  name: string;
  cusip?: string;
  /** Bills, Notes, Bonds, TIPS, FRN for Treasuries; Corp or Govt for the demo's bonds. */
  type: string;
  issuer?: string;
  rating?: string;
  /** Percent a year; NaN for a bill. */
  coupon: number;
  /** YYYY-MM-DD */
  maturity: string;
  /** Millions of dollars outstanding. */
  amountMM: number;
  /** The app's security, when it has one (the demo's bonds). */
  secId?: string;
}

export type BondField = 'type' | 'issuer' | 'rating' | 'maturity' | 'coupon' | 'amount';
export type Boundary = 'include' | 'exclude' | 'gt' | 'lt' | 'between';

export interface BondCrit {
  field: BondField;
  boundary: Boundary;
  value: string;
  to?: string;
}

export const BOND_FIELDS: { id: BondField; label: string; kind: 'list' | 'num' | 'rating'; unit?: string }[] = [
  { id: 'type', label: 'Security Type', kind: 'list' },
  { id: 'issuer', label: 'Issuer', kind: 'list' },
  { id: 'rating', label: 'Rating', kind: 'rating' },
  { id: 'maturity', label: 'Years to Maturity', kind: 'num', unit: 'yrs' },
  { id: 'coupon', label: 'Coupon', kind: 'num', unit: '%' },
  { id: 'amount', label: 'Amount Outstanding', kind: 'num', unit: 'USD MM' },
];

export const BOUNDARY_LABEL: Record<Boundary, string> = { include: 'Include', exclude: 'Exclude', gt: 'Greater than', lt: 'Less than', between: 'Between' };

/** The boundaries a field takes: lists include or exclude, figures compare, a rating is "at least". */
export function boundariesFor(field: BondField): Boundary[] {
  const kind = BOND_FIELDS.find((f) => f.id === field)!.kind;
  return kind === 'list' ? ['include', 'exclude'] : kind === 'rating' ? ['gt'] : ['gt', 'lt', 'between'];
}

/** Ratings best first; "Greater than" a rating keeps it and the ones above. */
export const RATINGS = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC'];

const DAY_MS = 86_400_000;
const yearsTo = (iso: string, now: number) => (Date.parse(`${iso}T00:00:00Z`) - now) / (365.25 * DAY_MS);
const num = (s: string | undefined) => (s != null && s.trim() !== '' ? Number(s.replace(/,/g, '')) : NaN);

/** Whether a criterion is filled in enough to apply. */
export function complete(c: BondCrit): boolean {
  if (c.boundary === 'include' || c.boundary === 'exclude') return c.value.trim() !== '';
  if (c.field === 'rating') return RATINGS.includes(c.value.trim().toUpperCase());
  if (c.boundary === 'between') return Number.isFinite(num(c.value)) && Number.isFinite(num(c.to));
  return Number.isFinite(num(c.value));
}

function figure(i: Instrument, f: BondField, now: number): number {
  return f === 'maturity' ? yearsTo(i.maturity, now) : f === 'coupon' ? i.coupon : f === 'amount' ? i.amountMM : NaN;
}

/** Whether an instrument meets a complete criterion. */
export function meets(i: Instrument, c: BondCrit, now: number): boolean {
  if (c.field === 'type' || c.field === 'issuer') {
    const words = c.value.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    const text = (c.field === 'type' ? i.type : `${i.issuer ?? ''} ${i.name}`).toLowerCase();
    const hit = words.some((w) => (c.field === 'type' ? text === w || text.startsWith(w) : text.includes(w)));
    return c.boundary === 'exclude' ? !hit : hit;
  }
  if (c.field === 'rating') {
    const r = RATINGS.indexOf((i.rating ?? '').toUpperCase());
    return r >= 0 && r <= RATINGS.indexOf(c.value.trim().toUpperCase());
  }
  const v = figure(i, c.field, now);
  if (!Number.isFinite(v)) return false;
  const a = num(c.value);
  if (c.boundary === 'gt') return v > a;
  if (c.boundary === 'lt') return v < a;
  const b = num(c.to);
  return v >= Math.min(a, b) && v <= Math.max(a, b);
}

/** The instruments left after each criterion in turn (as SRCH's Matches column); null for one not filled in. */
export function matchesAfterEach(list: Instrument[], crits: BondCrit[], now: number): (number | null)[] {
  let left = list;
  return crits.map((c) => {
    if (!complete(c)) return null;
    left = left.filter((i) => meets(i, c, now));
    return left.length;
  });
}

export function runSearch(list: Instrument[], crits: BondCrit[], now: number): Instrument[] {
  return crits.filter(complete).reduce((left, c) => left.filter((i) => meets(i, c, now)), list);
}

/** The search in words, as SRCH echoes the typed query at the right ("US TREASURIES MATURITY > 10"). */
export function describeSearch(universe: string, crits: BondCrit[]): string {
  const parts = crits.filter(complete).map((c) => {
    const f = BOND_FIELDS.find((x) => x.id === c.field)!.label.toUpperCase();
    if (c.boundary === 'include') return `${f} ${c.value.toUpperCase()}`;
    if (c.boundary === 'exclude') return `${f} NOT ${c.value.toUpperCase()}`;
    if (c.field === 'rating') return `${f} >= ${c.value.toUpperCase()}`;
    if (c.boundary === 'between') return `${f} ${c.value}-${c.to}`;
    return `${f} ${c.boundary === 'gt' ? '>' : '<'} ${c.value}`;
  });
  return [universe.toUpperCase(), ...parts].join(' ');
}

/** "T 4.625 05/15/54": the Treasury's ticker, coupon and maturity as bond names are written. */
export function treasuryName(rate: number, maturity: string): string {
  const [y, m, d] = maturity.split('-');
  const cpn = Number.isFinite(rate) ? String(Number(rate.toFixed(3))) : '0';
  return `T ${cpn} ${m}/${d}/${y.slice(2)}`;
}

/**
 * The notes and bonds on FedInvest's price list that the statement does not list yet (issued after its date), with no
 * amount outstanding until the next statement gives one.
 */
export function issuedSinceStatement(listed: Instrument[], rows: Iterable<{ cusip: string; type: string; rate: number; maturity: string }>): Instrument[] {
  const have = new Set(listed.map((i) => i.cusip));
  const out: Instrument[] = [];
  for (const r of rows) {
    if ((r.type !== 'Notes' && r.type !== 'Bonds') || have.has(r.cusip)) continue;
    have.add(r.cusip);
    out.push({ id: r.cusip, name: treasuryName(r.rate, r.maturity), cusip: r.cusip, type: r.type, issuer: 'US Treasury', coupon: r.rate, maturity: r.maturity, amountMM: NaN });
  }
  return out;
}

/** Every marketable Treasury on the statement as an instrument. */
export function treasuryInstruments(debt: PublicDebt): Instrument[] {
  return debt.securities.map((s) => ({
    id: s.cusip,
    name: s.cls === 'Bills' ? `B 0 ${treasuryName(NaN, s.maturity).slice(4)}` : treasuryName(s.rate, s.maturity),
    cusip: s.cusip,
    type: s.cls,
    issuer: 'US Treasury',
    coupon: s.cls === 'Bills' ? NaN : s.rate,
    maturity: s.maturity,
    amountMM: s.outstanding,
  }));
}
