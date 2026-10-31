// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// TipRanks analyst data through its hosted MCP server (https://mcp.tipranks.com/mcp/), read only, with the
// owner's key. Checked 18 October 2026: initialize and tools/list answer without a key and are not metered;
// every tools/call is metered against the account's monthly allowance (50 on the free plan) whether or not it
// returns data, and get_my_usage is free. The key goes in the documented ?apikey= query parameter and that URL
// never leaves the main process. TipRanks' terms allow use in your own applications with a "Data by TipRanks"
// credit and no storage beyond transient caching: answers are kept in memory for an hour, never on disk. Only
// the two research tools below are called, each on an explicit request; portfolio tools never are.
const fs = require('node:fs');
const crypto = require('node:crypto');

const ENDPOINT = 'https://mcp.tipranks.com/mcp/';
const TOOLS = Object.freeze({ consensus: 'get_assets_data', ratings: 'get_recent_analyst_ratings' });
const USAGE_TOOL = 'get_my_usage';
// US tickers as they are (BRK.B), other markets with TipRanks' country prefix (GB:SHEL, DE:SAP, IT:1ABI).
const TICKER = /^(?:[A-Z]{2}:)?[A-Z0-9][A-Z0-9.-]{0,11}$/;
/** The app's own monthly ceiling, under the free plan's 50 calls. */
const MONTHLY_CAP = 45;
const KEEP_MS = 3_600_000;
const PROTOCOL = '2025-06-18';

const validRequest = (kind, ticker) => (kind === 'usage' || Object.hasOwn(TOOLS, kind)) && typeof ticker === 'string' && (kind === 'usage' ? ticker === '' : TICKER.test(ticker));

/** The arguments for a research tool, from the schema the server published; null if it changed shape. */
function toolArguments(tool, kind, ticker) {
  if (!tool || tool.annotations?.readOnlyHint !== true) return null;
  const schema = tool.inputSchema;
  const props = schema?.properties;
  if (schema?.type !== 'object' || !props || typeof props !== 'object') return null;
  const field = kind === 'consensus' ? 'tickers' : 'ticker';
  const spec = props[field];
  const takesString = spec && (spec.type === 'string' || (Array.isArray(spec.anyOf) && spec.anyOf.some((s) => s?.type === 'string')));
  if (!takesString) return null;
  const args = { [field]: ticker };
  if (Array.isArray(schema.required) && schema.required.some((key) => !Object.hasOwn(args, key))) return null;
  return args;
}

