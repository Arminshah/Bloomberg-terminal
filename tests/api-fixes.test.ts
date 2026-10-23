import { describe, expect, it, vi } from 'vitest';
import * as providers from '../electron/providers.cjs';

describe('one answer for every window (CoinGecko\'s monthly allowance)', () => {
  it('fetches once for callers at the same time and serves the fresh answer after', async () => {
    let t = 0;
    const now = () => t;
    const fetcher = vi.fn(async () => ({ status: 200, text: 'x' }));
    const keep = (r: { status: number; text: string }) => r.status === 200 && !!r.text;
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => providers.shared('t-cg', 'key1', 1000, fetcher, keep, now)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([a, b, c].every((x) => x.text === 'x')).toBe(true);
    t = 999;
    await providers.shared('t-cg', 'key1', 1000, fetcher, keep, now);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 1000;
    await providers.shared('t-cg', 'key1', 1000, fetcher, keep, now);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('asks again with another key, and does not keep a failure', async () => {
    const now = () => 0;
    const keep = (r: { status: number }) => r.status === 200;
    const ok = vi.fn(async () => ({ status: 200 }));
    await providers.shared('t-cg2', 'key1', 1000, ok, keep, now);
    await providers.shared('t-cg2', 'key2', 1000, ok, keep, now);
    expect(ok).toHaveBeenCalledTimes(2);
    const fail = vi.fn(async () => ({ status: 429 }));
    await providers.shared('t-cg3', 'k', 1000, fail, keep, now);
    await providers.shared('t-cg3', 'k', 1000, fail, keep, now);
    expect(fail).toHaveBeenCalledTimes(2);
    const boom = vi.fn(async () => { throw new Error('network'); });
    await expect(providers.shared('t-cg4', 'k', 1000, boom, keep, now)).rejects.toThrow('network');
    await expect(providers.shared('t-cg4', 'k', 1000, boom, keep, now)).rejects.toThrow('network');
    expect(boom).toHaveBeenCalledTimes(2);
  });
});

describe('TipRanks: calls and answers kept per account', async () => {
  const tr = await import('../electron/tipranks.cjs');
  const providerRules = await import('../electron/providers.cjs');
  const fixture = (await import('./fixtures/tipranks-tools.json')).default;
  const A = 'tr_live_TestOnlyKeyA00000000000000001';
  const B = 'tr_live_TestOnlyKeyB00000000000000002';
  const sse = (body: unknown) => new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  function harness(saved: unknown = null) {
    let stored = saved;
    const store = { read: () => stored, write: (m: unknown) => { stored = m; } };
    const time = Date.parse('2026-10-23T12:00:00Z');
    const toolCalls: { key: string; ticker: string }[] = [];
    const providers = {
      providerMessage: providerRules.providerMessage, errorKind: providerRules.errorKind,
      slot: vi.fn(async () => undefined), recordRequest: vi.fn(() => time), recordResult: vi.fn(), recordProblem: vi.fn(),
    };
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const rpc = JSON.parse(init.body as string);
      if (rpc.method === 'initialize') return sse({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (rpc.method === 'tools/list') return sse({ jsonrpc: '2.0', id: rpc.id, result: { tools: fixture.tools } });
      const key = new URL(url).searchParams.get('apikey') ?? '';
      toolCalls.push({ key, ticker: rpc.params.arguments.tickers ?? rpc.params.arguments.ticker });
      await new Promise((r) => setTimeout(r, 5));
      return sse({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify({ assetsData: [{ ticker: rpc.params.arguments.tickers, priceTarget: key === A ? 120 : 130 }] }) }] } });
    });
    const client = tr.createTipRanksClient({ providers, fetch, store, now: () => time });
    return { client, toolCalls, stored: () => stored as { month: string; byKey: Record<string, number> } };
  }

  it('counts each key on its own, so a new account is not blocked by the old one\'s calls', async () => {
    const h = harness({ month: '2026-10', byKey: { [tr.keyId(A)]: tr.MONTHLY_CAP } });
    expect(await h.client.research('consensus', 'AAPL', A)).toMatchObject({ budget: true });
    expect(await h.client.research('consensus', 'AAPL', B)).toMatchObject({ status: 200 });
    expect(h.stored().byKey).toEqual({ [tr.keyId(A)]: tr.MONTHLY_CAP, [tr.keyId(B)]: 1 });
    expect(JSON.stringify(h.stored())).not.toContain('tr_live_');
  });

  it('serves a key only its own answers', async () => {
    const h = harness();
    expect((await h.client.research('consensus', 'MSFT', A)).text).toContain('120');
    expect((await h.client.research('consensus', 'MSFT', B)).text).toContain('130');
    expect(h.toolCalls.length).toBe(2);
  });

  it('makes one metered call when two screens ask for the same stock at once', async () => {
    const h = harness();
    const [x, y] = await Promise.all([h.client.research('consensus', 'NVDA', A), h.client.research('consensus', 'NVDA', A)]);
    expect(x.text).toBe(y.text);
    expect(h.toolCalls.length).toBe(1);
  });

  it('never passes the cap with calls made together', async () => {
    const h = harness({ month: '2026-10', byKey: { [tr.keyId(A)]: tr.MONTHLY_CAP - 1 } });
    const answers = await Promise.all(['AAPL', 'MSFT', 'NVDA'].map((t) => h.client.research('consensus', t, A)));
    expect(answers.filter((a) => a.status === 200).length).toBe(1);
    expect(answers.filter((a) => a.budget).length).toBe(2);
    expect(h.stored().byKey[tr.keyId(A)]).toBe(tr.MONTHLY_CAP);
  });

  it('gives a count saved before per-key counting to the key that reads it first', async () => {
    const h = harness({ month: '2026-10', used: tr.MONTHLY_CAP });
    expect(await h.client.research('consensus', 'AAPL', A)).toMatchObject({ budget: true });
  });
});

