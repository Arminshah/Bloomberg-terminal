#!/usr/bin/env node
// The data audit as one check that can run on a schedule: it captures the desktop app's screens on live data, fetches
// independent references, compares each figure within a stated tolerance and fails loudly when one is beyond it.
//
//   npm run build
//   node scripts/live/audit/check.cjs [--out <dir>] [--tickers AAPL,NVDA] [--skip-capture]
//
// Exit code 0: every comparison passed or was skipped for a stated reason. 1: at least one figure differs beyond its
// tolerance (FAIL). 2: nothing failed, but a reference or the capture could not be checked (BLOCKED: refused key,
// plan limit, rate limit, network policy, outage or malformed answer). A blocked or skipped check is never a pass.
//
// Keys come from the environment only and are never printed: TIINGO_API_KEY, MASSIVE_API_KEY and SEC_USER_AGENT for
// the references; EIA_API_KEY and COINGECKO_API_KEY are optional. See docs/audit-check.md.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const DAY = 86_400_000;
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const TICKERS = (arg('--tickers') ?? 'AAPL,NVDA,JPM,XOM,WMT,LLY,KO,TSLA').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
const OUT = path.resolve(arg('--out') ?? path.join(ROOT, 'audit-out', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')));
const SCREENS = path.join(OUT, 'screens');
fs.mkdirSync(SCREENS, { recursive: true });

/**
 * Each comparison's tolerance and why. `pct` is relative (percent of the reference), `abs` absolute in the figure's
 * unit, `pp` in percentage points; a figure passes within the larger of `pct` and `abs`.
 */
const TOLERANCE = {
  last: { pct: 0.02, abs: 0.011, why: "The session's official close: Yahoo and Tiingo carry the same print; a cent for rounding." },
  open: { pct: 0.05, abs: 0.011, why: 'The official open; sources may take the opening auction or the first trade.' },
  highLow: { pct: 0.05, abs: 0.011, why: "The session's high and low; a stray odd-lot print can differ between consolidated feeds." },
  prevClose: { pct: 0.02, abs: 0.011, why: 'The previous official close.' },
  volume: { pct: 1, why: 'Consolidated volume; late trade reports keep adding for an hour after the close.' },
  avgVolume: { pct: 1.5, why: 'The mean of 30 sessions of consolidated volume.' },
  range52: { pct: 0.1, abs: 0.011, why: "The 52-week high and low; the window's first day can differ by one session." },
  marketCap: { pct: 2, why: 'Price times shares outstanding; the sources count shares on different dates.' },
  realisedVol: { pct: 3, why: '30 daily log returns, annualised with 252; rounding of the closes.' },
  ytd: { pp: 0.1, why: "The change since the previous year's last close." },
  totalReturn: { pp: 1, why: 'Twelve months with dividends reinvested; sources reinvest on the ex-date or the pay date.' },
  shares: { pct: 1.5, why: 'Shares outstanding; the counts are dated differently.' },
  shortInterest: { pct: 0.5, why: "FINRA's short interest for the same settlement." },
  dividend: { abs: 0.0005, why: "Each dividend the screen shows: the same dates, the amount to a twentieth of a cent (Nasdaq's as-paid amount on today's share basis)." },
  statement: { pct: 0.2, abs: 0.6, why: 'Annual and last-twelve-month figures against the SEC filings, in millions (EPS within 0.011).' },
  crypto: { pct: 1.5, why: "Bitcoin on one exchange (Kraken) against CoinGecko's aggregate, a few minutes apart." },
  gasStorage: { abs: 0, why: "EIA's weekly storage report against EIA's own data series for the same week: exact." },
};

const rows = [];
const add = (r) => rows.push(r);
const FLAGGED_ON_SCREEN = Symbol('flagged');
/** A figure on screen, or the marker for a cell that says "Sources disagree". */
const shown = (text, parse) => (/^Sources disagree$/.test((text ?? '').trim()) ? FLAGGED_ON_SCREEN : parse(text));
/** A comparison: PASS within tolerance, FAIL beyond it, SKIP when either side has no figure (with the reason). */
function compare(area, item, field, app, ref, tol, refName, note) {
  // The screen itself says the sources disagree on this figure: reported, not hidden and not failed.
  if (app === FLAGGED_ON_SCREEN) {
    add({ status: 'FLAGGED', area, item, field, ref, refName, detail: 'the screen shows "Sources disagree"' });
    return;
  }
  if (!Number.isFinite(app) || !Number.isFinite(ref)) {
    add({ status: 'SKIP', area, item, field, app, ref, refName, detail: note ?? (!Number.isFinite(app) ? 'the screen shows no figure' : 'the reference gives no figure') });
    return;
  }
  const diff = app - ref;
  const allowed = Math.max(tol.abs ?? 0, tol.pct != null ? (Math.abs(ref) * tol.pct) / 100 : 0, tol.pp ?? 0);
  add({ status: Math.abs(diff) <= allowed + 1e-12 ? 'PASS' : 'FAIL', area, item, field, app, ref, diff, allowed, refName, ...(note ? { detail: note } : {}) });
}
const blocked = (area, item, field, res, refName) => add({ status: 'BLOCKED', area, item, field, refName, kind: res.kind, detail: res.detail });
const skip = (area, item, field, detail) => add({ status: 'SKIP', area, item, field, detail });

// ------------------------------------------------------------------ references

const redact = (s) => String(s).replace(/((?:apiKey|api_key|token|key)=)[^&\s]+/gi, '$1<key>');
/**
 * A reference request, its failure classified: auth (key refused), entitlement (plan does not cover it), rate-limit,
 * network-policy (the network refused the host), network, outage (5xx), no-data (404), malformed (not the expected
 * JSON). Never retried on a refusal; retried twice on a network error or an outage.
 */
async function get(url, headers = {}, check = () => null, init = {}) {
  let last;
  for (let i = 0; i < 3; i++) {
    let r;
    try {
      r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(45_000) });
    } catch (e) {
      const msg = `${e?.message ?? e} ${e?.cause?.message ?? ''} ${e?.cause?.code ?? ''}`;
      last = /\b40[37]\b|proxy|policy/i.test(msg) ? { kind: 'network-policy', detail: redact(msg).trim().slice(0, 160) } : { kind: 'network', detail: redact(msg).trim().slice(0, 160) };
      if (last.kind === 'network-policy') return last;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
      continue;
    }
    const text = await r.text();
    const body = text.slice(0, 300).replace(/\s+/g, ' ');
    if (r.status === 401) return { kind: 'auth', detail: `HTTP 401 ${redact(body).slice(0, 120)}` };
    if (r.status === 402) return { kind: 'entitlement', detail: `HTTP 402 ${redact(body).slice(0, 120)}` };
    if (r.status === 403) return /plan|subscri|entitle|upgrade|not authorized|NOT_AUTHORIZED|premium/i.test(body) ? { kind: 'entitlement', detail: `HTTP 403 ${redact(body).slice(0, 120)}` } : { kind: 'auth', detail: `HTTP 403 ${redact(body).slice(0, 120)}` };
    if (r.status === 429) return { kind: 'rate-limit', detail: 'HTTP 429' };
    if (r.status === 404) return { kind: 'no-data', detail: 'HTTP 404' };
    if (r.status >= 500) {
      last = { kind: 'outage', detail: `HTTP ${r.status}` };
      await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
      continue;
    }
    if (r.status !== 200) return { kind: 'malformed', detail: `HTTP ${r.status} ${redact(body).slice(0, 120)}` };
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { kind: 'malformed', detail: `not JSON: ${redact(body).slice(0, 80)}` };
    }
    const problem = check(json);
    return problem ? { kind: problem.kind ?? 'malformed', detail: redact(problem.detail ?? problem) } : { ok: true, json };
  }
  return last;
}

