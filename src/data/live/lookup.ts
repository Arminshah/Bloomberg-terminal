import { EU_EXCHANGES, parseListing, yahooListingSymbol, type Listing } from '../listings';
import { BROWSER_FEEDS_ENABLED } from '../providers';
import { createStore } from '../../core/store';
import { engine } from '../market';
import { DAY_MS, dayNum, dayToIso, isBusinessDay, isoToDay, prevBusinessDay } from '../calendar';
import type { EquityInfo, SecurityDef } from '../types';
import { settings } from '../../terminal/settings';
import { trackFinnhubSymbol } from './feeds';
import { adoptYahooHistory, barsFromChart, yahooGet, YahooDisabled, type Dividend, type Split } from './yahoo';
import { loadSecCompanies, searchCompanies } from './sec';

/**
 * Securities that are not built in are looked up online when someone types
 * them. The desktop app asks Yahoo Finance through its main process (no key
 * needed); the browser uses Finnhub with the key from SETTINGS. Found securities
 * are saved, so they load instantly (and calibrated) on the next start.
 */

/** Official sources the desktop app's main process fetches (fixed URLs, see electron/main.cjs). */
export type OfficialSource =
  | 'effr' | 'sofr' | 'nyfed' | 'fomc' | 'ecb' | 'boe' | 'boc' | 'rba' | 'snb' | 'bcb'
  | 'bunds' | 'gilts' | 'jgb' | 'jgbHistory' | 'canadas' | 'acgb'
  | 'ukcpi' | 'ukgdp' | 'ukunemp' | 'estatHicp' | 'estatUnemp' | 'estatGdp'
  | 'statcan' | 'absUnemp' | 'absCpi'
  | 'newsFed' | 'newsEcb' | 'newsBoe' | 'newsBoc' | 'newsRba' | 'newsBea' | 'newsEsma'
  | 'newsFedSpeeches' | 'newsEcbBlog' | 'newsBoj' | 'newsBis' | 'newsSec';

declare global {
  interface Window {
    arminDesktop?: {
      platform: string;
      yahoo(path: string): Promise<{ status: number; data: unknown; disabled?: boolean; session?: boolean }>;
      treasury(year: number): Promise<{ status: number; text: string }>;
      official(source: OfficialSource, since: string): Promise<{ status: number; text: string; sourceLabel?: string; missing?: string }>;
      fred?(kind: 'release-dates' | 'observations' | 'first-release', arg: string, from?: string): Promise<{ status: number; text: string; missing?: string; refused?: string; throttled?: boolean }>;
      sec?(kind: import('./sec').SecKind, arg: string): Promise<import('./sec').SecAnswer>;
      kraken?(kind: 'ticker' | 'ohlc' | 'depth', arg: string, n?: number): Promise<{ status: number; text: string; serverTime?: number; disabled?: boolean }>;
      coingecko?(): Promise<{ status: number; text: string; missing?: string }>;
      eod?(provider: import('./eod').EodProvider, ticker: string, from: string, to: string): Promise<KeyedAnswer>;
      analysts?(kind: import('./analysts').AnalystKind, symbol: string): Promise<KeyedAnswer>;
      finnhubResearch?(kind: 'ratings', symbol: string): Promise<KeyedAnswer>;
      equibles?(kind: import('./equibles').ResearchKind, symbol: string): Promise<KeyedAnswer>;
      tipranks?(kind: 'consensus' | 'ratings' | 'usage', ticker: string): Promise<KeyedAnswer>;
      assistant?(messages: unknown[]): Promise<import('../assistant/types').AssistantAnswer>;
      finnhub?(kind: 'profile' | 'metric' | 'recommendation' | 'earnings' | 'calendar' | 'quote', symbol: string): Promise<KeyedAnswer>;
      news?(source: import('./marketnews').NewsSource, arg?: string): Promise<KeyedAnswer>;
      alpaca?(kind: 'snapshots', symbols: string): Promise<KeyedAnswer>;
      optionChain?(arg: { symbol: string; expiry?: string; pageToken?: string }): Promise<KeyedAnswer>;
      /** Provider switches as they were when the page loaded. */
      settings?: Record<string, boolean>;
      providersStatus?(): Promise<import('../providers').ProviderReport>;
      providersSet?(name: string, value: string): Promise<{ ok: boolean; error?: string; credentials: import('../providers').ProviderReport['credentials'] }>;
      providersClear?(name: string): Promise<{ ok: boolean; credentials: import('../providers').ProviderReport['credentials'] }>;
      yahooConsent?(): Promise<{ ok: boolean; detail: string }>;
      providersSelfTest?(): Promise<{ at: number; version: string; platform: string; report: string; results: { id: string; label: string; state: 'pass' | 'fail' | 'skip' | 'off'; status?: number; ms?: number; detail: string }[] }>;
      providersImport?(text: string): Promise<{ ok: boolean; error?: string; saved: string[]; skipped: { line?: number; name?: string; reason: string }[]; notes?: { line: number; name: string; note: string }[]; credentials: import('../providers').ProviderReport['credentials'] }>;
      providersSetting?(name: string, value: boolean): Promise<{ ok: boolean; error?: string; settings: import('../providers').ProviderReport['settings'] }>;
      streamOpen?(): Promise<void>;
      streamSend?(msg: string): Promise<void>;
      streamClose?(): Promise<void>;
      onStream?(cb: (kind: string, data?: string) => void): () => void;
    };
  }
}

