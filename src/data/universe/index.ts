// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { SecurityDef } from '../types';
import { EQUITIES } from './equities';
import { COMMODITIES, CRYPTO, CURRENCIES, DXY, FX, INDICES, RATES, type CurrencyDef } from './markets';
import snapshot from './snapshot.json';
import { addMonths, dayToIso, endOfMonth, isoToDay } from '../calendar';
import { couponFraction } from '../../finance/bonds';
import { buildCorporates, buildFutures } from './credit';

export interface Calibration {
  px: number;
  date: string;
  anchors: [string, number][];
  vol: number;
  adv: number;
}

const SNAP = snapshot as unknown as { asOf: string; data: Record<string, Calibration> };
export const SNAPSHOT_AS_OF = SNAP.asOf;

/** Per-instrument anchors: [ISO date, level]. Most recent first. */
export const ANCHORS = new Map<string, [string, number][]>();

function calibrate(def: SecurityDef, key = def.id): boolean {
  const c = SNAP.data[key];
  if (!c) return false;
  const seedPx = def.px;
  def.px = c.px;
  // Realised vols from one turbulent year overstate typical days; blend with the reference.
  if (c.vol > 0) def.vol = Math.max(def.vol * 0.8, Math.sqrt(c.vol * def.vol));
  if (c.adv > 0) def.adv = c.adv;
  ANCHORS.set(def.id, [[c.date, c.px], ...c.anchors]);
  if (def.eq && seedPx > 0) {
    // Reference fundamentals date from before the snapshot; scale earnings with
    // the price move so valuation multiples stay in a plausible range.
    const g = c.px / seedPx;
    const earn = g >= 1 ? g ** 0.7 : g ** 0.3;
    const sales = g >= 1 ? g ** 0.45 : g ** 0.2;
    def.eq.ni = Math.round(def.eq.ni * (def.eq.ni >= 0 ? earn : 1 / earn));
    def.eq.rev = Math.round(def.eq.rev * sales);
    def.eq.book = Math.round(def.eq.book * (g >= 1 ? g ** 0.25 : g ** 0.1));
  }
  return true;
}

/** Anchors for an instrument without its own calibration, derived from a proxy. */
function deriveAnchors(def: SecurityDef, proxyId: string, mode: 'ratio' | 'spread', beta = 1) {
  const proxy = ANCHORS.get(proxyId);
  if (!proxy) return;
  const now = proxy[0][1];
  ANCHORS.set(
    def.id,
    proxy.map(([d, v]) => [d, mode === 'ratio' ? def.px * (v / now) ** beta : def.px + beta * (v - now)]),
  );
}

const SEED_PX = new Map(RATES.map((r) => [r.id, r.px]));
for (const s of [...EQUITIES, ...INDICES, ...COMMODITIES, ...CRYPTO, ...RATES]) calibrate(s);

// Indices without a calibration feed track their closest relative.
const shsz = INDICES.find((s) => s.ticker === 'SHSZ300')!;
if (!ANCHORS.has(shsz.id)) {
  const sh = INDICES.find((s) => s.ticker === 'SHCOMP')!;
  shsz.px = Math.round(sh.px * 1.2);
  deriveAnchors(shsz, sh.id, 'ratio', 1.05);
}

// US curve: tenors without a feed are interpolated between calibrated points.
const us = RATES.filter((r) => r.curve === 'US').sort((a, b) => a.tenor! - b.tenor!);
const usKnown = us.filter((r) => ANCHORS.has(r.id));
if (usKnown.length >= 2) {
  const seedShape = SEED_PX;
  for (const r of us) {
    if (ANCHORS.has(r.id)) continue;
    const lo = [...usKnown].reverse().find((k) => k.tenor! < r.tenor!) ?? usKnown[0];
    const hi = usKnown.find((k) => k.tenor! > r.tenor!) ?? usKnown[usKnown.length - 1];
    const w = lo === hi ? 0 : (Math.sqrt(r.tenor!) - Math.sqrt(lo.tenor!)) / (Math.sqrt(hi.tenor!) - Math.sqrt(lo.tenor!));
    // Keep the seed curve's local curvature relative to the straight line.
    const seedLine = seedShape.get(lo.id)! + w * (seedShape.get(hi.id)! - seedShape.get(lo.id)!);
    const bump = seedShape.get(r.id)! - seedLine;
    const loA = ANCHORS.get(lo.id)!;
    const hiA = ANCHORS.get(hi.id)!;
    const hiMap = new Map(hiA);
    const derived: [string, number][] = [];
    for (const [d, v] of loA) {
      const h = hiMap.get(d);
      if (h == null) continue;
      derived.push([d, round3(v + w * (h - v) + bump)]);
    }
    if (derived.length) {
      ANCHORS.set(r.id, derived);
      r.px = derived[0][1];
      r.vol = lo.vol + w * (hi.vol - lo.vol);
    }
  }
}

// Other sovereign curves move with US 10Y by a country beta (no direct feed).
const RATE_BETA: Record<string, number> = { DE: 0.5, FR: 0.5, IT: 0.55, ES: 0.5, GB: 0.7, JP: 0.3, CH: 0.2, CA: 0.7, AU: 0.6, CN: 0.1, IN: 0.2, BR: 0.3, MX: 0.5 };
const us10 = RATES.find((r) => r.ticker === 'USGG10YR')!;
const US10_SEED = 4.08;
for (const r of RATES) {
  if (r.curve === 'US') continue;
  const beta = RATE_BETA[r.curve!] ?? 0.4;
  const slopeAdj = r.tenor! <= 2 ? 0.7 : r.tenor! >= 30 ? 1.1 : 1;
  r.px = round3(r.px + beta * slopeAdj * (us10.px - US10_SEED));
  deriveAnchors(r, us10.id, 'spread', beta * slopeAdj);
}

