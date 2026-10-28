import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { loadFiler, loadFilingIndex, loadFilingLabels, loadFilingXbrl, resolveFiler, secAvailable, secTicker } from './sec';

/**
 * FINANCIALS' segment pages: a company's revenue by business segment, by product, by geography and by major customer,
 * and its segments' operating income, as its latest annual report (10-K) tags them in XBRL. SEC company facts leave
 * out every figure with a dimension, so the filing's own XBRL instance is read, with its label file for the names
 * the company gives its segments ("iPhone", not "IPhoneMember").
 */

export type Breakdown = 'segment' | 'product' | 'productService' | 'geography' | 'customer';

export const BREAKDOWN_TITLE: Record<Breakdown, string> = {
  segment: 'business segment',
  product: 'product or service',
  productService: 'products and services',
  geography: 'geography',
  customer: 'major customer',
};

export interface SegmentLine {
  /** The member's name in the filing ("aapl:IPhoneMember", "country:US"). */
  member: string;
  label: string;
  /** In the filing's units (dollars), by period end. */
  values: Record<string, number>;
  /** A line the filing also counts within a larger one ("Compute" within "Data Center"): that line's member. */
  parent?: string;
}

export interface SegmentTable {
  breakdown: Breakdown;
  metric: 'revenue' | 'operating';
  /** The XBRL concept the figures are tagged with. */
  concept: string;
  /** Fiscal years, newest first. */
  periods: { start: string; end: string }[];
  lines: SegmentLine[];
  /** The company's own total for the concept (no dimension), by period end, when it reports one. */
  total: Record<string, number>;
  unit: string;
}

const REVENUE = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'];
const OPERATING = ['OperatingIncomeLoss'];
const AXIS: Record<string, Breakdown> = {
  StatementBusinessSegmentsAxis: 'segment',
  ProductOrServiceAxis: 'product',
  StatementGeographicalAxis: 'geography',
  MajorCustomersAxis: 'customer',
};
const local = (q: string) => q.slice(q.indexOf(':') + 1);
/** A member of the standard taxonomies ("us-gaap:ProductMember"), not one the company defined. */
const STANDARD = /^(?:us-gaap|srt):/;

interface Context {
  start?: string;
  end?: string;
  dims: [axis: string, member: string][];
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

/**
 * The names a label file gives each element, by element id ("aapl_IPhoneMember" → "iPhone"): the terse label, which
 * is the one the report shows ("U.S. Government"), else the standard one ("U S Government"), without " [Member]".
 */
export function parseLabels(xml: string): Map<string, string> {
  const locs = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?loc\b([^>]*)\/?>/g)) {
    const href = /xlink:href="[^"#]*#([^"]+)"/.exec(m[1])?.[1];
    const lab = /xlink:label="([^"]+)"/.exec(m[1])?.[1];
    if (href && lab) locs.set(lab, href);
  }
  const labels = new Map<string, { role: string; text: string }[]>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?label\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?label>/g)) {
    const lab = /xlink:label="([^"]+)"/.exec(m[1])?.[1];
    const role = /xlink:role="([^"]+)"/.exec(m[1])?.[1] ?? '';
    if (lab) labels.set(lab, [...(labels.get(lab) ?? []), { role, text: decode(m[2].replace(/<[^>]*>/g, ' ')) }]);
  }
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?labelArc\b([^>]*)\/?>/g)) {
    const from = locs.get(/xlink:from="([^"]+)"/.exec(m[1])?.[1] ?? '');
    const to = labels.get(/xlink:to="([^"]+)"/.exec(m[1])?.[1] ?? '');
    if (!from || !to) continue;
    const pick = to.find((l) => /terseLabel$/.test(l.role)) ?? to.find((l) => /\/role\/label$/.test(l.role));
    if (pick && (!out.has(from) || /terseLabel$/.test(pick.role))) out.set(from, pick.text.replace(/\s*\[(?:Member|Axis|Domain)\]$/i, '').trim());
  }
  return out;
}

let regionNames: Intl.DisplayNames | null = null;

