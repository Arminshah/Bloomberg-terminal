import { describe, expect, it, vi } from 'vitest';
import * as tr from '../electron/tipranks.cjs';
import * as providerRules from '../electron/providers.cjs';
import fixture from './fixtures/tipranks-tools.json';
import { parseAsset, parseRatings, parseUsage, tipranksTicker } from '../src/data/live/tipranks';
import type { SecurityDef } from '../src/data/types';

// The tool schemas are TipRanks' published tools/list (no key needed); every answer below is made up.
const KEY = 'tr_live_TestOnlyKey000000000000000001';
const sse = (body: unknown) => new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });

function harness(opts: { status?: number; usage?: unknown } = {}) {
  let saved: unknown = null;
  const store = { read: () => saved, write: (m: unknown) => { saved = m; } };
  let time = Date.parse('2026-10-18T12:00:00Z');
  const calls: { url: string; method: string; tool?: string; args?: unknown; headers: Headers }[] = [];
  const providers = {
    providerMessage: providerRules.providerMessage, errorKind: providerRules.errorKind,
    slot: vi.fn(async () => undefined), recordRequest: vi.fn(() => time), recordResult: vi.fn(), recordProblem: vi.fn(),
  };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const rpc = JSON.parse(init.body as string);
    calls.push({ url, method: rpc.method, tool: rpc.params?.name, args: rpc.params?.arguments, headers: new Headers(init.headers) });
    if (rpc.method === 'initialize') return sse({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
    if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (rpc.method === 'tools/list') return sse({ jsonrpc: '2.0', id: rpc.id, result: { tools: fixture.tools } });
    if (opts.status) return new Response(JSON.stringify({ detail: `over the limit for ${KEY}` }), { status: opts.status });
    const name = rpc.params.name;
    const data = name === 'get_my_usage' ? (opts.usage ?? { used: 3, limit: 50, remaining: 47, plan: 'free' })
      : name === 'get_assets_data' ? { assetsData: [{ ticker: rpc.params.arguments.tickers, companyName: 'Example Co', url: 'https://www.tipranks.com/stocks/exmp', price: 100, smartScore: 8, analystConsensus: 'Moderate Buy', bestAnalystConsensus: 'Strong Buy', priceTarget: 120, priceTargetUpside: 0.2, newsSentiment: 0.6 }] }
      : [{ recommendationDate: '10/14/2026', analystName: 'A. Analyst', firm: 'Example Securities', rating: 'Buy', action: 'reiterated', priceTarget: 125, numOfStars: 4.5, articleTitle: 'Note' }];
    return sse({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } });
  });
  const client = tr.createTipRanksClient({ providers, fetch, store, now: () => time });
  return { client, calls, providers, advance: (ms: number) => { time += ms; } };
}

