import { fmtBig } from '../../core/format';
import type { Evidence, Relation } from './supply-chain';

/**
 * USAspending.gov for SPLC: a company's federal contracts and subcontracts, as the U.S. Treasury publishes them.
 * The agencies that hold contracts with it and the prime contractors that subcontract to it are its customers; the
 * subcontractors on its largest contracts are its suppliers. The main process asks (electron/usaspending.cjs); this
 * module finds the company among the recipients and turns the records into relations.
 */

export type UsaspendingKind = 'recipients' | 'children' | 'awards' | 'subawards' | 'subs';

export interface UsaspendingAnswer {
  status: number;
  rows: unknown[];
  error?: string;
  cached?: boolean;
}

/** A recipient in USAspending: a parent ('P'), one of its units ('C'), or one without a parent ('R'). */
export interface FedRecipient {
  id?: string;
  name: string;
  uei: string;
  level?: string;
  amount: number;
}

export interface FedAward {
  /** USAspending's own ID, for the award's page. */
  id: string;
  /** The contract number (PIID). */
  award?: string;
  recipient: string;
  uei?: string;
  /** Obligated to date, US dollars. */
  amount: number;
  agency?: string;
  subAgency?: string;
  start?: string;
  end?: string;
  description?: string;
}

export interface FedSubaward {
  /** The subaward's own number. */
  id?: string;
  /** The prime contract's number and USAspending ID. */
  award?: string;
  awardId?: string;
  recipient: string;
  uei?: string;
  prime: string;
  primeUei?: string;
  amount: number;
  date?: string;
  agency?: string;
  description?: string;
}

export type FedAsk = (kind: UsaspendingKind, arg: string) => Promise<UsaspendingAnswer | null>;

/** A related company as SPLC lists it: the listed company the name belongs to, or the name as written. */
export interface FedParty {
  key: string;
  name: string;
  ticker?: string;
  cik?: number;
  id?: string;
  yahoo?: string;
}

export interface FederalContext {
  /** The company's names without legal form, as normalizeName gives them ("lockheed martin"). */
  keys: string[];
  /** A name of the company or one of its units ("PALANTIR USG INC", "RAYTHEON/LOCKHEED MARTIN JAVELIN JV"). */
  self: (name: string) => boolean;
  party: (name: string) => FedParty;
  normalize: (name: string) => string;
  /**
   * Which of these unit names (normalized) the company's own filings name; when given, a unit named unlike the company
   * counts only then.
   */
  named?: (names: string[]) => Promise<Set<string>>;
  /** YYYY-MM-DD. */
  today: string;
}

export type FedStep = 'awards' | 'subawards' | 'subs';

export interface FederalResult {
  /** The company's page on USAspending.gov; undefined when it holds no federal contracts under its name. */
  profile?: string;
  relations: Relation[];
}

/** At most this many of the company's units are searched, this many a request (the API fails on longer lists), and
 * the subcontracts under this many of its contracts. */
const MAX_UNITS = 30;
const UNITS_PER_ASK = 10;
const MAX_PRIMES = 10;
const MAX_SUPPLIERS = 30;
const EVIDENCE = 8;
const FILER = 'USAspending.gov';
const SITE = 'https://www.usaspending.gov';

const awardUrl = (id: string | undefined) => (id ? `${SITE}/award/${encodeURIComponent(id)}` : `${SITE}/search`);