/** A member's name: the company's label, a country's name, or the element's name in words. */
export function memberLabel(member: string, labels?: Map<string, string>): string {
  if (member.startsWith('country:')) {
    try {
      regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
      return regionNames.of(local(member)) ?? local(member);
    } catch {
      return local(member);
    }
  }
  const own = labels?.get(member.replace(':', '_'));
  if (own) return own;
  return local(member)
    .replace(/Member$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/(?<=\s)(And|Of|The|For|In|Or)(?=\s)/g, (w) => w.toLowerCase())
    .trim();
}

/**
 * Lines a filing counts twice, at two levels ("Data Center" and, within it, "Compute" and "Networking"; "Products"
 * and, within it, "iPhone" and "Mac"): a line equal, in every period both give, to the sum of two or more smaller
 * lines is their parent. Each child follows its parent.
 */
export function nestLines(lines: SegmentLine[], ends: string[]): SegmentLine[] {
  const out = lines.map((l) => ({ ...l, parent: undefined as string | undefined }));
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.001);
  const sorted = [...out].sort((a, b) => Math.abs(b.values[ends[0]] ?? 0) - Math.abs(a.values[ends[0]] ?? 0));
  for (const p of sorted) {
    if (p.parent) continue;
    const pool = sorted.filter((c) => c !== p && !c.parent && Math.abs(c.values[ends[0]] ?? Infinity) < Math.abs(p.values[ends[0]] ?? 0));
    if (pool.length < 2 || pool.length > 14) continue;
    let found = 0;
    for (let mask = 1; mask < 1 << pool.length && !found; mask++) {
      if ((mask & (mask - 1)) === 0) continue;
      const kids = pool.filter((_, i) => mask & (1 << i));
      const ok = ends.every((e) => {
        if (p.values[e] == null) return true;
        if (kids.some((k) => k.values[e] == null)) return false;
        return close(p.values[e], kids.reduce((a, k) => a + k.values[e], 0));
      });
      if (ok) found = mask;
    }
    if (found) pool.forEach((c, i) => found & (1 << i) && (c.parent = p.member));
  }
  // Parents in their order, each followed by its children.
  const tops = out.filter((l) => !l.parent);
  return tops.flatMap((t) => [t, ...out.filter((c) => c.parent === t.member)]).map((l) => (l.parent ? l : { ...l, parent: undefined }));
}

const days = (start: string, end: string) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;

/**
 * The segment tables in a 10-K's XBRL instance: for each breakdown (business segments, product lines, products and
 * services, geography, major customers) the revenue of each member over the fiscal years the report gives, and the
 * business segments' operating income. A context counts when its only dimension is the breakdown's axis, or that axis
 * with the operating segments of the consolidation axis (intersegment eliminations and corporate items are left out).
 * Where several revenue concepts are tagged, the one with the most figures is taken.
 */
