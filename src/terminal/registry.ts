import type { AssetClass } from '../data/types';
import type { FnDef } from './types';
import { HELP } from '../functions/HELP';
import { GIP, GP } from '../functions/GP';
import { DES } from '../functions/DES';
import { HP } from '../functions/HP';
import { FA } from '../functions/FA';
import { ANR } from '../functions/ANR';
import { EE } from '../functions/EE';
import { DVD } from '../functions/DVD';
import { HDS } from '../functions/HDS';
import { RV } from '../functions/RV';
import { EVTS } from '../functions/EVTS';
import { WACC } from '../functions/WACC';
import { COMP } from '../functions/COMP';
import { BETA } from '../functions/BETA';
import { CORR } from '../functions/CORR';
import { DEPTH } from '../functions/DEPTH';
import { TAS } from '../functions/TAS';
import { BQ } from '../functions/BQ';
import { CN, N, TOP } from '../functions/NEWS';
import { WEI } from '../functions/WEI';
import { IMAP } from '../functions/IMAP';
import { MOST } from '../functions/MOST';
import { EQS } from '../functions/EQS';
import { BTMM, GC, WB, WIRP } from '../functions/RATES';
import { YAS } from '../functions/YAS';
import { CRYP, FXC, GLCO, WCRS } from '../functions/FXMON';
import { ECO, ECST } from '../functions/ECO';
import { OMON, OVME } from '../functions/OPTIONS';
import { W } from '../functions/W';
import { PORT } from '../functions/PORT';
import { ALRT } from '../functions/ALRT';
import { LAST, LPAD, PDFU, SECF } from '../functions/TOOLS';
import { IB } from '../functions/IB';
import { HS } from '../functions/HS';
import { NOTE } from '../functions/NOTE';

const EQ: AssetClass[] = ['equity'];
const TRADABLE: AssetClass[] = ['equity', 'commodity', 'crypto'];

