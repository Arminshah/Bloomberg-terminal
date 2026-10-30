import { useEffect } from 'react';
import { createStore, loadJson } from '../../core/store';
import { DAY_MS } from '../calendar';
import { engine } from '../market';
import type { SecurityDef } from '../types';
import { yahooGet } from './yahoo';
import { parseSpark } from './index-members';
import { findByTicker, loadFiler, loadFilingIndex, loadSecCompanies, secAvailable, secTicker, type SecCompany } from './sec';
import { federalRelations, type FedAsk, type FedParty, type FedStep } from './usaspending';
import { appendRelationshipHistory, enrichRelation, lifecycleRelations, evidenceIdentity, relationKind, type RelationshipAssertion, type ShareObservation, type IdentityLink } from './supply-chain-history';
export { relationKind, relationStatus, relationshipView, customerCounts } from './supply-chain-history';

/**
 * SPLC: a company's suppliers, customers and competitors as annual reports state them. Companies name their large
 * customers with the share of revenue each brought (Fabrinet: "NVIDIA Corporation ... contributed 16.3% of our
 * revenues"), their key suppliers (CoreWeave relies on NVIDIA GPUs) and their competitors. The SEC's full-text
 * search finds the reports and current reports of the last two years that name the company; the desktop app reads
 * the sentences that name it and classifies them here. The company's own reports of two years, its agreement and
 * financing 8-Ks and their press releases add the suppliers, customers, competitors, partners, investors and
 * lenders it names itself. The federal contract records (USAspending.gov) add the agencies and prime contractors it
 * works for and the subcontractors on its contracts. Every relation keeps the sentence or record it comes from.
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
  | 'target-revenue'
  /** The target's purchases that go to the related company (the target's own disclosure). */
  | 'target-purchases';

export interface Evidence {
  /** Literal extracted source text. Classification labels are not part of the quotation. */
  sentence: string;
  /** Extraction context retained separately from the source's actual words. */
  context?: 'competitor-list';
  /** Who filed it: the related company or the target itself. */
  filer: string;
  form: string;
  /** Filing date, YYYY-MM-DD. */
  date: string;
  /** cik/accession/file of the document. */
  path: string;
  /** The document within the filing when it is not the main one: "EX-99.1" (a press release), "EX-10.1". */
  type?: string;
  /** Where the record is, when it is not an SEC filing (a federal contract on USAspending.gov). */
  url?: string;
  /** First time this installation recorded this parsed disclosure; not its publication or a fresh network check. */
  observedAt?: number;
  /** Source publication precision is a day for EDGAR records here; an exact acceptance timestamp is not available. */
  publishedPrecision?: 'day';
  parserVersion?: number;
  /** A source-backed lifecycle assertion, kept even when it closes a relationship. */
  assertion?: RelationshipAssertion;
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
  /** Who states it: the related company's report, the target's own, both, or government records (federal contracts). */
  side: 'theirs' | 'own' | 'both' | 'records';
  /** US dollars in the federal records behind it: contracts obligated, or subcontracts reported. */
  amount?: number;
  /** A counterparty the filings describe without naming it ("a U.S. based investment-grade hyperscaler"). */
  unnamed?: boolean;
  recordKind?: 'entity' | 'concentration';
  assertions?: RelationshipAssertion[];
  observations?: ShareObservation[];
  /** Explicit naming evidence; never a match inferred from a percentage or a nearby date. */
  identityLinks?: IdentityLink[];
  evidence: Evidence[];
}

// ------------------------------------------------------------------ names

const SUFFIX = /(?:,?\s+(?:S\.?A\.?B\.?\s+de\s+C\.?V|S\.?A\.?\s+de\s+C\.?V|S\.?\s+de\s+R\.?L\.?(?:\s+de\s+C\.?V)?|Inc|Incorporated|Corp|Corporation|Co|Company|Cos|Ltd|Limited|LLC|L\.L\.C|plc|N\.V|NV|S\.A|SA|AG|SE|SpA|S\.p\.A|GmbH|LP|L\.P|Holdings?|Group|Hldgs|Bhd|Pty)\.?)+$/i;
const STATE_TAG = /\s*[/\\][A-Za-z]{2,3}[/\\]?\s*$/;

/** A company name without its legal form, punctuation or case: "Cisco Systems, Inc." → "cisco systems". */
export function normalizeName(name: string): string {
  let s = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0131/g, 'i').replace(STATE_TAG, '').replace(/\(.*?\)/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, '').replace(/\s*(?:&|\band)$/i, '').trim();
  return s
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, ' and ')
    .replace(/\.com\b/g, ' com')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(class [abc]|common stock|ordinary shares|ads|adr)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Initials read the same with or without stops: "U.S. Bancorp" and "US BANCORP", "J.M. Smucker" and "J M SMUCKER".
    .replace(/\b([a-z0-9])\s(?=[a-z0-9]\b)/g, '$1');
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
  panasonic: { name: 'Panasonic Holdings', yahoo: '6752.T' },
  'panasonic energy': { name: 'Panasonic Holdings', yahoo: '6752.T' },
  umc: { name: 'United Microelectronics', ticker: 'UMC' },
  'united microelectronics': { name: 'United Microelectronics', ticker: 'UMC' },
  globalfoundries: { name: 'GlobalFoundries', ticker: 'GFS' },
  'global foundries': { name: 'GlobalFoundries', ticker: 'GFS' },
  volvo: { name: 'Volvo', yahoo: 'VOLV-B.ST' },
  'volvo construction equipment': { name: 'Volvo', yahoo: 'VOLV-B.ST' },
  komatsu: { name: 'Komatsu', yahoo: '6301.T' },
  sandvik: { name: 'Sandvik', yahoo: 'SAND.ST' },
  epiroc: { name: 'Epiroc', yahoo: 'EPI-A.ST' },
  liebherr: { name: 'Liebherr' },
  kubota: { name: 'Kubota', yahoo: '6326.T' },
  'sany heavy industry': { name: 'Sany Heavy Industry', yahoo: '600031.SS' },
  xcmg: { name: 'XCMG Construction Machinery', yahoo: '000425.SZ' },
  'hitachi construction machinery': { name: 'Hitachi Construction Machinery', yahoo: '6305.T' },
  'chugai': { name: 'Chugai Pharmaceutical', yahoo: '4519.T' },
  amkor: { name: 'Amkor Technology', ticker: 'AMKR' },
  'ase technology': { name: 'ASE Technology', ticker: 'ASX' },
  'ase group': { name: 'ASE Technology', ticker: 'ASX' },
  sony: { name: 'Sony Group', ticker: 'SONY' },
  toyota: { name: 'Toyota Motor', ticker: 'TM' },
  honda: { name: 'Honda Motor', ticker: 'HMC' },
  nissan: { name: 'Nissan Motor', yahoo: '7201.T' },
  'hyundai motor': { name: 'Hyundai Motor', yahoo: '005380.KS' },
  kia: { name: 'Kia Corp', yahoo: '000270.KS' },
  stellantis: { name: 'Stellantis', ticker: 'STLA' },
  airbus: { name: 'Airbus', yahoo: 'AIR.PA' },
  safran: { name: 'Safran', yahoo: 'SAF.PA' },
  'rolls royce': { name: 'Rolls-Royce Holdings', yahoo: 'RR.L' },
  nestle: { name: 'Nestlé', yahoo: 'NESN.SW' },
  kirin: { name: 'Kirin Holdings', yahoo: '2503.T' },
  unilever: { name: 'Unilever', ticker: 'UL' },
  'lg chem': { name: 'LG Chem', yahoo: '051910.KS' },
  'samsung sdi': { name: 'Samsung SDI', yahoo: '006400.KS' },
  'sk on': { name: 'SK Innovation', yahoo: '096770.KS' },
  denso: { name: 'Denso', yahoo: '6902.T' },
  'zf group': { name: 'ZF Friedrichshafen' },
  abb: { name: 'ABB', yahoo: 'ABBN.SW' },
  'schneider electric': { name: 'Schneider Electric', yahoo: 'SU.PA' },
  hitachi: { name: 'Hitachi', yahoo: '6501.T' },
  ericsson: { name: 'Ericsson', ticker: 'ERIC' },
  nokia: { name: 'Nokia', ticker: 'NOK' },
  jabil: { name: 'Jabil', ticker: 'JBL' },
  celestica: { name: 'Celestica', ticker: 'CLS' },
  sap: { name: 'SAP', ticker: 'SAP' },
  mckesson: { name: 'McKesson', ticker: 'MCK' },
  cencora: { name: 'Cencora', ticker: 'COR' },
  'cardinal health': { name: 'Cardinal Health', ticker: 'CAH' },
  novartis: { name: 'Novartis', ticker: 'NVS' },
  roche: { name: 'Roche Holding', yahoo: 'ROG.SW' },
  'novo nordisk': { name: 'Novo Nordisk', ticker: 'NVO' },
  'boehringer ingelheim': { name: 'Boehringer Ingelheim' },
  bayer: { name: 'Bayer', yahoo: 'BAYN.DE' },
  basf: { name: 'BASF', yahoo: 'BAS.DE' },
  'pou chen': { name: 'Pou Chen', yahoo: '9904.TW' },
  'yue yuen': { name: 'Yue Yuen Industrial', yahoo: '0551.HK' },
  'feng tay': { name: 'Feng Tay Enterprises', yahoo: '9910.TW' },
  adidas: { name: 'adidas', yahoo: 'ADS.DE' },
  'jd sports': { name: 'JD Sports Fashion', yahoo: 'JD.L' },
  'tokyo electron limited': { name: 'Tokyo Electron', yahoo: '8035.T' },
  asml: { name: 'ASML Holding', ticker: 'ASML' },
  'saudi aramco': { name: 'Saudi Aramco', yahoo: '2222.SR' },
  aramco: { name: 'Saudi Aramco', yahoo: '2222.SR' },
  totalenergies: { name: 'TotalEnergies', ticker: 'TTE' },
  petrobras: { name: 'Petrobras', ticker: 'PBR' },
  'google cloud': { name: 'Alphabet', ticker: 'GOOGL' },
  'microsoft azure': { name: 'Microsoft', ticker: 'MSFT' },
  azure: { name: 'Microsoft', ticker: 'MSFT' },
  'oracle cloud infrastructure': { name: 'Oracle', ticker: 'ORCL' },
  microsemi: { name: 'Microchip Technology', ticker: 'MCHP' },
  'microsemi corporation': { name: 'Microchip Technology', ticker: 'MCHP' },
  wabtec: { name: 'Westinghouse Air Brake Technologies', ticker: 'WAB' },
  macquarie: { name: 'Macquarie Group', yahoo: 'MQG.AX' },
  'macquarie group': { name: 'Macquarie Group', yahoo: 'MQG.AX' },
  'macquarie asset management': { name: 'Macquarie Group', yahoo: 'MQG.AX' },
  walmart: { name: 'Walmart', ticker: 'WMT' },
  costco: { name: 'Costco Wholesale', ticker: 'COST' },
  // Airlines and lessors that order aircraft, lenders, AI clouds and equipment makers named in filings without a SEC
  // listing.
  'korean air': { name: 'Korean Air Lines', yahoo: '003490.KS' },
  'korean air lines': { name: 'Korean Air Lines', yahoo: '003490.KS' },
  'smbc aviation capital': { name: 'SMBC Aviation Capital' },
  'smbc capital': { name: 'SMBC Aviation Capital' },
  'turkish airlines': { name: 'Turkish Airlines', yahoo: 'THYAO.IS' },
  lufthansa: { name: 'Deutsche Lufthansa', yahoo: 'LHA.DE' },
  'lufthansa group': { name: 'Deutsche Lufthansa', yahoo: 'LHA.DE' },
  'international airlines group': { name: 'International Airlines Group', yahoo: 'IAG.L' },
  'british airways': { name: 'International Airlines Group', yahoo: 'IAG.L' },
  'air canada': { name: 'Air Canada', yahoo: 'AC.TO' },
  qantas: { name: 'Qantas Airways', yahoo: 'QAN.AX' },
  'singapore airlines': { name: 'Singapore Airlines', yahoo: 'C6L.SI' },
  'cathay pacific': { name: 'Cathay Pacific Airways', yahoo: '0293.HK' },
  'japan airlines': { name: 'Japan Airlines', yahoo: '9201.T' },
  'all nippon airways': { name: 'ANA Holdings', yahoo: '9202.T' },
  emirates: { name: 'Emirates' },
  'qatar airways': { name: 'Qatar Airways' },
  'air india': { name: 'Air India' },
  avolon: { name: 'Avolon' },
  citibank: { name: 'Citigroup', ticker: 'C' },
  deere: { name: 'Deere & Company', ticker: 'DE' },
  'doosan bobcat': { name: 'Doosan Bobcat', yahoo: '241560.KS' },
  crusoe: { name: 'Crusoe' },
  nscale: { name: 'Nscale' },
  fluidstack: { name: 'Fluidstack' },
  'together ai': { name: 'Together AI' },
  vultr: { name: 'Vultr' },
  gigabyte: { name: 'Gigabyte Technology', yahoo: '2376.TW' },
  'giga byte': { name: 'Gigabyte Technology', yahoo: '2376.TW' },
  athenahealth: { name: 'athenahealth' },
  lululemon: { name: 'lululemon athletica', ticker: 'LULU' },
  'lululemon athletica': { name: 'lululemon athletica', ticker: 'LULU' },
  anta: { name: 'ANTA Sports', yahoo: '2020.HK' },
  'anta sports': { name: 'ANTA Sports', yahoo: '2020.HK' },
  'li ning': { name: 'Li Ning', yahoo: '2331.HK' },
  asics: { name: 'ASICS', yahoo: '7936.T' },
  altera: { name: 'Altera' },
  deckers: { name: 'Deckers Brands', ticker: 'DECK' },
  'deckers brands': { name: 'Deckers Brands', ticker: 'DECK' },
  'new balance': { name: 'New Balance' },
  puma: { name: 'PUMA', yahoo: 'PUM.DE' },
  monster: { name: 'Monster Beverage', ticker: 'MNST' },
  'coca cola hbc': { name: 'Coca-Cola HBC', yahoo: 'CCH.L' },
  'coca cola bottlers japan': { name: 'Coca-Cola Bottlers Japan', yahoo: '2579.T' },
  uber: { name: 'Uber Technologies', ticker: 'UBER' },
  't mobile': { name: 'T-Mobile US', ticker: 'TMUS' },
  'arcadia solutions': { name: 'Arcadia Solutions' },
  'cfm international': { name: 'CFM International' },
};

/** The names a company goes by in other companies' reports, by its ticker. */
const ALIASES: Record<string, { legal: string[]; names: string[]; exclude?: string }> = {
  AAPL: { legal: ['Apple Inc'], names: ['Apple'] },
  MSFT: { legal: ['Microsoft Corporation'], names: ['Microsoft'] },
  AMZN: { legal: ['Amazon.com'], names: ['Amazon', 'Amazon.com', 'Amazon Web Services', 'AWS'] },
  GOOGL: { legal: ['Google LLC', 'Alphabet Inc'], names: ['Google', 'Alphabet'] },
  GOOG: { legal: ['Google LLC', 'Alphabet Inc'], names: ['Google', 'Alphabet'] },
  META: { legal: ['Meta Platforms'], names: ['Meta Platforms', 'Meta', 'Facebook'] },
  NVDA: { legal: ['NVIDIA Corporation'], names: ['NVIDIA'] },
  TSM: { legal: ['Taiwan Semiconductor Manufacturing'], names: ['TSMC', 'Taiwan Semiconductor'] },
  AMD: { legal: ['Advanced Micro Devices'], names: ['Advanced Micro Devices', 'AMD'], exclude: String.raw`\bmacula|\bretina|\bretinal|ophthalm|\b(?:wet|dry|neovascular|nAMD)[- ]AMD\b|geographic atrophy|\bAMD patients|\bintravitreal|\bvision loss|secondary to AMD|\bGA\b[^.]{0,60}\bAMD\b` },
  INTC: { legal: ['Intel Corporation'], names: ['Intel'] },
  AVGO: { legal: ['Broadcom Inc'], names: ['Broadcom'] },
  SMCI: { legal: ['Super Micro Computer'], names: ['Super Micro', 'Supermicro'] },
  DELL: { legal: ['Dell Technologies'], names: ['Dell Technologies', 'Dell'] },
  HPE: { legal: ['Hewlett Packard Enterprise'], names: ['Hewlett Packard Enterprise', 'HPE'] },
  HPQ: { legal: ['HP Inc'], names: ['HP Inc'] },
  IBM: { legal: ['International Business Machines'], names: ['IBM', 'International Business Machines'] },
  TSLA: { legal: ['Tesla, Inc', 'Tesla Inc'], names: ['Tesla'], exclude: String.raw`Nikola Tesla|Tesla coil|Tesla (?:units?|magnets?|field)\b|\b\d+(?:\.\d+)? ?Tesla\b` },
  WMT: { legal: ['Walmart Inc'], names: ['Walmart', 'Wal-Mart'] },
  COST: { legal: ['Costco Wholesale'], names: ['Costco'] },
  TGT: { legal: ['Target Corporation'], names: ['Target Corporation'] },
  ORCL: { legal: ['Oracle Corporation'], names: ['Oracle'] },
  CSCO: { legal: ['Cisco Systems'], names: ['Cisco'] },
  QCOM: { legal: ['Qualcomm'], names: ['Qualcomm'] },
  MU: { legal: ['Micron Technology'], names: ['Micron'], exclude: String.raw`Micron Electronics|Micron Solutions|\bmicrons?\b` },
  GM: { legal: ['General Motors'], names: ['General Motors'] },
  F: { legal: ['Ford Motor Company'], names: ['Ford Motor', 'Ford'], exclude: String.raw`Eagle Ford|Tom Ford|TOM FORD|Ford Foundation|Henry Ford Health|Ford Field|\b[A-Z][a-z]+ (?:[A-Z]\. )?Ford\b(?! Motor| Credit| Pro\b)|Ford(?:,|) (?:Jr|Sr)\b` },
  BA: { legal: ['The Boeing Company', 'Boeing Company'], names: ['Boeing'] },
  ARM: { legal: ['Arm Holdings', 'Arm Limited'], names: ['Arm Holdings', 'Arm Limited'], exclude: String.raw`\bARM architecture|\bArm architecture|\bArm-based|\bARM-based|\b(?:Arm|ARM) ecosystem|\b(?:Arm|ARM)- and RISC-V|architectures?,? (?:such as|like|including) (?:the )?(?:Arm|ARM)\b` },
  BABA: { legal: ['Alibaba Group'], names: ['Alibaba'] },
  // Bottlers carry the name ("Coca-Cola Europacific Partners", "bottlers of The Coca-Cola Company's products").
  KO: { legal: ['The Coca-Cola Company'], names: ['Coca-Cola'], exclude: String.raw`Coca[- ]Cola (?:Europacific|FEMSA|Consolidated|HBC|Hellenic|[IÍİ][cç]ecek|Amatil|Bottl\w*|Beverages Africa|Enterprises|Andina|Embonor|Bottlers)|bottlers? of (?:the )?(?:The )?Coca[- ]Cola` },
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
  GE: { legal: ['General Electric Company', 'GE Aerospace'], names: ['GE Aerospace', 'General Electric'], exclude: String.raw`GE HealthCare|GE Healthcare|GE Vernova|General Electric Capital|Siemens Healthineers|Canon Medical|United Imaging|Philips Healthcare|medical imaging` },
  GEV: { legal: ['GE Vernova Inc'], names: ['GE Vernova'] },
  XOM: { legal: ['Exxon Mobil Corporation'], names: ['ExxonMobil', 'Exxon Mobil', 'Exxon'] },
  CVX: { legal: ['Chevron Corporation'], names: ['Chevron'] },
  LLY: { legal: ['Eli Lilly and Company'], names: ['Eli Lilly', 'Lilly'], exclude: String.raw`\b(?!Eli\b)[A-Z][a-z]+ (?:[A-Z]\. )?Lilly\b|Lilly Endowment|Lilly Foundation|Lilly Pulitzer` },
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
  /** Sentences this pattern matches speak of something else of the same name ("wet AMD", the eye disease). */
  exclude?: string;
  /** Names matched in sentences ("NVIDIA"; for Apple "Apple", which excludes "Apple Pay"). */
  names: string[];
}