const env = (k) => (process.env[k] ?? '').trim();
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)', Accept: 'application/json' };
const iso = (t) => new Date(t).toISOString().slice(0, 10);

async function tiingo(t, since) {
  const key = env('TIINGO_API_KEY');
  if (!key) return { kind: 'no-key', detail: 'TIINGO_API_KEY is not set' };
  return get(`https://api.tiingo.com/tiingo/daily/${t.replace('.', '-')}/prices?startDate=${since}&token=${key}`, { 'Content-Type': 'application/json' }, (j) =>
    Array.isArray(j) ? (j.length ? null : { kind: 'no-data', detail: 'no bars' }) : { detail: j?.detail ?? 'not a list of bars' },
  );
}
const nasdaq = (t, part) =>
  get(`https://api.nasdaq.com/api/quote/${t.replace('-', '.')}/${part}`, BROWSER, (j) => (j?.status?.rCode === 200 && j.data ? null : { kind: j?.status?.rCode === 400 ? 'no-data' : 'malformed', detail: JSON.stringify(j?.status?.bCodeMessage ?? j?.message ?? '').slice(0, 120) }));
async function massive(t) {
  const key = env('MASSIVE_API_KEY');
  if (!key) return { kind: 'no-key', detail: 'MASSIVE_API_KEY is not set' };
  return get(`https://api.massive.com/v3/reference/tickers/${t}?apiKey=${key}`, {}, (j) => (j?.results ? null : { kind: /auth|key/i.test(j?.error ?? j?.message ?? '') ? 'auth' : 'malformed', detail: String(j?.error ?? j?.message ?? j?.status ?? '').slice(0, 120) }));
}
let secTickers;
async function secFacts(t) {
  const ua = env('SEC_USER_AGENT');
  if (!ua) return { kind: 'no-key', detail: 'SEC_USER_AGENT is not set' };
  const h = { 'User-Agent': ua, Accept: 'application/json' };
  secTickers ??= await get('https://www.sec.gov/files/company_tickers.json', h);
  if (!secTickers.ok) return secTickers;
  const cik = Object.values(secTickers.json).find((v) => v.ticker === t.replace('.', '-'))?.cik_str;
  if (!cik) return { kind: 'no-data', detail: 'ticker not in the SEC list' };
  return get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, h, (j) => (j?.facts ? null : { detail: 'no facts' }));
}

