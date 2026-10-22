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
  'giga-byte': { name: 'Gigabyte Technology', yahoo: '2376.TW' },
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
  const base = words.map(titleWord).join(' ').replace(/ Com$/, '.com');
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
const GROUP = /\b(?:top|largest|biggest|major|principal|ten|five)\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+customers?\b|\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:largest|biggest|major|principal|top|significant)\s+customers?\b|\bcustomers,?\s+(?:including|such as)\b|\bin (?:the )?aggregate\b/i;
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
  const revenue = OF_REVENUE.test(tail);
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
const INVEST_AFTER = /^(?:'s)?[^.;]{0,80}?\b(?:invested|purchased|acquired|subscribed for|holds|held|owns|owned|beneficially owns)\b[^.;]{0,80}?\b(?:shares|stock|stake|equity interest|ownership interest|preferred|units)\b/i;
const INVEST_BEFORE = /\b(?:issue|issues|issued|sell|sells|sold|delivered)\b[^.;]{0,120}\b(?:shares|stock|preferred|units)\b[^.;]{0,60}\bto\s+(?:the\s+)?$|\b(?:shares|stock|units)\b[^.;]{0,60}\b(?:issued|sold|delivered|transferred)\s+to\s+(?:the\s+)?$|\b(?:securities purchase|stock purchase|share purchase|subscription|investment) agreement\b[^.;]{0,60}\bwith\s+(?:the\s+)?$|\bprivate placement\b[^.;]{0,100}\bto\s+$/i;

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

  // Shares: a run of percentages "of our revenues" or "of our purchases" with a verb that gives it to someone; of
  // several, the one nearest the target's name ("39% ... were to Airbus ... and 13% ... were to Boeing").
  const allRuns = percentRuns(s);
  // "Royalties from properties operated by Exxon", "operators Diversified, Denbury (ExxonMobil) and Foundation each
  // accounted for more than 10%": an operator remits the owners' share of production; it does not buy from them.
  if (company.length && (MINERAL.test(s) || /\broyalt/i.test(s)) && /\b(?:operated by|operators?|operating partners?)\b/i.test(s) && /\d\s*(?:%|percent)/i.test(s)) return null;
  const stated = VERB.test(s) || /\b(?:sales|revenues?) (?:to|from)\b/i.test(s);
  const pairRun = stated ? yearPairRun(s) : null;
  const shareRuns = pairRun
    ? [{ run: pairRun.run, revenue: !pairRun.purchases, purchases: pairRun.purchases }]
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
            return { run, revenue, purchases: !revenue && OF_PURCHASES.test(tail) };
          })
          .filter((x) => x.revenue || x.purchases)
      : [];
  // "77% of net revenues, of which Amazon accounted for approximately 56%, Costco ... 11%": the breakdown's figures
  // have the total's basis.
  const ofWhich = s.search(/\bof which\b/i);
  const total = shareRuns.find((x) => x.run[0].index < ofWhich);
  if (ofWhich >= 0 && total) for (const run of allRuns) if (run[0].index > ofWhich && !shareRuns.some((x) => x.run === run)) shareRuns.push({ run, revenue: total.revenue, purchases: total.purchases });
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
    if (base) shareRuns.push({ run, revenue: base.revenue, purchases: base.purchases });
  }
  for (let i = shareRuns.length - 1; i >= 0; i--) if (others(shareRuns[i].run)) shareRuns.splice(i, 1);
  const gap = (run: Pct[]) => (tied(run) ? -1 : Math.min(...anchor.map((c) => (c.index >= run[run.length - 1].end ? c.index - run[run.length - 1].end : c.end <= run[0].index ? run[0].index - c.end : 0))));
  shareRuns.sort((a, b) => gap(a.run) - gap(b.run));
  for (const { run, purchases } of shareRuns.slice(0, 1)) {
    const found = shareOf(s, run, pattern);
    let share = found.value;
    let qualifier = qualifierOf(s, run);
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
    // a share of sales is a brand the filer sells. Used devices bought elsewhere are no purchase from the target.
    if (/\b(?:pre-owned|refurbished|used|second-hand)\b/i.test(s)) return null;
    const distributor =
      new RegExp(`(?:products?|solutions?|offerings?)\\s+(?:purchased\\s+|sourced\\s+|bought\\s+)?from\\s+(?:[^.]{0,40}?)(?:${p})|sales of (?:${p})(?:'s)?\\s+(?:[A-Za-z.,-]+\\s+){0,3}?products|(?:${p})(?:\\s+(?:Corporation|Corp\\.?|Inc\\.?|Company))?(?:'s|’s)?\\s+(?:branded\\s+)?(?:[A-Z][\\w-]*\\s+){0,4}(?:and\\s+(?:[A-Z][\\w-]*\\s+){1,4})?products`).test(s) ||
      /\b(?:suppliers?|vendors?|brands?|branded)\b/i.test(clause);
    if (purchases) return { role: 'customer', share, qualifier, basis: 'their-purchases' };
    if (distributor) return { role: 'customer', share, qualifier, basis: 'their-product-sales' };
    if (company.length) return { role: 'supplier', share, qualifier, basis: 'their-revenue' };
  }

  // Licences, royalties and research collaborations with the target.
  if (company.length && LICENSING.test(s) && !MINERAL.test(s)) return { role: 'partner' };
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
      if (company.some((c) => c.index > m!.index && (c.index - m!.index < 260 || (c.index - at < 1200 && /\b(?:include|includes|including|such as|are|:)\b/i.test(plain.slice(at, at + 80)))))) return { role: 'competitor' };
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
    if (/\b(?:deliver(?:y|ies) (?:of|from)|on order (?:from|with)|orders? (?:placed )?with)\s+(?:the\s+)?(?:new\s+)?$/i.test(b)) return { role: 'customer' };
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
        /\b(?:[Oo]ur|[Ww]e|[Uu]s|[Tt]he Company(?:'s)?|key|principal|primary|main|largest|major|critical|sole|single|limited)\b[^.;]{0,50}\b(?:suppliers?|vendors?|providers?|platforms?)\b/.test(b) &&
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
  for (const c of company) {
    const lead = s.slice(Math.max(0, c.index - 140), c.index);
    const tail = s.slice(c.end, c.end + 80);
    // "Costco's exclusive RV partner", "the official partner of the NBA".
    if (/^(?:'s|’s)\s+(?:exclusive|preferred|official|strategic|primary|principal|global)\s+(?:[\w-]+\s+){0,2}partner\b/i.test(tail) && byFiler(lead.slice(-80))) return { role: 'partner' };
    const at = lead.search(partner);
    if (at < 0 && !partner.test(tail.slice(0, 60))) continue;
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
    // The filer's product deployed by the target, or the target improving its own operations with it: the filer sells.
    if (filer && (new RegExp(String.raw`\bto (?:deploy|implement|roll out|adopt)\s+(?:the\s+)?(?:${filer.source})`, 'i').test(around) || new RegExp(String.raw`\bwith\s+(?:${filer.source})\s*,\s*$`, 'i').test(lead) && /^(?:'s)?\s+(?:has |have )?(?:enhanced|improved|reduced|increased|achieved|cut|saved|accelerated|streamlined)\b/i.test(tail))) return { role: 'supplier' };
    // Deploying the target's own platform is buying it; a partnership to deploy something together stays a partnership.
    if (new RegExp(String.raw`\bto (?:deploy|use|adopt|implement|run on|bring|integrate|incorporate|leverage)\s+(?:the\s+)?(?:[\w-]+\s+){0,2}?(?:${pattern.source}|its|their)\b`, 'i').test(around)) return { role: 'customer' };
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
const FINANCIAL_NAME = /\b(?:Bank|Bancorp|Banc|Capital|Partners|Asset Management|Investment Management|Securities|Financial|Credit|Funding|Lending|Trust)(?:\s+of\s+[A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)?)?$/;

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
    if (!hit) continue;
    // "(part of Shandong Heavy Industry Group)", "(formerly MAN Energy Solutions SE)", "architectures, such as Arm",
    // "the Arm ecosystem", "ARM-based".
    const lead = text.slice(Math.max(0, m.index - 60), m.index);
    const parentOf = /\((?:both\s+)?(?:part of|a subsidiary of|a unit of|owned by)\s+$/i.test(lead);
    if ((parentOf && /^[\s,.]*(?:\([^)]*\)\s*)?\((?:both\s+)?(?:part of|a subsidiary of|a unit of|owned by)\s+$/i.test(text.slice(lastEnd, m.index))) || /\((?:formerly|previously)\s+$/i.test(lead) || /\barchitectures?,?\s+(?:such as|like|including)\s+(?:[\w&.-]+,?\s+(?:and\s+)?){0,3}$/i.test(lead)) continue;
    if (/^\s*(?:-based|ecosystem|architecture|cores?|instruction set|ISA)\b/i.test(text.slice(m.index + m[0].length)) && /^(?:arm|risc-v|x86)$/i.test(normalizeName(hit.name))) continue;
    if (/ AND /.test(hit.name)) hit = { ...hit, name: hit.name.replace(/ AND /g, ' and ') };
    const k = hit.cik ? `cik:${hit.cik}` : hit.yahoo ? `y:${hit.yahoo}` : `n:${normalizeName(hit.name)}`;
    lastEnd = m.index + m[0].length;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(hit);
  }
  return out;
}

// ---------------------------------------------------------- the own report

const OWN_COMPETITOR = /^\[competitors\]|\b(?:competitors?\b[^.]{0,40}\b(?:include|includes|including|are|such as)|compete[sd]?\s+(?:\w+ly\s+){0,2}(?:with|against)|competition\b[^.]{0,80}?\bfrom|principal competitors?|primary competitors?|main competitors?|significant competition from)/i;
const OWN_SUPPLIER = /\b(?:foundr(?:y|ies)|suppliers?|subcontractors?|contract manufacturers?|manufacturing partners?|vendors?|sole[- ]source|single[- ]source|assembly and test)\b[^.]{0,120}?\b(?:such as|including|include|includes|namely|like|primarily|principally|:)/i;
const OWN_CUSTOMER = /\b(?:customers?\b[^.]{0,40}\b(?:include|includes|including|such as|are)|largest customers?|end customers?|direct customers?)\b/i;
const ANONYMOUS = /\b(?:Customer|Direct Customer|Indirect Customer) ([A-H])\b/g;
/** Words that end a stake, before the company it was in. */
const GONE_STAKE_AT = /\b(?:(?:previous|former|prior)\s+(?:(?:equity|ownership)\s+)?(?:investments?|stakes?|interests?|ownership)\s+in|(?:sale|sold|sell|selling|divest\w*|disposal|disposed of)\s+(?:of\s+)?(?:all\s+of\s+|the remainder of\s+)?(?:our|its|the Company's)\s+(?:remaining\s+|entire\s+|full\s+)?(?:[\w-]+\s+){0,2}(?:interests?|stakes?|investments?|shares|ownership)\s+in|loss of significant influence over|no longer (?:holds?|owns?|has|have)\s+(?:an?\s+|any\s+)?(?:[\w-]+\s+){0,2}(?:interests?|stakes?|investments?)\s+in)\s+/i;
/** A stake described only in the past: "until its disposition in the first quarter of 2025". */
const GONE_STAKE = /\buntil (?:its|their|the) (?:disposition|sale|divestiture)\b|\bdiscontinu\w* (?:of )?the equity method\b|\bwhile subject to the equity method\b/i;

/**
 * Relations the company's own report states: customers with the share of its revenue (named, or "Customer A"),
 * suppliers it names ("foundries, such as TSMC and Samsung") and competitors ("our competitors include ...").
 */
export function ownRelations(sentences: string[], dir: Directory, self: { cik?: number; names: string[] }, ev: Omit<Evidence, 'sentence'>, ended: EndedStakes = { sold: new Set(), subsidiaries: new Set() }): Relation[] {
  const out: Relation[] = [];
  const { sold: soldStakes, subsidiaries } = ended;
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
    if (SAFE_HARBOR.test(s) || /\brisks related to:/i.test(s)) continue;
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
      parties.forEach((p, i) => {
        const value = each ? run[0].value : parties.length === run.length ? run[i].value : parties.length === 1 ? shareInRun(s, run, targetPattern([escapeLiteral(p.name)])) ?? run[0].value : undefined;
        add(p.f ?? { name: p.name }, 'customer', raw, { share: value, qualifier: qualifierOf(s, run), basis: 'target-revenue' });
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
    if (/\bequity[- ]method\b|\b(?:own|owns|owned|hold|holds|held|retained|retains)\s+(?:approximately\s+|about\s+|an?\s+)?\d{1,3}(?:\.\d+)?%/i.test(s) && !/\b(?:not accounted for|do not|does not)\b/i.test(s)) {
      const stake = /\b(?:(?:investments?|interests?|stake|equity interest|ownership interest)\s+in|equity[- ]method (?:investees?|investments?)\s*,?\s*(?:include|includes|including|such as|are|were|:)|(?:own|owns|owned|hold|holds|held|retained|retains)\s+(?:approximately\s+|about\s+|an?\s+)?\d{1,3}(?:\.\d+)?%(?:\s+(?:equity|ownership|minority|noncontrolling|economic|voting))?(?:\s+(?:interest|stake|investment))?\s+(?:in|of))\s+/i.exec(s);
      if (stake) {
        const after = s.slice(stake.index + stake[0].length, stake.index + stake[0].length + 200);
        const listed = findCompanies(after, dir);
        const list = /\binclude|including|such as|are|were|:/i.test(stake[0]);
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
    if (OWN_SUPPLIER.test(s)) {
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
  return out.filter((r) => stillHeld(r, ended));
}

/** Stakes the company's reports say were sold, and companies it owns more than half of: neither is a relation now. */
export interface EndedStakes {
  sold: Set<string>;
  subsidiaries: Set<string>;
}

function stillHeld(r: Relation, ended: EndedStakes): boolean {
  return !ended.subsidiaries.has(r.key) && !(r.role === 'investment' && ended.sold.has(r.key));
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

export function dealRole(before: string, after: string, sentence: string, self?: RegExp): Role | null {
  const b = dealClause(before);
  // "a product purchase agreement with OpenAI to deploy 6 gigawatts of AMD GPUs": the party buys the filer's products.
  if (/\b(?:product |master |supply and )?purchase agreements?\b/i.test(b) && self) {
    const own = new RegExp(String.raw`^(?:'s)?,?[^.;]{0,60}?\b(?:to (?:deploy|purchase|buy|acquire|use)|for (?:the )?(?:purchase|deployment) of)\b[^.;]{0,60}?(?:\bour\b|${self.source})`, 'i');
    if (own.test(after)) return 'customer';
  }
  if (AGENT_PARTY.test(after)) return null;
  if (/\b(?:securities purchase|subscription|investment agreement|investment from|invest(?:s|ed|ing)? (?:up to )?\$|private placement|preferred (?:equity|stock|units)|equity (?:investment|financing)|strategic investment)\b/i.test(b)) return 'investor';
  // "proceeds of the GPU Financing ... in support of the Group's agreement with Microsoft": the loan is someone else's.
  if (LOAN.test(b) && !/\bin (?:support|connection|respect) (?:of|with) (?:the|our|its|the Group's|the Company's) (?:[\w-]+\s+){0,3}(?:agreement|contract)\s*,?\s*$/i.test(b)) return 'lender';
  // "a $5.0 billion AI infrastructure partnership with Macquarie Asset Management": financing called a partnership.
  if (/\bpartnership\b/i.test(b) && /\$\s?[\d.,]+\s*(?:billion|million)/i.test(b) && /^(?:[A-Z][\w&.-]*\s+){0,3}(?:Asset Management|Capital|Infrastructure Partners|Investments?|Investment Management|Fund|Bank|Credit)\b/.test(after)) return 'investor';
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
        role = dealRole(before, rest.slice(u.end), s, self);
        if (role) push(role, { name: u.label, unnamed: true, key: u.key });
        continue;
      }
      loose = LOAN.test(clause) || /\bpartner|collaborat|alliance|joint venture/i.test(clause);
      const parties = partiesAt(rest, dir, loose);
      if (!parties.length) continue;
      role = dealRole(before, rest.slice(parties[parties.length - 1].index), s, self);
      if (role) for (const p of parties) push(role, p);
      continue;
    }
    if (word === 'from') {
      if (/\b(?:orders?|contracts?|awards?)\s+$/i.test(before) || (/\b(?:revenue|revenues|sales)\s+(?:(?:generated|earned|derived)\s+)?$/i.test(before) && /\bcustomers?\b/i.test(s) && !/\bexclud\w*/i.test(before))) role = 'customer';
      else if (/\binvestments?\s+$/i.test(before)) role = 'investor';
      // "Ngenla is licensed from OPKO Health": a licence is a partnership, not a purchase.
      else if (/\b(?:licen[cs]ed|in-licensed|sublicensed)\s+(?:[\w-]+\s+){0,3}$/i.test(before)) role = 'partner';
      else if (/\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b([^.;]{0,100})$/i.test(clause)) {
        const object = /\b(?:purchase[sd]?|purchasing|buy|buys|bought|source[sd]?|sourcing|procure[sd]?|procuring|obtain(?:s|ed)?|license[sd]?)\b([^.;]{0,100})$/i.exec(clause)?.[1] ?? '';
        if (/\b(?:shares?|stock|notes|securities|interests?|units|warrants|assets|business|land|property|properties|subsidiar\w+|entity|acquisition|rights)\b/i.test(object)) continue;
        role = 'supplier';
      }
    } else if (word === 'on') {
      if (!/\b(?:rely|relies|relied|depend|depends|depended|dependent|reliant)\s+(?:heavily |substantially |significantly |primarily )?$/i.test(before)) continue;
      // The company itself relies: "we rely on", "the Company depends on"; not "clients often rely on".
      if (!/\b(?:[Ww]e|[Oo]ur|[Tt]he Company|[Tt]he Group|[Ii]t)\b[^.;]{0,40}$/.test(before)) continue;
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
  m = /\b(three|six|nine|twelve) months ended ([A-Z][a-z]+) \d{1,2}, (\d{4})\b/.exec(s);
  if (m && MONTH_ABBR[m[2].toLowerCase()]) return m[1] === 'twelve' ? `Year to ${MONTH_ABBR[m[2].toLowerCase()]} ${m[3]}` : `${{ three: 3, six: 6, nine: 9 }[m[1] as 'three' | 'six' | 'nine']}M to ${MONTH_ABBR[m[2].toLowerCase()]} ${m[3]}`;
  m = /\b(?:fiscal )?years? ended ([A-Z][a-z]+) \d{1,2}, (\d{4})\b/.exec(s);
  if (m && MONTH_ABBR[m[1].toLowerCase()]) return `Year to ${MONTH_ABBR[m[1].toLowerCase()]} ${m[2]}`;
  m = /\bfiscal (?:year )?(\d{4})\b|\bFY ?(\d{4})\b/i.exec(s);
  if (m) return `FY${m[1] ?? m[2]}`;
  const y = statementYear(s);
  return y ? String(y) : '';
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
  // Several unnamed parties of a kind ("two U.S. based investment-grade hyperscalers") are named in the plural.
  for (const r of by.values()) {
    if (!r.unnamed || /s$/.test(r.name)) continue;
    const noun = r.name.split(' ').pop() ?? '';
    if (r.evidence.some((e) => new RegExp(`\\b(?:two|three|four|second|third|another|both|multiple|several)\\b[^.;]{0,60}\\b${escapeRe(noun)}s?\\b`, 'i').test(e.sentence))) r.name = `${r.name}s`;
  }
  // One filer read as both the target's supplier and its customer: a single stray statement gives way to a share or
  // to two or more statements the other way (a company can be both, when both are well attested).
  const out = [...by.values()];
  return out.filter((r) => {
    if ((r.role !== 'supplier' && r.role !== 'customer') || r.side !== 'theirs' || r.share != null || r.evidence.length > 1) return true;
    const other = out.find((x) => x.key === r.key && x !== r && (x.role === 'supplier' || x.role === 'customer') && x.role !== r.role);
    return !other || (other.share == null && other.evidence.length < 2);
  });
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
  // Not other companies: the target's own finance arms ("Ford Motor Credit") and securitization trusts.
  const outside = (h: FtsHit) => !groupFiler(h.name, names) && !SECURITIZATION.test(h.name) && !BLANK_CHECK.test(h.name);
  const ranked = rankFilers(reports.map((hits) => hits.filter(outside)), company?.cik, MAX_REPORTS, weights);
  const newer = newerReports(reports, ranked.slice(0, MAX_NEWER));
  const theirCurrent = currentDocs(current.map((hits) => hits.filter(outside)), company?.cik, MAX_CURRENT);
  // Read order: its own filings, the 40 likeliest reports, the current reports, then the rest.
  const docs = [...own, ...ranked.slice(0, 40), ...theirCurrent, ...ranked.slice(40), ...newer];
  emit((c) => ({ ...c, filers: docs }));

  const pattern = targetPattern(names.names.concat(names.legal.map((l) => l.replace(SUFFIX, '').trim())));
  const exclude = names.exclude ? new RegExp(names.exclude) : null;
  const relations: Relation[] = [];
  // A stake one of its reports says was sold (or a subsidiary) stays out, whichever filing names it.
  const ended: EndedStakes = { sold: new Set(), subsidiaries: new Set() };
  const publish = () => emit((c) => ({ ...c, relations: mergeRelations(relations.filter((r) => stillHeld(r, ended))), at: Date.now() }));
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
      const got = ownRelations(sentences, dir, { cik: company?.cik, names: names.names }, evidence(f, ''), ended);
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
      // The filer as its documents call it, initials included ("BMS" for Bristol-Myers Squibb).
      const filerNames = targetNames(f.tickers[0], f.name).names;
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
