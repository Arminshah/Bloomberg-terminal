import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { engine } from '../market';
import type { SecurityDef } from '../types';
import { yahooGet } from './yahoo';
import { parseSpark } from './index-members';
import { filingLinks, findByTicker, loadFiler, loadSecCompanies, secAvailable, secTicker, type SecCompany } from './sec';

/**
 * SPLC: a company's suppliers, customers and competitors as annual reports state them. Companies name their large
 * customers with the share of revenue each brought (Fabrinet: "NVIDIA Corporation ... contributed 16.3% of our
 * revenues"), their key suppliers (CoreWeave relies on NVIDIA GPUs) and their competitors. The SEC's full-text
 * search finds the reports of the last 18 months that name the company; the desktop app reads the sentences that
 * name it and classifies them here. The company's own report adds the suppliers, customers and competitors it
 * names itself. Every relation keeps the sentence and filing it comes from.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Role = 'supplier' | 'customer' | 'competitor' | 'partner' | 'investment';

/** What a share is a share of. */
export type Basis =
  /** The related company's revenue that comes from the target (a supplier's sales to it). */
  | 'their-revenue'
  /** The related company's revenue from reselling the target's products (a distributor). */
  | 'their-product-sales'
  /** The related company's purchases, cost of sales or capital spending that go to the target. */
  | 'their-purchases'
  /** The target's revenue that comes from the related company (the target's own disclosure). */
  | 'target-revenue';

export interface Evidence {
  sentence: string;
  /** Who filed it: the related company or the target itself. */
  filer: string;
  form: string;
  /** Filing date, YYYY-MM-DD. */
  date: string;
  /** cik/accession/file of the document. */
  path: string;
}

export interface Relation {
  key: string;
  name: string;
  /** US ticker from the SEC's company list. */
  ticker?: string;
  cik?: number;
  /** The app's security id when the company is one of its built-in securities. */
  id?: string;
  /** Yahoo's symbol, for the day's change. */
  yahoo?: string;
  role: Role;
  share?: number;
  /** The share is "more than" or "at least" (10% or more), or "less than". */
  qualifier?: '>' | '<';
  basis?: Basis;
  /** Who states it: the related company's report, the target's own, or both. */
  side: 'theirs' | 'own' | 'both';
  evidence: Evidence[];
}

// ------------------------------------------------------------------ names

const SUFFIX = /(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Cos|Ltd|Limited|LLC|L\.L\.C|plc|N\.V|NV|S\.A|SA|AG|SE|SpA|S\.p\.A|GmbH|LP|L\.P|Holdings?|Group|Hldgs|Bhd|Pty)\.?)+$/i;
const STATE_TAG = /\s*\/[A-Z]{2,3}\/?\s*$/;

