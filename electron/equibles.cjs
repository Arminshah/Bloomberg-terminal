// Read-only Equibles MCP integration. REST paths are not guessed: discover the
// hosted server's schemas, then call only the documented research tools below.
// No account/portfolio writes, external links or instructions in a result run.
const { createRequester } = require('./requests.cjs');
const { createHash } = require('node:crypto');
const ENDPOINT = 'https://mcp.equibles.com/mcp';
const TOOLS = Object.freeze({ estimates: 'GetAnalystEstimates', guidance: 'GetGuidance', kpis: 'GetCompanyKpis', events: 'ListInvestorEvents', insiders: 'GetInsiderTransactions', 'short-interest': 'GetShortInterest', holders: 'GetTopHolders', 'ir-news': 'GetInvestorRelationsNews' });
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
const VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
const normalize = (name) => String(name).replace(/_/g, '').toLowerCase();
const validRequest = (kind, symbol) => Object.hasOwn(TOOLS, kind) && typeof symbol === 'string' && SYMBOL.test(symbol);

async function readReply(response, id) {
  const contentType = response.headers?.get('content-type') ?? '';
  if (!/text\/event-stream/i.test(contentType) || !response.body?.getReader) return decodeReply(await response.text(), contentType, id);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      size += chunk.value?.byteLength ?? 0;
      if (size > 2_000_000) throw new Error('Equibles response exceeds the supported size.');
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      // Frames can be split between chunks, including between CR and LF.
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const event = pending.slice(0, boundary.index);
        pending = pending.slice(boundary.index + boundary[0].length);
        const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        if (message?.jsonrpc === '2.0' && message.id === id && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) return message;
      }
      if (chunk.done) throw new Error('Equibles closed the stream without a matching reply.');
    }
  } finally { await reader.cancel().catch(() => undefined); }
}

/** Streamable HTTP permits JSON or SSE. Select only the matching JSON-RPC reply. */
function decodeReply(text, contentType, id) {
  if (text.length > 2_000_000) throw new Error('Equibles response exceeds the supported size.');
  const messages = /text\/event-stream/i.test(contentType)
    ? text.replace(/\r\n/g, '\n').split(/\n\n/).map((event) => event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')).filter(Boolean).map((value) => JSON.parse(value))
    : [JSON.parse(text)];
  const replies = messages.filter((message) => message?.jsonrpc === '2.0' && message.id === id && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error')));
  if (replies.length !== 1) throw new Error('Equibles returned no unique matching JSON-RPC reply.');
  return replies[0];
}

/** Refuse changed/ambiguous schemas instead of sending an unscoped query. */
function toolArguments(tool, symbol) {
  if (!tool || tool.annotations?.readOnlyHint === false) return null;
  const schema = tool.inputSchema;
  const props = schema?.properties;
  if (schema?.type !== 'object' || !props || typeof props !== 'object' || Array.isArray(props)) return null;
  const fields = ['ticker', 'symbol'].filter((key) => props[key]?.type === 'string');
  if (fields.length !== 1) return null;
  const args = { [fields[0]]: symbol };
  const limitKey = props.maxResults?.type === 'integer' ? 'maxResults' : props.limit?.type === 'integer' ? 'limit' : null;
  if (limitKey) {
    const min = props[limitKey].minimum ?? 1;
    const max = props[limitKey].maximum ?? 500;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > max || min > 50) return null;
    args[limitKey] = Math.min(max, Math.max(min, 20));
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => !Object.hasOwn(args, key)))) return null;
  return args;
}

function rpcProblem(_provider, _url, text) {
  const reply = JSON.parse(text);
  if (reply?.jsonrpc !== '2.0' || !Object.hasOwn(reply, 'result') || !reply.result || typeof reply.result !== 'object') return { kind: 'schema-changed', message: 'Equibles returned an invalid research response.' };
  if (String(reply.id).startsWith('tools/call') && (!Array.isArray(reply.result.content) || !reply.result.content.some((block) => block?.type === 'text' && typeof block.text === 'string' && block.text.trim()))) return { kind: 'schema-changed', message: 'Equibles research has no readable text content.' };
  return null;
}

