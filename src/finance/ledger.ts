import type { DailyLevel } from './portfolio-risk';

/**
 * A portfolio's transactions: buys, sells and dividends with their dates, fees and exchange rates, matched into
 * lots first in, first out. Quantities and prices are put on today's share basis through the splits since each
 * trade, so they agree with split-adjusted price histories; money amounts are unchanged by a split.
 */

const DAY_MS = 86_400_000;

export interface Txn {
  id: string;
  kind: 'buy' | 'sell' | 'dividend';
  /** The app's security id. */
  sec: string;
  /** Trade date, YYYY-MM-DD (a dividend's payment date). */
  date: string;
  /** Shares, contracts or face as traded, positive; 0 for a dividend. */
  qty: number;
  /** Price per unit as traded, in the price's own currency (pence for a pence-quoted stock); for a dividend, the total received in major units (pounds). */
  price: number;
  /** Fees and commissions in the price's currency, major units (pounds, not pence). */
  fee: number;
  /** Units of `base` per unit of the price's major currency on the trade date; NaN when unknown. */
  fx: number;
  /** Where the rate comes from: "ECB reference rate of 2026-06-30", "entered", "same currency". */
  fxNote: string;
  /** The portfolio currency the rate converts into. */
  base: string;
}

export interface SecInfo {
  /** Base-currency-free value of one price unit for one quantity unit: the multiplier, and 0.01 for pence. */
  unit: number;
  /** Splits as new shares per old share (10 for ten for one), by the first day the shares traded split. */
  splits: readonly { day: number; ratio: number }[];
}

export const dayOf = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Today's shares per share held before `day`: every split after that day, multiplied. */
export function splitFactor(splits: SecInfo['splits'], day: number): number {
  return splits.reduce((f, s) => (s.day > day && s.ratio > 0 ? f * s.ratio : f), 1);
}

export interface Lot {
  sec: string;
  date: string;
  /** Remaining quantity on today's share basis. */
  qty: number;
  /** Price per share on today's basis, in the price's currency. */
  price: number;
  /** The buy fee per share on today's basis, major units of the price's currency. */
  feePerUnit: number;
  fx: number;
  txn: string;
}

export interface Realised {
  sec: string;
  bought: string;
  sold: string;
  /** Quantity on today's share basis. */
  qty: number;
  buyPrice: number;
  sellPrice: number;
  /** In the base currency: the price move at the sale's rate, the rate's move on the cost, and both fees. */
  price: number;
  fx: number;
  fees: number;
  total: number;
}

export interface Income {
  sec: string;
  date: string;
  /** The amount in the price's currency, and in the base (NaN without a rate). */
  amount: number;
  base: number;
}

export interface LedgerState {
  lots: Lot[];
  realised: Realised[];
  income: Income[];
  /** Fees paid, in the base. */
  fees: number;
  /** Sales larger than the shares held on their day: the transaction and the excess, on today's share basis. */
  oversold: { txn: string; sec: string; date: string; qty: number }[];
  problems: string[];
}

/** Trades in date order; trades of one day keep the order they were entered in. */
export const ordered = (txns: readonly Txn[]) => txns.map((t, i) => ({ t, i, day: dayOf(t.date) })).sort((a, b) => a.day - b.day || a.i - b.i);

/** A trade's rate into the base, or NaN when it was recorded for another base or has none. */
const rateOf = (t: Txn, base: string) => (t.base === base && t.fx > 0 ? t.fx : NaN);

export function replay(txns: readonly Txn[], info: (sec: string) => SecInfo | undefined, base: string): LedgerState {
  const out: LedgerState = { lots: [], realised: [], income: [], fees: 0, oversold: [], problems: [] };
  const open = new Map<string, Lot[]>();
  let noRate = 0;
  for (const { t, day } of ordered(txns)) {
    const s = info(t.sec);
    if (!s) {
      out.problems.push(`${t.sec} (${t.date}) is not a security the app knows.`);
      continue;
    }
    const fx = rateOf(t, base);
    if (!Number.isFinite(fx)) noRate++;
    if (t.kind === 'dividend') {
      out.income.push({ sec: t.sec, date: t.date, amount: t.price, base: t.price * fx });
      continue;
    }
    out.fees += t.fee * fx;
    const f = splitFactor(s.splits, day);
    const qty = t.qty * f;
    const price = t.price / f;
    const lots = open.get(t.sec) ?? [];
    if (t.kind === 'buy') {
      lots.push({ sec: t.sec, date: t.date, qty, price, feePerUnit: qty > 0 ? t.fee / qty : 0, fx, txn: t.id });
      open.set(t.sec, lots);
      continue;
    }
    let left = qty;
    const sellFeePerUnit = qty > 0 ? t.fee / qty : 0;
    while (left > 1e-9 && lots.length) {
      const lot = lots[0];
      const q = Math.min(left, lot.qty);
      const pricePart = q * s.unit * (price - lot.price) * fx;
      const fxPart = q * s.unit * lot.price * (fx - lot.fx);
      const fees = -(q * lot.feePerUnit * lot.fx + q * sellFeePerUnit * fx);
      out.realised.push({ sec: t.sec, bought: lot.date, sold: t.date, qty: q, buyPrice: lot.price, sellPrice: price, price: pricePart, fx: fxPart, fees, total: pricePart + fxPart + fees });
      lot.qty -= q;
      left -= q;
      if (lot.qty <= 1e-9) lots.shift();
    }
    if (left > 1e-9) {
      out.oversold.push({ txn: t.id, sec: t.sec, date: t.date, qty: left });
      out.problems.push(`The sale of ${t.sec} on ${t.date} is ${fmt(left)} more than the shares held then.`);
    }
  }
  for (const lots of open.values()) out.lots.push(...lots.filter((l) => l.qty > 1e-9));
  if (noRate) out.problems.push(`${noRate} transaction${noRate === 1 ? ' has' : 's have'} no exchange rate into ${base}: amounts in ${base} that need ${noRate === 1 ? 'it' : 'them'} are unknown.`);
  return out;
}

