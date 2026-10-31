// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
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

/** Keep only observations already completely parsed when this DOM snapshot was taken. */
function capturedQuote(snapshot) {
  const capturedAt = snapshot?.capturedAt;
  if (!Number.isFinite(capturedAt)) return null;
  const state = snapshot.domains?.find((domain) => domain.domain === 'quote') ?? null;
  const origins = Object.fromEntries(Object.entries(snapshot.quoteOrigins ?? {}).map(([kind, rows]) => [kind,
    (Array.isArray(rows) ? rows : []).filter((row) => Number.isFinite(row.observedAt) && row.observedAt <= capturedAt && Number.isFinite(row.receivedAt) && row.receivedAt <= capturedAt).slice(-2),
  ]).filter(([, rows]) => rows.length));
  return { capturedAt, state, origins };
}

function capturedQuoteDetail(capture, field) {
  if (!capture) return 'Captured quote provenance unavailable.';
  const { capturedAt, state, origins } = capture;
  const finite = (value) => Number.isFinite(value) ? value : 'n/a';
  const short = (value) => typeof value === 'string' ? value.slice(0, 90) : 'n/a';
  const shown = state?.displayed ?? {};
  const q = state?.quote ?? {};
  let display;
  if (field === 'Market cap') {
    const cap = state?.marketCap ?? {};
    const basis = cap.shareBasis ?? {};
    display = `cap=${finite(cap.value)} ${short(cap.currency)}, price=${finite(cap.price)}, shares=${finite(cap.shares)}, priceSource=${short(cap.priceProvider)}@${finite(cap.priceTime)}, sharesSource=${short(basis.source)}, method=${short(basis.method)}, sharesObserved=${finite(basis.observedAt)}, sourceCap=${finite(basis.marketCap)}, sourcePrice=${finite(basis.price)}`;
  } else {
    const key = { Last: 'last', Open: 'open', High: 'high', Low: 'low', 'Previous close': 'prevClose', Volume: 'volume' }[field];
    display = `${key ?? field}=${key ? finite(shown[key]) : 'see displayed comparison'}, provider=${short(q.provider)}, dayProvider=${short(q.dayProvider)}, volumeSource=${short(q.volumeSource)}, sourceTime=${finite(q.time)}${field === 'Previous close' ? `, check=${short(q.chgCheck)}, prevCloseDay=${finite(q.prevCloseDay)}` : ''}`;
  }
  const raw = [];
  const fieldName = { Last: 'regularMarketPrice', Open: 'regularMarketOpen', High: 'regularMarketDayHigh', Low: 'regularMarketDayLow', 'Previous close': 'regularMarketPreviousClose', Volume: 'regularMarketVolume' }[field] ?? 'regularMarketPrice';
  const quote = origins.quote?.at(-1);
  if (quote) raw.push(`Yahoo.quote ${field === 'Market cap' ? `cap=${finite(quote.fields?.marketCap)},price=${finite(quote.fields?.regularMarketPrice)},shares=${finite(quote.fields?.sharesOutstanding)}` : `${finite(quote.fields?.[fieldName])},day=${short(quote.fields?.sessionDate)}`}@${quote.observedAt}`);
  if (field === 'Market cap') {
    const summary = origins.summary?.at(-1);
    if (summary) raw.push(`Yahoo.summary ${JSON.stringify(summary.modules ?? {})}@${summary.observedAt}`);
  } else if (field === 'Previous close') {
    const spark = origins.spark?.at(-1);
    if (spark) raw.push(`Yahoo.spark previousClose=${finite(spark.meta?.previousClose)},chartPreviousClose=${finite(spark.meta?.chartPreviousClose)}@${spark.observedAt}`);
    const daily = origins.chartDaily?.at(-1);
    if (daily) raw.push(`Yahoo.daily closes=${JSON.stringify((daily.bars ?? []).map((bar) => ({ day: bar.sessionDate, close: bar.close })))}@${daily.observedAt}`);
    const intraday = origins.chartIntraday?.at(-1);
    if (intraday) raw.push(`Yahoo.chartMeta previousClose=${finite(intraday.meta?.previousClose)},chartPreviousClose=${finite(intraday.meta?.chartPreviousClose)}@${intraday.observedAt}`);
    if (quote) raw.push(`Yahoo.quote price=${finite(quote.fields?.regularMarketPrice)},change=${finite(quote.fields?.regularMarketChange)}`);
  } else {
    for (const kind of ['chartDaily', 'chartIntraday']) {
      const observation = origins[kind]?.at(-1);
      if (!observation) continue;
      const bar = observation.bars?.at(-1);
      const name = { Last: 'close', Open: 'open', High: 'high', Low: 'low', Volume: 'volume' }[field] ?? 'close';
      raw.push(`Yahoo.${kind} last ${short(observation.interval)} bar ${name}=${finite(bar?.[name])},barTime=${finite(bar?.timestamp)},day=${short(bar?.sessionDate)}@${observation.observedAt}`);
    }
  }
  return `Captured@${capturedAt}: ${display}; raw (read completed at clock after @): ${raw.join('; ') || 'unavailable'}.`;
}

