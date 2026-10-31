// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { engine } from '../data/market';
import { CLASS_LABEL } from '../data/registry';
import { basePerPrice, isMargined, navValue } from './portfolio';
import type { Portfolio } from './userdata';

/**
 * COMPLIANCE (CMGR): your own investment rules, checked against a portfolio as its prices move and before a trade is
 * recorded. The provider describes its CMGR as "real-time compliance checks in every step of the buy-side process",
 * a rules engine with an exception blotter; these rules are the user's own limits on the app's own portfolios.
 *
 * Weights are shares of the portfolio's net asset value (cash, securities at market, futures at their P&L); a future's
 * exposure is its notional. A rule on a group (a sector, a country) adds the exposures of the holdings in it.
 */

export type RuleKind = 'position' | 'sector' | 'country' | 'region' | 'class' | 'ucits' | 'restricted' | 'count' | 'cash' | 'short';

export interface Rule {
  id: string;
  kind: RuleKind;
  /** The limit in percent of net asset value (a ceiling; for 'count' the fewest holdings, for 'cash' a floor too). */
  max?: number;
  /** For 'cash': the least cash, percent; for 'count': the fewest holdings. */
  min?: number;
  /** A warning from this level on, before the limit (percent; for 'count' a number of holdings). */
  warn?: number;
  /** A group rule on one group only ("Information Technology"); every group when absent. */
  group?: string;
  /** For 'restricted': the securities not to hold. */
  ids?: string[];
  on: boolean;
}

export const RULE_LABEL: Record<RuleKind, string> = {
  position: 'Largest position',
  sector: 'Sector weight',
  country: 'Country weight',
  region: 'Region weight',
  class: 'Asset class weight',
  ucits: 'UCITS 5/10/40',
  restricted: 'Restricted list',
  count: 'Fewest holdings',
  cash: 'Cash',
  short: 'No short positions',
};

export type Status = 'pass' | 'warn' | 'breach' | 'unknown';

export interface Holding {
  id: string;
  label: string;
  sector: string;
  country: string;
  region: string;
  cls: string;
  /** Exposure in the base currency: market value, a future's notional; negative when short. */
  exposure: number;
  qty: number;
}

export interface Book {
  holdings: Holding[];
  cash: number;
  /** Net asset value in the base currency; NaN when a holding has no price. */
  nav: number;
  base: string;
}

/** A portfolio's holdings as the rules see them, at today's prices and rates. */
export function bookOf(p: Portfolio): Book {
  const base = p.base ?? 'USD';
  let nav = p.cash;
  const holdings: Holding[] = [];
  for (const pos of p.positions) {
    const d = engine.get(pos.id);
    const q = engine.quote(pos.id);
    if (!d || !q || !Number.isFinite(q.last)) {
      nav = NaN;
      continue;
    }
    nav += navValue(d, pos.qty, q.last, pos.cost, base);
    holdings.push({
      id: d.id,
      label: d.ticker,
      sector: d.eq?.sector ?? (isMargined(d) ? 'Futures' : CLASS_LABEL[d.cls]),
      country: d.country || 'Unknown',
      region: d.region,
      cls: CLASS_LABEL[d.cls],
      exposure: pos.qty * q.last * basePerPrice(d, base),
      qty: pos.qty,
    });
  }
  return { holdings, cash: p.cash, nav, base };
}

export interface Item {
  /** What the finding is about: a ticker, a sector, "Cash". */
  key: string;
  /** Its weight in percent of NAV, or a count. */
  value: number;
  status: Status;
}

export interface Finding {
  rule: Rule;
  status: Status;
  /** The items at a warning or over the limit, worst first; for a passing rule, the closest one. */
  items: Item[];
  /** The limit in words: "≤ 10% of NAV". */
  limit: string;
}

const pct = (x: number, nav: number) => (x / nav) * 100;
const worst = (a: Status, b: Status): Status => (['pass', 'warn', 'breach', 'unknown'].indexOf(a) >= ['pass', 'warn', 'breach', 'unknown'].indexOf(b) ? a : b);
const above = (v: number, max: number | undefined, warn: number | undefined): Status => (max != null && v > max + 1e-9 ? 'breach' : warn != null && v > warn + 1e-9 ? 'warn' : 'pass');

const GROUP_OF: Partial<Record<RuleKind, keyof Holding>> = { sector: 'sector', country: 'country', region: 'region', class: 'cls' };

/** The rule's limit in words. */
export function limitText(r: Rule): string {
  switch (r.kind) {
    case 'restricted':
      return `none of ${r.ids?.length ?? 0} securities`;
    case 'count':
      return `at least ${r.min ?? 0} holdings`;
    case 'cash':
      return [r.min != null ? `≥ ${r.min}%` : '', r.max != null ? `≤ ${r.max}%` : ''].filter(Boolean).join(' and ') + ' of NAV';
    case 'short':
      return 'no holding below zero';
    case 'ucits':
      return 'each ≤ 10%; those above 5% together ≤ 40%';
    default:
      return `${r.group ? `${r.group}: ` : 'each: '}≤ ${r.max ?? '?'}% of NAV${r.warn != null ? `, warning above ${r.warn}%` : ''}`;
  }
}

