import { hashString, seeded, gaussian } from '../core/rng';
import { DAY_MS, rollForward } from './calendar';
import { engine } from './market';
import { marketCap } from './analytics';
import type { SecurityDef } from './types';
import { getRealFund, usTiming } from './live/yfund';
import { realDividends, trailingDividendYield, yahooQuotes } from './live/yahoo';

/** All money values in millions of the reporting currency (GBP for pence lines). */
export interface FinPeriod {
  label: string;
  end: number;
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
  ni: number;
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

/** A period with no figures: what the desktop app shows before (or without) a company's real data. */
export function emptyPeriod(label = 'LTM', end = NaN): FinPeriod {
  const n = NaN;
  return {
    label, end, rev: n, cogs: n, gp: n, sga: n, rnd: n, opInc: n, da: n, ebitda: n, interest: n, pretax: n, tax: n, ni: n, shares: n,
    eps: n, dps: n, cash: n, recv: n, inv: n, curAssets: n, ppe: n, intang: n, totAssets: n, curLiab: n, debt: n, totLiab: n, equity: n,
    cfo: n, capex: n, fcf: n, divPaid: n, buyback: n,
  };
}

const emptyEstimate = (label: string): Estimate => ({ label, eps: NaN, rev: NaN, epsHi: NaN, epsLo: NaN, analysts: NaN, growth: NaN });

/**
 * The currency a company reports its statements in: the filings' own (Shell
 * reports in dollars though it trades in pence) when known, else the trading one.
 */
export function reportCcy(def: SecurityDef): string {
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
    label, end, rev, cogs: rev - gp, gp, sga, rnd: Math.max(0, rnd), opInc, da, ebitda: opInc + da, interest, pretax, tax, ni,
    shares, eps: ni / shares, dps: dps * k, cash, recv, inv, curAssets, ppe, intang, totAssets, curLiab, debt, totLiab, equity,
    cfo, capex, fcf, divPaid, buyback,
  };
}

const finCache = new Map<string, { annual: FinPeriod[]; quarterly: FinPeriod[]; ltm: FinPeriod }>();