// ------------------------------------------------------------------ the screens

const screenFile = (cmd) => path.join(SCREENS, `${cmd.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)}.txt`);
function lines(cmd) {
  const f = screenFile(cmd);
  if (!fs.existsSync(f)) return null;
  const t = fs.readFileSync(f, 'utf8').split('\n');
  const i = t.indexOf('GO');
  return i >= 0 ? t.slice(i + 1) : t;
}
const after = (ls, label) => {
  const i = ls?.findIndex((l) => l.trim() === label) ?? -1;
  return i >= 0 ? ls[i + 1]?.trim() : undefined;
};
const afterMatch = (ls, re) => {
  const i = ls?.findIndex((l) => re.test(l.trim())) ?? -1;
  return i >= 0 ? ls[i + 1]?.trim() : undefined;
};
const big = (s) => {
  const m = /(-?[\d,.]+)\s*([KMBT])?/.exec(s ?? '');
  return m ? Number(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] ?? 1) : NaN;
};
const num = (s) => (s == null || String(s).trim() === '' ? NaN : Number(String(s).replace(/[$,%+]/g, '')));
/** dd/mm/yy on screen to YYYY-MM-DD. */
const screenDay = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec((s ?? '').trim());
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : '';
};
/** mm/dd/yyyy (Nasdaq) to YYYY-MM-DD. */
const usDay = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s ?? '').trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
};

function capture() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) return { kind: 'setup', detail: 'dist/ is missing: run npm run build first' };
  const cmds = [...TICKERS.flatMap((t) => ['BQ', 'DES', 'DVD', 'FA'].map((f) => `${t} US Equity ${f}`)), 'XBTUSD Curncy BQ', 'NGAS'];
  const list = path.join(OUT, 'commands.json');
  fs.writeFileSync(list, JSON.stringify(cmds));
  const node = [path.join(ROOT, 'scripts/live/capture.cjs'), list, SCREENS, '12000', '90000'];
  const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
  const r = spawnSync(useXvfb ? 'xvfb-run' : process.execPath, useXvfb ? ['-a', process.execPath, ...node] : node, { cwd: ROOT, env: { ...process.env, YAHOO_PRICES_ENABLED: 'true' }, encoding: 'utf8', timeout: 60 * 60_000 });
  fs.writeFileSync(path.join(OUT, 'capture.log'), redact(`${r.stdout ?? ''}\n${r.stderr ?? ''}`));
  if (r.error) return { kind: 'setup', detail: String(r.error.message).slice(0, 160) };
  return r.status === 0 ? { ok: true } : { kind: 'setup', detail: `capture exited with ${r.status}; see capture.log` };
}

// ------------------------------------------------------------------ comparisons

