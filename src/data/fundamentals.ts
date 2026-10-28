import { hashString, seeded, gaussian } from '../core/rng';
import { DAY_MS, dayNum, rollForward } from './calendar';
import { zonedParts } from '../core/format';
import { engine } from './market';
import { marketCap } from './analytics';
import type { SecurityDef } from './types';
import { getRealFund, usTiming } from './live/yfund';
import { realDividends, realSplits, trailingDividendYield, yahooQuotes } from './live/yahoo';
import { nasdaqPart, nasdaqSymbol, type NasdaqDividend, type NasdaqNextReport } from './live/nasdaq-company';

/** All money values in millions of the reporting currency (GBP for pence lines). */
export interface FinPeriod {
  label: string;
  end: number;
  /** LTM only: from the source's trailing figures, or the sum of the last four quarters. */
  basis?: 'trailing' | 'quarters' | 'annual';
  /** Dates and sources for supplemental statement cells; these never change the period's length. */
  supplements?: string[];
  /** LTM only: EPS worked out as net income over diluted shares (a quarter's EPS was missing). */
  epsComputed?: boolean;
  rev: number;
  cogs: number;
  gp: number;
  sga: number;
  rnd: number;
  opInc: number;
  da: number;
  ebitda: number;
  interest: number;
  pretax: number;
  tax: number;
  /** Net income to common shareholders: after preferred dividends; what diluted EPS divides. */
  ni: number;
  /** Net income attributable to the company's shareholders, before preferred dividends (the filing's NetIncomeLoss). */
  niTotal: number;
  shares: number;
  eps: number;
  dps: number;
  cash: number;
  recv: number;
  inv: number;
  curAssets: number;
  ppe: number;
  intang: number;
  totAssets: number;
  curLiab: number;
  debt: number;
  totLiab: number;
  equity: number;
  /** Minority interest and preferred stock on the balance sheet; NaN when the source lists none. */
  minority?: number;
  preferred?: number;
  cfo: number;
  capex: number;
  fcf: number;
  divPaid: number;
  buyback: number;
}

interface Profile {
  gm: number;
  rnd: number;
  da: number;
  capex: number;
  tax: number;
  assetTurn: number;
  inv: number;
  bank?: boolean;
}

const PROFILES: Record<string, Profile> = {
  'Information Technology': { gm: 0.62, rnd: 0.14, da: 0.05, capex: 0.06, tax: 0.15, assetTurn: 0.65, inv: 0.04 },
  'Communication Services': { gm: 0.58, rnd: 0.1, da: 0.09, capex: 0.12, tax: 0.18, assetTurn: 0.5, inv: 0.01 },
  'Consumer Discretionary': { gm: 0.38, rnd: 0.03, da: 0.04, capex: 0.05, tax: 0.21, assetTurn: 1.1, inv: 0.12 },
  'Consumer Staples': { gm: 0.36, rnd: 0.01, da: 0.03, capex: 0.04, tax: 0.22, assetTurn: 1.2, inv: 0.1 },
  'Health Care': { gm: 0.68, rnd: 0.17, da: 0.05, capex: 0.04, tax: 0.16, assetTurn: 0.55, inv: 0.09 },
  Financials: { gm: 0.9, rnd: 0, da: 0.02, capex: 0.02, tax: 0.21, assetTurn: 0.06, inv: 0, bank: true },
  Energy: { gm: 0.28, rnd: 0.003, da: 0.08, capex: 0.09, tax: 0.3, assetTurn: 0.85, inv: 0.06 },
  Industrials: { gm: 0.3, rnd: 0.03, da: 0.04, capex: 0.04, tax: 0.2, assetTurn: 0.75, inv: 0.16 },
  Materials: { gm: 0.42, rnd: 0.01, da: 0.08, capex: 0.1, tax: 0.24, assetTurn: 0.6, inv: 0.08 },
  Utilities: { gm: 0.55, rnd: 0, da: 0.17, capex: 0.35, tax: 0.12, assetTurn: 0.14, inv: 0.03 },
  'Real Estate': { gm: 0.75, rnd: 0, da: 0.32, capex: 0.1, tax: 0.02, assetTurn: 0.09, inv: 0 },
};

const rng = (id: string, salt: string) => seeded(hashString(`${id}:${salt}`));

/** Major-unit price (pence -> pounds). */
export function majorPrice(def: SecurityDef, px: number): number {
  return def.minor ? px / 100 : px;
}

/**
 * A quoted price in a currency's main unit: a price in pence in pounds, and in another currency at today's rate (a
 * London price against euro EPS estimates). Without a stated currency, the one the line trades in. NaN when the rate
 * is not known.
 */
export function priceInCurrency(def: SecurityDef, px: number, ccy: string | undefined): number {
  const major = majorPrice(def, px);
  const trade = def.ccy === 'GBp' ? 'GBP' : def.ccy;
  if (!ccy || ccy === trade) return major;
  const fx = engine.usdValue(trade) / engine.usdValue(ccy);
  return Number.isFinite(fx) && fx > 0 ? major * fx : NaN;
}

/** A period with no figures: what the desktop app shows before (or without) a company's real data. */
export function emptyPeriod(label = 'LTM', end = NaN): FinPeriod {
  const n = NaN;
  return {
    label, end, rev: n, cogs: n, gp: n, sga: n, rnd: n, opInc: n, da: n, ebitda: n, interest: n, pretax: n, tax: n, ni: n, niTotal: n, shares: n,
    eps: n, dps: n, cash: n, recv: n, inv: n, curAssets: n, ppe: n, intang: n, totAssets: n, curLiab: n, debt: n, totLiab: n, equity: n,
    cfo: n, capex: n, fcf: n, divPaid: n, buyback: n,
  };
}

