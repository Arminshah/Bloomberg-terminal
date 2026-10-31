import { describe, expect, it } from 'vitest';
import { lookupFn } from '../src/terminal/registry';

// docs/parity-build-plan.md, Appendix A: the provider's codes the app already covers, each with the screen it opens.
// Every one must keep opening it (M2.6). MSG (the provider's mail network) and FXFC (licensed forecasts) are not
// covered and are not listed.
const COVERED: Record<string, string> = {
  PORT: 'PORTFOLIO', PRTU: 'PORTFOLIO', GP: 'CHART', G: 'CHART', IB: 'MESSAGES', FA: 'FINANCIALS', DES: 'PROFILE', DS: 'DOCSEARCH', DSCO: 'DOCSEARCH',
  EQS: 'SCREEN', HELP: 'HELP', W: 'WORKSHEET', WEI: 'MARKET', SRCH: 'BONDSEARCH', IMAP: 'INDEXMAP', TOP: 'MARKETNEWS', ANR: 'ANALYSTS',
  NSE: 'NEWS', NH: 'NEWS', GC: 'CURVE', RV: 'PEERS', EQRV: 'PEERS', YAS: 'BONDCALC', WACC: 'WACC', EE: 'EARNINGSSUMMARY', SEARCH: 'SEARCH',
  SECF: 'SEARCH', ALLQ: 'DEALERQUOTES', CN: 'COMPANYNEWS', ECO: 'RELEASES', ECST: 'ECONSTATS', GF: 'FUNDCHART', WB: 'BONDS', BETA: 'BETA',
  DDIS: 'DEBTPROFILE', SPLC: 'SUPPLYCHAIN', WIRP: 'RATEPROBS', CCRV: 'FUTURESCURVE', BTMM: 'MONEYMARKET', ECFC: 'ECOFORECASTS',
  EEG: 'ESTIMATEGRAPH', HDS: 'HOLDERS', OWN: 'HOLDERS', IN: 'INDEXLIST', DVD: 'DIVIDENDS', EQRP: 'RISKPREMIUM', ERN: 'EARNINGS',
  EVTS: 'EVENTS', FLDS: 'FIELDS', MEMB: 'MEMBERS', MOST: 'MOVERS', OSA: 'OPTIONSTRATEGY', FRD: 'FXFORWARD', CMGR: 'COMPLIANCE',
  BTST: 'STRATEGIES', CACS: 'CORPACTIONS', ECTR: 'TRADEFLOWS', EEO: 'ESTIMATES', HP: 'HISTORY', HISTORY: 'HISTORY', HVT: 'VOLATILITY',
  NLRT: 'ALERTS', OMON: 'OPTIONS', TRA: 'TOTALRETURN', BLP: 'LAYOUTS', LLP: 'LAYOUTS', SEAR: 'SEARCHRESULTS', WELC: 'WELCOME',
};

describe('the provider codes the app covers (plan, Appendix A)', () => {
  it.each(Object.entries(COVERED))('%s opens %s', (code, fn) => {
    expect(lookupFn(code)?.code).toBe(fn);
  });
});