/** Streamable HTTP answers with JSON or server-sent events; only the reply to this request counts. */
function decodeReply(text, contentType, id) {
  if (text.length > 2_000_000) throw new Error('TipRanks answer is larger than supported.');
  const messages = /text\/event-stream/i.test(contentType)
    ? text.replace(/\r\n/g, '\n').split(/\n\n/).map((event) => event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')).filter(Boolean).map((value) => JSON.parse(value))
    : [JSON.parse(text)];
  const replies = messages.filter((m) => m?.jsonrpc === '2.0' && m.id === id && (Object.hasOwn(m, 'result') || Object.hasOwn(m, 'error')));
  if (replies.length !== 1) throw new Error('TipRanks returned no matching reply.');
  return replies[0];
}

/** The text a tool returned, and its JSON when it is JSON. */
function toolText(result) {
  const text = (Array.isArray(result?.content) ? result.content : []).filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  let data = null;
  if (result?.structuredContent && typeof result.structuredContent === 'object') data = result.structuredContent;
  else {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { text, data };
}

/** Calls used, the limit and what remains, from get_my_usage's answer, whatever its field names. */
function readUsage(data) {
  if (!data || typeof data !== 'object') return null;
  const flat = { ...data, ...(data.usage && typeof data.usage === 'object' ? data.usage : {}) };
  const pick = (re) => {
    const k = Object.keys(flat).find((key) => re.test(key) && typeof flat[key] === 'number' && Number.isFinite(flat[key]));
    return k === undefined ? undefined : flat[k];
  };
  const used = pick(/^(used|calls_?used|callsUsed|used_?this_?month)$/i);
  const limit = pick(/^(limit|monthly_?limit|monthlyLimit|quota|cap)$/i);
  const remaining = pick(/^(remaining|calls_?remaining|callsRemaining|left)$/i);
  if (used === undefined && limit === undefined && remaining === undefined) return null;
  return { used, limit, remaining: remaining ?? (used !== undefined && limit !== undefined ? Math.max(0, limit - used) : undefined) };
}

const monthOf = (t) => new Date(t).toISOString().slice(0, 7);

/** A short fingerprint of a key: calls and answers are kept per TipRanks account, and the key itself is never stored. */
const keyId = (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);

/** The month's call counts, one per key, in a small file in the app's data folder: { month, byKey: { id: used } }. */
function fileStore(monthFile) {
  return {
    read() {
      try {
        return JSON.parse(fs.readFileSync(monthFile(), 'utf8'));
      } catch {
        return null;
      }
    },
    write(m) {
      try {
        fs.writeFileSync(monthFile(), JSON.stringify(m));
      } catch {
        /* the count still holds for this session */
      }
    },
  };
}

function createTipRanksClient({ providers, fetch, monthFile, store = fileStore(monthFile), now = Date.now, timeoutMs = 20_000 }) {
  /** Answers kept for an hour, per key (another account's answers are not served) and per tool and ticker. */
  const kept = new Map();
  /** Calls under way, so two screens asking at once share one metered call. */
  const inflight = new Map();
  /** Calls sent and not yet answered, per key: counted against the cap before they are answered. */
  const reserved = new Map();
  /** The handshake and the tool schemas, per key. */
  const prepared = new Map();
  let id = 0;
  let session = null;

  /** This month's counts per key. A count saved before counts were kept per key belongs to the key that reads it first. */
  function loadMonth(kid) {
    const m = session ?? store.read();
    const month = monthOf(now());
    if (!m || m.month !== month) return { month, byKey: {} };
    if (m.byKey && typeof m.byKey === 'object') return m;
    return { month, byKey: Number.isInteger(m.used) && kid ? { [kid]: m.used } : {} };
  }
  const usedBy = (kid) => {
    const n = loadMonth(kid).byKey[kid];
    return Number.isInteger(n) ? n : 0;
  };
  function countCall(kid) {
    const m = loadMonth(kid);
    const next = { month: m.month, byKey: { ...m.byKey, [kid]: (Number.isInteger(m.byKey[kid]) ? m.byKey[kid] : 0) + 1 } };
    session = next;
    store.write(next);
    return next.byKey[kid];
  }

  async function rpc(key, method, params) {
    const notification = method.startsWith('notifications/');
    const body = { jsonrpc: '2.0', ...(notification ? {} : { id: ++id }), method, params };
    await providers.slot('tipranks', 8, 60_000);
    const started = providers.recordRequest('tipranks');
    let res;
    let text;
    try {
      res = await fetch(`${ENDPOINT}?apikey=${encodeURIComponent(key)}`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': PROTOCOL }) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      const message = providers.providerMessage(JSON.stringify({ message: err?.name === 'TimeoutError' ? 'TipRanks did not answer in time' : String(err?.message ?? err) }), [key]) || 'TipRanks could not be reached';
      providers.recordResult('tipranks', 0, new Error(message), started);
      return { status: 0, error: message };
    }
    providers.recordResult('tipranks', res.status, undefined, started);
    if (!res.ok) {
      const why = providers.providerMessage(text, [key]);
      const message = res.status === 429 ? `TipRanks' monthly or per-minute allowance is spent (HTTP 429)${why ? `: ${why}` : ''}` : `HTTP ${res.status}${why ? `: ${why}` : ''}`;
      providers.recordProblem('tipranks', providers.errorKind(res.status), message);
      return { status: res.status, error: message, ...(res.status === 429 ? { budget: true } : {}) };
    }
    if (notification) return { status: res.status };
    try {
      const reply = decodeReply(text, res.headers?.get('content-type') ?? '', body.id);
      if (reply.error) {
        const message = providers.providerMessage(JSON.stringify({ message: reply.error.message ?? 'TipRanks refused the request' }), [key]);
        providers.recordProblem('tipranks', 'provider-error', message);
        return { status: 200, error: message };
      }
      return { status: 200, result: reply.result };
    } catch (err) {
      providers.recordProblem('tipranks', 'schema-changed', String(err?.message ?? err));
      return { status: 200, error: 'TipRanks returned an answer the app could not read.' };
    }
  }

  /** The handshake and the published tool schemas, once per key: neither is metered. */
  async function prepare(key, kid) {
    let p = prepared.get(kid);
    if (!p) {
      p = (async () => {
        const init = await rpc(key, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Armin Terminal', version: '1' } });
        if (init.error) return init;
        await rpc(key, 'notifications/initialized', {});
        const list = await rpc(key, 'tools/list', {});
        if (list.error) return list;
        const tools = Array.isArray(list.result?.tools) ? list.result.tools : [];
        return { ok: true, schemas: new Map(tools.filter((t) => typeof t?.name === 'string').map((t) => [t.name, t])) };
      })();
      prepared.set(kid, p);
    }
    const r = await p;
    if (!r.ok && prepared.get(kid) === p) prepared.delete(kid);
    return r;
  }

  async function usage(key) {
    const kid = keyId(key);
    const r = await prepare(key, kid);
    if (!r.ok) return { status: r.status ?? 0, text: '', error: r.error };
    if (!r.schemas.has(USAGE_TOOL)) return { status: 0, text: '', error: 'TipRanks no longer lists its usage tool.' };
    const call = await rpc(key, 'tools/call', { name: USAGE_TOOL, arguments: {} });
    if (call.error) return { status: call.status, text: '', error: call.error };
    const { data } = toolText(call.result);
    return { status: 200, text: JSON.stringify({ usage: readUsage(data), app: { used: usedBy(kid), cap: MONTHLY_CAP } }), at: now() };
  }

  async function research(kind, ticker, key) {
    if (!validRequest(kind, ticker)) throw new Error('not allowed');
    if (kind === 'usage') return usage(key);
    const kid = keyId(key);
    const cacheKey = `${kid}:${kind}:${ticker}`;
    const old = kept.get(cacheKey);
    if (old && now() - old.at < KEEP_MS) return { status: 200, text: old.text, at: old.at, cached: true };
    const running = inflight.get(cacheKey);
    if (running) return running;
    const p = askTool(kind, ticker, key, kid, cacheKey).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, p);
    return p;
  }

  async function askTool(kind, ticker, key, kid, cacheKey) {
    if (usedBy(kid) + (reserved.get(kid) ?? 0) >= MONTHLY_CAP) return { status: 0, text: '', budget: true, error: `This app has used its ${MONTHLY_CAP} TipRanks calls for ${monthOf(now())} with this key; the count restarts on the 1st (UTC).` };
    // The call counts against the cap from the moment it is sent, so calls made together cannot pass it.
    reserved.set(kid, (reserved.get(kid) ?? 0) + 1);
    let answer;
    try {
      const r = await prepare(key, kid);
      if (!r.ok) return { status: r.status ?? 0, text: '', error: r.error };
      const args = toolArguments(r.schemas.get(TOOLS[kind]), kind, ticker);
      if (!args) {
        providers.recordProblem('tipranks', 'schema-changed', `TipRanks changed the ${TOOLS[kind]} tool; nothing was sent.`);
        return { status: 0, text: '', error: `TipRanks changed the ${TOOLS[kind]} tool, so the app did not call it.` };
      }
      answer = await rpc(key, 'tools/call', { name: TOOLS[kind], arguments: args });
      // A call the server answered is metered, whatever it returned; a refusal over the cap is not.
      if (answer.status === 200) countCall(kid);
    } finally {
      reserved.set(kid, Math.max(0, (reserved.get(kid) ?? 1) - 1));
    }
    const call = answer;
    if (call.error) return { status: call.status, text: '', error: call.error, ...(call.budget ? { budget: true } : {}) };
    const { text, data } = toolText(call.result);
    let reply = text;
    for (const secret of [key]) reply = reply.split(secret).join('<redacted>');
    if (call.result?.isError) {
      const message = providers.providerMessage(JSON.stringify({ message: reply || 'TipRanks refused the request' }), [key]);
      providers.recordProblem('tipranks', /limit|quota|exceed/i.test(message) ? 'rate-limited' : 'no-data', message);
      return { status: 200, text: '', error: message };
    }
    const at = now();
    const out = JSON.stringify({ tool: TOOLS[kind], ticker, data, text: data ? undefined : reply });
    kept.set(cacheKey, { text: out, at });
    if (kept.size > 100) kept.delete(kept.keys().next().value);
    return { status: 200, text: out, at };
  }

  return { research };
}

module.exports = { ENDPOINT, TOOLS, MONTHLY_CAP, validRequest, toolArguments, decodeReply, readUsage, createTipRanksClient, keyId };
