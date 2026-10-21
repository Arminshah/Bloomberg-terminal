import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { engine } from '../market';
import type { SecurityDef } from '../types';
import { yahooGet } from './yahoo';
import { parseSpark } from './index-members';
import { findByTicker, loadFiler, loadSecCompanies, secAvailable, secTicker, type SecCompany } from './sec';

/**
 * SPLC: a company's suppliers, customers and competitors as annual reports state them. Companies name their large
 * customers with the share of revenue each brought (Fabrinet: "NVIDIA Corporation ... contributed 16.3% of our
 * revenues"), their key suppliers (CoreWeave relies on NVIDIA GPUs) and their competitors. The SEC's full-text
 * search finds the reports of the last 18 months that name the company; the desktop app reads the sentences that
 * name it and classifies them here. The company's own report adds the suppliers, customers and competitors it
 * names itself. Every relation keeps the sentence and filing it comes from.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What the related company is to the target: its supplier, customer, competitor or partner; a company it invested in
 * ('investment'); a company invested in it ('investor'); a bank or fund that lends to it ('lender').
 */
export type Role = 'supplier' | 'customer' | 'competitor' | 'partner' | 'investment' | 'investor' | 'lender';

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
  /** The document within the filing when it is not the main one: "EX-99.1" (a press release), "EX-10.1". */
  type?: string;
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
  /** A counterparty the filings describe without naming it ("a U.S. based investment-grade hyperscaler"). */
  unnamed?: boolean;
  evidence: Evidence[];
}

// ------------------------------------------------------------------ names

const SUFFIX = /(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Cos|Ltd|Limited|LLC|L\.L\.C|plc|N\.V|NV|S\.A|SA|AG|SE|SpA|S\.p\.A|GmbH|LP|L\.P|Holdings?|Group|Hldgs|Bhd|Pty)\.?)+$/i;
const STATE_TAG = /\s*\/[A-Za-z]{2,3}\/?\s*$/;

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
  macquarie: { name: 'Macquarie Group', yahoo: 'MQG.AX' },
  'macquarie group': { name: 'Macquarie Group', yahoo: 'MQG.AX' },
  'macquarie asset management': { name: 'Macquarie Group', yahoo: 'MQG.AX' },
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
  KO: { legal: ['The Coca-Cola Company'], names: ['Coca-Cola'] },
  PEP: { legal: ['PepsiCo, Inc'], names: ['PepsiCo'] },
  PG: { legal: ['The Procter & Gamble Company'], names: ['Procter & Gamble', 'P&G'] },
  JNJ: { legal: ['Johnson & Johnson'], names: ['Johnson & Johnson'] },
  HD: { legal: ['The Home Depot'], names: ['Home Depot'] },
  LOW: { legal: ["Lowe's Companies"], names: ["Lowe's"] },
  MCD: { legal: ["McDonald's Corporation"], names: ["McDonald's"] },
  DIS: { legal: ['The Walt Disney Company'], names: ['Walt Disney', 'Disney'] },
  NKE: { legal: ['NIKE, Inc'], names: ['Nike'] },
  CAT: { legal: ['Caterpillar Inc'], names: ['Caterpillar'] },
  DE: { legal: ['Deere & Company'], names: ['John Deere', 'Deere'] },
  GE: { legal: ['General Electric Company', 'GE Aerospace'], names: ['GE Aerospace', 'General Electric'] },
  GEV: { legal: ['GE Vernova Inc'], names: ['GE Vernova'] },
  XOM: { legal: ['Exxon Mobil Corporation'], names: ['ExxonMobil', 'Exxon Mobil', 'Exxon'] },
  CVX: { legal: ['Chevron Corporation'], names: ['Chevron'] },
  LLY: { legal: ['Eli Lilly and Company'], names: ['Eli Lilly', 'Lilly'] },
  PFE: { legal: ['Pfizer Inc'], names: ['Pfizer'] },
  MRK: { legal: ['Merck & Co'], names: ['Merck'] },
  UNH: { legal: ['UnitedHealth Group'], names: ['UnitedHealth'] },
  JPM: { legal: ['JPMorgan Chase & Co'], names: ['JPMorgan Chase', 'JPMorgan', 'J.P. Morgan'] },
  V: { legal: ['Visa Inc'], names: ['Visa Inc'] },
  MA: { legal: ['Mastercard Incorporated'], names: ['Mastercard'] },
  NFLX: { legal: ['Netflix, Inc'], names: ['Netflix'] },
  CRM: { legal: ['Salesforce, Inc'], names: ['Salesforce'] },
  ADBE: { legal: ['Adobe Inc'], names: ['Adobe'] },
  PLTR: { legal: ['Palantir Technologies'], names: ['Palantir'] },
  TXN: { legal: ['Texas Instruments'], names: ['Texas Instruments'] },
  AMAT: { legal: ['Applied Materials'], names: ['Applied Materials'] },
  LRCX: { legal: ['Lam Research'], names: ['Lam Research'] },
  KLAC: { legal: ['KLA Corporation'], names: ['KLA Corporation', 'KLA'] },
  ASML: { legal: ['ASML Holding'], names: ['ASML'] },
  ANET: { legal: ['Arista Networks'], names: ['Arista Networks', 'Arista'] },
  VRT: { legal: ['Vertiv Holdings'], names: ['Vertiv'] },
  ETN: { legal: ['Eaton Corporation'], names: ['Eaton'] },
  LMT: { legal: ['Lockheed Martin'], names: ['Lockheed Martin', 'Lockheed'] },
  RTX: { legal: ['RTX Corporation'], names: ['RTX', 'Raytheon', 'Pratt & Whitney'] },
  NOC: { legal: ['Northrop Grumman'], names: ['Northrop Grumman', 'Northrop'] },
  GD: { legal: ['General Dynamics'], names: ['General Dynamics'] },
  UPS: { legal: ['United Parcel Service'], names: ['United Parcel Service', 'UPS'] },
  FDX: { legal: ['FedEx Corporation'], names: ['FedEx'] },
  HON: { legal: ['Honeywell International'], names: ['Honeywell'] },
  MMM: { legal: ['3M Company'], names: ['3M'] },
  T: { legal: ['AT&T Inc'], names: ['AT&T'] },
  VZ: { legal: ['Verizon Communications'], names: ['Verizon'] },
  TMUS: { legal: ['T-Mobile US'], names: ['T-Mobile'] },
  CMCSA: { legal: ['Comcast Corporation'], names: ['Comcast'] },
  SBUX: { legal: ['Starbucks Corporation'], names: ['Starbucks'] },
  KR: { legal: ['The Kroger Co'], names: ['Kroger'] },
  CVS: { legal: ['CVS Health'], names: ['CVS Health', 'CVS'] },
  MDLZ: { legal: ['Mondelez International'], names: ['Mondelez'] },
  SNOW: { legal: ['Snowflake Inc'], names: ['Snowflake'] },
  NOW: { legal: ['ServiceNow, Inc'], names: ['ServiceNow'] },
  UBER: { legal: ['Uber Technologies'], names: ['Uber'] },
  ABNB: { legal: ['Airbnb, Inc'], names: ['Airbnb'] },
  SHOP: { legal: ['Shopify Inc'], names: ['Shopify'] },
  NBIS: { legal: ['Nebius Group N.V.'], names: ['Nebius'] },
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
  if (alias) return { legal: alias.legal, names: [...new Set([...alias.names, ...alias.legal.map((l) => l.replace(SUFFIX, '').replace(/^The\s+/, '').trim())])] };
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
  // A space or a hyphen between words: "Coca Cola" is also "Coca-Cola".
  const spaced = (p: string) => p.replace(/(?:\\-| )/g, '[ -]');
  const alts = names.flatMap((n) => (/[a-z]/.test(n) ? [spaced(escapeRe(n)), spaced(escapeRe(n.toUpperCase()))] : [spaced(n.split('').map((c) => (/[A-Za-z]/.test(c) ? `[${c.toUpperCase()}${c.toLowerCase()}]` : escapeRe(c))).join(''))]));
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
const FILER = /\b(?:[Ww]e|us|[Oo]urs?|[Tt]he Company(?:'s)?|[Tt]he Group(?:'s)?|[Tt]he Registrant)\b/;
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
 * the filer's revenue), buys from it or resells its products, competes with it, partners with it, lends to it, holds
 * a stake in it or took its investment; null when it says none of these. `pattern` matches the target's names;
 * `filer`, the filer's own names, for press releases that speak of it in the third person.
 */