async function equity(t) {
  const bq = lines(`${t} US Equity BQ`);
  const des = lines(`${t} US Equity DES`);
  if (!bq) return skip('quote', t, 'all', 'the quote screen was not captured');
  const now = Date.now();
  const bars = await tiingo(t, iso(now - 420 * DAY));
  const summary = await nasdaq(t, 'summary?assetclass=stocks');
  // The session the screen shows: a date when the session is over, a time while it trades.
  const shownDay = screenDay(after(bq, 'Last update'));
  if (!bars.ok) {
    for (const f of ['Last', 'Open', 'High', 'Low', 'Previous close', 'Volume', 'Avg vol 30D', 'Realised vol 30D', 'YTD %', '12M total return']) {
      if (bars.kind === 'no-key') skip('quote', t, f, bars.detail);
      else blocked('quote', t, f, bars, 'Tiingo');
    }
  } else {
    const b = bars.json.map((x) => ({ ...x, day: x.date.slice(0, 10) }));
    const at = shownDay ? b.findIndex((x) => x.day === shownDay) : -1;
    const sessionOver = !!shownDay;
    if (!sessionOver) for (const f of ['Last', 'Open', 'High', 'Low', 'Volume']) skip('quote', t, f, 'the session was trading when captured');
    else if (at < 0) for (const f of ['Last', 'Open', 'High', 'Low', 'Volume']) skip('quote', t, f, `Tiingo has no bar for ${shownDay} yet`);
    else {
      const d = b[at];
      compare('quote', t, 'Last', num(after(bq, 'Last price')), d.close, TOLERANCE.last, `Tiingo close ${d.day}`);
      compare('quote', t, 'Open', num(after(bq, 'Open')), d.open, TOLERANCE.open, `Tiingo open ${d.day}`);
      compare('quote', t, 'High', num(after(bq, 'Day high')), d.high, TOLERANCE.highLow, `Tiingo high ${d.day}`);
      compare('quote', t, 'Low', num(after(bq, 'Day low')), d.low, TOLERANCE.highLow, `Tiingo low ${d.day}`);
      compare('quote', t, 'Volume', big(after(bq, 'Volume')), d.volume, TOLERANCE.volume, `Tiingo volume ${d.day}`);
    }
    // The previous close: the session before the one shown (today's, while it trades).
    const ref = sessionOver ? (at > 0 ? b[at - 1] : undefined) : b.filter((x) => x.day < iso(now)).pop();
    if (ref) compare('quote', t, 'Previous close', num(after(bq, 'Previous close')), ref.close, TOLERANCE.prevClose, `Tiingo close ${ref.day}`);
    else skip('quote', t, 'Previous close', 'no reference session');
    // 30 sessions ending with the last finished one.
    const end = sessionOver && at >= 0 ? at : b.findLastIndex((x) => x.day < iso(now));
    if (end >= 30) {
      const w = b.slice(end - 29, end + 1);
      compare('quote', t, 'Avg vol 30D', big(after(bq, 'Avg vol 30D')), w.reduce((a, x) => a + x.volume, 0) / 30, TOLERANCE.avgVolume, `Tiingo, 30 sessions to ${b[end].day}`);
      const c = b.slice(end - 30, end + 1).map((x) => x.close);
      const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
      const m = r.reduce((a, x) => a + x, 0) / r.length;
      const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
      // While the session trades the screen's last return is the live price's.
      if (sessionOver) compare('quote', t, 'Realised vol 30D', num(after(bq, 'Realised vol 30D')), sd, TOLERANCE.realisedVol, `Tiingo closes to ${b[end].day}`);
      else skip('quote', t, 'Realised vol 30D', 'the session was trading when captured');
    }
    // The 52-week range from the daily highs and lows, adjusted for splits only (as quotes give it). Sources start the
    // window a year or 52 weeks back: the screen passes if it matches either.
    if (end >= 0) {
      const split = b.map((_, i) => b.slice(i + 1).reduce((f, x) => f * (x.splitFactor || 1), 1));
      // Counted back from the session shown, or from today while it trades.
      const anchor = Date.parse(sessionOver ? b[end].day : iso(now));
      const window = (days) => b.map((x, i) => ({ ...x, i })).filter((x) => x.i <= end && Date.parse(x.day) >= anchor - days * DAY);
      const range = (after(bq, '52-week range') ?? '').split(/\s*[–-]\s*/).map(num);
      for (const [field, shown, pick] of [['52-week low', range[0], (w) => Math.min(...w.map((x) => x.low / split[x.i]))], ['52-week high', range[1], (w) => Math.max(...w.map((x) => x.high / split[x.i]))]]) {
        const a = pick(window(364));
        const y = pick(window(365));
        const ref = Math.abs(shown - a) <= Math.abs(shown - y) ? a : y;
        compare('quote', t, field, shown, ref, TOLERANCE.range52, `Tiingo daily ${field.slice(8)}s, 52 weeks or a year to ${iso(anchor)}`);
      }
    }
    if (des && end >= 0) {
      const last = b[end];
      const yearEnd = b.filter((x) => x.day < `${last.day.slice(0, 4)}-01-01`).pop();
      // The change from last year's close to the price the screen shows (live while the session trades): the base is
      // what can be wrong.
      const ytd = afterMatch(des, /^YTD Change\/%$/)?.split('/');
      const shownPx = num(afterMatch(des, /^Px\/Chg 1D/)?.split('/')[0]);
      if (ytd && yearEnd) compare('profile', t, 'YTD %', num(ytd[1]), (shownPx / yearEnd.close - 1) * 100, TOLERANCE.ytd, `the screen's price over Tiingo's close of ${yearEnd.day}`);
      const yearAgo = b.filter((x) => x.day <= `${Number(last.day.slice(0, 4)) - 1}${last.day.slice(4)}`).pop();
      const tr = afterMatch(des, /12M Tot Ret$/);
      if (!sessionOver) skip('profile', t, '12M total return', 'the session was trading when captured');
      else if (yearAgo) compare('profile', t, '12M total return', num(tr), (last.adjClose / yearAgo.adjClose - 1) * 100, TOLERANCE.totalReturn, `Tiingo adjusted ${yearAgo.day} to ${last.day}`);
    }
  }
  if (!summary.ok) blocked('quote', t, 'Market cap', summary, 'Nasdaq summary');
  else compare('quote', t, 'Market cap', shown(after(bq, 'Market cap'), big), num(summary.json.data.summaryData?.MarketCap?.value), TOLERANCE.marketCap, 'Nasdaq market cap');
  if (des) {
    const details = await massive(t);
    const so = afterMatch(des, /^Shrs Out\/Float$/);
    if (details.ok) compare('profile', t, 'Shares out', shown(so, (x) => big(x?.split('/')[0])), details.json.results.share_class_shares_outstanding, TOLERANCE.shares, 'Massive share class shares');
    else if (details.kind === 'no-key') skip('profile', t, 'Shares out', details.detail);
    else blocked('profile', t, 'Shares out', details, 'Massive');
    const si = big(afterMatch(des, /^SI\/% of Float$/)?.split('/')[0]);
    // FINRA's consolidated short interest: from Nasdaq's page for its listings, from FINRA's Query API for the others.
    const short = await nasdaq(t, 'short-interest?assetClass=stocks');
    const sr = short.ok ? short.json.data?.shortInterestTable?.rows?.[0] : undefined;
    if (short.ok && sr) compare('profile', t, 'Short interest', si, num(sr.interest), TOLERANCE.shortInterest, `Nasdaq (FINRA) ${sr.settlementDate ?? ''}`);
    else {
      const body = JSON.stringify({ limit: 12, compareFilters: [{ compareType: 'EQUAL', fieldName: 'symbolCode', fieldValue: t.replace('.', ' ') }], dateRangeFilters: [{ fieldName: 'settlementDate', startDate: iso(Date.now() - 75 * DAY), endDate: iso(Date.now()) }] });
      const finra = await get('https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest', { 'Content-Type': 'application/json', Accept: 'application/json' }, (j) => (Array.isArray(j) && j.length ? null : { kind: 'no-data', detail: 'no settlements' }), { method: 'POST', body });
      const latest = finra.ok ? [...finra.json].sort((a, c) => String(c.settlementDate).localeCompare(String(a.settlementDate)))[0] : undefined;
      if (latest) compare('profile', t, 'Short interest', si, Number(latest.currentShortPositionQuantity), TOLERANCE.shortInterest, `FINRA ${latest.settlementDate}`);
      else blocked('profile', t, 'Short interest', finra, 'FINRA short interest');
    }
  }
}

