import { describe, expect, it, vi } from 'vitest';
import { optionChainProblem, optionChainRequest } from '../electron/option-chain.cjs';
import { fetchOptionChain, optionAge, optionContract, parseOptionChain } from '../src/data/live/option-chain';
import type { KeyedAnswer } from '../src/data/live/lookup';

const NOW = Date.parse('2026-10-18T15:00:00Z');
const CALL = 'AAPL261120C00100000';
const PUT = 'AAPL261120P00100000';
const snapshot = {
  latestQuote: { t: '2026-10-18T14:59:59.123456789Z', bp: 5, ap: 5.2, bs: 2, as: 3 },
  latestTrade: { t: '2026-10-18T14:40:00Z', p: 5.1, s: 1 },
  impliedVolatility: 0.25, greeks: { delta: 0.5, gamma: 0.03, theta: -0.02, vega: 0.12, rho: 0.01 },
};
const answer = (snapshots: Record<string, unknown> = { [CALL]: snapshot }, next?: string): KeyedAnswer => ({ status: 200, text: JSON.stringify({ snapshots, next_page_token: next ?? null }), at: NOW });

describe('indicative options request boundary', () => {
  it('forces the market-data host and indicative feed and encodes opaque pagination', () => {
    const url = new URL(optionChainRequest({ symbol: 'AAPL', expiry: '2026-11-20', pageToken: 'a+/=&feed=opra' })!);
    expect(url.origin).toBe('https://data.alpaca.markets');
    expect(url.pathname).toBe('/v1beta1/options/snapshots/AAPL');
    expect(url.searchParams.getAll('feed')).toEqual(['indicative']);
    expect(url.searchParams.get('expiration_date')).toBe('2026-11-20');
    expect(url.searchParams.get('page_token')).toBe('a+/=&feed=opra');
    expect(url.searchParams.get('limit')).toBe('1000');
  });
  it.each([null, [], {}, { symbol: 'aapl' }, { symbol: 'AAPL&feed=opra' }, { symbol: 'AAPL', feed: 'opra' }, { symbol: 'AAPL', url: 'https://api.alpaca.markets/v2/orders' },
    { symbol: 'AAPL', expiry: '2026-02-31' }, { symbol: 'AAPL', expiry: 3 }, { symbol: 'AAPL', pageToken: '\nfoo' }, { symbol: 'AAPL', pageToken: 'x'.repeat(2049) }])('rejects arbitrary URL, feed and malformed arguments: %j', (arg) => {
    expect(optionChainRequest(arg)).toBeNull();
  });
});

describe('option snapshots and event timestamps', () => {
  it('validates response schemas in the main process before caching', () => {
    for (const body of ['[]', '{}', '{"snapshots":[]}', '{"snapshots":{},"next_page_token":4}']) expect(optionChainProblem(body)).not.toBeNull();
    expect(optionChainProblem(answer().text)).toBeNull();
    expect(optionChainProblem('{"snapshots":{},"next_page_token":""}')).toBeNull();
  });
  it('decodes OCC strike/date/type and preserves adjusted roots', () => {
    expect(optionContract(CALL)).toMatchObject({ root: 'AAPL', expiry: '2026-11-20', type: 'C', strike: 100 });
    expect(optionContract('AAPL1261120P00095500')).toMatchObject({ root: 'AAPL1', type: 'P', strike: 95.5 });
    expect(optionContract('AAPL260231C00100000')).toBeNull();
    expect(optionContract('AAPL261120C00000000')).toBeNull();
  });
  it('reads provider fields without inventing open interest, volume, a midpoint or a multiplier', () => {
    const parsed = parseOptionChain(answer().text, 'AAPL');
    expect('contracts' in parsed).toBe(true);
    if (!('contracts' in parsed)) return;
    expect(parsed.contracts).toHaveLength(1);
    expect(parsed.contracts[0]).toMatchObject({ symbol: CALL, bid: 5, ask: 5.2, last: 5.1, iv: 0.25, delta: 0.5, quoteAt: NOW - 877, tradeAt: NOW - 20 * 60_000 });
    expect(parsed.contracts[0]).not.toHaveProperty('openInterest');
    expect(parsed.contracts[0]).not.toHaveProperty('multiplier');
  });
  it('keeps zero bids, rejects null numbers/invalid dates and isolates unrelated roots', () => {
    const parsed = parseOptionChain(answer({
      [CALL]: { ...snapshot, latestQuote: { ...snapshot.latestQuote, bp: 0 }, impliedVolatility: null as unknown as number },
      [PUT]: { ...snapshot, latestQuote: { ...snapshot.latestQuote, t: '0001-01-01T00:00:00Z' }, latestTrade: { ...snapshot.latestTrade, p: -1 } },
      MSFT261120C00100000: snapshot,
    }).text, 'AAPL');
    if (!('contracts' in parsed)) throw new Error('expected parsed chain');
    expect(parsed.rejected).toBe(1);
    expect(parsed.contracts[0].bid).toBe(0);
    expect(parsed.contracts[0].iv).toBeNaN();
    expect(parsed.contracts[1].ask).toBeNaN();
    expect(parsed.contracts[1].last).toBeNaN();
  });
  it('rejects malformed schemas and provider refusals', () => {
    for (const text of ['x', '[]', '{}', '{"snapshots":[]}', '{"snapshots":{},"next_page_token":7}', '{"code":40110000,"message":"not entitled"}']) {
      expect(parseOptionChain(text, 'AAPL')).toHaveProperty('error');
    }
  });
  it('ages an old event independently of a recent fetch and rejects future event times', () => {
    expect(optionAge(NOW - 21 * 60_000, NOW)).toBe('STALE · 21m ago');
    expect(optionAge(NOW - 1000, NOW)).toBe('1s ago');
    expect(optionAge(NOW + 60_000, NOW)).toBe('unknown time');
  });
});