/**
 * An answer from a keyed source through the main process: the text with the time it arrived; `cached` when
 * it was kept from an earlier request, `stale` when a newer one failed; `missing` or `refused` when no
 * usable key is configured; `budget` when the app's daily allowance for the provider is spent.
 */
export interface KeyedAnswer {
  /** Earliest retry time after a provider throttle or circuit breaker. */
  retryAt?: number;
  status: number;
  text: string;
  at?: number;
  cached?: boolean;
  stale?: boolean;
  missing?: string;
  refused?: string;
  budget?: boolean;
  /** The switch that keeps this source off. */
  gated?: string;
  error?: string;
}

export type LookupSource = 'yahoo' | 'finnhub';
export type LookupResult = { ok: true; def: SecurityDef } | { ok: false; reason: string };
export interface OnlineHit {
  symbol: string;
  name: string;
  exchange: string;
}

type Bar = { day: number; o: number; h: number; l: number; c: number; v: number };

const FINNHUB = 'https://finnhub.io/api/v1';
const MAX_SAVED = 60;

export const customSecurities = createStore<{ defs: SecurityDef[] }>({ defs: [] }, 'custom-securities', 1);

export function lookupSource(): LookupSource | null {
  if (typeof window !== 'undefined' && window.arminDesktop?.yahoo) return 'yahoo';
  if (BROWSER_FEEDS_ENABLED && settings.get().finnhubKey.trim()) return 'finnhub';
  return null;
}

/** Normalises typed input (APLD, $APLD, brk.b, BRK/B US) to a bare ticker, or null. */
export function normalizeTicker(input: string): string | null {
  const t = input.trim().toUpperCase().replace(/^\$/, '').replace(/\s+(US)?\s*(EQUITY)?$/, '').trim();
  if (!/^[A-Z][A-Z0-9]{0,5}([./-][A-Z]{1,2})?$/.test(t)) return null;
  return t.replace(/[.-]/, '/');
}

const yahooSymbol = (t: string) => t.replace('/', '-');
const finnhubSymbol = (t: string) => t.replace('/', '.');

// ------------------------------------------------------------ mapping helpers

const YAHOO_SECTOR: Record<string, string> = {
  Technology: 'Information Technology', 'Communication Services': 'Communication Services', 'Consumer Cyclical': 'Consumer Discretionary',
  'Consumer Defensive': 'Consumer Staples', Healthcare: 'Health Care', 'Financial Services': 'Financials', Energy: 'Energy',
  Industrials: 'Industrials', 'Basic Materials': 'Materials', Utilities: 'Utilities', 'Real Estate': 'Real Estate',
};

