// A US-listed stock's reported quarters with the consensus before each report: EPS and revenue expected against
// reported, the report date and the session. Keyless sources keep only the coming quarters' estimates; these public
// pages keep the past ones.
//
// Finviz's quote page embeds about two years of reports (and the coming one) with each quarter's end date, the
// revenue and EPS expected and reported, and the diluted EPS in the statements. Zacks' earnings calendar
// page reaches back about five years (its tables are JavaScript arrays). Its bot protection answers some requests
// with a "Pardon Our Interruption" page; the app does not try to get past it and asks MarketBeat's earnings page
// instead, whose history table gives the same figures by fiscal quarter. Zacks gets Electron's own User-Agent (it
// turns away clients that are not a browser engine), the others the app's name. Only the figures go to the app's page.

const SYMBOL = /^[A-Z][A-Z0-9]{0,6}(?:[.-][A-Z]{1,2})?$/;

/** Zacks' page for a ticker (class shares with a dot: BRK.B), or null when it is not a ticker. */
function zacksUrl(symbol) {
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  return `https://www.zacks.com/stock/research/${symbol.replace('-', '.')}/earnings-calendar`;
}

/** Finviz's quote page for a ticker (class shares with a dash: BRK-B). */
function finvizUrl(symbol) {
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  return `https://finviz.com/quote.ashx?t=${symbol.replace('.', '-')}&p=d`;
}

/** MarketBeat's page for a ticker; MarketBeat redirects to the right exchange. */
function marketbeatUrl(symbol) {
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null;
  return `https://www.marketbeat.com/stocks/NASDAQ/${symbol.replace('-', '.')}/earnings/`;
}

/** The array literal that follows `"key" :` in the page, parsed; null when absent or not JSON. */
function tableAfter(html, key) {
  const at = html.indexOf(`"${key}"`);
  if (at < 0) return null;
  const start = html.indexOf('[', at);
  if (start < 0 || start - at > 200) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) {
      try {
        const rows = JSON.parse(html.slice(start, i + 1));
        return Array.isArray(rows) ? rows : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'" };
const text = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, k) => ENT[k])
    .trim();

/** "-$0.26" → -0.26, "$116.29M" → 116290000, "$1.2B" → 1.2e9, "-" or "--" → NaN. */
function money(cell, defaultScale = 1) {
  const s = text(cell).replace(/[$,\s]/g, '');
  const m = /^([-+]?)(\d+(?:\.\d+)?)([KMBT]?)$/i.exec(s);
  if (!m) return NaN;
  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[3].toUpperCase()] ?? defaultScale;
  const v = (m[1] === '-' ? -1 : 1) * Number(m[2]) * scale;
  // Whole dollars for amounts ("$68.13B" is not 68129999999.99999).
  return scale >= 1e3 ? Math.round(v) : v;
}

/** "10/7/26" or "10/7/2026" → "2026-10-07". */
function isoDate(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text(v));
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function session(v) {
  const s = text(v).toLowerCase();
  return s.includes('after') ? 'Aft-mkt' : s.includes('before') ? 'Bef-mkt' : s.includes('during') ? 'During-mkt' : undefined;
}

/**
 * Zacks' earnings and sales tables as quarters: {date, period (YYYY-MM, the quarter's last month), est, actual,
 * timing}; revenue in dollars (Zacks writes millions). Null when the page has neither table (the bot page, or an
 * unknown ticker).
 */
function parseZacks(html) {
  if (typeof html !== 'string') return null;
  const conv = (rows, scale) =>
    (rows ?? [])
      .filter((r) => Array.isArray(r) && r.length >= 4)
      .slice(0, 40)
      .map((r) => {
        const date = isoDate(r[0]);
        const p = /^(\d{1,2})\/(\d{4})$/.exec(text(r[1]));
        if (!date || !p) return null;
        const t = session(r[6]);
        return { date, period: `${p[2]}-${p[1].padStart(2, '0')}`, est: money(r[2], scale), actual: money(r[3], scale), ...(t ? { timing: t } : {}) };
      })
      .filter(Boolean);
  const eps = tableAfter(html, 'earnings_announcements_earnings_table');
  const sales = tableAfter(html, 'earnings_announcements_sales_table');
  if (!eps && !sales) return null;
  return { source: 'Zacks', eps: conv(eps, 1), sales: conv(sales, 1e6) };
}