describe('bounded option-chain pagination and failures', () => {
  it('retains cached snapshots and their original time after a transport failure', async () => {
    const response = { ...answer(), status: 0, at: NOW - 60_000, stale: true, error: 'Provider paused after network failures.' };
    const result = await fetchOptionChain(vi.fn().mockResolvedValue(response), 'AAPL');
    expect(result).toMatchObject({ state: 'ok', stale: true, pages: 1, at: NOW - 60_000, message: response.error });
    expect(result.contracts).toHaveLength(1);
  });
  it('fetches all pages sequentially, de-duplicates contracts and retains the oldest retrieval', async () => {
    const request = vi.fn().mockResolvedValueOnce(answer(undefined, 'next')).mockResolvedValueOnce({ ...answer({ [CALL]: snapshot, [PUT]: snapshot }), at: NOW + 1000 });
    const result = await fetchOptionChain(request, 'AAPL');
    expect(request.mock.calls).toEqual([[{ symbol: 'AAPL' }], [{ symbol: 'AAPL', pageToken: 'next' }]]);
    expect(result).toMatchObject({ state: 'ok', pages: 2, at: NOW, stale: false });
    expect(result.contracts).toHaveLength(2);
    expect(result.partial).toBeUndefined();
  });
  it('filters a mismatched expiry rather than placing it into the requested chain', async () => {
    const result = await fetchOptionChain(vi.fn().mockResolvedValue(answer()), 'AAPL', '2027-01-15');
    expect(result.contracts).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });
  it('reports partial stale results if the next page is refused', async () => {
    const request = vi.fn().mockResolvedValueOnce(answer(undefined, 'next')).mockResolvedValueOnce({ status: 429, text: '', error: 'HTTP 429: rate limit' });
    const result = await fetchOptionChain(request, 'AAPL');
    expect(result).toMatchObject({ state: 'ok', pages: 1, partial: true, stale: true, message: 'HTTP 429: rate limit' });
    expect(result.contracts).toHaveLength(1);
  });
  it('stops repeated pagination and limits large chains to five pages', async () => {
    const repeated = vi.fn().mockResolvedValue(answer(undefined, 'same'));
    expect(await fetchOptionChain(repeated, 'AAPL')).toMatchObject({ partial: true, pages: 2, message: expect.stringContaining('repeated') });
    const large = vi.fn().mockImplementation(async () => answer(undefined, String(large.mock.calls.length)));
    expect(await fetchOptionChain(large, 'AAPL')).toMatchObject({ partial: true, pages: 5, message: expect.stringContaining('five-page') });
    expect(large).toHaveBeenCalledTimes(5);
  });
  it.each([
    [{ status: 0, text: '', missing: 'ALPACA_API_KEY_ID' }, 'needs-key'],
    [{ status: 0, text: '', gated: 'ALPACA_ENABLED' }, 'off'],
    [{ status: 403, text: '', error: 'Not entitled' }, 'error'],
  ])('surfaces configuration and entitlement failures before displaying any chain', async (response, state) => {
    expect(await fetchOptionChain(vi.fn().mockResolvedValue(response), 'AAPL')).toMatchObject({ state, contracts: [], pages: 0 });
  });
  it('does not continue a closed panel request', async () => {
    let stopped = false;
    const request = vi.fn(async () => { stopped = true; return answer(undefined, 'next'); });
    await fetchOptionChain(request, 'AAPL', '', () => stopped);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
