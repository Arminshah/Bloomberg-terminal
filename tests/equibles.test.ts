import { describe, expect, it, vi } from 'vitest';
import { createEquiblesClient, decodeReply, ENDPOINT, toolArguments, validRequest } from '../electron/equibles.cjs';
import * as providerRules from '../electron/providers.cjs';
import tools from './fixtures/equibles-tools.json';
import { parseResearch } from '../src/data/live/equibles';

// Public server schemas, fake account data. Tests never contact a data service.
const KEY = 'eq_TestOnlyAccount0000000000000001';
const START = Date.parse('2026-10-18T12:00:00Z');
type Rpc = { id?: string; method: string; params: { name?: string; cursor?: string; arguments?: Record<string, unknown> } };
function harness() {
  let time = START;
  const providers = {
    providerMessage: providerRules.providerMessage, providerPayloadProblem: providerRules.providerPayloadProblem, errorKind: providerRules.errorKind,
    withinDailyCap: vi.fn(() => true), slot: vi.fn(async () => undefined), recordRequest: vi.fn(() => time), recordResult: vi.fn(), recordProblem: vi.fn(),
  };
  const requests: { key: string; rpc: Rpc; session: string | null }[] = [];
  let payload: unknown = { content: [{ type: 'text', text: 'Synthetic report with source date and original units.' }] };
  let toolList = tools.tools as unknown[];
  let failure = 0;
  const sessions = new Set<string>();
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(ENDPOINT);
    expect(init.redirect).toBe('error');
    expect(init.method).toBe('POST');
    const rpc = JSON.parse(init.body as string) as Rpc;
    const headers = new Headers(init.headers);
    const key = headers.get('authorization')!.replace('Bearer ', '');
    const session = headers.get('mcp-session-id');
    requests.push({ key, rpc, session });
    if (rpc.method !== 'initialize') expect(session).toBe(`session-${key}`);
    if (rpc.method === 'initialize') {
      sessions.add(`session-${key}`);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }), { headers: { 'mcp-session-id': `session-${key}` } });
    }
    expect(sessions.has(session!)).toBe(true);
    if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (rpc.method === 'tools/list') return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: toolList } }));
    if (failure) return new Response(JSON.stringify({ message: `HTTP ${failure} for ${key}` }), { status: failure, headers: { 'retry-after': '60' } });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: payload }));
  });
  const client = createEquiblesClient({ providers, fetch, agent: () => 'Test/1', now: () => time, sleep: async () => undefined, random: () => 0 });
  return { client, providers, requests, fetch, advance: (ms: number) => { time += ms; }, payload: (value: unknown) => { payload = value; }, tools: (value: unknown[]) => { toolList = value; }, failure: (status: number) => { failure = status; } };
}