export function parseSegments(xml: string, labels?: Map<string, string>): SegmentTable[] {
  const contexts = new Map<string, Context>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const b = m[2];
    contexts.set(m[1], {
      start: /<(?:[\w-]+:)?startDate>\s*(\d{4}-\d{2}-\d{2})/.exec(b)?.[1],
      end: /<(?:[\w-]+:)?endDate>\s*(\d{4}-\d{2}-\d{2})/.exec(b)?.[1],
      dims: [...b.matchAll(/<(?:[\w-]+:)?explicitMember\b[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)].map((x): [string, string] => [x[1], x[2]]),
    });
  }
  const units = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?unit>/g)) {
    const measure = /<(?:[\w-]+:)?measure>\s*([^<\s]+)/.exec(m[2])?.[1];
    if (measure) units.set(m[1], local(measure));
  }
  // concept → breakdown → member → end → value; and the concept's total by end.
  type Cell = { start: string; value: number; unit: string };
  const facts = new Map<string, Map<Breakdown, Map<string, Map<string, Cell>>>>();
  const totals = new Map<string, Map<string, number>>();
  const wanted = new Set([...REVENUE, ...OPERATING]);
  for (const m of xml.matchAll(/<us-gaap:(\w+)\b([^>]*?)>([^<]*)<\/us-gaap:\1>/g)) {
    const concept = m[1];
    if (!wanted.has(concept)) continue;
    const ctx = contexts.get(/\bcontextRef="([^"]+)"/.exec(m[2])?.[1] ?? '');
    const value = Number(m[3].trim());
    if (!ctx?.start || !ctx.end || !Number.isFinite(value)) continue;
    const d = days(ctx.start, ctx.end);
    if (d < 340 || d > 380) continue;
    const unit = units.get(/\bunitRef="([^"]+)"/.exec(m[2])?.[1] ?? '') ?? '';
    const dims = ctx.dims.filter(([axis, member]) => !(local(axis) === 'ConsolidationItemsAxis' && local(member) === 'OperatingSegmentsMember'));
    if (!dims.length) {
      if (!ctx.dims.length) {
        const t = totals.get(concept) ?? new Map<string, number>();
        t.set(ctx.end, value);
        totals.set(concept, t);
      }
      continue;
    }
    if (dims.length !== 1) continue;
    const [axis, member] = dims[0];
    const breakdown = AXIS[local(axis)];
    if (!breakdown) continue;
    if (OPERATING.includes(concept) && breakdown !== 'segment') continue;
    const byB = facts.get(concept) ?? new Map();
    facts.set(concept, byB);
    const byM = byB.get(breakdown) ?? new Map<string, Map<string, Cell>>();
    byB.set(breakdown, byM);
    const byE = byM.get(member) ?? new Map<string, Cell>();
    byM.set(member, byE);
    byE.set(ctx.end, { start: ctx.start, value, unit });
  }
  const out: SegmentTable[] = [];
  const order: Breakdown[] = ['segment', 'product', 'geography', 'customer'];
  for (const metric of ['revenue', 'operating'] as const) {
    const concepts = metric === 'revenue' ? REVENUE : OPERATING;
    for (const breakdown of order) {
      if (metric === 'operating' && breakdown !== 'segment') continue;
      // The concept with the most figures for this breakdown (ties go to the list's order).
      let best: { concept: string; members: Map<string, Map<string, Cell>>; n: number } | null = null;
      for (const concept of concepts) {
        const members = facts.get(concept)?.get(breakdown);
        if (!members) continue;
        const n = [...members.values()].reduce((a, m) => a + m.size, 0);
        if (!best || n > best.n) best = { concept, members, n };
      }
      if (!best || best.members.size < 2) continue;
      const ends = new Map<string, string>();
      for (const byE of best.members.values()) for (const [end, c] of byE) ends.set(end, c.start);
      const periods = [...ends.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3).map(([end, start]) => ({ start, end }));
      const latest = periods[0].end;
      const raw = [...best.members.entries()]
        .map(([member, byE]) => ({ member, label: memberLabel(member, labels), values: Object.fromEntries(periods.filter((p) => byE.has(p.end)).map((p) => [p.end, byE.get(p.end)!.value])) }))
        .filter((l) => Object.keys(l.values).length > 0)
        .sort((a, b) => (b.values[latest] ?? -Infinity) - (a.values[latest] ?? -Infinity) || a.label.localeCompare(b.label));
      const unit = [...best.members.values()][0].values().next().value?.unit ?? '';
      const total = Object.fromEntries(periods.filter((p) => totals.get(best!.concept)?.has(p.end)).map((p) => [p.end, totals.get(best!.concept)!.get(p.end)!]));
      const periodEnds = periods.map((p) => p.end);
      // Products and services as the standard taxonomy splits them, beside the company's own product lines, when each
      // set adds up to the total on its own (Microsoft: "Product" and "Service Other", and its lines of business).
      const adds = (ls: SegmentLine[]) => total[latest] != null && ls.length > 0 && Math.abs(ls.reduce((a, l) => a + (l.values[latest] ?? 0), 0) - total[latest]) <= Math.abs(total[latest]) * 0.005;
      const standard = raw.filter((l) => STANDARD.test(l.member));
      const own = raw.filter((l) => !STANDARD.test(l.member));
      if (breakdown === 'product' && standard.length >= 2 && own.length >= 2 && adds(standard) && adds(own)) {
        out.push({ breakdown: 'product', metric, concept: best.concept, periods, lines: nestLines(own, periodEnds), total, unit });
        out.push({ breakdown: 'productService', metric, concept: best.concept, periods, lines: standard, total, unit });
        continue;
      }
      out.push({ breakdown, metric, concept: best.concept, periods, lines: nestLines(raw, periodEnds), total, unit });
    }
  }
  return out;
}