/** A company name without its legal form, punctuation or case: "Cisco Systems, Inc." → "cisco systems". */
export function normalizeName(name: string): string {
  let s = String(name).replace(STATE_TAG, '').replace(/\(.*?\)/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, '').replace(/\s*(?:&|\band)$/i, '').trim();
  return s
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, ' and ')
    .replace(/\.com\b/g, ' com')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(class [abc]|common stock|ordinary shares|ads|adr)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const titleWord = (w: string) => (/^[A-Z][A-Z'-]+$/.test(w) && w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w);
const suffixWord = (w: string): string | undefined => {
  const k = w.toUpperCase().replace(/,$/, '');
  return SUFFIX_WORD[k] ?? SUFFIX_WORD[k.replace(/\.$/, '')];
};

/** Words that are also short company names but too common to read as one alone. */
const COMMON = new Set(
  ('a an and are as at be by for from in is it its of on or our the their these this those to we with which who will can may new one two first global general united american national international ' +
    'energy capital data cloud core edge digital health life trust bank equity target visa block match gap unity snap box five apple meta alphabet arm amazon ' +
    'company customer customers supplier suppliers vendor vendors competitor competitors china europe asia israel taiwan korea japan india america us u s ai gpu gpus cpu cpus soc socs').split(' '),
);

/** Well-known companies by the names reports use for them, with their listing when the SEC list lacks it. */
interface Known {
  name: string;
  ticker?: string;
  id?: string;
  yahoo?: string;
}
const KNOWN: Record<string, Known> = {
  tsmc: { name: 'Taiwan Semiconductor Mfg', ticker: 'TSM' },
  'taiwan semiconductor': { name: 'Taiwan Semiconductor Mfg', ticker: 'TSM' },
  'taiwan semiconductor manufacturing': { name: 'Taiwan Semiconductor Mfg', ticker: 'TSM' },
  samsung: { name: 'Samsung Electronics', id: '005930 KS Equity', yahoo: '005930.KS' },
  'samsung electronics': { name: 'Samsung Electronics', id: '005930 KS Equity', yahoo: '005930.KS' },
  'sk hynix': { name: 'SK Hynix', yahoo: '000660.KS' },
  hynix: { name: 'SK Hynix', yahoo: '000660.KS' },
  'hon hai': { name: 'Hon Hai Precision', yahoo: '2317.TW' },
  'hon hai precision industry': { name: 'Hon Hai Precision', yahoo: '2317.TW' },
  'hon hai precision': { name: 'Hon Hai Precision', yahoo: '2317.TW' },
  foxconn: { name: 'Hon Hai Precision', yahoo: '2317.TW' },
  wistron: { name: 'Wistron Corp', yahoo: '3231.TW' },
  'quanta computer': { name: 'Quanta Computer', yahoo: '2382.TW' },
  pegatron: { name: 'Pegatron Corp', yahoo: '4938.TW' },
  mediatek: { name: 'MediaTek', yahoo: '2454.TW' },
  'renesas electronics': { name: 'Renesas Electronics', yahoo: '6723.T' },
  renesas: { name: 'Renesas Electronics', yahoo: '6723.T' },
  'tokyo electron': { name: 'Tokyo Electron', yahoo: '8035.T' },
  tencent: { name: 'Tencent Holdings', id: '700 HK Equity', yahoo: '0700.HK' },
  lenovo: { name: 'Lenovo Group', yahoo: '0992.HK' },
  xiaomi: { name: 'Xiaomi Corp', yahoo: '1810.HK' },
  byd: { name: 'BYD Co', yahoo: '1211.HK' },
  luxshare: { name: 'Luxshare Precision', yahoo: '002475.SZ' },
  'lg electronics': { name: 'LG Electronics', yahoo: '066570.KS' },
  'lg energy solution': { name: 'LG Energy Solution', yahoo: '373220.KS' },
  catl: { name: 'CATL', yahoo: '300750.SZ' },
  'contemporary amperex technology': { name: 'CATL', yahoo: '300750.SZ' },
  murata: { name: 'Murata Manufacturing', yahoo: '6981.T' },
  'murata manufacturing': { name: 'Murata Manufacturing', yahoo: '6981.T' },
  tdk: { name: 'TDK Corp', yahoo: '6762.T' },
  kioxia: { name: 'Kioxia Holdings', yahoo: '285A.T' },
  ibiden: { name: 'Ibiden', yahoo: '4062.T' },
  unimicron: { name: 'Unimicron', yahoo: '3037.TW' },
  smic: { name: 'SMIC', yahoo: '0981.HK' },
  'semiconductor manufacturing international': { name: 'SMIC', yahoo: '0981.HK' },
  infineon: { name: 'Infineon Technologies', id: 'IFX GY Equity', yahoo: 'IFX.DE' },
  'infineon technologies': { name: 'Infineon Technologies', id: 'IFX GY Equity', yahoo: 'IFX.DE' },
  siemens: { name: 'Siemens', id: 'SIE GY Equity', yahoo: 'SIE.DE' },
  'mercedes benz': { name: 'Mercedes-Benz Group', id: 'MBG GY Equity', yahoo: 'MBG.DE' },
  bmw: { name: 'BMW', id: 'BMW GY Equity', yahoo: 'BMW.DE' },
  volkswagen: { name: 'Volkswagen', id: 'VOW3 GY Equity', yahoo: 'VOW3.DE' },
  continental: { name: 'Continental', id: 'CON GY Equity', yahoo: 'CON.DE' },
  huawei: { name: 'Huawei Technologies' },
  'huawei technologies': { name: 'Huawei Technologies' },
  hisilicon: { name: 'HiSilicon' },
  bosch: { name: 'Robert Bosch' },
  'robert bosch': { name: 'Robert Bosch' },
  openai: { name: 'OpenAI' },
  anthropic: { name: 'Anthropic' },
  xai: { name: 'xAI' },
  amd: { name: 'Advanced Micro Devices', ticker: 'AMD' },
  amazon: { name: 'Amazon.com', ticker: 'AMZN' },
  'amazon web services': { name: 'Amazon.com', ticker: 'AMZN' },
  aws: { name: 'Amazon.com', ticker: 'AMZN' },
  google: { name: 'Alphabet', ticker: 'GOOGL' },
  alphabet: { name: 'Alphabet', ticker: 'GOOGL' },
  meta: { name: 'Meta Platforms', ticker: 'META' },
  facebook: { name: 'Meta Platforms', ticker: 'META' },
  apple: { name: 'Apple', ticker: 'AAPL' },
  arm: { name: 'Arm Holdings', ticker: 'ARM' },
  'alibaba group': { name: 'Alibaba Group', ticker: 'BABA' },
  alibaba: { name: 'Alibaba Group', ticker: 'BABA' },
  supermicro: { name: 'Super Micro Computer', ticker: 'SMCI' },
  'super micro': { name: 'Super Micro Computer', ticker: 'SMCI' },
  hpe: { name: 'Hewlett Packard Enterprise', ticker: 'HPE' },
  'hewlett packard enterprise': { name: 'Hewlett Packard Enterprise', ticker: 'HPE' },
  hp: { name: 'HP Inc', ticker: 'HPQ' },
  ibm: { name: 'IBM', ticker: 'IBM' },
  dell: { name: 'Dell Technologies', ticker: 'DELL' },
  'dell technologies': { name: 'Dell Technologies', ticker: 'DELL' },
  intel: { name: 'Intel', ticker: 'INTC' },
  micron: { name: 'Micron Technology', ticker: 'MU' },
  qualcomm: { name: 'Qualcomm', ticker: 'QCOM' },
  broadcom: { name: 'Broadcom', ticker: 'AVGO' },
  cisco: { name: 'Cisco Systems', ticker: 'CSCO' },
  microsoft: { name: 'Microsoft', ticker: 'MSFT' },
  oracle: { name: 'Oracle', ticker: 'ORCL' },
  nvidia: { name: 'NVIDIA', ticker: 'NVDA' },
  tesla: { name: 'Tesla', ticker: 'TSLA' },
  walmart: { name: 'Walmart', ticker: 'WMT' },
  costco: { name: 'Costco Wholesale', ticker: 'COST' },
};

/** The names a company goes by in other companies' reports, by its ticker. */
const ALIASES: Record<string, { legal: string[]; names: string[] }> = {
  AAPL: { legal: ['Apple Inc'], names: ['Apple'] },
  MSFT: { legal: ['Microsoft Corporation'], names: ['Microsoft'] },
  AMZN: { legal: ['Amazon.com'], names: ['Amazon', 'Amazon.com', 'Amazon Web Services', 'AWS'] },
  GOOGL: { legal: ['Google LLC', 'Alphabet Inc'], names: ['Google', 'Alphabet'] },
  GOOG: { legal: ['Google LLC', 'Alphabet Inc'], names: ['Google', 'Alphabet'] },
  META: { legal: ['Meta Platforms'], names: ['Meta Platforms', 'Meta', 'Facebook'] },
  NVDA: { legal: ['NVIDIA Corporation'], names: ['NVIDIA'] },
  TSM: { legal: ['Taiwan Semiconductor Manufacturing'], names: ['TSMC', 'Taiwan Semiconductor'] },
  AMD: { legal: ['Advanced Micro Devices'], names: ['Advanced Micro Devices', 'AMD'] },
  INTC: { legal: ['Intel Corporation'], names: ['Intel'] },
  AVGO: { legal: ['Broadcom Inc'], names: ['Broadcom'] },
  SMCI: { legal: ['Super Micro Computer'], names: ['Super Micro', 'Supermicro'] },
  DELL: { legal: ['Dell Technologies'], names: ['Dell Technologies', 'Dell'] },
  HPE: { legal: ['Hewlett Packard Enterprise'], names: ['Hewlett Packard Enterprise', 'HPE'] },
  HPQ: { legal: ['HP Inc'], names: ['HP Inc'] },
  IBM: { legal: ['International Business Machines'], names: ['IBM', 'International Business Machines'] },
  TSLA: { legal: ['Tesla, Inc', 'Tesla Inc'], names: ['Tesla'] },
  WMT: { legal: ['Walmart Inc'], names: ['Walmart', 'Wal-Mart'] },
  COST: { legal: ['Costco Wholesale'], names: ['Costco'] },
  TGT: { legal: ['Target Corporation'], names: ['Target Corporation'] },
  ORCL: { legal: ['Oracle Corporation'], names: ['Oracle'] },
  CSCO: { legal: ['Cisco Systems'], names: ['Cisco'] },
  QCOM: { legal: ['Qualcomm'], names: ['Qualcomm'] },
  MU: { legal: ['Micron Technology'], names: ['Micron'] },
  GM: { legal: ['General Motors'], names: ['General Motors'] },
  F: { legal: ['Ford Motor Company'], names: ['Ford Motor', 'Ford'] },
  BA: { legal: ['The Boeing Company', 'Boeing Company'], names: ['Boeing'] },
  ARM: { legal: ['Arm Holdings', 'Arm Limited'], names: ['Arm Holdings', 'Arm Limited'] },
  BABA: { legal: ['Alibaba Group'], names: ['Alibaba'] },
};

const SUFFIX_WORD: Record<string, string> = { CORP: 'Corporation', CORPORATION: 'Corporation', INC: 'Inc', INCORPORATED: 'Incorporated', LTD: 'Ltd', LIMITED: 'Limited', PLC: 'plc', CO: 'Company', LLC: 'LLC', 'N.V.': 'N.V.', NV: 'N.V.', AG: 'AG', SE: 'SE', 'S.A.': 'S.A.', SA: 'S.A.' };

export interface TargetNames {
  /** Full legal names searched in the SEC's index ("NVIDIA Corporation"). */
  legal: string[];
  /** Names matched in sentences ("NVIDIA"; for Apple "Apple", which excludes "Apple Pay"). */
  names: string[];
}

/** How other reports name a company: its legal name for the search, its short names for reading. */
export function targetNames(ticker: string | undefined, title: string): TargetNames {
  const alias = ticker ? ALIASES[ticker.toUpperCase()] : undefined;
  if (alias) return { legal: alias.legal, names: [...new Set([...alias.names, ...alias.legal.map((l) => l.replace(SUFFIX, '').trim())])] };
  const clean = title.replace(STATE_TAG, '').replace(/\s+/g, ' ').trim();
  const words = clean.replace(/,/g, ' ').split(' ').filter(Boolean);
  const tail: string[] = [];
  while (words.length > 1 && suffixWord(words[words.length - 1])) tail.unshift(words.pop()!);
  const base = words.map(titleWord).join(' ').replace(/ Com$/, '.com');
  const legalSuffix = tail.length ? suffixWord(tail[0]) : '';
  const legal = legalSuffix ? `${base} ${legalSuffix}` : base;
  const names = [base];
  const first = words[0] ? titleWord(words[0]) : '';
  if (words.length > 1 && first.length >= 4 && !COMMON.has(first.toLowerCase()) && !/^(Advanced|Applied|Super|Texas|Western|Eastern|Southern|Northern|Royal|Natural|Universal|Pacific|Atlantic|Integrated|Consolidated)$/i.test(first)) names.push(first);
  return { legal: [legal.replace(/[^A-Za-z0-9 .,&'()-]/g, '').slice(0, 59)], names: [...new Set(names.filter((n) => n.length >= 2).map((n) => n.replace(/[^A-Za-z0-9 .,&'-]/g, '').slice(0, 59)))] };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A pattern for the target's names in a sentence: names in capitals in any case, others as written or in capitals. */
export function targetPattern(names: string[]): RegExp {
  const alts = names.flatMap((n) => (/[a-z]/.test(n) ? [escapeRe(n), escapeRe(n.toUpperCase())] : [n.split('').map((c) => (/[A-Za-z]/.test(c) ? `[${c.toUpperCase()}${c.toLowerCase()}]` : escapeRe(c))).join('')]));
  alts.sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![A-Za-z0-9])(?:${alts.join('|')})(?![A-Za-z0-9])`, 'g');
}

const LEGAL_FORM = /^(?:'s)?,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|Group|Holdings?|Technologies|Technology|Systems|Platforms|Computer|Electronics)\b/;
const PRODUCT_NOUN = /^(?:'s)?\s+(?:[A-Z][\w-]*\s+){0,2}(?:GPUs?|chips?|processors?|hardware|products?|systems?|platforms?|components?|accelerators?|servers?|devices?|technology|semiconductors?|solutions?)\b/;

interface Mention {
  index: number;
  end: number;
  /** "NVIDIA GB200", "Apple Pay": the name of a product rather than the company. */
  product: boolean;
  /** "NVIDIA GPUs": the company's products, which still says it supplies them. */
  goods: boolean;
}

/** Where a sentence names the target, telling the company from its products ("Apple Pay", "NVIDIA NVLink"). */
export function mentions(sentence: string, pattern: RegExp): Mention[] {
  const out: Mention[] = [];
  pattern.lastIndex = 0;
  for (let m = pattern.exec(sentence); m; m = pattern.exec(sentence)) {
    const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const capitalNext = /^(?:'s)?\s+[A-Z0-9]/.test(after) && !LEGAL_FORM.test(after);
    out.push({ index: m.index, end: m.index + m[0].length, product: capitalNext, goods: PRODUCT_NOUN.test(after) });
  }
  return out;
}

// -------------------------------------------------------------- percentages

interface Pct {
  value: number;
  index: number;
  end: number;
}

/** Runs of percentages written together ("19.9%, 16.3%, 10.7% and 10.5%", "91 percent, 89 percent"). */
export function percentRuns(s: string): Pct[][] {
  const all: Pct[] = [];
  const re = /(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent\b|per cent\b)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) all.push({ value: Number(m[1]), index: m.index, end: m.index + m[0].length });
  const runs: Pct[][] = [];
  for (const p of all) {
    const last = runs[runs.length - 1];
    if (last && /^\s*,?\s*(?:and\s+|or\s+)?$/i.test(s.slice(last[last.length - 1].end, p.index))) last.push(p);
    else runs.push([p]);
  }
  return runs;
}

const OF_REVENUE = /^(?:\s*,?\s*(?:or more|or greater|or less))?\s*,?\s*(?:respectively\s*,?\s*)?(?:of|in)\s+(?:the\s+)?(?:(?:our|its|their|the Company's|the Group's|Company's|Group's|total|consolidated|net|aggregate|annual|worldwide)\s+)*(?:(?:total|net|consolidated|product|segment|gross)\s+)*(?:revenue|revenues|net sales|sales|turnover)\b/i;
const OF_PURCHASES = /^(?:\s*,?\s*(?:or more|or greater|or less))?\s*,?\s*(?:respectively\s*,?\s*)?(?:of|in)\s+(?:the\s+)?(?:(?:our|its|their|the Company's|the Group's|total|consolidated|net|aggregate|annual)\s+)*(?:(?:total|net|consolidated)\s+)*(?:purchases|inventory purchases|component purchases|cost of (?:revenue|revenues|sales|goods sold)|capital expenditures|property and equipment purchases|procurement)\b/i;
const VERB = /\b(?:contributed|accounted for|represented|comprised|constituted|amounted to|made up|generated)\b/i;

function qualifierOf(s: string, run: Pct[]): '>' | '<' | undefined {
  const before = s.slice(Math.max(0, run[0].index - 26), run[0].index);
  const after = s.slice(run[run.length - 1].end, run[run.length - 1].end + 16);
  if (/(?:more than|over|at least|greater than|in excess of|exceeding)\s*$/i.test(before) || /^\s*or (?:more|greater)/i.test(after)) return '>';
  if (/(?:less than|under|below)\s*$/i.test(before) || /^\s*or less/i.test(after)) return '<';
  return undefined;
}

/** Strips legal forms so that "Cisco Systems, Inc., NVIDIA Corporation and Amazon.com, Inc." splits into three. */
function stripForms(s: string): string {
  return s.replace(/,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|L\.L\.C|plc|PLC|N\.V|S\.A|AG|SE|LP|L\.P)\.?(?=[\s,;)]|$)/g, '');
}

const PRONOUN_START = /^(?:we|our|it|its|they|their|this|these|the company|the group|sales|revenue|revenues|which|who)\b/i;

/**
 * Which percentage of a run belongs to the target: the one in its place among the companies named before the verb
 * ("Cisco, NVIDIA, Nokia and Amazon contributed 19.9%, 16.3%, 10.7% and 10.5%, respectively"), else the latest
 * year's when the run gives several years ("91 percent, 89 percent, and 87 percent for fiscal 2026, 2025, 2024").
 */
export function shareInRun(s: string, run: Pct[], pattern: RegExp): number | undefined {
  if (run.length === 1) return run[0].value;
  const head = s.slice(0, run[0].index);
  const verb = VERB.exec(head);
  if (verb && /\brespectively\b/i.test(s)) {
    let subject = stripForms(head.slice(0, verb.index));
    subject = subject.replace(/^.*?\b(?:During|For|In|As of|At)\b[^,]*\d{4}[^,]*,\s*/i, '').replace(/\([^)]*\)/g, ' ');
    const pieces = subject
      .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
      .map((p) => p.trim())
      .filter((p) => /^[A-Z]/.test(p) && p.split(/\s+/).length <= 6 && !PRONOUN_START.test(p));
    if (pieces.length === run.length) {
      const i = pieces.findIndex((p) => {
        pattern.lastIndex = 0;
        return pattern.test(p);
      });
      if (i >= 0) return run[i].value;
    }
  }
  // The years in the order written are the order of the percentages; the latest year's share is the one shown.
  const order = (s.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number).filter((y, i, a) => a.indexOf(y) === i);
  if (order.length === run.length) return run[order.indexOf(Math.max(...order))].value;
  return undefined;
}

// ------------------------------------------------------------ classification

const COMPETITION_NOISE = /\b(?:Competition (?:Authority|Commission|Bureau|Tribunal|Act|Law)|competition (?:law|laws|authorit\w*|regulat\w*)|anti-?competitive|competitive(?:ly|ness)?)\b/g;
/** Career lines in biographies ("Prior to his tenure at Apple, he served as a partner at McKinsey"). */
const BIOGRAPHY = /\b(?:served as|serves as|serving as|tenure at|prior to joining|previously (?:served|held|worked|was)|held (?:various|senior|several|a|an|the) |career at|was employed|worked at|joined (?:us|the Company|our company) from|member of the board|board of directors of)\b/i;
/** Lawsuits, patents and trade cases name companies without a commercial relation. */
const LITIGATION = /\b(?:infring\w*|patents?|litigation|lawsuits?|complaint|court|International Trade Commission|exclusion order|antitrust|alleg\w+|plaintiffs?|defendants?)\b/i;
/** The filer itself: investments and partnerships count only when they involve it. */
const FILER = /\b(?:we|us|our|the Company|the Company's|the Group|the Group's|the Registrant)\b/i;
const INVEST_AFTER = /^(?:'s)?[^.;]{0,120}?\b(?:invest(?:s|ed|ing|ment|ments)?|private placement|purchase agreement|shares|stock|warrants?|stake|shareholder|stockholder)\b/i;
const INVEST_BEFORE = /\b(?:private placement|securities purchase agreement|stock purchase agreement|subscription agreement|shares|stock|warrants?|depositary)\b[^.;]{0,160}$/i;

export interface Classified {
  role: Role;
  share?: number;
  qualifier?: '>' | '<';
  basis?: Basis;
}

/** Text between a list word ("such as", "including") and the name that holds only names: "Amazon, Apple Inc. (\"Apple\"), ". */
export function listy(gap: string): boolean {
  return /^[\s,:;]*(?:(?:[A-Z0-9][\w&.'/-]*|and|or|&|the|its|of|e\.g\.|i\.e\.|as well as|\([^)]*\)|"[^"]*")[\s,:;]*)*$/.test(gap);
}

function after(s: string, m: Mention, re: RegExp): boolean {
  return re.test(s.slice(m.end, m.end + 140));
}

function gapListy(b: string, re: RegExp): boolean {
  const m = re.exec(b);
  return !!m && listy(m[1] ?? '');
}

/**
 * What a sentence in another company's report says about the target: that the filer supplies it (with the share of
 * the filer's revenue), buys from it or resells its products, competes with it, partners with it, or took its
 * investment; null when it says none of these. `pattern` matches the target's names.
 */
export function classify(sentence: string, pattern: RegExp): Classified | null {
  const s = sentence.replace(/^\[competitors\]\s*/, '');
  const ms = mentions(s, pattern);
  const company = ms.filter((m) => !m.product);
  if (!ms.length || BIOGRAPHY.test(s)) return null;

  // Shares: a run of percentages "of our revenues" or "of our purchases".
  for (const run of percentRuns(s)) {
    const tail = s.slice(run[run.length - 1].end, run[run.length - 1].end + 140);
    const revenue = OF_REVENUE.test(tail);
    const purchases = !revenue && OF_PURCHASES.test(tail);
    if (!revenue && !purchases) continue;
    const share = shareInRun(s, run, pattern);
    const qualifier = qualifierOf(s, run);
    const p = pattern.source;
    const distributor = new RegExp(`(?:products?|solutions?|offerings?)\\s+(?:purchased\\s+|sourced\\s+|bought\\s+)?from\\s+(?:[^.]{0,40}?)(?:${p})|sales of (?:${p})(?:'s)?\\s+(?:[A-Za-z.,-]+\\s+){0,3}?products|(?:${p})(?:'s)?\\s+(?:branded\\s+)?products`).test(s);
    if (distributor) return { role: 'customer', share, qualifier, basis: 'their-product-sales' };
    if (purchases) return { role: 'customer', share, qualifier, basis: 'their-purchases' };
    if (company.length) return { role: 'supplier', share, qualifier, basis: 'their-revenue' };
  }

  // A stake taken in the filer: "NVIDIA invested $2 billion in the Company's common stock". Share deals that do not
  // name the filer ("shares were delivered to NVIDIA") are no supply relation either.
  if (!/\b(?:revenue|revenues|net sales)\b/i.test(s) && company.some((c) => INVEST_AFTER.test(s.slice(c.end)) || INVEST_BEFORE.test(s.slice(Math.max(0, c.index - 200), c.index)))) {
    return FILER.test(s) ? { role: 'investment' } : null;
  }

  // Competitors: "our competitors include ... NVIDIA", "Apple, Dell and HP are the main competitors".
  const plain = s.replace(COMPETITION_NOISE, ' ');
  if (company.length) {
    const comp = /\b(?:competitors?|compete[sd]?|competing|competition)\b/gi;
    for (let m = comp.exec(plain); m; m = comp.exec(plain)) {
      const at = m.index + m[0].length;
      if (company.some((c) => c.index > m!.index && (c.index - m!.index < 260 || (c.index - at < 1200 && /\b(?:include|includes|including|such as|are|:)\b/i.test(plain.slice(at, at + 80)))))) return { role: 'competitor' };
    }
    if (company.some((c) => /^[^.]{0,250}?\b(?:is|are|as|remains?|were|was)\s+(?:the\s+|our\s+|a\s+|one of (?:our|the)\s+)?(?:\w+\s+){0,3}competitors?\b/i.test(plain.slice(c.end)))) return { role: 'competitor' };
  }
  if (LITIGATION.test(s)) return null;

  // The target buying from its own suppliers ("NVIDIA relies on suppliers such as TSMC") says nothing of the filer.
  if (company.some((c) => /^(?:'s)?\s+(?:\w+\s+){0,2}?(?:relies|depends|uses|utilizes|sources|purchases|buys|procures|engages|outsources)\b/i.test(s.slice(c.end)))) return null;

  const named = ms.filter((m) => !m.product || m.goods);
  const before = (m: Mention) => s.slice(Math.max(0, m.index - 220), m.index);
  // The filer buys from the target: its supplier, vendor or sole source; it relies on it, sources from it.
  for (const m of named) {
    const b = before(m);
    if (
      gapListy(b, /\b(?:suppliers?|vendors?)\b[^.;]{0,80}?\b(?:include|includes|including|such as|like|namely|notably|primarily|e\.g\.,?|are|is)\b([^.;]*)$/i) ||
      /\b(?:sole|single|limited)[- ](?:source|sourced|supplier|vendor)s?\b[^.;]{0,150}$/i.test(b) ||
      /\b(?:rely|relies|relying|depend|depends|depending|dependent|reliant)\b[^.;]{0,40}\bon\b[^.;]{0,120}$/i.test(b) ||
      gapListy(b, /\b(?:purchase[sd]?|purchasing|source[sd]?|sourcing|procure[sd]?|procuring|buy|buys|bought|obtain(?:ed|s)?|license[sd]?|lease[sd]?)\b[^.;]{0,100}\bfrom\s+([^.;]{0,50})$/i) ||
      gapListy(b, /\b(?:supplied|provided|produced) by\s+([^.;]{0,40})$/i) ||
      /\b(?:our|the)\s+use of\s+$/i.test(b) ||
      after(s, m, /^(?:'s)?,?[^.;]{0,60}\bas (?:a|an|our|the|its) (?:\w+\s+){0,2}(?:supplier|vendor|source|provider)\b/i) ||
      after(s, m, /^(?:'s)?,?\s+(?:is|was|remains|has been) (?:our|a|the|an) (?:\w+\s+){0,3}(?:supplier|vendor|source)\b/i) ||
      after(s, m, /^(?:Corporation|Corp\.?|Inc\.?)?,\s+(?:a|an|our|the) (?:[\w-]+\s+){0,6}?(?:supplier|vendor|provider|manufacturer|foundry)\b/i)
    )
      return { role: 'customer' };
  }
  // The filer sells to the target: a customer, an end customer, "the Customer".
  for (const m of company) {
    const b = before(m);
    if (
      gapListy(b, /\bcustomers?\b[^.;]{0,60}?\b(?:include|includes|including|such as|like|namely|are|is|was|were)\b([^.;]*)$/i) ||
      gapListy(b, /\b(?:end|largest|major|key|significant|principal|anchor|top) customers?,?\s+([^.;]{0,20})$/i) ||
      /\b(?:sell|sells|sold|selling|supply|supplies|supplied|supplying|ship|ships|shipped|shipping|provide|provides|provided|providing|deliver|delivers|delivered|license|licenses|licensed)\b[^.;]{0,80}?(?<!similar|compared|relative|due|according|prior|related|subject|access|close|equal|comparable|addition|respect|reference|available|attributable|applicable|exposure)\s+to\s+(?:(?:our|the|its)\s+(?:\w+\s+){0,2}customers?,?\s+)?$/i.test(b) ||
      /\b(?:customer|offtake|supply|master supply|cloud services|services|sales|license) (?:agreements?|arrangements?|contracts?) with\s+(?:[^.;]{0,30})$/i.test(b) ||
      after(s, m, /^[^.;]{0,40}\((?:the|our) "?Customer"?\)/) ||
      after(s, m, /^(?:'s)?,?\s+(?:is|was|remains|has been|became) (?:our|a|the|an) (?:\w+\s+){0,3}customers?\b/i) ||
      after(s, m, /^(?:Corporation|Corp\.?|Inc\.?)?,\s+(?:our|a|the) (?:\w+\s+){0,3}customers?\b/i)
    )
      return { role: 'supplier' };
  }
  // Partnerships the filer is in: "our partnership with NVIDIA", "we collaborate with Apple".
  if (FILER.test(s)) {
    const partner = /\b(?:partner(?:s|ship|ships|ed|ing)?|collaborat\w*|alliances?|co-develop\w*|joint development|co-engineer\w*)\b/i;
    if (company.some((c) => partner.test(s.slice(Math.max(0, c.index - 120), c.index)) || partner.test(s.slice(c.end, c.end + 60)))) return { role: 'partner' };
  }
  return null;
}

// ------------------------------------------------------- companies in text

export interface Directory {
  /** Normalized name → company. */
  byName: Map<string, { name: string; ticker?: string; cik?: number; id?: string; yahoo?: string }>;
  byTicker: Map<string, SecCompany>;
}

/** The SEC's company list and the app's securities by normalized name, for finding companies in a sentence. */
/** A listed company's usual name when the SEC writes it in capitals ("NVIDIA CORP" is NVIDIA). */
export function knownName(ticker: string | undefined): string | undefined {
  if (!ticker) return undefined;
  for (const v of Object.values(KNOWN)) if (v.ticker === ticker) return v.name;
  return undefined;
}

export function buildDirectory(companies: SecCompany[], securities: SecurityDef[] = []): Directory {
  const byName: Directory['byName'] = new Map();
  const byTicker = new Map<string, SecCompany>();
  for (const c of companies) {
    if (!byTicker.has(c.ticker)) byTicker.set(c.ticker, c);
    const key = normalizeName(c.title);
    if (key && !byName.has(key)) byName.set(key, { name: knownName(c.ticker) ?? c.title, ticker: c.ticker, cik: c.cik });
  }
  for (const d of securities) {
    if (d.cls !== 'equity' || d.country === 'US') continue;
    const key = normalizeName(d.name);
    if (key && !byName.has(key)) byName.set(key, { name: d.name, id: d.id });
  }
  for (const [k, v] of Object.entries(KNOWN)) {
    const listed = v.ticker ? byTicker.get(v.ticker) : undefined;
    byName.set(k, listed ? { name: v.name, ticker: listed.ticker, cik: listed.cik } : { name: v.name, id: v.id, yahoo: v.yahoo, ticker: v.ticker });
  }
  return { byName, byTicker };
}

export interface Found {
  name: string;
  ticker?: string;
  cik?: number;
  id?: string;
  yahoo?: string;
  /** Where in the text it was named. */
  index: number;
}

const CANDIDATE = /(?<![A-Za-z0-9])(?:[A-Z][A-Za-z0-9'&.-]*|&)(?:\s+(?:[A-Z][A-Za-z0-9'&.-]*|&|of|de|du|la))*(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|SpA|GmbH)\.?)*/g;
const HAS_FORM = /(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|SpA|GmbH)\.?)$/;
const NOT_COMPANY = /^(?:The|Our|We|In|For|Such|These|This|Those|Including|Include|And|Or|As|At|By|On|To|Customer [A-Z]|Fiscal|Annual|Report|Form|Item|Part|Note|Notes|Data Center|United States|North America|Europe|Asia|China|Taiwan|Korea|Japan|Israel|India|Middle East)$/;

/**
 * The companies a passage names: those in the SEC's list or the app's securities, and others written with a legal
 * form ("Huawei Technologies Co. Ltd."). "Advanced Micro Devices, Inc., or AMD" counts once.
 */
export function findCompanies(text: string, dir: Directory): Found[] {
  const out: Found[] = [];
  const seen = new Set<string>();
  CANDIDATE.lastIndex = 0;
  for (let m = CANDIDATE.exec(text); m; m = CANDIDATE.exec(text)) {
    let raw = m[0].replace(/[.,]+$/, (x) => (/\b(?:Inc|Corp|Co|Ltd|N\.V|S\.A)$/.test(m![0].slice(0, -x.length)) ? x : '')).trim();
    // A leading word that only starts the sentence: "Our competitors" → skip; "During Cisco" never happens in lists.
    raw = raw.replace(/^(?:The|Our|Such as|Including|And|Or)\s+/, '');
    if (!raw || NOT_COMPANY.test(raw)) continue;
    // Try the whole phrase, then its leading words ("Arista Networks" in "Arista Networks Broadcom").
    const words = raw.split(/\s+/);
    let hit: Found | undefined;
    for (let n = words.length; n >= 1 && !hit; n--) {
      const phrase = words.slice(0, n).join(' ');
      const key = normalizeName(phrase);
      if (!key) continue;
      const single = !key.includes(' ');
      const entry = dir.byName.get(key);
      if (entry && (!single || !COMMON.has(key) || KNOWN[key] || HAS_FORM.test(phrase))) hit = { ...entry, index: m.index };
    }
    // Not listed: a name written with its legal form ("Huawei Technologies Co. Ltd.") is still a company.
    if (!hit && HAS_FORM.test(raw) && words.length >= 2 && !NOT_COMPANY.test(words[0])) hit = { name: raw.replace(HAS_FORM, '').replace(HAS_FORM, '').replace(/,$/, '').trim(), index: m.index };
    if (!hit) continue;
    const k = hit.cik ? `cik:${hit.cik}` : hit.yahoo ? `y:${hit.yahoo}` : `n:${normalizeName(hit.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(hit);
  }
  return out;
}

// ---------------------------------------------------------- the own report

const OWN_COMPETITOR = /^\[competitors\]|\b(?:competitors?\b[^.]{0,40}\b(?:include|includes|including|are|such as)|compete[sd]? (?:primarily |directly |principally )?(?:with|against)|competition (?:comes |primarily )?from|principal competitors?|primary competitors?|main competitors?|significant competition from)/i;
const OWN_SUPPLIER = /\b(?:foundr(?:y|ies)|suppliers?|subcontractors?|contract manufacturers?|manufacturing partners?|vendors?|sole[- ]source|single[- ]source|assembly and test)\b[^.]{0,120}?\b(?:such as|including|include|includes|namely|like|primarily|principally|:)/i;
const OWN_CUSTOMER = /\b(?:customers?\b[^.]{0,40}\b(?:include|includes|including|such as|are)|largest customers?|end customers?|direct customers?)\b/i;
const ANONYMOUS = /\b(?:Customer|Direct Customer|Indirect Customer) ([A-H])\b/g;

/**
 * Relations the company's own report states: customers with the share of its revenue (named, or "Customer A"),
 * suppliers it names ("foundries, such as TSMC and Samsung") and competitors ("our competitors include ...").
 */
export function ownRelations(sentences: string[], dir: Directory, self: { cik?: number; names: string[] }, ev: Omit<Evidence, 'sentence'>): Relation[] {
  const out: Relation[] = [];
  const selfPattern = targetPattern(self.names);
  const add = (f: Found | { name: string }, role: Role, sentence: string, extra: Partial<Relation> = {}) => {
    const found = f as Found;
    if (found.cik && self.cik && found.cik === self.cik) return;
    selfPattern.lastIndex = 0;
    if (!found.cik && selfPattern.test(found.name)) return;
    out.push({ key: relationKey(found), name: found.name, ticker: found.ticker, cik: found.cik, id: found.id, yahoo: found.yahoo, role, side: 'own', evidence: [{ ...ev, sentence: sentence.replace(/^\[competitors\]\s*/, 'Competitors: ') }], ...extra });
  };
  // Unnamed large customers with their shares, from the latest year the report gives ("sales to one direct customer
  // represented 22% of total revenue and sales to another direct customer represented 14%").
  const unnamed = sentences
    .map((raw) => ({ raw, year: Math.max(0, ...(raw.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number)), parts: unnamedShares(raw) }))
    .filter((x) => x.parts.length);
  const latest = Math.max(0, ...unnamed.map((x) => x.year));
  const seenUnnamed = new Set<string>();
  let n = 0;
  for (const x of unnamed.filter((u) => u.year === latest)) {
    const sig = x.parts.map((p) => `${p.kind}:${p.share}`).join(',');
    if (seenUnnamed.has(sig)) continue;
    seenUnnamed.add(sig);
    for (const p of x.parts) {
      for (let k = 0; k < p.count; k++) {
        n++;
        out.push({ key: `unnamed:${n}`, name: `Unnamed ${p.kind ? `${p.kind} ` : ''}customer ${n}`, role: 'customer', share: p.share, basis: 'target-revenue', side: 'own', evidence: [{ ...ev, sentence: x.raw }] });
      }
    }
  }
  for (const raw of sentences) {
    const s = raw.replace(/^\[competitors\]\s*/, '');
    // Customers with shares of revenue: named ones and the anonymous "Customer A".
    const runs = percentRuns(s).filter((run) => OF_REVENUE.test(s.slice(run[run.length - 1].end, run[run.length - 1].end + 140)));
    if (runs.length && VERB.test(s)) {
      const run = runs[0];
      const head = s.slice(0, run[0].index);
      const anon = [...head.matchAll(ANONYMOUS)].map((m) => m[0]);
      const named = findCompanies(stripForms(head), dir).filter((f) => !f.cik || f.cik !== self.cik);
      const parties: { name: string; f?: Found }[] = anon.length ? anon.map((a) => ({ name: a })) : named.map((f) => ({ name: f.name, f }));
      parties.forEach((p, i) => {
        const value = parties.length === run.length ? run[i].value : parties.length === 1 ? shareInRun(s, run, targetPattern([escapeLiteral(p.name)])) ?? run[0].value : undefined;
        add(p.f ?? { name: p.name }, 'customer', raw, { share: value, qualifier: qualifierOf(s, run), basis: 'target-revenue' });
      });
      if (parties.length) continue;
    }
    if (OWN_COMPETITOR.test(raw)) {
      const listStart = raw.startsWith('[competitors]') ? 0 : Math.max(0, s.search(/\b(?:include|includes|including|such as|with|against|from|are)\b/i));
      for (const f of findCompanies(s.slice(listStart), dir)) add(f, 'competitor', raw);
      continue;
    }
    if (OWN_SUPPLIER.test(s)) {
      const at = s.search(/\b(?:such as|including|include|includes|namely|like)\b/i);
      for (const f of findCompanies(at >= 0 ? s.slice(at) : s, dir)) add(f, 'supplier', raw);
      continue;
    }
    if (OWN_CUSTOMER.test(s)) {
      const at = s.search(/\b(?:include|includes|including|such as|are)\b/i);
      for (const f of findCompanies(at >= 0 ? s.slice(at) : s, dir)) add(f, 'customer', raw);
    }
  }
  return out;
}

const COUNT: Record<string, number> = { one: 1, another: 1, a: 1, 'a single': 1, single: 1, two: 2, three: 3, four: 4, five: 5 };

/** "sales to one direct customer represented 22% of total revenue", "two direct customers each represented 11%". */
export function unnamedShares(sentence: string): { count: number; kind: string; share: number }[] {
  const out: { count: number; kind: string; share: number }[] = [];
  const re = /\b(one|another|a single|two|three|four|five)\s+(?:(direct|indirect|end|individual|major|significant|large)\s+)?customers?\b(\s+each)?[^.;%]{0,40}?\b(?:represented|accounted for|comprised|contributed)\s+(?:approximately\s+|about\s+)?(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent)\s+of\s+(?:our\s+|the Company's\s+|its\s+)?(?:total\s+|net\s+|consolidated\s+)*(?:revenue|revenues|net sales|sales)\b/gi;
  for (const m of sentence.matchAll(re)) {
    const count = COUNT[m[1].toLowerCase()] ?? 1;
    if (count > 1 && !m[3]) continue; // "two customers represented 30%" together: no share each
    out.push({ count, kind: (m[2] ?? '').toLowerCase(), share: Number(m[4]) });
  }
  return out;
}

function escapeLiteral(name: string): string {
  return name.replace(/[^A-Za-z0-9 .&'-]/g, '');
}

export function relationKey(f: { cik?: number; ticker?: string; yahoo?: string; name: string }): string {
  return f.cik ? `cik:${f.cik}` : f.ticker ? `t:${f.ticker}` : f.yahoo ? `y:${f.yahoo}` : `n:${normalizeName(f.name)}`;
}

/** The latest year a statement speaks of ("During fiscal year 2026, ..."), 0 when none. */
export function statementYear(sentence: string, now = Date.now()): number {
  const cap = new Date(now).getUTCFullYear() + 1;
  return Math.max(0, ...(sentence.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number).filter((y) => y <= cap));
}

/**
 * Relations merged by company and role: the evidence joined, the share from the latest filing that gives one (and
 * within a filing, from the latest year it speaks of); the statement behind the share comes first.
 */
export function mergeRelations(list: Relation[]): Relation[] {
  const by = new Map<string, Relation>();
  const shareFrom = new Map<string, { date: string; year: number }>();
  for (const r of list) {
    const k = `${r.key}|${r.role}`;
    const have = by.get(k);
    const ev = r.evidence[0];
    const at = { date: ev?.date ?? '', year: statementYear(ev?.sentence ?? '') };
    if (!have) {
      by.set(k, { ...r, evidence: [...r.evidence] });
      if (r.share != null) shareFrom.set(k, at);
      continue;
    }
    for (const e of r.evidence) if (!have.evidence.some((x) => x.sentence === e.sentence)) have.evidence.push(e);
    const prev = shareFrom.get(k);
    const later = !prev || at.date > prev.date || (at.date === prev.date && at.year > prev.year);
    // A share stated by the target itself wins, then the latest; a share beats none.
    if (r.share != null && (have.share == null || (r.basis === 'target-revenue' && have.basis !== 'target-revenue') || (later && (r.basis === have.basis || have.basis !== 'target-revenue')))) {
      have.share = r.share;
      have.qualifier = r.qualifier;
      have.basis = r.basis;
      shareFrom.set(k, at);
      if (ev) have.evidence = [ev, ...have.evidence.filter((x) => x !== ev && x.sentence !== ev.sentence)];
    }
    if (r.side !== have.side) have.side = 'both';
    have.ticker ??= r.ticker;
    have.id ??= r.id;
    have.yahoo ??= r.yahoo;
  }
  return [...by.values()];
}

// ----------------------------------------------------------- the search

export interface FtsHit {
  cik: number;
  name: string;
  tickers: string[];
  form: string;
  date: string;
  path: string;
  score: number;
}

/** The SEC full-text search's answer: each filing's filer, form, date and primary document. */
export function parseFts(text: string): FtsHit[] | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const hits: any[] | undefined = j?.hits?.hits;
  if (!Array.isArray(hits)) return null;
  const out: FtsHit[] = [];
  for (const h of hits) {
    const src = h?._source;
    const [adsh, file] = String(h?._id ?? '').split(':');
    const cik = Number(src?.ciks?.[0]);
    if (!Number.isFinite(cik) || cik <= 0 || !/^\d{10}-\d{2}-\d{6}$/.test(adsh) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.html?$/i.test(file ?? '')) continue;
    const display = String(src?.display_names?.[0] ?? '');
    const tickers = (/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/.exec(display)?.[1] ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    out.push({ cik, name: display.replace(/\s+\([^)]*\)\s*\(CIK.*$/, '').replace(/\s+\(CIK.*$/, '').trim(), tickers, form: String(src?.form ?? src?.file_type ?? ''), date: String(src?.file_date ?? ''), path: `${cik}/${adsh.replace(/-/g, '')}/${file}`, score: Number(h?._score) || 0 });
  }
  return out;
}

export interface Filer extends FtsHit {
  /** How many of the searches found it. */
  terms: number;
  state: 'waiting' | 'reading' | 'read' | 'failed';
  found?: number;
}

/** One filing per company (its latest), most often found and best scored first. */
export function rankFilers(results: FtsHit[][], selfCik: number | undefined, max: number): Filer[] {
  const by = new Map<number, Filer & { seen: Set<number> }>();
  results.forEach((hits, qi) => {
    for (const h of hits) {
      if (h.cik === selfCik) continue;
      const have = by.get(h.cik);
      if (!have) by.set(h.cik, { ...h, terms: 0, state: 'waiting', seen: new Set([qi]) });
      else {
        have.seen.add(qi);
        if (h.date > have.date) Object.assign(have, { form: h.form, date: h.date, path: h.path });
        have.score = Math.max(have.score, h.score);
      }
    }
  });
  return [...by.values()]
    .map(({ seen, ...f }) => ({ ...f, terms: seen.size }))
    .sort((a, b) => b.terms - a.terms || b.score - a.score)
    .slice(0, max);
}

// -------------------------------------------------------------- the store

export interface Chain {
  state: 'loading' | 'ok' | 'error';
  message?: string;
  /** The target as the SEC lists it, and its name in the app. */
  company?: { name: string; display?: string; cik?: number; ticker?: string };
  names?: TargetNames;
  own?: { form: string; date: string; path: string; state: Filer['state'] };
  filers: Filer[];
  relations: Relation[];
  /** Day's change in percent, by relation key. */
  changes: Record<string, number>;
  at?: number;
}

export const supplyChains = createStore<{ v: number; chains: Record<string, Chain> }>({ v: 0, chains: {} });

const MAX_FILINGS = 45;
const running = new Set<string>();

function setChain(key: string, f: (c: Chain) => Chain) {
  supplyChains.set((s) => ({ v: s.v + 1, chains: { ...s.chains, [key]: f(s.chains[key] ?? { state: 'loading', filers: [], relations: [], changes: {} }) } }));
}

export function supplyChainAvailable(): boolean {
  return secAvailable() && typeof window !== 'undefined' && typeof window.arminDesktop?.secText === 'function';
}

async function fts(term: string, name: string): Promise<FtsHit[]> {
  const res = await window.arminDesktop!.sec!('fts', `${term}|${name}`);
  if (!res.text) {
    if ((res as any).missing) throw new Error('missing-agent');
    return [];
  }
  return parseFts(res.text) ?? [];
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await f(items[i++]);
  }));
}

/** Finds and reads the reports for a company, updating the store as each filing is read. */
async function build(key: string, def: SecurityDef) {
  if (running.has(key)) return;
  running.add(key);
  try {
    setChain(key, () => ({ state: 'loading', filers: [], relations: [], changes: {} }));
    const list = await loadSecCompanies();
    if (!list.ok && list.reason === 'needs-agent') throw new Error('missing-agent');
    const companies = list.ok ? list.data : [];
    const ticker = secTicker(def);
    const company = ticker ? findByTicker(companies, ticker) : undefined;
    const names = targetNames(company?.ticker ?? ticker ?? undefined, company?.title ?? def.name);
    const dir = buildDirectory(companies, engine.securities);
    setChain(key, (c) => ({ ...c, company: { name: company?.title ?? def.name, display: def.name, cik: company?.cik, ticker: company?.ticker }, names }));

    // The company's own latest annual report.
    let own: Chain['own'];
    if (company) {
      const filer = await loadFiler(company.cik);
      if (filer.ok) {
        const annual = filer.data.filings.find((f) => /^(10-K|20-F|40-F)$/.test(f.form) && !!f.doc && /\.html?$/i.test(f.doc));
        if (annual) {
          const doc = filingLinks(company.cik, annual).doc ?? '';
          const m = /edgar\/data\/(\d+)\/(\d{18})\/([^/?#]+)$/.exec(doc);
          if (m) own = { form: annual.form, date: annual.filed, path: `${m[1]}/${m[2]}/${m[3]}`, state: 'waiting' };
        }
      }
    }
    setChain(key, (c) => ({ ...c, own }));

    // The searches: each legal name with each term; then the short names for the sole-source statements.
    const searches: [string, string][] = [];
    for (const legal of names.legal.slice(0, 2)) for (const term of ['accounted for', 'revenues', 'suppliers', 'supplier', 'customer']) searches.push([term, legal]);
    for (const n of names.names.slice(0, 1)) if (!names.legal.includes(n)) searches.push(['sole source', n]);
    const results: FtsHit[][] = [];
    for (const [term, name] of searches) results.push(await fts(term, name).catch((e) => (e?.message === 'missing-agent' ? Promise.reject(e) : [])));
    const filers = rankFilers(results, company?.cik, MAX_FILINGS);
    setChain(key, (c) => ({ ...c, filers }));

    const pattern = targetPattern(names.names.concat(names.legal.map((l) => l.replace(SUFFIX, '').trim())));
    const relations: Relation[] = [];
    const publish = () => setChain(key, (c) => ({ ...c, relations: mergeRelations(relations), at: Date.now() }));

    if (own) {
      const res = await window.arminDesktop!.secText!('own', own.path).catch(() => null);
      const ok = !!res && res.status === 200;
      if (ok) relations.push(...ownRelations(res!.sentences, dir, { cik: company?.cik, names: names.names }, { filer: company?.title ?? def.name, form: own.form, date: own.date, path: own.path }));
      setChain(key, (c) => ({ ...c, own: c.own ? { ...c.own, state: ok ? 'read' : 'failed' } : c.own }));
      publish();
    }

    const sentenceNames = [...new Set([...names.names, ...names.legal.map((l) => l.replace(SUFFIX, '').trim())])].slice(0, 8);
    await pool(filers, 3, async (f) => {
      setChain(key, (c) => ({ ...c, filers: c.filers.map((x) => (x.cik === f.cik ? { ...x, state: 'reading' } : x)) }));
      const res = await window.arminDesktop!.secText!('mentions', f.path, sentenceNames).catch(() => null);
      let found = 0;
      if (res && res.status === 200) {
        const listed = dir.byTicker.get(f.tickers[0] ?? '');
        for (const sentence of res.sentences) {
          const c = classify(sentence, pattern);
          if (!c) continue;
          found++;
          relations.push({
            key: `cik:${f.cik}`,
            name: knownName(f.tickers[0]) ?? listed?.title ?? f.name,
            ticker: f.tickers[0],
            cik: f.cik,
            role: c.role,
            share: c.share,
            qualifier: c.qualifier,
            basis: c.basis,
            side: 'theirs',
            evidence: [{ sentence, filer: f.name, form: f.form, date: f.date, path: f.path }],
          });
        }
      }
      setChain(key, (c) => ({ ...c, filers: c.filers.map((x) => (x.cik === f.cik ? { ...x, state: res && res.status === 200 ? 'read' : 'failed', found } : x)) }));
      publish();
    });
    setChain(key, (c) => ({ ...c, state: 'ok', at: Date.now() }));
    void refreshChanges(key);
  } catch (e) {
    const missing = (e as Error)?.message === 'missing-agent';
    setChain(key, (c) => ({ ...c, state: 'error', message: missing ? 'SPLC reads SEC filings, which need SEC_USER_AGENT (your name and email) in PROVIDERS.' : 'The SEC filings could not be read.' }));
  } finally {
    running.delete(key);
  }
}

/** Yahoo's symbol for a related company: its US ticker, or the listing the app knows for it. */
export function yahooSymbol(r: Pick<Relation, 'ticker' | 'yahoo' | 'id'>): string | undefined {
  if (r.yahoo) return r.yahoo;
  if (r.ticker) return r.ticker.replace(/\./g, '-');
  const d = r.id ? engine.get(r.id) : undefined;
  return d?.yahoo ?? undefined;
}

/** The day's change for every related company, 20 symbols a request. */
async function refreshChanges(key: string) {
  const chain = supplyChains.get().chains[key];
  if (!chain) return;
  const bySymbol = new Map<string, string[]>();
  for (const r of chain.relations) {
    const y = yahooSymbol(r);
    if (y) bySymbol.set(y, [...(bySymbol.get(y) ?? []), r.key]);
  }
  const symbols = [...bySymbol.keys()];
  const changes: Record<string, number> = {};
  for (let i = 0; i < symbols.length; i += 20) {
    const batch = symbols.slice(i, i + 20);
    try {
      const got = parseSpark(await yahooGet(`/v8/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=1d&interval=1d`));
      for (const [sym, q] of Object.entries(got)) for (const k of bySymbol.get(sym) ?? []) changes[k] = (q.last / q.prevClose - 1) * 100;
    } catch {
      /* no colour for these */
    }
  }
  setChain(key, (c) => ({ ...c, changes: { ...c.changes, ...changes } }));
}

const built = new Map<string, number>();

/** A company's supply chain: built once per session (the main process keeps the sentences a month). */
export function useSupplyChain(def: SecurityDef | undefined): Chain | undefined {
  supplyChains.use((s) => s.v);
  const key = def?.id ?? '';
  useEffect(() => {
    if (!def || !supplyChainAvailable()) return;
    const last = built.get(key) ?? 0;
    if (Date.now() - last < 12 * 3600_000 && supplyChains.get().chains[key]?.state !== 'error') {
      void refreshChanges(key);
      return;
    }
    built.set(key, Date.now());
    void build(key, def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? supplyChains.get().chains[key] : undefined;
}

/** Starts again from the search (the filings already read come back from the main process's store). */
export function rebuildSupplyChain(def: SecurityDef) {
  built.set(def.id, Date.now());
  void build(def.id, def);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
