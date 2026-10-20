import type { SecurityDef } from '../types';
import { filingLinks, loadFiler, loadOwnershipXml, resolveFiler, secTicker, type Filing, type SecResult } from './sec';

/**
 * What a company's insiders did with its shares, from their Form 4 filings on SEC EDGAR (desktop app, with the
 * owner's SEC User-Agent): each officer's, director's and large holder's purchases and sales on the market, the
 * shares and options the company granted them, the options they exercised, the shares withheld for tax, gifts, and
 * what they held after, with prices and the Rule 10b5-1 plan flag as filed. Forms 4 are due within two business days
 * of a trade. Amounts are as the insider reported them; nothing is estimated.
 */

/** A Form 4 transaction code, in the SEC's words (Form 4 General Instructions 8). */
export const CODES: Record<string, string> = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Grant or award',
  D: 'Disposed to the company',
  F: 'Tax or exercise price paid in shares',
  M: 'Option exercise',
  X: 'Option exercise',
  C: 'Conversion',
  O: 'Option exercise (out of the money)',
  E: 'Expiry (short position)',
  H: 'Expiry (long position)',
  G: 'Gift',
  I: 'Discretionary',
  J: 'Other',
  K: 'Equity swap',
  L: 'Small acquisition',
  U: 'Tender of shares',
  W: 'By will or inheritance',
  Z: 'Voting trust',
};

/** What a transaction counts as in the totals. */
export type Kind = 'buy' | 'sell' | 'award' | 'optionAward' | 'exercise' | 'tax' | 'gift' | 'other';

export interface InsiderTrade {
  /** Transaction date, YYYY-MM-DD. */
  date: string;
  code: string;
  kind: Kind;
  /** Shares (for an option, the underlying shares); price per share as filed, NaN when none is given. */
  shares: number;
  price: number;
  /** A for acquired, D for disposed. */
  acquired: boolean;
  /** Shares held after the transaction, in this form of ownership; NaN when not given. */
  after: number;
  direct: boolean;
  derivative: boolean;
  security: string;
  /** The option's exercise price, for a derivative. */
  exercisePrice: number;
}

export interface Owner {
  cik: string;
  /** As the SEC writes it: last name first. */
  secName: string;
  /** First name first, for display. */
  name: string;
  title: string;
  director: boolean;
  officer: boolean;
  tenPercent: boolean;
}

export interface OwnershipFiling {
  form: string;
  owner: Owner;
  /** Further reporting owners of a joint filing. */
  others: Owner[];
  trades: InsiderTrade[];
  /** Shares held without a transaction in this filing (nonDerivativeHolding), direct ones. */
  heldDirect: number;
  /** The filer ticked the Rule 10b5-1 box, or a footnote names such a plan. */
  plan: boolean;
}

