// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// For many companies: the statements feed's annual revenue, net income to common and EPS against the filings.
const fs = require('node:fs');
const [outDir, ...tickers] = process.argv.slice(2);
const secUA = { 'User-Agent': process.env.SEC_USER_AGENT, Accept: 'application/json' };
const get = async (url, headers) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers }); if (r.ok) return await r.json(); } catch {} await new Promise((r) => setTimeout(r, 1500)); } return null; };
const REV = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'];
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const latestAnnual = (g, concepts, unit) => {
  const out = new Map();
  for (const c of concepts) {
    const rows = g[c]?.units?.[unit]; if (!rows) continue;
    const groups = new Map();
    for (const r of rows) { if (!r.start || days(r.start, r.end) < 350 || days(r.start, r.end) > 380) continue; if (!(r.fp === 'FY' || /^10-K|^20-F|^40-F/.test(r.form))) continue; const k = r.end; (groups.get(k) ?? groups.set(k, []).get(k)).push(r); }
    for (const [k, gr] of groups) { if (out.has(k)) continue; gr.sort((a, b) => a.filed.localeCompare(b.filed)); out.set(k, { val: gr[gr.length - 1].val, first: gr[0].val, c, filed: gr[gr.length - 1].filed }); }
  }
  return out;
};
(async () => {
  const tick = await get('https://www.sec.gov/files/company_tickers.json', secUA);
  for (const t of tickers) {
    const cik = Object.values(tick).find((v) => v.ticker === t.replace('.', '-'))?.cik_str;
    const y = await get(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t.replace('.', '-')}?type=annualTotalRevenue,annualNetIncomeCommonStockholders,annualDilutedEPS&period1=1483228800&period2=1800000000`, { 'User-Agent': 'Mozilla/5.0' });
    const sec = cik ? await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, secUA) : null;
    fs.writeFileSync(`${outDir}/${t}.json`, JSON.stringify({ y, sec: sec ? { 'us-gaap': Object.fromEntries(Object.entries(sec.facts?.['us-gaap'] ?? {}).filter(([k]) => [...REV, 'NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLoss', 'EarningsPerShareDiluted'].includes(k))) } : null }));
    const yv = (k) => new Map(((y?.timeseries?.result ?? []).find((r) => r.meta.type[0] === k)?.[k] ?? []).filter(Boolean).map((x) => [x.asOfDate, x.reportedValue.raw]));
    const yr = yv('annualTotalRevenue'), yn = yv('annualNetIncomeCommonStockholders'), ye = yv('annualDilutedEPS');
    const g = sec?.facts?.['us-gaap'] ?? {};
    const sr = latestAnnual(g, REV, 'USD'), sn = latestAnnual(g, ['NetIncomeLossAvailableToCommonStockholdersBasic'], 'USD'), se = latestAnnual(g, ['EarningsPerShareDiluted'], 'USD/shares');
    const near = (m, d) => [...m.entries()].find(([k]) => Math.abs(days(k, d)) <= 10)?.[1];
    for (const [d, rev] of yr) {
      const s = near(sr, d), n = near(sn, d), e = near(se, d);
      const ni = yn.get(d);
      const niAgree = n && ni != null && Math.abs(n.val - ni) <= 0.01 * Math.max(Math.abs(n.val), Math.abs(ni), 1);
      const revDiff = s ? (rev / s.val - 1) * 100 : NaN;
      const eps = ye.get(d);
      const epsDiff = e && eps != null ? eps - e.val : NaN;
      const flags = [];
      if (Math.abs(revDiff) > 1) flags.push(`REV feed ${(rev / 1e6).toFixed(0)} filed ${(s.val / 1e6).toFixed(0)} (${revDiff.toFixed(1)}%, ${s.c}${s.first !== s.val ? ', restated from ' + (s.first / 1e6).toFixed(0) : ''})${niAgree ? ' -> FILED' : ' (NI differs: kept)'}`);
      if (Math.abs(epsDiff) > Math.max(0.015, 0.015 * Math.abs(e?.val ?? 0))) flags.push(`EPS feed ${eps} filed ${e.val}${niAgree ? ' -> FILED' : ''}`);
      if (flags.length) console.log(t.padEnd(6), d, flags.join(' | '));
    }
  }
})();