/**
 * The second source's dividends, each with ISO dates and the amount as paid: Nasdaq's record, or Massive's where Nasdaq
 * gives none (it answers some NYSE listings, Coca-Cola on 28 October 2026, with no rows).
 */
async function refDividends(t) {
  const nq = await nasdaq(t, 'dividends?assetclass=stocks');
  const rows = nq.ok ? nq.json.data?.dividends?.rows ?? [] : [];
  if (rows.length) return { ok: true, source: "Nasdaq's record", rows: rows.map((r) => ({ ex: usDay(r.exOrEffDate), amount: num(r.amount), declared: usDay(r.declarationDate), record: usDay(r.recordDate), pay: usDay(r.paymentDate) })) };
  const key = env('MASSIVE_API_KEY');
  if (!key) return nq.ok ? { kind: 'no-key', detail: "Nasdaq's record gives no dividends for this stock and MASSIVE_API_KEY is not set" } : nq;
  const m = await get(`https://api.massive.com/v3/reference/dividends?ticker=${t}&limit=1000&order=desc&apiKey=${key}`, {}, (j) => (Array.isArray(j?.results) ? null : { detail: String(j?.error ?? j?.message ?? 'no results').slice(0, 120) }));
  if (!m.ok) return m;
  if (!m.json.results.length) return { kind: 'no-data', detail: 'neither Nasdaq nor Massive gives dividends for this stock' };
  return { ok: true, source: "Massive's dividends", rows: m.json.results.map((r) => ({ ex: r.ex_dividend_date ?? '', amount: Number(r.cash_amount), declared: r.declaration_date ?? '', record: r.record_date ?? '', pay: r.pay_date ?? '' })) };
}