function createEquiblesAccount({ providers, fetch, agent, now = Date.now, sleep, random }) {
  // One account at a time. Neither the key nor the session can cross into the renderer.
  let account = '';
  let session = '';
  let protocol = '2025-06-18';
  let initialized;
  let toolsPromise;
  const fail = (message, kind = 'schema-changed') => {
    providers.recordProblem('equibles', kind, message);
    return { status: 0, text: '', error: message };
  };
  const broker = createRequester({ providers, agent, now, sleep, random, validate: rpcProblem,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      const response = await fetch(url, { ...init, redirect: 'error' });
      if (!response.ok) return response;
      const token = response.headers?.get('mcp-session-id');
      if (token && /^[\x21-\x7e]{1,512}$/.test(token)) session = token;
      let decoded;
      try {
        decoded = body.id === undefined && [202, 204].includes(response.status)
          ? { jsonrpc: '2.0', result: {} }
          : await readReply(response, body.id);
      } catch (err) {
        // Transport timeouts/body failures are retryable network failures, not schema changes.
        if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || err instanceof TypeError) throw err;
        // Invalid replies reach the broker's validator and are never cached.
        decoded = {};
      }
      return { ok: true, status: 200, headers: response.headers, text: async () => JSON.stringify(decoded) };
    },
  });
  const rpc = (key, method, params, ttl = 0) => {
    // Distinct in-flight tool calls need distinct JSON-RPC IDs in a shared MCP
    // session. Stable argument hashes also preserve cache identity and deduplication.
    const id = method === 'tools/call' ? `${method}:${createHash('sha256').update(JSON.stringify(params)).digest('hex')}` : method;
    return broker('equibles', ENDPOINT, {
    Authorization: `Bearer ${key}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
    ...(session ? { 'Mcp-Session-Id': session } : {}),
    ...(method !== 'initialize' ? { 'MCP-Protocol-Version': protocol } : {}),
  }, ttl, [10, 60_000], [key, session].filter(Boolean), undefined, {
    method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', ...(method.startsWith('notifications/') ? {} : { id }), method, params }),
    // Kept reports belong to the account, not to the MCP session: a renewed session reuses them.
    cacheScope: createHash('sha256').update(key).digest('hex'),
  });
  };

  async function initialize(key) {
    const answer = await rpc(key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Armin Terminal', version: require('../package.json').version } });
    if (!answer.text || answer.stale) return answer;
    const result = JSON.parse(answer.text).result;
    if (!VERSIONS.has(result.protocolVersion) || !result.capabilities?.tools) return fail('Equibles did not advertise a supported research protocol.');
    protocol = result.protocolVersion;
    return rpc(key, 'notifications/initialized', {});
  }

  async function discover(key) {
    const tools = [];
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 5; page++) {
      const answer = await rpc(key, 'tools/list', cursor ? { cursor } : {}, 6 * 3_600_000);
      if (!answer.text || answer.stale) return { error: answer };
      const result = JSON.parse(answer.text).result;
      if (!Array.isArray(result.tools) || result.tools.length > 1000) break;
      tools.push(...result.tools);
      if (!result.nextCursor) return { tools };
      if (typeof result.nextCursor !== 'string' || result.nextCursor.length > 2048 || cursors.has(result.nextCursor)) break;
      cursor = result.nextCursor;
      cursors.add(cursor);
    }
    return { error: fail('Equibles tool discovery was incomplete or changed format.') };
  }

  async function research(kind, symbol, key, recovered = false) {
    if (!validRequest(kind, symbol)) throw new Error('not allowed');
    if (account !== key) { account = key; session = ''; protocol = '2025-06-18'; initialized = undefined; toolsPromise = undefined; }
    initialized ??= initialize(key);
    const ready = await initialized;
    if (!ready.text || ready.stale) {
      initialized = undefined;
      if (ready.status === 404 && session && !recovered) { session = ''; toolsPromise = undefined; return research(kind, symbol, key, true); }
      return ready;
    }
    toolsPromise ??= discover(key);
    const discovery = await toolsPromise;
    if (discovery.error) {
      toolsPromise = undefined;
      if (discovery.error.status === 404 && session && !recovered) { session = ''; initialized = undefined; return research(kind, symbol, key, true); }
      return discovery.error;
    }
    const matches = discovery.tools.filter((tool) => normalize(tool?.name) === normalize(TOOLS[kind]));
    const tool = matches.length === 1 ? matches[0] : null;
    const args = toolArguments(tool, symbol);
    if (!args) return fail(`Equibles does not expose a compatible ${TOOLS[kind]} tool for this account.`, 'no-data');
    const answer = await rpc(key, 'tools/call', { name: tool.name, arguments: args }, 6 * 3_600_000);
    // Expired stateful sessions must be initialized again, at most once per user query.
    // The broker hands back an older cached report with the 404, so the text is not a sign of success here.
    if (answer.status === 404 && session && !recovered) {
      session = ''; initialized = undefined; toolsPromise = undefined;
      return research(kind, symbol, key, true);
    }
    if (!answer.text) return answer;
    const result = JSON.parse(answer.text).result;
    if (!Array.isArray(result.content)) return { status: 0, text: '', error: 'Equibles research has no readable content.' };
    let report = result.content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n\n');
    // Retain provider qualifications/AI labels verbatim, never execute HTML or tool instructions.
    for (const secret of [key, session].filter(Boolean)) report = report.split(secret).join('<redacted>');
    if (!report.trim()) return { status: 0, text: '', error: 'Equibles returned no text for this research query.' };
    return { ...answer, text: JSON.stringify({ tool: tool.name, report }) };
  }
  return { research };
}

function createEquiblesClient(dependencies) {
  const accounts = new Map();
  return { research(kind, symbol, key) {
    if (!validRequest(kind, symbol)) return Promise.reject(new Error('not allowed'));
    const scope = createHash('sha256').update(key).digest('hex');
    if (!accounts.has(scope)) accounts.set(scope, createEquiblesAccount(dependencies));
    const client = accounts.get(scope);
    if (accounts.size > 4) accounts.delete(accounts.keys().next().value);
    return client.research(kind, symbol, key);
  } };
}

module.exports = { ENDPOINT, TOOLS, validRequest, decodeReply, toolArguments, createEquiblesClient };
