import type { Route } from './types';

/**
 * Familiar function mnemonics accepted as aliases for the app's descriptive
 * names. They select the same app workflows and data sources. This mapping
 * also carries saved panels, layouts and settings to canonical names.
 */
export const LEGACY_CODES: Record<string, string> = {
  FLDS: 'FIELDS',
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
  TOP: 'MARKETNEWS',
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
  OSA: 'OPTIONSTRATEGY',
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

/**
 * Mnemonics that now open another screen than the one saved under them. TOP opened the official announcements
 * (HEADLINES) before it became the top market news, so a panel, recent function or layout saved as TOP keeps
 * the screen it showed.
 */
const SAVED_CODES: Record<string, string> = { TOP: 'HEADLINES' };

const MNEMONICS = new Map(Object.entries(LEGACY_CODES).map(([alias, code]) => [code, alias]));
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