/** One rule against the book. */
export function checkRule(r: Rule, b: Book): Finding {
  const limit = limitText(r);
  const done = (items: Item[]): Finding => {
    const rank = (st: Status) => ['pass', 'warn', 'breach', 'unknown'].indexOf(st);
    const sorted = items.sort((x, y) => rank(y.status) - rank(x.status) || Math.abs(y.value) - Math.abs(x.value));
    const status = sorted.reduce<Status>((s, i) => worst(s, i.status), 'pass');
    return { rule: r, status, items: status === 'pass' ? sorted.slice(0, 1) : sorted.filter((i) => i.status !== 'pass'), limit };
  };
  if (r.kind === 'restricted') {
    const banned = new Set(r.ids ?? []);
    return done(b.holdings.filter((h) => banned.has(h.id) && h.qty !== 0).map((h) => ({ key: h.label, value: pct(h.exposure, b.nav), status: 'breach' as Status })));
  }
  if (r.kind === 'short') return done(b.holdings.filter((h) => h.qty < 0).map((h) => ({ key: h.label, value: pct(h.exposure, b.nav), status: 'breach' as Status })));
  if (r.kind === 'count') {
    const n = b.holdings.filter((h) => h.qty !== 0).length;
    const status: Status = r.min != null && n < r.min ? 'breach' : r.warn != null && n < r.warn ? 'warn' : 'pass';
    return { rule: r, status, items: [{ key: 'Holdings', value: n, status }], limit };
  }
  if (!(b.nav > 0)) return { rule: r, status: 'unknown', items: [], limit };
  if (r.kind === 'cash') {
    const v = pct(b.cash, b.nav);
    const status: Status = (r.min != null && v < r.min - 1e-9) || (r.max != null && v > r.max + 1e-9) ? 'breach' : 'pass';
    return { rule: r, status, items: [{ key: 'Cash', value: v, status }], limit };
  }
  if (r.kind === 'position') return done(b.holdings.map((h) => { const v = pct(Math.abs(h.exposure), b.nav); return { key: h.label, value: v, status: above(v, r.max, r.warn) }; }));
  if (r.kind === 'ucits') {
    // UCITS Directive 2009/65/EC, Article 52(2): at most 10% in one issuer, and the holdings above 5% together at most 40%.
    const ws = b.holdings.map((h) => ({ key: h.label, value: pct(Math.abs(h.exposure), b.nav) }));
    const big = ws.filter((w) => w.value > 5 + 1e-9);
    const sum = big.reduce((a, w) => a + w.value, 0);
    const items: Item[] = ws.map((w) => ({ ...w, status: w.value > 10 + 1e-9 ? 'breach' : 'pass' }));
    items.push({ key: 'Holdings above 5%', value: sum, status: sum > 40 + 1e-9 ? 'breach' : 'pass' });
    return done(items);
  }
  const field = GROUP_OF[r.kind]!;
  const by = new Map<string, number>();
  for (const h of b.holdings) by.set(String(h[field]), (by.get(String(h[field])) ?? 0) + Math.abs(h.exposure));
  const groups = [...by.entries()].filter(([g]) => !r.group || g.toLowerCase() === r.group.toLowerCase());
  if (r.group && !groups.length) return { rule: r, status: 'pass', items: [{ key: r.group, value: 0, status: 'pass' }], limit };
  return done(groups.map(([g, x]) => { const v = pct(x, b.nav); return { key: g, value: v, status: above(v, r.max, r.warn) }; }));
}

export function checkRules(rules: readonly Rule[], b: Book): Finding[] {
  return rules.filter((r) => r.on).map((r) => checkRule(r, b));
}

/**
 * What a trade would add: each rule item that would be at a warning or over the limit after it and was not, or was
 * at a warning and would be over. The pre-trade check shows these before the trade is recorded.
 */
export function newProblems(before: readonly Finding[], after: readonly Finding[]): string[] {
  const out: string[] = [];
  const rank = (s: Status) => (s === 'breach' ? 2 : s === 'warn' ? 1 : 0);
  for (const f of after) {
    const prev = before.find((x) => x.rule.id === f.rule.id);
    for (const i of f.items) {
      if (i.status !== 'warn' && i.status !== 'breach') continue;
      const was = prev?.items.find((x) => x.key === i.key)?.status ?? 'pass';
      if (rank(i.status) > rank(was)) out.push(`${RULE_LABEL[f.rule.kind]}: ${i.key} ${f.rule.kind === 'count' ? i.value : `${i.value.toFixed(1)}%`} (${i.status === 'breach' ? 'over the limit' : 'warning'}; ${f.limit})`);
    }
  }
  return out;
}

/** A new rule's id. */
export const ruleId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