describe('read-only Equibles discovery and transport', () => {
  it('accepts only supported research kinds and one validated ticker', () => {
    for (const kind of ['estimates', 'guidance', 'kpis', 'events', 'insiders', 'short-interest', 'holders', 'ir-news']) expect(validRequest(kind, 'APLD')).toBe(true);
    for (const kind of ['toString', '__proto__', 'DeletePortfolio', 'https://bad.test']) expect(validRequest(kind, 'APLD')).toBe(false);
    for (const symbol of ['apld', 'AAPL&url=bad', 'AAPL,MSFT', '', null]) expect(validRequest('guidance', symbol)).toBe(false);
  });

  it('uses the actual public schemas for all eight datasets without inventing arguments', () => {
    for (const tool of tools.tools) {
      const args = toolArguments(tool, 'APLD');
      expect(args?.ticker).toBe('APLD');
      expect(Object.keys(args!).every((key) => Object.hasOwn(tool.inputSchema.properties, key))).toBe(true);
    }
    expect(toolArguments({ inputSchema: { type: 'object', properties: { ticker: { type: 'string' } }, required: ['ticker', 'year'] } }, 'APLD')).toBeNull();
    expect(toolArguments({ annotations: { readOnlyHint: false }, inputSchema: tools.tools[0].inputSchema }, 'APLD')).toBeNull();
    expect(toolArguments({ inputSchema: { type: 'object', properties: { ticker: { type: 'string' }, symbol: { type: 'string' } } } }, 'APLD')).toBeNull();
  });

  it('initializes once, sends the notification, discovers tools and keeps distinct POST bodies separate', async () => {
    const h = harness();
    const first = await h.client.research('estimates', 'APLD', KEY);
    expect(parseResearch(first.text)).toMatchObject({ tool: 'GetAnalystEstimates' });
    expect(h.requests.map((r) => r.rpc.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    expect(h.requests[3].rpc.params.arguments).toEqual({ ticker: 'APLD', limit: 20 });
    expect(await h.client.research('estimates', 'APLD', KEY)).toMatchObject({ cached: true, at: START });
    await h.client.research('insiders', 'APLD', KEY);
    expect(h.requests).toHaveLength(5);
    expect(h.requests[4].rpc.params.name).toBe('GetInsiderTransactions');
    expect(h.providers.recordRequest).toHaveBeenCalledTimes(5);
  });

  it('deduplicates parallel queries and keeps simultaneously replaced accounts in separate sessions', async () => {
    const h = harness();
    await Promise.all([h.client.research('guidance', 'APLD', KEY), h.client.research('guidance', 'APLD', KEY)]);
    expect(h.requests).toHaveLength(4);
    const second = `${KEY}2`;
    await Promise.all([h.client.research('insiders', 'APLD', KEY), h.client.research('guidance', 'APLD', second)]);
    for (const request of h.requests.filter((r) => r.rpc.method !== 'initialize')) expect(request.session).toBe(`session-${request.key}`);
    expect(h.requests.filter((r) => r.key === second)).toHaveLength(4);
  });

  it('gives concurrent distinct reports unique request IDs while retaining cache reuse', async () => {
    const h = harness();
    await Promise.all([h.client.research('guidance', 'APLD', KEY), h.client.research('insiders', 'APLD', KEY)]);
    const calls = h.requests.filter((request) => request.rpc.method === 'tools/call');
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((request) => request.rpc.id)).size).toBe(2);
    expect(await h.client.research('guidance', 'APLD', KEY)).toMatchObject({ cached: true });
    expect(h.requests.filter((request) => request.rpc.method === 'tools/call')).toHaveLength(2);
  });

  it.each([
    { isError: true, content: [{ type: 'text', text: 'Premium subscription required' }] },
    { content: [] },
  ])('does not cache a tool refusal or an unreadable result', async (payload) => {
    const h = harness(); h.payload(payload);
    expect(await h.client.research('estimates', 'APLD', KEY)).toMatchObject({ text: '', status: 0 });
    h.payload({ content: [{ type: 'text', text: 'Recovered result' }] });
    expect(parseResearch((await h.client.research('estimates', 'APLD', KEY)).text)?.report).toBe('Recovered result');
    expect(h.requests.filter((r) => r.rpc.method === 'tools/call')).toHaveLength(2);
  });

  it('preserves the original report/time on throttles, redacts keys, and respects the pause', async () => {
    const h = harness();
    h.payload({ content: [{ type: 'text', text: `A report echoing ${KEY}` }] });
    const first = await h.client.research('guidance', 'APLD', KEY);
    expect(first.text).not.toContain(KEY);
    h.advance(6 * 3_600_000 + 1); h.failure(429);
    const stale = await h.client.research('guidance', 'APLD', KEY);
    expect(stale).toMatchObject({ stale: true, at: START, status: 429 });
    expect(stale.error).not.toContain(KEY);
    expect(parseResearch(stale.text)?.report).toContain('<redacted>');
    await h.client.research('guidance', 'APLD', KEY);
    expect(h.requests.filter((r) => r.rpc.method === 'tools/call')).toHaveLength(2);
  });

  it('sends nothing when the daily budget is spent, and refuses changed/missing tools', async () => {
    const h = harness(); h.providers.withinDailyCap.mockReturnValue(false);
    expect(await h.client.research('guidance', 'APLD', KEY)).toMatchObject({ budget: true, text: '' });
    expect(h.fetch).not.toHaveBeenCalled();
    h.providers.withinDailyCap.mockReturnValue(true); h.tools([]);
    expect(await h.client.research('guidance', 'APLD', KEY)).toMatchObject({ text: '', error: expect.stringContaining('compatible GetGuidance') });
    expect(h.requests.some((r) => r.rpc.method === 'tools/call')).toBe(false);
  });

  it('reads a split SSE reply without waiting for a long-lived stream to close', async () => {
    const h = harness();
    const cancel = vi.fn();
    h.fetch.mockImplementationOnce(async (_url, init) => {
      const id = JSON.parse(init.body as string).id;
      const encoder = new TextEncoder();
      const data = `event: message\r\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } })}\r\n\r\n`;
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(': heartbeat\r\n\r\n' + data.slice(0, 15))); controller.enqueue(encoder.encode(data.slice(15))); }, cancel });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'mcp-session-id': `session-${KEY}` } });
    });
    // The remaining fixtures accept the negotiated session (the test's fake server tracks its init).
    h.fetch.mockImplementationOnce(async () => new Response(null, { status: 202 }));
    h.fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 'tools/list', result: { tools: tools.tools } })));
    h.fetch.mockImplementationOnce(async (_url, init) => new Response(JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(init.body as string).id, result: { content: [{ type: 'text', text: 'Stream initialized' }] } })));
    expect(parseResearch((await h.client.research('guidance', 'APLD', KEY)).text)?.report).toBe('Stream initialized');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('decodes the official SSE format and rejects unrelated replies', () => {
    expect(decodeReply('event: message\ndata: {"jsonrpc":"2.0","id":"x","result":{}}\n\n', 'text/event-stream', 'x')).toMatchObject({ result: {} });
    expect(() => decodeReply('{"jsonrpc":"2.0","id":"other","result":{}}', 'application/json', 'x')).toThrow('matching');
    expect(parseResearch('{"tool":"GetGuidance","report":""}')).toBeNull();
  });

  it('classifies an aborted SSE body as a transport failure and retries initialization', async () => {
    const h = harness();
    h.fetch.mockImplementationOnce(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new DOMException('Body interrupted', 'AbortError')); } }), { headers: { 'content-type': 'text/event-stream' } }));
    expect(parseResearch((await h.client.research('guidance', 'APLD', KEY)).text)?.tool).toBe('GetGuidance');
    expect(h.providers.recordResult).toHaveBeenCalledWith('equibles', 0, expect.objectContaining({ name: 'AbortError' }), START);
    expect(h.fetch).toHaveBeenCalledTimes(5);
  });
});