/** How other reports name a company: its legal name for the search, its short names for reading. */
export function targetNames(ticker: string | undefined, title: string): TargetNames {
  const alias = ticker ? ALIASES[ticker.toUpperCase()] : undefined;
  // "Eli Lilly and Company" without its legal form is "Eli Lilly", not "Eli Lilly and".
  const bare = (l: string) => l.replace(SUFFIX, '').replace(/^The\s+/, '').trim().replace(/[\s,]+(?:and|&)$/i, '').trim();
  if (alias) return { legal: alias.legal, names: [...new Set([...alias.names, ...alias.legal.map(bare)])], ...(alias.exclude ? { exclude: alias.exclude } : {}) };
  const clean = title.replace(STATE_TAG, '').replace(/\s+/g, ' ').trim();
  const words = clean.replace(/,/g, ' ').split(' ').filter(Boolean);
  const tail: string[] = [];
  while (words.length > 1 && suffixWord(words[words.length - 1])) tail.unshift(words.pop()!);
  // "BANK OF AMERICA CORP": "Bank of America", as reports write it; "Bank OF America" matched no filing.
  const base = words.map((w, i) => (i > 0 && /^(?:OF|AND|THE|FOR|IN|ON|AT)$/.test(w) ? w.toLowerCase() : titleWord(w))).join(' ').replace(/ Com$/, '.com');
  const legalSuffix = tail.length ? suffixWord(tail[0]) : '';
  const legal = legalSuffix ? `${base} ${legalSuffix}` : base;
  const names = [base.replace(/\s+(?:and|&)$/i, '')];
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
  // A short word kept in capitals from the SEC's title ("NEW York Times", "Jack IN the BOX") is also written "New", "in";
  // a word the title gives in capitals is written with capitals inside it too ("MASTEC INC" is "MasTec", "AUTOZONE INC"
  // "AutoZone").
  const word = (w: string) =>
    /^[A-Z]{2,3}$/.test(w) ? `(?:${w}|${w[0]}${w.slice(1).toLowerCase()}|${w.toLowerCase()})` : /^[A-Z][a-z]{3,}$/.test(w) ? w[0] + [...w.slice(1)].map((ch) => `[${ch.toUpperCase()}${ch}]`).join('') : escapeRe(w);
  const words = (n: string) => n.split(' ').map(word).join(' ');
  const alts = names.flatMap((n) => (/[a-z]/.test(n) ? [spaced(words(n)), spaced(escapeRe(n.toUpperCase()))] : [spaced(n.split('').map((c) => (/[A-Za-z]/.test(c) ? `[${c.toUpperCase()}${c.toLowerCase()}]` : escapeRe(c))).join(''))]));
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
    const capitalNext = /^(?:'s)?\s+(?:[A-Z0-9\u00C0-\u00DE\u0130]|[a-z][A-Z])/.test(after) && !LEGAL_FORM.test(after);
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

const OF_REVENUE = /^(?:\s*,?\s*(?:or more|or greater|or less))?\s*,?\s*(?:respectively\s*,?\s*)?(?:of|in)\s+(?:the\s+)?(?:(?:our|its|their|the Company's|the Group's|Company's|Group's|total|consolidated|net|aggregate|annual|worldwide)\s+)*(?:(?:total|net|consolidated|product|segment|gross)\s+)*(?:(?!of\b|from\b|to\b|in\b)[A-Za-z&-]+,?\s+){0,5}?(?:revenue|revenues|net sales|sales|turnover)\b(?![ -](?:volumes?|force|tax|taxes|team|agents?|channels?|representatives?|prices?|growth|mix|units?)\b)/i;
/**
 * A share of the company's revenue, not of one segment's: "9.2% of net sales for our Sun and Skin Care segment" and "of
 * our Government Operations segment revenues" (Edgewell's 10-K of November 2025) are a segment's.
 */
function companyRevenue(tail: string): RegExpExecArray | null {
  const rev = OF_REVENUE.exec(tail);
  if (!rev) return null;
  if (/\b(?:segment|division)\b/i.test(rev[0]) && !/\btotal segment\b/i.test(rev[0])) return null;
  if (/^\s+(?:for|in|of|within|from)\s+(?:our|its|their|the)\s+(?:[A-Za-z&,'-]+\s+){0,6}?(?:segments?|divisions?|business units?)\b/i.test(tail.slice(rev[0].length))) return null;
  return rev;
}
/** A bank named as the agent of a credit facility or as a lender under it: ", N.A., as Administrative Agent". */
const LENDER_AFTER = /^(?:'s)?(?:,?\s+N\.\s?A\.)?(?:\s*\([^)]*\))?,?\s+(?:(?:is expected to|will|shall|to)\s+)?(?:(?:act|acts|serve|serves|acting|serving)\s+)?as\s+(?:the\s+|a\s+|an\s+|sole\s+)*(?:(?:[A-Z][\w-]*|joint|lead|syndication)\s+){0,2}?(?:administrative agent|collateral agent|(?:(?:revolving|term|incremental|swing line|initial|revolving credit|term loan)\s+){0,2}(?:credit\s+)?lenders?)\b/i;
const OF_PURCHASES = /^(?:\s*,?\s*(?:or more|or greater|or less))?\s*,?\s*(?:respectively\s*,?\s*)?(?:of|in)\s+(?:the\s+)?(?:(?:our|its|their|the Company's|the Group's|total|consolidated|net|aggregate|annual)\s+)*(?:(?:total|net|consolidated|merchandise)\s+)*(?:purchases|inventory purchases|merchandise purchases|purchases of (?:merchandise|inventory|products)|component purchases|cost of (?:revenue|revenues|sales|goods sold)|capital expenditures|property and equipment purchases|procurement)\b/i;
const VERB = /\b(?:contribut(?:ed|es|e|ing)|account(?:ed|s|ing)? for|represent(?:ed|s|ing)?|compris(?:ed|es|e|ing)|constitut(?:ed|es|e)|amounted to|made up|generated|were to|was to)\b/i;

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

/** Several customers' figure together. */
// A figure for several companies together: "our five largest customers", "our top five manufacturers/publishers as a group
// (Microsoft, Dell, ...)" (Insight's 10-K).
const GROUP_OF = String.raw`(?:customers?|clients?|suppliers?|vendors?|manufacturers?|publishers?|partners?|distributors?|resellers?|OEMs?)\b`;
const GROUP = new RegExp(
  String.raw`\b(?:top|largest|biggest|major|principal|ten|five)\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+${GROUP_OF}|\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:largest|biggest|major|principal|top|significant)\s+${GROUP_OF}|\bcustomers,?\s+(?:including|such as)\b|\bin (?:the )?aggregate\b|\bas a group\b`,
  'i',
);
const PRONOUN_START = /^(?:we|our|it|its|they|their|this|these|the company|the group|sales|revenue|revenues|which|who)\b/i;

/**
 * Which percentage of a run belongs to the target: the one in its place among the companies named before the verb
 * ("Cisco, NVIDIA, Nokia and Amazon contributed 19.9%, 16.3%, 10.7% and 10.5%, respectively"), else the latest
 * year's when the run gives several years ("91 percent, 89 percent, and 87 percent for fiscal 2026, 2025, 2024").
 */
/** The names a subject lists before its verb, in order: "Lockheed Martin, Pilatus, and Boeing", "Target® and Walmart®". */
export function subjectNames(subject: string): string[] {
  const s = stripForms(subject)
    .replace(/[®™]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,\s+(?:a|an)\s+[a-z][^,;]*/g, '')
    .replace(/^.*?\b(?:During|For|In|As of|At)\b[^,]*\d{4}[^,]*,\s*/i, '');
  return s
    .split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/)
    .map((p) => /([A-Z][\w&.'-]*(?:\s+(?:[A-Z][\w&.'-]*|of|&|de))*)\s*$/.exec(p.trim())?.[1] ?? '')
    .filter((p) => p && p.split(/\s+/).length <= 6 && !PRONOUN_START.test(p) && !/^(?:The|Our|Sales|Revenue|Revenues|Net)$/.test(p));
}

/** How a share was found in a run: alone, by the company's place in a list, by year, or not at all. */
export type ShareHow = 'single' | 'company' | 'years' | 'none';

/**
 * Which percentage of a run belongs to the target: the one in its place among the companies named before the verb
 * ("Cisco, NVIDIA, Nokia and Amazon contributed 19.9%, 16.3%, 10.7% and 10.5%, respectively"), else the latest
 * year's when the run gives several years ("15%, 16% and 15% ... in fiscal years 2025, 2024 and 2023"). Years for
 * the target together with another company ("Sony's PlayStation and Microsoft's Xbox ... 2% and 45%") give none.
 */
export function shareOf(s: string, run: Pct[], pattern: RegExp): { value: number | undefined; how: ShareHow } {
  if (run.length === 1) return { value: run[0].value, how: 'single' };
  const head = s.slice(0, run[0].index);
  const verbs = [...head.matchAll(new RegExp(VERB.source, 'gi'))];
  const verb = verbs[verbs.length - 1];
  if (verb && /\brespectively\b/i.test(s)) {
    // The subject: from the previous percentage (or the sentence start) to the verb.
    const prev = Math.max(0, head.slice(0, verb.index).search(/\d\s*(?:%|percent)[^%]*$/));
    const names = subjectNames(head.slice(prev ? prev + 2 : 0, verb.index).replace(/,\s*which\s*$/i, ''));
    if (names.length === run.length) {
      const i = names.findIndex((p) => {
        pattern.lastIndex = 0;
        return pattern.test(p);
      });
      if (i >= 0) return { value: run[i].value, how: 'company' };
    }
  }
  const yearsAfter = (s.slice(run[run.length - 1].end, run[run.length - 1].end + 140).match(/\b(?:19|20)\d{2}\b/g) ?? []).filter((y, i, a) => a.indexOf(y) === i);
  const order = yearsAfter.length === run.length ? yearsAfter : (s.match(/\b(?:19|20)\d{2}\b/g) ?? []).filter((y, i, a) => a.indexOf(y) === i);
  if (order.length === run.length) {
    // The target named together with another ("PlayStation and Microsoft's Xbox"): the years are for both.
    pattern.lastIndex = 0;
    const at = pattern.exec(head);
    if (at) {
      const around = head.slice(Math.max(0, at.index - 50), at.index + at[0].length + 50);
      const name = at[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`[A-Z][\\w&.'-]*(?:'s)?(?:\\s+\\([^)]*\\))?(?:\\s+[A-Z][\\w-]*)?\\s+(?:and|or)\\s+(?:[\\w.'-]+\\s+){0,2}${name}|${name}(?:'s)?(?:\\s+\\([^)]*\\))?(?:\\s+[A-Z][\\w-]*)?\\s+(?:and|or)\\s+[A-Z]`).test(around)) return { value: undefined, how: 'none' };
    }
    const years = order.map(Number);
    return { value: run[years.indexOf(Math.max(...years))].value, how: 'years' };
  }
  return { value: undefined, how: 'none' };
}

export function shareInRun(s: string, run: Pct[], pattern: RegExp): number | undefined {
  return shareOf(s, run, pattern).value;
}

/** "represented approximately 16% in 2025 and 2024 and 15% in 2023 of our net sales": each figure with its year. */
export function yearPairRun(s: string): { run: Pct[]; purchases: boolean } | null {
  const pairs = [...s.matchAll(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent)\s+(?:in|for|during)\s+(?:(?:fiscal|calendar)\s+(?:years?\s+)?)?((?:19|20)\d{2})(?:\s+and\s+((?:19|20)\d{2}))?/gi)];
  if (pairs.length < 2) return null;
  const last = pairs[pairs.length - 1];
  const tail = s.slice((last.index ?? 0) + last[0].length, (last.index ?? 0) + last[0].length + 140);
  const revenue = !!companyRevenue(tail);
  const purchases = !revenue && OF_PURCHASES.test(tail);
  if (!revenue && !purchases) return null;
  let best = pairs[0];
  let year = 0;
  for (const p of pairs) {
    const y = Math.max(Number(p[2]), Number(p[3] ?? 0));
    if (y > year) {
      year = y;
      best = p;
    }
  }
  const index = best.index ?? 0;
  return { run: [{ value: Number(best[1]), index, end: index + best[1].length + 1 }], purchases };
}

/**
 * A list of products' shares of revenue by year ("The contributions to revenue of the products, in 2024 and 2025,
 * respectively, are as follows: Oracle PeopleSoft HCM/ Oracle PeopleSoft Financials, 78.9% and 70.5%; Dayforce HCM,
 * 0.2% and 0.1%"): the share of the item naming the target, for the later year.
 */
export function productListShare(s: string, pattern: RegExp): { share: number; year: number } | null {
  const head = /\bcontributions?\s+to\s+(?:(?:our|its|total|the Company's|the Group's)\s+)*revenues?\s+of\s+(?:the|our|its)\s+(?:products?|services?|solutions?|brands?)\b,?\s+(?:in|for)\s+(?:fiscal\s+(?:years?\s+)?)?((?:19|20)\d{2})\s+and\s+((?:19|20)\d{2}),?\s+respectively,?\s+(?:are|were)\s+as\s+follows:\s*/i.exec(s);
  if (!head) return null;
  const years = [Number(head[1]), Number(head[2])];
  const later = years[1] >= years[0] ? 1 : 0;
  for (const item of s.slice(head.index + head[0].length).split(/;\s*/)) {
    const m = /^(.{1,120}?),\s*(\d{1,3}(?:\.\d{1,2})?)\s*%\s+and\s+(\d{1,3}(?:\.\d{1,2})?)\s*%/.exec(item);
    if (!m) break;
    pattern.lastIndex = 0;
    if (pattern.test(m[1])) return { share: Number(m[later + 2]), year: years[later] };
  }
  return null;
}

// ------------------------------------------------------------ classification

// "Our competitive landscape includes ..." names competitors; "competitive pricing", "ahead of our competition" and
// "we compete favorably in ... Microsoft ecosystem depth" do not.
const COMPETITION_NOISE = /\b(?:Competition (?:Authority|Commission|Bureau|Tribunal|Act|Law)|competition (?:law|laws|authorit\w*|regulat\w*)|anti-?competitive|competitive(?:ly|ness)?(?!\s+(?:landscape|environment|set\b|field\b))|ahead of (?:our|the) competition|compete favou?rably (?:in|on|based on|with respect to|in terms of))\b/g;
/** Career lines in biographies ("Prior to his tenure at Apple, he served as a partner at McKinsey"). */
const BIOGRAPHY = /\b(?:served as|serves as|serving as|tenure at|prior to joining|previously (?:served|held|worked|was)|held (?:various|senior|several|a|an|the) |career at|was employed|worked at|joined (?:us|the Company|our company) from|member of the board|board of directors of|(?:served|serves|serving|worked|held)\b[^.;]{0,60}\b(?:as|roles?|positions?)\b[^.;]{0,60}\b(?:at|of|for|with)\b|(?:Mr|Ms|Mrs|Dr)\.\s+[A-Z][a-z]+\b[^.;]{0,80}\b(?:served|joined|worked|held|was|previously|prior)\b|\b(?:he|she) (?:has |had )?(?:served|negotiated|led|founded|joined|held|worked)\b|\bhis (?:career|tenure|role)\b|\bher (?:career|tenure|role)\b|\bunder (?:his|her) leadership\b|\bexperience (?:at|with|in)\b[^.;]{0,80}\b(?:including|such as)\b|\bsince joining\b)/i;
/** Lawsuits, patents and trade cases name companies without a commercial relation. */
const LITIGATION = /\b(?:infring\w*|patents?|litigation|lawsuits?|complaint|court|International Trade Commission|exclusion order|antitrust|alleg\w+|plaintiffs?|defendants?)\b/i;
/** The filer itself: investments and partnerships count only when they involve it. */
const FILER = /\b(?:[Ww]e|us|[Oo]urs?|[Tt]he Company(?:'s)?|[Tt]he Group(?:'s)?|[Tt]he Registrant)\b/;
/** The target took a stake in the filer: it invested in, bought, holds or was issued the filer's shares. */
const INVEST_AFTER = /^(?:'s)?[^.;]{0,80}?\b(?:(?:invested|purchased|acquired|subscribed for|holds|held|owns|owned|beneficially owns)\b[^.;]{0,80}?\b(?:shares|stock|stake|equity interest|ownership interest|preferred|units)|(?:take|takes|took|taking)\s+(?:an?\s+)?(?:[\w%-]+\s+){0,2}?(?:stake|equity interest|ownership interest))\b/i;
const INVEST_BEFORE = /\b(?:issue|issues|issued|sell|sells|sold|delivered)\b[^.;]{0,120}\b(?:shares|stock|preferred|units)\b[^.;]{0,60}\bto\s+(?:the\s+)?$|\b(?:shares|stock|units)\b[^.;]{0,60}\b(?:issued|sold|delivered|transferred)\s+to\s+(?:the\s+)?$|\b(?:securities purchase|stock purchase|share purchase|subscription|investment) agreement\b[^.;]{0,60}\bwith\s+(?:the\s+)?$|\bprivate placement\b[^.;]{0,100}\bto\s+$/i;

export interface Classified {
  role: Role;
  /** A second role the same sentence gives: "competes with Microsoft, who is also our partner". */
  also?: Role;
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
  let rest = b;
  for (let i = 0; i < 8; i++) {
    const m = re.exec(rest);
    if (!m) return false;
    if (listy(m[1] ?? '')) return true;
    rest = rest.slice(m.index + 1);
  }
  return false;
}

/** Statements that are no current relation: boilerplate, peer groups, hedges, negations, ended deals and takeovers. */
const SAFE_HARBOR = /\b(?:forward-looking statements?|safe harbou?r|cautionary (?:note|statement)|factors that could cause|risks,? uncertainties,? and other factors|among these factors|actual results (?:could|may|might) differ|statements of historical fact|deemed to be forward-looking|future financial (?:position|results|performance))\b/i;
const PEER_GROUP = /\b(?:peer group|peer companies|comparator group|compensation peers?|performance peers?|benchmark companies)\b/i;
const NEGATED = /\b(?:not|no|never|neither|nor|without)\b[^.;]{0,40}\b(?:partner\w*|compet\w*|customers?|suppliers?|relationship|affiliat\w*|endorse\w*|sponsor\w*|implies?|imply)\b/i;
const ENDED = /\b(?:terminat(?:ed|ion|es|ing)|former(?:ly)?|expired|no longer|ceased|wound down|forfeit(?:ed|ure)|cancel(?:l)?ed|discontinu\w*|repurchased all|sold (?:all|its entire)|sell[- ]down|transfer(?:red)? (?:of )?(?:its|their|all|our) rights|in the past|history includes|prior to (?:the|its|our) (?:transfer|sale|spin-?off|separation))\b/i;
/** A contract's definitions ("'Covered Royalty Payment' means"), a transcript's questions ("Your competitors"). */
const NOT_STATEMENT = /"[A-Z][^"]{2,60}"\s+(?:means|shall mean|has the meaning)\b|\b(?:you|your)\b|incorporated (?:herein )?by reference|\bExhibit \d|registration rights|\bbuy-?back|\brepurchase(?:d|s)? (?:of )?(?:its|our|their) (?:own )?shares|contingent consideration|\bearn-?outs?\b|previous period|prior period|closing conditions?|subject to (?:the )?(?:closing|completion|consummation)|available from|\bObligors?\b|\bGuarant(?:y|ee) was provided\b|\bto provide security for\b|\bamounts due (?:to the Company )?from\b|\bas if (?:it|they|we|the Company)\b/i;
/** Plans and hopes: "we plan to rely on AMD", "we aim to broaden our partnerships with Microsoft". */
const INTENT = /\b(?:plans?|planned|planning|aims?|intends?|intended|seeks?|seeking|hopes?|anticipates?|anticipated|expects? to|may|might|could|would|potential(?:ly)?|proposed|prospective)\b[^.;]{0,60}$/i;
const TAKEOVER = /\b(?:Merger Sub|merger agreement|notice and waiver|waiver (?:under|of)|CVR|contingent value right|Agreement and Plan of Merger|plan of merger|Effective Time|tender offer|business combination|acquisition of (?:all|substantially all)|acquired by|to be acquired|would acquire|asset purchase agreement|purchase and sale agreement|sold (?:its|our|the|certain) [^.;]{0,60}\b(?:program|business|assets?|division|unit|portfolio|rights)\b|acquired certain assets|transition services?)\b/i;
const HEDGED_COMPETITION = /\b(?:may|might|could|would|can)\s+(?:also\s+|potentially\s+|in the future\s+|eventually\s+)?(?:include|compete|face|become|enter|move|experience|favou?r|view|regard|consider|see)\b|\bif (?:they|it|we|any)\b|\bpotential(?:ly)? (?:compet|entrant)/i;
/** Licences, royalties and research collaborations: partnerships, whichever way the money flows. */
const LICENSING = /\b(?:royalt(?:y|ies)|milestone payments?|upfront payments?|collaboration (?:agreement|revenue|and license|and supply)|clinical (?:trial )?collaboration|license and collaboration|co-develop\w*|co-commerciali[sz]\w*|research (?:and development )?collaboration|option and license|in-licens\w*|out-licens\w*|sublicens\w*|exclusive (?:[\w.-]+\s+){0,3}licen[cs]e|licen[cs]ed (?:to|from)|licen[cs]e (?:agreements?|granted) (?:with|to|from)|(?:concluded|determined) that [^.;]{0,40}\b(?:is|was) a customer|ASC 606|contract with a customer|performance obligations?|stand[- ]ready obligation|transfer of the licen[cs]e|licens(?:ee|or)|know-how|opt-in (?:rights?|options?|payments?|packages?|decisions?|licen[cs]es?)|research (?:and development )?services|clinical (?:trial )?supply|compounds? transferred|ROF[NR]|rights? of first (?:negotiation|refusal))\b/i;
/** Oil, gas and mineral royalties are no licence. */
const MINERAL = /\b(?:oil|natural gas|NGLs?|minerals?|acreage|acres|wells?|royalty (?:trusts?|interests?)|overriding royalt\w*|net profits interests?|working interests?|underlying (?:royalt\w+|propert\w+)|nonproducing|operators?)\b/i;
/** Customers and suppliers of a third company named in the sentence ("Pegatron's customers include Tesla"). */
const OTHER_POSSESSIVE = /([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})(?:'s|’s)\s+(?:[\w-]+\s+){0,3}(?:customers?|suppliers?|vendors?|business|operations|products|partners?)\b[^.;]*$/;

/**
 * A sentence that gives the target's short name to another company: "Changzhou Almaden Co., Ltd. (we refer to it as
 * "AMD")", "a related party that we refer to in this annual report as AMD". Every mention in that filing is the other.
 */
export function definesOther(s: string, pattern: RegExp): boolean {
  const re = /(?:\(\s*(?:the\s+)?["“]([A-Z][\w&.-]{1,20})["”]\s*\)|\b(?:refer(?:red|s)?|referred) to (?:it |them )?(?:[^.;"“]{0,40}?\s)?as\s+(?:the\s+)?["“]?([A-Z][\w&.-]{1,20})\b["”]?)/g;
  for (const d of s.matchAll(re)) {
    const term = d[1] ?? d[2];
    pattern.lastIndex = 0;
    if (!pattern.test(term)) continue;
    const lead = s.slice(Math.max(0, (d.index ?? 0) - 120), d.index ?? 0);
    pattern.lastIndex = 0;
    if (!pattern.test(lead)) return true;
  }
  return false;
}

/**
 * What a sentence in another company's filing says about the target: that the filer supplies it (with the share of
 * the filer's revenue), buys from it or resells its products, competes with it, partners with it, lends to it, holds
 * a stake in it or took its investment; null when it says none of these clearly. Precision first: a sentence that is
 * boilerplate, hedged, negated, about an ended deal or a takeover, or about a third company's relation says nothing.
 * `pattern` matches the target's names; `filer`, the filer's own names (press releases speak of it in the third person).
 */
export function classify(sentence: string, pattern: RegExp, filer?: RegExp): Classified | null {
  const c = classifyStatement(sentence, pattern, filer);
  if (!c || c.share != null) return c;
  const s = sentence.replace(/^\[competitors\]\s*/, '');
  const involves = (text: string) => {
    if (FILER.test(text) || /\b[Tt]he (?:Corporation|Trust|Partnership|Fund|Bank|Issuer|Firm|Partnerships?)(?:'s)?\b|\b[Bb]oth companies\b/.test(text)) return true;
    // A credit agreement's borrowers in the filer's own exhibit list: "by and among MasTec, Inc. ..., as Borrowers".
    if (/\bas\s+(?:the\s+)?(?:parent\s+)?[Bb]orrowers?\b|\bthe Borrower\b/.test(text)) return true;
    // A share of net sales or revenue is the filer's own figure: "these major retailers represented 54% of total net sales".
    if (/\d\s*(?:%|percent)\s+of\s+(?:our\s+|its\s+|the Company's\s+)?(?:total\s+|net\s+|consolidated\s+|annual\s+)*(?:sales|revenues?)\b/i.test(text)) return true;
    // "the purchase order received from Esso", "revenues arising from": the filer's own orders and revenue.
    if (/\b(?:orders?|contracts?|awards?)\s+(?:[\w-]+\s+){0,2}received from\b|\brevenues? (?:arising|derived|generated) from\b/i.test(text)) return true;
    // A bullet that starts with the filer's action ("Announced ... a clinical supply agreement with Pfizer"), fees the
    // filer pays ("royalty fees payable to Qualcomm").
    if (/^(?:[-•*]\s*)?(?:Sold|Signed|Announced|Entered|Secured|Launched|Expanded|Completed|Delivered|Won|Shipped|Awarded|Received|Partnered|Closed)\b/.test(text.trim()) || /\b(?:fees?|royalt\w*|amounts?|payments?)\s+(?:payable|paid|owed|due)\s+to\b/i.test(text)) return true;
    // "Syrup for frozen beverages is purchased primarily from The Coca-Cola Company"; "Representative customers include
    // Costco"; "Customers for TAT Israel aviation accessories include Boeing".
    if (/\b(?:is|are|were|was)\s+(?:\w+\s+){0,2}?(?:purchased|sourced|supplied|manufactured|produced|obtained|bought|licensed)\s+(?:primarily\s+|mainly\s+|principally\s+|exclusively\s+)?(?:from|by)\b/i.test(text)) return true;
    if (/^(?:[\w-]+\s+){0,4}?(?:[Cc]ustomers|[Ss]uppliers|[Vv]endors|[Cc]lients)\b[^.;]{0,80}?\b(?:include|includes|included)\b/.test(text.trim())) return true;
    // "Key suppliers of single and limited source components include NVIDIA": the filer's own list.
    if (/\b(?:[Kk]ey|[Pp]rincipal|[Pp]rimary|[Mm]ain|[Ll]argest|[Mm]ajor|[Ss]ignificant|[Ss]ole|[Ss]ingle|[Cc]ritical)\s+(?:[\w-]+\s+){0,5}?(?:suppliers?|vendors?|customers?)\b[^.;]{0,80}?\b(?:include|includes|included|are|were)\b/.test(text)) return true;
    if (!filer) return false;
    filer.lastIndex = 0;
    return filer.test(text);
  };
  // A statement must involve the filer: market commentary ("major suppliers such as Samsung and Micron prioritize HBM"),
  // a person's career ("Ms. Rosen has advised brands including Nike") and another company's dealings ("Pegatron is a
  // supplier whose customers include Tesla") say nothing of it.
  if (!involves(s)) return null;
  // A third party's words quoted in the filer's release ("Warburg Pincus Managing Director Dan Zamlong said, 'We are
  // proud of the platform we built in partnership with ...'") are that party's.
  const quoted = /([A-Z][\w&.]+(?:\s+[A-Z][\w&.]+){0,3})\s+(?:Managing Director|Managing Partner|Partner|Chief Executive Officer|CEO|President|Chairman|Founder)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2},?\s+said\b/.exec(s);
  if (quoted && !involves(quoted[1])) return null;
  // A rival that is also a partner: "OpenText competes with Microsoft, who is also our partner", "we compete with some
  // of our platform partners ..., including Five9, Genesys, Microsoft".
  if (c.role === 'competitor') {
    // The words must be about the target: right after its name, or a list of partners it is in.
    const ms = mentions(s, pattern);
    const right = ms.some((m) => /^\s*(?:\([^)]*\))?\s*,?\s*(?:who|which|that) (?:is|are) also (?:our|a|an|one of our) (?:[\w-]+\s+){0,2}?partners?\b/i.test(s.slice(m.end, m.end + 70)));
    const list = /\bcompete\w* with (?:some of |certain of |several of )?(?:our|its) (?:[\w-]+\s+){0,2}?partners\b[^.;]*?\b(?:including|such as)\b/i.exec(s);
    const inList = !!list && ms.some((m) => m.index > list.index && !/[.;]/.test(s.slice(list.index, m.index)));
    if (right || inList) return { ...c, also: 'partner' };
  }
  return c;
}

/** The role a sentence gives, before the check that it involves the filer at all. */
function classifyStatement(sentence: string, pattern: RegExp, filer?: RegExp): Classified | null {
  const s = sentence.replace(/^\[competitors\]\s*/, '');
  // Mentions that are not the company itself: a parent named for a subsidiary or division ("Mobileye, a subsidiary of
  // Intel", "Elanco, the animal health division of Eli Lilly"), its bottlers or licensees, or its products' users
  // ("Tesla drivers", "Tesla EVs can charge at our stations").
  const competing = /\bcompet/i.test(s);
  const ms = mentions(s, pattern).filter(
    (m) =>
      !(competing && /(?:\b(?:a|an|the)\s+(?:[\w-]+\s+){0,3}(?:subsidiary|division|unit|affiliate|business|arm|segment)\s+of|\b(?:bottlers?|licensees?|franchisees?)\s+of)\s+(?:the\s+)?$/i.test(s.slice(Math.max(0, m.index - 80), m.index))) &&
      !/^(?:'s)?\s+(?:EVs?\s+|vehicle\s+)?(?:drivers|owners|users|riders|subscribers)\b|^\s+EVs?\b/i.test(s.slice(m.end, m.end + 30)),
  );
  const company = ms.filter((m) => !m.product);
  if (!ms.length || BIOGRAPHY.test(s) || SAFE_HARBOR.test(s) || PEER_GROUP.test(s)) return null;
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
  if ((s.match(/\([A-Z]{2,5}\)/g)?.length ?? 0) >= 3 && !/\bcompet/i.test(s)) return null;
  // "does not imply any partnership", "we do not compete directly with Apple".
  if (company.some((c) => NEGATED.test(s.slice(Math.max(0, c.index - 120), c.end + 60)))) return null;
  if (TAKEOVER.test(s) || ENDED.test(s) || NOT_STATEMENT.test(s)) return null;
  // Another company defined by the target's short name: "Changzhou Almaden Co., Ltd. (we refer to it as "AMD")".
  if (definesOther(s, pattern)) return null;
  // A technical fit is no trade: "powered by Palantir", "compatible with Microsoft", "certifications from Microsoft".
  if (company.length && company.every((c) => /\b(?:powered by|built on|based on|running on|runs on|compatible with|integrat\w* with|works? with|support(?:s|ed)? for|certifi\w* (?:by|from)|certifications? from|on top of|alongside|in conjunction with|sub-?tier (?:suppliers?|vendors?) (?:of|to)|tier[- ](?:2|3|two|three) (?:suppliers?|vendors?) (?:of|to))\s+(?:[^.;]{0,30})$/i.test(before(c)) || /\bpowered by\s+(?:[\w-]+\s+){0,5}(?:partner|provider|leader)s?,?\s+$/i.test(before(c)) || /\b(?:sit on top of|connects? to|integrates? with|compatible with|works? with)\s+(?:[\w-]+\s+){0,5}(?:platforms?|systems?|clouds?|databases?|tools?)\s+(?:including|such as|like)\s+([^.;]{0,140})$/i.test(before(c)))) return null;
  // A dispute is no relation: "the dispute with Tesla", "lawsuits ... against Pfizer".
  if (company.length && company.every((c) => /\b(?:disputes?|lawsuits?|litigation|complaints?|claims?|arbitration|suits?)\s+(?:with|against|by|filed by)\s+(?:the\s+)?$|\b(?:enforce|assert)\w*\s+(?:our\s+|its\s+|the\s+)?patents?\b[^.;]{0,80}\bagainst\s+(?:the\s+)?$/i.test(before(c)))) return null;
  // "Companies such as Microsoft, Sony and Nintendo compete directly with us".
  if (company.some((c) => /^(?:'s)?,?[^.;]{0,120}?\bcompete[sd]?\s+(?:directly\s+|primarily\s+|principally\s+|head-to-head\s+)?(?:with|against)\s+(?:us|the Company)\b/i.test(s.slice(c.end)) && !HEDGED_COMPETITION.test(s))) return { role: 'competitor' };
  // A jointly owned company: "We hold a 50% membership interest in ULA, with The Boeing Company holding the other 50%".
  if (company.some((c) => /\b(?:membership|ownership|equity|partnership) interests? in\b[^.;]{0,80}\bwith\s+(?:the\s+)?$/i.test(before(c)) && /^[^.;]{0,40}\bholding\b/i.test(s.slice(c.end)))) return { role: 'partner' };
  // Data center space or power licensed to the company is capacity sold to it, not a licence.
  if (company.some((c) => /\b(?:facilit\w*|capacity|space|MW|megawatts?|data cent\w*|campus\w*|sites?|buildings?|propert\w*|premises)\b[^.;]{0,80}\blicensed to\s+(?:the\s+)?$/i.test(before(c)))) return { role: 'supplier' };

  // "The contributions to revenue of the products, in 2024 and 2025, respectively, are as follows: Oracle PeopleSoft HCM/
  // Oracle PeopleSoft Financials, 78.9% and 70.5%; Dayforce HCM, 0.2% and 0.1%; ..." (Black Titan's 20-F): the products
  // of the target the filer sells, with the latest year's share.
  const listed = productListShare(s, pattern);
  if (listed) return { role: 'customer', share: listed.share, basis: 'their-product-sales' };

  // Shares: a run of percentages "of our revenues" or "of our purchases" with a verb that gives it to someone; of
  // several, the one nearest the target's name ("39% ... were to Airbus ... and 13% ... were to Boeing").
  const allRuns = percentRuns(s);
  // "Royalties from properties operated by Exxon", "operators Diversified, Denbury (ExxonMobil) and Foundation each
  // accounted for more than 10%": an operator remits the owners' share of production; it does not buy from them.
  if (company.length && (MINERAL.test(s) || /\broyalt/i.test(s)) && /\b(?:operated by|operators?|operating partners?)\b/i.test(s) && /\d\s*(?:%|percent)/i.test(s)) return null;
  const stated = VERB.test(s) || /\b(?:sales|revenues?) (?:to|from)\b/i.test(s);
  const pairRun = stated ? yearPairRun(s) : null;
  const shareRuns = pairRun
    ? [{ run: pairRun.run, revenue: !pairRun.purchases, purchases: pairRun.purchases, segment: false }]
    : stated
      ? allRuns
          // A range ("provinces that represent 30% to 40% of the sales") is no one company's share.
          .filter((run) => !/\d\s*(?:%|percent)?\s*(?:to|-|–|—)\s*$/i.test(s.slice(Math.max(0, run[0].index - 14), run[0].index)) && !/^\s*(?:to|-|–|—)\s*\d/.test(s.slice(run[run.length - 1].end, run[run.length - 1].end + 14)))
          .map((run) => {
            const tail = s.slice(run[run.length - 1].end, run[run.length - 1].end + 140);
            // "of the sales of Elunate": the sales of a product, not of the filer.
            const rev = OF_REVENUE.exec(tail);
            const owner = rev ? /^\s+of\s+(?:the\s+)?(?!(?:Company|Group|Registrant|Partnership)\b)([A-Z][^.;,]{0,40})/.exec(tail.slice(rev[0].length)) : null;
            const revenue = !!rev && (!owner || byFiler(owner[1]));
            return { run, revenue, purchases: !revenue && OF_PURCHASES.test(tail), segment: revenue && !companyRevenue(tail) };
          })
          .filter((x) => x.revenue || x.purchases)
      : [];
  // "77% of net revenues, of which Amazon accounted for approximately 56%, Costco ... 11%": the breakdown's figures
  // have the total's basis.
  const ofWhich = s.search(/\bof which\b/i);
  const total = shareRuns.find((x) => x.run[0].index < ofWhich);
  if (ofWhich >= 0 && total) for (const run of allRuns) if (run[0].index > ofWhich && !shareRuns.some((x) => x.run === run)) shareRuns.push({ run, revenue: total.revenue, purchases: total.purchases, segment: total.segment });
  // "Platform providers, such as Apple, ... charge ... fees, which represent approximately 30% of our revenue": the
  // filer pays the company; the figure is its fees, not sales to it.
  if (company.some((c) => /^[^.;]{0,80}?\b(?:charges?|charged|collects?|collected|retains?|withholds?)\b[^.;]{0,60}\b(?:fees?|commissions?)\b/i.test(s.slice(c.end)))) return { role: 'customer' };
  const anchor = company.length ? company : ms;
  const FORM = String.raw`(?:,?\s+(?:Inc|Corp|Corporation|Co|Company|Ltd|LLC|L\.P|LP|plc)\.?)?`;
  const GIVES = String.raw`(?:account(?:ed|s)? for|represent(?:ed|s)?|contribut(?:ed|es)|compris(?:ed|es)|constitut(?:ed|es)|generated|made up)\s+(?:approximately\s+|about\s+|roughly\s+|over\s+|more than\s+|less than\s+)?`;
  // The run the target's name goes with: "Costco accounted for approximately 11%" (name, verb, figure), "13% ... were
  // to Boeing" or "21% ... from products purchased from Apple Inc." (figure, then the name), "Exxon Mobil Corp (13%,
  // 15% and 16%, respectively)" (the figures beside the name); else the nearest.
  const tiedTo = (c: Mention, run: Pct[]) =>
    (c.end <= run[0].index && new RegExp(String.raw`^(?:'s)?${FORM}(?:\s*\([^)]*\))?,?\s+(?:\w+\s+){0,2}?${GIVES}$`, 'i').test(s.slice(c.end, run[0].index))) ||
    (c.end <= run[0].index && new RegExp(String.raw`^(?:'s)?${FORM}\s*\(\s*$`, 'i').test(s.slice(c.end, run[0].index))) ||
    (c.index >= run[run.length - 1].end && /^[^.;%]{0,90}\b(?:were|was) to\s+(?:the\s+)?$/i.test(s.slice(run[run.length - 1].end, c.index))) ||
    (c.index >= run[run.length - 1].end && /^[^%;]{0,200}?\bfrom\s+(?:(?:products?|sales)\s+(?:purchased|sourced|bought)\s+from\s+|sales of\s+)?(?:the\s+)?$/i.test(s.slice(run[run.length - 1].end, c.index)));
  const tied = (run: Pct[]) => anchor.some((c) => tiedTo(c, run));
  // A run another company's name goes with is that company's: "General Motors accounted for approximately 25%, ... and
  // Ford accounted for approximately 6%", "... 9% ... from products purchased from HP Inc.".
  const notTarget = (name?: string) => {
    if (!name || /^(?:The|Our|We|Sales|Revenue|Revenues|Net|Customer [A-Z]|No|One|Two|Three|Each|In|For|During|Additionally|Approximately)\b/.test(name)) return false;
    pattern.lastIndex = 0;
    return !pattern.test(name);
  };
  const others = (run: Pct[]) => {
    if (tied(run)) return false;
    const tail = /^[^%;]{0,200}?\bfrom\s+(?:(?:products?|sales)\s+(?:purchased|sourced|bought)\s+from\s+)(?:the\s+)?([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/.exec(s.slice(run[run.length - 1].end));
    if (notTarget(tail?.[1])) return true;
    // The subject before the verb: when it lists the target too ("General Motors, Ford Motor Company and Stellantis
    // accounted for 27%, 21% and 16%, respectively"; "Walmart, Costco and Amazon accounted for 74%"), the run is not
    // another company's alone.
    const prev = allRuns.filter((r) => r[r.length - 1].end <= run[0].index).pop();
    const subject = s.slice(prev ? prev[prev.length - 1].end : 0, run[0].index);
    // "SAP reported that support revenue represented approximately 33% of its total revenue" (Rimini Street's 10-K): a
    // figure another company reported of itself, the target included, is no share of the filer's.
    if (/\b(?!(?:We|Our|It|They|The Company|The Group)\b)[A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,3}\s+(?:has\s+|had\s+)?(?:publicly\s+)?(?:reported|disclosed|announced|stated)\s+(?:that\s+)?[^.;%]{0,120}$/.test(subject)) return true;
    pattern.lastIndex = 0;
    if (pattern.test(subject)) return false;
    const lead = new RegExp(String.raw`([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})${FORM}(?:\s*\([^)]*\))?,?\s+(?:\w+\s+){0,2}?${GIVES}$`).exec(subject.slice(-160));
    return notTarget(lead?.[1]);
  };
  // A figure written beside the target's name without the basis repeated ("and Ford accounted for approximately 6%,
  // 17% and 6%, respectively") has the basis of the figures before it.
  for (const run of allRuns) {
    if (shareRuns.some((x) => x.run === run) || !tied(run)) continue;
    const base = shareRuns.find((x) => x.run[0].index < run[0].index);
    if (base) shareRuns.push({ run, revenue: base.revenue, purchases: base.purchases, segment: base.segment });
  }
  for (let i = shareRuns.length - 1; i >= 0; i--) if (others(shareRuns[i].run)) shareRuns.splice(i, 1);
  const gap = (run: Pct[]) => (tied(run) ? -1 : Math.min(...anchor.map((c) => (c.index >= run[run.length - 1].end ? c.index - run[run.length - 1].end : c.end <= run[0].index ? run[0].index - c.end : 0))));
  shareRuns.sort((a, b) => gap(a.run) - gap(b.run));
  for (const { run, purchases, segment } of shareRuns.slice(0, 1)) {
    const found = shareOf(s, run, pattern);
    // A segment's figure ("9.2% of net sales for our Sun and Skin Care segment") is no share of the company's sales.
    let share = segment ? undefined : found.value;
    let qualifier = segment ? undefined : qualifierOf(s, run);
    // A figure for a group ("our five largest customers ... 80.6%", "our top 10 customers, including Boeing and RTX,
    // were 61%", "three branded suppliers ... collectively") is not the target's, unless the run gives each its own.
    const prev = allRuns.filter((r) => r[r.length - 1].end <= run[0].index).pop();
    const clause = s.slice(prev ? prev[prev.length - 1].end : 0, run[0].index);
    const near = s.slice(Math.max(0, run[0].index - 60), run[run.length - 1].end + 60).replace(/\(collectively[^)]*\)/gi, ' ');
    // "Our largest customers, Walmart, Costco and Amazon, accounted for approximately 74.0%": one figure for the companies
    // named before the verb together.
    const verbAt = [...clause.matchAll(new RegExp(VERB.source, 'gi'))].pop()?.index ?? -1;
    const subjectList = run.length === 1 && verbAt > 0 ? subjectNames(clause.slice(0, verbAt).replace(/^.*[.;:]\s+/, '')) : [];
    const several = subjectList.length > 1 && subjectList.some((n) => {
      pattern.lastIndex = 0;
      return pattern.test(n);
    });
    // "Walmart and its affiliates ... accounted for": one company with its own units, unless others are named with it.
    const together = GROUP.test(clause) || /\bcollectively\b|\btogether\b|\bcombined\b|\baltogether\b/i.test(near) || /\b(?:collectively|together|combined|altogether)\b/i.test(clause);
    if (found.how !== 'company' && !/\beach\b/i.test(clause) && (several || (together && !/\b(?:and|with) (?:its|their) (?:affiliates|subsidiaries)\b/i.test(clause)))) {
      share = undefined;
      qualifier = undefined;
    }
    // "13% ... were to Boeing and its related subcontractors": the figure covers other companies too. "Ford and Stellantis
    // were the only customers accounting for 10% or more ... in one or more of the past three years": no year's figure.
    const p0 = pattern.source;
    if (new RegExp(String.raw`(?:${p0})(?:'s)?,?\s+and (?:its|their) (?:related\s+)?(?:subcontractors|suppliers|customers|partners|licensees|distributors)\b`).test(s) || /\bin (?:one or more|any|either|each) of the (?:past|last|prior|preceding) (?:two|three|four|five|\d) (?:fiscal )?years\b/i.test(s)) {
      share = undefined;
      qualifier = undefined;
    }
    const p = pattern.source;
    // A reseller of the target's products ("Ingram Micro: Apple products 21% of sales"); a supplier or vendor named with
    // a share of sales is a brand the filer sells; "5,759 Apple units sold accounted for approximately 41% of the annual
    // revenue" (Signing Day Sports, in AIB Data Centers' 8-K/A of May 2026) is what it sold through the target's store,
    // not revenue from the target. Used devices bought elsewhere are no purchase from the target.
    if (/\b(?:pre-owned|refurbished|used|second-hand)\b/i.test(s)) return null;
    // "Revenue related to providing services for Oracle PeopleSoft products accounted for approximately 3%" (Rimini
    // Street, which supports Oracle's software in Oracle's place): servicing a company's products sells nothing of it
    // and buys nothing from it.
    if (new RegExp(String.raw`\b(?:services?|support|maintenance)\s+(?:services\s+)?for\s+(?:the\s+)?(?:${p})(?:'s|’s)?\s+(?:[A-Z][\w-]*\s+){0,4}(?:products?|software|applications?|systems?|platforms?)\b`).test(s)) return null;
    const distributor =
      new RegExp(`(?:products?|solutions?|offerings?)\\s+(?:purchased\\s+|sourced\\s+|bought\\s+)?from\\s+(?:[^.]{0,40}?)(?:${p})|sales of (?:${p})(?:'s)?\\s+(?:[A-Za-z.,-]+\\s+){0,3}?products|(?:${p})(?:\\s+(?:Corporation|Corp\\.?|Inc\\.?|Company))?(?:'s|’s)?\\s+(?:branded\\s+)?(?:[A-Z][\\w-]*\\s+){0,4}(?:and\\s+(?:[A-Z][\\w-]*\\s+){1,4})?products|(?:${p})\\s+(?:units?|devices?|items?|subscriptions?)\\s+(?:sold|shipped|delivered)`).test(s) ||
      /\b(?:suppliers?|vendors?|brands?|branded)\b/i.test(clause) ||
      // "Sales of product from our top five manufacturers/publishers as a group (Microsoft, Dell, ...)".
      /\b(?:products?|sales)\b[^.;]{0,40}\bfrom\s+(?:our|its|the)\s+(?:[\w-]+\s+){0,3}(?:manufacturers?|publishers?)\b/i.test(clause);
    if (purchases) return { role: 'customer', share, qualifier, basis: 'their-purchases' };
    if (distributor) return { role: 'customer', share, qualifier, basis: 'their-product-sales' };
    if (company.length) return { role: 'supplier', share, qualifier, basis: 'their-revenue' };
  }

  // "the Credit Agreement ... among Alliance Laundry Systems LLC, the lenders from time to time party thereto, Bank of
  // America, N.A., as administrative agent": the target leads the filer's lenders.
  // Also "Bank of America, N.A. ("Bank of America"), as administrative agent", "as Domestic Administrative Agent", "as
  // lender", "Bank of America, N.A., U.S. Bank National Association and the other lenders party thereto". Not a bank
  // leaving the facility ("Exiting Lenders").
  const leadsLenders = (c: Mention) =>
    LENDER_AFTER.test(s.slice(c.end)) || /^(?:'s)?(?:,?\s+N\.\s?A\.)?(?:\s*\([^)]*\))?(?:,\s+[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,5}(?:,\s*N\.\s?A\.)?){0,4},?\s+and\s+(?:the\s+)?other lenders\b/.test(s.slice(c.end));
  // "we obtained from JPMorgan Chase our $5.00 million cash collateralized JPMorgan Chase Credit Facility" (Charles &
  // Colvard): borrowed, not bought.
  if (company.some((c) => /\b(?:obtained|borrowed|secured|drew|draws?)\b[^.;]{0,30}\bfrom\s+(?:the\s+)?$/i.test(before(c))) && /\b(?:credit facilit(?:y|ies)|line of credit|loans?|borrowings?|revolving)\b/i.test(s) && byFiler(s)) return { role: 'lender' };
  if (company.some(leadsLenders) && /\b(?:credit|loans?|revolving|financing|facilit(?:y|ies)|lenders?)\b/i.test(s) && !/\b(?:Exiting|Departing|Non-Extending) Lenders?\b/i.test(s) && (byFiler(s) || /\bas\s+(?:the\s+)?(?:parent\s+)?borrowers?\b|\bthe Borrower\b|\b(?:our|its|the Company's)\s+(?:wholly[- ]owned\s+)?subsidiar/i.test(s))) return { role: 'lender' };
  // Licences, royalties and research collaborations with the target. Not a bank whose published rates or quotes a
  // licence refers to ("In the event that the Bank of America ... ceases to publish currency quotes, Licensee will use").
  const rateSource = (c: Mention) => /^(?:'s)?(?:\s*\([^)]*\))?[^.;]{0,30}\b(?:ceases? to publish|publish(?:es|ed)?|quot(?:es|ed))\b/i.test(s.slice(c.end)) || /\b(?:published|quoted|announced|reported)\s+by\s+(?:the\s+)?$/i.test(before(c));
  if (company.length && LICENSING.test(s) && !MINERAL.test(s) && !company.every(rateSource)) return { role: 'partner' };
  if (company.length && MINERAL.test(s) && /\broyalt/i.test(s)) return null;

  // The filer holds a stake in the target ("our investment in Applied Digital", "our largest holdings were Apple"),
  // or lends to it ("we provided a $50 million term loan to Applied Digital").
  if (company.some((c) => /\b(?:[Ww]e|[Oo]ur|[Ii]ts|[Tt]he Company's|[Tt]he Fund's)\b[^.;]{0,60}\b(?:investments?|invested|stake|equity interest|ownership interest|position)\s+(?:of\s+[^.;]{0,30}\s+)?in\s+(?:the\s+)?$/.test(before(c)))) return { role: 'investor' };
  if (company.some((c) => /\b(?:[Oo]ur|[Ii]ts)\b[^.;]{0,60}\b(?:holdings?|positions|equity portfolio|common stock portfolio)\b[^.;]{0,80}\b(?:were|was|are|is|include|included|including|such as)\b[^.;]{0,60}$/.test(before(c)))) return { role: 'investor' };
  if (company.some((c) => /\b(?:[Oo]ur|[Ii]ts|[Tt]he Company's|[Tt]he Fund's)\s+(?:holdings? (?:of|in)\s+|shares (?:of|in)\s+|position in\s+)?$/.test(before(c)) && /^(?:'s)?(?:,?\s+(?:Inc|Corp|Corporation|Co)\.?)?\s*(?:\("?[A-Z]{1,5}"?\)\s*)?(?:class [A-C]\s+)?(?:common stock|common shares|shares|stock|warrants|preferred)\b/i.test(s.slice(c.end)))) return { role: 'investor' };
  if (company.some((c) => /\b(?:loans?|term loan|credit facilit(?:y|ies)|bridge facility|notes|debt financing|financing)\b[^.;]{0,60}\b(?:to|for)\s+$/i.test(before(c)) && /\b(?:provided|extended|made|funded|lent|committed|originated)\b/i.test(before(c)) && byFiler(s))) return { role: 'lender' };
  // A stake the target took in the filer: it invested in, bought or holds the filer's shares, or the filer issued
  // them to it.
  const issuedTo = (c: Mention) => /\b(?:issued|sold)\s+to\s+(?:the\s+)?$/i.test(before(c)) && /^(?:'s)?,?\s+(?:an?\s+(?:additional\s+)?(?:aggregate\s+of\s+)?)?(?:[\d,.]+\s+)?(?:[\w-]+\s+){0,2}?(?:shares|units|stock|common|preferred|ordinary)\b/i.test(s.slice(c.end));
  // "issued to Micron a senior subordinated convertible promissory note", "the convertible note that we issued to Eli
  // Lilly": the company lent to the filer.
  if (company.some((c) => (/\b(?:issued|sold)\s+to\s+(?:the\s+)?$/i.test(before(c)) && /^(?:'s)?,?\s+(?:an?\s+)?(?:[\w$,.-]+\s+){0,5}?(?:notes?|debentures?|bonds?)\b/i.test(s.slice(c.end))) || /\b(?:notes?|debentures?)\s+(?:that\s+)?(?:we|the Company)\s+issued\s+to\s+(?:the\s+)?$/i.test(before(c))) && byFiler(s)) return { role: 'lender' };
  if (company.some((c) => INVEST_AFTER.test(s.slice(c.end)) || INVEST_BEFORE.test(before(c)) || issuedTo(c))) return byFiler(s) ? { role: 'investment' } : null;

  // Competitors the filer names: "our competitors include ... NVIDIA", "we compete with Apple", "Apple, Dell and HP are
  // our main competitors". A hedge ("may compete", "companies like") is no statement.
  const plain = s.replace(COMPETITION_NOISE, ' ');
  if (company.length && /\bcompet/i.test(plain) && !HEDGED_COMPETITION.test(plain)) {
    const own = /\b(?:[Ww]e|[Oo]ur|[Uu]s|[Tt]he Company(?:'s)?|[Tt]he Group(?:'s)?)\b/;
    const comp = /\b(?:competitors?|compete[sd]?|competing|competition|competitive landscape|competitive environment)\b/gi;
    for (let m = comp.exec(plain); m; m = comp.exec(plain)) {
      const at = m.index + m[0].length;
      const lead = plain.slice(Math.max(0, m.index - 80), m.index);
      if (!own.test(lead) && !byFiler(lead) && !/^\s+(?:with|against)\s+us\b|^\s+(?:of|to|for)\s+(?:our|the Company's)\b/i.test(plain.slice(at, at + 24))) continue;
      if (/\bcompeting (?:\w+\s+)?brands\b/i.test(plain)) continue;
      // What the filer competes for is no rival: "we compete with ... companies for ... customers, orders from Home Depot
      // and Lowe's" (American Woodmark's 10-K of June 2025).
      const sought = (c: Mention) => /\b(?:orders?|business|sales|shelf space|placement|contracts?|programs?|awards?)\s+(?:from|with|at|to|of)\s+(?:the\s+)?$/i.test(plain.slice(Math.max(0, c.index - 40), c.index));
      if (company.some((c) => !sought(c) && c.index > m!.index && (c.index - m!.index < 260 || (c.index - at < 1200 && /\b(?:include|includes|including|such as|are|:)\b/i.test(plain.slice(at, at + 80)))))) return { role: 'competitor' };
    }
    if (company.some((c) => /^[^.]{0,250}?\b(?:is|are|as|remains?|were|was)\s+(?:one of\s+)?(?:our|the Company's)\s+(?:\w+\s+){0,3}competitors?\b/i.test(plain.slice(c.end)))) return { role: 'competitor' };
  }
  // Competition talk that is not the filer's ("fierce competition from major GPU vendors such as AMD") is no relation.
  if (company.some((c) => /\b(?:competitors?|compet(?:e|es|ed|ing|ition))\b/i.test(plain.slice(Math.max(0, c.index - 160), c.index)))) return null;
  if (LITIGATION.test(s) || /\b(?:prosecut\w*|intellectual property|disputes?|proceedings?|arbitration)\b/i.test(s)) return null;

  // A joint venture or jointly owned company with the target is a partnership; a property leased to it makes the filer
  // its landlord, a supplier.
  if (company.some((c) => /\bleas(?:ed|es|ing)\b[^.;]{0,80}\bto\s+(?:the\s+)?$/i.test(before(c)))) return { role: 'supplier' };
  if (company.some((c) => /\b(?:joint venture|jointly owned|JV)\b[^.;]{0,100}$/i.test(before(c)) && !/\bbetween\b[^.;]{0,100}$/i.test(before(c))) && byFiler(s)) return { role: 'partner' };

  // The target buying from its own suppliers ("NVIDIA relies on suppliers such as TSMC") says nothing of the filer, nor
  // does a third company's relation ("Pegatron's customers include Tesla").
  if (company.some((c) => /^(?:'s)?\s+(?:\w+\s+){0,2}?(?:relies|depends|uses|utilizes|sources|purchases|buys|procures|engages|outsources)\b/i.test(s.slice(c.end)))) return null;
  const third = (b: string) => {
    const m = OTHER_POSSESSIVE.exec(b);
    if (!m) return false;
    pattern.lastIndex = 0;
    if (pattern.test(m[1])) return false;
    return !byFiler(m[0].slice(0, m[1].length + 2));
  };

  const named = ms.filter((m) => !m.product || m.goods);
  for (const m of company) {
    if (after(s, m, /^(?:'s)?[^.;]{0,60}\b(?:manufactures?|produces?|distributes?|supplies|provides|fills?|packages?)\b[^.;]{0,80}\bon (?:our|its) behalf\b/i)) return { role: 'customer' };
    if (after(s, m, /^(?:'s)?[^.;]{0,30}\b(?:has |have )?(?:committed|agreed) to\b[^.;]{0,80}\b(?:manufacture|produce|build|supply|provide|deliver|fabricate)\b[^.;]{0,60}\bfor\b/i)) return { role: 'customer' };
    if (after(s, m, /^(?:'s)?,\s+(?:our|the Company's)\s+(?:[\w-]+\s+){0,2}partner\b[^,]{0,50},\s+(?:is|are|will be|has been)\s+\w+ing\b/i)) return { role: 'customer' };
    if (/\bdeliver\w*\s+(?:[\w-]+\s+){0,3}to\s+(?:the\s+)?$/i.test(before(m)) && after(s, m, /^(?:'s)?[^.;]{0,30}\bfor\s+(?:[\w-]+\s+){0,2}?(?:capture|transport\w*|storage|disposal|processing|treatment|recycling|sequestration)\b/i)) return { role: 'customer' };
  }
  for (const m of ms.filter((x) => !x.product || x.goods)) {
    const b = before(m);
    if (/\b(?:deploy|deploying|deployed|adopt|adopting|adopted|implement\w*|integrat\w*|install\w*|purchas\w*|buy\w*|procur\w*)\s+(?:the\s+)?(?:latest\s+|new\s+|next-generation\s+)?$/i.test(b) && /\b(?:[Ww]e|[Oo]ur|[Tt]he Company)\b/.test(b.slice(-200)) && !/\b(?:customers?|clients?|users?|partners?)\b[^.;]{0,40}$/i.test(b) && (m.product || m.goods || after(s, m, /^(?:'s)?\s+(?:[A-Z][\w-]*\s+){0,2}(?:platforms?|GPUs?|chips?|systems?|products?|servers?|accelerators?|software|solutions?|technology)\b/))) return { role: 'customer' };
    if (/\b(?:deliver(?:y|ies) (?:of|from)|on order (?:from|with)|orders? (?:placed )?with)\s+(?:the\s+)?(?:new\s+)?$/i.test(b)) {
      // "a new order with Home Depot to distribute three high performance products through its on-line platform" (Axil
      // Brands, April 2026): the target sells the filer's products, which makes the filer its supplier.
      return after(s, m, /^(?:'s)?,?\s+(?:to|which will|that will|who will)\s+(?:distribute|sell|carry|stock|offer|resell|retail)\b/i) ? { role: 'supplier' } : { role: 'customer' };
    }
    if (gapListy(b, /\bunder\s+(?:various\s+|the\s+|multiple\s+|several\s+)?brands?,?\s+(?:including|such as)\b([^.;]*)$/i) || after(s, m, /^\s+brand(?:ed)?\s+(?:fuel|gasoline|stations?|stores?)\b/i)) return { role: 'customer' };
    if (after(s, m, /^(?:'s)?[^.;]{0,40}\b(?:has |have )?(?:committed|agreed) to (?:pay|purchase)\b[^.;]{0,40}\b(?:us|the (?:Company|Group))\b/i)) return { role: 'supplier' };
  }
  // A plan or a hope is no relation yet.
  if (company.length && company.every((c) => INTENT.test(before(c).slice(-80)))) return null;
  for (const m of named) {
    const b = before(m);
    if (third(b)) return null;
    if (after(s, m, /^(?:'s)?\s+(?:has\s+)?(?:recogni[sz]e[sd]?|selected|named|chose|chosen|designated)\s+(?:[A-Z][\w&.-]*\s+|us\s+|the Company\s+){1,3}as\s+(?:its|our|a|the|their)\s+(?:[\w-]+\s+){0,3}(?:provider|supplier|vendor|source|manufacturer)\b/i)) return { role: 'supplier' };
    // The filer as the target's customer: "a launch customer for Boeing", "one of the largest customers of Airbus and
    // Boeing".
    if (/\bcustomers?\s+(?:of|for)\s+(?:the\s+)?(?:[A-Z][\w&.-]*,?\s+(?:and\s+)?){0,3}$/.test(b) && !/\b(?:our|its)\s+(?:\w+\s+){0,2}customers?\s+(?:of|for)/i.test(b) && !/\b(?:engage|identify|pursue|serve|find|win|acquire|target|attract|reach|enterprise)\b[^.;]{0,40}\bcustomers?\s+(?:of|for)\s+[^.;]{0,40}$/i.test(b)) return { role: 'customer' };
    // Lists that mix kinds or describe an ecosystem name no role: "growing with customers and partners including OpenAI,
    // AWS, AMD", "closer business coordination with key AI platform providers including AMD".
    if (gapListy(b, /\b(?:customers and partners|partners and customers)\b[^.;]{0,30}?\b(?:include|includes|including|such as|like)\b([^.;]*)$/i) || gapListy(b, /\b(?:coordination|ecosystem|alignment|engagement)\b[^.;]{0,80}?\b(?:including|such as|like)\b([^.;]*)$/i)) return null;
    // "being deployed by leading cloud providers including Oracle": the filer's products are the target's.
    if (gapListy(b, /\b(?:deployed|adopted|purchased|bought) by\s+(?:(?:[\w-]+\s+){0,5}?(?:including|such as|like)\s+)?([^.;]{0,60})$/i) && /\b(?:[Oo]ur|[Ww]e)\b/.test(b.slice(-140))) return { role: 'supplier' };
    // "a supplier of mission critical systems to major OEMs including Boeing": the filer supplies the target.
    if (/\b(?:suppliers?|vendors?|providers?)\s+(?:of\s+[^.;]{0,80}\s)?to\s+(?!(?:obtain|be|meet|provide|deliver|supply|procure|purchase|buy|secure|use|support|make|build|continue|maintain|ensure|grow|expand|achieve|sell|serve|acquire|access|develop|produce|manufacture)\b)(?:[\w-]+\s+){0,6}?(?:including\s+|such as\s+|both\s+)?(?:[A-Z][\w&.-]*,?\s+(?:and\s+)?){0,3}$/i.test(b)) return { role: 'supplier' };
    // Partner words with a role: retailers and resellers sell the filer's goods; supplier, vendor and manufacturing
    // partners make or sell goods for it.
    if (
      gapListy(b, /\b(?:retail(?:er)?s?(?!\s+publishers?)|retail partners?|channel partners?|distribution partners?|resellers?|distributors?)\b[^.;]{0,60}?\b(?:include|includes|including|such as|like|namely|are|e\.g\.,?)\b([^.;]*)$/i) &&
      byFiler(b.slice(-220)) &&
      // Case matters: "targeting retailers" is a plan, "Target" a retailer.
      !/\b(?:[Ff]ocus(?:ed)? on|[Tt]argeting|targets?|targeted|[Pp]ursu\w+|[Ss]eek\w*|[Aa]im\w*|[Cc]ompet\w*)\b[^.;]{0,120}$/.test(b)
    )
      return { role: 'supplier' };
    if (gapListy(b, /\b(?:supplier|supply|fuel supply|sourcing|vendor|manufacturing|foundry|silicon|hardware|component) partners?\b(?:[^.;]{0,60}?\b(?:include|includes|including|such as|like|namely|are|e\.g\.,?)\b)?([^.;]*)$/i)) return { role: 'customer' };
    // A reseller: "we offer ... products from vendors like Apple, Cisco ... and Microsoft Corporation".
    if (gapListy(b, /\bproducts?\s+(?:[\w-]+\s+){0,2}from\s+(?:(?:vendors?|suppliers?|manufacturers?|brands?|OEMs?)\s+(?:like|such as|including)\s+)([^;]*)$/i) && byFiler(b)) return { role: 'customer' };
  }
  // The filer buys from the target: its supplier, vendor, provider or sole source; it relies on it for supply, sources
  // from it. Depending on sales to the target, or on its success, is selling to it.
  for (const m of named) {
    const b = before(m);
    const dependence = /\b(?:rely|relies|relying|depend|depends|depending|dependent|reliant)\b[^.;]{0,40}\bon\b([^.;]{0,120})$/i.exec(b);
    const reason = s.slice(m.end, m.end + 90);
    const goodsReason = /^[^.;]{0,30}\b(?:for|to supply|to provide|to manufacture|to assemble|to produce|to build|to make|to fabricate)\b[^.;]{0,60}\b(?:supply|supplies|components?|chips?|GPUs?|CPUs?|processors?|wafers?|products?|materials?|hardware|equipment|parts|manufactur\w*|fabrication|capacity|services?|power|engines?|inventory|concentrate|bottl\w*|license|technology|software|servers?|memory|platforms?)\b/.test(reason);
    if (dependence && /^[^.;]{0,30}\bfor (?:the )?(?:successful )?(?:commerciali[sz]ation|development|marketing|co-promotion)\b/i.test(reason)) return { role: 'partner' };
    if (dependence && !goodsReason && (/\b(?:customers?|sales to|revenues? from|business (?:with|from)|success of|demand (?:for|from)|orders? from)\b/i.test(dependence[1]) || /^[^.;]{0,30}\bfor\s+(?:(?:a\s+)?(?:significant|substantial|large|majority|major|material)\s+(?:portion|share|part|amount)\s+of\s+)?(?:our|its|the Company's)\s+(?:[\w-]+\s+){0,2}?(?:success|revenues?|sales|business|demand|growth)\b/i.test(reason))) return { role: 'supplier' };
    const forGoods = goodsReason || /\b(?:supply|supplies|components?|chips?|GPUs?|wafers?|products?|materials?|hardware|equipment|parts|bottler|(?:contract )?manufacturers?|assemblers?|foundr(?:y|ies)|suppliers?|vendors?)\b/i.test(dependence?.[1] ?? '');
    if (
      (gapListy(b, /\b(?:suppliers?|vendors?|providers?|platforms?)\b[^.;]{0,80}?\b(?:include|includes|including|such as|like|namely|notably|primarily|e\.g\.,?|are|is)\b([^.;]*)$/i) &&
        // "a single source supplier"; not "a single ERP software vendor like SAP or Oracle" (Rimini Street's 10-K, on
        // what businesses buy).
        (/\b(?:[Oo]ur|[Ww]e|[Uu]s|[Tt]he Company(?:'s)?|key|principal|primary|main|largest|major|critical|sole|limited)\b[^.;]{0,50}\b(?:suppliers?|vendors?|providers?|platforms?)\b/.test(b) || /\bsingle[- ](?:source[ds]?[- ])?(?:suppliers?|vendors?|providers?)\b/i.test(b)) &&
        !/\b(?:alternative|work(?:s|ing)? with|partner\w*|coordinat\w*|ecosystem|align\w*)\b[^.;]{0,60}\b(?:suppliers?|vendors?|providers?|platforms?)\b/i.test(b) && !third(b)) ||
      /\b(?:sole|single|limited)[- ](?:source|sourced|supplier|vendor)s?\b[^.;]{0,150}$/i.test(b) ||
      (dependence && forGoods && /\b(?:[Ww]e|[Oo]ur|[Tt]he Company|[Ii]t)\b/.test(b.slice(-120))) ||
      (gapListy(b, /\b(?:purchase[sd]?|purchasing|source[sd]?|sourcing|procure[sd]?|procuring|buy|buys|bought|obtain(?:ed|s)?)\b[^.;]{0,100}\bfrom\s+([^.;]{0,50})$/i) && !/\b(?:orders?|revenues?|royalt\w*|payments?|received)\b[^.;]{0,40}\bfrom\s+[^.;]{0,50}$/i.test(b) && !/\b(?:shares?|stock|securities|warrants?|units|interests?|stake|assets?|business|propert(?:y|ies)|land|rights|acreage|leases?)\b[^.;]{0,80}\bfrom\s+[^.;]{0,50}$/i.test(b)) ||
      (gapListy(b, /\b(?:supplied|produced|manufactured|fabricated) by\s+([^.;]{0,40})$/i) && /\b(?:[Oo]ur|[Ww]e)\b/.test(b.slice(-90))) ||
      /\b(?:our|the)\s+use of\s+$/i.test(b) ||
      (after(s, m, /^(?:'s)?,?[^.;]{0,60}\bas (?:a|an|our|the|its) (?:\w+\s+){0,2}(?:supplier|vendor|source|provider)\b/i) && !after(s, m, /^(?:'s)?,?[^.;]{0,60}\b(?:our|us|we|the Company)\b[^.;]{0,30}\bas (?:a|an|our|the|its) /i)) ||
      after(s, m, /^(?:'s)?,?\s+(?:is|was|remains|has been) (?:our|a|the|an) (?:\w+\s+){0,3}(?:supplier|vendor|source)\b/i) ||
      after(s, m, /^(?:Corporation|Corp\.?|Inc\.?)?,\s+(?:our|the Company's) (?:[\w-]+\s+){0,6}?(?:supplier|vendor|provider|manufacturer|foundry)\b/i) ||
      // "a Volume Supply Agreement with Fabrinet, a leading electronics manufacturing services provider".
      (after(s, m, /^(?:Corporation|Corp\.?|Inc\.?)?,\s+(?:a|an) (?:[\w-]+\s+){0,6}?(?:supplier|vendor|provider|manufacturer|foundry)\b/i) && /\b(?:agreements?|contracts?|arrangements?|commitments?|entered into|signed|engaged)\b(?:[^.;]|\.(?=\d)){0,200}\bwith\s+(?:the\s+)?$/i.test(b) && !/\bcustomers?,?\s*$/i.test(b)) ||
      after(s, m, /^(?:'s)?,?\s+(?:our|the Company's) (?:largest |principal |main |key )?(?:supplier|vendor)\b/i)
    )
      return { role: 'customer' };
  }
  // The filer sells to the target: a customer, an end customer, "the Customer"; it builds, manufactures or powers
  // something for it, or received its order.
  for (const m of company) {
    const b = before(m);
    // Equity, assets and notices are no sale: "issue and sell shares to", "sold a 40% interest to", "provide updates to".
    if (/\b(?:sell|sells|sold|selling|issue|issued|transfer\w*|provid\w*|deliver\w*)\b[^.;]{0,100}\b(?:shares?|stock|securities|warrants?|units|interests?|stake|assets?|business|propert(?:y|ies)|land|rights|updates?|reports?|information|notices?|copies|documents?|data|waivers?|guarant\w*)\b[^.;]{0,80}\bto\s+[^.;]{0,30}$/i.test(b)) continue;
    // "until the Issuer has provided to J.P. Morgan, Morgan Stanley and Piper Sandler a written notice" (Heartflow's
    // lock-up letter): the thing provided comes after the names.
    if (/\b(?:provid\w*|deliver\w*|sen[dt]\w*|furnish\w*|giv(?:e|es|en|ing))\s+to\s+(?:the\s+)?$/i.test(b) && after(s, m, /^(?:'s)?(?:,?\s+(?:and\s+)?[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})*,?\s+(?:an?|the|any|such|its|our|their)\s+(?:[\w-]+\s+){0,2}?(?:notices?|copy|copies|updates?|reports?|information|statements?|certificates?|documents?|letters?|consents?|waivers?|requests?)\b/)) continue;
    if (/\b(?:was|were|been|is|are|being)\s+(?:contracted|hired|engaged|retained|commissioned|awarded a contract)\s+by\s+(?:the\s+)?$/i.test(b) && byFiler(b.slice(-160))) return { role: 'supplier' };
    if (after(s, m, /^(?:'s)?\s+(?:has\s+)?(?:recogni[sz]e[sd]?|selected|named|chose|chosen|designated)\s+(?:[A-Z][\w&.-]*\s+|us\s+|the Company\s+){1,3}as\s+(?:its|our|a|the|their)\s+(?:[\w-]+\s+){0,3}(?:provider|supplier|vendor|source|manufacturer)\b/i)) return { role: 'supplier' };
    const forTarget = /\b(?:manufactur\w*|build|builds|built|building|construct\w*|install\w*|assembl\w*|fabricat\w*|produc(?:e|es|ed|ing))\b[^.;]{0,80}?\bfor\s+(?:(?:our|the|its)\s+(?:\w+\s+){0,2}customers?,?\s+)?$/i.test(b) && !/\b(?:solutions?|alternatives?|options?|platforms?|choice|focus|experience|expertise|track record)\b[^.;]{0,60}\bfor\s+[^.;]{0,30}$/i.test(b);
    if (
      (gapListy(b, /\bcustomers?\b(?:[^.;]{0,40}?)\b(?:include|includes|including|such as|like|namely|are|is|was|were)\b([^.;]*)$/i) && !/\bcustomers?\b[^.;]{0,40}?\b(?:can|may|might|choose|chooses|use|uses|rely|prefer|select|want|need|seek)\b[^.;]*$/i.test(b)) ||
      gapListy(b, /\b(?:end|largest|major|key|significant|principal|anchor|top|single) customers?,?\s+([^.;]{0,20})$/i) ||
      /\b(?:purchase )?orders?\s+(?:\w+\s+){0,3}from\s+(?:the\s+)?$/i.test(b) ||
      // "the purchase order received from Esso Nederland B.V. ("Esso"), an affiliate of EMTEC and Exxon Mobil".
      /\borders?\s+(?:received\s+)?from\s+[^;]{0,100}?\b(?:an?\s+)?(?:affiliate|subsidiary) of\s+(?:[^.;]{0,40}\band\s+)?(?:the\s+)?$/i.test(b) ||
      /\b(?:sell|sells|sold|selling|supply|supplies|supplied|supplying|ship|ships|shipped|shipping|provide|provides|provided|providing|deliver|delivers|delivered|license|licenses|licensed)\b[^.;]{0,80}?(?<!similar|compared|relative|due|according|prior|related|subject|access|close|equal|comparable|addition|respect|reference|available|attributable|applicable|exposure)\s+to\s+(?:(?:our|the|its)\s+(?:\w+\s+){0,2}customers?,?\s+)?$/i.test(b) ||
      /\b(?:customer|offtake|sales) (?:agreements?|arrangements?|contracts?) with\s+(?:[^.;]{0,30})$/i.test(b) ||
      // "An electric service agreement to serve an additional 350 MW data center load with Applied Digital".
      /\b(?:agreements?|contracts?|arrangements?)\s+to\s+(?:serve|supply|power)\b[^.;]{0,100}?\bwith\s+(?:[^.;]{0,30})$/i.test(b) ||
      // "began to provide power for Applied Digital's data center", "we manufacture servers for NVIDIA".
      forTarget ||
      /\b(?:provid\w*|suppl\w*|deliver\w*)\s+(?:\w+\s+){0,3}?(?:power|electricity|energy|natural gas|water|capacity|hosting|colocation|cloud (?:services|capacity|computing))\b[^.;]{0,40}?\bfor\s+$/i.test(b) ||
      // A contract to build something for the target: "we entered into a limited notice to proceed with Applied
      // Digital for a project to design and install four power plants".
      (/\b(?:entered into|signed|executed|awarded|received|won|was awarded)\b[^.;]{0,100}?\b(?:agreements?|contracts?|orders?|purchase orders?|notice to proceed|LNTP|awards?|engagement)\b[^.;]{0,60}?\bwith\s+(?:[^.;]{0,30})$/i.test(b) &&
        after(s, m, /^(?:'s)?,?[^.;]{0,40}?\b(?:for (?:a|the) (?:project|contract) to|to)\s+(?:design|build|install|construct|supply|manufacture|engineer|fabricate)\b/i)) ||
      after(s, m, /^[^.;]{0,40}\((?:the|our) "?Customer"?\)/) ||
      after(s, m, /^(?:'s)?,?\s+(?:is|was|remains|has been|became) (?:our|a|the|an) (?:\w+\s+){0,3}customers?\b/i) ||
      after(s, m, /^(?:\s*(?:Technology|Technologies|Corporation|Corp\.?|Inc\.?|Company))*(?:\s*\([^)]*\))?,\s+(?:our|a|the) (?:\w+\s+){0,3}customers?\b(?!\s+of\s+(?!(?:us|ours|the Company)\b))/i) ||
      // "The loss of operating revenues from our BaaS partners and Walmart".
      (/\brevenues?\s+(?:(?:generated|earned|derived)\s+)?(?:from|through)\s+(?:[^.;]{0,60}?\b(?:and|or)\s+)?(?:the\s+)?$/i.test(b) && byFiler(b))
    )
      return { role: 'supplier' };
  }
  // Partnerships the filer is in: "our partnership with NVIDIA", "we collaborate with Apple".
  const partner = /\b(?:partner(?:s|ship|ships|ed|ing)?|collaborat\w*|alliances?|co-develop\w*|joint development|co-engineer\w*|jointly (?:develop|pursue|market|sell)\w*|co-sell\w*)\b/i;
  // The filer's own name is no partnership word: "Alliance Laundry Systems LLC" (Alliance Laundry's S-1).
  // Nor are the legal terms of partnerships: "J.P. Morgan REIT OP Special Limited Partner, L.P." (J.P. Morgan Real
  // Estate Income Trust's 10-K).
  const unnamed = (filer ? s.replace(filer, (x) => ' '.repeat(x.length)) : s).replace(/\b(?:Special\s+)?(?:Limited|General|Managing)\s+Partners?\b|\bOperating Partnership\b|\bPartners?,?\s+L\.?P\b/gi, (x) => ' '.repeat(x.length));
  for (const c of company) {
    const lead = s.slice(Math.max(0, c.index - 140), c.index);
    const tail = s.slice(c.end, c.end + 80);
    const leadWords = unnamed.slice(Math.max(0, c.index - 140), c.index);
    // "Costco's exclusive RV partner", "the official partner of the NBA".
    if (/^(?:'s|’s)\s+(?:exclusive|preferred|official|strategic|primary|principal|global)\s+(?:[\w-]+\s+){0,2}partner\b/i.test(tail) && byFiler(lead.slice(-80))) return { role: 'partner' };
    const at = leadWords.search(partner);
    if (at < 0 && !partner.test(unnamed.slice(c.end, c.end + 60))) continue;
    // Not a partnership with the target: "(some of which are strategic partners of ours in other areas) include ...",
    // "both our largest BaaS partner and Walmart", "Walmart, Costco and other traditional and non-traditional partners",
    // "one of our Channel Partners, Apple", "progress on partnering with".
    if (/\b(?:some|many|certain|several|most) of (?:which|whom|them|these)\s+(?:are|may be|have been|were)\s+(?:[\w-]+\s+){0,2}partners\b/i.test(lead)) continue;
    if (/\bpartners?\s+(?:and|or)\s+(?:the\s+)?$/i.test(lead) || /\bchannel partners?\b[^.;]{0,20}$/i.test(lead)) continue;
    if (at < 0 && /^[^.;]{0,50}\bother\b[^.;]{0,40}\bpartners\b/i.test(tail)) continue;
    if (/\b(?:progress (?:on|in|toward)|seek(?:s|ing)? to|looking to|aim(?:s|ing)? to|plan(?:s|ning)? to|hope(?:s)? to)\s+(?:\w+\s+){0,2}partner\w*/i.test(lead)) continue;
    // The filer's own partnership: "we", "our" or its name before the partnership word.
    const who = at >= 0 ? lead.slice(Math.max(0, at - 80), at + 40) : s.slice(Math.max(0, c.index - 80), c.end + 60);
    if (!byFiler(who) && !/\b(?:[Bb]oth companies|[Ee]ach company|jointly)\b/.test(s)) continue;
    const around = s.slice(Math.max(0, c.index - 160), c.end + 160);
    if (/\b(?:stores?|clubs?|warehouses?|doors|shelves|shelf|retail(?:er)?s?|sold (?:in|at|through)|sales (?:at|through|in)|placement|assortment|distribut\w* (?:[\w-]+\s+){0,5}through)\b/i.test(around) && !/^(?:'s|’s)?\s+(?:exclusive|preferred|official)\b/i.test(tail)) return { role: 'supplier' };
    // "Our Costco partnership ... from $0.5 million in fiscal 2023 to exceeding $10 million": sales to it.
    if (/^(?:'s|’s)?\s+partnership\b/i.test(tail) && /\$\s?[\d.,]+\s*(?:million|billion|[MB]\b)/i.test(around)) return { role: 'supplier' };
    // "We have partnered with Jacobs and Vertiv to build the data center": the target builds or equips the filer's site.
    if (/\bpartnered with\b[^.;]{0,80}\bto (?:build|construct|design|engineer|equip|deliver|develop)\s+(?:the|our|a|its|this|their)\s+(?:[\w-]+\s+){0,2}(?:data cent(?:er|re)s?|facilit(?:y|ies)|campus|plant|site|project)\b/i.test(around)) return { role: 'customer' };
    // "in connection with our partnership with Oracle Corporation ("Oracle") to provide on-site solid state power": the
    // filer provides.
    if (/\b(?:our|its|the Company's) partnership with\s+(?:[A-Z][\w&.'-]*,?\s+){0,4}(?:\([^)]*\)\s*)?,?\s*to (?:provide|supply|deliver|power)\b/.test(around)) return { role: 'supplier' };
    // The filer's product deployed by the target, or the target improving its own operations with it: the filer sells.
    if (filer && (new RegExp(String.raw`\bto (?:deploy|implement|roll out|adopt)\s+(?:the\s+)?(?:${filer.source})`, 'i').test(around) || new RegExp(String.raw`\bwith\s+(?:${filer.source})\s*,\s*$`, 'i').test(lead) && /^(?:'s)?\s+(?:has |have )?(?:enhanced|improved|reduced|increased|achieved|cut|saved|accelerated|streamlined)\b/i.test(tail))) return { role: 'supplier' };
    // Deploying the target's own platform is buying it; a partnership to deploy something together stays a partnership.
    if (new RegExp(String.raw`\bto (?:deploy|use|adopt|implement|run on|bring|integrate|incorporate|leverage)\s+(?:the\s+)?(?:[\w-]+\s+){0,2}?(?:${pattern.source}|its|their)\b`, 'i').test(around)) return { role: 'customer' };
    // "we partnered with Bank of America and our lender group to amend our credit facility" (Helen of Troy): its bank.
    if (/\b(?:lender group|(?:credit|loan|revolving) (?:facility|facilities|agreement)|term loans?)\b/i.test(around)) return { role: 'lender' };
    return { role: 'partner' };
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

const CANDIDATE = /(?<![A-Za-z0-9\u00C0-\u024F])(?:[A-Z\u00C0-\u00DE\u0130][A-Za-z0-9\u00C0-\u024F'&.-]*|&)(?:\s+(?:[A-Z\u00C0-\u00DE\u0130][A-Za-z0-9\u00C0-\u024F'&.-]*|\d{1,3}(?![\d.,%])|&|(?:of|de|du|la)(?=\s+[A-Z\u00C0-\u00DE])))*(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|SpA|GmbH|AB|ASA|Oyj|KGaA|B\.V|BV|Pte|Pty|K\.K)(?![A-Za-z])\.?)*/g;
/** A name written like a brand: inner capitals or all capitals ("CoreWeave", "NVIDIA", "eBay"). */
const BRAND = /^(?:[A-Z]{3,}|[A-Za-z][a-z]+[A-Z][A-Za-z]*|[a-z][A-Z]\w+)$/;
const HAS_FORM = /(?:,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|LLC|plc|PLC|N\.V|S\.A|AG|SE|SpA|GmbH|AB|ASA|Oyj|KGaA|B\.V|BV|Pte|Pty|K\.K)\.?)$/;
const NOT_COMPANY = /^(?:The|Our|We|In|For|Such|These|This|Those|Including|Include|And|Or|As|At|By|On|To|Customer [A-Z]|Fiscal|Annual|Report|Form|Item|Part|Note|Notes|Data Center|United States|North America|Europe|Asia|China|Taiwan|Korea|Japan|Israel|India|Middle East)$/;

/** A bank, fund or asset manager written without a legal form: "First National Bank of Omaha", "Macquarie Asset Management". */
const FINANCIAL_NAME = /\b(?:Bank|Bancorp|Banc|Capital|Partners|Asset Management|Investment Management|Securities|Financial|Credit|Funding|Lending|Trust)(?:\s+of\s+[A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)?)?(?:\s+(?:USA|U\.S\.A\.?|AG|SE|plc|Europe|International))?$/;

/**
 * The companies a passage names: those in the SEC's list or the app's securities, and others written with a legal
 * form ("Huawei Technologies Co. Ltd."). "Advanced Micro Devices, Inc., or AMD" counts once. `loose` also takes a
 * bank's or fund's name without a legal form, for the party right after "with" in a loan or partnership.
 */
export function findCompanies(input: string, dir: Directory, loose = false, whole = false): Found[] {
  // "in the U.S.-McKesson Corporation, Cencora, Inc., and Cardinal Health, Inc.-each": a dash after a full stop starts or
  // ends a list (same length, so positions hold).
  // "Australia and New Zealand Banking Group Limited" is one name: the "and" is written in capitals so the name
  // holds together (same length), and given back in lower case.
  const text = input.replace(/\.-(?=[A-Za-z])/g, '. ').replace(/\b(Australia|Trinidad|Antigua|Bosnia) and (?=[A-Z])/g, '$1 AND ');
  const out: Found[] = [];
  const seen = new Set<string>();
  // Where the last company named ended: a parent in parentheses right after it is that company's.
  let lastEnd = 0;
  const ends = new Map<number, number>();
  const held: { found: Found; end: number }[] = [];
  for (const low of text.matchAll(/\b(adidas|lululemon(?: athletica)?|athenahealth|SK hynix)\b/g)) {
    const entry = dir.byName.get(normalizeName(low[1])) ?? dir.byName.get(normalizeName(low[1].split(' ')[0]));
    const found: Found = entry ? { ...entry, index: low.index ?? 0 } : { name: low[1], index: low.index ?? 0 };
    const k = found.cik ? `cik:${found.cik}` : found.yahoo ? `y:${found.yahoo}` : `n:${normalizeName(found.name)}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(found);
    }
  }
  CANDIDATE.lastIndex = 0;
  for (let m = CANDIDATE.exec(text); m; m = CANDIDATE.exec(text)) {
    let raw = m[0].replace(/[.,]+$/, (x) => (/\b(?:Inc|Corp|Co|Ltd|N\.V|S\.A)$/.test(m![0].slice(0, -x.length)) ? x : '')).trim();
    // A leading word that only starts the sentence: "Our competitors" → skip; "During Cisco" never happens in lists.
    raw = raw.replace(/^(?:The|Our|Such as|Including|And|Or)\s+/, '');
    if (!raw || NOT_COMPANY.test(raw)) continue;
    // "ASICs", "GPUs", "FPGAs": a plural of capitals is a kind of product, not ASICS the company.
    if (/^[A-Z]{2,}s$/.test(raw)) continue;
    // Try the whole phrase, then its leading words ("Arista Networks" in "Arista Networks Broadcom").
    const listed = (phraseText: string): Found | undefined => {
      const ws = phraseText.split(/\s+/);
      for (let n = ws.length; n >= (whole ? ws.length : 1); n--) {
        const phrase = ws.slice(0, n).join(' ');
        const key = normalizeName(phrase);
        if (!key) continue;
        const single = !key.includes(' ');
        const entry = dir.byName.get(key);
        // A first word alone stands for a company only when it is a well-known one or written like a brand ("NVIDIA
        // Blackwell", "CoreWeave Compute"); "Polaris Forge 1" is not Polaris Inc.
        const prefixOk = n === ws.length || !single || KNOWN[key] || BRAND.test(ws[0]);
        // "ESG rating systems", "CSP/hyperscalers": a short word in capitals alone is a company only when well known.
        if (single && n === 1 && /^[A-Z]{2,4}$/.test(ws[0]) && !KNOWN[key] && !HAS_FORM.test(phraseText)) continue;
        // "U.S. Department of War (DoW)", "DoD", "DoE": a department's acronym, not Dow Inc.
        if (single && n === 1 && /^[A-Z][a-z][A-Z]{1,2}$/.test(ws[0])) continue;
        if (entry && prefixOk && (!single || !COMMON.has(key) || KNOWN[key] || HAS_FORM.test(phrase))) return { ...entry, index: m!.index };
      }
      return undefined;
    };
    let hit = listed(raw);
    // "the U.S.-McKesson Corporation": the country before a name is not part of it, unless the name is listed with it
    // ("U.S. Bancorp", "U.S. Steel").
    const country = /^U\.S\.\s+(?=[A-Z])/.exec(raw);
    if (country && !hit) {
      const rest = raw.slice(country[0].length);
      hit = listed(rest);
      if (hit) raw = rest;
    }
    const words = raw.split(/\s+/);
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
    if (!hit) {
      // A listed company whose name is also a word ("Target", "Block") is held back: it counts only in a list of others.
      const key = normalizeName(raw);
      const entry = key && !key.includes(' ') && COMMON.has(key) && /^[A-Z][a-z]+$/.test(raw) ? dir.byName.get(key) : undefined;
      if (entry) held.push({ found: { ...entry, index: m.index }, end: m.index + m[0].length });
      continue;
    }
    // "(part of Shandong Heavy Industry Group)", "(formerly MAN Energy Solutions SE)", "architectures, such as Arm",
    // "the Arm ecosystem", "ARM-based".
    const lead = text.slice(Math.max(0, m.index - 60), m.index);
    const parentOf = /\((?:both\s+)?(?:part of|a subsidiary of|a unit of|owned by)\s+$/i.test(lead);
    if ((parentOf && /^[\s,.]*(?:\([^)]*\)\s*)?\((?:both\s+)?(?:part of|a subsidiary of|a unit of|owned by)\s+$/i.test(text.slice(lastEnd, m.index))) || /\((?:formerly|previously)\s+$/i.test(lead) || /\barchitectures?,?\s+(?:such as|like|including)\s+(?:[\w&.-]+,?\s+(?:and\s+)?){0,3}$/i.test(lead)) continue;
    if (/^\s*(?:-based|ecosystem|architecture|cores?|instruction set|ISA)\b/i.test(text.slice(m.index + m[0].length)) && /^(?:arm|risc-v|x86)$/i.test(normalizeName(hit.name))) continue;
    if (/ AND /.test(hit.name)) hit = { ...hit, name: hit.name.replace(/ AND /g, ' and ') };
    const k = hit.cik ? `cik:${hit.cik}` : hit.yahoo ? `y:${hit.yahoo}` : `n:${normalizeName(hit.name)}`;
    lastEnd = m.index + m[0].length;
    ends.set(m.index, lastEnd);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(hit);
  }
  // "Walmart, Target, Kroger, and Amazon": a held-back name next to a company in a list of two or more is one of them.
  const LIST_GAP = /^\s*,?\s*(?:and\s+|or\s+|&\s+)?$/;
  for (const h of held) {
    const prev = out.filter((f) => f.index < h.found.index).sort((a, b) => b.index - a.index)[0];
    const next = out.filter((f) => f.index > h.found.index).sort((a, b) => a.index - b.index)[0];
    const afterPrev = prev && LIST_GAP.test(text.slice(ends.get(prev.index) ?? prev.index, h.found.index));
    const beforeNext = next && LIST_GAP.test(text.slice(h.end, next.index));
    if (!(afterPrev || beforeNext) || out.length < 2) continue;
    const k = h.found.cik ? `cik:${h.found.cik}` : `n:${normalizeName(h.found.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h.found);
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------- the own report

const OWN_COMPETITOR = /^\[competitors\]|\b(?:competitors?\b[^.]{0,40}\b(?:include|includes|including|are|such as)|compete[sd]?\s+(?:\w+ly\s+){0,2}(?:with|against)|competition\b[^.]{0,80}?\bfrom|principal competitors?|primary competitors?|main competitors?|significant competition from)/i;
const OWN_SUPPLIER = /\b(?:foundr(?:y|ies)|suppliers?|subcontractors?|contract manufacturers?|manufacturing partners?|vendors?|sole[- ]source|single[- ]source|assembly and test)\b[^.]{0,120}?\b(?:such as|including|include|includes|namely|like|primarily|principally|:)/i;
const OWN_CUSTOMER = /\b(?:customers?\b[^.]{0,40}\b(?:include|includes|including|such as|are)|largest customers?|end customers?|direct customers?)\b/i;
const ANONYMOUS = /\b(?:Customer|Direct Customer|Indirect Customer) ([A-H])\b/g;
/** Words that end a stake, before the company it was in. */
const GONE_STAKE_AT = /\b(?:(?:previous|former|prior)\s+(?:(?:equity|ownership)\s+)?(?:investments?|stakes?|interests?|ownership)\s+in|(?:sale|sold|sell|selling|divest\w*|disposal|disposed of)\s+(?:of\s+)?(?:all\s+of\s+|the remainder of\s+)?(?:our|its|the Company's)\s+(?:remaining\s+|entire\s+|full\s+)?(?:[\w-]+\s+){0,2}(?:interests?|stakes?|investments?|shares|ownership)\s+in|loss of significant influence over|no longer (?:holds?|owns?|has|have)\s+(?:an?\s+|any\s+)?(?:[\w-]+\s+){0,2}(?:interests?|stakes?|investments?)\s+in)\s+/i;
/** "X, a 50-50 joint venture with Y", "X, a non-consolidated company jointly owned with Y". */
const JOINT_VENTURE = /([A-Z][A-Za-z0-9&.' -]{2,60}?),\s+an?\s+(?:50[-–/]50\s+|equally[- ]owned\s+)?(?:[\w-]+\s+){0,2}?(?:joint venture|company jointly owned|entity jointly owned)\s+(?:with|between (?:us|the Company) and)\s+/;
/** A stake described only in the past: "until its disposition in the first quarter of 2025". */
const GONE_STAKE = /\buntil (?:its|their|the) (?:disposition|sale|divestiture)\b|\bdiscontinu\w* (?:of )?the equity method\b|\bwhile subject to the equity method\b/i;

/** "our majority owned subsidiary ("ChronoScale")", "APLD ComputeCo 3 LLC, a subsidiary of the Company": the company's
 * own subsidiaries, whose deals are its own. */
const SUBSIDIARY_AFTER = /\b(?:our|its|the Company's|the Group's)\s+(?:(?:majority|wholly|indirect(?:ly)?|direct(?:ly)?|consolidated)[- ]?(?:owned)?,?\s+){0,3}subsidiar(?:y|ies),?\s+(?:named\s+)?((?:[A-Z][\w&.'-]*)(?:\s+(?:[A-Z][\w&.'-]*|\d{1,3}))*)/g;
const SUBSIDIARY_BEFORE = /((?:[A-Z][\w&.'-]*)(?:\s+(?:[A-Z][\w&.'-]*|\d{1,3}))*)(?:\s*\([^)]{0,60}\))?,\s+(?:a|an|our|its|the Company's)\s+(?:(?:majority|wholly|indirect(?:ly)?|direct(?:ly)?|consolidated)[- ]?(?:owned)?,?\s+){0,3}subsidiary(?:\s+of\s+(?:the Company|ours|us))?\b/g;
const NOT_A_NAME = /^(?:The|A|An|Our|Its|We|In|On|As|For|Each|Such|This|These|Company|Delaware|Nevada)$/;

/** Names a company's own filing gives its subsidiaries, and short names defined for them. */
export function subsidiaryNames(sentences: string[]): string[] {
  const out = new Set<string>();
  const keep = (n: string) => {
    const name = n.replace(/(?:'s|’s)$/, '').replace(/\s+(?:LLC|Inc|Corp|Corporation|Ltd|L\.P|LP)\.?$/, '').trim();
    if (name.length >= 4 && !NOT_A_NAME.test(name.split(' ')[0])) out.add(name);
  };
  for (const s of sentences) {
    for (const m of s.matchAll(SUBSIDIARY_AFTER)) keep(m[1]);
    for (const m of s.matchAll(SUBSIDIARY_BEFORE)) keep(m[1]);
    // "the Company owned approximately 97% of ChronoScale's outstanding common stock".
    const major = /\b(?:own|owns|owned|hold|holds|held)\s+(?:approximately\s+|about\s+)?(\d{1,3}(?:\.\d+)?)%\s+of\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})(?:'s)?\b/.exec(s);
    if (major && Number(major[1]) > 50) keep(major[2]);
  }
  return [...out];
}

/** "Credit Agreement, dated as of May 29, 2026, by and between Applied Digital Corporation, ..., the lenders party thereto,
 * First National Bank of Omaha and Goldman Sachs Lending Partners LLC": an exhibit list's agreement and its parties. */
const EXHIBIT_LINE = /^(?:\d+(?:\.\d+)*\*{0,2}\s+)?([A-Z][^;]{2,140}?\b(?:Agreement|Lease|Note|Notes|Contract|Guaranty))(?:\s*\([^)]*\))?,\s*(?:dated|effective)(?: as of)?\s+[A-Z][a-z]+\.?\s+\d{1,2},\s+\d{4},?\s*(?:as amended[^,]*,\s*)?(?:by and between|by and among|between|among)\s+(.+?)\.?$/;
const EXHIBIT_GENERIC = /\b(?:the (?:several )?lenders|lenders party|issuing banks?|guarantors?|purchasers? (?:party|named)|thereto|hereto|from time to time|each of|certain (?:of )?(?:its|the|our)|the Company|the Registrant|the Borrower|the Issuer|trustee|as agent|representatives?|underwriters?|initial purchasers?)\b/i;

export function exhibitStatements(sentence: string, dir: Directory, self: RegExp, own: (name: string) => boolean, filed?: string): OwnStatement[] {
  const m = EXHIBIT_LINE.exec(sentence.trim());
  if (!m) return [];
  const year = /,\s*(?:dated|effective)(?: as of)?\s+[A-Z][a-z]+\.?\s+\d{1,2},\s+(\d{4})/.exec(sentence);
  if (year && filed && Number(year[1]) < Number(filed.slice(0, 4)) - 3) return [];
  const kind = m[1];
  const role: Role | null = /\b(?:Credit|Loan|Guaranty|Promissory|Term|Revolving|Bridge|Note Purchase|Financing|Security)\b/i.test(kind) && !/\bIndenture\b/i.test(kind)
    ? 'lender'
    : /\b(?:Collaboration|License|Licence|Partnership|Joint Development|Joint Venture|Alliance)\b/i.test(kind)
      ? 'partner'
      : /\b(?:Securities Purchase|Stock Purchase|Share Purchase|Unit Purchase|Subscription|Investment|Investor Rights)\b/i.test(kind)
        ? 'investor'
        : null;
  if (!role || /\b(?:Underwriting|Sales Agreement|Equity Distribution|Registration Rights|Merger|Employment|Separation|Indemnification|Warrant)\b/i.test(kind)) return [];
  const out: OwnStatement[] = [];
  // "APLD GPU-01, LLC and Cornerstone Bank": a legal form after a comma belongs to the name before it.
  const parties = m[2].replace(/,\s+(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|L\.P\.?|N\.A\.?|Corp\.?|plc)(?=[\s,.]|$)/g, ' $1');
  for (const part of parties.split(/,\s*(?:and\s+)?|\s+and\s+/)) {
    // The borrower, guarantors and sellers are the company's side.
    if (/\bas\s+(?:the\s+)?(?:Borrowers?|Guarantors?|Parent|Issuer|Sellers?|Lessees?|Tenants?|Company|Holdings)\b/i.test(part)) continue;
    const p = part.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/,?\s+as\s+[^,]*$/i, '').trim();
    if (p.length < 3 || EXHIBIT_GENERIC.test(p) || own(p)) continue;
    self.lastIndex = 0;
    if (self.test(p)) continue;
    // A listed company only when the whole name is its own ("First National Bank of Omaha" is not First National
    // Corp); an unlisted bank or fund as written.
    const f = findCompanies(p, dir, false, true).find((x) => x.index <= 4) ?? (/\b(?:Bank|Banking|Capital|Partners|Credit|Lending|Financial|Fund|Funding|Trust|Management|Securities)\b|\b(?:N\.A|LLC|Inc|Corp|Corporation|Ltd|L\.P|plc)\.?$/.test(p) ? { name: p.replace(/,?\s+(?:LLC|Inc|Corp|Corporation|Ltd|L\.P|plc)\.?$/, '').trim(), index: 0 } as Found : undefined);
    if (f && !own(f.name)) out.push({ role, party: f });
  }
  return out;
}

/** Units or shares issued to a named investor: "issuing 1,825,000 preferred units ... for proceeds of approximately $1.8
 * billion to MIP HPC Holdings, LLC". Warrants, shares for services and awards to staff are not investments. */
// The company issuing its own units or shares; selling a stake it holds in another company is no investment in it.
const ISSUED_TO = /\b(?:issued|issuing|issue|issues)\b((?:[^.;]|\.(?=\d)){0,160})\b(?:preferred units|common units|units|preferred stock|preferred shares|shares of (?:our |its )?(?:common|preferred|Series)[\w ]{0,20}?|shares)\b((?:[^.;]|\.(?=\d)){0,160})\bto\s+/i;
const NOT_INVESTOR = /\b(?:interests? in|stake in|warrants?|options?|restricted|RSUs?|awards?|employees?|directors|officers|consultants?|services|vendors?|in (?:exchange|connection) (?:for|with) (?:the )?(?:acquisition|merger|services)|settlement|conversion|exercise|holders|stockholders|shareholders|the public|investors|underwriters?|agents?)\b/i;

/** "MIP VI HPC Holdings, LLC, which is an affiliate of funds and investment vehicles managed by entities within Macquarie
 * Asset Management": the vehicle and the manager behind it. */
const AFFILIATE_OF = /^[^.;]{0,90}?,?\s*(?:which is\s+)?an?\s+(?:affiliate|subsidiary|fund|vehicle|entity)\s+of\s+(?:funds\s+(?:and\s+investment\s+vehicles\s+)?(?:managed|advised)\s+by\s+)?(?:entities\s+within\s+)?(?:an?\s+affiliate\s+of\s+)?/i;

/** A loan the filing says has been repaid or ended: its lender is no longer one. */
const LOAN_ENDED = /\b(?:repaid in full|paid off|prepaid in full|extinguish\w*|terminated (?:the|all|its)|payoff)\b/i;
const AGENT_OF = /((?:[A-Z][\w&.'-]*)(?:\s+[A-Z][\w&.'-]*){0,5})(?:\s*\([^)]*\))?,?\s+as\s+(?:the\s+)?administrative agent\b/g;

/** "partners-including ABB for electrical equipment ... and Caterpillar for backup generation": suppliers listed after
 * the purchasing they serve. */
const PURCHASING_LIST = /\b(?:purchas\w+|procur\w+|sourc\w+|buy\w*)\b[^.]{0,120}?\b(?:partners?|providers?|vendors?|suppliers?|manufacturers?)\b[^.]{0,20}?\b(?:including|such as|like|include|includes|namely)\b/i;

/**
 * Relations the company's own report states: customers with the share of its revenue (named, or "Customer A"),
 * suppliers it names ("foundries, such as TSMC and Samsung") and competitors ("our competitors include ...").
 */
export function ownRelations(sentences: string[], dir: Directory, self: { cik?: number; names: string[]; ticker?: string }, ev: Omit<Evidence, 'sentence'>, ended: EndedStakes = { sold: new Set(), subsidiaries: new Set() }): Relation[] {
  const out: Relation[] = ended.retainHistory ? lifecycleRelations(sentences, dir, self, ev) : [];
  const { sold: soldStakes, subsidiaries } = ended;
  // Its subsidiaries are the company: their deals are its own, and they are never a counterparty.
  const subs = [...new Set([...(ended.subsidiaryNames ?? []), ...subsidiaryNames(sentences)])];
  ended.subsidiaryNames = subs;
  const selfPattern = targetPattern([...self.names, ...subs.map((n) => escapeLiteral(n))]);
  const selfNames = new Set([...self.names, ...subs].map(normalizeName));
  // Entities named after its ticker ("APLD Intermediate Holdco LLC") or one of its subsidiaries are its own; a company
  // named after the company itself can be another ("Coca-Cola FEMSA").
  const selfStarts = [...(self.ticker ? [self.ticker] : []), ...subs].map(normalizeName).filter((x) => x.length >= 3);
  const ownName = (n: string) => {
    const v = normalizeName(n);
    return selfNames.has(v) || selfStarts.some((x) => v === x || v.startsWith(`${x} `));
  };
  // "MIP HPC Holdings, LLC (formerly, MIP VI HPC Holdings, LLC)": one company under its old and new names.
  const renamed = (ended.renamed ??= new Map<string, string>());
  for (const raw of sentences) for (const m of raw.matchAll(/([A-Z][\w&.'-]*(?:\s+[A-Z0-9][\w&.'-]*){0,5}),?\s+(?:LLC|Inc\.?|Corp\.?|Corporation|Ltd\.?)?\s*\(formerly,?\s+(?:known as\s+)?([A-Z][^)]{2,80}?)\)/g)) {
    const now = m[1].trim();
    const was = m[2].replace(/,?\s+(?:LLC|Inc\.?|Corp\.?|Corporation|Ltd\.?)$/, '').trim();
    if (normalizeName(now) !== normalizeName(was)) renamed.set(normalizeName(was), now);
  }
  const add = (f: Found | { name: string }, role: Role, sentence: string, extra: Partial<Relation> = {}) => {
    const now = renamed.get(normalizeName(f.name));
    const found = (now && !(f as Found).cik ? { ...f, name: now } : f) as Found;
    if (found.cik && self.cik && found.cik === self.cik) return;
    // The company itself under its own name, or one of its subsidiaries; a bottler named after it ("Coca-Cola HBC") is
    // another company.
    if (!found.cik && (selfNames.has(normalizeName(found.name)) || ownName(found.name))) return;
    const competitorList = sentence.startsWith('[competitors]');
    out.push({ key: relationKey(found), name: found.name, ticker: found.ticker, cik: found.cik, id: found.id, yahoo: found.yahoo, role, side: 'own', evidence: [{ ...ev, sentence: sentence.replace(/^\[competitors\]\s*/, ''), ...(competitorList ? { context: 'competitor-list' as const } : {}) }], ...extra });
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
    // "HPC Hosting Business During fiscal year 2026, this business segment was comprised of one customer accounting for
    // 59%": the segment's heading tells which business the customer buys from.
    const seg = /^([A-Z][\w&-]*(?:\s+[A-Z][\w&-]*){0,4}?)\s+(?:Business|Segment)\s+(?:During|In|For)\b[^.]{0,80}\bthis (?:business )?segment\b/.exec(x.raw)?.[1];
    for (const p of x.parts) {
      for (let k = 0; k < p.count; k++) {
        n++;
        out.push({ key: `unnamed:${n}`, name: `Unnamed ${p.kind ? `${p.kind} ` : ''}${seg && !p.kind ? `${seg} ` : ''}customer ${n}`, recordKind: 'concentration', role: 'customer', share: p.share, basis: 'target-revenue', side: 'own', evidence: [{ ...ev, sentence: x.raw }] });
      }
    }
  }
  // Unnamed suppliers with their shares of its purchases, from the latest year the report gives ("One supplier
  // accounted for a significant portion of our total purchases in fiscal year 2026 of 63.1%").
  // One statement counts them: the latest year's, for the longest period it gives (a 10-Q's six months rather than its
  // quarter). A supplier the report names elsewhere with the same figure ("KeHE ... accounting for approximately 52%
  // ... of our total purchases") is that company, not another one.
  const suppliers = sentences.map((raw) => ({ raw, year: statementYear(raw), months: periodMonths(sharePeriod(raw)), shares: unnamedSupplierShares(raw) })).filter((x) => x.shares.length);
  const supplierYear = Math.max(0, ...suppliers.map((x) => x.year));
  const counted = suppliers.filter((u) => u.year === supplierYear).sort((a, b) => b.months - a.months)[0];
  const namedElsewhere = (share: number) =>
    sentences.some((raw) => !unnamedSupplierShares(raw).length && new RegExp(`(?<![\\d.])${String(share).replace('.', '\\.')}\\s?(?:%|percent)[^.;]{0,80}\\bpurchases\\b`).test(raw));
  (counted?.shares ?? []).filter((share) => ended.retainHistory || !namedElsewhere(share)).forEach((share, i) => {
    out.push({ key: `unnamed-supplier:${i + 1}`, name: `Unnamed supplier ${i + 1}`, recordKind: 'concentration', role: 'supplier', share, basis: 'target-purchases', side: 'own', evidence: [{ ...ev, sentence: counted!.raw }] });
  });
  const aliases = definedNames(sentences, dir, (ended.aliases ??= new Map()));
  const legal = (ended.legalNames ??= new Map<string, string>());
  for (const raw of sentences) {
    for (const m of raw.matchAll(DEFINED)) {
      const name = legalName(trailingName(m[1]));
      if (name && !GENERIC_ALIAS.test(m[2]) && !legal.has(m[2])) legal.set(m[2], name);
    }
  }
  /** A party named as a subject: a company the app knows, or one the filings define with its legal form. */
  const subjectParty = (text: string): Found | { name: string } | null => {
    const n = text.replace(/(?:'s|’s)$/, '').trim();
    if (/^(?:We|Our|The|This|These|Such|Each|It|They|Its)\b/.test(n)) return null;
    const known = findCompanies(n, dir, false, true).filter((f) => !f.cik || f.cik !== self.cik);
    if (known.length === 1 && known[0].index === 0) return known[0];
    const full = legal.get(n) ?? (legalName(n) ? n : null);
    return full && !ownName(full) ? { name: legalName(full) ?? full } : null;
  };
  for (const raw of sentences) {
    const s = expandAliases(raw.replace(/^\[competitors\]\s*/, ''), aliases);
    if (SAFE_HARBOR.test(s) || /\brisks related to:/i.test(s)) continue;
    // The text of slides ("Investor Presentation 2026 7 / 46 AI Data Center Expansion ..."): headings run together.
    if (/\bInvestor Presentation\b|\b\d{1,3}\s\/\s\d{1,3}\b/.test(s)) continue;
    // A loan repaid or ended: its agent bank is no longer a lender.
    if (LOAN_ENDED.test(s)) {
      for (const m of s.matchAll(AGENT_OF)) for (const f of findCompanies(m[1], dir).slice(-1)) (ended.repaid ??= new Set()).add(relationKey(f));
      continue;
    }
    // An exhibit list's agreement and its parties.
    const listed = exhibitStatements(s, dir, selfPattern, ownName, ev.date);
    if (listed.length) {
      for (const st of listed) if (!('unnamed' in st.party)) add(st.party, st.role, raw);
      continue;
    }
    // Units or shares issued to an investor, and the manager behind the vehicle that bought them.
    const issued = ISSUED_TO.exec(s);
    if (issued && !NOT_INVESTOR.test(`${issued[1]} ${issued[2]}`)) {
      const rest = s.slice(issued.index + issued[0].length);
      const buyers = partiesAt(rest, dir, true).filter((f) => !ownName(f.name));
      for (const f of buyers.slice(0, 2)) {
        add(f, 'investor', raw);
        const tail = rest.slice(f.index + f.name.length);
        const aff = AFFILIATE_OF.exec(tail);
        if (aff) for (const parent of partiesAt(tail.slice(aff[0].length), dir, true).slice(0, 1)) add(parent, 'investor', raw);
      }
      if (buyers.length) continue;
    }
    // Suppliers listed for its purchasing.
    const buying = PURCHASING_LIST.exec(s);
    if (buying) {
      const found = findCompanies(s.slice(buying.index + buying[0].length), dir).filter((f) => !ownName(f.name));
      for (const f of found) add(f, 'supplier', raw);
      if (found.length) continue;
    }
    // Customers with shares of revenue: named ones and the anonymous "Customer A".
    const runs = percentRuns(s).filter((run) => OF_REVENUE.test(s.slice(run[run.length - 1].end, run[run.length - 1].end + 140)));
    // "approximately 67% of our revenue from our top customer, Microsoft, for the year ended December 31, 2025".
    const fromRun = runs.find((run) => /^[^.;]{0,60}?\b(?:revenue|revenues|net sales|sales)\s+(?:(?:was|were)\s+)?(?:(?:derived|generated|earned|recognized)\s+)?from\s+(?:(?:our|its)\s+(?:top|largest|single largest|biggest)\s+customer,?\s+)?[A-Z]/.test(s.slice(run[run.length - 1].end)));
    if (fromRun) {
      const tail = s.slice(fromRun[fromRun.length - 1].end);
      const at = tail.search(/\bfrom\s+/);
      const party = partiesAt(tail.slice(at + 5).replace(/^(?:our|its)\s+(?:top|largest|single largest|biggest)\s+customer,?\s+/i, ''), dir);
      if (party.length === 1) {
        add(party[0], 'customer', raw, { share: shareInRun(s, fromRun, targetPattern([escapeLiteral(party[0].name)])) ?? fromRun[0].value, qualifier: qualifierOf(s, fromRun), basis: 'target-revenue' });
        continue;
      }
    }
    if (runs.length && VERB.test(s)) {
      const run = runs[0];
      const head = s.slice(0, run[0].index);
      const anon = [...head.matchAll(ANONYMOUS)].map((m) => m[0]);
      const named = findCompanies(stripForms(head), dir).filter((f) => !f.cik || f.cik !== self.cik);
      const parties: { name: string; f?: Found }[] = anon.length ? anon.map((a) => ({ name: a })) : named.map((f) => ({ name: f.name, f }));
      const each = run.length === 1 && /\beach\b/i.test(head.slice(-60));
      // A segment's figure names the customer but is no share of the company's revenue.
      const segment = !companyRevenue(s.slice(run[run.length - 1].end, run[run.length - 1].end + 140));
      parties.forEach((p, i) => {
        const value = segment ? undefined : each ? run[0].value : parties.length === run.length ? run[i].value : parties.length === 1 ? shareInRun(s, run, targetPattern([escapeLiteral(p.name)])) ?? run[0].value : undefined;
        add(p.f ?? { name: p.name }, 'customer', raw, { share: value, qualifier: segment ? undefined : qualifierOf(s, run), basis: 'target-revenue' });
      });
      if (parties.length) continue;
    }
    // "three wholesale distributors-McKesson, Cencora and Cardinal Health-each accounted for a significant percentage
    // of our consolidated revenue": customers without a figure.
    const significant = /\b(?:each )?(?:accounted|account) for (?:a |an )?(?:significant|substantial|material|large|meaningful) (?:percentage|portion|share|part|amount)\b[^.]{0,60}\b(?:revenue|revenues|net sales|sales)\b/i.exec(s);
    if (significant) {
      const named = findCompanies(s.slice(0, significant.index), dir).filter((f) => !f.cik || f.cik !== self.cik);
      for (const f of named) add(f, 'customer', raw);
      if (named.length) continue;
    }
    // "Walmart, Target, Kroger, and Amazon are among our significant general merchandise retail competitors".
    const among = /\b(?:are|is|were|remain)\s+(?:among\s+)?(?:our|the Company's)\s+(?:[\w-]+\s+){0,5}competitors\b/i.exec(s);
    if (among) {
      const head = s.slice(Math.max(0, s.lastIndexOf('.', among.index) + 1), among.index);
      for (const f of findCompanies(head, dir)) add(f, 'competitor', raw);
    }
    // A stake it no longer holds, named right after the words: "the sale of our ownership interest in Coca-Cola
    // Consolidated", "our previous investment in Haleon". Selling part of one ("sold a portion of our interest in CCEP")
    // keeps the rest.
    const goneAt = GONE_STAKE_AT.exec(s);
    if (goneAt) for (const f of findCompanies(s.slice(goneAt.index + goneAt[0].length, goneAt.index + goneAt[0].length + 120), dir).filter((f) => f.index <= 6).slice(0, 1)) soldStakes.add(relationKey(f));
    // "CFM International, a 50-50 non-consolidated joint venture with Safran Aircraft Engines": the venture is a stake,
    // the other owner a partner.
    const jv = JOINT_VENTURE.exec(s);
    if (jv) {
      const venture = findCompanies(jv[1], dir).pop();
      // The other owner is named first after "with", as a parent's unit at times ("Safran Aircraft Engines").
      const others = findCompanies(s.slice(jv.index + jv[0].length, jv.index + jv[0].length + 90), dir).filter((f) => f.index <= 4).slice(0, 1);
      if (venture && jv[1].length - venture.index <= 30) add(venture, 'investment', raw);
      for (const f of others) add(f, 'partner', raw);
      if (venture || others.length) continue;
    }
    if (/\bequity[- ]method\b|\b(?:own|owns|owned|hold|holds|held|retained|retains)\s+(?:approximately\s+|about\s+|an?\s+)?\d{1,3}(?:\.\d+)?%/i.test(s) && !/\b(?:not accounted for|do not|does not)\b/i.test(s)) {
      const stake = /\b(?:(?:investments?|interests?|stake|equity interest|ownership interest)\s+in|equity[- ]method (?:investees?|investments?)\s*,?\s*(?:include|includes|including|such as|are|were|:)(?:,?\s*but (?:are |is )?not limited to,?)?(?:\s+(?:our|its|the Company's)\s+(?:ownership |equity )?interests?\s+in)?|(?:own|owns|owned|hold|holds|held|retained|retains)\s+(?:approximately\s+|about\s+|an?\s+)?\d{1,3}(?:\.\d+)?%(?:\s+(?:equity|ownership|minority|noncontrolling|economic|voting))?(?:\s+(?:interest|stake|investment))?\s+(?:in|of))\s+/i.exec(s);
      if (stake) {
        const list = /\binclude|including|such as|are|were|:/i.test(stake[0]);
        // A list runs to the end of its sentence ("CCEP; Monster; AC Bebidas ...; and Coca-Cola Bottlers Japan").
        const after = s.slice(stake.index + stake[0].length, stake.index + stake[0].length + (list ? 360 : 200)).split(/\.\s+(?=[A-Z])/)[0];
        const listed = findCompanies(after, dir);
        // The company the stake is in comes first ("interest in Altera"); a name further on ("97% of the combined
        // company, which is expected to be listed on the Nasdaq") is not it. A joint venture names its partner after
        // "with" ("a 15% equity interest in two joint ventures ... with affiliates of Tongfu Microelectronics").
        const jv = /^(?:a|an|the|two|three|several|its|our)?\s*(?:[\w-]+\s+){0,2}joint ventures?\b[^.;]{0,80}?\bwith\s+(?:(?:affiliates?|subsidiaries|a subsidiary)\s+of\s+)?/i.exec(after);
        const first = list ? listed : listed.filter((f) => f.index <= 6 || (jv && f.index === jv[0].length)).slice(0, 1);
        // Above half is a subsidiary, not a relation ("the Company owned approximately 97% of ChronoScale's
        // outstanding common stock"); a stake held only in the past is not one now.
        const majority = [...s.matchAll(/\b(?:own|owns|owned|hold|holds|held)\s+(?:approximately\s+|about\s+)?(\d{1,3}(?:\.\d+)?)%/gi)].some((m) => Number(m[1]) > 50);
        if (majority) for (const f of first) subsidiaries.add(relationKey(f));
        if (goneAt || GONE_STAKE.test(s)) for (const f of first) soldStakes.add(relationKey(f));
        if (majority || goneAt || GONE_STAKE.test(s)) continue;
        for (const f of first) add(f, 'investment', raw);
        if (first.length) continue;
      }
    }
    if (OWN_COMPETITOR.test(raw)) {
      const listStart = raw.startsWith('[competitors]') ? 0 : Math.max(0, s.search(/\b(?:include|includes|including|such as|with|against|from|are)\b/i));
      for (const f of findCompanies(s.slice(listStart), dir)) add(f, 'competitor', raw);
      continue;
    }
    if (among) continue;
    const supplies = SUBJECT_SUPPLIES.exec(s);
    const resells = SUBJECT_RESELLS.exec(s);
    const uses = WE_USE_FOR.exec(s);
    if (uses) {
      // The companies it names, with the short names it defines for them.
      const named = [...uses[1].matchAll(DEFINED)].map((m) => subjectParty(trailingName(m[1]))).filter((p): p is Found | { name: string } => !!p);
      const found = named.length ? named : partiesAt(uses[1], dir, true).filter((f) => !ownName(f.name));
      for (const p of found) add(p, 'supplier', raw);
      if (found.length) continue;
    }
    if (supplies || resells) {
      let any = false;
      for (const [m, role] of [[supplies, 'supplier'], [resells, 'customer']] as const) {
        if (!m) continue;
        for (const part of m[1].split(/\s+and\s+/)) {
          const p = subjectParty(part);
          if (p) {
            add(p, role, raw);
            any = true;
          }
        }
      }
      if (any) continue;
    }
    // "70% of our $58.8 billion in sales were from the U.S. Government": the government is one customer, with its share.
    const gov = governmentShare(s);
    if (gov) add({ name: 'U.S. Government' }, 'customer', raw, { share: gov.share, basis: 'target-revenue' });
    // "70% of our sales were from the U.S. Government, either as a prime contractor or as a subcontractor (including
    // 61% from U.S. Department of War (DoW)": the company is the subcontractor, and the list is of its customers.
    if (OWN_SUPPLIER.test(s) && !/\bas an? (?:prime contractor or (?:as an? )?)?(?:subcontractor|supplier|vendor|contract manufacturer)\b/i.test(s)) {
      const at = s.search(/\b(?:such as|including|include|includes|namely|like)\b/i);
      // "NVIDIA relies on suppliers such as TSMC": another company's suppliers.
      const lead = s.slice(0, Math.max(0, s.search(/\b(?:foundr(?:y|ies)|suppliers?|subcontractors?|contract manufacturers?|manufacturing partners?|vendors?|sole[- ]source|single[- ]source)\b/i)));
      const subject = findCompanies(lead, dir).filter((f) => !f.cik || f.cik !== self.cik);
      if (subject.some((f) => new RegExp(`${escapeRe(f.name.split(/[ ,]/)[0])}(?:'s)?\\s+(?:\\w+\\s+){0,2}(?:relies|depends|uses|sources|purchases|buys|procures|engages|outsources|suppliers?|vendors?)\\b`, 'i').test(lead))) continue;
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
  return ended.retainHistory ? out : out.filter((r) => stillHeld(r, ended));
}

/** Stakes the company's reports say were sold, and companies it owns more than half of: neither is a relation now. */
export interface EndedStakes {
  sold: Set<string>;
  subsidiaries: Set<string>;
  /** Names the company's filings give its subsidiaries, kept across its filings. */
  subsidiaryNames?: string[];
  /** Companies renamed ("formerly ..."): the old name, normalised, to the new. */
  renamed?: Map<string, string>;
  /** Lenders whose loan the filings say was repaid or ended. */
  repaid?: Set<string>;
  /** Short names the company's filings define for others ("Coca-Cola HBC AG ("CCHBC")"), kept across its filings. */
  aliases?: Map<string, string>;
  /**
   * Short names its filings define for companies with a legal form, listed or not ("Ablecom Technology, Inc.
   * ("Ablecom")"), kept across its filings: for statements that name a supplier as their subject.
   */
  legalNames?: Map<string, string>;
  /** Production retains lifecycle disclosures; legacy pure-classifier callers can request its original current-only view. */
  retainHistory?: boolean;
}

/** The name that ends a phrase ("Purchases from Ablecom Technology, Inc." → "Ablecom Technology, Inc."): its capitalised words, with the small words a name can hold ("Bank of America"). */
function trailingName(text: string): string {
  const words = text.trim().split(/\s+/);
  let i = words.length;
  while (i > 0 && (/^[A-Z0-9&(]/.test(words[i - 1]) || (/^(?:of|and|de|du|la|del|der|von|van)$/.test(words[i - 1]) && i > 1 && /^[A-Z]/.test(words[i - 2])))) i--;
  while (i < words.length && /^(?:of|and|de|du|la|del|der|von|van)$/.test(words[i])) i++;
  return words.slice(i).join(' ');
}

/** "Ablecom Technology, Inc." without its legal form; null for a name without one. */
function legalName(full: string): string | null {
  const m = /^(.*?[A-Za-z0-9)])\s*,?\s+(?:Inc|Incorporated|Ltd|Limited|LLC|L\.L\.C|Corp|Corporation|Co|Company|plc|PLC|GmbH|AG|SE|S\.A|N\.V|B\.V|Pte|Pty|K\.K|Co\., Ltd)\.?$/.exec(full.trim());
  return m && /^[A-Z]/.test(m[1]) ? m[1].trim() : null;
}

/**
 * A supplier named as the subject of its statement (Super Micro's 10-K of August 2026): "Ablecom is a major contract
 * manufacturer for us", "Ablecom manufactured approximately 95.3% of the chassis purchased by us", "Ablecom and
 * Compuware's sales to us constitute a majority of Ablecom's and Compuware's net sales". The names, and the role.
 */
const SUBJECT_PARTY = String.raw`((?:[A-Z][\w&.'’-]*)(?:\s+[A-Z][\w&.'’-]*){0,4}?(?:'s|’s)?(?:\s+and\s+[A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4}?(?:'s|’s)?)?)`;
const SUBJECT_SUPPLIES = new RegExp(
  String.raw`^(?:(?:In addition|Additionally|Also|Moreover|Further(?:more)?|However),\s+)?${SUBJECT_PARTY}\s+(?:` +
    String.raw`(?:is|was|has been|remains|serves as|acts as)\s+(?:both\s+)?(?:a|an|our|the)\s+[^.;]{0,80}?\b(?:contract manufacturers?|suppliers?|vendors?|foundry|subcontractors?|manufacturing partners?)\b[^.;]{0,40}?\b(?:for|to|of)\s+(?:us|the Company|our)\b` +
    String.raw`|(?:manufactured|produced|supplied|fabricated|assembled)\s+(?:approximately\s+|about\s+)?\d{1,3}(?:\.\d+)?%(?:,?\s+(?:and\s+)?\d{1,3}(?:\.\d+)?%)*\s+of\s+[^.;]{0,60}?\b(?:purchased|bought|procured)\s+by\s+(?:us|the Company)\b` +
    String.raw`|sales\s+to\s+(?:us|the Company)\s+(?:constitute|constitutes|comprise|comprises|represent|represents|are|were|make up|account for)\s+(?:a|the)\s+(?:majority|substantial|significant))`,
);
/** "We use Ablecom Technology, Inc. ("Ablecom") and its affiliate Compuware ..., for contract design and manufacturing". */
const WE_USE_FOR = /^We (?:use|engage|utilize|retain)\s+(.{3,240}?)\s*,?\s+for (?:contract )?(?:design|manufactur\w*|assembl\w*|production|fabricat\w*)\b/;
const SUBJECT_RESELLS = new RegExp(String.raw`^(?:(?:In addition|Additionally|Also|Moreover|Further(?:more)?),\s+)?${SUBJECT_PARTY}\s+(?:is|was|has been|remains|serves as|acts as)\s+(?:both\s+)?(?:a|an|our|the)\s+(?:[\w-]+\s+){0,2}(?:distributors?|resellers?)\s+(?:of|for)\s+(?:our|the Company's|its)\s+products\b`);

/** "Coca-Cola Europacific Partners plc ("CCEP")": a company and the short name a filing gives it. */
const DEFINED = /([A-Z][A-Za-z0-9&.,'’ -]{2,90}?)\s*\((?:collectively,?\s+|together,?\s+)?(?:the\s+)?["“]([A-Z][A-Za-z0-9&.-]{1,24})["”]\)/g;
/** Short names that stand for no one company. */
const GENERIC_ALIAS = /^(?:Company|Corporation|Registrant|Group|Parent|Issuer|Borrower|Lender|Lenders|Agent|Agreement|Notes|Plan|Partnership|Fund|Trust|Bank|Purchaser|Seller|Buyer|Investor|Customer|Supplier|Licensee|Licensor|Transaction|Merger|Closing|JV|Venture)$/;

/** The short names a filing defines for companies the app knows, as short name → full name. */
export function definedNames(sentences: string[], dir: Directory, into = new Map<string, string>()): Map<string, string> {
  for (const s of sentences) {
    for (const m of s.matchAll(DEFINED)) {
      const alias = m[2];
      if (GENERIC_ALIAS.test(alias) || into.has(alias)) continue;
      const full = m[1];
      const found = findCompanies(full, dir);
      const last = found[found.length - 1];
      // The name must run up to the parenthesis ("..., an equity method investee, Coca-Cola HBC AG").
      if (!last || full.length - last.index > 40 || normalizeName(alias) === normalizeName(last.name)) continue;
      into.set(alias, last.name);
    }
  }
  return into;
}

/** A sentence with the filing's short names written out, so they are found as the companies they stand for. */
function expandAliases(s: string, aliases: Map<string, string> | undefined): string {
  if (!aliases?.size) return s;
  let out = s;
  for (const [alias, full] of aliases) {
    // Not inside a longer name ("JPMorgan Chase Bank, N.A." where "JPMorgan" is short for JPMorgan Chase & Co.).
    out = out.replace(new RegExp(String.raw`(?<![\w"“-]|[A-Z][\w&.-]*\s)${escapeRe(alias)}(?![\w"”-]|\s+[A-Z&])`, 'g'), full);
  }
  return out;
}

export function stillHeld(r: Relation, ended: EndedStakes): boolean {
  return !ended.subsidiaries.has(r.key) && !(r.role === 'investment' && ended.sold.has(r.key)) && !(r.role === 'lender' && ended.repaid?.has(r.key));
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

/** Of the company's purchases: "of our total purchases", "of the Company's purchases of raw materials", "of total cost of sales". */
const PURCHASES_OF = String.raw`of\s+(?:the\s+)?(?:(?:our|the Company's|the Company’s|the Group's|the Group’s)\s+)?(?:(?:total|aggregate|net)\s+)*(?:purchases|inventory purchases|raw material purchases|purchasing|products purchased|cost of (?:sales|revenues?|goods sold))\b`;
const SHARE_RUN = String.raw`(\d{1,3}(?:\.\d{1,2})?\s?(?:%|percent\b)(?:\s*,?\s*(?:and\s+)?\d{1,3}(?:\.\d{1,2})?\s?(?:%|percent\b))*)`;
/** Unnamed suppliers: "One supplier", "two vendors", "our single largest supplier", "The Company's two largest suppliers". */
const UNNAMED_SUPPLIERS = String.raw`(?<!\b[Nn]o\s)(?<!\b[Nn]o other\s)\b(?:(?:[Oo]ne|[Aa] single|[Tt]wo|[Tt]hree|[Tt]hese (?:two|three))\s+(?:of (?:our|its) )?|(?:[Oo]ur|[Tt]he Company's|[Tt]he Company’s|[Ii]ts)\s+(?:(?:one|single|two|three)\s+)?largest\s+)(?:suppliers?|vendors?)`;
const SUPPLIER_SHARE = [
  // "two suppliers accounted for 42% and 17% of the Company's total purchases"; "The Company's largest supplier
  // accounted for approximately 52%, 50% and 47% of total purchases during 2025, 2024 and 2023, respectively".
  new RegExp(String.raw`(${UNNAMED_SUPPLIERS})(?:,[^,;.]{0,60},)?\s+(?:each\s+|individually\s+)?(?:accounted for|represented|comprised)\s+(?:approximately\s+|about\s+)?${SHARE_RUN}(?:,?\s*respectively,?)?\s+${PURCHASES_OF}`),
  // Super Micro's 10-K: "One supplier accounted for a significant portion of our total purchases in fiscal year 2026 of 63.1%".
  new RegExp(String.raw`(${UNNAMED_SUPPLIERS})\s+accounted for a (?:significant|substantial) portion\s+${PURCHASES_OF}\s+(?:in|for|during)\s+[^.;%]{0,40}?\bof\s+${SHARE_RUN}`),
];

/**
 * Suppliers a report counts without naming them, with each one's share of the company's purchases ("One supplier
 * accounted for ... 63.1%"): one share for each supplier the report counts, for the latest year when it gives several.
 * Suppliers counted together ("two suppliers accounted for 87% of products purchased") have no share each, and none
 * is taken; nor from "No single supplier accounted for more than 5%".
 */
export function unnamedSupplierShares(sentence: string): number[] {
  const s = sentence.replace(/\s+/g, ' ');
  for (const re of SUPPLIER_SHARE) {
    const m = re.exec(s);
    if (!m) continue;
    const subject = m[1].toLowerCase();
    const count = /\bthree\b/.test(subject) ? 3 : /\btwo\b/.test(subject) ? 2 : 1;
    const values = [...m[2].matchAll(/(\d{1,3}(?:\.\d{1,2})?)\s?(?:%|percent)/g)].map((x) => Number(x[1]));
    if (values.length === count) return values;
    if (count > 1) return [];
    const latest = latestOfRun(s, values, m.index + m[0].length);
    return latest == null ? [] : [latest];
  }
  return [];
}

/** Of a run of figures for several years ("52%, 50% and 47% ... during 2025, 2024 and 2023"), the latest year's. */
function latestOfRun(s: string, values: number[], end: number): number | undefined {
  const unique = (list: string[]) => list.filter((y, i, a) => a.indexOf(y) === i).map(Number);
  const after = unique(s.slice(end, end + 140).match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const years = after.length === values.length ? after : unique(s.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  return years.length === values.length ? values[years.indexOf(Math.max(...years))] : undefined;
}

/**
 * The U.S. Government as a customer, with "U.S." written "US" (governmentShare drops the dots); not "non-U.S. government
 * customers" or sales "through the U.S. government".
 */
const US_GOV = String.raw`(?<!non-)(?<!through\s(?:the\s)?)(?:the\s+)?(?:US|United States)\s+(?:[Ff]ederal\s+)?[Gg]overnment|(?<!non-)(?:the\s+)?[Ff]ederal\s+[Gg]overnment`;
/** The company's whole revenue: "of our $58.8 billion in sales", "of the Company's total revenues", "of our 2025 revenues". */
const GOV_OF = String.raw`of\s+(?:(?:our|the Company's|the Company’s)\s+)?(?:(?:19|20)\d{2}\s+)?(?:\$[\d.,]+\s+(?:billion|million)\s+in\s+)?(?:(?:total|net|consolidated)\s+)*(?:revenues?|net sales|sales)\b`;
const GOV_RUN = String.raw`(\d{1,3}(?:\.\d{1,2})?\s?(?:%|percent\b)(?:\s*,?\s*(?:and\s+)?\d{1,3}(?:\.\d{1,2})?\s?(?:%|percent\b))*)`;
/** The period a figure is for, between the revenue and its source: "in fiscal 2025, 2024 and 2023", "for the years ended ...". */
const GOV_PERIOD = String.raw`(?:\s+(?:in|for|during)\s+[^.;%]{0,100}?)?`;
/** The source of the revenue: "contracts with an agency or department of the U.S. government", "sales to a variety of". */
const GOV_FROM = String.raw`(?:(?:prime\s+)?contracts?\s+with\s+|sales\s+to\s+)?(?:a variety of\s+)?(?:(?:an?\s+)?(?:agency|agencies)(?:\s+or\s+departments?)?\s+of\s+)?(?:${US_GOV})`;
/** Words between the government and its figure, without another group's sales coming in between ("while sales to ..."). */
const GOV_GAP = String.raw`(?:(?!\b(?:while|whereas)\b|\b(?:[Ss]ales|[Rr]evenues?)\s+(?:to|from)\b|\d\s?percent\b)[^.;%]){0,200}?`;
const GOV_SHARE = [
  // "70% of our $58.8 billion in sales were from the U.S. Government"; "98% of the Company's revenue was generated from
  // contracts with an agency or department of the U.S. government"; "35% of our revenues were earned pursuant to U.S.
  // government contracts"; "51%, 59%, and 55% of consolidated revenues for the years ended ..., respectively were derived
  // from contracts with the United States federal government".
  new RegExp(String.raw`${GOV_RUN}\s*,?\s*(?:respectively,?\s+)?${GOV_OF}${GOV_PERIOD},?\s*(?:respectively,?\s+)?(?:was|were|came)\s+(?:(?:derived|generated|earned)\s+)?(?:from|attributable to|pursuant to|under)\s+${GOV_FROM}`),
  // "we generated approximately 83% and 85%, respectively, of total revenues from contracts with the U.S. government";
  // "We derived 72% of our total consolidated sales from the U.S. Government in 2025".
  new RegExp(String.raw`\b(?:generated|derived|derive|earned|received)\s+(?:approximately\s+|about\s+)?${GOV_RUN},?\s*(?:respectively,?\s+)?${GOV_OF}${GOV_PERIOD}\s+from\s+${GOV_FROM}`),
  // "Sales to the U.S. government, either as a prime contractor or subcontractor ..., represented approximately 85% of
  // our revenue"; "revenues from federal government contracts ... accounting for 95.6% and 95.7% of our total revenues";
  // "U.S. Government contracts comprised approximately 68% of our total consolidated revenues".
  new RegExp(String.raw`(?:\b(?:[Ss]ales|[Rr]evenues?)\s+(?:to|from)\s+${GOV_FROM}|(?:${US_GOV})\s+contracts\b)${GOV_GAP}\b(?:accounted for|accounting for|represented|representing|comprised|constituted|generated|was|were)\s+(?:approximately\s+|about\s+)?${GOV_RUN}\s+${GOV_OF}`),
  // "The percentage of our revenue that was derived from sales to U.S. Government customers, ..., was 74% for year to
  // date 2026".
  new RegExp(String.raw`\b[Pp]ercentage of our (?:total )?revenues? (?:that )?(?:was|were) derived from sales to (?:${US_GOV})[^.;%]{0,200}?\bwas\s+(?:approximately\s+)?${GOV_RUN}`),
  // "Our primary customer is the U.S. Government, from which we derived 70% of our sales during the nine months ...";
  // Northrop Grumman's "84 percent of our sales in 2025".
  new RegExp(String.raw`(?:${US_GOV}),?\s+from which we deriv(?:e|ed)\s+(?:approximately\s+)?${GOV_RUN}\s+${GOV_OF}`),
];

/**
 * The U.S. Government's share of the company's revenue, as its report states it: for several years, the latest year's;
 * for "the three and six months ended", the longer period's (the period sharePeriod names). A segment's share ("of our
 * Government Operations segment revenues") is not the company's. Null when the sentence states no share for it; a
 * share undefined when it gives figures for several periods it does not tell apart.
 */
export function governmentShare(sentence: string): { share: number | undefined } | null {
  const s = sentence.replace(/\s+/g, ' ').replace(/\bU\.\s?S\.(?!\w)/g, 'US');
  for (const re of GOV_SHARE) {
    const m = re.exec(s);
    if (!m) continue;
    const values = [...m[1].matchAll(/(\d{1,3}(?:\.\d{1,2})?)\s?(?:%|percent)/g)].map((x) => Number(x[1]));
    if (values.length === 1) return { share: values[0] };
    if (values.length === 2 && /\b(?:three|six|nine) and (?:six|nine|twelve) months\b/.test(s)) return { share: values[1] };
    return { share: latestOfRun(s, values, m.index + m[0].length) };
  }
  return null;
}

// ------------------------------------------------- agreements in its own filings

/** A counterparty described without its name (electron/supply-chain.cjs UNNAMED_PARTY). */
const UNNAMED_PARTY = /^(?:a|an|the same|another|one|its)\s+((?:[\w.,-]+\s+){0,6}?)(hyperscalers?|customers?|tenants?|OEMs?|automakers?|carriers?|utilit(?:y|ies)|retailers?|operators?|cloud (?:service )?providers?|(?:technology|semiconductor|software|automotive|energy|telecommunications|pharmaceutical) compan(?:y|ies))\b/i;
const QUALIFIER_FILLER = /^(?:new|second|third|fourth|fifth|additional|existing|leading|major|large|largest|single|same|high|certain|prospective|potential|based|global|well-known|key|significant|top)$/i;

/**
 * "a new U.S. based high investment-grade hyperscaler" → { key: 'unnamed:investment grade hyperscaler', label:
 * 'Unnamed U.S. investment-grade hyperscaler' }; null for a bare "a customer", which says nothing of who it is.
 */
export function unnamedParty(text: string, sentence = ''): { key: string; label: string; end: number } | null {
  const m = UNNAMED_PARTY.exec(text);
  if (!m) return null;
  let noun = m[2].toLowerCase().replace(/ies$/, 'y').replace(/(?<=[a-z])s$/, '').replace(/^oem$/, 'OEM');
  const US = /^U\.?S\.?(?:-based)?$/i;
  // "a second U.S.-based investment-grade hyperscaler" is another party than the first; "the same ... hyperscaler" in a
  // sentence about "the second hyperscaler's" infrastructure is that second one.
  // "a third hyperscale tenant" counts tenants (CoreWeave, then two hyperscalers): it names no new party.
  const counting = /\bhyperscale\s+$/i.test(m[1]) && /^(?:tenants?|customers?)$/i.test(m[2]);
  const ordinal = counting
    ? undefined
    : /(?:^|\s)(second|third|fourth|fifth)\s/i.exec(` ${m[1]}`)?.[1]?.toLowerCase() ??
    (/^the same\b/i.test(m[0]) ? new RegExp(String.raw`\b(second|third|fourth|fifth)\s+(?:[\w.-]+\s+){0,4}${m[2].replace(/s$/i, '')}`, 'i').exec(sentence)?.[1]?.toLowerCase() : undefined);
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
  if (ordinal) return { key: `unnamed:${ordinal} ${normalizeName(core)}`, label: `Unnamed ${ordinal} ${us ? 'U.S. ' : ''}${core}`, end: m[0].length };
  return { key: `unnamed:${normalizeName(core)}`, label: `Unnamed ${us ? 'U.S. ' : ''}${core}`, end: m[0].length };
}

/** A deal the sentence makes a condition of something else ("conditioned upon ... executing a lease with a hyperscaler"): not one made. */
const CONDITION = /\b(?:condition(?:ed|s|al)?|subject to|based on (?:the Company |us |our )?entering|if (?:the following|certain|one or more)|upon (?:the )?(?:execution|signing)|executing|execution of|are met)\b/i;

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

/** The periods of a company's legal form ("Meta Platforms, Inc. (Meta) and Meta agreed to deploy"), which end no sentence. */
const LEGAL_FORM_DOT = /\b(?:Inc|Corp|Co|Ltd|Plc|Bhd|Pty|S\.A|N\.V|L\.P|L\.L\.C|S\.p\.A)\./g;

export function dealRole(before: string, rawAfter: string, sentence: string, self?: RegExp): Role | null {
  const b = dealClause(before);
  const after = rawAfter.replace(LEGAL_FORM_DOT, (m) => m.replace(/\./g, ''));
  // "a product purchase agreement with OpenAI to deploy 6 gigawatts of AMD GPUs": the party buys the filer's products.
  if (/\b(?:product |master |supply and )?purchase agreements?\b/i.test(b) && self) {
    const own = new RegExp(String.raw`^(?:'s)?,?[^.;]{0,140}?\b(?:to (?:deploy|purchase|buy|acquire|use)|for (?:the )?(?:purchase|deployment) of)\b[^.;]{0,140}?(?:\bour\b|${self.source})`, 'i');
    if (own.test(after)) return 'customer';
    // "Meta agreed to a binding commitment under the Agreement to purchase ... certain AMD Instinct GPU products".
    if (/^(?:'s)?[^.;]{0,60}?\bagreed to\b[^.;]{0,80}?\b(?:purchase|buy|deploy)\b/i.test(after)) return 'customer';
  }
  if (AGENT_PARTY.test(after)) return null;
  if (/\b(?:securities purchase|unit purchase|unit subscription|subscription|investment agreement|investment from|invest(?:s|ed|ing)? (?:up to )?\$|private placement|preferred (?:equity|stock|units)|equity (?:investment|financing)|strategic investment)\b/i.test(b)) return 'investor';
  // "proceeds of the GPU Financing ... in support of the Group's agreement with Microsoft": the loan is someone else's.
  if (LOAN.test(b) && !/\bin (?:support|connection|respect) (?:of|with) (?:the|our|its|the Group's|the Company's) (?:[\w-]+\s+){0,3}(?:agreement|contract)\s*,?\s*$/i.test(b)) return 'lender';
  // "a $5.0 billion AI infrastructure partnership with Macquarie Asset Management": financing called a partnership.
  if (/\bpartnership\b/i.test(b) && /\$\s?[\d.,]+\s*(?:billion|million)/i.test(`${b} ${after.slice(0, 120)}`) && /^(?:[A-Z][\w&.-]*\s+){0,3}(?:Asset Management|Capital|Infrastructure Partners|Investments?|Investment Management|Fund|Bank|Credit)\b/.test(after)) return 'investor';
  // "secured several new multi-year contracts, including a landmark partnership with Microsoft ... new customer segments".
  if (/\b(?:secured|signed|won|awarded|landed)\b[^.;]{0,80}\bcontracts?\b[^.;]{0,60}\bincluding\b[^.;]{0,40}\bpartnership\s*$/i.test(before.slice(-200)) && /\bcustomers?\b/i.test(sentence)) return 'customer';
  if (/^[^;]{0,80}?,?\s+as\s+(?:the\s+)?(?:administrative|collateral) agent\b/i.test(after)) return /\bcredit\b/i.test(sentence) ? 'lender' : null;
  if (NOT_A_DEAL.test(b)) return null;
  if (/\b(?:partnership|partnered|partners?|collaborat\w*|alliance)\b/i.test(b)) {
    // "a strategic partnership with Meta ... including the large-scale deployment of NVIDIA CPUs", "collaboration with
    // Microsoft to deploy AMD Helios racks": the party buys the filer's products.
    if (self && new RegExp(String.raw`^(?:'s)?,?[^;]{0,160}?\b(?:deploy(?:ment|ing|s)?\s+of|to (?:deploy|use|adopt|run))\s+(?:the\s+)?(?:[\w-]+\s+){0,2}?(?:${self.source})`, 'i').test(after)) return 'customer';
    // "a new collaboration with Samsung to manufacture advanced semiconductors": the party makes them for the filer.
    if (/^(?:'s)?,?[^.;]{0,60}?\bto (?:manufacture|produce|fabricate|make)\b/i.test(after)) return 'supplier';
  }
  if (/\b(?:partnership|partnered|partners?|collaborat\w*|alliance|joint venture|joint development|co-develop\w*)\b/i.test(b)) return 'partner';
  // Licences: "a license agreement with Almirall, under which Almirall licensed the rights", "licensed from OPKO". Data
  // center space licensed to a tenant is a lease.
  if (/\b(?:licen[cs]e (?:and \w+ )?agreements?|licensing agreements?|licensed (?:from|to)|in-licens\w*|exclusive licen[cs]e)\b/i.test(b)) return HOST_LEASE.test(sentence) ? 'customer' : 'partner';
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
  // Another firm's executive quoted in the release speaks of that firm's dealings.
  const quoted = /([A-Z][\w&.]+(?:\s+[A-Z][\w&.]+){0,3})\s+(?:Managing Director|Managing Partner|Partner|Chief Executive Officer|CEO|President|Chairman|Founder)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2},?\s+said\b/.exec(s);
  if (quoted && self) {
    self.lastIndex = 0;
    if (!self.test(quoted[1])) return out;
  }
  const seen = new Set<string>();
  const push = (role: Role, party: OwnStatement['party']) => {
    const k = `${role}|${'key' in party ? party.key : relationKey(party)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ role, party });
  };
  const re = /\b(with|from|by|on|to)\s+/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const word = m[1];
    const at = m.index + m[0].length;
    const before = s.slice(Math.max(0, m.index - 200), m.index);
    const rest = s.slice(at);
    const clause = before.split(/[;]/).pop() ?? before;
    let role: Role | null = null;
    let loose = false;
    if (word === 'to') {
      // "Polaris Forge 2, its AI Factory campus ... currently leased to Oracle": the company is the landlord and the
      // tenant its customer. Not "leased to us" (no company follows) nor another landlord's lease.
      if (!/\b(?:leased|subleased|rented)\s+(?:[\w-]+\s+){0,2}$/i.test(before)) continue;
      if (otherSubject(s.slice(0, m.index), dir, self)) continue;
      const u = unnamedParty(rest, s);
      if (u) {
        push('customer', { name: u.label, unnamed: true, key: u.key });
        continue;
      }
      for (const p of partiesAt(rest, dir, true).slice(0, 1)) push('customer', p);
      continue;
    }
    if (word === 'with') {
      if (!/\b(?:agreements?|leases?|contracts?|orders?|partnership|collaboration|alliance|joint venture|facility|facilities|notice to proceed|LNTP|memorandum of understanding|letter of intent|offtake|partnered|collaborat\w*)\b/i.test(clause)) continue;
      if (otherSubject(s.slice(0, m.index), dir, self)) continue;
      if (CONDITION.test(clause.slice(-160))) continue;
      const u = unnamedParty(rest, s);
      if (u) {
        role = dealRole(before, rest.slice(u.end), s, self);
        if (role) push(role, { name: u.label, unnamed: true, key: u.key });
        continue;
      }
      loose = LOAN.test(clause) || /\bpartner|collaborat|alliance|joint venture/i.test(clause);
      const parties = partiesAt(rest, dir, loose);
      if (!parties.length) continue;
      role = dealRole(before, rest.slice(parties[parties.length - 1].index), s, self);
      if (role) for (const p of parties) push(role, p);
      // "Announced an investment and deep technology partnership with Anthropic": a stake as well as a partnership.
      if (role === 'partner' && /\ban? (?:equity |strategic )?investment (?:in and|and)\b[^.;]{0,60}\bpartnership\s*$/i.test(clause)) for (const p of parties) push('investment', p);
      continue;
    }
    if (word === 'from') {
      // "we had no sales to and immaterial purchases from Green Earth": no dealing worth a relation.
      if (/\b(?:immaterial|insignificant|nominal|minimal|de minimis|no)\s+(?:purchases?|sales|amounts?)\s+$/i.test(before)) continue;
      if (/\b(?:orders?|contracts?|awards?)\s+$/i.test(before) || (/\b(?:revenue|revenues|sales)\s+(?:(?:generated|earned|derived)\s+)?$/i.test(before) && /\bcustomers?\b/i.test(s) && !/\bexclud\w*/i.test(before))) role = 'customer';
      else if (/\binvestments?\s+$/i.test(before)) role = 'investor';
      // "Ngenla is licensed from OPKO Health": a licence is a partnership, not a purchase.
      else if (/\b(?:licen[cs]ed|in-licensed|sublicensed)\s+(?:[\w-]+\s+){0,3}$/i.test(before)) role = 'partner';
      else if (/\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b([^.;]{0,100})$/i.test(clause)) {
        const object = /\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b([^.;]{0,100})$/i.exec(clause)?.[1] ?? '';
        if (/\b(?:shares?|stock|notes|securities|interests?|units|warrants|assets|business|land|property|properties|subsidiar\w+|entity|acquisition|acquir\w*|rights)\b/i.test(object)) continue;
        // "the termination of the Share Purchase Agreement whereby NVIDIA would have acquired Arm from SoftBank".
        if (/\b(?:share|stock|asset|equity|unit|membership interest) purchase agreement|\bterminat\w*/i.test(clause)) continue;
        // "copies of which may be obtained from D.F. King & Co.": documents, not supplies.
        if (/\b(?:copies|documents?|information|materials|prospectus|offer to purchase)\b/i.test(clause)) continue;
        // "Quartile ranking sourced from Morningstar, Lipper and Nomura": the source a figure cites, not a purchase.
        if (/\b(?:rankings?|ratings?|data|statistics|figures|estimates|forecasts?|scores?|indices|index|quotes?|surveys?)\s+(?:(?:is|are|was|were)\s+)?(?:sourced|obtained)\s+$/i.test(before)) continue;
        role = 'supplier';
      }
    } else if (word === 'on') {
      if (!/\b(?:rely|relies|relied|depend|depends|depended|dependent|reliant)\s+(?:heavily |substantially |significantly |primarily )?$/i.test(before)) continue;
      // The company itself relies: "we rely on", "the Company depends on"; not "clients often rely on".
      if (!/\b(?:[Ww]e|[Oo]ur|[Tt]he Company|[Tt]he Group|[Ii]t)\b[^.;]{0,40}$/.test(before)) continue;
      role = /^[^.;]{0,80}\bfor (?:a |the )?(?:significant|substantial|large|majority|portion|most|all)[^.;]{0,40}\b(?:revenue|revenues|sales)\b/i.test(rest) ? 'customer' : 'supplier';
    } else if (word === 'by') {
      // "Our products are manufactured by Foxconn"; not a glossary's "credit reports produced by Fair Isaac Corporation".
      if (/\b(?:manufactured|produced|supplied|fabricated|assembled)\s+$/i.test(before) && /\b(?:[Oo]ur|[Ww]e|[Uu]s|[Tt]he Company(?:'s)?|[Tt]he Group(?:'s)?)\b/.test(clause)) role = 'supplier';
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

/** Words a group's units add to its name in government records: "Northrop Grumman Systems", "General Dynamics Land Systems". */
const UNIT_WORD = new Set('systems system services technologies technology information electronic electronics integration land marine mission space aeronautics aeronautical aerospace rotary defense defence federal government usg operations international global america usa us north and support manufacturing'.split(' '));
let aliasIndex: Map<string, string> | null = null;

/**
 * A company named in government records ("NORTHROP GRUMMAN SYSTEMS CORPORATION") as the listed company it belongs
 * to, by its name or a group's name with a unit's words after it; otherwise as written.
 */
export function federalParty(name: string, dir: Directory): FedParty {
  aliasIndex ??= new Map(
    Object.entries(ALIASES)
      .flatMap(([t, a]) => [...a.legal, ...a.names].map((n): [string, string] => [normalizeName(n), t]))
      .filter(([k]) => k.length >= 4 && !COMMON.has(k)),
  );
  // "BOEING COMPANY, THE" is The Boeing Company.
  let words = normalizeName(name.replace(/,\s*THE\s*$/i, '')).split(' ').filter(Boolean);
  while (words.length) {
    const k = words.join(' ');
    // "HUNTINGTON INGALLS INCORPORATED" is Huntington Ingalls Industries.
    const hit = dir.byName.get(k) ?? (words.length >= 2 ? dir.byName.get(`${k} industries`) : undefined);
    if (hit) return { key: relationKey(hit), ...hit };
    const listed = aliasIndex.has(k) ? dir.byTicker.get(aliasIndex.get(k)!) : undefined;
    if (listed) {
      const f = { name: knownName(listed.ticker) ?? listed.title, ticker: listed.ticker, cik: listed.cik };
      return { key: relationKey(f), ...f };
    }
    if (words.length <= 1 || !UNIT_WORD.has(words[words.length - 1])) break;
    words = words.slice(0, -1);
  }
  return { key: relationKey({ name }), name };
}

const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
const MONTH_ABBR: Record<string, string> = { january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', may: 'May', june: 'Jun', july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec' };

/**
 * The period a share is stated for: "Q2 FY2027" ("For the second quarter of fiscal year 2027"), "FY2026" ("During
 * fiscal year 2026"), "3M to Aug 2026" ("for the three months ended August 31, 2026"), "Year to Dec 2025"; else the
 * latest year named, or '' when none.
 */
export function sharePeriod(sentence: string): string {
  const s = sentence.replace(/\s+/g, ' ');
  let m = /\b(first|second|third|fourth) (?:fiscal )?quarter of (?:fiscal )?(?:year )?(\d{4})\b/i.exec(s);
  if (m) return `Q${ORDINAL[m[1].toLowerCase()]} FY${m[2]}`;
  // "for the three months ended", "For the three month period ended", "the 3-month period ended".
  m = /\b(three|six|nine|twelve|3|6|9|12)[- ]months?(?: periods?)? ended ([A-Z][a-z]+) \d{1,2}, (\d{4})\b/i.exec(s);
  if (m && MONTH_ABBR[m[2].toLowerCase()]) {
    const n = ({ three: 3, six: 6, nine: 9, twelve: 12 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]);
    return n === 12 ? `Year to ${MONTH_ABBR[m[2].toLowerCase()]} ${m[3]}` : `${n}M to ${MONTH_ABBR[m[2].toLowerCase()]} ${m[3]}`;
  }
  // "During the quarter ended March 29, 2026": three months.
  m = /\bquarter ended ([A-Z][a-z]+) \d{1,2}, (\d{4})\b/.exec(s);
  if (m && MONTH_ABBR[m[1].toLowerCase()]) return `3M to ${MONTH_ABBR[m[1].toLowerCase()]} ${m[2]}`;
  m = /\b(?:fiscal )?years? ended ([A-Z][a-z]+) \d{1,2}, (\d{4})\b/.exec(s);
  if (m && MONTH_ABBR[m[1].toLowerCase()]) return `Year to ${MONTH_ABBR[m[1].toLowerCase()]} ${m[2]}`;
  m = /\bfiscal (?:year )?(\d{4})\b|\bFY ?(\d{4})\b/i.exec(s);
  if (m) return `FY${m[1] ?? m[2]}`;
  const y = statementYear(s);
  return y ? String(y) : '';
}

/** How many months a period label covers: "6M to Jun 2026" 6, "Q2 FY2027" 3, a year 12. */
export function periodMonths(label: string): number {
  const m = /^(\d+)M\b/.exec(label);
  if (m) return Number(m[1]);
  return /^Q\d/.test(label) ? 3 : label ? 12 : 0;
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
const MONTH_NUM: Record<string, string> = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };

/** The date a sentence gives its event ("On October 22, 2025, we entered into ..."), YYYY-MM-DD; '' without one. */
export function eventDate(sentence: string): string {
  const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+((?:19|20)\d{2})\b/.exec(sentence);
  return m ? `${m[3]}-${MONTH_NUM[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}` : '';
}

/** The sites a sentence says are leased to the named company: "Polaris Forge 2, its AI Factory campus ... currently leased to Oracle". */
export function leasedSites(sentence: string, name: string): string[] {
  const head = name.split(/[\s,]+/)[0];
  const at = new RegExp(`\\b(?:leased|subleased|rented)\\s+(?:[\\w-]+\\s+){0,2}to\\s+(?:the\\s+)?${escapeRe(head)}`, 'i').exec(sentence);
  if (!at) return [];
  const before = sentence.slice(Math.max(0, at.index - 200), at.index);
  const sites = [...before.matchAll(/\b((?:[A-Z][a-z]+ ){1,3}\d{1,2})\b/g)].map((m) => m[1].trim());
  return sites.length ? [sites[sites.length - 1]] : [];
}

export function mergeRelations(list: Relation[], options: { preserveRoles?: boolean; strictIdentity?: boolean } = {}): Relation[] {
  const by = new Map<string, Relation>();
  const shareFrom = new Map<string, { date: string; year: number }>();
  for (const r of list) {
    const k = `${r.key}|${r.role}${options.strictIdentity && relationKind(r) === 'concentration' ? `|${evidenceIdentity(r.evidence[0])}` : ''}`;
    const have = by.get(k);
    const ev = r.evidence[0];
    const at = { date: ev?.date ?? '', year: statementYear(ev?.sentence ?? '') };
    if (!have) {
      by.set(k, { ...r, evidence: [...r.evidence] });
      if (r.share != null) shareFrom.set(k, at);
      continue;
    }
    for (const e of r.evidence) if (!have.evidence.some((x) => evidenceIdentity(x) === evidenceIdentity(e))) have.evidence.push(e);
    if (r.assertions) have.assertions = [...new Map([...(have.assertions ?? []), ...r.assertions].map((a) => [a.id, a])).values()];
    if (r.observations) have.observations = [...new Map([...(have.observations ?? []), ...r.observations].map((a) => [a.id, a])).values()];
    const prev = shareFrom.get(k);
    const later = !prev || at.date > prev.date || (at.date === prev.date && at.year > prev.year);
    // A share stated by the target itself wins, then the latest; a share beats none.
    if (r.share != null && (have.share == null || (r.basis === 'target-revenue' && have.basis !== 'target-revenue') || (later && (r.basis === have.basis || have.basis !== 'target-revenue')))) {
      have.share = r.share;
      have.qualifier = r.qualifier;
      have.basis = r.basis;
      shareFrom.set(k, at);
      if (ev) have.evidence = [ev, ...have.evidence.filter((x) => evidenceIdentity(x) !== evidenceIdentity(ev))];
    }
    // Government records add to what the filings say; the filings decide who states it.
    if (r.side !== have.side && r.side !== 'records') have.side = have.side === 'records' ? r.side : 'both';
    if (r.amount != null) have.amount = Math.max(have.amount ?? 0, r.amount);
    have.ticker ??= r.ticker;
    have.id ??= r.id;
    have.yahoo ??= r.yahoo;
  }
  // The production graph preserves anonymous disclosures. A later, explicit site naming is recorded as a
  // dated link; moving older evidence onto a named entity would rewrite what was known at the time.
  if (options.strictIdentity) {
    for (const u of by.values()) {
      if (!u.unnamed || u.role !== 'customer' || relationKind(u) !== 'entity') continue;
      const candidates = [...by.values()].filter((r) => !r.unnamed && r.role === u.role).flatMap((r) => r.evidence.flatMap((e) => {
        const sites = leasedSites(e.sentence, r.name).filter((site) => u.evidence.some((old) => new RegExp(`\\b${escapeRe(site)}\\b`).test(old.sentence)));
        return sites.length ? [{ r, e, sites }] : [];
      }));
      if (new Set(candidates.map(({ r }) => r.key)).size !== 1) continue;
      u.identityLinks = candidates.map(({ r, e, sites }) => ({ entityKey: r.key, name: r.name, ticker: r.ticker, cik: r.cik, id: r.id, yahoo: r.yahoo, evidence: e, proof: `Same explicitly named leased site: ${sites.join(', ')}` }));
    }
    return [...by.values()];
  }
  // A site a filing says is "leased to Oracle" ("Polaris Forge 2"): statements on an unnamed tenant at that site are
  // about the named one.
  for (const r of [...by.values()]) {
    if (r.unnamed || r.role !== 'customer') continue;
    const sites = new Set(r.evidence.flatMap((e) => leasedSites(e.sentence, r.name)));
    if (!sites.size) continue;
    for (const [k, u] of by) {
      if (!u.unnamed || u.role !== 'customer') continue;
      const moved = u.evidence.filter((e) => [...sites].some((site) => new RegExp(`\\b${escapeRe(site)}\\b`).test(e.sentence)));
      if (!moved.length) continue;
      for (const e of moved) if (!r.evidence.some((x) => evidenceIdentity(x) === evidenceIdentity(e))) r.evidence.push(e);
      u.evidence = u.evidence.filter((e) => !moved.includes(e));
      if (!u.evidence.length) by.delete(k);
      if (r.side !== u.side) r.side = r.side === 'records' ? u.side : r.side;
    }
  }
  // An unnamed party described more loosely elsewhere ("a hyperscaler") is the one described more fully ("an
  // investment-grade hyperscaler") when there is only one such.
  const ORDINAL_KEY = /^unnamed:(?:second|third|fourth|fifth) /;
  // "A U.S.-based hyperscaler" beside "a second U.S.-based hyperscaler", when a named tenant took the first one's
  // statements by its site: the plain one is that first tenant before the second one's first lease, the second after.
  for (const [k, g] of [...by.entries()]) {
    if (!g.unnamed || ORDINAL_KEY.test(k)) continue;
    const words = k.replace(/^unnamed:/, '').split(' ');
    const second = [...by.entries()].find(([k2]) => k2.startsWith('unnamed:second ') && words.every((w) => k2.slice('unnamed:second '.length).split(' ').includes(w)))?.[1];
    const first = [...by.values()].find((r) => !r.unnamed && r.role === g.role && r.evidence.some((e) => leasedSites(e.sentence, r.name).length));
    if (!second || !first) continue;
    const starts = second.evidence.map((e) => eventDate(e.sentence) || e.date).filter(Boolean).sort();
    if (!starts.length) continue;
    for (const e of g.evidence) {
      const into = (eventDate(e.sentence) || e.date) < starts[0] ? first : second;
      if (!into.evidence.some((x) => evidenceIdentity(x) === evidenceIdentity(e))) into.evidence.push(e);
    }
    by.delete(k);
  }
  const unnamed = [...by.entries()].filter(([, r]) => r.unnamed);
  for (const [k, r] of unnamed) {
    const words = r.key.replace(/^unnamed:/, '').split(' ');
    // A plain description is not merged into a second or third party of that kind.
    const wider = unnamed.filter(([k2, r2]) => k2 !== k && r2.role === r.role && by.has(k2) && !(ORDINAL_KEY.test(k2) && !ORDINAL_KEY.test(k)) && words.every((w) => r2.key.replace(/^unnamed:/, '').split(' ').includes(w)));
    if (wider.length !== 1) continue;
    const into = by.get(wider[0][0])!;
    for (const e of r.evidence) if (!into.evidence.some((x) => evidenceIdentity(x) === evidenceIdentity(e))) into.evidence.push(e);
    by.delete(k);
  }
  // Several unnamed parties of a kind ("two U.S. based investment-grade hyperscalers") are named in the plural; "a
  // second hyperscaler" kept apart is one party.
  for (const r of by.values()) {
    if (!r.unnamed || /s$/.test(r.name) || ORDINAL_KEY.test(r.key)) continue;
    const noun = r.name.split(' ').pop() ?? '';
    if (r.evidence.some((e) => new RegExp(`\\b(?:two|three|four|second|third|another|both|multiple|several)\\b[^.;]{0,60}\\b${escapeRe(noun)}s?\\b`, 'i').test(e.sentence))) r.name = `${r.name}s`;
  }
  // One filer read as both the target's supplier and its customer: a single stray statement gives way to a share or
  // to two or more statements the other way (a company can be both, when both are well attested).
  const out = [...by.values()];
  if (options.preserveRoles) return out;
  return out.filter((r) => {
    if ((r.role !== 'supplier' && r.role !== 'customer') || r.side !== 'theirs' || r.share != null || r.evidence.length > 1) return true;
    const other = out.find((x) => x.key === r.key && x !== r && (x.role === 'supplier' || x.role === 'customer') && x.role !== r.role);
    return !other || (other.share == null && other.evidence.length < 2);
  });
}

// ----------------------------------------------------------- the search

/** At most this many of a company's differently named federal units are looked up in its own filings. */
const MAX_UNIT_CHECKS = 12;

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
  /** Why it is read: the company's own filing, another company's report, prospectus or current report (8-K), or the
   * federal contract records. */
  source: 'own' | 'report' | 'current' | 'federal';
  /** Where it is, when it is not an SEC filing. */
  url?: string;
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

/** Filers that issue securities backed by loans or leases: their reports name tenants and obligors, not relations. */
const SECURITIZATION = /\b(?:Mortgage Trust|Commercial Mortgage|Mortgage Securities|Pass[- ]Through|Receivables|Auto (?:Loan|Lease|Receivables|Owner)|Lease Trust|Master Trust|Credit Card|Securitization|Issuing Entity|Depositor|CMT \d{4}|\d{4}-[A-Z0-9]{2,}|Trust I{1,3}\b|Equipment Trust)\b/i;

/** Blank-check companies: their filings describe the business they will merge with, not their own relations. */
const BLANK_CHECK = /\b(?:Acquisition Corp(?:oration)?|Acquisition Co|Acquisition Holdings|Capital Corp(?:oration)? [IVX]+|Merger Corp)\b/i;

/** A filer of the target's own group: its finance or leasing arm ("Ford Motor Credit Company LLC"), or itself under another name. */
export function groupFiler(filerName: string, names: TargetNames): boolean {
  const n = normalizeName(filerName);
  return [...names.names, ...names.legal].some((t) => {
    const k = normalizeName(t);
    return k.length >= 3 && (n === k || new RegExp(`^${escapeRe(k)}(?: motor| motors)? (?:credit|financial|finance|capital|funding|receivables|leasing|financial services|holdings?)\\b`).test(n));
  });
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
  /** Append-only parsed disclosures seen by this installation, including prior periods and ended relations. */
  history?: Relation[];
  historySince?: number;
  archiveState?: 'saved' | 'session-only';
  coverage?: {
    state: 'bounded' | 'partial';
    warnings: string[];
    searches: number;
    searchAttempts: number;
    failedSearchAttempts: number;
    failedSearches: number;
    indexRequests: number;
    failedIndexes: number;
    failedDocuments: number;
    capReached: boolean;
    documentsAttempted: number;
    documentsRead: number;
    windows: string[];
  };
}

export const supplyChains = createStore<{ v: number; chains: Record<string, Chain> }>({ v: 0, chains: {} });

/** Other companies' reports read (one per company), current reports read (two per company), quarterly updates read. */
const MAX_REPORTS = 150;
const MAX_CURRENT = 60;
const MAX_OWN_CURRENT = 40;
const MAX_NEWER = 40;
/** The company's own current reports of two years that report agreements, deals, financings or announcements, and the
 * press releases filed with them. */
const MAX_OWN_8K = 40;
const MAX_OWN_RELEASES = 30;
const OWN_ITEMS = /^(?:1\.01|2\.01|2\.03|7\.01|8\.01)$/;
/** A press release's file name in a filing's folder: "ex99-1.htm", "ex991.htm", "exhibit99_1.htm", "d12345dex991.htm". */
const RELEASE_FILE = /(?:^|[^a-z])ex(?:hibit)?[-_.]?99(?:[-_.]?(\d{1,2}))?[^/]*\.html?$/i;
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
  filings(cik: number): Promise<{ form: string; filed: string; accession: string; doc?: string; items?: string[] }[] | null>;
  /** The file names in one of its filings' folders, to find a current report's press releases; optional. */
  index?(cik: number, accession: string): Promise<string[] | null>;
  /** A full-text search; throws when it fails (Error('missing-agent') without the SEC User-Agent). */
  fts(arg: string): Promise<{ hits: FtsHit[]; total: number }>;
  /** The sentences of a document: those naming `names` ('mentions'), or the company's own statements ('own'). */
  text(kind: 'own' | 'mentions', path: string, names?: string[]): Promise<string[] | null>;
  /** USAspending.gov's federal contract records; optional. */
  usaspending?: FedAsk;
  securities: SecurityDef[];
}

/** The federal records read, as rows of the Filings Read tab. */
const FED_STEPS: { step: FedStep; form: string }[] = [
  { step: 'awards', form: 'Federal contracts' },
  { step: 'subawards', form: 'Subcontracts received' },
  { step: 'subs', form: 'Subcontracts let' },
];

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
  const coverage: NonNullable<Chain['coverage']> = { state: 'bounded', warnings: [], searches: 0, searchAttempts: 0, failedSearchAttempts: 0, failedSearches: 0, indexRequests: 0, failedIndexes: 0, failedDocuments: 0, capReached: false, documentsAttempted: 0, documentsRead: 0, windows: ['Own: two annual reports, up to four subsequent quarters and two years of selected current reports', 'Counterparties: two years of reports/current reports; three years of prospectuses'] };
  const warn = (message: string) => { if (!coverage.warnings.includes(message)) coverage.warnings.push(message); };
  const reportCoverage = () => emit((c) => ({ ...c, coverage: { ...coverage, warnings: [...coverage.warnings] } }));
  const failedDocument = () => { coverage.state = 'partial'; coverage.failedDocuments++; reportCoverage(); };
  const failedIndex = () => { coverage.state = 'partial'; coverage.failedIndexes++; reportCoverage(); };
  const capped = (message: string) => { coverage.capReached = true; coverage.state = 'partial'; warn(message); };
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
  const once = async (arg: string) => {
    coverage.searchAttempts++;
    try { return await io.fts(arg); }
    catch (e) { coverage.failedSearchAttempts++; if ((e as Error)?.message === 'missing-agent') throw e; return null; }
  };
  const ask = async (arg: string) => {
    coverage.searches++;
    const result = (await once(arg)) ?? (await once(arg));
    if (!result) {
      coverage.state = 'partial'; coverage.failedSearches++;
      warn('Some SEC searches failed after retry. Missing results are not evidence of no relationships.');
    }
    reportCoverage();
    return result ?? { hits: [], total: 0 };
  };
  const search = async (arg: string, into: FtsHit[][], all: number, weight = 1) => {
    const first = await ask(arg);
    into.push(first.hits);
    if (into === reports) weights.push(weight);
    if (first.total <= all) {
      for (let p = 1; p * 100 < first.total && first.hits.length >= 100; p++) {
        into.push((await ask(`${arg}|${p * 100}`)).hits);
        if (into === reports) weights.push(weight);
      }
    } else {
      capped('SEC search results exceeded a search window. Some matching documents were not processed.');
    }
    return first.total;
  };
  // The company's own latest annual report, a newer quarterly report, and its current reports of the last year.
  const own: Filer[] = [];
  if (company) {
    coverage.indexRequests++;
    const fetchedFilings = await io.filings(company.cik).catch(() => null);
    if (!fetchedFilings) { failedIndex(); warn('The company filing index could not be read.'); }
    const filings = fetchedFilings ?? [];
    const doc = (f: { form: string; filed: string; accession: string; doc?: string }): Filer | null =>
      f.doc && /\.html?$/i.test(f.doc) ? { cik: company.cik, name: title, tickers: [company.ticker], form: f.form, date: f.filed, path: `${company.cik}/${f.accession.replace(/-/g, '')}/${f.doc}`, score: 0, terms: 0, state: 'waiting', source: 'own' } : null;
    // The latest annual report, the quarterly reports since the one before, and that earlier annual report.
    const annuals = filings.filter((f) => /^(10-K|20-F|40-F)$/.test(f.form) && doc(f)).slice(0, 2);
    if (annuals[0]) own.push(doc(annuals[0])!);
    for (const q of filings.filter((f) => f.form === '10-Q' && doc(f) && (!annuals[1] || f.filed > annuals[1].filed)).slice(0, 4)) own.push(doc(q)!);
    if (annuals[1]) own.push(doc(annuals[1])!);
    if (queries[0]) {
      const got = await ask(`|${queries[0]}|current|0|${company.cik}`);
      own.push(...currentDocs([got.hits], company.cik, MAX_OWN_CURRENT, MAX_OWN_CURRENT, true));
    }
    // Every current report of two years on an agreement, a deal, a financing or an announcement, and the press
    // releases filed with them: where companies announce their customers, suppliers and lenders.
    const since = new Date(Date.now() - 730 * DAY_MS).toISOString().slice(0, 10);
    const eightKs = filings.filter((f) => /^(?:8-K|6-K)$/.test(f.form) && f.filed >= since && doc(f) && (!f.items || f.items.some((i) => OWN_ITEMS.test(i)))).slice(0, MAX_OWN_8K);
    if (eightKs.length === MAX_OWN_8K) capped('The current-report limit was reached; older agreements may not have been read.');
    const have = new Set(own.map((f) => f.path));
    for (const f of eightKs) {
      const d = doc(f)!;
      if (!have.has(d.path)) {
        have.add(d.path);
        own.push(d);
      }
    }
    if (io.index) {
      let releases = 0;
      for (const f of eightKs.filter((x) => !x.items || x.items.some((i) => /^(?:1\.01|7\.01|8\.01)$/.test(i)))) {
        if (releases >= MAX_OWN_RELEASES) { capped('The filed press-release limit was reached.'); break; }
        coverage.indexRequests++;
        const listedNames = await io.index(company.cik, f.accession).catch(() => null);
        if (!listedNames) { failedIndex(); warn('A filing exhibit index could not be read.'); }
        const names = listedNames ?? [];
        for (const name of names.filter((n) => RELEASE_FILE.test(n)).slice(0, 2)) {
          const path = `${company.cik}/${f.accession.replace(/-/g, '')}/${name}`;
          if (have.has(path)) continue;
          have.add(path);
          const n = RELEASE_FILE.exec(name)?.[1];
          own.push({ cik: company.cik, name: title, tickers: [company.ticker], form: f.form, type: `EX-99${n ? `.${Number(n)}` : ''}`, date: f.filed, path, score: 0, terms: 0, state: 'waiting', source: 'own' });
          releases++;
        }
      }
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
  // Not other companies: the target's own finance arms ("Ford Motor Credit") and securitization trusts.
  const outside = (h: FtsHit) => !groupFiler(h.name, names) && !SECURITIZATION.test(h.name) && !BLANK_CHECK.test(h.name);
  const ranked = rankFilers(reports.map((hits) => hits.filter(outside)), company?.cik, MAX_REPORTS, weights);
  if (ranked.length === MAX_REPORTS) capped('The report ranking limit was reached. Filing counts do not measure all counterparties.');
  const newer = newerReports(reports, ranked.slice(0, MAX_NEWER));
  const theirCurrent = currentDocs(current.map((hits) => hits.filter(outside)), company?.cik, MAX_CURRENT);
  if (theirCurrent.length === MAX_CURRENT) capped('The counterparty current-report limit was reached.');
  // The federal contract records of a US-listed company, read beside its filings.
  const today = new Date().toISOString().slice(0, 10);
  const fed: Filer[] = company && io.usaspending
    ? FED_STEPS.map(({ step, form }) => ({ cik: company.cik, name: 'USAspending.gov', tickers: [], form, date: today, path: `usaspending/${step}`, url: 'https://www.usaspending.gov/search', score: 0, terms: 0, state: 'waiting', source: 'federal' }))
    : [];
  // Read order: its own filings, the 40 likeliest reports, the current reports, then the rest.
  const docs = [...own, ...fed, ...ranked.slice(0, 40), ...theirCurrent, ...ranked.slice(40), ...newer];
  emit((c) => ({ ...c, filers: docs }));

  const pattern = targetPattern(names.names.concat(names.legal.map((l) => l.replace(SUFFIX, '').trim())));
  const exclude = names.exclude ? new RegExp(names.exclude) : null;
  const relations: Relation[] = [];
  // A stake one of its reports says was sold (or a subsidiary) stays out, whichever filing names it.
  const ended: EndedStakes = { sold: new Set(), subsidiaries: new Set(), retainHistory: true };
  const captured: Relation[] = [];
  const publish = () => emit((c) => {
    const history = appendRelationshipHistory(c.history ?? [], captured);
    // The current list selects the newest concentration disclosure per role. Annual, quarterly and amended
    // versions remain in the separate archive, whose local labels never establish a persistent customer identity.
    const newestConcentration = new Map<Role, string>();
    for (const r of history) if (relationKind(r) === 'concentration') {
      const date = r.evidence.reduce((at, e) => e.date > at ? e.date : at, '');
      if (date > (newestConcentration.get(r.role) ?? '')) newestConcentration.set(r.role, date);
    }
    const current = history.filter((r) => relationKind(r) !== 'concentration' || r.evidence.some((e) => e.date === newestConcentration.get(r.role)));
    const latest = mergeRelations(current, { preserveRoles: true, strictIdentity: true });
    return { ...c, relations: latest, history: appendRelationshipHistory(history, latest), historySince: c.historySince ?? Date.now(), coverage: { ...coverage, warnings: [...coverage.warnings] }, at: Date.now() };
  });
  const mark = (f: Filer, state: Filer['state'], found?: number) => emit((c) => ({ ...c, filers: c.filers.map((x) => (x.path === f.path ? { ...x, state, ...(found != null ? { found } : {}) } : x)) }));
  const sentenceNames = [...new Set([...names.names, ...names.legal.map((l) => l.replace(SUFFIX, '').trim())])].slice(0, 8);
  const evidence = (f: Filer, sentence: string): Evidence => ({ sentence, filer: f.name, form: f.form, date: f.date, path: f.path, observedAt: Date.now(), publishedPrecision: 'day', ...(f.type && f.type !== f.form ? { type: f.type } : {}) });

  const federal = company && io.usaspending
    ? (async () => {
        const keys = [...new Set([normalizeName(title), ...names.legal.map(normalizeName)])].filter((k) => k.length >= 3);
        const selfRe = new RegExp(pattern.source);
        const got = await federalRelations(io.usaspending!, {
          keys,
          self: (n) => selfRe.test(n) || keys.some((k) => { const x = normalizeName(n); return x === k || x.startsWith(`${k} `); }),
          party: (n) => federalParty(n, dir),
          normalize: normalizeName,
          // Searched in its own annual and quarterly reports of two years, the largest units first.
          named: async (list) => {
            const out = new Set<string>();
            for (const n of list.slice(0, MAX_UNIT_CHECKS)) {
              const q = n.replace(/[^A-Za-z0-9 .,&'()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 59);
              if (q.length < 3 || !company?.cik) continue;
              const got = await ask(`|${q}|reports|0|${company.cik}`);
              if (got.total > 0) out.add(n);
            }
            return out;
          },
          today,
        }, (step, state, found, url) => { if (state === 'failed') failedDocument(); emit((c) => ({ ...c, filers: c.filers.map((x) => (x.path === `usaspending/${step}` ? { ...x, state, ...(found != null ? { found } : {}), ...(url ? { url } : {}) } : x)) })); });
        relations.push(...got.relations.map((r) => enrichRelation(r, Date.now())));
        captured.push(...got.relations.map((r) => enrichRelation(r, Date.now())));
        publish();
      })().catch(() => { failedDocument(); emit((c) => ({ ...c, filers: c.filers.map((x) => (x.source === 'federal' && x.state !== 'read' ? { ...x, state: 'failed' } : x)) })); })
    : null;

  // Unnamed customers' shares come from the newest filing that states them (a quarter's are not the year's). A filing's
  // letters name its own customers ("Customer A" in NVIDIA's 10-Q of August 2025, 23%), not the same company in another
  // filing: they go with the rest when a newer filing states the shares.
  // Unnamed suppliers' shares of its purchases likewise, on their own: a quarter that states customers' shares only
  // leaves the year's suppliers in place.
  const SHARE_ONLY = [/^(?:unnamed:\d+|n:(?:(?:direct|indirect) )?customer [a-z])$/, /^unnamed-supplier:\d+$/];
  const shareOnly = (key: string) => SHARE_ONLY.some((re) => re.test(key));
  const sharesFrom = SHARE_ONLY.map(() => '');
  for (const f of own) {
    mark(f, 'reading');
    coverage.documentsAttempted++;
    const sentences = await io.text('own', f.path).catch(() => null);
    let found = 0;
    if (sentences) {
      coverage.documentsRead++;
      if (sentences.length >= 400) capped('A document reached the sentence extraction limit.');
      const got = ownRelations(sentences, dir, { cik: company?.cik, names: names.names, ticker: company?.ticker ?? target.ticker }, evidence(f, ''), ended);
      captured.push(...got.map((r) => enrichRelation(r)));
      const keep = SHARE_ONLY.map((re, i) => {
        if (!got.some((r) => re.test(r.key)) || f.date <= sharesFrom[i]) return false;
        sharesFrom[i] = f.date;
        for (let j = relations.length - 1; j >= 0; j--) if (re.test(relations[j].key)) relations.splice(j, 1);
        return true;
      });
      const add = got.filter((r) => !shareOnly(r.key) || SHARE_ONLY.some((re, i) => keep[i] && re.test(r.key)));
      relations.push(...add);
      found = add.length;
    } else failedDocument();
    mark(f, sentences ? 'read' : 'failed', found);
    publish();
  }

  await pool(docs.slice(own.length + fed.length), 3, async (f) => {
    mark(f, 'reading');
    coverage.documentsAttempted++;
    const sentences = await io.text('mentions', f.path, sentenceNames).catch(() => null);
    let found = 0;
    if (sentences) {
      coverage.documentsRead++;
      if (sentences.length >= 80) capped('A document reached the mention extraction limit.');
      const listed = dir.byTicker.get(f.tickers[0] ?? '');
      // The filer as its documents call it, initials included ("BMS" for Bristol-Myers Squibb).
      // Two-word names also written as one ("Open Text" is "OpenText" in its own filings).
      const filerNames = targetNames(f.tickers[0], f.name).names.flatMap((n) => (/^[A-Z][a-z]{2,} [A-Z][a-z]{2,}$/.test(n) ? [n, n.replace(' ', '')] : [n]));
      const words = (filerNames[0] ?? '').split(/[\s-]+/).filter((w) => /^[A-Z]/.test(w));
      const filer = targetPattern(words.length >= 3 ? [...filerNames, words.map((w) => w[0]).join('')] : filerNames);
      // A filing that calls another company by the target's name speaks of that company throughout.
      const other = sentences.some((s) => definesOther(s, pattern));
      const filedYear = Number(f.date.slice(0, 4));
      for (const sentence of other ? [] : sentences) {
        if (exclude?.test(sentence)) continue;
        const c = classify(sentence, pattern, filer);
        if (!c) continue;
        // "95% of our China revenue in 2019" in a 2026 report: a figure for a long-past year is no current relation, nor
        // is an event dated long before ("On December 11, 1998, The Coca-Cola Company announced an agreement").
        const years = (sentence.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number).filter((y) => y <= filedYear + 1);
        if (/\d\s*(?:%|percent)/i.test(sentence) && years.length && Math.max(...years) < filedYear - 2) continue;
        // An agreement entered into long ago can still be in force; an announcement, deal or sale then is history.
        const dated = /^(?:In|On|During|By|As of)\s+(?:(?:early|mid|late)[- ])?(?:[A-Z][a-z]+\s+)?(?:\d{1,2},\s+)?((?:19|20)\d{2})\b/.exec(sentence.trim());
        if (dated && Number(dated[1]) < filedYear - 5 && Math.max(...years) < filedYear - 5 && /\b(?:announced|acquir\w+|acquisition|sold|completed|consummated|merged|spun off|spin-off|divest\w*)\b/i.test(sentence)) continue;
        found++;
        const r: Relation = { key: `cik:${f.cik}`, name: knownName(f.tickers[0]) ?? listed?.title ?? f.name, ticker: f.tickers[0], cik: f.cik, role: c.role, share: c.share, qualifier: c.qualifier, basis: c.basis, side: 'theirs', evidence: [evidence(f, sentence)] };
        relations.push(r); captured.push(enrichRelation(r));
        if (c.also) { const also = { ...r, role: c.also, share: undefined, qualifier: undefined, basis: undefined }; relations.push(also); captured.push(enrichRelation(also)); }
      }
    } else failedDocument();
    mark(f, sentences ? 'read' : 'failed', found);
    publish();
  });
  await federal;
  if (coverage.failedDocuments) warn('Some source documents could not be read. The extracted relationships are incomplete.');
  if (!company) warn('No company filing index was matched; only counterparties found in other sources are available.');
  reportCoverage();
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
      return filer.ok ? filer.data.filings.map((f) => ({ form: f.form, filed: f.filed, accession: f.accession, doc: f.doc, items: f.items })) : null;
    },
    index: async (cik, accession) => {
      const got = await loadFilingIndex(cik, accession);
      return got.ok ? got.data : null;
    },
    fts: async (arg) => {
      const res = await bridge.sec!('fts', arg);
      if ((res as any)?.missing) throw new Error('missing-agent');
      if (!res?.text) throw new Error(`the full-text search answered ${res?.status ?? 'nothing'}`);
      const hits = parseFts(res.text);
      if (!hits) throw new Error('The SEC search response schema was not recognized.');
      return { hits, total: ftsTotal(res.text) };
    },
    text: async (kind, path, names) => {
      const res = await bridge.secText!(kind, path, names);
      return res && res.status === 200 ? res.sentences : null;
    },
    ...(typeof bridge.usaspending === 'function' ? { usaspending: (kind, arg) => bridge.usaspending!(kind, arg) } : {}),
    securities: engine.securities,
  };
}

/** Finds and reads the filings for a company, updating the store as each one is read. */
async function build(key: string, def: SecurityDef) {
  if (running.has(key)) return;
  running.add(key);
  try {
    const saved = loadJson<{ schema: number; history: Relation[]; firstRecordedAt: number }>(`armin:splc-history:${key}`);
    const valid = saved?.schema === 1 && Array.isArray(saved.history) && saved.history.every((r) => r && typeof r.key === 'string' && Array.isArray(r.evidence) && r.evidence.every((e) => typeof e.sentence === 'string' && typeof e.date === 'string' && typeof e.path === 'string'));
    setChain(key, (c) => ({ ...c, state: 'loading', message: undefined, filers: [], relations: c.relations.length ? c.relations : valid ? saved!.history : [], history: c.history ?? (valid ? saved!.history : []), historySince: c.historySince ?? (valid ? saved!.firstRecordedAt : Date.now()), archiveState: valid ? 'saved' : 'session-only' }));
    await runChain({ ticker: secTicker(def) ?? undefined, name: def.name }, desktopIO(), (f) => setChain(key, f));
    const c = supplyChains.get().chains[key];
    let archiveState: Chain['archiveState'] = 'session-only';
    try {
      const json = JSON.stringify({ schema: 1, history: c.history ?? [], firstRecordedAt: c.historySince ?? Date.now() });
      // Avoid exhausting the app's shared storage with raw public filing paragraphs. Memory retains the whole run.
      if (json.length <= 750_000) {
        localStorage.setItem(`armin:splc-history:${key}`, json);
        archiveState = 'saved';
      }
    } catch { /* The UI identifies session-only history when storage is blocked or full. */ }
    setChain(key, (c) => ({ ...c, state: 'ok', archiveState, at: Date.now() }));
    void refreshChanges(key);
  } catch (e) {
    const missing = (e as Error)?.message === 'missing-agent';
    setChain(key, (c) => ({ ...c, state: 'error', coverage: { state: 'partial', warnings: ['The latest refresh failed. Prior recorded disclosures remain available with their original dates.'], searches: c.coverage?.searches ?? 0, searchAttempts: c.coverage?.searchAttempts ?? 0, failedSearchAttempts: c.coverage?.failedSearchAttempts ?? 0, failedSearches: c.coverage?.failedSearches ?? 0, indexRequests: c.coverage?.indexRequests ?? 0, failedIndexes: c.coverage?.failedIndexes ?? 0, failedDocuments: c.coverage?.failedDocuments ?? 0, capReached: c.coverage?.capReached ?? false, documentsAttempted: c.coverage?.documentsAttempted ?? 0, documentsRead: c.coverage?.documentsRead ?? 0, windows: c.coverage?.windows ?? [] }, message: missing ? 'SPLC reads SEC filings, which need SEC_USER_AGENT (your name and email) in PROVIDERS.' : 'The SEC filings could not be read.' }));
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