export interface SegmentReport {
  form: string;
  filed: string;
  /** The filing's folder on EDGAR. */
  url: string;
  tables: SegmentTable[];
}

export type SegmentState = { state: 'loading' } | { state: 'ok'; report: SegmentReport } | { state: 'none'; message: string } | { state: 'error'; message: string };

export const segmentStore = createStore<{ v: number; by: Record<string, SegmentState> }>({ v: 0, by: {} });
const asked = new Set<string>();

function setState(id: string, s: SegmentState) {
  segmentStore.set((x) => ({ v: x.v + 1, by: { ...x.by, [id]: s } }));
}

/** Reads the company's latest 10-K and its segment tables. */
async function build(def: SecurityDef) {
  const ticker = secTicker(def);
  if (!ticker) return setState(def.id, { state: 'none', message: 'Segments come from SEC filings: this security has no US listing in the SEC’s list.' });
  setState(def.id, { state: 'loading' });
  const filer = await resolveFiler(ticker);
  if (!filer.ok) return setState(def.id, { state: 'error', message: filer.reason === 'needs-agent' ? 'Segments need SEC_USER_AGENT (your name and email) in PROVIDERS.' : 'The SEC’s company list could not be read.' });
  const filings = await loadFiler(filer.data.cik);
  if (!filings.ok) return setState(def.id, { state: 'error', message: 'The company’s filings could not be read.' });
  const annual = filings.data.filings.find((f) => f.form === '10-K' || f.form === '10-K/A');
  if (!annual) return setState(def.id, { state: 'none', message: 'No annual report on Form 10-K among the company’s filings (foreign filers report on 20-F, in IFRS).' });
  const index = await loadFilingIndex(filer.data.cik, annual.accession);
  const names = index.ok ? index.data : [];
  const instance = names.find((n) => /_htm\.xml$/i.test(n));
  if (!instance) return setState(def.id, { state: 'none', message: `The ${annual.form} of ${annual.filed} has no XBRL instance on EDGAR.` });
  // The label file; some filers keep the labels inside the schema instead.
  const lab = names.find((n) => /_lab\.xml$/i.test(n)) ?? names.find((n) => /\.xsd$/i.test(n));
  const [xml, labXml] = await Promise.all([loadFilingXbrl(filer.data.cik, annual.accession, instance), lab ? loadFilingLabels(filer.data.cik, annual.accession, lab) : Promise.resolve(null)]);
  if (!xml.ok) return setState(def.id, { state: 'error', message: `The XBRL of the ${annual.form} of ${annual.filed} could not be read.` });
  const tables = parseSegments(xml.data, labXml?.ok ? parseLabels(labXml.data) : undefined);
  const url = `https://www.sec.gov/Archives/edgar/data/${filer.data.cik}/${annual.accession.replace(/-/g, '')}/`;
  setState(def.id, tables.length ? { state: 'ok', report: { form: annual.form, filed: annual.filed, url, tables } } : { state: 'none', message: `The ${annual.form} of ${annual.filed} tags no revenue by segment, product, geography or customer.` });
}

/** The company's segment tables, read once a session. */
export function useSegments(def: SecurityDef | undefined, on: boolean): SegmentState | undefined {
  segmentStore.use((s) => s.v);
  const id = def?.id ?? '';
  useEffect(() => {
    if (!def || !on || !secAvailable() || asked.has(id)) return;
    asked.add(id);
    void build(def).catch(() => setState(id, { state: 'error', message: 'The segment tables could not be read.' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, on]);
  return id ? segmentStore.get().by[id] : undefined;
}
