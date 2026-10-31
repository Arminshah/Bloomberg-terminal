// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Independent reference values for a list of US tickers, saved as JSON (keys from the environment, never printed).
// Usage: node scripts/live/audit/refs.cjs <outdir> AAPL NVDA ...
const fs = require('node:fs');
const [outDir, ...tickers] = process.argv.slice(2);
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)', Accept: 'application/json' };
const get = async (url, headers = UA) => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return await r.json();
      if (r.status === 404) return { error: 404 };
    } catch {}
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return { error: 'failed' };
};
const M = process.env.MASSIVE_API_KEY;
const T = process.env.TIINGO_API_KEY;
const secUA = { 'User-Agent': process.env.SEC_USER_AGENT, Accept: 'application/json' };
(async () => {
  const tick = await get('https://www.sec.gov/files/company_tickers.json', secUA);
  const cikOf = (t) => Object.values(tick).find((v) => v.ticker === t.replace('.', '-'))?.cik_str;
  for (const t of tickers) {
    const nq = (p) => get(`https://api.nasdaq.com/api/quote/${t}/${p}?assetclass=stocks`);
    const ref = { ticker: t, at: new Date().toISOString() };
    ref.massivePrev = await get(`https://api.massive.com/v2/aggs/ticker/${t}/prev?adjusted=true&apiKey=${M}`);
    ref.massiveDetails = await get(`https://api.massive.com/v3/reference/tickers/${t}?apiKey=${M}`);
    ref.massiveSplits = await get(`https://api.massive.com/v3/reference/splits?ticker=${t}&limit=20&apiKey=${M}`);
    ref.massiveDividends = await get(`https://api.massive.com/v3/reference/dividends?ticker=${t}&limit=40&apiKey=${M}`);
    ref.nasdaqInfo = await nq('info');
    ref.nasdaqSummary = await nq('summary');
    ref.nasdaqDividends = await nq('dividends');
    ref.nasdaqShort = await get(`https://api.nasdaq.com/api/quote/${t}/short-interest?assetClass=stocks`);
    ref.tiingo = await get(`https://api.tiingo.com/tiingo/daily/${t}/prices?startDate=2025-10-01&token=${T}`, { 'Content-Type': 'application/json' });
    const cik = cikOf(t);
    ref.cik = cik;
    if (cik) ref.secFacts = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, secUA);
    fs.writeFileSync(`${outDir}/${t}.json`, JSON.stringify(ref));
    console.log(t, Object.entries(ref).filter(([, v]) => v && v.error).map(([k, v]) => `${k}:${v.error}`).join(' ') || 'ok');
  }
})();
