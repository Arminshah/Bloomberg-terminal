// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { SecurityDef } from '../types';
import { RATES } from './markets';
import { EQUITIES } from './equities';

/** [coupon, maturity, issue, amount $mm] */
type Issue = [number, string, string, number];

/** Corporate bonds by issuer with a base credit spread (bp). Prices are simulated. */
const ISSUES: { issuer: string; spread: number; issues: Issue[] }[] = [
  { issuer: 'AAPL US Equity', spread: 45, issues: [[3.25, '2029-08-08', '2019-08-08', 3500], [4.3, '2033-05-10', '2023-05-10', 1750], [4.65, '2046-02-23', '2016-02-23', 4000]] },
  { issuer: 'MSFT US Equity', spread: 35, issues: [[3.3, '2027-02-06', '2017-02-06', 5000], [3.45, '2036-08-08', '2016-08-08', 2250], [2.921, '2052-03-17', '2021-03-17', 6250]] },
  { issuer: 'NVDA US Equity', spread: 50, issues: [[2.85, '2030-04-01', '2020-04-01', 1500], [3.5, '2050-04-01', '2020-04-01', 2000]] },
  { issuer: 'AMZN US Equity', spread: 55, issues: [[4.55, '2027-12-01', '2022-12-01', 2000], [4.7, '2032-12-01', '2022-12-01', 3750], [3.1, '2051-05-12', '2021-05-12', 5000]] },
  { issuer: 'GOOGL US Equity', spread: 40, issues: [[1.1, '2030-08-15', '2020-08-15', 1500], [5.25, '2055-05-15', '2025-05-15', 3000]] },
  { issuer: 'META US Equity', spread: 75, issues: [[4.8, '2030-05-15', '2025-05-15', 2000], [5.6, '2053-05-15', '2023-05-15', 2500]] },
  { issuer: 'ORCL US Equity', spread: 160, issues: [[2.875, '2031-03-25', '2021-03-25', 3250], [6.9, '2052-11-09', '2022-11-09', 3000]] },
  { issuer: 'IBM US Equity', spread: 90, issues: [[3.5, '2029-05-15', '2019-05-15', 3000], [4.25, '2049-05-15', '2019-05-15', 2500]] },
  { issuer: 'INTC US Equity', spread: 165, issues: [[5.2, '2033-02-10', '2023-02-10', 2250], [5.7, '2053-02-10', '2023-02-10', 2000]] },
  { issuer: 'JPM US Equity', spread: 85, issues: [[4.25, '2029-10-01', '2019-10-01', 2500], [5.35, '2034-06-01', '2023-06-01', 3000]] },
  { issuer: 'BAC US Equity', spread: 95, issues: [[4.45, '2030-03-03', '2020-03-03', 2000], [5.29, '2034-04-25', '2023-04-25', 3500]] },
  { issuer: 'GS US Equity', spread: 105, issues: [[3.8, '2030-03-15', '2020-03-15', 2000], [6.75, '2037-10-01', '2007-10-01', 4500]] },
  { issuer: 'T US Equity', spread: 140, issues: [[4.35, '2029-03-01', '2019-03-01', 2500], [3.65, '2059-09-15', '2020-09-15', 6000]] },
  { issuer: 'VZ US Equity', spread: 130, issues: [[4.016, '2029-12-03', '2019-12-03', 4000], [2.987, '2056-10-30', '2020-10-30', 4500]] },
  { issuer: 'XOM US Equity', spread: 60, issues: [[2.61, '2030-10-15', '2020-10-15', 2000], [4.327, '2050-03-19', '2020-03-19', 3000]] },
  { issuer: 'CVX US Equity', spread: 55, issues: [[2.236, '2030-05-11', '2020-05-11', 2250]] },
  { issuer: 'PFE US Equity', spread: 90, issues: [[4.75, '2033-05-19', '2023-05-19', 3500], [5.3, '2063-05-19', '2023-05-19', 2000]] },
  { issuer: 'BA US Equity', spread: 190, issues: [[5.15, '2030-05-01', '2020-05-01', 4500], [5.805, '2050-05-01', '2020-05-01', 4000]] },
  { issuer: 'WMT US Equity', spread: 40, issues: [[3.7, '2028-06-26', '2018-06-26', 2750], [4.05, '2048-06-29', '2018-06-29', 3000]] },
  { issuer: 'KO US Equity', spread: 55, issues: [[3.45, '2030-03-25', '2020-03-25', 1500], [2.6, '2050-06-01', '2020-06-01', 1250]] },
];

/** Interpolation legs on the US generic curve for a maturity in years. */
export function usLegs(years: number): { id: string; w: number }[] {
  const us = RATES.filter((r) => r.curve === 'US').sort((a, b) => a.tenor! - b.tenor!);
  if (years <= us[0].tenor!) return [{ id: us[0].id, w: 1 }];
  for (let i = 1; i < us.length; i++) {
    const lo = us[i - 1];
    const hi = us[i];
    if (years <= hi.tenor!) {
      const w = (years - lo.tenor!) / (hi.tenor! - lo.tenor!);
      return [
        { id: lo.id, w: 1 - w },
        { id: hi.id, w },
      ];
    }
  }
  return [{ id: us[us.length - 1].id, w: 1 }];
}

