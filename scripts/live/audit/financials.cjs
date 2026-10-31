// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// FA key stats against SEC companyfacts: each annual column and the LTM column.
const fs = require('node:fs');
const [outDir, refDir, ...tickers] = process.argv.slice(2);
const CONCEPTS = {
  Revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
  'Gross Profit': ['GrossProfit'],
  'Net Income': ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'],
  'Diluted EPS': ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
  'Cash from Operations': ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  'Capital Expenditures': ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
};
const num = (s) => { if (s == null || s.trim() === '') return NaN; return Number(s.replace(/,/g, '')); };
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
let bad = 0, n = 0;
for (const t of tickers) {
  const ref = JSON.parse(fs.readFileSync(`${refDir}/${t}.json`, 'utf8'));
  const g = ref.secFacts?.facts?.['us-gaap'] ?? {};
  const lines = fs.readFileSync(`${outDir}/${t}_US_Equity_FA.txt`, 'utf8').split('\n');
  const h = lines.findIndex((l) => l.startsWith('In Millions'));
  const ends = lines[h + 1].split('\t').slice(1);
  const labels = lines[h].split('\t').slice(1);
  const rowOf = (name) => lines.slice(h, h + 22).find((l) => l.split('\t')[0] === name)?.split('\t').slice(1) ?? [];
  // Durations of 12 months (annual) or ~3 months (quarter), by end date.
  const facts = (key) => {
    for (const c of CONCEPTS[key]) {
      const u = g[c]?.units; if (!u) continue;
      const vals = u['USD'] ?? u['USD/shares'];
      if (vals?.length) return { c, vals };
    }
    return null;
  };
  for (const key of Object.keys(CONCEPTS)) {
    const f = facts(key);
    const row = rowOf(key);
    labels.forEach((lab, i) => {
      if (/Est/.test(lab) || !ends[i]) return;
      const [d, m, y] = ends[i].split('/');
      const end = `${y}-${m}-${d}`;
      const app = num(row[i]);
      if (!f) return;
      const near = (x) => Math.abs(days(x.end, end)) <= 7;
      let refV = NaN, how = '';
      const annual = f.vals.filter((x) => near(x) && x.start && days(x.start, x.end) > 350 && days(x.start, x.end) < 380);
      if (annual.length) { refV = annual[annual.length - 1].val; how = 'annual'; }
      else if (/LTM/.test(lab)) {
        // LTM: last fiscal year + year-to-date now - year-to-date a year before.
        const ytd = f.vals.filter((x) => near(x) && x.start && days(x.start, x.end) < 300).sort((a, b) => days(b.start, b.end) - days(a.start, a.end))[0];
        if (ytd) {
          const len = days(ytd.start, ytd.end);
          const prevEnd = new Date(Date.parse(ytd.end) - 365 * 864e5).toISOString().slice(0, 10);
          const prev = f.vals.filter((x) => Math.abs(days(x.end, prevEnd)) <= 7 && x.start && Math.abs(days(x.start, x.end) - len) < 10).pop();
          const fyEnd = new Date(Date.parse(ytd.start) - 864e5).toISOString().slice(0, 10);
          const fy = f.vals.filter((x) => Math.abs(days(x.end, fyEnd)) <= 7 && x.start && days(x.start, x.end) > 350).pop();
          if (prev && fy) { refV = fy.val + ytd.val - prev.val; how = `LTM ${fy.end}+${ytd.end}`; }
        }
      }
      if (!Number.isFinite(refV)) return;
      const isEps = key === 'Diluted EPS';
      const refShown = isEps ? refV : (key === 'Capital Expenditures' ? -refV : refV) / 1e6;
      n++;
      const tol = isEps ? 0.011 : Math.max(0.6, Math.abs(refShown) * 0.002);
      const ok = Number.isFinite(app) ? Math.abs(app - refShown) <= tol : false;
      if (!ok) bad++;
      if (!ok || process.env.ALL) console.log(`${ok ? 'ok ' : 'BAD'} ${t.padEnd(5)} ${key.padEnd(21)} ${lab.padEnd(14)} app ${String(row[i] ?? '').padEnd(10)} sec ${(+refShown.toFixed(2)).toString().padEnd(10)} ${f.c} ${how}`);
    });
  }
}
console.log(`${n} checks, ${bad} off`);