/** Maps a free-text industry (Finnhub) to the terminal's sector names. */
export function sectorFromIndustry(industry: string): string {
  const s = industry.toLowerCase();
  if (/media|telecom|communications$|entertainment|interactive/.test(s)) return 'Communication Services';
  // Health care first: "biotechnology" would otherwise match "technology".
  if (/pharma|biotech|health|life sciences|medical/.test(s)) return 'Health Care';
  if (/semicond|technolog|software|electronic|internet|it services|computer|communications equipment/.test(s)) return 'Information Technology';
  if (/bank|financ|insur|capital markets|asset management|brokerage/.test(s)) return 'Financials';
  if (/food|beverage|tobacco|consumer products|personal products|household products/.test(s)) return 'Consumer Staples';
  if (/retail|hotel|restaurant|leisure|automobile|auto comp|textile|apparel|luxury|household durable|diversified consumer|distributors/.test(s)) return 'Consumer Discretionary';
  if (/energy|oil|gas|coal/.test(s)) return 'Energy';
  if (/utilit/.test(s)) return 'Utilities';
  if (/real estate|reit/.test(s)) return 'Real Estate';
  if (/chemical|metal|mining|paper|forest|packaging|construction material|steel/.test(s)) return 'Materials';
  return 'Industrials';
}

const YAHOO_EXCH: Record<string, string> = {
  NMS: 'NASDAQ GS', NGM: 'NASDAQ GM', NCM: 'NASDAQ CM', NYQ: 'NYSE', ASE: 'NYSE American', PCX: 'NYSE Arca', BTS: 'Cboe BZX',
};

function finnhubExch(exchange: string): string {
  const e = exchange.toUpperCase();
  if (e.includes('NASDAQ')) return 'NASDAQ';
  if (e.includes('ARCA')) return 'NYSE Arca';
  if (e.includes('MKT') || e.includes('AMERICAN')) return 'NYSE American';
  if (e.includes('NEW YORK') || e.includes('NYSE')) return 'NYSE';
  if (e.includes('CBOE') || e.includes('BATS')) return 'Cboe BZX';
  return exchange;
}

/** Last close plus closes 1W, 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y back and the YTD base, like the built-in snapshot. */
export function anchorsFromBars(bars: Bar[]): [string, number][] {
  const n = bars.length;
  if (!n) return [];
  const out: [string, number][] = [[dayToIso(bars[n - 1].day), bars[n - 1].c]];
  for (const off of [5, 21, 63, 126, 252, 504, 756, 1250]) {
    const i = n - 1 - off;
    if (i >= 0) out.push([dayToIso(bars[i].day), bars[i].c]);
  }
  const year = new Date(bars[n - 1].day * DAY_MS).getUTCFullYear();
  for (let i = n - 1; i >= 0; i--) {
    if (new Date(bars[i].day * DAY_MS).getUTCFullYear() < year) {
      out.push([dayToIso(bars[i].day), bars[i].c]);
      break;
    }
  }
  return out;
}

function realisedVol(bars: Bar[]): number {
  const rets: number[] = [];
  for (let i = Math.max(1, bars.length - 252); i < bars.length; i++) {
    const r = Math.log(bars[i].c / bars[i - 1].c);
    if (Number.isFinite(r)) rets.push(r);
  }
  if (rets.length < 10) return 0.45;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1));
  return Math.min(2.5, Math.max(0.08, sd * Math.sqrt(252)));
}

function cleanName(n: string): string {
  return n.replace(/\s+/g, ' ').replace(/^(Mr|Ms|Mrs|Dr)\.?\s+/i, '').trim();
}

function shortDesc(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 520 && out) break;
    out += s;
  }
  return out.trim();
}

function baseDef(ticker: string, name: string, exch: string, px: number, vol: number, adv: number, eq: EquityInfo, source: LookupSource, symbol: string, anchors: [string, number][]): SecurityDef {
  return {
    id: `${ticker} US Equity`,
    ticker: `${ticker} US`,
    yk: 'Equity',
    name,
    cls: 'equity',
    ccy: 'USD',
    country: 'US',
    region: 'Americas',
    exch,
    px,
    vol,
    dec: px < 1 ? 4 : 2,
    adv,
    quote: 'price',
    eq,
    alias: [ticker],
    dynamic: { source, symbol, loaded: Date.now(), anchors },
  };
}