/**
 * The companies Finviz lists as the stock's peers (its "Peers" link to the screener, the stock first), in Finviz's
 * order, without the stock itself: APLD's are CIFR, CORZ, WULF, IREN... (checked 21 October 2026).
 */
function finvizPeers(html) {
  if (typeof html !== 'string') return [];
  const m = /<a\b[^>]*\bhref="[^"]*[?&](?:amp;)?t=([A-Z0-9.,-]+)[^"]*"[^>]*>\s*Peers\s*<\/a>/.exec(html);
  if (!m) return [];
  const list = m[1].split(',').filter((t) => SYMBOL.test(t));
  return [...new Set(list.slice(1))].slice(0, 15);
}

// New York's calendar day and clock time of a moment (seconds since 1970).
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function newYork(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const p = Object.fromEntries(NY.formatToParts(new Date(seconds * 1000)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** The month a quarter ends in, and the month before for an end in the first week (52/53-week years). */
function periodOf(end) {
  const d = new Date(Date.parse(`${end}T00:00:00Z`) - (Number(end.slice(8, 10)) <= 7 ? 8 * 86_400_000 : 0));
  return d.toISOString().slice(0, 7);
}

/**
 * Finviz's earnings events: report date and session (New York time), the quarter's end date, and revenue expected
 * and reported in dollars (Finviz writes millions); its EPS comparison (the consensus against the EPS on the analysts'
 * basis, GAAP where it has no other) and the diluted EPS reported. The coming report has the estimates only. Null
 * without events.
 */
function parseFinviz(html) {
  if (typeof html !== 'string') return null;
  const events = (tableAfter(html, 'chartEvents') ?? []).filter((e) => e && e.eventType === 'chartEvent/earnings');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) : NaN);
  const per = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : NaN);
  const sales = [];
  const eps = [];
  const gaap = [];
  for (const e of events.slice(-40)) {
    const at = newYork(e.dateTimestamp);
    const end = newYork(e.fiscalEndDate);
    if (!at || !end || at.day <= end.day) continue;
    // A time of day only when Finviz gives one (midnight means none).
    const timing = at.minutes === 0 ? undefined : at.minutes < 9 * 60 + 30 ? 'Bef-mkt' : at.minutes >= 16 * 60 ? 'Aft-mkt' : 'During-mkt';
    const row = { date: at.day, period: periodOf(end.day), end: end.day, est: num(e.salesEstimate), actual: num(e.salesActual), ...(timing ? { timing } : {}) };
    if (Number.isFinite(row.est) || Number.isFinite(row.actual)) sales.push(row);
    // Its own comparison: the consensus against the EPS on the analysts' basis where it has one.
    const ep = { date: row.date, period: row.period, end: row.end, est: per(e.epsEstimate), actual: per(e.epsActual), ...(timing ? { timing } : {}) };
    if (Number.isFinite(ep.est) || Number.isFinite(ep.actual)) eps.push(ep);
    // Its "reported" EPS is the diluted EPS in the company's statements.
    if (Number.isFinite(per(e.epsReportedActual))) gaap.push({ date: row.date, period: row.period, end: row.end, est: NaN, actual: per(e.epsReportedActual) });
  }
  const newest = (a, b) => b.date.localeCompare(a.date);
  sales.sort(newest);
  eps.sort(newest);
  gaap.sort(newest);
  const peers = finvizPeers(html);
  return sales.length || eps.length || peers.length ? { source: 'Finviz', eps, sales, gaap, peers } : null;
}

/**
 * One row per fiscal quarter: MarketBeat lists a quarter again when the annual report follows (Coca-Cola's Q4 2024 on
 * 11 February 2025 with the estimates, and on 27 March with the revenue only). The report is the earliest date; a
 * figure it lacks comes from the later row.
 */
function oncePerQuarter(rows) {
  const out = [];
  for (const r of rows) {
    const same = r.label ? out.find((x) => x.label === r.label) : undefined;
    if (!same) {
      out.push({ ...r });
      continue;
    }
    const first = same.date <= r.date ? same : r;
    const other = first === same ? r : same;
    Object.assign(same, { date: first.date, est: Number.isFinite(first.est) ? first.est : other.est, actual: Number.isFinite(first.actual) ? first.actual : other.actual });
  }
  return out;
}

/**
 * MarketBeat's earnings history table (Date, Quarter, Consensus Estimate, Reported EPS, Beat/Miss, GAAP EPS, Revenue
 * Estimate, Actual Revenue): quarters by report date and fiscal quarter, revenue in dollars, and the GAAP EPS. Null
 * without the table.
 */
