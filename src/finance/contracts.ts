// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { addMonths, DAY_MS } from '../data/calendar';

export type DayBasis = 360 | 365;
export const inputNumber = (text: string): number => text.trim() ? Number(text) : NaN;

/** Strict date-only parsing; JavaScript's February-31 rollover is not a valid contract date. */
export function contractDate(text: string): Date {
  const date = new Date(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : new Date(NaN);
}

export function actualDays(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / DAY_MS;
}

function requireInput(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RangeError(message);
}

export interface ForwardInputs {
  spot: number;
  baseRate: number; // annual simple deposit rate in percent
  quoteRate: number;
  days: number;
  baseBasis: DayBasis;
  quoteBasis: DayBasis;
  pointSize: number;
  notional: number; // units of base currency
  strike?: number;
}

/** Quote per base; long-base PV discounted to spot settlement, where the input deposits start. */
export function forwardValue(i: ForwardInputs) {
  requireInput([i.spot, i.baseRate, i.quoteRate, i.days, i.pointSize, i.notional].every(Number.isFinite), 'Enter finite spot, rates, days, point size and notional.');
  requireInput(i.spot > 0 && i.pointSize > 0 && i.notional > 0 && i.days >= 0 && i.days <= 36600 && Number.isInteger(i.days), 'Spot, point size and notional must be positive; days must be an integer from 0 to 36600.');
  requireInput([360, 365].includes(i.baseBasis) && [360, 365].includes(i.quoteBasis), 'Choose ACT/360 or ACT/365F for each currency.');
  const baseFactor = 1 + i.baseRate / 100 * i.days / i.baseBasis;
  const quoteFactor = 1 + i.quoteRate / 100 * i.days / i.quoteBasis;
  requireInput(baseFactor > 0 && quoteFactor > 0, 'The entered simple rates make a deposit accumulation factor zero or negative.');
  const outright = i.spot * quoteFactor / baseFactor;
  const quoteDiscount = 1 / quoteFactor;
  const points = (outright - i.spot) / i.pointSize;
  requireInput(i.strike === undefined || Number.isFinite(i.strike) && i.strike > 0, 'The contractual forward rate must be positive.');
  const pv = i.strike === undefined ? NaN : i.notional * (outright - i.strike) * quoteDiscount;
  const quoteAmount = i.notional * (i.strike ?? outright);
  requireInput([outright, points, quoteDiscount, quoteAmount].every(Number.isFinite) && (i.strike === undefined || Number.isFinite(pv)), 'These inputs exceed the calculator\'s numerical range.');
  return { outright, points, baseFactor, quoteFactor, quoteDiscount, pv, baseAmount: i.notional, quoteAmount };
}

export interface ZeroNode { years: number; discountPct: number; projectionPct: number }

/** Input is tenor-years, continuously compounded discount-zero %, optional projection-zero %. */
export function parseZeroCurve(text: string): ZeroNode[] {
  const rows = text.trim().split(/\r?\n/).filter((line) => line.trim());
  requireInput(rows.length > 0 && rows.length <= 100, 'Enter between 1 and 100 zero-curve nodes.');
  const nodes = rows.map((line, index) => {
    const fields = /[,;]/.test(line) ? line.trim().split(/[,;]/).map((x) => x.trim()) : line.trim().split(/\s+/);
    requireInput(fields.length === 2 || fields.length === 3, `Curve line ${index + 1}: use years, discount zero %, optional projection zero %.`);
    requireInput(fields.every((x) => x !== ''), `Curve line ${index + 1}: a value is missing.`);
    const [years, discountPct, projectionPct = discountPct] = fields.map(Number);
    requireInput([years, discountPct, projectionPct].every(Number.isFinite) && years > 0 && years <= 200 && Math.abs(discountPct) <= 100 && Math.abs(projectionPct) <= 100, `Curve line ${index + 1}: invalid tenor or zero rate (allowed range -100% to 100%).`);
    return { years, discountPct, projectionPct };
  }).sort((a, b) => a.years - b.years);
  requireInput(nodes.every((n, k) => k === 0 || n.years > nodes[k - 1].years), 'Curve tenors must be unique.');
  return nodes;
}

/** Log-linear discount factors, with DF(0)=1. No extrapolation beyond the last entered node. */
export function discountAt(nodes: ZeroNode[], years: number, leg: 'discount' | 'projection' = 'discount'): number {
  if (!Number.isFinite(years) || years < -1e-12 || !nodes.length) return NaN;
  if (years <= 0) return 1;
  let leftT = 0;
  let leftLog = 0;
  for (const node of nodes) {
    const rightLog = -(leg === 'discount' ? node.discountPct : node.projectionPct) / 100 * node.years;
    if (years <= node.years + 1e-12) return Math.exp(leftLog + (rightLog - leftLog) * (years - leftT) / (node.years - leftT));
    leftT = node.years;
    leftLog = rightLog;
  }
  return NaN;
}

export interface SwapInputs {
  valuation: Date;
  start: Date;
  maturity: Date;
  frequency: 1 | 2 | 4 | 12;
  notional: number;
  fixedPct?: number; // omitted means solve at par
  fixedBasis: DayBasis;
  floatBasis: DayBasis;
  payFixed: boolean;
  nodes: ZeroNode[];
}

/** Forward-start fixed/float model; unadjusted dates and common payment schedule for both legs. */
export function swapValue(i: SwapInputs) {
  requireInput([i.valuation.getTime(), i.start.getTime(), i.maturity.getTime(), i.notional].every(Number.isFinite), 'Enter valid valuation, start and maturity dates and notional.');
  requireInput(i.start >= i.valuation && i.maturity > i.start && actualDays(i.start, i.maturity) <= 200 * 366, 'Start must be on/after valuation and maturity after start, within 200 years.');
  requireInput(i.notional > 0 && [1, 2, 4, 12].includes(i.frequency) && [360, 365].includes(i.fixedBasis) && [360, 365].includes(i.floatBasis), 'Use positive notional, a supported frequency and ACT/360 or ACT/365F.');
  requireInput(i.nodes.length > 0 && i.nodes.every((n, k) => [n.years, n.discountPct, n.projectionPct].every(Number.isFinite) && n.years > 0 && (k === 0 || n.years > i.nodes[k - 1].years)), 'Enter a valid increasing zero curve.');
  const dates: Date[] = [i.maturity];
  for (let k = 1; ; k++) {
    const date = addMonths(i.maturity, -k * 12 / i.frequency);
    if (date <= i.start) break;
    dates.unshift(date);
  }
  let previous = i.start;
  const flows = dates.map((end) => {
    const t0 = actualDays(i.valuation, previous) / 365;
    const t1 = actualDays(i.valuation, end) / 365;
    const days = actualDays(previous, end);
    const alphaFixed = days / i.fixedBasis;
    const alphaFloat = days / i.floatBasis;
    const df = discountAt(i.nodes, t1);
    const projectedStart = discountAt(i.nodes, t0, 'projection');
    const projectedEnd = discountAt(i.nodes, t1, 'projection');
    requireInput([df, projectedStart, projectedEnd].every((x) => Number.isFinite(x) && x > 0), 'The zero curve must cover every payment date; extrapolation is disabled.');
    const forward = (projectedStart / projectedEnd - 1) / alphaFloat;
    const floatCash = i.notional * forward * alphaFloat;
    const flow = { start: previous, end, days, alphaFixed, alphaFloat, df, forwardPct: forward * 100, floatCash };
    previous = end;
    return flow;
  });
  const annuity = flows.reduce((sum, f) => sum + f.alphaFixed * f.df, 0);
  const floatPV = flows.reduce((sum, f) => sum + f.floatCash * f.df, 0);
  const parPct = floatPV / (i.notional * annuity) * 100;
  const fixedPct = i.fixedPct ?? parPct;
  requireInput(Number.isFinite(fixedPct), 'Enter a finite fixed coupon, or leave it blank to price at par.');
  const fixedPV = i.notional * fixedPct / 100 * annuity;
  const sign = i.payFixed ? 1 : -1;
  const npv = sign * (floatPV - fixedPV);
  requireInput([annuity, floatPV, fixedPV, npv, parPct].every(Number.isFinite), 'These swap inputs exceed the calculator\'s numerical range.');
  return { annuity, floatPV, fixedPV, parPct, fixedPct, npv,
    couponBpPnl: -sign * i.notional * annuity * 0.0001,
    flows: flows.map((f) => ({ ...f, fixedCash: i.notional * fixedPct / 100 * f.alphaFixed,
      netPV: sign * (f.floatCash - i.notional * fixedPct / 100 * f.alphaFixed) * f.df })),
  };
}