async function dividends(t) {
  const ls = lines(`${t} US Equity DVD`);
  if (!ls) return skip('dividends', t, 'all', 'the dividend screen was not captured');
  const ref = await refDividends(t);
  if (!ref.ok) return ref.kind === 'no-key' ? skip('dividends', t, 'rows', ref.detail) : blocked('dividends', t, 'rows', ref, 'dividend record');
  const nq = new Map(ref.rows.map((r) => [r.ex, r]));
  // The table's cells: "12) 06/12/22" (row and declaration), ex, record, payable, currency, amount, type; a split's row
  // has its ratio where the amount goes.
  const cells = ls.filter((l) => /^\d+\)/.test(l)).map((l) => l.split('\t'));
  const splitRows = cells.filter((c) => /Stock split|Reverse split/.test(c[6] ?? '')).map((c) => ({ day: screenDay(c[1]), ratio: (c[5] ?? '').split(':').map(Number) }));
  const amountsAdjusted = !ls.some((l) => /Dividend amounts as paid at the time/.test(l));
  const factor = (exDay) => (amountsAdjusted ? splitRows.filter((x) => x.day > exDay && x.ratio[1] > 0).reduce((f, x) => (f * x.ratio[0]) / x.ratio[1], 1) : 1);
  // Nasdaq's record goes back a few years for some stocks, ten for others; the screen, as far as its price history.
  const nqDays = [...nq.keys()].filter(Boolean).sort();
  const shownDays = cells.filter((c) => !/split/i.test(c[6] ?? '')).map((c) => screenDay(c[1])).filter(Boolean).sort();
  const from = [nqDays[0] ?? '9999', shownDays[0] ?? '9999'].sort().pop();
  let older = 0;
  const seen = new Set();
  for (const c of cells) {
    if (/split/i.test(c[6] ?? '')) continue;
    const dec = screenDay((c[0] ?? '').replace(/^\d+\)\s*/, ''));
    const [ex, rec, pay, , amt, type = ''] = c.slice(1);
    const exDay = screenDay(ex);
    if (!exDay) continue;
    if (exDay < from) {
      older++;
      continue;
    }
    seen.add(exDay);
    const flagged = /Sources disagree/.test(type);
    const r = nq.get(exDay);
    if (!r) {
      add({ status: flagged ? 'FLAGGED' : 'FAIL', area: 'dividends', item: t, field: `ex ${exDay}`, app: Number(amt), refName: ref.source, detail: `not in ${ref.source}` });
      continue;
    }
    const probs = [];
    const f = factor(exDay);
    const refAmt = r.amount / f;
    if (Math.abs(Number(amt) - refAmt) > TOLERANCE.dividend.abs) probs.push(`amount ${amt} vs ${+refAmt.toPrecision(6)}${f !== 1 ? ` (${r.amount} as paid, ${f} shares now for one then)` : ''}`);
    if (dec && r.declared && dec !== r.declared) probs.push(`declared ${dec} vs ${r.declared}`);
    if (rec && r.record && screenDay(rec) !== r.record) probs.push(`record ${screenDay(rec)} vs ${r.record}`);
    if (pay && r.pay && screenDay(pay) !== r.pay) probs.push(`payable ${screenDay(pay)} vs ${r.pay}`);
    add({ status: probs.length ? (flagged ? 'FLAGGED' : 'FAIL') : 'PASS', area: 'dividends', item: t, field: `ex ${exDay}`, app: Number(amt), ref: refAmt, refName: ref.source, ...(probs.length ? { detail: probs.join('; ') } : {}) });
  }
  if (older) skip('dividends', t, `${older} before ${from}`, "before Nasdaq's record or the screen's history starts");
  const today = iso(Date.now());
  for (const r of ref.rows) {
    const d = r.ex;
    if (d >= from && d <= today && !seen.has(d)) add({ status: 'FAIL', area: 'dividends', item: t, field: `ex ${d}`, ref: r.amount, refName: ref.source, detail: `in ${ref.source}, missing on the screen` });
  }
}

