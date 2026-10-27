import type { Route } from './types';

/**
 * Familiar function mnemonics accepted as aliases for the app's descriptive
 * names. They select the same app workflows and data sources. This mapping
 * also carries saved panels, layouts and settings to canonical names. The
 * first mnemonic listed for a function is the one its header shows.
 */
export const LEGACY_CODES: Record<string, string> = {
  FLDS: 'FIELDS',
  DES: 'PROFILE',
  FA: 'FINANCIALS',
  ANR: 'ANALYSTS',
  ERN: 'EARNINGS',
  // EE is the earnings and estimates page (a July 2024 screenshot), ERN the earnings history.
  EE: 'EARNINGSSUMMARY',
  EEO: 'ESTIMATES',
  EEB: 'ESTIMATES',
  DVD: 'DIVIDENDS',
  CACS: 'CORPACTIONS',
  BBK: 'BUYBACKS',
  SI: 'SHORTINTEREST',
  EQRP: 'RISKPREMIUM',
  SPLC: 'SUPPLYCHAIN',
  HDS: 'HOLDERS',
  OWN: 'HOLDERS',
  MGMT: 'MANAGEMENT',
  RV: 'PEERS',
  EQRV: 'PEERS',
  EVTS: 'EVENTS',
  EVT: 'EVENTS',
  CF: 'FILINGS',
  DS: 'DOCSEARCH',
  // Document Search, as the University of San Diego's guide names DSCO (checked 27 October 2026); DS stays the name shown.
  DSCO: 'DOCSEARCH',
  GF: 'FUNDCHART',
  GP: 'CHART',
  GIP: 'INTRADAY',
  HP: 'HISTORY',
  COMP: 'RETURNS',
  TRA: 'TOTALRETURN',
  HS: 'SPREAD',
  HVT: 'VOLATILITY',
  HVG: 'VOLATILITY',
  TOP: 'MARKETNEWS',
  N: 'NEWS',
  NSE: 'NEWS',
  CN: 'COMPANYNEWS',
  WEI: 'MARKET',
  WEIF: 'INDEXFUTURES',
  MOV: 'CONTRIB',
  MEMB: 'MEMBERS',
  MRR: 'RANKEDRETURNS',
  GRR: 'GROUPRETURNS',
  IPO: 'IPOS',
  IMAP: 'INDEXMAP',
  MOST: 'MOVERS',
  EXCH: 'EXCHANGES',
  EQS: 'SCREEN',
  BQ: 'QUOTE',
  TAS: 'TRADES',
  QR: 'TRADES',
  FXC: 'FXMATRIX',
  WCRS: 'FXRANK',
  CRYP: 'CRYPTO',
  FRD: 'FXFORWARD',
  OVML: 'FXOPTION',
  HRA: 'REGRESSION',
  TECH: 'STUDIES',
  IN: 'INDEXLIST',
  IYC: 'CURVEMENU',
  FED: 'FEDPORTAL',
  // The other central bank portals the 2020 Quick Start lists with FED.
  ECB: 'ECBPORTAL',
  BOE: 'BOEPORTAL',
  BOJ: 'BOJPORTAL',
  // Central Bank Rate Analysis (2020 Quick Start, name only).
  CBRT: 'RATEANALYSIS',
  // My News, personal news pages (2020 Quick Start).
  MYN: 'MYNEWS',
  INSD: 'INSIDERS',
  EEG: 'ESTIMATEGRAPH',
  EM: 'EARNINGSTREND',
  EA: 'EARNINGSSEASON',
  CACT: 'ACTIONCALENDAR',
  SIA: 'SHORTRANKING',
  GX: 'CROSSSECTION',
  CCB: 'CLASSIFICATION',
  FLNG: 'FILINGS13F',
  RELS: 'RELATED',
  ECOW: 'ECONCHART',
  ECWB: 'ECONCHART',
  CCRV: 'FUTURESCURVE',
  CTM: 'CONTRACTS',
  ECFC: 'ECOFORECASTS',
  ECTR: 'TRADEFLOWS',
  EQBT: 'BACKTEST',
  BILL: 'LEGISLATION',
  FXCA: 'CONVERT',
  WB: 'BONDS',
  WBMV: 'BONDMOVERS',
  WBF: 'BONDFUTURES',
  GC: 'CURVE',
  BTMM: 'MONEYMARKET',
  YAS: 'BONDCALC',
  WIRP: 'RATEPROBS',
  SWPM: 'SWAPCALC',
  CENB: 'CENTRALBANKS',
  FOMC: 'FEDMEETINGS',
  SRCH: 'BONDSEARCH',
  DDIS: 'DEBTPROFILE',
  ALLQ: 'DEALERQUOTES',
  GLCO: 'COMMODITIES',
  // The commodity sector pages (2020 Quick Start; Michigan's commodities guide; N05 for OIL).
  OIL: 'OILMARKET',
  GAS: 'NATURALGAS',
  MINE: 'METALS',
  AGS: 'AGRICULTURE',
  // World Currency Rates (2020 Quick Start; Michigan's currencies guide).
  WCR: 'CURRENCYRATES',
  // World Equity Index Rankings and the World Equity Markets Map (2020 Quick Start, names only).
  WEIS: 'INDEXRANKING',
  WM: 'WORLDMAP',
  ECO: 'RELEASES',
  ECST: 'ECONSTATS',
  ECMX: 'ECONSTATS',
  CDR: 'HOLIDAYS',
  OMON: 'OPTIONS',
  OVME: 'OPTIONCALC',
  OSA: 'OPTIONSTRATEGY',
  // W is Worksheets in the provider's own chapter list; WATCHLIST keeps WATCH.
  W: 'WORKSHEET',
  PORT: 'PORTFOLIO',
  ALRT: 'ALERTS',
  CORR: 'CORRELATION',
  SECF: 'SEARCH',
  LAST: 'RECENT',
  NOTE: 'NOTES',
  LPAD: 'LAYOUTS',
  // The provider's own code for its Launchpad (the chapter list of its Instant Bloomberg, Launchpad and Worksheets tutorial).
  LLP: 'LAYOUTS',
  IB: 'MESSAGES',
  PROV: 'PROVIDERS',
  PDF: 'SETTINGS',
  PDFU: 'SETTINGS',
  // Other names the terminal has for these screens; listed last, so the names above stay the ones shown.
  MLRT: 'ALERTS',
  GV: 'VOLATILITY',
  NI: 'NEWS',
  NH: 'NEWS',
  G: 'CHART',
  // From the news and research quick start (reference document 14): screens the app has under another name.
  FIRS: 'BREAKING',
  HCP: 'HISTORY',
  HCPI: 'HISTORY',
  FXFR: 'FXFORWARD',
  // From Abdoh's course notes (reference document 16): creating a portfolio and adding its positions.
  PRTU: 'PORTFOLIO',
};

