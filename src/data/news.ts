import { createStore } from '../core/store';
import type { SecurityDef } from './types';

/**
 * Headlines from permitted sources only: official announcements by central
 * banks, regulators, statistics offices and the US Treasury, and companies'
 * own filings. Nothing here is generated, and Yahoo's news is not used.
 */
export interface Story {
  id: string;
  /** When the publisher published it (epoch ms). */
  time: number;
  headline: string;
  body: string[];
  tickers: string[];
  topics: string[];
  /** The publisher, as shown with the headline ("Federal Reserve Board", "SEC EDGAR"). */
  source: string;
  hot?: boolean;
  /** The publisher's own page for the item. */
  url?: string;
  /** Real story from a connected feed (always true now; kept for older screens). */
  real?: boolean;
  /** When the app received it (epoch ms), as against `time`, when it was published. */
  fetched?: number;
}

export const news = createStore<{ stories: Story[]; seq: number }>({ stories: [], seq: 0 });

export const NEWS_TOPICS: { code: string; label: string }[] = [
  { code: 'CB', label: 'Central Banks' },
  { code: 'REG', label: 'Regulators' },
  { code: 'STATS', label: 'Statistics' },
  { code: 'SPEECH', label: 'Speeches' },
];

const NAME_OVERRIDES: Record<string, string> = {
  'GOOGL US Equity': 'Alphabet', 'META US Equity': 'Meta', 'BRK/B US Equity': 'Berkshire Hathaway', 'DIS US Equity': 'Disney',
  'KO US Equity': 'Coca-Cola', 'PG US Equity': 'Procter & Gamble', 'IBM US Equity': 'IBM', 'AMD US Equity': 'AMD',
  '2330 TT Equity': 'TSMC', '005930 KS Equity': 'Samsung Electronics', 'MC FP Equity': 'LVMH', 'NOVOB DC Equity': 'Novo Nordisk',
  'GS US Equity': 'Goldman Sachs', 'MCD US Equity': "McDonald's", 'XOM US Equity': 'Exxon Mobil', 'JPM US Equity': 'JPMorgan',
  'BAC US Equity': 'Bank of America', 'LLY US Equity': 'Eli Lilly', 'UNH US Equity': 'UnitedHealth', 'MA US Equity': 'Mastercard',
  'V US Equity': 'Visa', 'NKE US Equity': 'Nike', 'PLTR US Equity': 'Palantir', 'APLD US Equity': 'Applied Digital', 'COIN US Equity': 'Coinbase', 'SHOP CN Equity': 'Shopify',
  'ROG SW Equity': 'Roche', 'NESN SW Equity': 'Nestle', 'NOVN SW Equity': 'Novartis', 'SIE GY Equity': 'Siemens', '7203 JT Equity': 'Toyota',
  '6758 JT Equity': 'Sony', '9984 JT Equity': 'SoftBank', '700 HK Equity': 'Tencent', '9988 HK Equity': 'Alibaba', 'RELIANCE IN Equity': 'Reliance Industries',
  'BHP AU Equity': 'BHP', 'CBA AU Equity': 'Commonwealth Bank', 'RY CN Equity': 'Royal Bank of Canada', 'TMO US Equity': 'Thermo Fisher',
  'LMT US Equity': 'Lockheed Martin', 'C US Equity': 'Citigroup', 'WFC US Equity': 'Wells Fargo', 'NEE US Equity': 'NextEra Energy',
  'MU US Equity': 'Micron', 'UBER US Equity': 'Uber', 'HD US Equity': 'Home Depot', 'CVX US Equity': 'Chevron', 'MRK US Equity': 'Merck',
  'TTE FP Equity': 'TotalEnergies', 'OR FP Equity': "L'Oreal", 'SHEL LN Equity': 'Shell', 'AZN LN Equity': 'AstraZeneca', 'HSBA LN Equity': 'HSBC',
  'ULVR LN Equity': 'Unilever', 'ASML NA Equity': 'ASML', 'SAP GY Equity': 'SAP', 'T US Equity': 'AT&T', 'VZ US Equity': 'Verizon',
  'PFE US Equity': 'Pfizer', 'CSCO US Equity': 'Cisco', 'QCOM US Equity': 'Qualcomm', 'INTC US Equity': 'Intel', 'CRM US Equity': 'Salesforce',
  'ADBE US Equity': 'Adobe', 'ORCL US Equity': 'Oracle', 'COST US Equity': 'Costco', 'WMT US Equity': 'Walmart', 'PEP US Equity': 'PepsiCo',
  'ABBV US Equity': 'AbbVie', 'AVGO US Equity': 'Broadcom', 'CAT US Equity': 'Caterpillar', 'BA US Equity': 'Boeing', 'MS US Equity': 'Morgan Stanley',
  'LIN US Equity': 'Linde', 'PLD US Equity': 'Prologis', 'GE US Equity': 'GE Aerospace', 'NFLX US Equity': 'Netflix', 'TSLA US Equity': 'Tesla',
  'AMZN US Equity': 'Amazon', 'AAPL US Equity': 'Apple', 'MSFT US Equity': 'Microsoft', 'NVDA US Equity': 'Nvidia', 'JNJ US Equity': 'Johnson & Johnson',
  // The press writes AB InBev: a Google News search for "Anheuser-Busch InBev" found 2 Dutch stories in a week, against 35.
  'ABI BB Equity': 'AB InBev', 'BUD US Equity': 'AB InBev',
};