export function classify(sentence: string, pattern: RegExp, filer?: RegExp): Classified | null {
  const s = sentence.replace(/^\[competitors\]\s*/, '');
  const ms = mentions(s, pattern);
  const company = ms.filter((m) => !m.product);
  if (!ms.length || BIOGRAPHY.test(s)) return null;
  const byFiler = (text: string) => {
    if (FILER.test(text)) return true;
    if (!filer) return false;
    filer.lastIndex = 0;
    return filer.test(text);
  };
  const before = (m: Mention) => s.slice(Math.max(0, m.index - 220), m.index);
  // Tables and slides run together: a "sentence" that is mostly figures says nothing of a relation.
  const words = s.split(/\s+/);
  if (words.length > 12 && words.filter((w) => /\d/.test(w)).length / words.length > 0.3) return null;

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

  // The filer holds a stake in the target ("our investment in Applied Digital"), or lends to it ("we provided a
  // $50 million term loan to Applied Digital").
  if (company.some((c) => /\b(?:we|our|its|the Company's|the Fund's)\b[^.;]{0,60}\b(?:investments?|invested|stake|equity interest|ownership interest)\s+(?:of\s+[^.;]{0,30}\s+)?in\s+(?:the\s+)?$/i.test(before(c)))) return { role: 'investor' };
  // "the carrying value of our Applied Digital Corporation ("APLD") common stock": the filer holds the target's shares.
  if (company.some((c) => /\b(?:[Oo]ur|[Ii]ts|[Tt]he Company's|[Tt]he Fund's)\s+(?:holdings? (?:of|in)\s+|shares (?:of|in)\s+|position in\s+)?$/.test(before(c)) && /^(?:'s)?(?:,?\s+(?:Inc|Corp|Corporation|Co)\.?)?\s*(?:\("?[A-Z]{1,5}"?\)\s*)?(?:class [A-C]\s+)?(?:common stock|common shares|shares|stock|warrants|preferred)\b/i.test(s.slice(c.end)))) return { role: 'investor' };
  if (company.some((c) => /\b(?:loans?|term loan|credit facilit(?:y|ies)|bridge facility|notes|debt financing|financing)\b[^.;]{0,60}\b(?:to|for)\s+$/i.test(before(c)) && /\b(?:provided|extended|made|funded|lent|committed|originated)\b/i.test(before(c)) && byFiler(s))) return { role: 'lender' };

  // A stake taken in the filer: "NVIDIA invested $2 billion in the Company's common stock". Share deals that do not
  // name the filer ("shares were delivered to NVIDIA") are no supply relation either.
  if (!/\b(?:revenue|revenues|net sales)\b/i.test(s) && (s.match(/\([A-Z]{2,5}\)/g)?.length ?? 0) < 3 && company.some((c) => INVEST_AFTER.test(s.slice(c.end)) || INVEST_BEFORE.test(s.slice(Math.max(0, c.index - 200), c.index)))) {
    return byFiler(s) ? { role: 'investment' } : null;
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

  // A joint venture or jointly owned company with the target is a partnership, whatever it will build.
  if (company.length && /\b(?:joint venture|jointly owned|JV)\b/i.test(s) && byFiler(s)) return { role: 'partner' };

  // The target buying from its own suppliers ("NVIDIA relies on suppliers such as TSMC") says nothing of the filer.
  if (company.some((c) => /^(?:'s)?\s+(?:\w+\s+){0,2}?(?:relies|depends|uses|utilizes|sources|purchases|buys|procures|engages|outsources)\b/i.test(s.slice(c.end)))) return null;

  const named = ms.filter((m) => !m.product || m.goods);
  // The filer buys from the target: its supplier, vendor or sole source; it relies on it, sources from it.
  for (const m of named) {
    const b = before(m);
    // "collaboration with data center infrastructure suppliers such as NVIDIA": a partnership, not a purchase.
    if (/\b(?:collaborat\w*|partner(?:s|ship|ships|ed|ing)?|alliances?)\b[^.;]{0,80}\b(?:suppliers?|vendors?|providers?)\b[^.;]{0,60}\b(?:such as|including|like)\b[^.;]{0,80}$/i.test(b) && byFiler(s)) return { role: 'partner' };
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
      // "An electric service agreement to serve an additional 350 MW data center load with Applied Digital".
      /\b(?:agreements?|contracts?|arrangements?)\s+to\s+(?:serve|supply|provide|deliver|power)\b[^.;]{0,100}?\bwith\s+(?:[^.;]{0,30})$/i.test(b) ||
      // "began to provide power for Applied Digital's data center", "we manufacture servers for NVIDIA".
      /\b(?:provide|provides|provided|providing|supply|supplies|supplied|supplying|deliver|delivers|delivered|delivering|build|builds|built|building|construct|constructs|constructed|constructing|install|installs|installed|installing|manufacture|manufactures|manufactured|manufacturing|assemble|assembles|assembled|fabricate|fabricates|fabricated|serve|serves|served|serving)\b[^.;]{0,80}?\bfor\s+(?:(?:our|the|its)\s+(?:\w+\s+){0,2}customers?,?\s+)?$/i.test(b) ||
      // A contract to build or supply something for the target: "we entered into a limited notice to proceed with
      // Applied Digital for a project to design and install four power plants".
      (/\b(?:entered into|signed|executed|awarded|received|won|was awarded)\b[^.;]{0,100}?\b(?:agreements?|contracts?|orders?|purchase orders?|notice to proceed|LNTP|awards?|engagement)\b[^.;]{0,60}?\bwith\s+(?:[^.;]{0,30})$/i.test(b) &&
        after(s, m, /^(?:'s)?,?[^.;]{0,40}?\b(?:for (?:a|the) (?:project|contract) to|to)\s+(?:design|build|install|construct|supply|deliver|provide|manufacture|engineer|develop|fabricate)\b/i)) ||
      after(s, m, /^[^.;]{0,40}\((?:the|our) "?Customer"?\)/) ||
      after(s, m, /^(?:'s)?,?\s+(?:is|was|remains|has been|became) (?:our|a|the|an) (?:\w+\s+){0,3}customers?\b/i) ||
      after(s, m, /^(?:Corporation|Corp\.?|Inc\.?)?,\s+(?:our|a|the) (?:\w+\s+){0,3}customers?\b/i)
    )
      return { role: 'supplier' };
  }
  // Partnerships the filer is in: "our partnership with NVIDIA", "we collaborate with Apple".
  if (byFiler(s)) {
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
    if (key && !byName.has(key)) byName.set(key, { name: knownName(c.ticker) ?? c.title.replace(STATE_TAG, ''), ticker: c.ticker, cik: c.cik });
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

const CANDIDATE = /(?<![A-Za-z0-9])(?:[A-Z][A-Za-z0-9'&.-]*|&)(?:\s+(?:[A-Z][A-Za-z0-9'&.-]*|\d{1,3}(?![\d.,%])|&|of|de|du|la))*(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|SpA|GmbH)(?![A-Za-z])\.?)*/g;
/** A name written like a brand: inner capitals or all capitals ("CoreWeave", "NVIDIA", "eBay"). */
const BRAND = /^(?:[A-Z]{3,}|[A-Za-z][a-z]+[A-Z][A-Za-z]*|[a-z][A-Z]\w+)$/;
const HAS_FORM = /(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|SpA|GmbH)\.?)$/;
const NOT_COMPANY = /^(?:The|Our|We|In|For|Such|These|This|Those|Including|Include|And|Or|As|At|By|On|To|Customer [A-Z]|Fiscal|Annual|Report|Form|Item|Part|Note|Notes|Data Center|United States|North America|Europe|Asia|China|Taiwan|Korea|Japan|Israel|India|Middle East)$/;

/** A bank, fund or asset manager written without a legal form: "First National Bank of Omaha", "Macquarie Asset Management". */
const FINANCIAL_NAME = /\b(?:Bank|Bancorp|Banc|Capital|Partners|Asset Management|Investment Management|Securities|Financial|Credit|Funding|Lending|Trust)(?:\s+of\s+[A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)?)?$/;

/**
 * The companies a passage names: those in the SEC's list or the app's securities, and others written with a legal
 * form ("Huawei Technologies Co. Ltd."). "Advanced Micro Devices, Inc., or AMD" counts once. `loose` also takes a
 * bank's or fund's name without a legal form, for the party right after "with" in a loan or partnership.
 */
export function findCompanies(text: string, dir: Directory, loose = false, whole = false): Found[] {
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
    for (let n = words.length; n >= (whole ? words.length : 1) && !hit; n--) {
      const phrase = words.slice(0, n).join(' ');
      const key = normalizeName(phrase);
      if (!key) continue;
      const single = !key.includes(' ');
      const entry = dir.byName.get(key);
      // A first word alone stands for a company only when it is a well-known one or written like a brand ("NVIDIA
      // Blackwell", "CoreWeave Compute"); "Polaris Forge 1" is not Polaris Inc.
      const prefixOk = n === words.length || !single || KNOWN[key] || BRAND.test(words[0]);
      if (entry && prefixOk && (!single || !COMMON.has(key) || KNOWN[key] || HAS_FORM.test(phrase))) hit = { ...entry, index: m.index };
    }
    // Not listed: a name written with its legal form ("Huawei Technologies Co. Ltd.") is still a company.
    if (!hit && words.length >= 3 && (BRAND.test(words[0]) || KNOWN[normalizeName(words[0])]) && /\b(?:Inc|Corp|Corporation|Co|Company|Ltd|Limited|LLC|L\.?P|plc|B\.?V|GmbH)\b/.test(raw)) {
      const parent = dir.byName.get(normalizeName(words[0]));
      if (parent) hit = { ...parent, index: m.index };
    }
    if (!hit && HAS_FORM.test(raw) && words.length >= 2 && !NOT_COMPANY.test(words[0])) hit = { name: raw.replace(HAS_FORM, '').replace(HAS_FORM, '').replace(/,$/, '').trim(), index: m.index };
    if (!hit && loose && words.length >= 2 && words.length <= 7 && !NOT_COMPANY.test(words[0]) && FINANCIAL_NAME.test(raw.replace(/,?\s+N\.A\.?$/, ''))) {
      const group = KNOWN[normalizeName(words[0])] ? dir.byName.get(normalizeName(words[0])) : undefined;
      hit = group ? { ...group, index: m.index } : { name: raw.replace(/,$/, '').trim(), index: m.index };
    }
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
      // "the DRIVE ecosystem is expanding to include tier 1 suppliers, automotive integrators and sensor partners
      // including Bosch, Sony and ZF": partners building on its products, not its suppliers.
      const role: Role = /\becosystem\b|\bpartners?\b[^.;]{0,40}\b(?:including|include|includes|such as)\b|\btier[- ](?:1|one|2|two)\b|\bcollaborat\w*/i.test(s) ? 'partner' : 'supplier';
      for (const f of findCompanies(at >= 0 ? s.slice(at) : s, dir)) add(f, role, raw);
      continue;
    }
    if (OWN_CUSTOMER.test(s)) {
      const at = s.search(/\b(?:include|includes|including|such as|are)\b/i);
      for (const f of findCompanies(at >= 0 ? s.slice(at) : s, dir)) add(f, 'customer', raw);
      continue;
    }
    // Agreements and dealings: leases, supply and purchase agreements, orders, partnerships, investments and loans.
    for (const st of ownStatements(s, dir, selfPattern)) {
      if ('unnamed' in st.party) out.push({ key: st.party.key, name: st.party.name, role: st.role, side: 'own', unnamed: true, evidence: [{ ...ev, sentence: raw }] });
      else add(st.party, st.role, raw);
    }
  }
  return out;
}

const COUNT: Record<string, number> = { one: 1, another: 1, a: 1, 'a single': 1, single: 1, two: 2, three: 3, four: 4, five: 5 };

/** "sales to one direct customer represented 22% of total revenue", "two direct customers each represented 11%". */
export function unnamedShares(sentence: string): { count: number; kind: string; share: number }[] {
  const out: { count: number; kind: string; share: number }[] = [];
  const re = /\b(one|another|a single|two|three|four|five)\s+(?:(direct|indirect|end|individual|major|significant|large)\s+)?customers?\b(\s+each)?[^.;%]{0,40}?\b(?:represented|representing|accounted for|accounting for|comprised|comprising|contributed|contributing)\s+(?:approximately\s+|about\s+)?(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent)\s+of\s+(?:our\s+|the Company's\s+|its\s+)?(?:total\s+|net\s+|consolidated\s+)*(?:revenue|revenues|net sales|sales)\b/gi;
  for (const m of sentence.matchAll(re)) {
    const count = COUNT[m[1].toLowerCase()] ?? 1;
    if (count > 1 && !m[3]) continue; // "two customers represented 30%" together: no share each
    out.push({ count, kind: (m[2] ?? '').toLowerCase(), share: Number(m[4]) });
  }
  return out;
}

// ------------------------------------------------- agreements in its own filings

/** A counterparty described without its name (electron/supply-chain.cjs UNNAMED_PARTY). */
const UNNAMED_PARTY = /^(?:a|an|the same|another|one|its)\s+((?:[\w.,-]+\s+){0,6}?)(hyperscalers?|customers?|tenants?|OEMs?|automakers?|carriers?|utilit(?:y|ies)|retailers?|operators?|cloud (?:service )?providers?|(?:technology|semiconductor|software|automotive|energy|telecommunications|pharmaceutical) compan(?:y|ies))\b/i;
const QUALIFIER_FILLER = /^(?:new|second|third|fourth|fifth|additional|existing|leading|major|large|largest|single|same|high|certain|prospective|potential|based|global|well-known|key|significant|top)$/i;

/**
 * "a new U.S. based high investment-grade hyperscaler" → { key: 'unnamed:investment grade hyperscaler', label:
 * 'Unnamed U.S. investment-grade hyperscaler' }; null for a bare "a customer", which says nothing of who it is.
 */
export function unnamedParty(text: string): { key: string; label: string; end: number } | null {
  const m = UNNAMED_PARTY.exec(text);
  if (!m) return null;
  let noun = m[2].toLowerCase().replace(/ies$/, 'y').replace(/(?<=[a-z])s$/, '').replace(/^oem$/, 'OEM');
  const US = /^U\.?S\.?(?:-based)?$/i;
  let words = m[1].replace(/,/g, ' ').split(/\s+/).filter((w) => w && !QUALIFIER_FILLER.test(w));
  // "a hyperscale tenant" is a hyperscaler.
  if (/^(?:tenant|customer)$/.test(noun) && words[words.length - 1]?.toLowerCase() === 'hyperscale') {
    noun = 'hyperscaler';
    words = words.slice(0, -1);
  }
  const us = words.some((w) => US.test(w));
  const quals = words.filter((w) => !US.test(w) && !/^(?:a|an|the|its|our)$/i.test(w));
  if (!quals.length && /^(?:customer|tenant|operator|carrier|retailer)$/.test(noun)) return null;
  const core = [...quals.map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase())), noun].join(' ');
  return { key: `unnamed:${normalizeName(core)}`, label: `Unnamed ${us ? 'U.S. ' : ''}${core}`, end: m[0].length };
}

/** The companies listed right after a word ("with", "from", "by"): "TSMC and Samsung", "CoreWeave, Inc. ("CoreWeave")". */
export function partiesAt(text: string, dir: Directory, loose = false): Found[] {
  const head = text.slice(0, 220);
  return findCompanies(head, dir, loose, true).filter((f) => listy(head.slice(0, f.index)));
}

const LOAN = /\b(?:credit|loans?|term loan|revolving|financing|debt|bridge|borrow\w*|lenders?|promissory)\b/i;
const NOT_A_DEAL = /\b(?:merger|acquisition|acquire[sd]?|asset purchase|purchase and sale|stock purchase|share purchase|business combination|settlement|separation|transition services|employment|consulting|registration rights|underwriting|equity distribution|at[- ]the[- ]market|sales agreement|indenture|warrants?|voting|lock-up|non-compet\w*|severance|indemnification|confidentiality|tax|plea|consent|license to use|office|headquarters)\b/i;
const AGENT_PARTY = /^[^;]{0,80}?,?\s+as\s+(?:the\s+)?(?:trustee|underwriters?|representatives?|placement agent|sales agents?|dealer|initial purchasers?|escrow agent|transfer agent|rights agent|warrant agent|exchange agent|paying agent|financial advisor)\b/i;
const HOST_LEASE = /\b(?:tenant|to host|hosting|critical IT|MW|megawatts?|AI factor(?:y|ies)|hyperscalers?|data center lease|colocation|capacity)\b/i;

/**
 * What an agreement the company announces makes the party: "a lease with CoreWeave ... to host its operations" →
 * customer, "a loan facility with Macquarie" → lender, "our partnership with Base Electron" → partner, "a supply
 * agreement with X to supply X with cells" → customer; null when the kind or the direction is unclear (a services
 * or license agreement, a merger, an underwriter).
 */
const DEAL_WORD = /\b(?:agreements?|leases?|contracts?|orders?|partnership|collaboration|alliance|joint venture|facilit(?:y|ies)|arrangements?|notice to proceed|LNTP|memorandum of understanding|letter of intent|offtake|partnered|collaborat\w*)\b/i;

/**
 * The words of the agreement a "with" belongs to: the comma-separated stretch nearest it that names an agreement
 * ("Under the terms of that preferred equity arrangement, upon lease execution with" is about a lease).
 */
export function dealClause(before: string): string {
  const parts = (before.split(';').pop() ?? before).replace(/\([^)]*\)/g, ' ').split(',');
  let out = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    out = `${parts[i]},${out}`;
    if (DEAL_WORD.test(parts[i])) break;
  }
  return out.slice(-160);
}

export function dealRole(before: string, after: string, sentence: string): Role | null {
  const b = dealClause(before);
  if (AGENT_PARTY.test(after)) return null;
  if (/\b(?:securities purchase|subscription|investment agreement|investment from|invest(?:s|ed|ing)? (?:up to )?\$|private placement|preferred (?:equity|stock|units)|equity (?:investment|financing)|strategic investment)\b/i.test(b)) return 'investor';
  if (LOAN.test(b)) return 'lender';
  if (/^[^;]{0,80}?,?\s+as\s+(?:the\s+)?(?:administrative|collateral) agent\b/i.test(after)) return /\bcredit\b/i.test(sentence) ? 'lender' : null;
  if (NOT_A_DEAL.test(b)) return null;
  if (/\b(?:partnership|partnered|partners?|collaborat\w*|alliance|joint venture|joint development|co-develop\w*)\b/i.test(b)) return 'partner';
  if (/\b(?:leases?|leased|lease agreements?|hosting|colocation)\b/i.test(b)) {
    return HOST_LEASE.test(sentence) && !/\b(?:landlord|lessor|leased from|we lease (?:our|office))\b/i.test(sentence) ? 'customer' : null;
  }
  if (/\b(?:power purchase|PPA|purchase agreements?|purchase orders?|placed (?:an |a )?orders?|procurement|supply of (?:power|electricity|energy|natural gas))\b/i.test(b)) return 'supplier';
  // Who supplies whom, from the words after the party.
  if (/^(?:'s)?[^;]{0,80}?\b(?:(?:will|shall|agreed to|agrees to|is to)\s+(?:supply|provide|deliver|sell|manufacture|produce)\b[^.;]{0,60}\b(?:us|the Company|to us)|under which [^.;]{0,40}\bwill (?:supply|provide|deliver|sell|manufacture))\b/i.test(after)) return 'supplier';
  if (/^(?:'s)?,?[^;]{0,80}?\b(?:to (?:supply|provide|deliver|sell|manufacture|build|design|install|construct|develop|power|host|serve)|for the (?:supply|sale|delivery|construction|design) of)\b/i.test(after)) {
    return /\b(?:offtake|supply|sales?|contracts?|orders?|awards?|engagement|LNTP|notice to proceed|master services|engineering|construction|EPC|agreements?)\b/i.test(b) ? 'customer' : null;
  }
  if (/\b(?:offtake|(?:received|secured|won|booked|awarded)\b[^.;]{0,60}\b(?:orders?|contracts?|awards?))\b/i.test(b)) return 'customer';
  return null;
}

const BOILERPLATE = /\b(?:forward-looking statements?|risks,? uncertainties|risk factors|could (?:adversely|negatively|materially)|may (?:adversely|negatively|materially)|our ability to|no assurance|there can be no)\b/i;

/**
 * Another company as the subject of the agreement ("On August 6, 2026, ChronoScale entered into a partnership with
 * Microsoft"): the company's filing reports another's deal. The company itself, "we" or a subsidiary of it are not.
 */
export function otherSubject(head: string, dir: Directory, self?: RegExp): boolean {
  const m = /(?:^|[.;]\s+|,\s+)(?:On [^,]{3,40},\s*)?([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})(?:,\s+[^,]{3,80},)?\s+(?:has |have |had |also )?(?:entered into|signed|agreed|announced|executed|formed|partnered|closed|amended|extended|expanded)\b[^.;]*$/.exec(head);
  if (!m) return false;
  const subject = m[1];
  if (/^(?:We|The Company|The Registrant|The Group|Our|Each|Both|Such|This|These|Its|In|On|During|As|Under|Pursuant)\b/.test(subject) || /\b(?:subsidiar|LLC|L\.P)\b/.test(subject)) return false;
  if (self) {
    self.lastIndex = 0;
    if (self.test(subject)) return false;
  }
  return findCompanies(subject, dir, true).length > 0 || /^[A-Z][a-z]+[A-Z]\w*$/.test(subject);
}

export interface OwnStatement {
  role: Role;
  party: Found | { name: string; unnamed: true; key: string };
}

/**
 * The agreements and dealings a company's own filing states, with the party to each: agreements "with" a company
 * (or an unnamed one), what it buys "from", relies "on" or has "manufactured by", the revenue it earns "from", and
 * the orders or selections it receives "from" and "by" others.
 */
export function ownStatements(sentence: string, dir: Directory, self?: RegExp): OwnStatement[] {
  const s = sentence.replace(/^\[competitors\]\s*/, '');
  const out: OwnStatement[] = [];
  // Forward-looking statements and risk lists name what might happen, not what was agreed.
  if (BOILERPLATE.test(s)) return out;
  const seen = new Set<string>();
  const push = (role: Role, party: OwnStatement['party']) => {
    const k = `${role}|${'key' in party ? party.key : relationKey(party)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ role, party });
  };
  const re = /\b(with|from|by|on)\s+/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const word = m[1];
    const at = m.index + m[0].length;
    const before = s.slice(Math.max(0, m.index - 200), m.index);
    const rest = s.slice(at);
    const clause = before.split(/[;]/).pop() ?? before;
    let role: Role | null = null;
    let loose = false;
    if (word === 'with') {
      if (!/\b(?:agreements?|leases?|contracts?|orders?|partnership|collaboration|alliance|joint venture|facility|facilities|notice to proceed|LNTP|memorandum of understanding|letter of intent|offtake|partnered|collaborat\w*)\b/i.test(clause)) continue;
      if (otherSubject(s.slice(0, m.index), dir, self)) continue;
      const u = unnamedParty(rest);
      if (u) {
        role = dealRole(before, rest.slice(u.end), s);
        if (role) push(role, { name: u.label, unnamed: true, key: u.key });
        continue;
      }
      loose = LOAN.test(clause) || /\bpartner|collaborat|alliance|joint venture/i.test(clause);
      const parties = partiesAt(rest, dir, loose);
      if (!parties.length) continue;
      role = dealRole(before, rest.slice(parties[parties.length - 1].index), s);
      if (role) for (const p of parties) push(role, p);
      continue;
    }
    if (word === 'from') {
      if (/\b(?:orders?|contracts?|awards?)\s+$/i.test(before) || (/\b(?:revenue|revenues|sales)\s+(?:(?:generated|earned|derived)\s+)?$/i.test(before) && /\bcustomers?\b/i.test(s) && !/\bexclud\w*/i.test(before))) role = 'customer';
      else if (/\binvestments?\s+$/i.test(before)) role = 'investor';
      else if (/\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b([^.;]{0,100})$/i.test(clause)) {
        const object = /\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b([^.;]{0,100})$/i.exec(clause)?.[1] ?? '';
        if (/\b(?:shares?|stock|notes|securities|interests?|units|warrants|assets|business|land|property|properties|subsidiar\w+|entity|acquisition|rights)\b/i.test(object)) continue;
        role = 'supplier';
      }
    } else if (word === 'on') {
      if (!/\b(?:rely|relies|relied|depend|depends|depended|dependent|reliant)\s+(?:heavily |substantially |significantly |primarily )?$/i.test(before)) continue;
      role = /^[^.;]{0,80}\bfor (?:a |the )?(?:significant|substantial|large|majority|portion|most|all)[^.;]{0,40}\b(?:revenue|revenues|sales)\b/i.test(rest) ? 'customer' : 'supplier';
    } else if (word === 'by') {
      if (/\b(?:manufactured|produced|supplied|fabricated|assembled)\s+$/i.test(before)) role = 'supplier';
      else if (/\b(?:selected|chosen|awarded|engaged)\b[^.;]{0,60}$/i.test(before)) role = 'customer';
    }
    if (!role) continue;
    for (const p of partiesAt(rest, dir)) push(role, p);
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
  // An unnamed party described more loosely elsewhere ("a hyperscaler") is the one described more fully ("an
  // investment-grade hyperscaler") when there is only one such.
  const unnamed = [...by.entries()].filter(([, r]) => r.unnamed);
  for (const [k, r] of unnamed) {
    const words = r.key.replace(/^unnamed:/, '').split(' ');
    const wider = unnamed.filter(([k2, r2]) => k2 !== k && r2.role === r.role && by.has(k2) && words.every((w) => r2.key.replace(/^unnamed:/, '').split(' ').includes(w)));
    if (wider.length !== 1) continue;
    const into = by.get(wider[0][0])!;
    for (const e of r.evidence) if (!into.evidence.some((x) => x.sentence === e.sentence)) into.evidence.push(e);
    by.delete(k);
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
  /** The document within the filing: "10-K", "8-K", "EX-99.1". */
  type?: string;
  /** An 8-K's items: "1.01" (a material agreement), "7.01", "8.01". */
  items?: string[];
}

/** How many documents the search matched in all (it returns 100 a page). */
export function ftsTotal(text: string): number {
  try {
    const v = JSON.parse(text)?.hits?.total?.value;
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
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
    const type = typeof src?.file_type === 'string' ? src.file_type : undefined;
    const items = Array.isArray(src?.items) ? src.items.filter((x: unknown): x is string => typeof x === 'string') : undefined;
    out.push({ cik, name: display.replace(/\s+\([^)]*\)\s*\(CIK.*$/, '').replace(/\s+\(CIK.*$/, '').trim(), tickers, form: String(src?.form ?? src?.file_type ?? ''), date: String(src?.file_date ?? ''), path: `${cik}/${adsh.replace(/-/g, '')}/${file}`, score: Number(h?._score) || 0, ...(type ? { type } : {}), ...(items?.length ? { items } : {}) });
  }
  return out;
}

export interface Filer extends FtsHit {
  /** How many of the searches found it. */
  terms: number;
  state: 'waiting' | 'reading' | 'read' | 'failed';
  found?: number;
  /** Why it is read: the company's own filing, or another company's report, prospectus or current report (8-K). */
  source: 'own' | 'report' | 'current';
}

const ANNUAL = /^(10-K|20-F|40-F)\b/;
const REPORT = /^(10-K|20-F|40-F|10-Q)\b/;

/**
 * One filing per company, most often found and best scored first: its latest annual report when the searches found
 * one (it states the year's concentrations), else its latest quarterly report or prospectus.
 */
export function rankFilers(results: FtsHit[][], selfCik: number | undefined, max: number, weights: number[] = []): Filer[] {
  const by = new Map<number, Filer & { seen: Set<number> }>();
  results.forEach((hits, qi) => {
    for (const h of hits) {
      if (h.cik === selfCik || /^8-K/.test(h.form)) continue;
      const have = by.get(h.cik);
      if (!have) by.set(h.cik, { ...h, terms: 0, state: 'waiting', source: 'report', seen: new Set([qi]) });
      else {
        have.seen.add(qi);
        const a = ANNUAL.test(h.form);
        const b = ANNUAL.test(have.form);
        // The main document of the latest annual report, else of the latest report or prospectus.
        const main = (x: FtsHit) => !x.type || x.type === x.form || REPORT.test(x.type);
        if ((a && !b) || (a === b && (h.date > have.date || (h.date === have.date && main(h) && !main(have))))) Object.assign(have, { form: h.form, date: h.date, path: h.path, type: h.type });
        have.score = Math.max(have.score, h.score);
      }
    }
  });
  return [...by.values()]
    .map(({ seen, ...f }) => ({ ...f, terms: [...seen].reduce((a, qi) => a + (weights[qi] ?? 1), 0) }))
    .sort((a, b) => b.terms - a.terms || b.score - a.score)
    .slice(0, max);
}

/** A newer quarterly report than the annual report chosen for each filer: the latest word on the relation. */
export function newerReports(results: FtsHit[][], chosen: Filer[]): Filer[] {
  const out: Filer[] = [];
  for (const f of chosen) {
    if (!ANNUAL.test(f.form)) continue;
    let best: FtsHit | undefined;
    for (const hits of results) for (const h of hits) if (h.cik === f.cik && /^10-Q/.test(h.form) && (!h.type || REPORT.test(h.type)) && h.date > f.date && (!best || h.date > best.date)) best = h;
    if (best) out.push({ ...best, terms: f.terms, state: 'waiting', source: 'report' });
  }
  return out;
}

/** Documents of a current report worth reading: its press releases, and the report itself when it announces an agreement or an acquisition. */
export function readableCurrent(h: FtsHit): boolean {
  const type = (h.type ?? h.form).toUpperCase();
  if (/^EX-99/.test(type)) return !/present|slides|deck|overview/i.test(h.path);
  if (/^8-K/.test(type)) return !h.items || h.items.some((i) => ['1.01', '2.01'].includes(i));
  return false;
}

/**
 * The current reports (8-K) to read, newest first. Another company's: its `per` documents that name the company most
 * (the announcement before the earnings release that mentions it in passing), at most `max` in all. The company's
 * own (`own`): its press releases and agreement announcements of the year, at most `max`.
 */
export function currentDocs(results: FtsHit[][], selfCik: number | undefined, max: number, per = 2, own = false): Filer[] {
  const seen = new Set<string>();
  const all: FtsHit[] = [];
  for (const hits of results) {
    for (const h of hits) {
      if (!/^8-K/.test(h.form) || (own ? h.cik !== selfCik : h.cik === selfCik) || seen.has(h.path) || !readableCurrent(h)) continue;
      seen.add(h.path);
      all.push(h);
    }
  }
  const byCik = new Map<number, FtsHit[]>();
  for (const h of all) byCik.set(h.cik, [...(byCik.get(h.cik) ?? []), h]);
  const picked: FtsHit[] = [];
  for (const list of byCik.values()) {
    // A press release before the report that files it: it holds the announcement.
    const rank = (h: FtsHit) => (/^EX-99/.test(h.type ?? '') ? 1 : 0);
    list.sort((a, b) => (own ? b.date.localeCompare(a.date) || rank(b) - rank(a) : b.score - a.score || rank(b) - rank(a) || b.date.localeCompare(a.date)));
    picked.push(...list.slice(0, per));
  }
  picked.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  return picked.slice(0, max).map((h) => ({ ...h, terms: 1, state: 'waiting' as const, source: own ? ('own' as const) : ('current' as const) }));
}

/**
 * The names searched: the shortest first ("Nebius" also finds "Nebius Group N.V."), then those a shorter one does
 * not already cover; at most three.
 */
export function searchNames(names: TargetNames): string[] {
  const out: string[] = [];
  const covered = (n: string) => out.some((o) => new RegExp(`(?:^|\\s)${escapeRe(o)}(?:\\s|,|$)`, 'i').test(n));
  const all = [...new Set([...names.names, ...names.legal].map((n) => n.trim()))].filter((n) => n.length >= 4 || /^[A-Z0-9]{2,}$/.test(n));
  for (const n of all.sort((a, b) => a.length - b.length)) {
    const v = n.trim();
    if (v.length < 2 || out.includes(v) || covered(v)) continue;
    out.push(v);
    if (out.length >= 3) break;
  }
  return out;
}

// -------------------------------------------------------------- the store

export interface Chain {
  state: 'loading' | 'ok' | 'error';
  message?: string;
  /** The target as the SEC lists it, and its name in the app. */
  company?: { name: string; display?: string; cik?: number; ticker?: string };
  names?: TargetNames;
  /** Every document read or to read: the company's own filings first. */
  filers: Filer[];
  relations: Relation[];
  /** Day's change in percent, by relation key. */
  changes: Record<string, number>;
  at?: number;
}

export const supplyChains = createStore<{ v: number; chains: Record<string, Chain> }>({ v: 0, chains: {} });

/** Other companies' reports read (one per company), current reports read (two per company), quarterly updates read. */
const MAX_REPORTS = 80;
const MAX_CURRENT = 30;
const MAX_OWN_CURRENT = 40;
const MAX_NEWER = 25;
/** A name found in fewer documents than this is read in full; above, only beside the terms. */
const NAME_ONLY = 300;
const running = new Set<string>();
/** The words searched beside the company's names (electron/supply-chain.cjs TERMS). */
const REPORT_TERMS = ['accounted for', 'largest customer', 'revenues', 'suppliers', 'supplier', 'customer', 'sole source', 'purchase', 'distributor', 'competitors', 'lease', 'contract', 'agreement'];
/** Searches that find concentration statements: a document they find weighs more in the ranking. */
const STRONG_TERMS = new Set(['accounted for', 'largest customer', 'revenues', 'customer', 'supplier', 'sole source']);
const CURRENT_TERMS = ['agreement', 'customer', 'supplier', 'contract'];
const PROSPECTUS_TERMS = ['customer', 'supplier', 'accounted for'];

/** What SPLC reads through: the app's desktop bridge, or another reader of the same SEC sources (the tests). */
export interface ChainIO {
  companies(): Promise<SecCompany[]>;
  /** A filer's recent filings, newest first. */
  filings(cik: number): Promise<{ form: string; filed: string; accession: string; doc?: string }[] | null>;
  /** A full-text search; throws when it fails (Error('missing-agent') without the SEC User-Agent). */
  fts(arg: string): Promise<{ hits: FtsHit[]; total: number }>;
  /** The sentences of a document: those naming `names` ('mentions'), or the company's own statements ('own'). */
  text(kind: 'own' | 'mentions', path: string, names?: string[]): Promise<string[] | null>;
  securities: SecurityDef[];
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await f(items[i++]);
  }));
}

/**
 * Builds a company's supply chain: finds the documents that name it and its own recent filings, reads them and
 * classifies their sentences, telling `emit` each step. Throws Error('missing-agent') without the SEC User-Agent.
 */
export async function runChain(target: { ticker?: string; name: string }, io: ChainIO, emit: (f: (c: Chain) => Chain) => void): Promise<void> {
  const companies = await io.companies();
  const company = target.ticker ? findByTicker(companies, target.ticker) : undefined;
  const names = targetNames(company?.ticker ?? target.ticker, company?.title ?? target.name);
  const dir = buildDirectory(companies, io.securities);
  const title = company?.title ?? target.name;
  emit((c) => ({ ...c, company: { name: title, display: target.name, cik: company?.cik, ticker: company?.ticker }, names }));
  const queries = searchNames(names);

  const reports: FtsHit[][] = [];
  const current: FtsHit[][] = [];
  // A search's first page; the next pages too while the whole answer stays within `all` documents. A search that
  // fails is asked once more (the full-text search answers errors at times).
  const weights: number[] = [];
  const once = (arg: string) => io.fts(arg).catch((e) => (e?.message === 'missing-agent' ? Promise.reject(e) : null));
  const ask = async (arg: string) => (await once(arg)) ?? (await once(arg)) ?? { hits: [], total: 0 };
  const search = async (arg: string, into: FtsHit[][], all: number, weight = 1) => {
    const first = await ask(arg);
    into.push(first.hits);
    if (into === reports) weights.push(weight);
    if (first.total <= all) {
      for (let p = 1; p * 100 < first.total && first.hits.length >= 100; p++) {
        into.push((await ask(`${arg}|${p * 100}`)).hits);
        if (into === reports) weights.push(weight);
      }
    }
    return first.total;
  };
  // The company's own latest annual report, a newer quarterly report, and its current reports of the last year.
  const own: Filer[] = [];
  if (company) {
    const filings = (await io.filings(company.cik)) ?? [];
    const doc = (f: { form: string; filed: string; accession: string; doc?: string }): Filer | null =>
      f.doc && /\.html?$/i.test(f.doc) ? { cik: company.cik, name: title, tickers: [company.ticker], form: f.form, date: f.filed, path: `${company.cik}/${f.accession.replace(/-/g, '')}/${f.doc}`, score: 0, terms: 0, state: 'waiting', source: 'own' } : null;
    const annual = filings.find((f) => /^(10-K|20-F|40-F)$/.test(f.form) && doc(f));
    if (annual) own.push(doc(annual)!);
    const quarterly = filings.find((f) => f.form === '10-Q' && doc(f));
    if (quarterly && (!annual || quarterly.filed > annual.filed)) own.push(doc(quarterly)!);
    if (queries[0]) {
      const got = await ask(`|${queries[0]}|current|0|${company.cik}`);
      own.push(...currentDocs([got.hits], company.cik, MAX_OWN_CURRENT, MAX_OWN_CURRENT, true));
    }
  }
  emit((c) => ({ ...c, filers: own }));

  // Other companies' documents naming it: every report when the name is rare enough, else the reports with a term
  // beside it; prospectuses; current reports.
  // A name many filings use ("Apple") is searched beside the terms, with the legal name first: "Apple Inc" with
  // "accounted for" finds its suppliers' concentration statements, "Apple" alone its app developers.
  let wide = false;
  for (const n of queries) if ((await search(`|${n}|reports`, reports, NAME_ONLY)) > NAME_ONLY) wide = true;
  if (wide) {
    const legal = names.legal.filter((l) => !queries.includes(l)).slice(0, 2);
    for (const l of legal) for (const term of REPORT_TERMS) await search(`${term}|${l}|reports`, reports, 200, STRONG_TERMS.has(term) ? 3 : 1);
    for (const n of queries) for (const term of REPORT_TERMS) await search(`${term}|${n}|reports`, reports, 200, STRONG_TERMS.has(term) ? 2 : 1);
  }
  if (queries[0]) {
    if ((await search(`|${queries[0]}|prospectus`, reports, 200)) > 200) for (const term of PROSPECTUS_TERMS) await search(`${term}|${queries[0]}|prospectus`, reports, 100);
    if ((await search(`|${queries[0]}|current`, current, 200)) > 200) for (const term of CURRENT_TERMS) await search(`${term}|${queries[0]}|current`, current, 100);
  }
  const ranked = rankFilers(reports, company?.cik, MAX_REPORTS, weights);
  const newer = newerReports(reports, ranked.slice(0, MAX_NEWER));
  const theirCurrent = currentDocs(current, company?.cik, MAX_CURRENT);
  // Read order: its own filings, the 40 likeliest reports, the current reports, then the rest.
  const docs = [...own, ...ranked.slice(0, 40), ...theirCurrent, ...ranked.slice(40), ...newer];
  emit((c) => ({ ...c, filers: docs }));

  const pattern = targetPattern(names.names.concat(names.legal.map((l) => l.replace(SUFFIX, '').trim())));
  const relations: Relation[] = [];
  const publish = () => emit((c) => ({ ...c, relations: mergeRelations(relations), at: Date.now() }));
  const mark = (f: Filer, state: Filer['state'], found?: number) => emit((c) => ({ ...c, filers: c.filers.map((x) => (x.path === f.path ? { ...x, state, ...(found != null ? { found } : {}) } : x)) }));
  const sentenceNames = [...new Set([...names.names, ...names.legal.map((l) => l.replace(SUFFIX, '').trim())])].slice(0, 8);
  const evidence = (f: Filer, sentence: string): Evidence => ({ sentence, filer: f.name, form: f.form, date: f.date, path: f.path, ...(f.type && f.type !== f.form ? { type: f.type } : {}) });

  // Unnamed customers' shares come from the newest filing that states them (a quarter's are not the year's).
  const SHARE_ONLY = /^unnamed:\d+$/;
  let sharesFrom = '';
  for (const f of own) {
    mark(f, 'reading');
    const sentences = await io.text('own', f.path).catch(() => null);
    let found = 0;
    if (sentences) {
      const got = ownRelations(sentences, dir, { cik: company?.cik, names: names.names }, evidence(f, ''));
      const shares = got.filter((r) => SHARE_ONLY.test(r.key));
      const keep = shares.length > 0 && f.date > sharesFrom;
      if (keep) {
        sharesFrom = f.date;
        for (let i = relations.length - 1; i >= 0; i--) if (SHARE_ONLY.test(relations[i].key)) relations.splice(i, 1);
      }
      const add = got.filter((r) => keep || !SHARE_ONLY.test(r.key));
      relations.push(...add);
      found = add.length;
    }
    mark(f, sentences ? 'read' : 'failed', found);
    publish();
  }

  await pool(docs.slice(own.length), 3, async (f) => {
    mark(f, 'reading');
    const sentences = await io.text('mentions', f.path, sentenceNames).catch(() => null);
    let found = 0;
    if (sentences) {
      const listed = dir.byTicker.get(f.tickers[0] ?? '');
      const filer = targetPattern(targetNames(f.tickers[0], f.name).names);
      for (const sentence of sentences) {
        const c = classify(sentence, pattern, filer);
        if (!c) continue;
        found++;
        relations.push({ key: `cik:${f.cik}`, name: knownName(f.tickers[0]) ?? listed?.title ?? f.name, ticker: f.tickers[0], cik: f.cik, role: c.role, share: c.share, qualifier: c.qualifier, basis: c.basis, side: 'theirs', evidence: [evidence(f, sentence)] });
      }
    }
    mark(f, sentences ? 'read' : 'failed', found);
    publish();
  });
}

function setChain(key: string, f: (c: Chain) => Chain) {
  supplyChains.set((s) => ({ v: s.v + 1, chains: { ...s.chains, [key]: f(s.chains[key] ?? { state: 'loading', filers: [], relations: [], changes: {} }) } }));
}

export function supplyChainAvailable(): boolean {
  return secAvailable() && typeof window !== 'undefined' && typeof window.arminDesktop?.secText === 'function';
}

/** The desktop app's bridge to the SEC, for runChain. */
function desktopIO(): ChainIO {
  const bridge = window.arminDesktop!;
  return {
    companies: async () => {
      const list = await loadSecCompanies();
      if (!list.ok && list.reason === 'needs-agent') throw new Error('missing-agent');
      return list.ok ? list.data : [];
    },
    filings: async (cik) => {
      const filer = await loadFiler(cik);
      return filer.ok ? filer.data.filings.map((f) => ({ form: f.form, filed: f.filed, accession: f.accession, doc: f.doc })) : null;
    },
    fts: async (arg) => {
      const res = await bridge.sec!('fts', arg);
      if ((res as any)?.missing) throw new Error('missing-agent');
      if (!res?.text) throw new Error(`the full-text search answered ${res?.status ?? 'nothing'}`);
      return { hits: parseFts(res.text) ?? [], total: ftsTotal(res.text) };
    },
    text: async (kind, path, names) => {
      const res = await bridge.secText!(kind, path, names);
      return res && res.status === 200 ? res.sentences : null;
    },
    securities: engine.securities,
  };
}

/** Finds and reads the filings for a company, updating the store as each one is read. */
async function build(key: string, def: SecurityDef) {
  if (running.has(key)) return;
  running.add(key);
  try {
    setChain(key, () => ({ state: 'loading', filers: [], relations: [], changes: {} }));
    await runChain({ ticker: secTicker(def) ?? undefined, name: def.name }, desktopIO(), (f) => setChain(key, f));
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