/**
 * The currency a company reports its statements in: the filings' own (Shell
 * reports in dollars though it trades in pence) when known, else the trading one.
 */
export function reportCcy(def: SecurityDef): string {
  const statement = getRealFund(def.id)?.currency;
  if (statement) return statement;
  const fc = yahooQuotes.get(def.id)?.financialCurrency;
  if (typeof fc === 'string' && /^[A-Z]{3}$/.test(fc)) return fc;
  return def.ccy === 'GBp' ? 'GBP' : def.ccy;
}

/** Annual revenue growth used to walk history backwards. */
function baseGrowth(def: SecurityDef): number {
  const r = rng(def.id, 'growth');
  const sector: Record<string, number> = {
    'Information Technology': 0.12, 'Communication Services': 0.09, 'Health Care': 0.07, 'Consumer Discretionary': 0.06,
    'Consumer Staples': 0.035, Financials: 0.06, Energy: 0.02, Industrials: 0.05, Materials: 0.03, Utilities: 0.05, 'Real Estate': 0.06,
  };
  const g = (sector[def.eq!.sector] ?? 0.05) + gaussian(r) * 0.05;
  const special: Record<string, number> = { 'NVDA US Equity': 0.6, 'PLTR US Equity': 0.32, 'MU US Equity': 0.45, 'AVGO US Equity': 0.25, 'LLY US Equity': 0.3, 'AMD US Equity': 0.28, 'META US Equity': 0.18, 'UBER US Equity': 0.17, 'NOVOB DC Equity': 0.12, '2330 TT Equity': 0.3, 'INTC US Equity': -0.03, 'APLD US Equity': 0.6, 'NKE US Equity': -0.04, 'TSLA US Equity': 0.04 };
  return special[def.id] ?? Math.max(-0.05, Math.min(0.3, g));
}

function fiscalYearEnd(def: SecurityDef, yearsBack: number, today: number): number {
  const d = new Date(today);
  const fye = def.eq!.fye;
  // Last day of the fiscal-year-end month that is before today minus reporting lag.
  let y = d.getUTCFullYear();
  let end = Date.UTC(y, fye, 0);
  const lag = (def.eq!.lag ?? 30) + 20;
  while (end + lag * DAY_MS > today) {
    y--;
    end = Date.UTC(y, fye, 0);
  }
  return Date.UTC(y - yearsBack, fye, 0);
}

function buildPeriod(def: SecurityDef, label: string, end: number, scale: number, niScale: number, r: () => number, quarter: boolean): FinPeriod {
  const eq = def.eq!;
  const p = PROFILES[eq.sector] ?? PROFILES.Industrials;
  const k = quarter ? 0.25 : 1;
  const rev = eq.rev * scale * k;
  const ni = eq.ni * niScale * k * (1 + gaussian(r) * (quarter ? 0.05 : 0.02));
  const tax = Math.max(0, ni) * (p.tax / (1 - p.tax));
  const pretax = ni + tax;
  const netDebt = eq.netDebt * Math.pow(scale, 0.5);
  const interest = (Math.max(0, netDebt) * 0.045 - Math.max(0, -netDebt) * 0.03) * k;
  const opInc = pretax + interest;
  const gm = Math.max(p.gm + gaussian(r) * 0.01, opInc / Math.max(rev, 1) + 0.08 + p.rnd);
  const gp = rev * Math.min(0.97, gm);
  const rnd = Math.min(gp - opInc, rev * p.rnd);
  const sga = gp - opInc - Math.max(0, rnd);
  const da = rev * p.da;
  const shares = eq.shares * Math.pow(1.012, (fiscalYearEnd(def, 0, engine.today * DAY_MS) - end) / (365 * DAY_MS));
  const equity = eq.book * Math.pow(scale, 0.8);
  const totAssets = p.bank ? equity * 11 : Math.max(equity * 1.6, (rev / k) / p.assetTurn);
  const cash = Math.max((rev / k) * 0.08, -netDebt + (rev / k) * 0.06);
  const debt = Math.max(0, netDebt + cash);
  const totLiab = totAssets - equity;
  const inv = (rev / k) * p.inv;
  const recv = (rev / k) * (p.bank ? 0 : 0.11);
  const curAssets = cash + inv + recv + (rev / k) * 0.03;
  const curLiab = p.bank ? totLiab * 0.85 : curAssets / (1.2 + r() * 0.8);
  const intang = totAssets * (0.08 + r() * 0.2);
  const ppe = Math.max(0, totAssets - curAssets - intang) * 0.6;
  const cfo = ni + da + (gaussian(r) * 0.03 * rev);
  const capex = rev * p.capex;
  const dps = (def.minor ? eq.dps / 100 : eq.dps) * Math.pow(0.94, (fiscalYearEnd(def, 0, engine.today * DAY_MS) - end) / (365 * DAY_MS));
  const divPaid = dps * shares * k;
  const fcf = cfo - capex;
  const buyback = Math.max(0, (fcf - divPaid) * (0.35 + r() * 0.4));
  return {
    label, end, rev, cogs: rev - gp, gp, sga, rnd: Math.max(0, rnd), opInc, da, ebitda: opInc + da, interest, pretax, tax, ni, niTotal: ni,
    shares, eps: ni / shares, dps: dps * k, cash, recv, inv, curAssets, ppe, intang, totAssets, curLiab, debt, totLiab, equity,
    cfo, capex, fcf, divPaid, buyback,
  };
}

const finCache = new Map<string, { annual: FinPeriod[]; quarterly: FinPeriod[]; ltm: FinPeriod }>();