/** A stock listed in Europe, named the app's way (ABI BB), in the currency its exchange quotes it in. */
function listingDef(root: string, l: Listing, name: string, ccy: string, px: number, vol: number, adv: number, eq: EquityInfo, symbol: string, anchors: [string, number][]): SecurityDef {
  // London quotes most shares in pence.
  const minor = ccy === 'GBp' || ccy === 'GBX';
  return {
    id: `${root} ${l.code} Equity`,
    ticker: `${root} ${l.code}`,
    yk: 'Equity',
    name,
    cls: 'equity',
    ccy: minor ? 'GBp' : ccy,
    country: l.country,
    region: 'EMEA',
    exch: l.exch,
    px,
    vol,
    dec: minor ? 1 : px < 1 ? 4 : 2,
    adv,
    quote: 'price',
    eq,
    ...(minor ? { minor: true } : {}),
    alias: [symbol],
    dynamic: { source: 'yahoo', symbol, loaded: Date.now(), anchors },
  };
}

// ------------------------------------------------------------------- Yahoo

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;
const raw = (o: Json, k: string): number | undefined => {
  const v = o?.[k];
  const n = typeof v === 'object' && v !== null ? v.raw : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Builds a security from Yahoo chart (daily, multi-year) and quoteSummary responses. */
export function defFromYahoo(ticker: string, chart: Json, summary: Json, listed?: { root: string; listing: Listing }, reportedShares?: number): { def: SecurityDef; bars: Bar[] } | { error: string } {
  const meta = chart?.chart?.result?.[0]?.meta;
  if (!meta) return { error: `No data for ${ticker}` };
  if (meta.instrumentType && meta.instrumentType !== 'EQUITY') {
    const kind: Record<string, string> = { ETF: 'an ETF', MUTUALFUND: 'a mutual fund', INDEX: 'an index', CRYPTOCURRENCY: 'a cryptocurrency', CURRENCY: 'a currency', FUTURE: 'a future', OPTION: 'an option' };
    return { error: `${ticker} is ${kind[meta.instrumentType] ?? 'not a stock'}; only stocks can be looked up` };
  }
  if (listed) {
    if (EU_EXCHANGES[meta.exchangeName] !== listed.listing) return { error: `${ticker} is not listed on ${listed.listing.exch}` };
  } else if (meta.currency !== 'USD' || !YAHOO_EXCH[meta.exchangeName]) return { error: `${ticker} is not listed on a US exchange` };
  const exchName = listed ? listed.listing.exch : YAHOO_EXCH[meta.exchangeName];
  const bars = barsFromChart(chart).bars;
  if (!bars.length) return { error: `No usable price history for ${ticker}` };
  const r = summary?.quoteSummary?.result?.[0] ?? {};
  const ap = r.assetProfile ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const fd = r.financialData ?? {};
  const sd = r.summaryDetail ?? {};
  const pr = r.price ?? {};
  const last = bars[bars.length - 1].c;
  // Yahoo's summary leaves the share count out for many European stocks, and needs its session cookie (EU
  // cookies not accepted); the count from the last reported balance sheet fills in, else it stays unknown.
  const shares = (raw(ks, 'sharesOutstanding') ?? raw(meta, 'sharesOutstanding') ?? reportedShares ?? NaN) / 1e6;
  // A figure the source does not give stays missing (NaN), never a default or an estimate.
  const opt = (v: number | undefined) => (v == null ? NaN : v);
  const rev = opt(raw(fd, 'totalRevenue')) / 1e6;
  const ni = opt(raw(ks, 'netIncomeToCommon')) / 1e6;
  const fyeRaw = raw(ks, 'lastFiscalYearEnd');
  const fye = fyeRaw ? new Date(fyeRaw * 1000).getUTCMonth() + 1 : NaN;
  const mrq = raw(ks, 'mostRecentQuarter');
  const nextEarn = r.calendarEvents?.earnings?.earningsDate?.[0]?.raw as number | undefined;
  let lag = 30;
  if (mrq && nextEarn) {
    const nextQ = mrq * 1000 + 91 * DAY_MS;
    lag = Math.round(Math.min(75, Math.max(15, (nextEarn * 1000 - nextQ) / DAY_MS)));
  }
  const ceo = (ap.companyOfficers ?? []).find((o: Json) => /chief executive|ceo/i.test(o?.title ?? ''));
  const sector = YAHOO_SECTOR[ap.sector] ?? (ap.industry ? sectorFromIndustry(ap.industry) : '--');
  const book = opt(raw(ks, 'bookValue')) * shares;
  const debt = raw(fd, 'totalDebt');
  const cash = raw(fd, 'totalCash');
  const hq = ap.city ? `${ap.city}, ${ap.state ?? ap.country ?? ''}`.replace(/, $/, '') : '--';
  const name = (pr.longName ?? meta.longName ?? meta.shortName ?? ticker) as string;
  const eq: EquityInfo = {
    sector,
    industry: ap.industry ?? sector,
    shares: shares > 0 ? shares : NaN,
    beta: opt(raw(ks, 'beta')),
    rev,
    ni,
    // The indicated annual rate as the source gives it; without one it is unknown.
    dps: opt(raw(sd, 'dividendRate')),
    emp: opt(ap.fullTimeEmployees),
    hq,
    ceo: ceo ? cleanName(ceo.name) : undefined,
    fye,
    netDebt: debt != null && cash != null ? (debt - cash) / 1e6 : NaN,
    book,
    desc: shortDesc(ap.longBusinessSummary, `${name} is listed on ${exchName}.`),
    lag,
  };
  const recent = bars.slice(-63).filter((b) => b.v > 0);
  const adv = recent.length ? Math.round(recent.reduce((a, b) => a + b.v, 0) / recent.length) : 0;
  const hist = bars.filter((b) => b.day < engine.today);
  const def = listed
    ? listingDef(listed.root, listed.listing, name, String(meta.currency ?? ''), last, realisedVol(bars), adv, eq, yahooListingSymbol(listed.root, listed.listing), anchorsFromBars(hist))
    : baseDef(ticker, name, exchName, last, realisedVol(bars), adv, eq, 'yahoo', yahooSymbol(ticker), anchorsFromBars(hist));
  return { def, bars };
}

/** Shares outstanding from the last reported balance sheet (Yahoo's fundamentals series, no cookie needed). */
async function reportedSharesOf(sym: string): Promise<number | undefined> {
  const now = Math.floor(Date.now() / 1000);
  const res = await yahooGet(`/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?symbol=${sym}&type=quarterlyOrdinarySharesNumber,annualOrdinarySharesNumber&period1=${now - 2 * 365 * 86_400}&period2=${now}`).catch(() => null);
  return latestReportedShares(res);
}

/** The newest share count in a fundamentals-series answer. */
export function latestReportedShares(res: Json): number | undefined {
  let best: { at: string; v: number } | undefined;
  for (const r of (res?.timeseries?.result ?? []) as Json[]) {
    const type = r?.meta?.type?.[0];
    for (const p of (type ? r[type] : null) ?? []) {
      const v = p?.reportedValue?.raw;
      if (typeof v === 'number' && v > 0 && typeof p.asOfDate === 'string' && (!best || p.asOfDate > best.at)) best = { at: p.asOfDate, v };
    }
  }
  return best?.v;
}

const hasShares = (summary: Json) => {
  const r = summary?.quoteSummary?.result?.[0];
  return raw(r?.defaultKeyStatistics, 'sharesOutstanding') != null;
};

async function loadYahoo(ticker: string): Promise<LookupResult & { bars?: Bar[]; dividends?: Dividend[]; splits?: Split[] }> {
  const sym = encodeURIComponent(yahooSymbol(ticker));
  const chart = await yahooGet(`/v8/finance/chart/${sym}?range=10y&interval=1d&events=div%2Csplit&includePrePost=false`);
  if (!chart?.chart?.result?.[0]) return { ok: false, reason: `${ticker} was not found` };
  const summary = await yahooGet(`/v10/finance/quoteSummary/${sym}?modules=assetProfile,defaultKeyStatistics,financialData,summaryDetail,price,calendarEvents`).catch(() => null);
  const built = defFromYahoo(ticker, chart, summary, undefined, hasShares(summary) ? undefined : await reportedSharesOf(sym));
  if ('error' in built) return { ok: false, reason: built.error };
  const { dividends, splits } = barsFromChart(chart);
  return { ok: true, def: built.def, bars: built.bars, dividends, splits };
}

// ----------------------------------------------------------------- Finnhub

/** Builds a security and calibration anchors from Finnhub profile, metrics and quote. */
export function defFromFinnhub(ticker: string, profile: Json, metricRes: Json, quote: Json, today: number): { def: SecurityDef; anchors: [number, number][] } | { error: string } {
  if (!profile || !profile.name) return { error: `${ticker} was not found` };
  if (profile.country !== 'US' || profile.currency !== 'USD') return { error: `${ticker} is not listed on a US exchange` };
  if (!(quote?.c > 0)) return { error: `No quote for ${ticker}` };
  const m = metricRes?.metric ?? {};
  const shares = Number(profile.shareOutstanding) || (profile.marketCapitalization ? profile.marketCapitalization / quote.c : 0);
  if (!(shares > 0)) return { error: `No company profile for ${ticker}` };
  const quoteDay = dayNum(quote.t * 1000);
  // While the market is open the quote is today's and pc is yesterday's close.
  const lastDay = quoteDay < today ? quoteDay : prevBusinessDay(today);
  const lastClose = quoteDay < today ? quote.c : quote.pc;
  const ref = quote.c;
  const anchors: [number, number][] = [[lastDay, lastClose]];
  const back = (days: number) => {
    let d = today - days;
    while (!isBusinessDay(d)) d--;
    return d;
  };
  const d0 = new Date(today * DAY_MS);
  const ret: [string, number][] = [
    ['5DayPriceReturnDaily', back(7)],
    ['monthToDatePriceReturnDaily', dayNum(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 0))],
    ['13WeekPriceReturnDaily', back(91)],
    ['26WeekPriceReturnDaily', back(182)],
    ['yearToDatePriceReturnDaily', dayNum(Date.UTC(d0.getUTCFullYear(), 0, 0))],
    ['52WeekPriceReturnDaily', back(365)],
  ];
  for (const [k, day] of ret) {
    const r = Number(m[k]);
    if (Number.isFinite(r) && r > -99 && day < lastDay) anchors.push([day, ref / (1 + r / 100)]);
  }
  const rev = Math.max(0.1, (Number(m.revenuePerShareTTM) || 0) * shares);
  const industry = profile.finnhubIndustry || 'Industrials';
  const name = profile.name as string;
  const eq: EquityInfo = {
    sector: sectorFromIndustry(industry),
    industry,
    shares,
    beta: Number(m.beta) || 1,
    rev,
    ni: rev * ((Number(m.netProfitMarginTTM) || 0) / 100),
    dps: Number(m.dividendPerShareAnnual) || 0,
    emp: 0,
    hq: '--',
    fye: 12,
    netDebt: 0,
    book: Math.max(1, (Number(m.bookValuePerShareQuarterly) || 0) * shares) || ((profile.marketCapitalization ?? shares * quote.c) / 3),
    desc: `${name} is listed on ${finnhubExch(profile.exchange ?? '')}${profile.ipo ? ` (IPO ${profile.ipo})` : ''} in the ${industry} industry.${profile.weburl ? ` Website: ${profile.weburl}` : ''}`,
    lag: 30,
  };
  const volPct = Number(m['3MonthADReturnStd']);
  const vol = Number.isFinite(volPct) && volPct > 0 ? Math.min(2.5, Math.max(0.08, volPct / 100)) : 0.45;
  const adv = Math.round((Number(m['3MonthAverageTradingVolume']) || Number(m['10DayAverageTradingVolume']) || 0) * 1e6);
  const def = baseDef(ticker, name, finnhubExch(profile.exchange ?? ''), lastClose, vol, adv, eq, 'finnhub', finnhubSymbol(ticker), anchors.map(([d, v]) => [dayToIso(d), v]));
  return { def, anchors };
}