describe('TipRanks requests (main process)', () => {
  it('accepts only the two research tools and the free usage check, with one valid ticker', () => {
    for (const [k, t] of [['consensus', 'AAPL'], ['ratings', 'BRK.B'], ['consensus', 'GB:SHEL'], ['ratings', 'IT:1ABI'], ['usage', '']]) expect(tr.validRequest(k, t), `${k} ${t}`).toBe(true);
    for (const [k, t] of [['list_my_portfolios', 'AAPL'], ['consensus', 'aapl'], ['consensus', 'AAPL,MSFT'], ['ratings', 'AAPL&x=1'], ['usage', 'AAPL'], ['__proto__', 'AAPL']]) expect(tr.validRequest(k, t), `${k} ${t}`).toBe(false);
  });

  it('builds arguments from the published schemas', () => {
    const tool = (n: string) => fixture.tools.find((t) => t.name === n);
    expect(tr.toolArguments(tool('get_assets_data'), 'consensus', 'AAPL')).toEqual({ tickers: 'AAPL' });
    expect(tr.toolArguments(tool('get_recent_analyst_ratings'), 'ratings', 'AAPL')).toEqual({ ticker: 'AAPL' });
    expect(tr.toolArguments({ ...tool('get_assets_data'), annotations: { readOnlyHint: false } }, 'consensus', 'AAPL')).toBeNull();
    expect(tr.toolArguments({ name: 'x', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { symbol: { type: 'string' } } } }, 'ratings', 'AAPL')).toBeNull();
  });

  it('handshakes once, counts only tool calls, keeps answers an hour and never returns the key', async () => {
    const h = harness();
    const usage = await h.client.research('usage', '', KEY);
    expect(parseUsage(usage.text)).toMatchObject({ used: 3, limit: 50, remaining: 47, appUsed: 0, appCap: 45 });
    const a = await h.client.research('consensus', 'AAPL', KEY);
    expect(parseAsset(a.text)).toMatchObject({ ticker: 'AAPL', analystConsensus: 'Moderate Buy', priceTarget: 120, priceTargetUpside: 0.2, url: 'https://www.tipranks.com/stocks/exmp' });
    expect(await h.client.research('consensus', 'AAPL', KEY)).toMatchObject({ cached: true });
    const r = await h.client.research('ratings', 'AAPL', KEY);
    expect(parseRatings(r.text)).toEqual([{ date: '2026-10-14', analyst: 'A. Analyst', firm: 'Example Securities', rating: 'Buy', action: 'reiterated', target: 125, stars: 4.5, extra: { articleTitle: 'Note' } }]);
    expect(h.calls.map((c) => c.tool ?? c.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'get_my_usage', 'get_assets_data', 'get_recent_analyst_ratings']);
    // The key goes only in the documented query parameter, to TipRanks' endpoint, and never comes back.
    for (const c of h.calls) {
      expect(new URL(c.url).origin + new URL(c.url).pathname).toBe('https://mcp.tipranks.com/mcp/');
      expect(new URL(c.url).searchParams.get('apikey')).toBe(KEY);
    }
    expect(JSON.stringify([usage, a, r])).not.toContain(KEY);
    // Two metered calls this month; the hour-old answer is asked again.
    expect(parseUsage((await h.client.research('usage', '', KEY)).text)?.appUsed).toBe(2);
    h.advance(3_600_001);
    await h.client.research('consensus', 'AAPL', KEY);
    expect(h.calls.filter((c) => c.tool === 'get_assets_data')).toHaveLength(2);
  });

  it('stops at its monthly ceiling without calling, and reports a 429 without the key', async () => {
    const h = harness();
    for (let i = 0; i < tr.MONTHLY_CAP; i++) await h.client.research('ratings', `T${i}`, KEY);
    const over = await h.client.research('ratings', 'LAST', KEY);
    expect(over).toMatchObject({ budget: true, error: expect.stringMatching(/45 TipRanks calls/) });
    expect(h.calls.filter((c) => c.tool === 'get_recent_analyst_ratings')).toHaveLength(tr.MONTHLY_CAP);
    const refused = harness({ status: 429 });
    const answer = await refused.client.research('consensus', 'AAPL', KEY);
    expect(answer).toMatchObject({ status: 429, budget: true });
    expect(JSON.stringify(answer)).not.toContain(KEY);
  });

  it('reads usage whatever the field names', () => {
    expect(tr.readUsage({ calls_used: 7, monthly_limit: 50 })).toEqual({ used: 7, limit: 50, remaining: 43 });
    expect(tr.readUsage({ usage: { used: 1, limit: 10, remaining: 9 } })).toEqual({ used: 1, limit: 10, remaining: 9 });
    expect(tr.readUsage({ plan: 'free' })).toBeNull();
  });
});

describe('TipRanks tickers', () => {
  const def = (ticker: string) => ({ id: `${ticker} Equity`, ticker, cls: 'equity' }) as unknown as SecurityDef;
  it('maps US, London, Xetra and Paris listings, and leaves other markets to the owner', () => {
    expect(tipranksTicker(def('AAPL US'))).toBe('AAPL');
    expect(tipranksTicker(def('BRK/B US'))).toBe('BRK.B');
    expect(tipranksTicker(def('SHEL LN'))).toBe('GB:SHEL');
    expect(tipranksTicker(def('SAP GY'))).toBe('DE:SAP');
    expect(tipranksTicker(def('ENX FP'))).toBe('FR:ENX');
    expect(tipranksTicker(def('ABI BB'))).toBe('');
  });
});