/** Real statements when loaded (desktop app), otherwise the generated ones. */
export function financials(def: SecurityDef): { annual: FinPeriod[]; quarterly: FinPeriod[]; ltm: FinPeriod } {
  const real = getRealFund(def.id);
  if (real && (real.annual.length || real.quarterly.length)) {
    // A recent listing may have filed only quarters so far; the filings are shown as they are.
    const annual = real.annual.length ? real.annual : real.quarterly;
    const quarterly = real.quarterly.length ? real.quarterly : real.annual;
    return { annual, quarterly, ltm: real.ltm ?? annual[annual.length - 1] };
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
  fpe: number;
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
  epsFy1: number;
  epsFy2: number;
  revGrowth: number;
  epsGrowth: number;
  beta: number;
  shares: number;
  fcfYield: number;
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
  const ev = bank ? NaN : mcapRep + eq.netDebt;
  const est = estimates(def);
  const prevYear = f.annual[f.annual.length - 2];
  const lastYear = f.annual[f.annual.length - 1];
  const out: KeyStats = {
    price,
    mcap,
    ev,
    pe: ltm.eps > 0 ? priceRep / ltm.eps : NaN,
    fpe: est.fy1.eps > 0 ? priceRep / est.fy1.eps : NaN,
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
    epsFy1: est.fy1.eps,
    epsFy2: est.fy2.eps,
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
    const mixed = new Set(fx !== 1 ? ['pb', 'ev', 'evEbitda', 'ps'] : []);
    for (const [k, v] of Object.entries(real.stats)) if (Number.isFinite(v) && !mixed.has(k)) ks[k] = v as number;
  } else {
    const yq = yahooQuotes.get(def.id);
    if (yq) {
      // The quote's own figures, and none where it has none: a loss-maker has no P/E, not a generated one.
      const put = (k: string, v: unknown, scale = 1, missing = NaN) => {
        const x = Number(v);
        ks[k] = v != null && Number.isFinite(x) ? x * scale : missing;
      };
      put('pe', yq.trailingPE);
      put('fpe', yq.forwardPE);
      if (fx === 1) put('pb', yq.priceToBook);
      put('epsLtm', yq.epsTrailingTwelveMonths);
      put('epsFy1', yq.epsCurrentYear);
      put('epsFy2', yq.epsForward);
      ks.shares = def.eq!.shares;
    }
  }
  // On real data, the dividends paid over the past 12 months over the live price (see trailingDividendYield).
  if (engine.realOnly || engine.isExternal(def.id) || yahooQuotes.has(def.id)) out.divYld = trailingDividendYield(def.id) * 100;
  // Multiples on losses are not meaningful.
  for (const k of ['pe', 'fpe', 'evEbitda'] as const) if (!(out[k] > 0)) out[k] = NaN;
  return out;
}

export interface Estimate {
  label: string;
  eps: number;
  rev: number;
  epsHi: number;
  epsLo: number;
  analysts: number;
  growth: number;
}

export function estimates(def: SecurityDef): { fy1: Estimate; fy2: Estimate; nq: Estimate } {
  const real = getRealFund(def.id)?.estimates;
  if (real) return real;
  if (engine.realOnly) return { fy1: emptyEstimate('FY1'), fy2: emptyEstimate('FY2'), nq: emptyEstimate('Next Q') };
  const f = simFinancials(def);
  const r = rng(def.id, 'est');
  const g = baseGrowth(def);
  const last = f.annual[f.annual.length - 1];
  const fyLabel = (n: number) => `FY ${Number(last.label.slice(3)) + n}`;
  const analysts = Math.round(12 + Math.min(45, Math.sqrt(Math.max(1, marketCap(def.id) / 1e9)) * 1.6) + r() * 6);
  const mk = (n: number, label: string): Estimate => {
    const growth = Math.pow(1 + g * 1.1 + gaussian(r) * 0.02, n);
    const eps = last.eps * growth;
    const disp = 0.04 + r() * 0.06 + n * 0.03;
    return { label, eps, rev: last.rev * Math.pow(1 + g, n), epsHi: eps * (1 + disp), epsLo: eps * (1 - disp), analysts: analysts - n * 2, growth: (growth - 1) * 100 };
  };
  const lq = f.quarterly[f.quarterly.length - 1];
  const nqEps = lq.eps * (1 + g * 0.3 + gaussian(r) * 0.03);
  return {
    fy1: mk(1, fyLabel(1)),
    fy2: mk(2, fyLabel(2)),
    nq: { label: nextQuarterLabel(def), eps: nqEps, rev: lq.rev * (1 + g * 0.25), epsHi: nqEps * 1.06, epsLo: nqEps * 0.94, analysts: analysts - 3, growth: g * 25 },
  };
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

export interface EarningsEvent {
  period: string;
  date: number;
  estimate: number;
  actual: number | null;
  surprise: number | null;
  timing: 'Bef-mkt' | 'Aft-mkt' | '--';
  revEst: number;
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
  const r = rng(def.id, 'surprise');
  const timing: EarningsEvent['timing'] = rng(def.id, 'timing')() < 0.55 ? 'Aft-mkt' : 'Bef-mkt';
  const out: EarningsEvent[] = f.quarterly.map((q) => {
    const surprise = 0.02 + gaussian(r) * 0.045;
    const est = q.eps / (1 + surprise);
    const revSurprise = 0.008 + gaussian(r) * 0.012;
    return { period: q.label, date: reportDate(def, q.end), estimate: est, actual: q.eps, surprise: surprise * 100, timing, revEst: q.rev / (1 + revSurprise), revAct: q.rev };
  });
  const lq = f.quarterly[f.quarterly.length - 1];
  const nextEnd = Date.UTC(new Date(lq.end).getUTCFullYear(), new Date(lq.end).getUTCMonth() + 4, 0);
  const est = estimates(def).nq;
  const nextDate = reportDate(def, nextEnd);
  out.push({ period: est.label, date: nextDate, estimate: est.eps, actual: null, surprise: null, timing, revEst: est.rev, revAct: null });
  // A report dated in the future must not show an actual yet.
  return out.map((e) => (e.date > today && e.actual != null ? { ...e, actual: null, surprise: null, revAct: null } : e));
}

/**
 * Report dates for calendars and quote screens: the company's real reports when
 * loaded; otherwise the last and next dates from its real quote (desktop app);
 * otherwise, for a simulated line, the generated schedule.
 */
export function earningsEvents(def: SecurityDef): EarningsEvent[] {
  const real = getRealFund(def.id);
  if (real && real.earnings.length) return real.earnings;
  const yq = yahooQuotes.get(def.id);
  if (!yq) return engine.realOnly || engine.isExternal(def.id) ? [] : earningsHistory(def);
  const now = engine.now();
  const out: EarningsEvent[] = [];
  const blank = { period: '', estimate: NaN, surprise: null, revEst: NaN, revAct: null };
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

export function nextEarnings(def: SecurityDef): EarningsEvent | undefined {
  const today = engine.today * DAY_MS;
  return earningsEvents(def).find((e) => e.date >= today && e.actual == null);
}

// --------------------------------------------------------------- analysts

const BROKERS = [
  'Atlas Ridge Securities', 'Bramwell & Co', 'Castlegate Capital', 'Driftwood Partners', 'Eastbourne Research',
  'Fairhaven Securities', 'Granite Peak Advisors', 'Halberd Capital Markets', 'Ironwood Securities', 'Juniper Hill Research',
  'Kingsbridge Partners', 'Larkspur Securities', 'Marlowe Capital', 'Northlake Research', 'Oakmont Securities',
  'Pinecrest Capital', 'Quarry Lane Partners', 'Redfern & Co', 'Silverline Securities', 'Thornbury Capital',
  'Upland Research', 'Vantage Row Securities', 'Westmarch Partners', 'Yarrow Equity Research', 'Ashcombe Markets',
  'Belmont Hart', 'Cobalt Bay Securities', 'Dunmore Research', 'Elmstead & Co', 'Foxhall Capital',
];

export type Rating = 'Strong Buy' | 'Buy' | 'Outperform' | 'Hold' | 'Underperform' | 'Sell';
export const RATING_SCORE: Record<Rating, number> = { 'Strong Buy': 5, Buy: 5, Outperform: 4, Hold: 3, Underperform: 2, Sell: 1 };

export interface BrokerView {
  firm: string;
  /** The broker's own wording (Overweight, Outperform, Neutral...). */
  rating: string;
  /** 5 = buy ... 1 = sell. */
  score: number;
  target: number;
  prevTarget: number;
  action: 'Upgrade' | 'Downgrade' | 'Maintain' | 'Initiate' | 'Raise PT' | 'Cut PT';
  date: number;
  horizon: string;
}

export function analystViews(def: SecurityDef): BrokerView[] {
  const real = getRealFund(def.id);
  if (real && (real.views.length || real.consensus)) return real.views;
  if (engine.realOnly) return [];
  const r = rng(def.id, `anr:${Math.floor(engine.today / 7)}`);
  const base = rng(def.id, 'anr-base');
  const n = Math.min(BROKERS.length, estimates(def).fy1.analysts);
  const bias = 0.55 + base() * 0.3 - (def.eq!.beta < 0.6 ? 0.1 : 0);
  const px = def.minor ? (engine.quote(def.id)?.last ?? def.px) : engine.quote(def.id)?.last ?? def.px;
  const firms = [...BROKERS].sort(() => base() - 0.5).slice(0, n);
  const today = engine.today * DAY_MS;
  return firms
    .map((firm) => {
      const u = r();
      const rating: Rating = u < bias * 0.2 ? 'Strong Buy' : u < bias * 0.75 ? 'Buy' : u < bias ? 'Outperform' : u < bias + (1 - bias) * 0.75 ? 'Hold' : u < bias + (1 - bias) * 0.9 ? 'Underperform' : 'Sell';
      const mu = { 'Strong Buy': 0.24, Buy: 0.17, Outperform: 0.11, Hold: 0.03, Underperform: -0.07, Sell: -0.15 }[rating];
      const target = px * (1 + mu + gaussian(r) * 0.07);
      const ar = r();
      let action: BrokerView['action'] = ar < 0.08 ? 'Upgrade' : ar < 0.14 ? 'Downgrade' : ar < 0.2 ? 'Initiate' : ar < 0.45 ? 'Raise PT' : ar < 0.55 ? 'Cut PT' : 'Maintain';
      // A downgrade cannot land on the top rating, nor an upgrade on the bottom one.
      if ((action === 'Downgrade' && rating === 'Strong Buy') || (action === 'Upgrade' && rating === 'Sell')) action = 'Maintain';
      const prevTarget = action === 'Raise PT' ? target / (1.04 + r() * 0.12) : action === 'Cut PT' ? target * (1.04 + r() * 0.1) : target;
      const date = rollBack(today - Math.floor(r() * r() * 150 + 1) * DAY_MS);
      return { firm, rating, score: RATING_SCORE[rating], target: roundTarget(target), prevTarget: roundTarget(prevTarget), action, date, horizon: '12 month' };
    })
    .sort((a, b) => b.date - a.date);
}

/** Business day on or before `ms` (UTC midnight). */
function rollBack(ms: number): number {
  const d = new Date(ms);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}

function roundTarget(x: number): number {
  if (x >= 1000) return Math.round(x / 5) * 5;
  if (x >= 100) return Math.round(x);
  if (x >= 10) return Math.round(x * 2) / 2;
  return Math.round(x * 100) / 100;
}

export function consensus(def: SecurityDef): { buy: number; hold: number; sell: number; score: number; avg: number; hi: number; lo: number; n: number; nTargets?: number } {
  const real = getRealFund(def.id)?.consensus;
  if (real) return real;
  if (engine.realOnly) return { buy: 0, hold: 0, sell: 0, score: NaN, avg: NaN, hi: NaN, lo: NaN, n: 0 };
  const v = analystViews(def);
  const buy = v.filter((x) => x.score >= 4).length;
  const hold = v.filter((x) => x.score === 3).length;
  const sell = v.length - buy - hold;
  const score = v.reduce((s, x) => s + x.score, 0) / v.length;
  const targets = v.map((x) => x.target);
  const avg = targets.reduce((a, b) => a + b, 0) / targets.length;
  return { buy, hold, sell, score, avg, hi: Math.max(...targets), lo: Math.min(...targets), n: v.length };
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
  const out: Dividend[] = list.map((x) => ({ declared: NaN, ex: x.day * DAY_MS, record: NaN, pay: NaN, amount: x.amount, freq: FREQ_LABEL[freq], type: 'Regular Cash' }));
  const next = getRealFund(def.id)?.nextDividend;
  if (next && next.ex > (list.length ? list[list.length - 1].day * DAY_MS : 0)) {
    // The source gives the date but not the amount; the annual rate over the frequency would be a guess.
    out.push({ declared: NaN, ex: next.ex, record: NaN, pay: next.pay, amount: NaN, freq: FREQ_LABEL[freq], type: 'Declared' });
  }
  return out.sort((a, b) => b.ex - a.ex);
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