async function finnhubGet(path: string): Promise<Json> {
  const key = settings.get().finnhubKey.trim();
  const res = await fetch(`${FINNHUB}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(key)}`);
  if (res.status === 401 || res.status === 403) throw new Error('Finnhub rejected the API key (check it in SETTINGS)');
  if (res.status === 429) throw new Error('Finnhub rate limit reached; try again in a minute');
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  return res.json();
}

async function loadFinnhub(ticker: string): Promise<LookupResult & { anchors?: [number, number][] }> {
  const sym = encodeURIComponent(finnhubSymbol(ticker));
  const [profile, metric, quote] = await Promise.all([finnhubGet(`/stock/profile2?symbol=${sym}`), finnhubGet(`/stock/metric?symbol=${sym}&metric=all`), finnhubGet(`/quote?symbol=${sym}`)]);
  const built = defFromFinnhub(ticker, profile, metric, quote, engine.today);
  if ('error' in built) return { ok: false, reason: built.error };
  return { ok: true, def: built.def, anchors: built.anchors };
}

// ------------------------------------------------------------------ public

const inflight = new Map<string, Promise<LookupResult>>();

function persist(def: SecurityDef) {
  customSecurities.set((s) => ({ defs: [...s.defs.filter((d) => d.id !== def.id), def].slice(-MAX_SAVED) }));
}

