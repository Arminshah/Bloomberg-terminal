/**
 * Calibration snapshot.
 *
 * Pulls daily closes for every instrument that has a calibration symbol and
 * reduces each series to a handful of anchors (last close, 1W, 1M, 3M, 6M,
 * YTD, 1Y, 2Y, 3Y, 5Y), realised volatility and average volume. The app never
 * ships the raw series: it generates its own history through these anchors.
 *
 * Usage: npm run snapshot
 *        npm run snapshot -- --only "APLD US Equity"   (refresh listed ids, keep the rest)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { EQUITIES } from '../src/data/universe/equities.ts';
import { COMMODITIES, CRYPTO, CURRENCIES, INDICES, RATES } from '../src/data/universe/markets.ts';

interface Anchor {
  px: number;
  date: string;
  anchors: [string, number][];
  vol: number;
  adv: number;
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const OFFSETS = [5, 21, 63, 126, 252, 504, 756, 1250];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSeries(symbol: string): Promise<{ t: number[]; c: number[]; v: number[] } | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return null;
      const json = (await res.json()) as {
        chart: { result?: { timestamp: number[]; indicators: { quote: { close: (number | null)[]; volume: (number | null)[] }[] } }[] };
      };
      const r = json.chart.result?.[0];
      if (!r) return null;
      const q = r.indicators.quote[0];
      const t: number[] = [];
      const c: number[] = [];
      const v: number[] = [];
      r.timestamp.forEach((ts, i) => {
        const close = q.close[i];
        if (close == null || !Number.isFinite(close)) return;
        t.push(ts * 1000);
        c.push(close);
        v.push(q.volume[i] ?? 0);
      });
      return { t, c, v };
    } catch {
      await sleep(1000 * 2 ** attempt);
    }
  }
  return null;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function reduce(series: { t: number[]; c: number[]; v: number[] }, additive: boolean): Anchor {
  const n = series.c.length;
  const last = n - 1;
  const anchors: [string, number][] = [];
  for (const off of OFFSETS) {
    const i = last - off;
    if (i >= 0) anchors.push([iso(series.t[i]), round(series.c[i])]);
  }
  // Last close of the previous calendar year (YTD base).
  const year = new Date(series.t[last]).getUTCFullYear();
  for (let i = last; i >= 0; i--) {
    if (new Date(series.t[i]).getUTCFullYear() < year) {
      anchors.push([iso(series.t[i]), round(series.c[i])]);
      break;
    }
  }
  anchors.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const from = Math.max(1, n - 252);
  const rets: number[] = [];
  for (let i = from; i < n; i++) {
    const r = additive ? series.c[i] - series.c[i - 1] : Math.log(series.c[i] / series.c[i - 1]);
    if (Number.isFinite(r)) rets.push(r);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const vols = series.v.slice(-63).filter((x) => x > 0);
  const adv = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  return {
    px: round(series.c[last]),
    date: iso(series.t[last]),
    anchors: anchors.filter(([d]) => d !== iso(series.t[last])),
    vol: Math.round(sd * Math.sqrt(252) * 10000) / 10000,
    adv: Math.round(adv),
  };
}

function round(x: number): number {
  const mag = Math.abs(x);
  const dp = mag >= 1000 ? 2 : mag >= 1 ? 4 : 6;
  return Number(x.toFixed(dp));
}

async function main() {
  const jobs: { key: string; symbol: string; additive: boolean }[] = [];
  for (const s of [...EQUITIES, ...INDICES, ...COMMODITIES, ...CRYPTO, ...RATES]) {
    if (s.yahoo) jobs.push({ key: s.id, symbol: s.yahoo, additive: s.quote === 'yield' });
  }
  for (const c of CURRENCIES) jobs.push({ key: `CCY:${c.code}`, symbol: `${c.code}=X`, additive: false });
  jobs.push({ key: 'DXY Curncy', symbol: 'DX-Y.NYB', additive: false });

  const file = new URL('../src/data/universe/snapshot.json', import.meta.url);
  const onlyAt = process.argv.indexOf('--only');
  const only = onlyAt >= 0 ? new Set(process.argv.slice(onlyAt + 1)) : null;
  const previous = only ? (JSON.parse(readFileSync(file, 'utf8')) as { asOf: string; data: Record<string, Anchor> }) : null;
  const out: Record<string, Anchor> = previous ? { ...previous.data } : {};
  let asOf = previous?.asOf ?? '';
  for (const job of jobs) {
    if (only && !only.has(job.key)) continue;
    const series = await fetchSeries(job.symbol);
    if (!series || series.c.length < 30) {
      console.warn(`skip ${job.key} (${job.symbol})`);
      continue;
    }
    const a = reduce(series, job.additive);
    out[job.key] = a;
    if (job.key === 'SPX Index') asOf = a.date;
    console.log(`${job.key.padEnd(22)} ${String(a.px).padStart(12)}  ${a.date}  vol ${a.vol}`);
    await sleep(350);
  }
  writeFileSync(file, JSON.stringify({ asOf, source: 'Daily closes, reduced to anchors', data: out }, null, 0) + '\n');
  console.log(`wrote ${Object.keys(out).length} instruments as of ${asOf}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
