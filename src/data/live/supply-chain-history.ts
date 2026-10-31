// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { eventDate, findCompanies, normalizeName, periodMonths, relationKey, sharePeriod, type Chain, type Directory, type Evidence, type Relation, type Role } from './supply-chain';

/** Parsed public disclosures, not a reconstruction of observations that predate collection. */
export const RELATIONSHIP_PARSER = 3;
export type AssertionState = 'reported' | 'signed' | 'planned' | 'amended' | 'ended';
export interface RelationshipAssertion {
  id: string;
  state: AssertionState;
  sourceDate: string;
  sourcePrecision: 'day';
  observedAt?: number;
  eventDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  contractKey?: string;
  scope: 'contract' | 'ownership' | 'relationship' | 'unresolved';
  evidenceId: string;
  phase?: 'conditional' | 'under-construction' | 'operating';
  ending?: 'terminated' | 'expired' | 'repaid' | 'disposed' | 'assigned';
  /** When the statement says its event happened ("In January 2021, we entered into ..."): YYYY, YYYY-MM or YYYY-MM-DD. */
  statedAt?: string;
}
export interface IdentityLink {
  entityKey: string;
  name: string;
  ticker?: string;
  cik?: number;
  id?: string;
  yahoo?: string;
  evidence: Evidence;
  proof: string;
}
export interface ShareObservation {
  id: string;
  value: number;
  qualifier?: '>' | '<';
  basis: Relation['basis'];
  period: string;
  denominator: 'revenue' | 'continuing-operations-revenue' | 'segment-revenue' | 'line-revenue' | 'product-sales' | 'purchases' | 'unknown';
  /** The revenue line a share is of, as the filing names it: "oil, natural gas and NGL" (Matador's 10-K). */
  line?: string;
  scope: 'target' | 'counterparty' | 'unknown';
  /** Segment or business context from the disclosure, kept independently of the denominator. */
  segment?: string;
  periodEnd?: string;
  sourceDate: string;
  observedAt?: number;
  evidenceId: string;
}

/**
 * Who states one statement: the company itself (its own filing), the other company, or government records. Read from
 * the statement's own filing, never from the relation it is merged into.
 */
export function statedBy(e: Evidence, companyCik: number | undefined): 'own' | 'theirs' | 'records' {
  if (!e.path && e.url) return 'records';
  const cik = Number(e.path.split('/')[0]);
  return companyCik != null && cik === companyCik ? 'own' : 'theirs';
}

/** Full citation identity matters: repeated wording in a new filing is a new disclosure. */
export function evidenceIdentity(e: Evidence): string {
  return JSON.stringify([e.path || e.url || '', e.date, e.type ?? '', e.sentence]);
}

export function relationKind(r: Relation): 'entity' | 'concentration' {
  return r.recordKind ?? (/^(?:unnamed:\d+|unnamed-supplier:\d+|n:(?:(?:direct|indirect) )?customer [a-z])$/i.test(r.key) ? 'concentration' : 'entity');
}

const DATE_WORDS = '(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+(?:19|20)\\d{2}';
const END = /\b(?:terminated|cancelled|canceled|expired|repaid in full|paid off|extinguished|no longer (?:supplies|serves|competes|holds|owns)|sold (?:all|our entire|its entire|the remainder))\b/i;
const ENDED_STAKE = /\b(?:sold|sale|divest\w*|disposed of|no longer (?:hold|holds|own|owns))\b[^.;]{0,80}\b(?:entire|remaining|all|stake|interest|investment)\b/i;