const CONCEPTS = {
  // Total revenues first, as the income statement's top line (Walmart's 611,289 for fiscal 2023, with membership
  // income; its net sales tag says 605,881), then the narrower tags.
  Revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'],
  'Gross Profit': ['GrossProfit'],
  'Net Income': ['NetIncomeLoss', 'ProfitLoss'],
  'Diluted EPS': ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
  'Cash from Operations': ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  'Capital Expenditures': ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
};
async function statements(t) {
  const ls = lines(`${t} US Equity FA`);
  if (!ls) return skip('financials', t, 'all', 'the financials screen was not captured');
  const ref = await secFacts(t);
  if (!ref.ok) return ref.kind === 'no-key' ? skip('financials', t, 'all', ref.detail) : blocked('financials', t, 'all', ref, 'SEC companyfacts');
  const g = ref.json.facts?.['us-gaap'] ?? {};
  const h = ls.findIndex((l) => l.startsWith('In Millions'));
  if (h < 0) return skip('financials', t, 'all', 'no statement table on the screen');
  const labels = ls[h].split('\t').slice(1);
  const ends = (ls[h + 1] ?? '').split('\t').slice(1);
  const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
  for (const key of Object.keys(CONCEPTS)) {
    // Each period from the first tag, in order, that gives it.
    const tagged = CONCEPTS[key].map((c) => g[c]?.units).map((u) => u?.USD ?? u?.['USD/shares']).filter((v) => v?.length);
    const row = ls.slice(h, h + 30).find((l) => l.split('\t')[0] === key)?.split('\t').slice(1) ?? [];
    if (!tagged.length || !row.length) continue;
    labels.forEach((lab, i) => {
      if (/Est/.test(lab) || !/^\d{2}\/\d{2}\/\d{4}$/.test(ends[i] ?? '')) return;
      const [dd, mm, yy] = ends[i].split('/');
      const end = `${yy}-${mm}-${dd}`;
      const vals = tagged.find((v) => v.some((x) => x.start && Math.abs(days(x.end, end)) <= 7)) ?? tagged[0];
      const near = (x) => Math.abs(days(x.end, end)) <= 7;
      let refV = NaN;
      let how = '';
      const annual = vals.filter((x) => near(x) && x.start && days(x.start, x.end) > 350 && days(x.start, x.end) < 380);
      if (annual.length) {
        refV = annual[annual.length - 1].val;
        how = `FY to ${end}`;
      } else if (/LTM/.test(lab)) {
        const ytd = vals.filter((x) => near(x) && x.start && days(x.start, x.end) < 300).sort((a, b) => days(b.start, b.end) - days(a.start, a.end))[0];
        if (ytd) {
          const len = days(ytd.start, ytd.end);
          const prevEnd = iso(Date.parse(ytd.end) - 365 * DAY);
          const prev = vals.filter((x) => Math.abs(days(x.end, prevEnd)) <= 7 && x.start && Math.abs(days(x.start, x.end) - len) < 10).pop();
          const fyEnd = iso(Date.parse(ytd.start) - DAY);
          const fy = vals.filter((x) => Math.abs(days(x.end, fyEnd)) <= 7 && x.start && days(x.start, x.end) > 350).pop();
          if (prev && fy) {
            refV = fy.val + ytd.val - prev.val;
            how = `LTM to ${ytd.end}`;
          }
        }
      }
      if (!Number.isFinite(refV)) return;
      const eps = key === 'Diluted EPS';
      const shown = eps ? refV : (key === 'Capital Expenditures' ? -refV : refV) / 1e6;
      compare('financials', t, `${key} ${lab}`, num(row[i]), shown, eps ? { abs: 0.011 } : TOLERANCE.statement, `SEC ${how}`);
    });
  }
}

async function crypto() {
  const ls = lines('XBTUSD Curncy BQ');
  if (!ls) return skip('crypto', 'BTC', 'Last', 'the quote screen was not captured');
  const key = env('COINGECKO_API_KEY');
  const ref = await get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', key ? { 'x-cg-demo-api-key': key, Accept: 'application/json' } : { Accept: 'application/json' }, (j) => (Number.isFinite(j?.bitcoin?.usd) ? null : { detail: 'no bitcoin price' }));
  if (!ref.ok) return blocked('crypto', 'BTC', 'Last', ref, 'CoinGecko');
  compare('crypto', 'BTC', 'Last', num(after(ls, 'Last price')), ref.json.bitcoin.usd, TOLERANCE.crypto, 'CoinGecko simple price');
}