/**
 * Chart mnemonics that open CHART drawn a particular way: GPO as open-high-low-close bars, GPC as
 * candlesticks, and the study commands RSI, MACD and BOLL with that study added, as the terminal's TECH list
 * runs them. The word travels as CHART's first argument, so a saved panel reopens the same way.
 */
/**
 * Mnemonics that are also US tickers (Bio-Techne, Hecla Mining, the iShares consumer discretionary fund, Electronic
 * Arts, FLEX LNG, Waste Management). Followed by US they name the stock, as "TECH US DES"; on their own or before anything else, the
 * function.
 */
export const TICKER_MNEMONICS = new Set(['TECH', 'HL', 'IYC', 'EA', 'FLNG', 'BILL', 'WM']);

export const CHART_STYLES: Record<string, string> = { GPO: 'BAR', GPC: 'CANDLE', RSI: 'RSI', MACD: 'MACD', BOLL: 'BOLL' };

/** Words that open TOPMOVERS on one of its lists: GAINERS is TOPMOVERS GAINERS. */
export const MOVER_WORDS: Record<string, string> = { GAINERS: 'GAINERS', LOSERS: 'LOSERS', TRENDING: 'TRENDING' };

/** The arguments a function word brings with it, ahead of any typed after it: GPC AAPL 3M is CHART AAPL CANDLE 3M. */
export function argsWith(word: string, typed?: string): string | undefined {
  const w = word.toUpperCase();
  const text = [CHART_STYLES[w] ?? MOVER_WORDS[w], typed?.trim()].filter(Boolean).join(' ');
  return text || undefined;
}

/** The mnemonic and remaining arguments a chart route is shown with: CHART with CANDLE shows as GPC. */
export function styledMnemonic(code: string, args?: string): { mnemonic: string; args?: string } {
  if (code === 'CHART' && args) {
    const [head, ...rest] = args.trim().split(/\s+/);
    const style = Object.entries(CHART_STYLES).find(([, a]) => a === head.toUpperCase());
    if (style) return { mnemonic: style[0], ...(rest.length ? { args: rest.join(' ') } : {}) };
  }
  return { mnemonic: primaryMnemonic(code), ...(args ? { args } : {}) };
}

/**
 * Mnemonics that now open another screen than the one saved under them. TOP opened the official announcements
 * (HEADLINES) before it became the top market news, so a panel, recent function or layout saved as TOP keeps
 * the screen it showed.
 */
const SAVED_CODES: Record<string, string> = { TOP: 'HEADLINES' };

/**
 * Mnemonics accepted when typed but not shown as the screen's name, because the screen covers less than the
 * terminal function: CF searches filings in many markets, FILINGS reads SEC EDGAR only.
 */
const TYPED_ONLY = new Set(['CF']);

const MNEMONICS = new Map<string, string>();
for (const [alias, code] of Object.entries(LEGACY_CODES)) if (!MNEMONICS.has(code) && !TYPED_ONLY.has(alias)) MNEMONICS.set(code, alias);
/** Familiar short command for a descriptive canonical function; stored routes stay canonical. */
export const primaryMnemonic = (code: string): string => MNEMONICS.get(code.toUpperCase()) ?? code;

/** The current name for an old code saved in a panel, layout or recent list, if it is one. */
export function renamedCode(code: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(SAVED_CODES, code)) return SAVED_CODES[code];
  return Object.prototype.hasOwnProperty.call(LEGACY_CODES, code) ? LEGACY_CODES[code] : undefined;
}

/** A saved route under its current function name. */
export function migrateRoute(r: Route): Route {
  const next = renamedCode(r.fn);
  return next ? { ...r, fn: next } : r;
}
