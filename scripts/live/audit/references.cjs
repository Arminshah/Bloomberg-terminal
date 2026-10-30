'use strict';

/** A completed screen session needs the same dated reference, never the previous available bar. */
function referenceEnd(bars, shownDay, today) {
  return shownDay ? bars.findIndex((bar) => bar.day === shownDay) : bars.findLastIndex((bar) => bar.day < today);
}

/** Invalid reference prices cannot establish that the application's price is wrong. */
function invalidDailyBars(bars) {
  const seen = new Set();
  for (const bar of bars) {
    const day = String(bar.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || seen.has(day)) return `invalid or duplicate daily reference date: ${day}`;
    seen.add(day);
    if (['open', 'high', 'low', 'close'].some((field) => !Number.isFinite(bar[field]) || bar[field] <= 0) || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) return `inconsistent daily reference OHLC for ${day}`;
    if (!Number.isFinite(bar.volume) || bar.volume < 0 || (bar.splitFactor != null && (!Number.isFinite(bar.splitFactor) || bar.splitFactor <= 0))) return `invalid daily reference volume or split factor for ${day}`;
  }
  return undefined;
}

/** Keep the split basis at the displayed session; later corporate actions belong to a later basis. */
function splitFactorsAt(bars, end) {
  const factors = Array(bars.length).fill(NaN);
  let factor = 1;
  for (let i = end; i >= 0; i--) {
    factors[i] = factor;
    factor *= bars[i].splitFactor ?? 1;
  }
  return factors;
}

/** Space the audit's requests below a five-per-minute free-plan limit. */
function requestBudget({ intervalMs = 15_500, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let next = 0;
  let pending = Promise.resolve();
  return { wait() {
    const run = pending.then(async () => {
      const delay = Math.max(0, next - now());
      if (delay) await sleep(delay);
      next = now() + intervalMs;
    });
    pending = run.catch(() => undefined);
    return run;
  } };
}

function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}

/** Inspect the actual screen day and the previous available reference day, without replacing either. */
function quoteProbeDays(bars, shownDay) {
  if (!validDay(shownDay)) return [];
  const prior = bars.map((bar) => bar.day ?? String(bar.date ?? '').slice(0, 10)).filter((day) => validDay(day) && day < shownDay).sort().at(-1);
  return prior ? [prior, shownDay] : [shownDay];
}

/** Only dated numeric daily observations enter a diagnostic; raw provider payloads and auth fields do not. */
function quoteProbe(source, json, days, expectedTicker) {
  const dates = [...new Set(days.filter(validDay))].sort().slice(-2);
  const empty = { status: 'no-data', observations: [], missingDates: dates };
  const declaredTicker = source === 'Massive' ? json?.ticker : source === 'Nasdaq' ? json?.data?.symbol : undefined;
  const identity = expectedTicker ? { ticker: expectedTicker, identity: declaredTicker == null ? 'request-only' : 'response-confirmed' } : {};
  const tickerKey = (value) => typeof value === 'string' ? value.toUpperCase().replace(/[.]/g, '-') : '';
  if (expectedTicker && declaredTicker != null && tickerKey(declaredTicker) !== tickerKey(expectedTicker)) return { ...empty, status: 'malformed', detail: 'response ticker does not match the requested security' };
  const parseNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string' || !/^\s*\$?-?\d[\d,]*(?:\.\d+)?\s*$/.test(value)) return undefined;
    return Number(value.replace(/[$,\s]/g, ''));
  };
  let rows;
  if (source === 'Tiingo') rows = Array.isArray(json) ? json.map((row) => ({ ...row, day: String(row?.date ?? '').slice(0, 10) })) : null;
  if (source === 'Massive') rows = Array.isArray(json?.results) ? json.results.map((row) => ({
    day: Number.isFinite(row?.t) && !Number.isNaN(new Date(row.t).valueOf()) ? new Date(row.t).toISOString().slice(0, 10) : '', open: row?.o, high: row?.h, low: row?.l, close: row?.c, volume: row?.v,
  })) : null;
  if (source === 'Nasdaq') rows = Array.isArray(json?.data?.tradesTable?.rows) ? json.data.tradesTable.rows.map((row) => {
    const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row?.date ?? '');
    return { ...row, day: date ? `${date[3]}-${date[1]}-${date[2]}` : '' };
  }) : null;
  if (!rows) return { ...empty, ...identity, status: 'malformed' };
  const observations = [];
  const seen = new Set();
  let malformed = false;
  for (const row of rows) {
    if (!dates.includes(row.day)) continue;
    if (seen.has(row.day)) return { ...empty, ...identity, status: 'malformed' };
    seen.add(row.day);
    const observation = { day: row.day };
    for (const field of ['open', 'high', 'low', 'close', 'volume']) {
      const value = parseNumber(row[field]);
      if (value !== undefined && (field === 'volume' ? value >= 0 : value > 0)) observation[field] = value;
      else malformed = true;
    }
    if (['open', 'high', 'low', 'close'].every((field) => observation[field] !== undefined) && (observation.high < Math.max(observation.open, observation.close, observation.low) || observation.low > Math.min(observation.open, observation.close, observation.high))) malformed = true;
    observations.push(observation);
  }
  const missingDates = dates.filter((day) => !seen.has(day));
  return { ...identity, status: !observations.length ? 'no-data' : malformed || missingDates.length ? 'partial' : 'available', observations: observations.sort((a, b) => a.day.localeCompare(b.day)), missingDates };
}

/** Diagnostic sources never overwrite a failed comparison or relax its tolerance. */
function withQuoteDiagnostics(failure, diagnostics) {
  return { ...failure, diagnostics, detail: [failure.detail, 'Dated daily observations (diagnostic only; session, auction and late-report conventions remain unverified): ' + JSON.stringify(diagnostics)].filter(Boolean).join('; ') };
}

module.exports = { referenceEnd, invalidDailyBars, splitFactorsAt, requestBudget, quoteProbeDays, quoteProbe, withQuoteDiagnostics };
