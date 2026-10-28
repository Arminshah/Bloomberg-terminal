// Compare the app's BQ and DES figures with independent references (Nasdaq, Massive, Tiingo).
const fs = require('node:fs');
const [outDir, refDir, ...tickers] = process.argv.slice(2);
const body = (f) => { const t = fs.readFileSync(f, 'utf8').split('\n'); const i = t.indexOf('GO'); return t.slice(i + 1); };
const after = (lines, label) => { const i = lines.findIndex((l) => l.trim() === label); return i >= 0 ? lines[i + 1].trim() : undefined; };
const big = (s) => { if (!s) return NaN; const m = /(-?[\d,.]+)\s*([KMBT])?/.exec(s); if (!m) return NaN; return Number(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] ?? 1); };
const num = (s) => (s == null ? NaN : Number(String(s).replace(/[$,%]/g, '')));
const rows = [];
const check = (t, screen, field, app, ref, tol, refName) => {
  const diff = Number.isFinite(app) && Number.isFinite(ref) && ref !== 0 ? (app / ref - 1) * 100 : NaN;
  const ok = Number.isFinite(diff) ? Math.abs(diff) <= tol : 'n/a';
  rows.push({ t, screen, field, app, ref, diffPct: Number.isFinite(diff) ? diff.toFixed(3) : '', ok, refName });
};
for (const t of tickers) {
  const ref = JSON.parse(fs.readFileSync(`${refDir}/${t}.json`, 'utf8'));
  const nq = ref.nasdaqSummary?.data?.summaryData ?? {};
  const info = ref.nasdaqInfo?.data?.primaryData ?? {};
  const mp = ref.massivePrev?.results?.[0] ?? {};
  const ti = Array.isArray(ref.tiingo) ? ref.tiingo : [];
  const last = ti[ti.length - 1];
  const bq = body(`${outDir}/${t}_US_Equity_BQ.txt`);
  check(t, 'BQ', 'Last', num(after(bq, 'Last price')), num(info.lastSalePrice), 0.001, 'Nasdaq last sale');
  check(t, 'BQ', 'Open', num(after(bq, 'Open')), mp.o, 0.05, 'Massive daily bar');
  check(t, 'BQ', 'High', num(after(bq, 'Day high')), mp.h, 0.01, 'Massive daily bar');
  check(t, 'BQ', 'Low', num(after(bq, 'Day low')), mp.l, 0.01, 'Massive daily bar');
  check(t, 'BQ', 'Prev close', num(after(bq, 'Previous close')), num(nq.PreviousClose?.value), 0.001, 'Nasdaq previous close');
  check(t, 'BQ', 'Volume', big(after(bq, 'Volume')), num(info.volume), 0.5, 'Nasdaq consolidated volume');
  // 30 sessions' mean volume (Tiingo, consolidated).
  const v30 = ti.slice(-30).reduce((a, b) => a + b.volume, 0) / 30;
  check(t, 'BQ', 'Avg vol 30D', big(after(bq, 'Avg vol 30D')), v30, 1, 'Tiingo, mean of 30 sessions');
  const rng = after(bq, '52-week range')?.split(/\s*–\s*/).map(num) ?? [];
  const hl = (nq.FiftTwoWeekHighLow?.value ?? '').split('/').map(num);
  check(t, 'BQ', '52w low', rng[0], hl[1], 0.01, 'Nasdaq 52-week');
  check(t, 'BQ', '52w high', rng[1], hl[0], 0.01, 'Nasdaq 52-week');
  check(t, 'BQ', 'Market cap', big(after(bq, 'Market cap')), num(nq.MarketCap?.value), 1.5, 'Nasdaq market cap');
  check(t, 'BQ', 'Dividend yield', num(after(bq, 'Dividend yield 12M')), num(nq.Yield?.value), 5, 'Nasdaq current yield');
  // Realised volatility, 30 sessions of log returns, annualised with 252.
  const c = ti.slice(-31).map((x) => x.close);
  const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
  check(t, 'BQ', 'Realised vol 30D', num(after(bq, 'Realised vol 30D')), sd, 3, 'Tiingo closes, 30 log returns');
  const des = body(`${outDir}/${t}_US_Equity_DES.txt`);
  const ytd = after(des, 'YTD Change/%');
  const ye = ti.filter((x) => x.date < '2026-01-01').pop();
  if (ytd && ye) {
    const [a, p] = ytd.split('/').map(num);
    check(t, 'DES', 'YTD change', a, last.close - ye.close, 0.5, `Tiingo close ${ye.date.slice(0, 10)}`);
    check(t, 'DES', 'YTD %', p, (last.close / ye.close - 1) * 100, 0.5, 'Tiingo');
  }
  const tr = after(des, '19) 12M Tot Ret') ?? after(des, '12M Tot Ret');
  const yAgo = ti.filter((x) => x.date.slice(0, 10) <= '2025-10-27').pop();
  if (yAgo) check(t, 'DES', '12M total return', num(tr), (last.adjClose / yAgo.adjClose - 1) * 100, 1, `Tiingo adjusted ${yAgo.date.slice(0, 10)}`);
  const so = after(des, 'Shrs Out/Float');
  const shares = ref.massiveDetails?.results?.share_class_shares_outstanding;
  if (so) check(t, 'DES', 'Shares out', big(so.split('/')[0]), shares, 1.5, 'Massive share class shares');
  const pe = after(des, 'P/E');
  const sdata = ref.nasdaqDividends?.data;
  check(t, 'DES', 'P/E', num(pe), num(sdata?.dividendHeaderValues?.find((x) => x.label === 'P/E Ratio')?.value), 1, 'Nasdaq P/E');
  const si = after(des, 'SI/% of Float');
  const sr = ref.nasdaqShort?.data?.shortInterestTable?.rows?.[0];
  if (si && sr) check(t, 'DES', 'Short interest', big(si.split('/')[0]), num(sr.interest), 0.5, `Nasdaq/FINRA ${sr.settlementDate}`);
}
const bad = rows.filter((r) => r.ok === false);
for (const r of rows) console.log([r.ok === true ? 'ok ' : r.ok === false ? 'BAD' : '-- ', r.t.padEnd(5), r.screen.padEnd(4), r.field.padEnd(17), String(r.app).padEnd(14), String(Number.isFinite(r.ref) ? +r.ref.toFixed(4) : r.ref).padEnd(16), r.diffPct.padStart(9), ' ', r.refName].join(' '));
console.log(`${rows.length} checks, ${bad.length} off`);
