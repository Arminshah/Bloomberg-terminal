import type { Route } from './types';

/**
 * Command codes of earlier versions, which followed Bloomberg's function
 * mnemonics, and the names that replaced them. Used to carry saved panels,
 * layouts and settings over, and to tell someone who types an old code what
 * it is called now. The old codes do not run anything themselves.
 */
export const LEGACY_CODES: Record<string, string> = {
  DES: 'PROFILE',
  FA: 'FINANCIALS',
  ANR: 'ANALYSTS',
  EE: 'EARNINGS',
  DVD: 'DIVIDENDS',
  HDS: 'HOLDERS',
  RV: 'PEERS',
  EVTS: 'EVENTS',
  GF: 'FUNDCHART',
  GP: 'CHART',
  GIP: 'INTRADAY',
  HP: 'HISTORY',
  COMP: 'RETURNS',
  TRA: 'TOTALRETURN',
  HS: 'SPREAD',
  HVT: 'VOLATILITY',
  TOP: 'HEADLINES',
  N: 'NEWS',
  CN: 'COMPANYNEWS',
  WEI: 'MARKET',
  WEIF: 'INDEXFUTURES',
  MOV: 'CONTRIB',
  IMAP: 'HEATMAP',
  MOST: 'MOVERS',
  EQS: 'SCREEN',
  BQ: 'QUOTE',
  TAS: 'TRADES',
  FXC: 'FXMATRIX',
  WCRS: 'FXRANK',
  CRYP: 'CRYPTO',
  FRD: 'FXFORWARD',
  OVML: 'FXOPTION',
  WB: 'BONDS',
  GC: 'CURVE',
  BTMM: 'MONEYMARKET',
  YAS: 'BONDCALC',
  WIRP: 'RATEPROBS',
  SWPM: 'SWAPCALC',
  CENB: 'CENTRALBANKS',
  SRCH: 'BONDSEARCH',
  DDIS: 'DEBTPROFILE',
  ALLQ: 'DEALERQUOTES',
  GLCO: 'COMMODITIES',
  ECO: 'RELEASES',
  ECST: 'ECONSTATS',
  CDR: 'HOLIDAYS',
  OMON: 'OPTIONS',
  OVME: 'OPTIONCALC',
  W: 'WATCHLIST',
  PORT: 'PORTFOLIO',
  ALRT: 'ALERTS',
  CORR: 'CORRELATION',
  SECF: 'SEARCH',
  LAST: 'RECENT',
  NOTE: 'NOTES',
  LPAD: 'LAYOUTS',
  IB: 'MESSAGES',
  PROV: 'PROVIDERS',
  PDFU: 'SETTINGS',
};

/** The current name for an old code, if it is one. */
export function renamedCode(code: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(LEGACY_CODES, code) ? LEGACY_CODES[code] : undefined;
}

/** A saved route under its current function name. */
export function migrateRoute(r: Route): Route {
  const next = renamedCode(r.fn);
  return next ? { ...r, fn: next } : r;
}