export function compositeRating(spread: number): string {
  if (spread < 40) return 'AA+';
  if (spread < 50) return 'AA';
  if (spread < 60) return 'AA-';
  if (spread < 80) return 'A+';
  if (spread < 95) return 'A';
  if (spread < 110) return 'A-';
  if (spread < 135) return 'BBB+';
  if (spread < 160) return 'BBB';
  if (spread < 200) return 'BBB-';
  return 'BB+';
}

const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}`;

export function buildCorporates(today: Date): SecurityDef[] {
  const out: SecurityDef[] = [];
  for (const g of ISSUES) {
    const eq = EQUITIES.find((e) => e.id === g.issuer)!;
    const root = eq.ticker.split(' ')[0];
    for (const [coupon, maturity, issue, amount] of g.issues) {
      const years = (Date.parse(`${maturity}T00:00:00Z`) - today.getTime()) / (365.25 * 86_400_000);
      if (years <= 0.05) continue;
      const termAdj = 0.75 + 0.35 * Math.min(1, years / 15);
      const spread = Math.round(g.spread * termAdj);
      const ticker = `${root} ${coupon} ${mdy(maturity)}`;
      out.push({
        id: `${ticker} Corp`,
        ticker,
        yk: 'Corp',
        name: `${eq.name.toUpperCase()} ${coupon}% ${maturity.slice(0, 4)}`,
        cls: 'bond',
        ccy: 'USD',
        country: 'US',
        region: 'Americas',
        px: 100,
        vol: 0.6,
        dec: 3,
        quote: 'price',
        tenor: Math.round(years * 10) / 10,
        alias: [root],
        bond: {
          coupon,
          maturity,
          issue,
          legs: usLegs(years),
          spread,
          freq: 2,
          issuer: g.issuer,
          issuerRef: eq.px,
          amount,
          rating: compositeRating(g.spread),
          seniority: g.issuer.startsWith('JPM') || g.issuer.startsWith('BAC') || g.issuer.startsWith('GS') ? 'Sr Unsecured (HoldCo)' : 'Sr Unsecured',
        },
      });
    }
  }
  return out;
}

/** Equity index futures: generic first contracts priced at fair value to the index. */
export function buildFutures(): SecurityDef[] {
  const F: [string, string, string, string, number, number, number, number | string, string, string, number, boolean?][] = [
    ['ES1', 'SPX Index', 'S&P500 EMINI FUT', 'CME', 50, 0.25, 0.013, 'USGG3M Index', 'USD', 'US', 1_500_000],
    ['NQ1', 'NDX Index', 'NASDAQ 100 E-MINI', 'CME', 20, 0.25, 0.007, 'USGG3M Index', 'USD', 'US', 600_000],
    ['DM1', 'INDU Index', 'DJIA MINI e-CBOT', 'CBOT', 5, 1, 0.017, 'USGG3M Index', 'USD', 'US', 150_000],
    ['RTY1', 'RTY Index', 'RUSSELL 2000 E-MINI', 'CME', 50, 0.1, 0.014, 'USGG3M Index', 'USD', 'US', 140_000],
    ['VG1', 'SX5E Index', 'EURO STOXX 50', 'Eurex', 10, 1, 0.031, 2.0, 'EUR', 'EU', 900_000],
    ['GX1', 'DAX Index', 'DAX INDEX FUTURE', 'Eurex', 25, 1, 0, 2.0, 'EUR', 'DE', 90_000],
    ['Z 1', 'UKX Index', 'FTSE 100 IDX FUT', 'ICE Futures Europe', 10, 0.5, 0.036, 3.75, 'GBP', 'GB', 80_000],
    ['CF1', 'CAC Index', 'CAC40 10 EURO FUT', 'Euronext', 10, 0.5, 0.03, 2.0, 'EUR', 'FR', 70_000],
    ['NK1', 'NKY Index', 'NIKKEI 225 (OSE)', 'Osaka Exchange', 1000, 10, 0.018, 1.0, 'JPY', 'JP', 50_000],
    ['HI1', 'HSI Index', 'HANG SENG IDX FUT', 'HKEX', 50, 1, 0.035, 'USGG3M Index', 'HKD', 'HK', 120_000, true],
    ['XP1', 'AS51 Index', 'SPI 200 FUTURES', 'ASX', 25, 1, 0.037, 3.6, 'AUD', 'AU', 30_000],
  ];
  return F.map(([t, und, name, exch, mult, tick, q, rate, ccy, country, adv, monthly]) => {
    const region = country === 'US' ? 'Americas' : ['JP', 'HK', 'AU'].includes(country) ? 'APAC' : 'EMEA';
    return {
      id: `${t} Index`,
      ticker: t,
      yk: 'Index',
      name: `Generic 1st '${t.replace(/1$/, '').trim()}' Future · ${name}`,
      cls: 'future',
      ccy,
      country,
      region,
      exch,
      px: 0,
      vol: 0.18,
      dec: tick < 1 ? 2 : 0,
      quote: 'price',
      adv,
      alias: [t.replace(/\s+/g, '')],
      fut: { underlying: und, exch, multiplier: mult, tick, divYield: q, rate, monthly },
    } satisfies SecurityDef;
  });
}