/** Looks a ticker up online and registers it. Resolves once the security can be used. */
export function lookupSecurity(input: string): Promise<LookupResult> {
  const listed = parseListing(input);
  if (listed) return lookupListing(listed);
  const ticker = normalizeTicker(input);
  if (!ticker) return Promise.resolve({ ok: false, reason: `${input.toUpperCase()} is not a valid ticker` });
  const existing = engine.get(`${ticker} US Equity`);
  if (existing) return Promise.resolve({ ok: true, def: existing });
  const source = lookupSource();
  if (!source) return Promise.resolve({ ok: false, reason: `${ticker} is not in the built-in list. The desktop app looks up any US stock` });
  const pending = inflight.get(ticker);
  if (pending) return pending;
  const job = (async (): Promise<LookupResult> => {
    try {
      if (source === 'yahoo') {
        const r = await loadYahoo(ticker);
        if (!r.ok) return r;
        engine.addSecurity(r.def, { bars: r.bars });
        persist(r.def);
        // The real-data service takes the line over: real history now, real quotes from the next poll.
        adoptYahooHistory(r.def.id, r.def.dynamic!.symbol, r.bars!, r.dividends, r.splits);
        return { ok: true, def: r.def };
      }
      const r = await loadFinnhub(ticker);
      if (!r.ok) return r;
      engine.addSecurity(r.def, { anchors: r.anchors });
      persist(r.def);
      trackFinnhubSymbol(r.def.dynamic!.symbol, r.def.id);
      return { ok: true, def: r.def };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: err instanceof TypeError ? `Could not reach ${source === 'yahoo' ? 'Yahoo Finance' : 'Finnhub'} (offline?)` : msg };
    } finally {
      inflight.delete(ticker);
    }
  })();
  inflight.set(ticker, job);
  return job;
}