describe('expired Equibles sessions', () => {
  // A server that issues a new session ID on every initialize and answers 404 for a session it has dropped.
  function expiring() {
    let time = START;
    let generation = 0;
    let live = '';
    const providers = {
      providerMessage: providerRules.providerMessage, providerPayloadProblem: providerRules.providerPayloadProblem, errorKind: providerRules.errorKind,
      withinDailyCap: vi.fn(() => true), slot: vi.fn(async () => undefined), recordRequest: vi.fn(() => time), recordResult: vi.fn(), recordProblem: vi.fn(),
    };
    const calls: { method: string; ticker?: unknown }[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const rpc = JSON.parse(init.body as string) as Rpc;
      const session = new Headers(init.headers).get('mcp-session-id');
      calls.push({ method: rpc.method, ticker: rpc.params.arguments?.ticker });
      if (rpc.method === 'initialize') {
        live = `session-${++generation}`;
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }), { headers: { 'mcp-session-id': live } });
      }
      if (session !== live) return new Response(JSON.stringify({ message: 'Session not found' }), { status: 404 });
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (rpc.method === 'tools/list') return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: tools.tools } }));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: `Report for ${rpc.params.arguments?.ticker} at ${time}` }] } }));
    });
    const client = createEquiblesClient({ providers, fetch, agent: () => 'Test/1', now: () => time, sleep: async () => undefined, random: () => 0 });
    return { client, calls, advance: (ms: number) => { time += ms; }, expire: () => { live = ''; } };
  }

  it('starts a new session when the server dropped the old one, even with an older report kept', async () => {
    const h = expiring();
    await h.client.research('estimates', 'AAPL', KEY);
    h.advance(7 * 3_600_000);
    h.expire();
    const again = await h.client.research('estimates', 'AAPL', KEY);
    expect(again.stale).toBeFalsy();
    expect(parseResearch(again.text)).toMatchObject({ report: `Report for AAPL at ${START + 7 * 3_600_000}` });
    expect(h.calls.filter((c) => c.method === 'initialize')).toHaveLength(2);
  });

  it('keeps reports across a renewed session instead of asking again', async () => {
    const h = expiring();
    await h.client.research('estimates', 'AAPL', KEY);
    h.advance(60_000);
    h.expire();
    // MSFT renews the session; AAPL's report from the old session is still within its six hours.
    await h.client.research('estimates', 'MSFT', KEY);
    h.advance(3_600_000);
    const aapl = await h.client.research('estimates', 'AAPL', KEY);
    expect(aapl).toMatchObject({ cached: true, at: START });
    expect(h.calls.filter((c) => c.method === 'tools/call' && c.ticker === 'AAPL')).toHaveLength(1);
  });
});