function rows<T>(a: UsaspendingAnswer | null): T[] | null {
  return a && a.status === 200 && Array.isArray(a.rows) ? (a.rows as T[]) : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (iso: string | undefined) => {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const dollars = (v: number) => `$${fmtBig(v, 1)}`;
const daysBefore = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The agency that awarded a contract as people know it: the Army rather than the Department of Defense. */
export function agencyName(a: { agency?: string; subAgency?: string }): string {
  if (!a.subAgency || a.subAgency === a.agency) return a.agency ?? 'Federal government';
  // "Office of the Chief Financial Officer" says little without its department.
  return /^(?:Offices?|Immediate Office|Departmental)\b/.test(a.subAgency) && a.agency ? `${a.subAgency}, ${a.agency}` : a.subAgency;
}

/**
 * The company's recipient entries: the parents whose name is the company's ("LOCKHEED MARTIN CORP"), or entries of
 * that name without a parent. "APPLIED DIGITAL SOLUTIONS INC" is another company than Applied Digital Corp.
 */
export function ownRecipients(list: FedRecipient[], ctx: Pick<FederalContext, 'keys' | 'normalize'>): FedRecipient[] {
  return list.filter((r) => ctx.keys.includes(ctx.normalize(r.name))).sort((a, b) => (b.amount || 0) - (a.amount || 0));
}

/** The agencies a company's prime contracts come from: contracts still running or ended within the year. */
export function agencyRelations(awards: FedAward[], ctx: Pick<FederalContext, 'normalize' | 'today'>): Relation[] {
  const since = daysBefore(ctx.today, 365);
  const by = new Map<string, { name: string; amount: number; list: FedAward[] }>();
  const seen = new Set<string>();
  for (const a of awards) {
    if (!(a.amount > 0) || (a.end && a.end < since) || seen.has(a.id)) continue;
    seen.add(a.id);
    const name = agencyName(a);
    const k = ctx.normalize(name) || name.toLowerCase();
    const g = by.get(k) ?? { name, amount: 0, list: [] };
    g.amount += a.amount;
    g.list.push(a);
    by.set(k, g);
  }
  return [...by.entries()].map(([k, g]) => ({
    key: `gov:${k}`,
    name: g.name,
    role: 'customer' as const,
    side: 'records' as const,
    amount: g.amount,
    evidence: g.list.sort((a, b) => b.amount - a.amount).slice(0, EVIDENCE).map((a): Evidence => ({
      sentence: `${g.name} contract ${a.award ?? ''} with ${a.recipient}: ${dollars(a.amount)} obligated${a.start ? `, from ${month(a.start)}` : ''}${a.end ? ` to ${month(a.end)}` : ''}${a.description ? `. ${a.description}` : ''}.`.replace(/\s+/g, ' ').replace(/\.\.$/, '.'),
      filer: FILER,
      form: 'Contract',
      date: a.start ?? ctx.today,
      path: '',
      url: awardUrl(a.id),
    })),
  }));
}

/** Parties grouped from subcontract records: the primes that gave the company work, or the subcontractors on its contracts. */
export function subRelations(list: FedSubaward[], role: 'customer' | 'supplier', ctx: FederalContext, units: Set<string>, max = MAX_SUPPLIERS): Relation[] {
  const by = new Map<string, { party: FedParty; amount: number; list: FedSubaward[] }>();
  const mine = (name: string, uei: string | undefined) => (uei ? units.has(uei) : false) || ctx.self(name);
  // The records repeat a report at times, word for word: it counts once.
  const seen = new Set<string>();
  for (const s of list) {
    const once = [s.award, s.id, s.recipient, s.date, s.amount].join('|');
    if (seen.has(once)) continue;
    seen.add(once);
    // A customer gave the company work; a supplier took work under the company's own contracts. Work between the
    // company's own units is neither.
    const other = role === 'customer' ? s.prime : s.recipient;
    if (role === 'customer' ? mine(s.prime, s.primeUei) : !mine(s.prime, s.primeUei) || mine(s.recipient, s.uei)) continue;
    const party = ctx.party(other);
    const g = by.get(party.key) ?? { party, amount: 0, list: [] };
    g.amount += s.amount;
    g.list.push(s);
    by.set(party.key, g);
  }
  return [...by.values()]
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, max)
    .map((g) => ({
      ...g.party,
      role,
      side: 'records' as const,
      amount: g.amount,
      evidence: g.list.sort((a, b) => b.amount - a.amount).slice(0, EVIDENCE).map((s): Evidence => ({
        sentence: `${s.prime} subcontract to ${s.recipient} under ${s.agency ? `${s.agency} ` : ''}contract ${s.award ?? ''}: ${dollars(s.amount)}${s.date ? `, ${month(s.date)}` : ''}${s.description ? `. ${s.description}` : ''}.`.replace(/\s+/g, ' ').replace(/\.\.$/, '.'),
        filer: FILER,
        form: 'Subcontract',
        date: s.date ?? ctx.today,
        path: '',
        url: awardUrl(s.awardId),
      })),
    }));
}

/**
 * A company's relations in the federal records: finds it among USAspending's recipients by its name, gathers its
 * units, then reads its prime contracts (customers: the agencies), the subcontracts it received (customers: the
 * prime contractors) and the subcontracts let under its largest contracts (suppliers). `mark` follows each step.
 */
export async function federalRelations(ask: FedAsk, ctx: FederalContext, mark: (step: FedStep, state: 'reading' | 'read' | 'failed', found?: number, url?: string) => void = () => {}): Promise<FederalResult> {
  const steps: FedStep[] = ['awards', 'subawards', 'subs'];
  const keyword = ctx.keys[0];
  const found = keyword ? rows<FedRecipient>(await ask('recipients', keyword).catch(() => null)) : null;
  if (!found) {
    for (const s of steps) mark(s, keyword ? 'failed' : 'read', 0);
    return { relations: [] };
  }
  const own = ownRecipients(found, ctx);
  if (!own.length) {
    for (const s of steps) mark(s, 'read', 0);
    return { relations: [] };
  }
  const top = own[0];
  const profile = top.id ? `${SITE}/recipient/${encodeURIComponent(top.id)}/latest` : undefined;
  // The units under each parent of its name ("PALANTIR USG INC" under Palantir Technologies), largest first.
  const units = new Map<string, number>();
  const unitName = new Map<string, string>();
  for (const r of own) {
    units.set(r.uei, Math.max(units.get(r.uei) ?? 0, r.amount || 0));
    unitName.set(r.uei, r.name);
  }
  for (const p of own.filter((r) => r.level === 'P').slice(0, 4)) {
    for (const c of rows<FedRecipient>(await ask('children', p.uei).catch(() => null)) ?? []) {
      units.set(c.uei, Math.max(units.get(c.uei) ?? 0, c.amount || 0));
      if (!unitName.has(c.uei)) unitName.set(c.uei, c.name);
    }
  }
  // A unit named unlike the company counts only when the company's own filings name it ("Electric Boat" in General
  // Dynamics' reports). USAspending lists Clariant, Evonik, Transworld Systems and two railroads under JPMorgan Chase &
  // Co., none of which its filings name.
  if (ctx.named) {
    const strange = [...new Set([...units.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => unitName.get(u) ?? '').filter((n) => n && !ctx.self(n)).map(ctx.normalize).filter(Boolean))];
    const known = strange.length ? await ctx.named(strange).catch(() => new Set<string>()) : new Set<string>();
    for (const [u] of [...units]) {
      const n = unitName.get(u) ?? '';
      if (n && !ctx.self(n) && !known.has(ctx.normalize(n))) units.delete(u);
    }
  }
  const searched = [...units.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_UNITS).map(([u]) => u);
  const mine = new Set(units.keys());
  // The units in groups of ten, the answers joined; null when every group failed.
  const askUnits = async <T extends { amount: number }>(kind: 'awards' | 'subawards'): Promise<T[] | null> => {
    const out: T[] = [];
    let ok = false;
    for (let i = 0; i < searched.length; i += UNITS_PER_ASK) {
      const got = rows<T>(await ask(kind, searched.slice(i, i + UNITS_PER_ASK).join(',')).catch(() => null));
      if (!got) continue;
      ok = true;
      out.push(...got);
    }
    return ok ? out.sort((a, b) => b.amount - a.amount) : null;
  };
  const relations: Relation[] = [];

  mark('awards', 'reading', undefined, profile);
  const awards = await askUnits<FedAward>('awards');
  const agencies = awards ? agencyRelations(awards, ctx) : [];
  relations.push(...agencies);
  mark('awards', awards ? 'read' : 'failed', agencies.length, profile);

  mark('subawards', 'reading', undefined, profile);
  const received = await askUnits<FedSubaward>('subawards');
  const primes = received ? subRelations(received, 'customer', ctx, mine) : [];
  relations.push(...primes);
  mark('subawards', received ? 'read' : 'failed', primes.length, profile);

  // Its largest contracts still running: whoever it subcontracts to under them supplies it.
  const since = daysBefore(ctx.today, 365);
  const piids = [...new Set((awards ?? []).filter((a) => a.amount > 0 && (!a.end || a.end >= since) && a.award && /^[A-Z0-9][A-Z0-9-]{3,49}$/.test(a.award)).map((a) => a.award!))].slice(0, MAX_PRIMES);
  if (piids.length) {
    mark('subs', 'reading', undefined, profile);
    const let_ = rows<FedSubaward>(await ask('subs', piids.join(',')).catch(() => null));
    const suppliers = let_ ? subRelations(let_, 'supplier', ctx, mine) : [];
    relations.push(...suppliers);
    mark('subs', let_ ? 'read' : 'failed', suppliers.length, profile);
  } else {
    mark('subs', 'read', 0, profile);
  }
  return { profile, relations };
}
