'use strict';

// Development-only observation of requests the app already made. Never request
// another destination, collect authentication fields, or retain a raw response.
const MAX_BYTES = 2 * 1024 * 1024;
const READ_TIMEOUT_MS = 1500;
const SYMBOL = /^[A-Z0-9^=._/-]{1,30}$/i;
const key = (symbol) => typeof symbol === 'string' && SYMBOL.test(symbol) ? symbol.toUpperCase().replace(/[./]/g, '-') : null;
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const fields = ['regularMarketPrice', 'regularMarketOpen', 'regularMarketDayHigh', 'regularMarketDayLow', 'regularMarketVolume', 'regularMarketPreviousClose', 'regularMarketChange', 'regularMarketChangePercent', 'previousClose', 'chartPreviousClose', 'regularMarketTime', 'marketCap', 'sharesOutstanding', 'floatShares'];

function requestContext(input) {
  let url;
  try { url = new URL(typeof input === 'string' ? input : input?.url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['query1.finance.yahoo.com', 'query2.finance.yahoo.com'].includes(url.hostname)) return null;
  if (url.pathname === '/v7/finance/quote' || url.pathname === '/v8/finance/spark') {
    const symbols = (url.searchParams.get('symbols') ?? '').split(',').map(key).filter(Boolean).slice(0, 80);
    return symbols.length ? { kind: url.pathname.endsWith('/spark') ? 'spark' : 'quote', symbols, sourceUrl: `${url.origin}${url.pathname}` } : null;
  }
  const summary = /^\/v10\/finance\/quoteSummary\/([^/]+)$/.exec(url.pathname);
  if (summary) {
    let symbol;
    try { symbol = key(decodeURIComponent(summary[1])); } catch { return null; }
    return symbol ? { kind: 'summary', symbols: [symbol], sourceUrl: `${url.origin}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` } : null;
  }
  const chart = /^\/v8\/finance\/chart\/([^/]+)$/.exec(url.pathname);
  if (!chart) return null;
  let symbol;
  try { symbol = key(decodeURIComponent(chart[1])); } catch { return null; }
  if (!symbol) return null;
  const interval = url.searchParams.get('interval');
  if (interval !== '1d' && !['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'].includes(interval)) return null;
  return { kind: interval === '1d' ? 'chartDaily' : 'chartIntraday', interval, symbols: [symbol], sourceUrl: `${url.origin}${url.pathname}` };
}

/** A finite body limit applies even when Content-Length is missing. */
async function readJsonBounded(response, limit = MAX_BYTES, timeoutMs = READ_TIMEOUT_MS) {
  if (Number(response.headers.get('content-length')) > limit) {
    // This may already be a tee'd clone: release its branch without waiting for
    // the normal app consumer to finish the other branch.
    void response.body?.cancel().catch(() => undefined);
    throw new RangeError('size-limit');
  }
  if (!response.body) throw new Error('empty-body');
  const reader = response.body.getReader();
  const parts = [];
  let bytes = 0;
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new RangeError('time-limit')), timeoutMs); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new RangeError('size-limit');
      parts.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally {
    clearTimeout(timer);
    // Do not wait for a cloned stream's other consumer before returning.
    void reader.cancel().catch(() => undefined);
  }
}

function quoteFields(row) {
  const projected = {};
  for (const field of fields) if (number(row?.[field]) !== undefined) projected[field] = row[field];
  if (/^(?:[A-Z]{3}|GBp)$/.test(row?.currency ?? '')) projected.currency = row.currency;
  if (/^[A-Z_]{1,20}$/.test(row?.marketState ?? '')) projected.marketState = row.marketState;
  const offset = number(row?.gmtOffSetMilliseconds);
  const seconds = number(row?.regularMarketTime);
  if (offset !== undefined) projected.gmtOffsetMilliseconds = offset;
  if (seconds !== undefined && offset !== undefined && Number.isFinite(new Date(seconds * 1000 + offset).valueOf())) projected.sessionDate = new Date(seconds * 1000 + offset).toISOString().slice(0, 10);
  return projected;
}

function chartFields(row) {
  const meta = row?.meta ?? row;
  const result = { meta: quoteFields(meta), bars: [] };
  const offset = number(meta?.gmtoffset);
  if (offset !== undefined) result.gmtOffsetSeconds = offset;
  const timestamps = row?.timestamp;
  const quote = row?.indicators?.quote?.[0] ?? {};
  if (!Array.isArray(timestamps)) return result;
  for (let i = Math.max(0, timestamps.length - 2); i < timestamps.length; i++) {
    const timestamp = number(timestamps[i]);
    if (timestamp === undefined) continue;
    const bar = { timestamp };
    for (const field of ['open', 'high', 'low', 'close', 'volume']) {
      const value = number(quote[field]?.[i] ?? (field === 'close' ? row?.close?.[i] : undefined));
      if (value !== undefined) bar[field] = value;
    }
    if (offset !== undefined && Number.isFinite(new Date(timestamp * 1000 + offset * 1000).valueOf())) bar.sessionDate = new Date(timestamp * 1000 + offset * 1000).toISOString().slice(0, 10);
    result.bars.push(bar);
  }
  return result;
}