async function gas() {
  const ls = lines('NGAS');
  if (!ls) return skip('energy', 'NGAS', 'Lower 48 storage', 'NGAS was not captured');
  const key = env('EIA_API_KEY');
  if (!key) return skip('energy', 'NGAS', 'Lower 48 storage', 'EIA_API_KEY is not set');
  const text = ls.join('\n');
  const week = screenDay(/week ending (\d{2}\/\d{2}\/\d{2})/.exec(text)?.[1] ?? '');
  const total = ls.find((l) => /^Total Lower 48\b/.test(l));
  const shown = num(total?.split('\t')[1]);
  const ref = await get(`https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key=${key}&frequency=weekly&data[0]=value&facets[series][]=NW2_EPG0_SWO_R48_BCF&sort[0][column]=period&sort[0][direction]=desc&length=8`, {}, (j) => (Array.isArray(j?.response?.data) ? null : { kind: /api_key/i.test(JSON.stringify(j?.error ?? '')) ? 'auth' : 'malformed', detail: JSON.stringify(j?.error ?? 'no data').slice(0, 120) }));
  if (!ref.ok) return blocked('energy', 'NGAS', 'Lower 48 storage', ref, 'EIA API');
  const row = ref.json.response.data.find((r) => r.period === week);
  if (!row) return skip('energy', 'NGAS', 'Lower 48 storage', `EIA's data series has no week ${week || '(none shown)'} yet`);
  compare('energy', 'NGAS', `Lower 48 storage, week ending ${week}`, shown, Number(row.value), TOLERANCE.gasStorage, 'EIA API series NW2_EPG0_SWO_R48_BCF');
}

// ------------------------------------------------------------------ run

(async () => {
  const started = new Date().toISOString();
  if (!args.includes('--skip-capture')) {
    const c = capture();
    if (!c.ok) {
      add({ status: 'BLOCKED', area: 'capture', item: 'app', field: 'screens', kind: c.kind, detail: c.detail });
    }
  }
  for (const t of TICKERS) {
    await equity(t);
    await dividends(t);
    await statements(t);
  }
  await crypto();
  await gas();
  const count = (s) => rows.filter((r) => r.status === s).length;
  const summary = { started, finished: new Date().toISOString(), tickers: TICKERS, pass: count('PASS'), fail: count('FAIL'), flagged: count('FLAGGED'), skip: count('SKIP'), blocked: count('BLOCKED') };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ summary, tolerance: TOLERANCE, rows }, null, 1));
  const fmt = (v) => (v == null || !Number.isFinite(v) ? '' : Math.abs(v) >= 1e6 ? v.toExponential(4) : String(+v.toFixed(4)));
  const order = { FAIL: 0, BLOCKED: 1, FLAGGED: 2, SKIP: 3, PASS: 4 };
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);
  const md = [
    `# Data audit check, ${summary.finished.slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `${summary.pass} passed, ${summary.fail} failed, ${summary.flagged} shown as "Sources disagree", ${summary.blocked} blocked, ${summary.skip} skipped. Tickers: ${TICKERS.join(', ')}.`,
    '',
    '| Status | Area | Item | Field | App | Reference | Difference | Allowed | Reference source | Detail |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...sorted.map((r) => `| ${r.status} | ${r.area} | ${r.item} | ${r.field} | ${fmt(r.app)} | ${fmt(r.ref)} | ${fmt(r.diff)} | ${fmt(r.allowed)} | ${r.refName ?? ''} | ${[r.kind, r.detail].filter(Boolean).join(': ').replace(/\|/g, '/')} |`),
    '',
    '## Tolerances',
    '',
    ...Object.entries(TOLERANCE).map(([k, v]) => `- ${k}: ${[v.pct != null ? `${v.pct}%` : '', v.abs != null ? `${v.abs} absolute` : '', v.pp != null ? `${v.pp} percentage points` : ''].filter(Boolean).join(' or ')}. ${v.why}`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  for (const r of sorted.filter((x) => x.status !== 'PASS')) console.log(`${r.status.padEnd(8)} ${r.area.padEnd(10)} ${String(r.item).padEnd(6)} ${r.field.padEnd(34)} app ${fmt(r.app).padEnd(12)} ref ${fmt(r.ref).padEnd(12)} ${r.refName ?? ''} ${[r.kind, r.detail].filter(Boolean).join(': ')}`);
  console.log(`\n${summary.pass} passed, ${summary.fail} FAILED, ${summary.flagged} flagged on screen, ${summary.blocked} blocked, ${summary.skip} skipped. Report: ${path.relative(ROOT, path.join(OUT, 'report.md'))}`);
  process.exit(summary.fail ? 1 : summary.blocked ? 2 : 0);
})();