/** A stock listed on a European exchange (ABI BB, ABI.BR), from Yahoo Finance in the desktop app. */
function lookupListing(listed: { root: string; listing: Listing }): Promise<LookupResult> {
  const name = `${listed.root} ${listed.listing.code}`;
  const existing = engine.get(`${name} Equity`);
  if (existing) return Promise.resolve({ ok: true, def: existing });
  if (lookupSource() !== 'yahoo') return Promise.resolve({ ok: false, reason: `${name} is not in the built-in list. The desktop app looks up stocks on European exchanges` });
  const pending = inflight.get(name);
  if (pending) return pending;
  const job = (async (): Promise<LookupResult> => {
    try {
      const sym = encodeURIComponent(yahooListingSymbol(listed.root, listed.listing));
      const chart = await yahooGet(`/v8/finance/chart/${sym}?range=10y&interval=1d&events=div%2Csplit&includePrePost=false`);
      if (!chart?.chart?.result?.[0]) return { ok: false, reason: `${name} was not found on ${listed.listing.exch}` };
      const summary = await yahooGet(`/v10/finance/quoteSummary/${sym}?modules=assetProfile,defaultKeyStatistics,financialData,summaryDetail,price,calendarEvents`).catch(() => null);
      const built = defFromYahoo(name, chart, summary, listed, hasShares(summary) ? undefined : await reportedSharesOf(sym));
      if ('error' in built) return { ok: false, reason: built.error };
      engine.addSecurity(built.def, { bars: built.bars });
      persist(built.def);
      const { dividends, splits } = barsFromChart(chart);
      adoptYahooHistory(built.def.id, built.def.dynamic!.symbol, built.bars, dividends, splits);
      return { ok: true, def: built.def };
    } catch (err) {
      return { ok: false, reason: err instanceof TypeError ? 'Could not reach Yahoo Finance (offline?)' : err instanceof Error ? err.message : String(err) };
    } finally {
      inflight.delete(name);
    }
  })();
  inflight.set(name, job);
  return job;
}