/** A missing statement must not turn a six-month or two-year gap into quarterly/annual growth. */
export function priorStatementPeriod(periods: FinPeriod[], current: FinPeriod, cadence: 'year' | 'quarter'): FinPeriod | undefined {
  const target = cadence === 'year' ? 365.25 : 91.25;
  const tolerance = cadence === 'year' ? 25 : 22;
  return periods.filter((p) => Math.abs((current.end - p.end) / DAY_MS - target) <= tolerance)
    .sort((a, b) => Math.abs((current.end - a.end) / DAY_MS - target) - Math.abs((current.end - b.end) / DAY_MS - target))[0];
}

/** Most recent debt observation, without treating a missing current balance as zero. */
export function latestDebtPeriod(periods: FinPeriod[]): FinPeriod | undefined {
  return periods.filter((p) => Number.isFinite(p.end) && Number.isFinite(p.debt) && p.debt >= 0).sort((a, b) => b.end - a.end)[0];
}

/** Real statements when loaded (desktop app), otherwise the generated ones. */
export function financials(def: SecurityDef): { annual: FinPeriod[]; quarterly: FinPeriod[]; ltm: FinPeriod } {
  const real = getRealFund(def.id);
  if (real && (real.annual.length || real.quarterly.length)) {
    // A year cannot stand in for a three-month statement, or a quarter for a year.
    // A complete latest fiscal year is a twelve-month observation when no newer LTM exists.
    const latestYear = real.annual.at(-1);
    const ltm = real.ltm ?? (latestYear ? { ...latestYear, label: 'LTM', basis: 'annual' as const } : emptyPeriod());
    return { annual: real.annual, quarterly: real.quarterly, ltm };
  }
  // The desktop app never shows generated statements: nothing until the filings arrive.
  if (engine.realOnly) return { annual: [], quarterly: [], ltm: emptyPeriod() };
  return simFinancials(def);
}

/** True when a company's statements come from its filings rather than the generator. */
export function hasRealStatements(def: SecurityDef): boolean {
  const real = getRealFund(def.id);
  return !!real && (real.annual.length > 0 || real.quarterly.length > 0);
}