function round3(x: number) {
  return Math.round(x * 1000) / 1000;
}

// Currencies: simulated as the USD value of one unit.
export interface CurrencyState extends CurrencyDef {
  id: string;
  usdValue: number;
}

export const CURRENCY_DEFS: SecurityDef[] = CURRENCIES.map((c) => {
  const cal = SNAP.data[`CCY:${c.code}`];
  const perUsd = cal?.px ?? c.perUsd;
  const def: SecurityDef = {
    id: `CCY:${c.code}`, ticker: c.code, yk: 'Curncy', name: c.name, cls: 'fx', ccy: 'USD', country: c.country,
    region: c.region, px: 1 / perUsd, vol: cal?.vol ?? c.vol, dec: 6, quote: 'price',
  };
  if (cal) ANCHORS.set(def.id, [[cal.date, 1 / cal.px], ...cal.anchors.map(([d, v]): [string, number] => [d, 1 / v])]);
  return def;
});

const CCY_VALUE = new Map(CURRENCY_DEFS.map((d) => [d.ticker, d.px]));
const usdValue = (code: string) => (code === 'USD' ? 1 : CCY_VALUE.get(code)!);
for (const p of FX) {
  p.px = usdValue(p.fx!.base) / usdValue(p.fx!.quote);
}
DXY.px = SNAP.data['DXY Curncy']?.px ?? DXY.px;

export const CURRENCY_INFO = new Map(CURRENCIES.map((c) => [c.code, c]));

// On-the-run US Treasuries ("CT" generics), priced off the generic curve.
export function buildTreasuries(today: Date): SecurityDef[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const lastMonthEnd = endOfMonth(y, m - 1);
  const refund = (() => {
    // Most recent Feb/May/Aug/Nov 15 on or before today.
    for (let k = 0; k < 12; k++) {
      const d = new Date(Date.UTC(y, m - k, 15));
      if ([1, 4, 7, 10].includes(d.getUTCMonth()) && d.getTime() <= today.getTime()) return d;
    }
    return new Date(Date.UTC(y, m, 15));
  })();
  const mid = new Date(Date.UTC(y, today.getUTCDate() >= 15 ? m : m - 1, 15));
  const specs: [number, Date, string][] = [
    [2, lastMonthEnd, 'USGG2YR'], [3, mid, 'USGG3YR'], [5, lastMonthEnd, 'USGG5YR'], [7, lastMonthEnd, 'USGG7YR'],
    [10, refund, 'USGG10YR'], [20, refund, 'USGG20YR'], [30, refund, 'USGG30YR'],
  ];
  return specs.map(([tenor, issue, curveTicker]) => {
    let maturity = addMonths(issue, tenor * 12);
    if (issue.getUTCDate() !== 15) maturity = endOfMonth(maturity.getUTCFullYear(), maturity.getUTCMonth());
    const generic = RATES.find((r) => r.ticker === curveTicker)!;
    const issueYield = anchorNear(generic.id, isoToDay(issue.toISOString().slice(0, 10))) ?? generic.px;
    const coupon = Math.max(0.125, Math.floor(issueYield * 8) / 8);
    const mat = `${String(maturity.getUTCMonth() + 1).padStart(2, '0')}/${String(maturity.getUTCDate()).padStart(2, '0')}/${String(maturity.getUTCFullYear()).slice(2)}`;
    const ticker = `T ${couponFraction(coupon)} ${mat}`;
    return {
      id: `${ticker} Govt`, ticker, yk: 'Govt', name: `US TREASURY N/B ${tenor}Y`, cls: 'bond', ccy: 'USD', country: 'US',
      region: 'Americas', px: 100, vol: generic.vol, dec: 4, quote: 'price', tenor,
      alias: [`CT${tenor}`, `UST${tenor}Y`],
      bond: {
        coupon, maturity: maturity.toISOString().slice(0, 10), issue: issue.toISOString().slice(0, 10), legs: [{ id: generic.id, w: 1 }],
        spread: tenor >= 20 ? -1.5 : -0.5, freq: 2, amount: tenor <= 7 ? 70_000 : 42_000, rating: 'AA+', seniority: 'Govt',
      },
    } satisfies SecurityDef;
  });
}

/** Linearly interpolated anchor value on a given day. */
export function anchorNear(id: string, day: number): number | undefined {
  const a = ANCHORS.get(id);
  if (!a) return undefined;
  const pts = a.map(([d, v]) => [isoToDay(d), v] as const).sort((p, q) => p[0] - q[0]);
  if (day <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (day <= pts[i][0]) {
      const [d0, v0] = pts[i - 1];
      const [d1, v1] = pts[i];
      return v0 + ((day - d0) / (d1 - d0)) * (v1 - v0);
    }
  }
  return pts[pts.length - 1][1];
}

export function buildUniverse(today: Date): SecurityDef[] {
  return [...EQUITIES, ...INDICES, ...buildFutures(), ...FX, DXY, ...COMMODITIES, ...RATES, ...CRYPTO, ...buildTreasuries(today), ...buildCorporates(today)];
}

export { EQUITIES, INDICES, FX, DXY, COMMODITIES, RATES, CRYPTO, CURRENCIES };
export const snapshotDay = () => isoToDay(SNAPSHOT_AS_OF);
export const snapshotIso = () => dayToIso(snapshotDay());