/** Online search by ticker or company name (US-listed stocks). */
export async function searchOnline(q: string): Promise<OnlineHit[]> {
  const source = lookupSource();
  if (!source || !q.trim()) return [];
  if (source === 'yahoo') {
    let problem: unknown;
    try {
      const res = await yahooGet(`/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=12&newsCount=0`);
      const hits = ((res?.quotes ?? []) as Json[])
        .filter((x) => x.quoteType === 'EQUITY' && (YAHOO_EXCH[x.exchange] || EU_EXCHANGES[x.exchange]))
        .map((x) => {
          const eu = EU_EXCHANGES[x.exchange];
          // A European listing is named the app's way: KBC.BR is KBC BB.
          const symbol = eu ? `${String(x.symbol).replace(/\.[A-Z]+$/, '').replace('-', '/')} ${eu.code}` : String(x.symbol).replace('-', '/');
          return { symbol, name: x.longname ?? x.shortname ?? x.symbol, exchange: eu ? eu.exch : YAHOO_EXCH[x.exchange] };
        });
      if (hits.length) return hits;
    } catch (error) {
      if (error instanceof YahooDisabled) throw error;
      problem = error;
    }
    // EDGAR is a company directory, not a price feed. The chart request still
    // validates the exchange, currency and instrument before registering it.
    if (window.arminDesktop?.sec) {
      const companies = await loadSecCompanies();
      if (companies.ok) {
        const hits = searchCompanies(companies.data, q, 12).filter((c) => normalizeTicker(c.ticker));
        if (hits.length) return hits.map((c) => ({ symbol: c.ticker.replace('-', '/'), name: c.title, exchange: 'SEC directory · listing checked on open' }));
      }
    }
    if (problem) throw problem;
    return [];
  }
  const res = await finnhubGet(`/search?q=${encodeURIComponent(q.trim())}&exchange=US`);
  return ((res?.result ?? []) as Json[])
    .filter((x) => x.type === 'Common Stock' && !String(x.symbol).includes(':'))
    .slice(0, 12)
    .map((x) => ({ symbol: String(x.symbol).replace('.', '/'), name: x.description, exchange: 'US' }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --------------------------------------------------------------- lifecycle

/** Registers saved securities before the first render, calibrated from their saved anchors. */
export function restoreCustomSecurities() {
  for (const d of customSecurities.get().defs) {
    if (!d.dynamic || engine.get(d.id)) continue;
    engine.addSecurity(d, { anchors: d.dynamic.anchors.map(([iso, v]) => [isoToDay(iso), v] as [number, number]) });
  }
}

/** Streams saved Finnhub lookups once the feed is up (the desktop app's real-data service covers Yahoo ones). */
export function startDynamicFeeds(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const first = setTimeout(() => {
    if (lookupSource() !== 'finnhub') return;
    for (const d of engine.securities) {
      if (!d.dynamic) continue;
      trackFinnhubSymbol(d.dynamic.source === 'finnhub' ? d.dynamic.symbol : finnhubSymbol(d.ticker.split(' ')[0]), d.id);
    }
  }, 2500);
  return () => clearTimeout(first);
}