/** A contract reference is deliberately narrower than a bank or tenant identity. */
export function contractReference(sentence: string, role: Role): string | undefined {
  const quoted = /["“]([^"”]{2,70}?(?:Facility|Lease|Agreement|Loan|Contract))["”]/i.exec(sentence);
  if (quoted) return `named:${normalizeName(quoted[1])}`;
  const label = /\b(?:facility|lease|loan|contract)\s+([A-Z](?![a-z])|[A-Z]{2,6}[- ]?\d{1,3})\b/.exec(sentence);
  if (label) return `label:${normalizeName(label[0])}`;
  const dated = new RegExp(`\\b(?:agreement|lease|facility|loan|contract)(?:,?\\s+(?:dated|effective)(?:\\s+as of)?\\s+)(${DATE_WORDS})`, 'i').exec(sentence);
  const actionDate = new RegExp(`^On\\s+(${DATE_WORDS}),?\\s+[^.;]{0,100}\\b(?:entered into|signed|executed)\\b`, 'i').exec(sentence);
  const date = dated ? eventDate(dated[1]) : actionDate ? eventDate(actionDate[1]) : '';
  if (date && /\b(?:agreement|lease|facility|loan|contract)\b/i.test(sentence)) return `${role === 'lender' ? 'credit' : role === 'customer' && /\blease\b/i.test(sentence) ? 'lease' : 'agreement'}:${date}`;
  return undefined;
}

const MONTHS: Record<string, string> = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };

/** The date a statement opens with: "In January 2021, ...", "On December 11, 2023, ...", "In 2022, ...". */
export function statedAt(sentence: string): string | undefined {
  const m = /^(?:In|On|During|As of|Effective)\s+(?:(?:early|mid|late)[- ])?(?:(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:(\d{1,2}),\s+)?)?((?:19|20)\d{2})\b/.exec(sentence.trim());
  if (!m) return undefined;
  return m[1] ? `${m[3]}-${MONTHS[m[1].toLowerCase()]}${m[2] ? `-${m[2].padStart(2, '0')}` : ''}` : m[3];
}

/**
 * An ending stated for the whole relationship, not one contract: a counterparty's filing says its agreement with the
 * company was terminated, expired, concluded or assigned away, or that it sold the property leased to it. It closes
 * the statements published by then, unless they say they happened after the ending.
 */
export function endingAssertion(e: Evidence, ending: { how: 'terminated' | 'expired' | 'assigned' | 'disposed'; date?: string }): RelationshipAssertion {
  const evidenceId = evidenceIdentity(e);
  return { id: evidenceId, state: 'ended', sourceDate: e.date, sourcePrecision: 'day', observedAt: e.observedAt, ...(ending.date ? { effectiveTo: ending.date } : {}), scope: 'relationship', evidenceId, ending: ending.how };
}

function explicitEffective(sentence: string, ended: boolean): string | undefined {
  const m = new RegExp(`\\b(?:effective(?:\\s+(?:as of|on|from))?|${ended ? 'terminated on|expired on' : 'commencing on|commences on|beginning on'})\\s+(${DATE_WORDS})`, 'i').exec(sentence);
  return m ? eventDate(m[1]) || undefined : undefined;
}