function summaryFields(row) {
  const result = {};
  const modules = { summaryDetail: ['marketCap', 'previousClose'], financialData: ['currentPrice'], price: ['marketCap', 'regularMarketPrice', 'regularMarketTime'], defaultKeyStatistics: ['sharesOutstanding', 'floatShares'] };
  for (const [module, names] of Object.entries(modules)) {
    const projected = {};
    for (const name of names) {
      const value = number(row?.[module]?.[name]?.raw ?? row?.[module]?.[name]);
      if (value !== undefined) projected[name] = value;
    }
    for (const name of ['currency', 'financialCurrency']) if (/^(?:[A-Z]{3}|GBp)$/.test(row?.[module]?.[name] ?? '')) projected[name] = row[module][name];
    if (Object.keys(projected).length) result[module] = projected;
  }
  return result;
}

function createQuoteOrigins(maxSymbols = 80) {
  const records = new Map();
  let pending = 0;
  const save = (symbol, context, content, requestedAt, receivedAt, observedAt) => {
    const rows = records.get(symbol) ?? {};
    // receivedAt is the fetch/header clock; observedAt is after bounded body
    // parsing. Only the latter establishes that these fields preceded a capture.
    rows[context.kind] = [...(rows[context.kind] ?? []), { kind: context.kind, ...(context.interval ? { interval: context.interval } : {}), symbol, sourceUrl: context.sourceUrl, requestedAt, receivedAt, observedAt, ...content }].slice(-2);
    records.delete(symbol);
    records.set(symbol, rows);
    while (records.size > maxSymbols) records.delete(records.keys().next().value);
  };
  const record = (context, json, requestedAt, receivedAt, observedAt = Date.now()) => {
    if (!context) return;
    if (context.kind === 'quote') {
      for (const row of (Array.isArray(json?.quoteResponse?.result) ? json.quoteResponse.result : []).slice(0, 100)) {
        const symbol = key(row?.symbol);
        if (symbol && context.symbols.includes(symbol)) save(symbol, context, { status: 'observed', fields: quoteFields(row) }, requestedAt, receivedAt, observedAt);
      }
    } else if (context.kind === 'summary') {
      const row = json?.quoteSummary?.result?.[0];
      if (row) {
        const declared = key(row?.price?.symbol);
        const mismatch = declared && declared !== context.symbols[0];
        save(context.symbols[0], context, mismatch ? { status: 'identity-mismatch' } : { status: 'observed', identity: declared ? 'response-confirmed' : 'request-only', modules: summaryFields(row) }, requestedAt, receivedAt, observedAt);
      }
    } else if (context.kind.startsWith('chart')) {
      const row = json?.chart?.result?.[0];
      if (!row) return;
      const symbol = context.symbols[0];
      const declared = key(row?.meta?.symbol);
      save(symbol, context, declared && declared !== symbol ? { status: 'identity-mismatch' } : { status: 'observed', identity: declared ? 'response-confirmed' : 'request-only', ...chartFields(row) }, requestedAt, receivedAt, observedAt);
    } else {
      const entries = Array.isArray(json?.spark?.result) ? json.spark.result.slice(0, 100).map((entry) => [entry?.symbol, entry?.response?.[0]]) : Object.entries(json ?? {}).slice(0, 100);
      for (const [name, row] of entries) {
        const symbol = key(name);
        if (symbol && context.symbols.includes(symbol)) save(symbol, context, { status: 'observed', ...chartFields(row) }, requestedAt, receivedAt, observedAt);
      }
    }
  };
  return {
    record,
    snapshot(symbol, capturedAt = Date.now()) {
      if (!Number.isFinite(capturedAt)) return {};
      const selected = Object.entries(records.get(key(symbol)) ?? {}).map(([kind, rows]) => [kind, rows.filter((row) => row.receivedAt <= capturedAt && row.observedAt <= capturedAt)]).filter(([, rows]) => rows.length);
      return JSON.parse(JSON.stringify(Object.fromEntries(selected)));
    },
    observe(input, response, requestedAt, receivedAt) {
      // Observation must never change the normal fetch result, including a clone failure.
      let context;
      let clone;
      try {
        context = requestContext(input);
        if (!context || !response.ok || pending >= 4) return;
        clone = response.clone();
      } catch { return; }
      pending++;
      void readJsonBounded(clone).then((json) => record(context, json, requestedAt, receivedAt)).catch(() => {
        const observedAt = Date.now();
        for (const symbol of context.symbols) save(symbol, context, { status: 'omitted-invalid-oversized-or-timed-out-response' }, requestedAt, receivedAt, observedAt);
      }).finally(() => { pending--; });
    },
  };
}

module.exports = { MAX_BYTES, READ_TIMEOUT_MS, requestContext, readJsonBounded, createQuoteOrigins };
