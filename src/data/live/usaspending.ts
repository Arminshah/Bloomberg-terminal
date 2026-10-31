import { fmtBig } from '../../core/format';
import type { Evidence, Relation } from './supply-chain';

/**
 * USAspending.gov for SPLC: a company's federal contracts and subcontracts, as the U.S. Treasury publishes them.
 * The agencies that hold contracts with it and the prime contractors that subcontract to it are its customers; the
 * subcontractors on its largest contracts are its suppliers. The main process asks (electron/usaspending.cjs); this
 * module finds the company among the recipients and turns the records into relations.
 */

export type UsaspendingKind = 'recipients' | 'children' | 'awards' | 'subawards' | 'subs' | 'profile';

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
  /** The agency whose money the contract obligates. */
  fundingAgency?: string;
  fundingSubAgency?: string;
  start?: string;
  end?: string;
  description?: string;
}

/** A recipient's own record: its name now and the parent USAspending files it under. */
export interface FedProfile {
  name: string;
  uei?: string;
  parentName?: string;
  parentUei?: string;
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
  /** Found only by its first word once the unit's words were dropped ("VERTEX AEROSPACE LLC" as Vertex, Inc.). */
  loose?: boolean;
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
  /**
   * Look up the largest subcontract parties not found as a listed company (or found by a first word only) under their
   * UEI: the name USAspending gives them now ("VERTEX AEROSPACE LLC" is "V2X AEROSPACE LLC") and the parent it files
   * them under (Electric Boat under General Dynamics).
   */
  lookUpParties?: boolean;
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
/** At most this many subcontract parties are looked up by their UEI, each with at least this many dollars. */
const MAX_LOOKUPS = 15;
const MIN_LOOKUP = 1e6;
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

/** An office that administers contracts other agencies issued and fund: the Defense Contract Management Agency. */
const ADMINISTERS = /^(?:Defense Contract Management Agency|DCMA)\b/i;

/**
 * The agency that awarded a contract as people know it: the Army rather than the Department of Defense. A contract the
 * Defense Contract Management Agency administers is the funding agency's: Northrop's F4261098C0001 is the Air Force's,
 * though DCMA issued its latest modifications.
 */
export function agencyName(a: { agency?: string; subAgency?: string; fundingAgency?: string; fundingSubAgency?: string }): string {
  if (a.subAgency && ADMINISTERS.test(a.subAgency) && a.fundingSubAgency && !ADMINISTERS.test(a.fundingSubAgency)) return agencyName({ agency: a.fundingAgency ?? a.agency, subAgency: a.fundingSubAgency });
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
/**
 * Each subaward once: USAspending re-publishes a report under the same subaward number, at times with a revised amount
 * (Dayton T. Brown's 5000256853 under N0001913C9999, reported three times on 31 March 2022 at $15.0M): the latest
 * report counts, or the largest of the same day.
 */
export function onePerSubaward(list: FedSubaward[]): FedSubaward[] {
  const by = new Map<string, FedSubaward>();
  for (const s of list) {
    const k = s.id ? `${s.award ?? ''}|${s.id}|${s.recipient}` : [s.award, s.id, s.recipient, s.date, s.amount].join('|');
    const have = by.get(k);
    if (!have || (s.date ?? '') > (have.date ?? '') || ((s.date ?? '') === (have.date ?? '') && s.amount > have.amount)) by.set(k, s);
  }
  return [...by.values()];
}

/** A subaward's identity for the doubtful-amount notes. */
export const subawardKey = (s: Pick<FedSubaward, 'award' | 'id' | 'recipient'>) => `${s.award ?? ''}|${s.id ?? ''}|${s.recipient}`;

/** Parties grouped from subcontract records: the primes that gave the company work, or the subcontractors on its contracts. */
export function subRelations(list: FedSubaward[], role: 'customer' | 'supplier', ctx: FederalContext, units: Set<string>, max = MAX_SUPPLIERS, doubtful: Map<string, string> = new Map()): Relation[] {
  const by = new Map<string, { party: FedParty; amount: number; list: FedSubaward[]; uei: Map<string, number> }>();
  const mine = (name: string, uei: string | undefined) => (uei ? units.has(uei) : false) || ctx.self(name);
  for (const s of onePerSubaward(list)) {
    // A customer gave the company work; a supplier took work under the company's own contracts. Work between the
    // company's own units is neither.
    const other = role === 'customer' ? s.prime : s.recipient;
    if (role === 'customer' ? mine(s.prime, s.primeUei) : !mine(s.prime, s.primeUei) || mine(s.recipient, s.uei)) continue;
    const party = ctx.party(other);
    const g = by.get(party.key) ?? { party, amount: 0, list: [] as FedSubaward[], uei: new Map<string, number>() };
    // An amount the records make implausible is shown with the reason, not counted (Technovare's $927.0M).
    if (!doubtful.has(subawardKey(s))) g.amount += s.amount;
    g.list.push(s);
    const u = role === 'customer' ? s.primeUei : s.uei;
    if (u) g.uei.set(u, (g.uei.get(u) ?? 0) + s.amount);
    by.set(party.key, g);
  }
  return [...by.values()]
    .filter((g) => g.amount > 0 || g.list.some((s) => doubtful.has(subawardKey(s))))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, max)
    .map((g) => ({
      ...g.party,
      role,
      side: 'records' as const,
      ...(g.amount > 0 ? { amount: g.amount } : {}),
      ...(g.uei.size ? { uei: [...g.uei.entries()].sort((a, b) => b[1] - a[1])[0][0] } : {}),
      evidence: g.list.sort((a, b) => b.amount - a.amount).slice(0, EVIDENCE).map((s): Evidence => ({
        sentence: `${s.prime} subcontract to ${s.recipient} under ${s.agency ? `${s.agency} ` : ''}contract ${s.award ?? ''}: ${dollars(s.amount)}${s.date ? `, ${month(s.date)}` : ''}${s.description ? `. ${s.description}` : ''}.${doubtful.has(subawardKey(s)) ? ` ${doubtful.get(subawardKey(s))}` : ''}`.replace(/\s+/g, ' ').replace(/\.\.$/, '.'),
        filer: FILER,
        form: 'Subcontract',
        date: s.date ?? ctx.today,
        path: '',
        url: awardUrl(s.awardId),
      })),
    }));
}

/**
 * Subawards whose amount the records make implausible (Northrop's $927.0M to Technovare Systems under
 * FA881018C0006, 27% of the prime contract's obligation, against $7.2M at most in its other subawards): at least $100M,
 * more than a tenth of the prime contract's obligation, and more than 20 times the subcontractor's next-largest
 * subaward of two years (or its only one). Each with the reason, by subawardKey.
 */
export async function doubtfulSubawards(list: FedSubaward[], primes: Map<string, number>, ask: FedAsk, max = 5): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const candidates = onePerSubaward(list).filter((s) => s.uei && s.award && s.amount >= 100e6 && (primes.get(s.award) ?? Infinity) * 0.1 < s.amount).sort((a, b) => b.amount - a.amount).slice(0, max);
  for (const s of candidates) {
    const got = rows<FedSubaward>(await ask('subawards', s.uei!).catch(() => null));
    if (!got) continue;
    const others = onePerSubaward(got).filter((x) => subawardKey(x) !== subawardKey(s) && x.amount > 0).map((x) => x.amount);
    const next = others.length ? Math.max(...others) : 0;
    if (next && s.amount <= 20 * next) continue;
    const prime = primes.get(s.award!)!;
    out.set(subawardKey(s), `Not counted: the reported ${dollars(s.amount)} is ${Math.round((s.amount / prime) * 100)}% of the prime contract's ${dollars(prime)} obligation and ${next ? `${Math.round(s.amount / next)} times the subcontractor's next-largest subaward of two years (${dollars(next)})` : 'the subcontractor has no other subaward of two years'}; the figure may be misreported.`);
  }
  return out;
}

/**
 * Subcontract parties not found as a listed company, or found by a first word only, looked up under their UEI, the
 * largest first: the name USAspending gives the UEI now ("VERTEX AEROSPACE LLC" is "V2X AEROSPACE LLC", V2X Inc.'s
 * unit since the July 2022 merger), else the parent it files the unit under (Electric Boat under General Dynamics). The
 * unit's records join its listed parent's.
 */
export async function resolveParties(rels: (Relation & { uei?: string })[], ask: FedAsk, ctx: FederalContext, max = MAX_LOOKUPS): Promise<Relation[]> {
  const listed = (p: FedParty) => !!(p.cik || p.ticker || p.yahoo || p.id);
  const todo = rels.filter((r) => r.uei && (r.amount ?? 0) >= MIN_LOOKUP && (r.key.startsWith('n:') || (r as Relation & { loose?: boolean }).loose)).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, max);
  const moved = new Map<Relation, FedParty>();
  for (const r of todo) {
    const found = (rows<FedRecipient>(await ask('recipients', r.uei!).catch(() => null)) ?? []).filter((x) => x.uei === r.uei);
    if (!found.length) continue;
    // Renamed since: its current name names another listed company.
    const now = ctx.party(found[0].name);
    if (ctx.normalize(found[0].name) !== ctx.normalize(r.name) && listed(now) && now.key !== r.key) {
      moved.set(r, now);
      continue;
    }
    const entry = found.find((x) => x.level === 'C') ?? found[0];
    if (!entry.id) continue;
    const profile = rows<FedProfile>(await ask('profile', entry.id).catch(() => null))?.[0];
    if (!profile?.parentName || ctx.normalize(profile.parentName) === ctx.normalize(r.name)) continue;
    const parent = ctx.party(profile.parentName);
    if (listed(parent) && !parent.loose && parent.key !== r.key) moved.set(r, parent);
  }
  // Joined by party: the amounts add up, the largest records first.
  const by = new Map<string, Relation>();
  for (const raw of rels) {
    const { uei: _uei, loose: _loose, ...r } = raw as Relation & { uei?: string; loose?: boolean };
    void _uei;
    void _loose;
    const to = moved.get(raw);
    const rel: Relation = to ? { ...r, key: to.key, name: to.name, ticker: to.ticker, cik: to.cik, id: to.id, yahoo: to.yahoo } : r;
    const k = `${rel.key}|${rel.role}`;
    const have = by.get(k);
    if (!have) {
      by.set(k, { ...rel, evidence: [...rel.evidence] });
      continue;
    }
    if (rel.amount != null) have.amount = (have.amount ?? 0) + rel.amount;
    have.evidence = [...have.evidence, ...rel.evidence].sort((a, b) => amountOf(b) - amountOf(a)).slice(0, EVIDENCE);
  }
  return [...by.values()];
}