export function assertionFor(e: Evidence, r: Pick<Relation, 'role'>): RelationshipAssertion {
  if (e.assertion) return e.assertion;
  const s = e.sentence;
  const hypothetical = /\b(?:may|might|could|would|if|risk of|right to|option to|subject to)\b/i.test(s);
  const ended = !hypothetical && (END.test(s) || (r.role === 'investment' && ENDED_STAKE.test(s)));
  const state: AssertionState = ended ? 'ended' : /\b(?:amended|extended|expanded|renewed)\b/i.test(s) ? 'amended'
    : /\b(?:plans? to|expects? to|intends? to|proposed|nonbinding|non-binding|letter of intent|memorandum of understanding)\b/i.test(s) ? 'planned'
      : /\b(?:entered into|signed|executed)\b/i.test(s) ? 'signed' : 'reported';
  const contractKey = contractReference(s, r.role);
  // "We owned 32% of Haleon as of December 31, 2023" (Pfizer's 10-K of February 2026) is a holding the same 10-K's
  // "remaining sale of our investment in Haleon in 2025" ends.
  const ownership = r.role === 'investment' && /\b(?:stake|ownership|interest|shares|investment|owned|owns|held|holds)\b/i.test(s);
  const explicit = explicitEffective(s, ended);
  const event = /^On\b/i.test(s.trim()) ? eventDate(s) || undefined : undefined;
  // A closure without a contract reference must not close every contract with that company.
  const scope = ownership ? 'ownership' : contractKey ? 'contract' : ended ? 'unresolved' : 'relationship';
  const evidenceId = evidenceIdentity(e);
  const stated = statedAt(s);
  return {
    id: evidenceId, state, sourceDate: e.date, sourcePrecision: 'day', observedAt: e.observedAt,
    ...(event ? { eventDate: event } : {}), ...(stated ? { statedAt: stated } : {}), ...(explicit ? ended ? { effectiveTo: explicit } : { effectiveFrom: explicit } : {}),
    ...(contractKey ? { contractKey } : ownership ? { contractKey: 'ownership' } : {}), scope, evidenceId,
    ...(/\b(?:conditional|conditioned upon|subject to (?:approval|closing|completion))\b/i.test(s) ? { phase: 'conditional' as const }
      : /\b(?:under construction|construction is underway)\b/i.test(s) ? { phase: 'under-construction' as const }
        : /\b(?:began operations|commenced operations|currently operating|is operational)\b/i.test(s) ? { phase: 'operating' as const } : {}),
    ...(ended ? { ending: /\bexpired\b/i.test(s) ? 'expired' as const : /\brepaid|paid off|extinguished\b/i.test(s) ? 'repaid' as const : ownership ? 'disposed' as const : 'terminated' as const } : {}),
  };
}

/** Words of a revenue phrase that do not name a line of it: "of our total operating revenue" is all of it. */
const WHOLE_REVENUE_WORD = /^(?:total|net|consolidated|operating|gross|annual|aggregate|reported|and)$/i;

/**
 * The line of revenue a share is of, when the filing names one: "accounted for 72%, 79% and 76%, respectively, of the
 * Company's total oil, natural gas and NGL revenues" (Matador's 10-K) is "oil, natural gas and NGL"; "of our operating
 * revenue" names none.
 */