const tag = (xml: string, name: string) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1];
const all = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
const decode = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
/** A field's text: Form 4 wraps most values in <value>. */
const text = (xml: string | undefined, name: string) => {
  const inner = xml ? tag(xml, name) : undefined;
  if (inner === undefined) return '';
  return decode(tag(inner, 'value') ?? inner);
};
const number = (xml: string | undefined, name: string) => {
  const t = text(xml, name).replace(/,/g, '');
  return t && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
const flag = (xml: string | undefined, name: string) => /^(1|true)$/i.test(text(xml, name));

const ENTITY = /\b(INC|LLC|L\.L\.C|LP|L\.P|FUND|TRUST|CORP|CORPORATION|GROUP|CAPITAL|PARTNERS|HOLDINGS|LTD|LIMITED|MANAGEMENT|ADVISORS|BANK|FOUNDATION|PLC|AG|SA|NV|BV|CO)\b\.?|&/i;

/** "CUMMINS WES" or "Cummins Wes" as "Wes Cummins"; a company's name stays as it is. */
export function displayName(secName: string): string {
  const s = secName.replace(/\s+/g, ' ').trim();
  const cased = s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : s;
  if (ENTITY.test(s)) return cased;
  const parts = cased.split(' ');
  return parts.length > 1 ? [...parts.slice(1), parts[0]].join(' ') : cased;
}

function kindOf(code: string, derivative: boolean): Kind {
  if (code === 'P') return 'buy';
  if (code === 'S') return 'sell';
  if (code === 'A') return derivative ? 'optionAward' : 'award';
  if (derivative && (code === 'M' || code === 'X' || code === 'O' || code === 'C')) return 'exercise';
  if (code === 'F') return 'tax';
  if (code === 'G') return 'gift';
  return 'other';
}

function owner(xml: string): Owner {
  const id = tag(xml, 'reportingOwnerId');
  const rel = tag(xml, 'reportingOwnerRelationship');
  const secName = text(id, 'rptOwnerName');
  return {
    cik: text(id, 'rptOwnerCik').replace(/^0+/, ''),
    secName,
    name: displayName(secName),
    title: text(rel, 'officerTitle') || text(rel, 'otherText'),
    director: flag(rel, 'isDirector'),
    officer: flag(rel, 'isOfficer'),
    tenPercent: flag(rel, 'isTenPercentOwner'),
  };
}

function trade(xml: string, derivative: boolean): InsiderTrade | null {
  const code = text(tag(xml, 'transactionCoding'), 'transactionCode').toUpperCase();
  const date = text(xml, 'transactionDate').slice(0, 10);
  if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const amounts = tag(xml, 'transactionAmounts');
  const underlying = number(tag(xml, 'underlyingSecurity'), 'underlyingSecurityShares');
  const shares = number(amounts, 'transactionShares');
  return {
    date,
    code,
    kind: kindOf(code, derivative),
    shares: derivative && Number.isFinite(underlying) ? underlying : shares,
    price: number(amounts, 'transactionPricePerShare'),
    acquired: text(amounts, 'transactionAcquiredDisposedCode').toUpperCase() !== 'D',
    after: number(tag(xml, 'postTransactionAmounts'), 'sharesOwnedFollowingTransaction'),
    direct: text(tag(xml, 'ownershipNature'), 'directOrIndirectOwnership').toUpperCase() !== 'I',
    derivative,
    security: text(xml, 'securityTitle'),
    exercisePrice: number(xml, 'conversionOrExercisePrice'),
  };
}

/** One ownership filing (Forms 3, 4, 5); null when the text is not one. */
export function parseOwnership(xml: string): OwnershipFiling | null {
  if (!/<ownershipDocument\b/.test(xml)) return null;
  const owners = all(xml, 'reportingOwner').map(owner).filter((o) => o.secName);
  if (!owners.length) return null;
  const nd = tag(xml, 'nonDerivativeTable') ?? '';
  const dv = tag(xml, 'derivativeTable') ?? '';
  const trades = [
    ...all(nd, 'nonDerivativeTransaction').map((t) => trade(t, false)),
    ...all(dv, 'derivativeTransaction').map((t) => trade(t, true)),
  ].filter((t): t is InsiderTrade => !!t);
  const holdings = all(nd, 'nonDerivativeHolding').filter((h) => text(tag(h, 'ownershipNature'), 'directOrIndirectOwnership').toUpperCase() !== 'I').map((h) => number(tag(h, 'postTransactionAmounts'), 'sharesOwnedFollowingTransaction')).filter(Number.isFinite);
  const footnotes = all(tag(xml, 'footnotes') ?? '', 'footnote').map(decode).join(' ');
  return {
    form: text(xml, 'documentType') || '4',
    owner: owners[0],
    others: owners.slice(1),
    trades,
    heldDirect: holdings.length ? Math.max(...holdings) : NaN,
    plan: flag(xml, 'aff10b5One') || /10b5-1/i.test(footnotes),
  };
}

// ------------------------------------------------------------------ totals

export interface Trade extends InsiderTrade {
  owner: Owner;
  plan: boolean;
  filed: string;
  link: string;
}

export interface Tally {
  shares: number;
  value: number;
  count: number;
}

export interface Person {
  owner: Owner;
  bought: Tally;
  sold: Tally;
  /** Shares granted or awarded, and options granted (underlying shares). */
  awarded: Tally;
  optionsGranted: Tally;
  exercised: Tally;
  taxWithheld: Tally;
  gifted: Tally;
  /** Shares acquired less shares disposed, directly and indirectly, options excluded. */
  netShares: number;
  /** Shares held directly after the latest reported transaction; NaN when the filings do not say. */
  heldAfter: number;
  heldAsOf?: string;
  last: string;
  trades: number;
}

const tally = (): Tally => ({ shares: 0, value: 0, count: 0 });
const add = (t: Tally, x: InsiderTrade) => {
  t.count++;
  if (Number.isFinite(x.shares)) t.shares += x.shares;
  if (Number.isFinite(x.shares) && Number.isFinite(x.price)) t.value += x.shares * x.price;
};

/** Each insider's totals over the trades, most active by value first, and the totals of all of them. */
export function summarize(trades: Trade[]): { people: Person[]; all: Omit<Person, 'owner' | 'heldAfter' | 'heldAsOf' | 'last'> & { buyers: number; sellers: number } } {
  const by = new Map<string, Person>();
  // Newest first; within a day and a filing, the later line is the later transaction.
  const newest = trades.map((t, i) => ({ t, i })).sort((a, b) => b.t.date.localeCompare(a.t.date) || b.t.filed.localeCompare(a.t.filed) || b.i - a.i).map((x) => x.t);
  for (const t of newest) {
    const key = t.owner.cik || t.owner.secName;
    let p = by.get(key);
    if (!p) {
      p = { owner: t.owner, bought: tally(), sold: tally(), awarded: tally(), optionsGranted: tally(), exercised: tally(), taxWithheld: tally(), gifted: tally(), netShares: 0, heldAfter: NaN, last: t.date, trades: 0 };
      by.set(key, p);
    }
    p.trades++;
    const target = { buy: p.bought, sell: p.sold, award: p.awarded, optionAward: p.optionsGranted, exercise: p.exercised, tax: p.taxWithheld, gift: p.gifted, other: null }[t.kind];
    if (target) add(target, t);
    if (!t.derivative && Number.isFinite(t.shares)) p.netShares += t.acquired ? t.shares : -t.shares;
    // The newest direct holding of shares (not options) the filings give.
    if (!Number.isFinite(p.heldAfter) && !t.derivative && t.direct && Number.isFinite(t.after)) {
      p.heldAfter = t.after;
      p.heldAsOf = t.date;
    }
  }
  const people = [...by.values()].sort((a, b) => b.bought.value + b.sold.value - (a.bought.value + a.sold.value) || b.trades - a.trades);
  const total = { bought: tally(), sold: tally(), awarded: tally(), optionsGranted: tally(), exercised: tally(), taxWithheld: tally(), gifted: tally(), netShares: 0, trades: 0, buyers: 0, sellers: 0 };
  for (const p of people) {
    for (const k of ['bought', 'sold', 'awarded', 'optionsGranted', 'exercised', 'taxWithheld', 'gifted'] as const) {
      total[k].shares += p[k].shares;
      total[k].value += p[k].value;
      total[k].count += p[k].count;
    }
    total.netShares += p.netShares;
    total.trades += p.trades;
    if (p.bought.count) total.buyers++;
    if (p.sold.count) total.sellers++;
  }
  return { people, all: total };
}

// ------------------------------------------------------------------ loading

export interface InsiderReport {
  company: string;
  cik: number;
  trades: Trade[];
  /** Form 4 filings in the period, those read, and the oldest filing date. */
  filings: number;
  read: number;
  since: string;
  /** Filings that could not be read (old text-only filings, a refusal). */
  unread: number;
}

/** The raw XML of an ownership filing: its primary document without EDGAR's style-sheet folder (xslF345X05/). */
export function ownershipFile(f: Filing): string | null {
  const file = f.doc?.split('/').pop();
  return file && /\.xml$/i.test(file) ? file : null;
}

/** The company's Form 4 filings of the last `months` (at most `max`), read and totalled. */
export async function loadInsiders(def: SecurityDef, months = 12, max = 80): Promise<SecResult<InsiderReport>> {
  const ticker = secTicker(def);
  if (!ticker) return { ok: false, reason: 'not-found', message: 'Insider filings (Form 4) are filed with the SEC for US-listed companies.' };
  const filer = await resolveFiler(ticker);
  if (!filer.ok) return filer;
  const sub = await loadFiler(filer.data.cik);
  if (!sub.ok) return sub;
  const cik = sub.data.cik;
  const since = new Date(Date.now() - months * 30.44 * 86_400_000).toISOString().slice(0, 10);
  const forms = sub.data.filings.filter((f) => /^4(\/A)?$/i.test(f.form.trim()) && f.filed >= since);
  const list = forms.slice(0, max);
  const answers = await Promise.all(list.map(async (f) => {
    const file = ownershipFile(f);
    if (!file) return null;
    const r = await loadOwnershipXml(cik, f.accession, file);
    const parsed = r.ok ? parseOwnership(r.data) : null;
    return parsed ? { f, parsed } : null;
  }));
  const trades: Trade[] = [];
  for (const a of answers) {
    if (!a) continue;
    const links = filingLinks(cik, a.f);
    for (const t of a.parsed.trades) trades.push({ ...t, owner: a.parsed.owner, plan: a.parsed.plan, filed: a.f.filed, link: links.doc ?? links.index });
  }
  trades.sort((a, b) => b.date.localeCompare(a.date) || b.filed.localeCompare(a.filed));
  const read = answers.filter(Boolean).length;
  return { ok: true, data: { company: sub.data.name, cik, trades, filings: forms.length, read, since: list.length ? list[list.length - 1].filed : since, unread: list.length - read }, at: Date.now() };
}