/** Five fiscal years, eight quarters and trailing twelve months (generated). */
function simFinancials(def: SecurityDef) {
  const key = `${def.id}:${engine.today}`;
  const hit = finCache.get(def.id + key);
  if (hit) return hit;
  const today = engine.today * DAY_MS;
  const g = baseGrowth(def);
  const r = rng(def.id, 'fin');
  const gr = rng(def.id, 'path');
  const yearly: number[] = [];
  for (let i = 0; i < 6; i++) yearly.push(g + gaussian(gr) * Math.max(0.02, Math.abs(g) * 0.35));
  // Scale relative to LTM; FY0 is about half a year behind LTM.
  const annual: FinPeriod[] = [];
  let scale = 1 / (1 + yearly[0] / 2);
  let niScale = 1 / (1 + (yearly[0] * 1.25) / 2);
  for (let y = 0; y < 5; y++) {
    const end = fiscalYearEnd(def, y, today);
    const fy = new Date(end).getUTCFullYear() + (def.eq!.fye <= 6 && def.eq!.fye !== 12 ? 0 : 0);
    annual.unshift(buildPeriod(def, `FY ${fy}`, end, scale, niScale, r, false));
    scale /= 1 + yearly[y + 1];
    niScale /= 1 + yearly[y + 1] * 1.25 + gaussian(gr) * 0.05;
  }
  const quarterly: FinPeriod[] = [];
  const lastQEnd = (() => {
    const d = new Date(today - ((def.eq!.lag ?? 30) + 3) * DAY_MS);
    const fye = def.eq!.fye;
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth() + 1;
    while ((m - fye + 12) % 3 !== 0) {
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
    return Date.UTC(y, m, 0);
  })();
  const qr = Math.pow(1 + g, 0.25);
  for (let q = 0; q < 8; q++) {
    const end = Date.UTC(new Date(lastQEnd).getUTCFullYear(), new Date(lastQEnd).getUTCMonth() - 3 * q + 1, 0);
    const season = def.eq!.sector === 'Consumer Discretionary' || def.eq!.sector === 'Consumer Staples' ? 1 + 0.08 * Math.cos(((new Date(end).getUTCMonth() + 1 - 12) / 12) * 2 * Math.PI) : 1;
    const sc = Math.pow(qr, -q - 0.5) * season;
    const fyQ = fiscalQuarterLabel(def, end);
    quarterly.unshift(buildPeriod(def, fyQ, end, sc, sc * Math.pow(1 + g * 0.25, -q * 0.2), r, true));
  }
  const ltm = buildPeriod(def, 'LTM', lastQEnd, 1, 1, rng(def.id, 'ltm'), false);
  const out = { annual, quarterly, ltm };
  finCache.set(def.id + key, out);
  return out;
}

export function fiscalQuarterLabel(def: SecurityDef, end: number): string {
  const d = new Date(end);
  const m = d.getUTCMonth() + 1;
  const fye = def.eq!.fye;
  const offset = (m - fye + 12) % 12; // months after FY end
  const q = offset === 0 ? 4 : Math.round(offset / 3);
  const fy = m > fye ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return `Q${q} ${String(fy).slice(2)}`;
}

export interface KeyStats {
  price: number;
  mcap: number;
  ev: number;
  pe: number;
  pb: number;
  ps: number;
  evEbitda: number;
  divYld: number;
  payout: number;
  roe: number;
  roa: number;
  opMargin: number;
  netMargin: number;
  grossMargin: number;
  de: number;
  epsLtm: number;
  revGrowth: number;
  epsGrowth: number;
  beta: number;
  shares: number;
  fcfYield: number;
  /** Enterprise value's parts, millions in the statements' currency: market value, net debt, and the minority interest
   *  and preferred stock of the latest balance sheet (NaN when the source lists none, and then nothing is added). */
  evParts: { mcap: number; netDebt: number; minority: number; preferred: number };
  /** Currency of the statements and of ev. */
  ccy: string;
  /** Currency of price and mcap. */
  tradeCcy: string;
}

export function keyStats(def: SecurityDef): KeyStats {
  const eq = def.eq!;
  const q = engine.quote(def.id);
  const price = majorPrice(def, q?.last ?? (engine.realOnly ? NaN : def.px));
  const f = financials(def);
  const ltm = f.ltm;
  const mcap = marketCap(def.id) / 1e6;
  // Statements can be in another currency than the shares trade in (Shell: dollars against pence);
  // ratios compare like with like.
  const tradeCcy = def.ccy === 'GBp' ? 'GBP' : def.ccy;
  const repCcy = reportCcy(def);
  const fx = repCcy === tradeCcy ? 1 : engine.usdValue(tradeCcy) / engine.usdValue(repCcy);
  const mcapRep = mcap * fx;
  const priceRep = price * fx;
  const bank = PROFILES[eq.sector]?.bank;
  // Enterprise value: market value, net debt, and the claims ranking ahead of the common shares on the same balance
  // sheet (minority interest and preferred stock). A part the source does not list adds nothing, and says so.
  const minority = Number.isFinite(eq.minority) ? eq.minority! : NaN;
  const preferred = Number.isFinite(eq.preferred) ? eq.preferred! : NaN;
  const ev = bank ? NaN : mcapRep + eq.netDebt + (Number.isFinite(minority) ? minority : 0) + (Number.isFinite(preferred) ? preferred : 0);
  const prevYear = f.annual[f.annual.length - 2];
  const lastYear = f.annual[f.annual.length - 1];
  const out: KeyStats = {
    price,
    mcap,
    ev,
    evParts: { mcap: mcapRep, netDebt: eq.netDebt, minority, preferred },
    pe: ltm.eps > 0 ? priceRep / ltm.eps : NaN,
    pb: ltm.equity > 0 ? mcapRep / ltm.equity : NaN,
    ps: mcapRep / ltm.rev,
    evEbitda: bank || ltm.ebitda <= 0 ? NaN : ev / ltm.ebitda,
    divYld: (ltm.dps / priceRep) * 100,
    payout: ltm.eps > 0 ? (ltm.dps / ltm.eps) * 100 : NaN,
    roe: ltm.equity > 0 ? (ltm.ni / ltm.equity) * 100 : NaN,
    roa: (ltm.ni / ltm.totAssets) * 100,
    opMargin: (ltm.opInc / ltm.rev) * 100,
    netMargin: (ltm.ni / ltm.rev) * 100,
    grossMargin: (ltm.gp / ltm.rev) * 100,
    de: ltm.equity > 0 ? (ltm.debt / ltm.equity) * 100 : NaN,
    epsLtm: ltm.eps,
    revGrowth: prevYear && lastYear ? (lastYear.rev / prevYear.rev - 1) * 100 : NaN,
    epsGrowth: prevYear && lastYear && prevYear.eps > 0 ? (lastYear.eps / prevYear.eps - 1) * 100 : NaN,
    beta: eq.beta,
    shares: eq.shares,
    fcfYield: (ltm.fcf / mcapRep) * 100,
    ccy: repCcy,
    tradeCcy,
  };
  // Prefer the ratios as the data provider reports them.
  const real = getRealFund(def.id);
  const ks = out as unknown as Record<string, number>;
  if (real) {
    // When the shares trade in one currency and the company reports in another, Yahoo mixes the two
    // in book value, enterprise value and sales multiples (Shell's price/book reads 155); those are
    // computed here with the exchange rate instead.
    const mixed = new Set(fx !== 1 ? ['pb', 'ev', 'evEbitda', 'ps', 'epsLtm'] : []);
    // Figures that sit next to their inputs on screen are worked out here from those inputs, so they agree:
    // P/E from the LTM EPS shown, enterprise value from the market cap and the latest balance sheet, and
    // EV/EBITDA from those two. The source's own ratios use other bases (Nebius: P/E 164 next to an EPS of -0.08).
    // Price to book from the market cap and the latest equity (Berkshire's source figure divided a Class B
    // price by a Class A book value).
    // Without an LTM EPS from the statements (a newest quarter known only from the earnings module, SAP's two days
    // after it reported), the source's P/E comes with the source's own trailing EPS, so the two still agree.
    const own = new Set(['ev', 'evEbitda', ...(Number.isFinite(ltm.eps) ? ['pe', 'epsLtm'] : []), ...(ltm.equity > 0 ? ['pb'] : [])]);
    for (const [k, v] of Object.entries(real.stats)) if (Number.isFinite(v) && !mixed.has(k) && !own.has(k)) ks[k] = v as number;
    // The source's price to book for a depositary receipt divides the receipt's price by the book value of one
    // ordinary share (HSBC's, five shares a receipt, read 8.31 on 28 October 2026 against about 1.5). Price to book
    // is P/E times ROE: a source figure far from that is on two share bases and is left blank.
    if (!own.has('pb') && Number.isFinite(ks.pb) && ks.pe > 0 && ks.roe > 0) {
      const implied = ks.pe * (ks.roe / 100);
      if (ks.pb / implied > 2.5 || ks.pb / implied < 0.4) ks.pb = NaN;
    }
  } else {
    const yq = yahooQuotes.get(def.id);
    if (yq) {
      // The quote's own figures, and none where it has none: a loss-maker has no P/E, not a generated one.
      const put = (k: string, v: unknown, scale = 1, missing = NaN) => {
        const x = Number(v);
        ks[k] = v != null && Number.isFinite(x) ? x * scale : missing;
      };
      put('pe', yq.trailingPE);
      if (fx === 1) put('pb', yq.priceToBook);
      put('epsLtm', yq.epsTrailingTwelveMonths);
      // Return on equity from the quote's trailing EPS over its latest book value per share, both in the currency the
      // company reports in, until its statements are loaded.
      const eps = Number(yq.epsTrailingTwelveMonths);
      const bvps = Number(yq.bookValue);
      if (fx === 1 && !Number.isFinite(out.roe) && yq.epsTrailingTwelveMonths != null && Number.isFinite(eps) && bvps > 0) out.roe = (eps / bvps) * 100;
      ks.shares = def.eq!.shares;
    }
  }
  // On real data, the dividends paid over the past 12 months over the live price (see trailingDividendYield).
  if (engine.realOnly || engine.isExternal(def.id) || yahooQuotes.has(def.id)) out.divYld = trailingDividendYield(def.id) * 100;
  // Multiples on losses are not meaningful.
  for (const k of ['pe', 'evEbitda'] as const) if (!(out[k] > 0)) out[k] = NaN;
  return out;
}

function nextQuarterLabel(def: SecurityDef): string {
  const f = simFinancials(def);
  const lq = f.quarterly[f.quarterly.length - 1];
  const next = Date.UTC(new Date(lq.end).getUTCFullYear(), new Date(lq.end).getUTCMonth() + 4, 0);
  return fiscalQuarterLabel(def, next);
}

/** Reporting date for the quarter ending at `qEnd`. */
export function reportDate(def: SecurityDef, qEnd: number): number {
  const lag = def.eq!.lag ?? 30;
  const r = rng(def.id, `rep:${qEnd}`);
  const d = new Date(qEnd + (lag + Math.floor(r() * 4) - 1) * DAY_MS);
  return rollForward(d).getTime();
}

/**
 * A company's earnings report: the date and, once reported, the figures from its statements (diluted EPS as
 * reported, revenue). Analyst estimates and surprises are not part of it: the app has no permitted source.
 */
export interface EarningsEvent {
  period: string;
  date: number;
  actual: number | null;
  timing: 'Bef-mkt' | 'Aft-mkt' | '--';
  revAct: number | null;
  /** A date the source itself marks as an estimate (an upcoming report not yet confirmed). */
  approx?: boolean;
  /** The source gives the quarter but not the report date: `date` is the quarter end, for ordering only. */
  dateUnknown?: boolean;
}

/** Past reports plus the next scheduled one: real when loaded, otherwise generated. */
export function earningsHistory(def: SecurityDef): EarningsEvent[] {
  const real = getRealFund(def.id);
  if (real && real.earnings.length) return real.earnings;
  if (engine.realOnly) return [];
  const f = simFinancials(def);
  const today = engine.today * DAY_MS;
  const timing: EarningsEvent['timing'] = rng(def.id, 'timing')() < 0.55 ? 'Aft-mkt' : 'Bef-mkt';
  const out: EarningsEvent[] = f.quarterly.map((q) => ({ period: q.label, date: reportDate(def, q.end), actual: q.eps, timing, revAct: q.rev }));
  const lq = f.quarterly[f.quarterly.length - 1];
  const nextEnd = Date.UTC(new Date(lq.end).getUTCFullYear(), new Date(lq.end).getUTCMonth() + 4, 0);
  out.push({ period: nextQuarterLabel(def), date: reportDate(def, nextEnd), actual: null, timing, revAct: null });
  // A report dated in the future must not show an actual yet.
  return out.map((e) => (e.date > today && e.actual != null ? { ...e, actual: null, revAct: null } : e));
}

/**
 * Report dates for calendars and quote screens: the company's real reports when
 * loaded; otherwise the last and next dates from its real quote (desktop app);
 * otherwise, for a simulated line, the generated schedule.
 */
export function earningsEvents(def: SecurityDef): EarningsEvent[] {
  const list = quoteEarningsEvents(def);
  // Nasdaq's next report date (US listings), when the other sources name none.
  const now = engine.now();
  if (list.some((e) => e.actual == null && e.date >= now - DAY_MS)) return list;
  const n = nasdaqPart<NasdaqNextReport>(nasdaqSymbol(def), 'earnings-date');
  return n && n.date >= engine.today * DAY_MS ? [...list, { period: 'Next', date: n.date, ...(n.estimated ? { approx: true } : {}), actual: null, timing: n.timing, revAct: null }] : list;
}

function quoteEarningsEvents(def: SecurityDef): EarningsEvent[] {
  const real = getRealFund(def.id);
  if (real && real.earnings.length) return real.earnings;
  const yq = yahooQuotes.get(def.id);
  if (!yq) return engine.realOnly || engine.isExternal(def.id) ? [] : earningsHistory(def);
  const now = engine.now();
  const out: EarningsEvent[] = [];
  const blank = { period: '', revAct: null };
  const last = Number(yq.earningsTimestamp) * 1000;
  const next = Number(yq.earningsTimestampStart) * 1000;
  const estimated = yq.isEarningsDateEstimate === true;
  const timing = (ms: number, est: boolean) => (!est && def.country === 'US' ? usTiming(ms) : '--');
  // A reported quarter's figures are not in the quote, so its actual shows as unknown rather than pending.
  if (last > 0 && last <= now) out.push({ ...blank, date: last, actual: NaN, timing: timing(last, false) });
  if (next > 0 && next > now - DAY_MS && next !== last) out.push({ ...blank, date: next, actual: null, approx: estimated, timing: timing(next, estimated) });
  else if (last > now) out.push({ ...blank, date: last, actual: null, approx: estimated, timing: timing(last, estimated) });
  return out;
}

/**
 * The session day a report belongs to: its date in the exchange's time zone (`tz`), or the date itself when
 * the source gives a date without a time (a stamp at midnight UTC) or no time zone is known.
 */
export function reportSessionDay(ms: number, tz: string | undefined): number {
  if (!Number.isFinite(ms)) return NaN;
  if (ms % DAY_MS === 0 || !tz) return dayNum(ms);
  const p = zonedParts(ms, tz);
  return dayNum(Date.UTC(p.y, p.mo - 1, p.d));
}

export interface EarningsReaction {
  /** Close-to-close change in percent; NaN until both closes are in the history and final. */
  pct: number;
  /**
   * Which closes: before the open, the report day's against the previous session's; after the close, the next
   * session's against the report day's; time not known, the report day's against the previous session's; a
   * report on a day without a session, the first session after it against the last one before.
   */
  basis: 'before-open' | 'after-close' | 'unknown' | 'no-session';
  /** Day numbers of the two sessions compared (NaN where the history has none). */
  from: number;
  to: number;
}

/**
 * The share price's reaction to a report from the daily closes, as on Bloomberg's earnings screen: see
 * EarningsReaction for which two closes. `lastFinal` is the last day whose close is final: today's bar is still
 * forming while the market trades.
 */
export function earningsReaction(s: { t: ArrayLike<number>; c: ArrayLike<number>; length: number }, day: number, timing: EarningsEvent['timing'], lastFinal: number): EarningsReaction {
  let i = 0;
  while (i < s.length && dayNum(s.t[i]) < day) i++;
  const onDay = i < s.length && dayNum(s.t[i]) === day;
  const basis: EarningsReaction['basis'] = !onDay ? 'no-session' : timing === 'Aft-mkt' ? 'after-close' : timing === 'Bef-mkt' ? 'before-open' : 'unknown';
  const [a, b] = basis === 'after-close' ? [i, i + 1] : [i - 1, i];
  const at = (k: number) => (k >= 0 && k < s.length ? dayNum(s.t[k]) : NaN);
  const final = (k: number) => at(k) <= lastFinal && s.c[k] > 0;
  return { pct: Number.isFinite(day) && final(a) && final(b) ? (s.c[b] / s.c[a] - 1) * 100 : NaN, basis, from: at(a), to: at(b) };
}

export function nextEarnings(def: SecurityDef): EarningsEvent | undefined {
  const events = earningsEvents(def);
  return events.find((e) => e.actual == null && isUpcomingReport(e.date, lastReportDate(events), engine.today * DAY_MS));
}

/** The newest report date the history gives with its figures. */
export function lastReportDate(events: readonly { date: number; actual: number | null; revAct?: number | null; dateUnknown?: boolean }[]): number {
  let last = -Infinity;
  for (const e of events) if (!e.dateUnknown && (e.actual != null || e.revAct != null) && e.date > last) last = e.date;
  return last;
}

/**
 * Whether a date a source gives for the next report is still to come: not before today, and not the report already
 * made (Coca-Cola reported on 27 October 2026; the next day the source still gave the 27th as its next date).
 */
export function isUpcomingReport(date: number, lastReported: number, today: number): boolean {
  return Number.isFinite(date) && date >= today && !(date <= lastReported + 20 * DAY_MS);
}

// ---------------------------------------------------------------- holders

const HOLDERS_US: [string, number, string][] = [
  ['Vanguard Group Inc', 8.8, 'Investment Advisor'], ['BlackRock Inc', 7.1, 'Investment Advisor'], ['State Street Corp', 4.0, 'Investment Advisor'],
  ['FMR LLC', 2.4, 'Investment Advisor'], ['Geode Capital Management', 2.1, 'Investment Advisor'], ['T. Rowe Price Associates', 1.3, 'Investment Advisor'],
  ['Capital Research & Management', 1.2, 'Investment Advisor'], ['JPMorgan Chase & Co', 1.1, 'Bank'], ['Morgan Stanley', 1.1, 'Investment Advisor'],
  ['Northern Trust Corp', 0.9, 'Investment Advisor'], ['Norges Bank', 0.9, 'Government'], ['Invesco Ltd', 0.6, 'Investment Advisor'],
  ['Wellington Management', 0.6, 'Investment Advisor'], ['Bank of America Corp', 0.6, 'Bank'], ['Charles Schwab Investment Mgmt', 0.5, 'Investment Advisor'],
  ['UBS Asset Management', 0.5, 'Investment Advisor'], ['Goldman Sachs Asset Mgmt', 0.4, 'Investment Advisor'], ['Dimensional Fund Advisors', 0.4, 'Investment Advisor'],
  ['Legal & General Investment Mgmt', 0.35, 'Investment Advisor'], ['Amundi', 0.3, 'Investment Advisor'],
];
const HOLDERS_INTL: [string, number, string][] = [
  ['BlackRock Inc', 5.2, 'Investment Advisor'], ['Vanguard Group Inc', 3.1, 'Investment Advisor'], ['Norges Bank', 2.0, 'Government'],
  ['Capital Research & Management', 1.4, 'Investment Advisor'], ['FMR LLC', 1.0, 'Investment Advisor'], ['Amundi', 0.9, 'Investment Advisor'],
  ['State Street Corp', 0.8, 'Investment Advisor'], ['UBS Asset Management', 0.7, 'Investment Advisor'], ['Legal & General Investment Mgmt', 0.6, 'Investment Advisor'],
  ['Deutsche Bank (DWS)', 0.6, 'Investment Advisor'], ['JPMorgan Chase & Co', 0.5, 'Bank'], ['Geode Capital Management', 0.45, 'Investment Advisor'],
  ['Invesco Ltd', 0.4, 'Investment Advisor'], ['Schroders PLC', 0.4, 'Investment Advisor'], ['Dimensional Fund Advisors', 0.3, 'Investment Advisor'],
  ['Wellington Management', 0.3, 'Investment Advisor'], ['T. Rowe Price Associates', 0.3, 'Investment Advisor'], ['Allianz Global Investors', 0.25, 'Investment Advisor'],
];

export interface Holder {
  name: string;
  type: string;
  pct: number;
  shares: number;
  change: number;
  /** The source reports +100% both for a new position and for a doubled one. */
  newOrDoubled?: boolean;
  filed: number;
  source: string;
}

export function holders(def: SecurityDef): Holder[] {
  const real = getRealFund(def.id);
  if (real && real.holders.length) return real.holders;
  if (engine.realOnly) return [];
  const r = rng(def.id, 'holders');
  const list = def.country === 'US' ? HOLDERS_US : HOLDERS_INTL;
  const today = engine.today * DAY_MS;
  const qEnd = (() => {
    const d = new Date(today - 50 * DAY_MS);
    const m = d.getUTCMonth();
    return Date.UTC(d.getUTCFullYear(), m - (m % 3), 0);
  })();
  return list
    .map(([name, pct, type]) => {
      const p = pct * (0.75 + r() * 0.5);
      const shares = (p / 100) * def.eq!.shares * 1e6;
      return { name, type, pct: p, shares, change: shares * gaussian(r) * 0.03, filed: qEnd, source: def.country === 'US' ? '13F' : 'ULT-AGG' };
    })
    .sort((a, b) => b.pct - a.pct);
}

// -------------------------------------------------------------- dividends

export interface Dividend {
  declared: number;
  ex: number;
  record: number;
  pay: number;
  amount: number;
  freq: string;
  type: string;
}

const FREQ_BY_COUNTRY: Record<string, number> = { US: 4, CA: 4, GB: 2, TW: 4, KR: 4, JP: 2, HK: 2, AU: 2, IN: 1, DE: 1, FR: 2, NL: 4, CH: 1, DK: 2 };
const FREQ_OVERRIDE: Record<string, number> = { 'SHEL LN Equity': 4, 'HSBA LN Equity': 4, 'ULVR LN Equity': 4, 'TTE FP Equity': 4, 'OR FP Equity': 1, '700 HK Equity': 1, 'RELIANCE IN Equity': 1, 'DIS US Equity': 2, '9988 HK Equity': 1 };

export function dividends(def: SecurityDef): Dividend[] {
  // On real data the dividend history comes from the exchange record, including none at all.
  if (engine.isExternal(def.id) || getRealFund(def.id)) return realDividendList(def);
  if (engine.realOnly) return [];
  const eq = def.eq!;
  if (eq.dps <= 0) return [];
  const freq = FREQ_OVERRIDE[def.id] ?? FREQ_BY_COUNTRY[def.country] ?? 4;
  const r = rng(def.id, 'dvd');
  const step = 12 / freq;
  const phase = Math.floor(r() * step);
  const day = 5 + Math.floor(r() * 20);
  const today = engine.today * DAY_MS;
  const now = new Date(today);
  const amt0 = eq.dps / freq;
  const growth = 0.03 + r() * 0.06;
  const M = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const j0 = Math.floor((M - phase) / step);
  const out: Dividend[] = [];
  let future = 0;
  for (let j = j0 + 2; j > j0 - freq * 6; j--) {
    const mIdx = phase + j * step;
    const ex = rollForward(new Date(Date.UTC(Math.floor(mIdx / 12), mIdx % 12, day))).getTime();
    const years = Math.max(0, Math.floor((today - ex) / (365 * DAY_MS)));
    const amount = Math.round(amt0 * Math.pow(1 + growth, -years) * 10000) / 10000;
    const declared = rollForward(new Date(ex - (21 + Math.floor(r() * 14)) * DAY_MS)).getTime();
    const pay = rollForward(new Date(ex + (14 + Math.floor(r() * 14)) * DAY_MS)).getTime();
    if (ex > today) {
      future++;
      if (declared > today) out.push({ declared: NaN, ex, record: ex, pay, amount, freq: FREQ_LABEL[freq], type: 'Projected' });
      else out.push({ declared, ex, record: ex, pay, amount, freq: FREQ_LABEL[freq], type: 'Declared' });
      continue;
    }
    out.push({ declared, ex, record: ex, pay, amount, freq: FREQ_LABEL[freq], type: freq === 1 ? 'Final' : 'Regular Cash' });
  }
  // Keep only the next upcoming payment (declared or projected).
  const sorted = out.sort((a, b) => b.ex - a.ex);
  return future > 1 ? sorted.slice(future - 1) : sorted;
}

const FREQ_LABEL: Record<number, string> = { 1: 'Annual', 2: 'Semi-Anl', 4: 'Quarter', 12: 'Monthly' };

/** Paid dividends from the exchange record, newest first, plus the next declared one. */
function realDividendList(def: SecurityDef): Dividend[] {
  const list = realDividends.get(def.id) ?? [];
  const recent = list.filter((x) => x.day * DAY_MS > engine.now() - 400 * DAY_MS).length;
  const freq = recent >= 10 ? 12 : recent >= 4 ? 4 : recent >= 2 ? 2 : 1;
  // The record gives dates and amounts only: whether a payment was regular or special is not in it.
  const out: Dividend[] = list.map((x) => ({ declared: NaN, ex: x.day * DAY_MS, record: NaN, pay: NaN, amount: x.amount, freq: FREQ_LABEL[freq], type: 'Cash' }));
  const next = getRealFund(def.id)?.nextDividend;
  if (next && next.ex > (list.length ? list[list.length - 1].day * DAY_MS : 0)) {
    // The source gives the date but not the amount or a declaration (Toyota's March 2027 date is a forecast):
    // it is an expected date, and the annual rate over the frequency would be a guess at the amount.
    out.push({ declared: NaN, ex: next.ex, record: NaN, pay: next.pay, amount: NaN, freq: FREQ_LABEL[freq], type: 'Expected' });
  } else if (next && Number.isFinite(next.pay)) {
    // The dividend already went ex: its payable date belongs to that row.
    const row = out.find((d) => Math.abs(d.ex - next.ex) < DAY_MS);
    if (row) row.pay = next.pay;
  }
  // Nasdaq's dividend record (US listings) gives each payment's declaration, record and payment dates, and a
  // declared dividend before it goes ex. Its amounts are as paid at the time, so the price history's split-adjusted
  // amounts are kept; a declared dividend still to go ex takes Nasdaq's amount, which is on today's share basis.
  const declared = nasdaqPart<NasdaqDividend[]>(nasdaqSymbol(def), 'dividends') ?? [];
  for (const n of declared) {
    const row = out.find((d) => Math.abs(d.ex - n.ex) < 1.5 * DAY_MS);
    if (row) {
      if (!Number.isFinite(row.declared)) row.declared = n.declared;
      if (!Number.isFinite(row.record)) row.record = n.record;
      if (!Number.isFinite(row.pay)) row.pay = n.pay;
      if (row.type === 'Expected' && Number.isFinite(n.declared)) Object.assign(row, { type: 'Declared', amount: Number.isFinite(row.amount) ? row.amount : n.amount });
    } else if (n.ex > engine.now() - DAY_MS && Number.isFinite(n.amount) && /cash/i.test(n.type)) {
      out.push({ declared: n.declared, ex: n.ex, record: n.record, pay: n.pay, amount: n.amount, freq: FREQ_LABEL[freq], type: Number.isFinite(n.declared) ? 'Declared' : 'Expected' });
    }
  }
  return out.sort((a, b) => b.ex - a.ex);
}

/** A share split: `numerator` new shares for every `denominator` held, effective on `date` (ms). */
export interface StockSplit {
  date: number;
  numerator: number;
  denominator: number;
}

/** Splits from the exchange record (the same Yahoo history as the dividends), newest first; none are generated. */
export function splits(def: SecurityDef): StockSplit[] {
  return (realSplits.get(def.id) ?? []).map((x) => ({ date: x.day * DAY_MS, numerator: x.numerator, denominator: x.denominator })).sort((a, b) => b.date - a.date);
}

/** A split ratio as the record gives it (4:1, 1:8, 1281:1000). */
export function splitRatio(x: Pick<StockSplit, 'numerator' | 'denominator'>): string {
  const n = (v: number) => String(Number(v.toPrecision(6)));
  return `${n(x.numerator)}:${n(x.denominator)}`;
}

/** More shares after it than before is a split; fewer, a reverse split (consolidation). */
export const splitType = (x: Pick<StockSplit, 'numerator' | 'denominator'>): string => (x.numerator >= x.denominator ? 'Stock split' : 'Reverse split');

/** The same date `years` calendar years earlier. */
function yearsBefore(ms: number, years: number): number {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
}

/**
 * Compound annual growth, in percent, of the 12-month dividend over `years` years: the dividends that went
 * ex in the year to `asOf` against those in the year that ended `years` years earlier. NaN unless the
 * history covers that earlier year in full: it starts (`since`, the first day of the price history the
 * record comes with) before that year, a dividend went ex before it (so it is not a first, partial year of
 * payments), and both years have dividends. Amounts as the record gives them: Yahoo's are adjusted for
 * later splits, and specials are not told apart from regular dividends.
 */
export function dividendGrowth(list: { ex: number; amount: number }[], asOf: number, since: number, years = 5): number {
  const thenEnd = yearsBefore(asOf, years);
  const thenStart = yearsBefore(thenEnd, 1);
  if (!(since <= thenStart) || !list.some((d) => d.ex <= thenStart && d.amount > 0)) return NaN;
  const paid = (to: number) => {
    const from = yearsBefore(to, 1);
    return list.reduce((sum, d) => (d.ex > from && d.ex <= to && Number.isFinite(d.amount) ? sum + d.amount : sum), 0);
  };
  const now = paid(asOf);
  const then = paid(thenEnd);
  return now > 0 && then > 0 ? ((now / then) ** (1 / years) - 1) * 100 : NaN;
}

// ------------------------------------------------------------------ peers

export function peers(def: SecurityDef, max = 10): SecurityDef[] {
  const all = engine.securities.filter((d) => d.cls === 'equity' && d.id !== def.id);
  const same = all.filter((d) => d.eq!.industry === def.eq!.industry);
  const sector = all.filter((d) => d.eq!.sector === def.eq!.sector && !same.includes(d));
  return [...same, ...sector].slice(0, max);
}

/** Geographic revenue mix by home region (percent). */
export function revenueMix(def: SecurityDef): { region: string; pct: number }[] {
  if (engine.realOnly) return [];
  const r = rng(def.id, 'geo');
  const home = def.region;
  const base: Record<string, number> = { Americas: 0.2, EMEA: 0.2, APAC: 0.2 };
  base[home] += 0.35 + r() * 0.25;
  const others = Object.keys(base).filter((k) => k !== home);
  base[others[0]] += r() * 0.15;
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  return Object.entries(base)
    .map(([region, v]) => ({ region, pct: (v / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}