const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);

/** A lot's unrealised P&L in the base at the current price and rate, split as a sale would be. */
export function unrealised(lot: Lot, unit: number, last: number, fxNow: number): { price: number; fx: number; fees: number; total: number } {
  const price = lot.qty * unit * (last - lot.price) * fxNow;
  const fx = lot.qty * unit * lot.price * (fxNow - lot.fx);
  const fees = -lot.qty * lot.feePerUnit * lot.fx;
  return { price, fx, fees, total: price + fx + fees };
}

/**
 * The daily internal rate of return of dated flows: the rate at which their value, discounted day by day, is zero.
 * Solved per day so a short period cannot overflow. NaN without both an outflow and an inflow, or without a root.
 */
export function irrDaily(flows: readonly { t: number; amount: number }[]): number {
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return NaN;
  const t0 = Math.min(...flows.map((f) => f.t));
  const npv = (r: number) => flows.reduce((a, f) => a + f.amount / (1 + r) ** ((f.t - t0) / DAY_MS), 0);
  let hi = 0.01;
  while (npv(hi) > 0 && hi < 100) hi *= 2;
  // Down towards −100% a day only as far as needed: a long period overflows near it.
  let lo = -0.001;
  while (npv(lo) < 0 && lo > -0.999) lo = -1 + (1 + lo) / 2;
  const a = npv(lo);
  const b = npv(hi);
  if (Number.isNaN(a) || Number.isNaN(b) || Math.sign(a) === Math.sign(b)) return NaN;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.sign(v) === Math.sign(a)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Annual money-weighted return (XIRR, 365-day years). */
export const xirr = (flows: readonly { t: number; amount: number }[]) => (1 + irrDaily(flows)) ** 365 - 1;

export interface PerfInput {
  txns: readonly Txn[];
  base: string;
  info: (sec: string) => SecInfo | undefined;
  /** Daily closes in the price's currency, split-adjusted, before today. */
  closes: (sec: string) => readonly DailyLevel[];
  /** Daily units of the base per unit of the price's currency; undefined when that currency is the base. */
  fx: (sec: string) => readonly DailyLevel[] | undefined;
  /** The current price and rate, for the last point: now. */
  now: { at: number; price: (sec: string) => number; fx: (sec: string) => number };
  /** The start of today (UTC): closes from then on are not used. */
  cutoff: number;
}

export interface Perf {
  /** Time-weighted return over the whole period, and a year (NaN under a year). */
  twr: number;
  twrAnnual: number;
  /** Money-weighted return a year (XIRR; NaN under a year), and over the period. */
  mwr: number;
  mwrPeriod: number;
  from: number;
  to: number;
  days: number;
  /** Value in the base at each close used, and the time-weighted return to it. */
  points: { date: number; value: number; twr: number }[];
  value: number;
  /** Dates left out because a holding had no close or no rate that day. */
  omittedDates: number;
  /** The first trade comes before any close: its first period runs from cost to the first close. */
  historyFrom: number;
  problems: string[];
}

const keyed = (levels: readonly DailyLevel[] | undefined) => (levels ? new Map(levels.map((l) => [Math.floor(l.date / DAY_MS), l.value])) : undefined);

/**
 * Time-weighted return chained over every close where each holding has a price and a rate (Modified Dietz each
 * day: buys at the start of the day, sales and dividends at its end), and the money-weighted return of the same
 * flows with today's value as the last. A trade on a day with no close counts at the next close used.
 */
export function performance(input: PerfInput): Perf {
  const { txns, base, info, now, cutoff } = input;
  const nan: Perf = { twr: NaN, twrAnnual: NaN, mwr: NaN, mwrPeriod: NaN, from: NaN, to: now.at, days: NaN, points: [], value: NaN, omittedDates: 0, historyFrom: NaN, problems: [] };
  const seq = ordered(txns);
  if (!seq.length) return nan;
  const from = seq[0].day * DAY_MS;
  const problems: string[] = [];
  const flows: { t: number; amount: number }[] = [];
  for (const { t, day } of seq) {
    const s = info(t.sec);
    const fx = rateOf(t, base);
    if (!s || !Number.isFinite(fx)) return { ...nan, from, problems: [`Returns need every transaction's rate into ${base}.`] };
    const money = t.kind === 'dividend' ? t.price * fx : t.kind === 'buy' ? -(t.qty * t.price * s.unit + t.fee) * fx : (t.qty * t.price * s.unit - t.fee) * fx;
    flows.push({ t: day * DAY_MS, amount: money });
  }
  const traded = [...new Set(seq.filter((x) => x.t.kind !== 'dividend').map((x) => x.t.sec))];
  const closes = new Map(traded.map((s) => [s, keyed(input.closes(s))!]));
  const rates = new Map(traded.map((s) => [s, keyed(input.fx(s))]));
  const firstDay = seq[0].day;
  const cutDay = Math.floor(cutoff / DAY_MS);
  const days = [...new Set(traded.flatMap((s) => [...closes.get(s)!.keys()]))].filter((d) => d >= firstDay && d < cutDay).sort((a, b) => a - b);

  const held = new Map<string, number>();
  let ti = 0;
  let buys = 0;
  let sales = 0;
  let prev = 0;
  let wealth = 1;
  // The last period's capital and growth factor: a dividend paid when nothing is held any more belongs to it.
  let lastDen = 0;
  let lastFactor = 1;
  let omitted = 0;
  const points: Perf['points'] = [];
  const apply = (until: number) => {
    while (ti < seq.length && seq[ti].day <= until) {
      const { t, day } = seq[ti];
      const amount = flows[ti].amount;
      if (t.kind === 'buy') buys -= amount;
      else sales += amount;
      if (t.kind !== 'dividend') held.set(t.sec, (held.get(t.sec) ?? 0) + (t.kind === 'buy' ? 1 : -1) * t.qty * splitFactor(info(t.sec)!.splits, day));
      ti++;
    }
  };
  const step = (value: number) => {
    const den = prev + buys;
    if (den > 0) {
      lastFactor = 1 + (value + sales - buys - prev) / den;
      lastDen = den;
      wealth *= lastFactor;
    } else if (sales > 0 && lastDen > 0) {
      wealth = (wealth / lastFactor) * (lastFactor + sales / lastDen);
      lastFactor += sales / lastDen;
    }
    buys = 0;
    sales = 0;
    prev = value;
  };
  for (const d of days) {
    apply(d);
    if ([...held.values()].some((q) => q < -1e-9)) return { ...nan, from, problems: ['A sale is larger than the shares held then: returns cannot be worked out.'] };
    let value = 0;
    let ok = true;
    for (const [s, q] of held) {
      if (Math.abs(q) < 1e-9) continue;
      const c = closes.get(s)!.get(d);
      const r = rates.get(s);
      const x = r ? r.get(d) : 1;
      if (c === undefined || x === undefined) {
        ok = false;
        break;
      }
      value += q * c * info(s)!.unit * x;
    }
    if (!ok) {
      omitted++;
      continue;
    }
    step(value);
    points.push({ date: d * DAY_MS, value, twr: wealth - 1 });
  }
  apply(Infinity);
  if ([...held.values()].some((q) => q < -1e-9)) return { ...nan, from, problems: ['A sale is larger than the shares held then: returns cannot be worked out.'] };
  let value = 0;
  for (const [s, q] of held) if (Math.abs(q) > 1e-9) value += q * now.price(s) * info(s)!.unit * now.fx(s);
  if (!Number.isFinite(value)) return { ...nan, from, points, omittedDates: omitted, problems: ['A holding has no current price or rate yet.'] };
  step(value);
  const twr = wealth - 1;
  const span = (now.at - from) / DAY_MS;
  const daily = irrDaily([...flows, { t: now.at, amount: value }]);
  const historyFrom = points.length ? points[0].date : NaN;
  if (points.length && historyFrom > from + 7 * DAY_MS) problems.push('The price history starts after the first trade: the first period runs from the cost to the first close.');
  return {
    twr,
    twrAnnual: span >= 365 ? (1 + twr) ** (365 / span) - 1 : NaN,
    mwr: span >= 365 ? (1 + daily) ** 365 - 1 : NaN,
    mwrPeriod: (1 + daily) ** ((now.at - from) / DAY_MS) - 1,
    from,
    to: now.at,
    days: span,
    points,
    value,
    omittedDates: omitted,
    historyFrom,
    problems,
  };
}