/**
 * A legal form or "Group" and whatever follows it: Inc., Corporation, SA/NV, S.p.A., A/S, Oyj, Groep. Something
 * must come before it, so "Groupe Bruxelles Lambert" keeps its first word.
 */
const LEGAL_TAIL = /^(.+?)[\s,]+(?:Inc|Incorporated|Corp|Corporation|Co\/The|Company|PLC|Ltd|Limited|Group|Groep|Groupe|Holdings?|SA|S\.A|AG|NV|N\.V|SE|S\.p\.A|SpA|ASA|AB|A\/S|Oyj|Abp)\.?(?=$|[\s,/(])/i;

const INDEX_NAMES: Record<string, string> = {
  SPX: 'S&P 500', INDU: 'Dow Jones Industrial Average', CCMP: 'Nasdaq Composite', NDX: 'Nasdaq 100', RTY: 'Russell 2000', VIX: 'Cboe Volatility Index',
  SX5E: 'Euro Stoxx 50', SXXP: 'Stoxx Europe 600', UKX: 'FTSE 100', DAX: 'DAX', CAC: 'CAC 40', SMI: 'Swiss Market Index', IBEX: 'Ibex 35',
  FTSEMIB: 'FTSE MIB', AEX: 'AEX', NKY: 'Nikkei 225', HSI: 'Hang Seng', SHCOMP: 'Shanghai Composite', SHSZ300: 'CSI 300', KOSPI: 'Kospi',
  TWSE: 'Taiex', AS51: 'S&P/ASX 200', SENSEX: 'Sensex', NIFTY: 'Nifty 50', STI: 'Straits Times', SPTSX: 'S&P/TSX', MEXBOL: 'IPC', IBOV: 'Ibovespa',
};

const CMD_NAMES: Record<string, string> = {
  CL1: 'West Texas Intermediate crude', CO1: 'Brent crude', NG1: 'US natural gas', HO1: 'Heating oil', XB1: 'Gasoline', GC1: 'Gold', SI1: 'Silver',
  PL1: 'Platinum', PA1: 'Palladium', HG1: 'Copper', 'W 1': 'Wheat', 'C 1': 'Corn', 'S 1': 'Soybeans', KC1: 'Arabica coffee', SB1: 'Raw sugar',
  CC1: 'Cocoa', CT1: 'Cotton', LC1: 'Live cattle', LH1: 'Lean hogs',
};

export function shortName(def: SecurityDef): string {
  if (NAME_OVERRIDES[def.id]) return NAME_OVERRIDES[def.id];
  if (def.cls === 'index') return INDEX_NAMES[def.ticker] ?? def.name;
  if (def.cls === 'commodity') return CMD_NAMES[def.ticker] ?? def.name;
  if (def.cls === 'crypto') return def.name.split(' / ')[0];
  return (LEGAL_TAIL.exec(def.name)?.[1] ?? def.name).replace(/[\s,.]+$/, '').trim();
}


function add(stories: Story[]) {
  if (!stories.length) return;
  news.set((s) => {
    const seen = new Set(s.stories.map((x) => x.id));
    const fresh = stories.filter((x) => !seen.has(x.id));
    if (!fresh.length) return s;
    const all = [...fresh, ...s.stories].sort((a, b) => b.time - a.time).slice(0, 600);
    return { stories: all, seq: s.seq + fresh.length };
  });
}

export function addRealStories(stories: Story[]) {
  add(stories);
}

export function storyMatches(s: Story, topic: string | undefined, ticker: string | undefined, query: string | undefined): boolean {
  if (topic && topic !== 'ALL' && !s.topics.includes(topic)) return false;
  if (ticker && !s.tickers.includes(ticker)) return false;
  if (query) {
    const q = query.toUpperCase();
    const hay = `${s.headline} ${s.body.join(' ')} ${s.tickers.join(' ')} ${s.topics.join(' ')}`.toUpperCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