export function revenueLine(sentence: string): string | undefined {
  const m = /\bof\s+(?:the Company's|our|its|their)\s+((?:[A-Za-z][\w-]*,?\s+){1,7}?)(?:revenues?|net sales|sales)\b/i.exec(sentence);
  if (!m) return undefined;
  const words = m[1].trim().split(/\s+/);
  const named = words.filter((w) => !WHOLE_REVENUE_WORD.test(w.replace(/,$/, '')));
  if (!named.length) return undefined;
  return words.filter((w, i) => i > 0 || !WHOLE_REVENUE_WORD.test(w.replace(/,$/, ''))).join(' ').replace(/,$/, '');
}

export function shareObservation(r: Relation, e: Evidence): ShareObservation | undefined {
  if (r.share == null || !Number.isFinite(r.share)) return undefined;
  const s = e.sentence;
  const line = r.basis === 'their-revenue' || r.basis === 'target-revenue' ? revenueLine(s) : undefined;
  const denominator: ShareObservation['denominator'] = /\bcontinuing operations\b/i.test(s) ? 'continuing-operations-revenue'
    : /\bof\s+(?:our |its |the Company's )?(?:[\w-]+\s+){0,5}(?:segment|business line|loyalty services)\s+revenues?\b/i.test(s) ? 'segment-revenue'
      : line ? 'line-revenue'
        : r.basis === 'their-product-sales' ? 'product-sales'
          : r.basis === 'their-purchases' || r.basis === 'target-purchases' ? 'purchases'
            : r.basis === 'target-revenue' || r.basis === 'their-revenue' ? 'revenue' : 'unknown';
  const scope = r.basis?.startsWith('target-') ? 'target' : r.basis?.startsWith('their-') ? 'counterparty' : 'unknown';
  const evidenceId = evidenceIdentity(e);
  const segment = /^([A-Z][\w&-]*(?:\s+[A-Z][\w&-]*){0,4}?)\s+(?:Business|Segment)\b/.exec(s)?.[1]
    ?? /\b(?:our|the)\s+([A-Z][A-Za-z &-]{1,60}?)\s+segment\b/.exec(s)?.[1];
  const periodEnd = new RegExp(`\\b(?:ended|ending)\\s+(${DATE_WORDS})`, 'i').exec(s);
  return { id: JSON.stringify([evidenceId, r.share, r.basis, r.qualifier]), value: r.share, qualifier: r.qualifier, basis: r.basis, period: sharePeriod(s), ...(periodEnd ? { periodEnd: eventDate(periodEnd[1]) } : {}), denominator, ...(line ? { line } : {}), scope, ...(segment ? { segment } : {}), sourceDate: e.date, observedAt: e.observedAt, evidenceId };
}

export function enrichRelation(r: Relation, observedAt?: number): Relation {
  const evidence = r.evidence.map((e) => ({ ...e, observedAt: e.observedAt ?? observedAt, publishedPrecision: 'day' as const, parserVersion: e.parserVersion ?? RELATIONSHIP_PARSER }));
  const assertions = [...(r.assertions ?? [])];
  for (const e of evidence) {
    const a = assertionFor(e, r);
    if (!assertions.some((x) => x.id === a.id)) assertions.push(a);
  }
  const observations = [...(r.observations ?? [])];
  // The display share belongs to the first supporting statement; other observations are retained from raw records.
  const o = evidence[0] && !observations.some((x) => x.evidenceId === evidenceIdentity(evidence[0])) ? shareObservation(r, evidence[0]) : undefined;
  if (o && !observations.some((x) => x.id === o.id)) observations.push(o);
  return { ...r, recordKind: relationKind(r), evidence, assertions, observations };
}

/** Retain all recorded versions, including periods no longer selected for the current display. */
export function appendRelationshipHistory(previous: Relation[], incoming: Relation[], observedAt?: number): Relation[] {
  const by = new Map<string, Relation>();
  const newer = new Set(incoming);
  for (const raw of [...previous, ...incoming]) {
    const r = enrichRelation(raw, observedAt);
    // Anonymous concentration labels are local to a filing and cannot identify an entity across periods.
    const k = `${r.key}|${r.role}|${relationKind(r)}${relationKind(r) === 'concentration' ? `|${r.evidence[0]?.path}|${sharePeriod(r.evidence[0]?.sentence ?? '')}` : ''}`;
    const have = by.get(k);
    if (!have) { by.set(k, { ...r, evidence: [...r.evidence], assertions: [...r.assertions!], observations: [...r.observations!] }); continue; }
    for (const e of r.evidence) if (!have.evidence.some((x) => evidenceIdentity(x) === evidenceIdentity(e))) have.evidence.push(e);
    // Who states it: both sides once the company and the other each do (Incyte's 10-K beside Lilly's own; L3Harris's
    // beside Northrop's), whichever was read first; government records add to the filings.
    if (r.side !== have.side && r.side !== 'records') have.side = have.side === 'records' ? r.side : 'both';
    for (const a of r.assertions!) if (!have.assertions!.some((x) => x.id === a.id)) have.assertions!.push(a);
    for (const o of r.observations!) if (!have.observations!.some((x) => x.id === o.id)) have.observations!.push(o);
    if (r.identityLinks) have.identityLinks = [...new Map([...(have.identityLinks ?? []), ...r.identityLinks].map((link) => [evidenceIdentity(link.evidence), link])).values()];
    // Name/ticker changes are display aliases only; earlier citations keep the name as filed. The newest reading names
    // the company: a saved record keeps no ticker the SEC has since given to another company.
    if (newer.has(raw) && r.cik && r.cik === have.cik) {
      have.name = r.name;
      have.ticker = r.ticker;
      have.listing = r.listing;
    }
    have.ticker ??= r.ticker;
    have.listing ??= r.listing;
    have.cik ??= r.cik;
    have.id ??= r.id;
    have.yahoo ??= r.yahoo;
  }
  return [...by.values()];
}

/** Current here means the latest recorded disclosures, not independently verified operating status. */
export function relationStatus(r: Relation, effectiveAsOf?: string): 'reported' | 'ended' | 'unresolved' {
  const day = effectiveAsOf ?? new Date().toISOString().slice(0, 10);
  const assertions = (r.assertions ?? r.evidence.map((e) => assertionFor(e, r))).filter((a) => !(a.effectiveFrom && a.effectiveFrom > day));
  const positives = assertions.filter((a) => a.state !== 'ended' && a.state !== 'planned');
  // A stake in a company taken over since (its 8-K reporting a change in control) is no longer held in it: Pfizer's
  // Tourmaline shares after Novartis bought Tourmaline for cash in October 2025.
  const takeover = r.role === 'investment' ? r.listing?.events?.find((x) => x.what === 'change in control' && x.date <= day) : undefined;
  if (takeover && !positives.some((a) => a.sourceDate > takeover.date)) return 'ended';
  const ended = assertions.filter((a) => a.state === 'ended' && (!a.effectiveTo || a.effectiveTo <= day));
  if (!ended.length) return positives.length ? 'reported' : 'unresolved';
  // A closure without a contract reference needs reconciling, unless a later statement ends the whole relationship
  // (Pfizer's 8-K "Terminated a global collaboration and license agreement with Sangamo", then Sangamo's 10-Q on the
  // termination effective April 21, 2025).
  if (ended.some((a) => a.scope === 'unresolved' && !ended.some((e) => e.scope === 'relationship' && e.sourceDate >= a.sourceDate))) return 'unresolved';
  const closed = (a: RelationshipAssertion) => ended.some((e) => e.contractKey && e.contractKey === a.contractKey && (e.effectiveTo ?? e.eventDate ?? e.sourceDate) >= (a.effectiveFrom ?? a.eventDate ?? a.sourceDate));
  // An ending of the whole relationship closes what was published by then, unless a statement says its event came after
  // the ending ("In 2025, we entered into a new agreement").
  const closedAll = (a: RelationshipAssertion) => ended.some((e) => e.scope === 'relationship' && a.sourceDate <= e.sourceDate && !(a.statedAt && e.effectiveTo && a.statedAt > e.effectiveTo));
  if (positives.length && positives.some((a) => !closed(a) && !closedAll(a))) return 'reported';
  return 'ended';
}

export function relationshipView(chain: Chain, mode: 'current' | 'history', knownAsOf?: string, effectiveAsOf?: string): Relation[] {
  const source = mode === 'history' ? chain.history ?? chain.relations : chain.relations;
  const eligible = (e: Evidence) => !knownAsOf || !!e.observedAt && new Date(e.observedAt).toISOString().slice(0, 10) <= knownAsOf && e.date <= knownAsOf;
  const rows = source.map((r) => {
    // A dated historical source does not prove when it was first available to this installation.
    const evidence = r.evidence.filter(eligible);
    const ids = new Set(evidence.map(evidenceIdentity));
    const observations = r.observations?.filter((o) => ids.has(o.evidenceId));
    // A year's share before a part year's, then the latest: Dauch's 15% of 2025 (10-K) rather than its 11% of the first
    // six months of 2026 (10-Q); a share with no period stated ranks between them.
    const span = (o: ShareObservation) => { const n = periodMonths(o.period); return n >= 12 ? 2 : n === 0 ? 1 : 0; };
    const selected = observations?.slice().sort((a, b) => span(b) - span(a) || b.sourceDate.localeCompare(a.sourceDate) || (b.observedAt ?? 0) - (a.observedAt ?? 0)).at(0);
    return { ...r, evidence: selected ? evidence.slice().sort((a, b) => Number(evidenceIdentity(b) === selected.evidenceId) - Number(evidenceIdentity(a) === selected.evidenceId)) : evidence,
      ...(selected || knownAsOf ? { share: selected?.value, qualifier: selected?.qualifier, basis: selected?.basis } : {}),
      assertions: r.assertions?.filter((a) => ids.has(a.evidenceId)), observations, identityLinks: r.identityLinks?.filter((link) => eligible(link.evidence)) };
  }).filter((r) => r.evidence.length && (mode === 'history' || relationStatus(r, effectiveAsOf) !== 'ended'));
  // Only an eligible naming disclosure can resolve an anonymous identity. Original assertions and citation dates
  // are retained; the naming citation accompanies the resolved row for an auditable knowledge cutoff.
  const resolved = new Map<string, Relation>();
  for (const row of rows) {
    const link = row.unnamed ? row.identityLinks?.[0] : undefined;
    const r = link ? { ...row, key: link.entityKey, name: link.name, ticker: link.ticker, cik: link.cik, id: link.id, yahoo: link.yahoo, unnamed: false, evidence: [...row.evidence, link.evidence] } : row;
    const key = `${r.key}|${r.role}${relationKind(r) === 'concentration' ? `|${evidenceIdentity(r.evidence[0])}` : ''}`;
    const have = resolved.get(key);
    if (!have) resolved.set(key, r);
    else {
      resolved.set(key, { ...have, evidence: [...new Map([...have.evidence, ...r.evidence].map((e) => [evidenceIdentity(e), e])).values()], assertions: [...new Map([...(have.assertions ?? []), ...(r.assertions ?? [])].map((a) => [a.id, a])).values()], observations: [...new Map([...(have.observations ?? []), ...(r.observations ?? [])].map((o) => [o.id, o])).values()], identityLinks: [...new Map([...(have.identityLinks ?? []), ...(r.identityLinks ?? [])].map((link) => [evidenceIdentity(link.evidence), link])).values()] });
    }
  }
  return [...resolved.values()];
}

export function customerCounts(rows: Relation[]): { named: number; unnamed: number; concentrations: number } {
  const customers = rows.filter((r) => r.role === 'customer');
  const entities = customers.filter((r) => relationKind(r) === 'entity');
  return { named: new Set(entities.filter((r) => !r.unnamed).map((r) => r.key)).size, unnamed: new Set(entities.filter((r) => r.unnamed).map((r) => r.key)).size, concentrations: customers.filter((r) => relationKind(r) === 'concentration').length };
}

/** A sum is permitted only for exact, same-period, same-scope observations of identified distinct companies. */
export function compatibleShareTotal(rows: Relation[]): number | undefined {
  if (!rows.length || rows.some((r) => relationKind(r) === 'concentration' || r.unnamed || r.qualifier || r.basis !== 'target-revenue')) return undefined;
  const obs = rows.map((r) => r.observations?.find((o) => o.evidenceId === evidenceIdentity(r.evidence[0])) ?? shareObservation(r, r.evidence[0]));
  if (obs.some((o) => !o || !o.period || o.denominator === 'unknown' || o.denominator === 'segment-revenue' || o.denominator === 'line-revenue')) return undefined;
  const first = obs[0]!;
  if (obs.some((o) => o!.period !== first.period || o!.periodEnd !== first.periodEnd || o!.denominator !== first.denominator || o!.scope !== first.scope || o!.segment !== first.segment)) return undefined;
  if (new Set(rows.map((r) => r.key)).size !== rows.length) return undefined;
  const total = obs.reduce((n, o) => n + o!.value, 0);
  return total <= 100 ? total : undefined;
}

export interface ContractInterval {
  id: string;
  entityKey: string;
  name: string;
  role: Role;
  contractKey: string;
  from?: string;
  to?: string;
  state: AssertionState;
  phase?: RelationshipAssertion['phase'];
  assertions: RelationshipAssertion[];
  evidence: Evidence[];
}

/** A later signing after a closure creates another interval, including when a contract name is reused. */
export function contractIntervals(rows: Relation[], effectiveAsOf = new Date().toISOString().slice(0, 10)): ContractInterval[] {
  const intervals: ContractInterval[] = [];
  for (const r of rows.filter((x) => relationKind(x) === 'entity')) {
    const assertions = [...(r.assertions ?? r.evidence.map((e) => assertionFor(e, r)))].filter((a) => a.contractKey).sort((a, b) =>
      (a.effectiveFrom ?? a.effectiveTo ?? a.eventDate ?? a.sourceDate).localeCompare(b.effectiveFrom ?? b.effectiveTo ?? b.eventDate ?? b.sourceDate));
    for (const a of assertions) {
      const prior = intervals.filter((x) => x.entityKey === r.key && x.role === r.role && x.contractKey === a.contractKey).at(-1);
      const start = a.effectiveFrom ?? a.eventDate;
      const ended = a.state === 'ended';
      const create = !prior || !ended && prior.assertions.some((x) => x.state === 'ended') && (start ?? a.sourceDate) > (prior.to ?? prior.assertions.at(-1)!.sourceDate);
      const interval = create ? { id: JSON.stringify([r.key, r.role, a.contractKey, a.id]), entityKey: r.key, name: r.name, role: r.role, contractKey: a.contractKey!, ...(start && !ended ? { from: start } : {}), state: a.state, phase: a.phase, assertions: [], evidence: [] } as ContractInterval : prior;
      if (create) intervals.push(interval);
      interval.assertions.push(a);
      const e = r.evidence.find((x) => evidenceIdentity(x) === a.evidenceId);
      if (e) interval.evidence.push(e);
      if (ended) {
        interval.to = a.effectiveTo ?? a.eventDate;
        interval.state = interval.to && interval.to > effectiveAsOf ? prior?.state === 'ended' ? 'reported' : prior?.state ?? 'reported' : 'ended';
      } else if (!interval.to || (start ?? a.sourceDate) < interval.to) {
        interval.state = a.state;
        interval.phase = a.phase ?? interval.phase;
      }
    }
  }
  return intervals;
}

/** Closure records survive extraction. Unscoped closures remain unresolved rather than erasing a whole company. */
export function lifecycleRelations(sentences: string[], dir: Directory, self: { cik?: number; names: string[] }, ev: Omit<Evidence, 'sentence'>): Relation[] {
  const out: Relation[] = [];
  for (const sentence of sentences) {
    if (!END.test(sentence) && !ENDED_STAKE.test(sentence)) continue;
    if (/\b(?:may|might|could|would|if |risk|subject to|alleg|lawsuit)\b/i.test(sentence)) continue;
    const role: Role | undefined = /\b(?:credit|loan|facility|repaid|payoff|agent)\b/i.test(sentence) ? 'lender'
      : ENDED_STAKE.test(sentence) && /\b(?:stake|interest|investment|shares)\b/i.test(sentence) ? 'investment'
        : /\b(?:lease|tenant|hosting|colocation|customer)\b/i.test(sentence) ? 'customer'
          : /\b(?:partnership|collaboration)\b/i.test(sentence) ? 'partner'
            : /\b(?:supplier|supply agreement|purchase agreement)\b/i.test(sentence) ? 'supplier'
              : /\bcompetes?\b/i.test(sentence) ? 'competitor' : undefined;
    if (!role) continue;
    for (const f of findCompanies(sentence, dir).filter((f) => f.cik !== self.cik && !self.names.some((n) => normalizeName(n) === normalizeName(f.name)))) {
      const e: Evidence = { ...ev, sentence };
      const r: Relation = { key: relationKey(f), name: f.name, cik: f.cik, ticker: f.ticker, id: f.id, yahoo: f.yahoo, role, side: 'own', evidence: [e] };
      e.assertion = { ...assertionFor(e, r), state: 'ended' };
      out.push(r);
    }
  }
  return out;
}
