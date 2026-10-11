export type YellowKey = 'Equity' | 'Index' | 'Curncy' | 'Comdty' | 'Govt' | 'Corp' | 'Mtge' | 'M-Mkt' | 'Muni' | 'Pfd' | 'Client';
export type AssetClass = 'equity' | 'index' | 'future' | 'fx' | 'commodity' | 'rate' | 'crypto' | 'bond';
export type Region = 'Americas' | 'EMEA' | 'APAC';

export interface EquityInfo {
  sector: string;
  industry: string;
  /** Shares outstanding, millions. */
  shares: number;
  beta: number;
  /** Trailing revenue and net income, millions in the trading currency. */
  rev: number;
  ni: number;
  /** Annual dividend per share in the trading currency (pence for GBp lines). */
  dps: number;
  emp: number;
  hq: string;
  ceo?: string;
  founded: number;
  /** Fiscal year end month, 1-12. */
  fye: number;
  /** Net debt, millions (negative = net cash). */
  netDebt: number;
  /** Book equity, millions. */
  book: number;
  desc: string;
  /** Typical days after quarter end that results are reported. */
  lag?: number;
}

export interface CommodityInfo {
  unit: string;
  exch: string;
  size: string;
  months: string;
  group: 'Energy' | 'Precious Metals' | 'Base Metals' | 'Grains' | 'Softs' | 'Livestock';
}

export interface CryptoInfo {
  /** Circulating supply in coins. */
  supply: number;
  coinbase: string;
  launched: number;
}

export interface BondInfo {
  coupon: number;
  maturity: string; // ISO date
  issue: string;
  /** Generic yield securities this bond prices off, with interpolation weights. */
  legs: { id: string; w: number }[];
  /** Spread in bp over the interpolated generic yield. */
  spread: number;
  freq: 2;
  /** Corporate issuer (equity id); its share price drives the credit spread. */
  issuer?: string;
  issuerRef?: number;
  /** Amount outstanding, millions. */
  amount?: number;
  rating?: string;
  seniority?: string;
}

export interface FutureInfo {
  underlying: string;
  exch: string;
  multiplier: number;
  tick: number;
  divYield: number;
  /** Funding rate in percent, or the id of a yield security. */
  rate: number | string;
  monthly?: boolean;
}

export interface SecurityDef {
  /** Canonical id, e.g. "AAPL US Equity". */
  id: string;
  /** Ticker without yellow key, e.g. "AAPL US". */
  ticker: string;
  yk: YellowKey;
  name: string;
  cls: AssetClass;
  ccy: string;
  country: string;
  region: Region;
  exch?: string;
  /** Reference price (yield in % for rates). */
  px: number;
  /** Annualised volatility: lognormal fraction, or yield points for rates. */
  vol: number;
  dec: number;
  /** Search aliases. */
  alias?: string[];
  /** Symbol used by the calibration script. */
  yahoo?: string;
  /** Average daily volume (shares/contracts), for volume simulation. */
  adv?: number;
  eq?: EquityInfo;
  cmd?: CommodityInfo;
  cry?: CryptoInfo;
  bond?: BondInfo;
  fut?: FutureInfo;
  /** For FX: base and quote ISO codes. */
  fx?: { base: string; quote: string };
  /** For indices: description. */
  about?: string;
  /** For rates: tenor in years and curve family. */
  tenor?: number;
  curve?: string;
  /** Quote convention: price changes in percent, yields in absolute bp. */
  quote: 'price' | 'yield';
  /** Prices quoted in minor units (GBp, USd/bu). */
  minor?: boolean;
}

export interface Quote {
  id: string;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  /** Change vs previous close (price units). */
  chg: number;
  /** Percent change vs previous close. */
  pct: number;
  /** Epoch ms of last update. */
  time: number;
  /** Direction of last tick: 1 up, -1 down, 0 unchanged. */
  tick: -1 | 0 | 1;
  /** Data source for this quote. */
  src: 'SIM' | 'LIVE' | 'DELAYED';
}

export interface Bar {
  /** Epoch ms of bar start. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Trade {
  t: number;
  px: number;
  size: number;
  side: -1 | 0 | 1;
  venue: string;
  cond: string;
}