describe('official statistics stay current within a session', async () => {
  const fred = await import('../src/data/live/fred');

  it('drops Eurostat\'s provisional flag once a figure is sent without it', () => {
    fred.recordStatus('ESTAT:GDP:T1', ['2026-04-01', '2026-07-01'], (d) => (d === '2026-07-01' ? 'p' : undefined));
    expect(fred.figureStatus('ESTAT:GDP:T1', '2026-07-01')).toBe('provisional');
    // The next answer: the July quarter is final; a quarter not in it keeps its flag.
    fred.recordStatus('ESTAT:GDP:T1', ['2026-07-01'], () => undefined);
    expect(fred.figureStatus('ESTAT:GDP:T1', '2026-07-01')).toBeUndefined();
    fred.recordStatus('ESTAT:GDP:T2', ['2026-01-01'], () => 'e');
    fred.recordStatus('ESTAT:GDP:T2', ['2026-04-01'], () => undefined);
    expect(fred.figureStatus('ESTAT:GDP:T2', '2026-01-01')).toBe('estimate');
  });

  it('replaces a CPI read from the BLS earlier with its newer release, but never FRED\'s own series', () => {
    const aug: [string, number][] = [['2026-07-01', 336.2], ['2026-08-01', 336.6]];
    const sep: [string, number][] = [...aug, ['2026-09-01', 336.94]];
    const series: Record<string, [string, number][]> = { CPIAUCNS: aug, UNRATE: [['2026-08-01', 4.3]] };
    fred.takeBlsSeries(series, new Set(), { cpi: sep, un: [['2026-09-01', 4.2]] });
    expect(series.CPIAUCNS.at(-1)).toEqual(['2026-09-01', 336.94]);
    expect(series.UNRATE.at(-1)).toEqual(['2026-09-01', 4.2]);
    // FRED gave the series in this load: it stays.
    const fromFred: Record<string, [string, number][]> = { CPIAUCNS: aug, UNRATE: [] };
    fred.takeBlsSeries(fromFred, new Set(['CPIAUCNS']), { cpi: sep, un: [] });
    expect(fromFred.CPIAUCNS).toBe(aug);
    // An older BLS answer does not replace a later series.
    const later: Record<string, [string, number][]> = { CPIAUCNS: sep };
    fred.takeBlsSeries(later, new Set(), { cpi: aug, un: [] });
    expect(later.CPIAUCNS).toBe(sep);
  });
});