export const FUNCTIONS: FnDef[] = [
  // Equity research
  { code: 'DES', name: 'Description', category: 'Equity', needsSec: true, desc: 'Security description: business profile, price and valuation snapshot, estimates, ownership. Adapts to indices, currencies, commodities, rates, crypto and Treasuries.', component: DES, example: 'NVDA US <EQUITY> DES <GO>' },
  { code: 'FA', name: 'Financial Analysis', category: 'Equity', needsSec: true, classes: EQ, desc: 'Income statement, balance sheet, cash flow and ratios, annual and quarterly, with growth and trend.', component: FA, aliases: ['FIN'] },
  { code: 'ANR', name: 'Analyst Recommendations', category: 'Equity', needsSec: true, classes: EQ, desc: 'Consensus rating, price targets and the list of broker recommendations.', component: ANR },
  { code: 'EE', name: 'Earnings & Estimates', category: 'Equity', needsSec: true, classes: EQ, desc: 'Consensus EPS and revenue estimates, earnings history and surprises, next report date.', component: EE, aliases: ['ERN', 'EM'] },
  { code: 'DVD', name: 'Dividend History', category: 'Equity', needsSec: true, classes: EQ, desc: 'Declared, ex, record and pay dates, amounts, frequency and projected next dividend.', component: DVD, aliases: ['DVDH'] },
  { code: 'HDS', name: 'Holders', category: 'Equity', needsSec: true, classes: EQ, desc: 'Largest institutional holders with position, percent outstanding and changes.', component: HDS, aliases: ['OWN'] },
  { code: 'RV', name: 'Relative Valuation', category: 'Equity', needsSec: true, classes: EQ, desc: 'Peer comparison of valuation multiples, profitability and returns with peer medians.', component: RV, aliases: ['COMPS', 'PEERS'] },
  { code: 'EVTS', name: 'Corporate Events', category: 'Equity', classes: EQ, desc: 'Calendar of earnings releases and ex-dividend dates, for one company or the whole universe.', component: EVTS, aliases: ['EA', 'ERNC', 'CACS'] },
  { code: 'WACC', name: 'Cost of Capital', category: 'Equity', needsSec: true, classes: EQ, desc: 'Weighted average cost of capital from CAPM and after-tax cost of debt, with a perpetuity value check.', component: WACC },
  // Charts
  { code: 'GP', name: 'Price Graph', category: 'Charts', needsSec: true, desc: 'Historical chart with line, mountain, candle and bar styles, daily/weekly/monthly frequency, SMA/EMA, Bollinger bands, volume, RSI, MACD and comparison overlays. Scroll to zoom, drag to pan.', component: GP, aliases: ['G', 'CHART', 'GPC', 'GPO'], example: 'AAPL US <EQUITY> GP <GO>' },
  { code: 'GIP', name: 'Intraday Price Graph', category: 'Charts', needsSec: true, desc: "Today's intraday chart against the previous close, updating live.", component: GIP, aliases: ['IGP'], example: 'EURUSD <CRNCY> GIP <GO>' },
  { code: 'HP', name: 'Historical Prices', category: 'Charts', needsSec: true, desc: 'Daily, weekly, monthly, quarterly or yearly price table with changes and volume; copy or export to CSV.', component: HP, aliases: ['HPT'] },
  { code: 'COMP', name: 'Comparative Returns', category: 'Charts', needsSec: true, desc: 'Rebased performance of a security against benchmarks and peers over a chosen period.', component: COMP, aliases: ['CMP', 'TRA'] },
  { code: 'HS', name: 'Historical Spread', category: 'Charts', needsSec: true, desc: 'Spread or ratio between two securities with mean, standard deviation, z-score and percentile (2s10s, Brent-WTI, gold/silver).', component: HS, aliases: ['SPRD', 'RATIO'], example: 'USGG10YR <INDEX> HS <GO>' },
  { code: 'BETA', name: 'Historical Beta', category: 'Charts', needsSec: true, classes: ['equity', 'index', 'crypto', 'commodity', 'fx'], desc: 'Regression of returns against an index: raw and adjusted beta, alpha, R², with scatter plot.', component: BETA },
  // News
  { code: 'TOP', name: 'Top News', category: 'News', desc: 'Most important headlines across markets, updating as the session unfolds.', component: TOP, aliases: ['NEWS', 'TOPS'] },
  { code: 'N', name: 'News Search', category: 'News', desc: 'All news with topic tabs and keyword search. Add a topic (N CRYPTO) or a security (AAPL N).', component: N, aliases: ['NI', 'NSE'], example: 'N CRYPTO <GO>' },
  { code: 'CN', name: 'Company News', category: 'News', needsSec: true, desc: 'Headlines mentioning the loaded security.', component: CN },
  // Markets
  { code: 'WEI', name: 'World Equity Indices', category: 'Markets', desc: 'Major equity indices by region with net and percent change, YTD in local currency and USD, intraday sparkline.', component: WEI, aliases: ['WEIF'] },
  { code: 'IMAP', name: 'Intraday Market Map', category: 'Markets', desc: 'Heat map of stocks by sector sized by market cap and coloured by performance.', component: IMAP, aliases: ['MMAP', 'HEAT'] },
  { code: 'MOST', name: 'Most Active', category: 'Markets', desc: 'Most active, top gainers, losers, value traded and unusual volume by region.', component: MOST, aliases: ['MOV', 'MOVERS'] },
  { code: 'EQS', name: 'Equity Screening', category: 'Markets', desc: 'Screen stocks by region, sector, size, valuation, yield, quality and momentum.', component: EQS, aliases: ['SCREEN'] },
  { code: 'BQ', name: 'Composite Quote', category: 'Markets', needsSec: true, desc: 'One-screen quote: live price, intraday chart, depth, trades, key statistics and news.', component: BQ, aliases: ['Q', 'QUOTE'] },
  { code: 'TAS', name: 'Time and Sales', category: 'Markets', needsSec: true, classes: TRADABLE, desc: 'Trade-by-trade tape with price, size, venue and conditions; VWAP and volume summary.', component: TAS, aliases: ['QR', 'T&S'] },
  { code: 'DEPTH', name: 'Market Depth', category: 'Markets', needsSec: true, classes: ['equity', 'commodity', 'crypto', 'fx'], desc: 'Limit order book with sizes, order counts, cumulative depth chart and imbalance.', component: DEPTH, aliases: ['MBO', 'MBP', 'BOOK'] },
  // FX & crypto
  { code: 'FXC', name: 'Currency Cross Rates', category: 'FX & Crypto', desc: 'Live cross-rate matrix of major currencies.', component: FXC, aliases: ['FXCX'] },
  { code: 'WCRS', name: 'World Currency Ranker', category: 'FX & Crypto', desc: 'Currencies ranked by performance against the US dollar over a chosen period.', component: WCRS, aliases: ['FXR'] },
  { code: 'CRYP', name: 'Crypto Monitor', category: 'FX & Crypto', desc: 'Major digital assets: live price, 24h range, volume, market value and returns. Streams real prices when online.', component: CRYP, aliases: ['CRYPTO', 'XBT'] },
  // Rates
  { code: 'WB', name: 'World Bond Markets', category: 'Rates & Credit', desc: 'Government yields by country and tenor with changes, spreads to Treasuries and Bunds, and curve slope.', component: WB, aliases: ['WBM', 'GOVT'] },
  { code: 'GC', name: 'Graph Curves', category: 'Rates & Credit', desc: 'Yield curves (US, Germany, UK, Japan) today versus one week, one month and one year ago.', component: GC, aliases: ['GCDF', 'CURVE', 'I25'] },
  { code: 'BTMM', name: 'Treasury & Money Markets', category: 'Rates & Credit', desc: 'Fed funds, SOFR, bills, Treasury actives in 32nds, curve spreads and swap rates.', component: BTMM, aliases: ['MMKT'] },
  { code: 'YAS', name: 'Yield & Spread Analysis', category: 'Rates & Credit', needsSec: true, classes: ['bond'], desc: 'Bond calculator: price/yield, accrued, duration, convexity, DV01, scenarios and cash flows.', component: YAS, aliases: ['YA'], example: 'CT10 <GOVT> YAS <GO>' },
  { code: 'WIRP', name: 'Rate Probabilities', category: 'Rates & Credit', desc: 'Market-implied central bank moves meeting by meeting, from the short end of the curve.', component: WIRP, aliases: ['FEDP'] },
  // Commodities
  { code: 'GLCO', name: 'Global Commodities', category: 'Commodities', desc: 'Energy, metals, grains, softs and livestock futures with changes, YTD and intraday.', component: GLCO, aliases: ['CMDTY', 'BCOM'] },
  // Economics
  { code: 'ECO', name: 'Economic Calendar', category: 'Economics', desc: 'Releases and central bank decisions with consensus, actual and prior; actuals appear live at release time.', component: ECO, aliases: ['ECOW', 'CAL'] },
  { code: 'ECST', name: 'World Economic Statistics', category: 'Economics', desc: 'GDP, inflation, unemployment and policy rates by country alongside live yields and markets.', component: ECST, aliases: ['ECFC', 'WECO'] },
  // Derivatives
  { code: 'OMON', name: 'Option Monitor', category: 'Derivatives', needsSec: true, classes: ['equity', 'index'], desc: 'Option chain by expiry with bids, offers, implied vol, greeks, volume and open interest; smile and term structure.', component: OMON, aliases: ['OSA'] },
  { code: 'OVME', name: 'Option Valuation', category: 'Derivatives', needsSec: true, classes: ['equity', 'index'], desc: 'Black-Scholes valuation, greeks, P&L profile and spot scenarios for a single option.', component: OVME, aliases: ['OV', 'OVM'] },
  // Portfolio & tools
  { code: 'W', name: 'Monitor', category: 'Portfolio & Tools', desc: 'Editable watchlists with live prices, changes, volume and intraday sparklines.', component: W, aliases: ['MON', 'WL', 'WATCH'] },
  { code: 'PORT', name: 'Portfolio & Risk', category: 'Portfolio & Tools', desc: 'Holdings and P&L, performance against a benchmark, VaR, beta, volatility and allocation.', component: PORT, aliases: ['PRTU', 'PA'] },
  { code: 'ALRT', name: 'Alerts', category: 'Portfolio & Tools', desc: 'Price and percent-change alerts that pop up wherever you are.', component: ALRT, aliases: ['ALERT', 'ALERTS'] },
  { code: 'CORR', name: 'Correlation Matrix', category: 'Portfolio & Tools', desc: 'Correlation of daily returns across any set of securities and periods.', component: CORR, aliases: ['CORM'] },
  { code: 'SECF', name: 'Security Finder', category: 'Portfolio & Tools', desc: 'Search every security by ticker, name or alias, filtered by asset class.', component: SECF, aliases: ['FIND', 'SEARCH'] },
  { code: 'LAST', name: 'Recently Used', category: 'Portfolio & Tools', desc: 'Your recently viewed securities and functions.', component: LAST, aliases: ['HIST', 'RECENT'] },
  { code: 'NOTE', name: 'Notes', category: 'Portfolio & Tools', desc: 'Personal notes per security or general, saved as you type.', component: NOTE, aliases: ['NOTES', 'MEMO'] },
  { code: 'LPAD', name: 'Launchpad Workspaces', category: 'Portfolio & Tools', desc: 'Apply a preset multi-panel workspace.', component: LPAD, aliases: ['BLP', 'LAUNCH'] },
  // Communication
  { code: 'IB', name: 'Instant Messages', category: 'Communication', desc: 'Chat with the help desk bot (quotes, news, calendar) and simulated trading desks.', component: IB, aliases: ['MSG', 'CHAT'] },
  // System
  { code: 'HELP', name: 'Function Directory', category: 'System', desc: 'Searchable list of every function, command syntax and keyboard shortcuts.', component: HELP, aliases: ['FUNC', 'MENU', 'H'] },
  { code: 'PDFU', name: 'Settings & Data Sources', category: 'System', desc: 'Display preferences, time zone, live data connections and workspace reset.', component: PDFU, aliases: ['SETTINGS', 'PREFS', 'PDF'] },
];

const BY_CODE = new Map<string, FnDef>();
for (const f of FUNCTIONS) BY_CODE.set(f.code, f);
for (const f of FUNCTIONS) for (const a of f.aliases ?? []) if (!BY_CODE.has(a)) BY_CODE.set(a, f);

export function lookupFn(code: string): FnDef | undefined {
  return BY_CODE.get(code.toUpperCase());
}