function parseMarketBeat(html) {
  if (typeof html !== 'string') return null;
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const head = (/<thead[\s\S]*?<\/thead>/i.exec(table) ?? [''])[0];
    const cols = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => text(m[1]).toLowerCase());
    const at = (name) => cols.findIndex((c) => c === name);
    const iDate = at('date');
    const iQuarter = at('quarter');
    const iEst = at('consensus estimate');
    const iEps = at('reported eps');
    const iRevEst = at('revenue estimate');
    const iRev = at('actual revenue');
    const iGaap = at('gaap eps');
    if (iDate < 0 || iEst < 0 || iEps < 0 || iRevEst < 0 || iRev < 0) continue;
    const eps = [];
    const sales = [];
    const gaap = [];
    for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (cells.length <= Math.max(iRev, iRevEst, iEps)) continue;
      const date = isoDate(cells[iDate]);
      if (!date) continue;
      const label = iQuarter >= 0 ? text(cells[iQuarter]) : '';
      const base = { date, period: '', ...(/^Q[1-4] \d{4}$/.test(label) ? { label } : {}) };
      eps.push({ ...base, est: money(cells[iEst]), actual: money(cells[iEps]) });
      sales.push({ ...base, est: money(cells[iRevEst]), actual: money(cells[iRev]) });
      if (iGaap >= 0) gaap.push({ ...base, est: NaN, actual: money(cells[iGaap]) });
      if (eps.length >= 40) break;
    }
    if (eps.length) return { source: 'MarketBeat', eps: oncePerQuarter(eps), sales: oncePerQuarter(sales), gaap: oncePerQuarter(gaap).filter((r) => Number.isFinite(r.actual)) };
  }
  return null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Whether a kept history still holds: past reports do not change, so a history keeps until the company's next report
 * (its coming row) for up to 30 days, three days without one, and 12 hours in any case; a page without figures 30 minutes.
 */
function historyFresh(entry, now = Date.now()) {
  if (!entry || !Number.isFinite(entry.at)) return false;
  const age = now - entry.at;
  if (!entry.history) return age < 30 * 60_000;
  if (age < 12 * HOUR) return true;
  const rows = [...(entry.history.sales ?? []), ...(entry.history.eps ?? [])];
  const fetchedDay = new Date(entry.at).toISOString().slice(0, 10);
  const coming = rows.filter((r) => !Number.isFinite(r.actual) && typeof r.date === 'string' && r.date >= fetchedDay).map((r) => r.date).sort()[0];
  if (coming) return age < 30 * DAY && now < Date.parse(`${coming}T00:00:00Z`);
  return age < 3 * DAY;
}

/**
 * Histories kept on disk between sessions (provider|symbol → { at, history }), written a moment after the last change
 * rather than on every answer. At most `max` stocks; the oldest go first.
 */
function createHistoryStore(file, max = 3000) {
  const fs = require('node:fs');
  const path = require('node:path');
  let map = null;
  let timer = null;
  const load = () => {
    if (map) return map;
    map = new Map();
    try {
      const json = JSON.parse(fs.readFileSync(file(), 'utf8'));
      for (const [k, v] of Object.entries(json ?? {})) if (Number.isFinite(v?.at) && (v.history === null || typeof v.history === 'object')) map.set(k, { at: v.at, history: v.history });
    } catch {
      /* nothing kept yet */
    }
    return map;
  };
  const save = () => {
    timer = null;
    try {
      const target = file();
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(`${target}.tmp`, JSON.stringify(Object.fromEntries(load())));
      fs.renameSync(`${target}.tmp`, target);
    } catch {
      /* kept in memory only */
    }
  };
  return {
    get: (key) => load().get(key),
    set(key, entry) {
      const m = load();
      m.delete(key);
      m.set(key, { at: entry.at, history: entry.history ?? null });
      while (m.size > max) m.delete(m.keys().next().value);
      if (!timer) {
        timer = setTimeout(save, 3000);
        timer.unref?.();
      }
    },
    flush: () => {
      if (timer) clearTimeout(timer);
      save();
    },
  };
}

module.exports = { finvizPeers, finvizUrl, zacksUrl, marketbeatUrl, tableAfter, parseFinviz, parseZacks, parseMarketBeat, money, isoDate, historyFresh, createHistoryStore };