/** The dollars a record's sentence gives ("...: $250.7M, May 2025"), for ordering joined records. */
function amountOf(e: Evidence): number {
  const m = /: \$([\d.]+)([KMBT]?)/.exec(e.sentence);
  if (!m) return 0;
  return Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[m[2]] || Number(m[1]);
}

/** Records without the lookup fields: what a relation keeps. */
function plain(rels: Relation[]): Relation[] {
  return rels.map((raw) => {
    const { uei: _uei, loose: _loose, ...r } = raw as Relation & { uei?: string; loose?: boolean };
    void _uei;
    void _loose;
    return r;
  });
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
  // Units with any dollars (obligated or deobligated) filed under the company's parent in the latest twelve months.
  const active = new Set<string>();
  for (const r of own) {
    units.set(r.uei, Math.max(units.get(r.uei) ?? 0, r.amount || 0));
    unitName.set(r.uei, r.name);
    if (r.amount) active.add(r.uei);
  }
  for (const p of own.filter((r) => r.level === 'P').slice(0, 4)) {
    for (const c of rows<FedRecipient>(await ask('children', p.uei).catch(() => null)) ?? []) {
      units.set(c.uei, Math.max(units.get(c.uei) ?? 0, c.amount || 0));
      if (!unitName.has(c.uei)) unitName.set(c.uei, c.name);
      if (c.amount) active.add(c.uei);
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
  // A unit named unlike the company with no dollars filed under its parent is not the company's now: Pfizer's list
  // still holds Meridian Medical Technologies, sold on 31 December 2021, at $0, while Meridian's awards of 2024 to 2026
  // are filed under Meridian itself or Altaris. Pfizer's 10-K names Meridian (its sale), so the check above keeps it.
  for (const u of [...units.keys()]) {
    const n = unitName.get(u) ?? '';
    if (n && !ctx.self(n) && !active.has(u)) units.delete(u);
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
  const parties: Relation[] = [...primes];
  mark('subawards', received ? 'read' : 'failed', primes.length, profile);

  // Its largest contracts still running: whoever it subcontracts to under them supplies it.
  const since = daysBefore(ctx.today, 365);
  const piids = [...new Set((awards ?? []).filter((a) => a.amount > 0 && (!a.end || a.end >= since) && a.award && /^[A-Z0-9][A-Z0-9-]{3,49}$/.test(a.award)).map((a) => a.award!))].slice(0, MAX_PRIMES);
  if (piids.length) {
    mark('subs', 'reading', undefined, profile);
    const let_ = rows<FedSubaward>(await ask('subs', piids.join(',')).catch(() => null));
    const obligated = new Map<string, number>();
    for (const a of awards ?? []) if (a.award) obligated.set(a.award, Math.max(obligated.get(a.award) ?? 0, a.amount));
    const doubtful = let_ ? await doubtfulSubawards(let_, obligated, ask) : new Map<string, string>();
    const suppliers = let_ ? subRelations(let_, 'supplier', ctx, mine, MAX_SUPPLIERS, doubtful) : [];
    parties.push(...suppliers);
    mark('subs', let_ ? 'read' : 'failed', suppliers.length, profile);
  } else {
    mark('subs', 'read', 0, profile);
  }
  relations.push(...(ctx.lookUpParties ? await resolveParties(parties, ask, ctx) : plain(parties)));
  return { profile, relations };
}