/** Diagnostic sources never overwrite a failed comparison or relax its tolerance. */
function withQuoteDiagnostics(failure, diagnostics, snapshot) {
  const field = failure.field === 'Volume' ? 'volume' : failure.field === 'Open' ? 'open' : null;
  const days = diagnostics.days ?? [];
  const shownDay = days.at(-1);
  const values = (day) => (diagnostics.sources ?? []).map((source) => {
    const value = source.observations?.find((observation) => observation.day === day)?.[field];
    return `${source.source}=${Number.isFinite(value) ? value : `unavailable (${source.kind ?? source.status ?? 'unknown'})`}`;
  }).join('; ');
  const capture = capturedQuote(snapshot);
  const detail = field ? `Dated ${failure.field} ${shownDay}: ${values(shownDay)}. ${capturedQuoteDetail(capture, failure.field)}${days.length > 1 ? ` Previous available ${days[0]}: ${values(days[0])}.` : ''} These are diagnostic only: Massive unadjusted; auction/session/late-report definitions and Nasdaq adjustments unverified. Full OHLCV, clocks and links: report.json.` : 'Dated diagnostic context is retained in report.json.';
  return { ...failure, diagnostics, capturedQuote: capture, detail: [detail, failure.detail].filter(Boolean).join('; ') };
}

function withQuoteCapture(failure, snapshot, referenceObservation) {
  const capture = capturedQuote(snapshot);
  return { ...failure, capturedQuote: capture, ...(referenceObservation ? { referenceObservation } : {}), detail: [capturedQuoteDetail(capture, failure.field), failure.detail].filter(Boolean).join('; ') };
}

function withProfileReturnCapture(failure, snapshot, referenceObservation) {
  const state = snapshot?.domains?.find((domain) => domain.domain === 'profile-returns') ?? null;
  const capturedAt = snapshot?.capturedAt;
  const recomputedYtd = state && Number.isFinite(state.price) && state.baseClose > 0 ? (state.price / state.baseClose - 1) * 100 : null;
  const detail = state && Number.isFinite(capturedAt) ? `Captured@${capturedAt}: DES price=${state.price}@${state.priceTime}, provider=${state.provider}, YTD=${state.ytd}, recomputedYTD=${recomputedYtd}, baseClose=${state.baseClose}, baseTime=${state.baseTime}, cutoff=${state.cutoff}; reference price=${referenceObservation.price}, baseClose=${referenceObservation.baseClose}, baseDay=${referenceObservation.baseDay}.` : 'Captured DES return inputs unavailable.';
  return { ...failure, capturedReturns: { capturedAt, state, recomputedYtd }, referenceObservation, detail: [detail, failure.detail].filter(Boolean).join('; ') };
}

/**
 * Nasdaq's official historical row for one session ({data: {tradesTable: {rows: [{date: "10/29/2026", open: "$348.00",
 * high, low, close, volume: "42,582,130"}]}}}), as numbers; null when the row is not published yet or not usable.
 */
function nasdaqOfficialRow(json, day) {
  const rows = json?.data?.tradesTable?.rows;
  if (!Array.isArray(rows) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return null;
  const [y, m, d] = day.split('-');
  const row = rows.find((r) => r?.date === `${m}/${d}/${y}`);
  if (!row) return null;
  const n = (v) => {
    const x = Number(String(v ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(x) && x > 0 ? x : NaN;
  };
  const out = { day, open: n(row.open), high: n(row.high), low: n(row.low), close: n(row.close), volume: n(row.volume) };
  return Number.isFinite(out.high) && Number.isFinite(out.low) && out.high >= out.low ? out : null;
}

/**
 * The request for the official row of a session: the week ending on it. Nasdaq answers HTTP 400 to a range of one day
 * (fromdate equal to todate), as it did for Apple's 30 October 2026 on 31 October.
 */
function officialRowPath(day) {
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  return `historical?assetclass=stocks&fromdate=${from}&todate=${day}&limit=10`;
}

/**
 * The shares on the company's latest SEC cover (dei:EntityCommonStockSharesOutstanding) dated on or before `day`: null
 * when there is none within `maxAgeDays`, or when the cover gives more than one figure for that date (several share
 * classes, which a single count cannot stand for).
 */
function coverShares(companyFacts, day, maxAgeDays = 150) {
  const list = companyFacts?.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares;
  if (!Array.isArray(list) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return null;
  const dated = list.filter((x) => typeof x?.end === 'string' && x.end <= day && Number(x.val) > 0);
  const asOf = dated.map((x) => x.end).sort().at(-1);
  if (!asOf || (Date.parse(day) - Date.parse(asOf)) / 86_400_000 > maxAgeDays) return null;
  const same = dated.filter((x) => x.end === asOf);
  if (new Set(same.map((x) => Number(x.val))).size !== 1) return null;
  const latest = same.sort((a, b) => String(b.filed).localeCompare(String(a.filed)))[0];
  return { shares: Number(latest.val), asOf, form: latest.form, filed: latest.filed, accession: latest.accn, cik: companyFacts.cik, entity: companyFacts.entityName };
}

/** Whether Tiingo's bars record a split after the cover date up to and including the session (a share count then stale). */
function splitSince(bars, asOf, day) {
  return bars.some((x) => x.day > asOf && x.day <= day && Number.isFinite(Number(x.splitFactor)) && Number(x.splitFactor) !== 1);
}

module.exports = { referenceEnd, invalidDailyBars, splitFactorsAt, requestBudget, quoteProbeDays, quoteProbe, withQuoteDiagnostics, capturedQuote, withQuoteCapture, withProfileReturnCapture, nasdaqOfficialRow, officialRowPath, coverShares, splitSince };
