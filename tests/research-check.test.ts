import { describe, expect, it, vi } from 'vitest';
import { checkResearchAccess } from '../src/data/live/research-check';
import type { KeyedAnswer } from '../src/data/live/lookup';
import yahooResearch from './fixtures/yahoo-research.json';

describe('research diagnostics', () => {
  it('checks actual Yahoo dataset coverage and honors the research switch', async () => {
    const yahoo = vi.fn(async () => ({ status: 200, data: structuredClone(yahooResearch) }));
    const checks = await checkResearchAccess('APLD', { yahoo });
    expect(checks.find((r) => r.dataset === 'Yahoo analyst research')?.state).toBe('Answered');
    const off = await checkResearchAccess('APLD', { yahoo, settings: { YAHOO_RESEARCH_ENABLED: false } });
    expect(off.find((r) => r.dataset === 'Yahoo analyst research')?.state).toBe('Switched off');
    expect(yahoo).toHaveBeenCalledTimes(1);
  });

  it('keeps a cached credential rejection classified as denied instead of rate limited', async () => {
    const checks = await checkResearchAccess('APLD', { finnhubResearch: async () => ({ status: 401, text: '', error: 'HTTP 401: Invalid API key', retryAt: Date.now() + 60_000 }) });
    expect(checks.find((r) => r.dataset === 'Finnhub recommendation counts')?.state).toBe('Denied');
  });

  // The owner asked on 28 October 2026 that a kept answer never read as a fresh check: it is "Cached", with its time.
  it('distinguishes endpoint denial, empty coverage, missing keys and kept answers', async () => {
    const analysts = vi.fn().mockResolvedValueOnce({ status: 402, text: '', error: 'HTTP 402: premium request' }).mockResolvedValueOnce({ status: 200, text: '[]' }).mockResolvedValueOnce({ status: 200, text: '[{"date":"2027-05-31","epsAvg":1}]', cached: true, at: Date.UTC(2026, 9, 28, 9, 5) });
    const checks = await checkResearchAccess('APLD', { analysts, finnhubResearch: async () => ({ status: 0, text: '', missing: 'FINNHUB_API_KEY' }) });
    expect(checks.map((c) => c.state)).toEqual(['Denied', 'No data', 'Cached', 'Needs key']);
    expect(checks[2]).toMatchObject({ detail: 'Kept answer from 2026-10-28 09:05 UTC; not a new check.', cached: true });
    expect(analysts.mock.calls.map((c) => c[1])).toEqual(['APLD', 'APLD', 'APLD']);
  });

  it('asks every keyed provider again on each press, not for the kept answer', async () => {
    const analysts = vi.fn(async () => ({ status: 200, text: '[]' }));
    const finnhubResearch = vi.fn(async () => ({ status: 200, text: '[]' }));
    await checkResearchAccess('APLD', { analysts, finnhubResearch });
    await checkResearchAccess('APLD', { analysts, finnhubResearch });
    expect(analysts.mock.calls.every((c) => (c as unknown[])[2] === true)).toBe(true);
    expect(analysts).toHaveBeenCalledTimes(6);
    expect(finnhubResearch.mock.calls.map((c) => (c as unknown[])[2])).toEqual([true, true]);
  });
  it('labels stale answers and treats malformed successful responses as errors', async () => {
    const counts = [{ symbol: 'APLD', period: '2026-10-01', strongBuy: 2, buy: 4, hold: 1, sell: 0, strongSell: 0 }];
    const checks = await checkResearchAccess('APLD', { analysts: async () => ({ status: 200, text: '{}' }), finnhubResearch: async () => ({ status: 0, text: JSON.stringify(counts), stale: true, at: 123, error: 'HTTP 503' }) });
    expect(checks.slice(0, 3).every((c) => c.state === 'Error')).toBe(true);
    expect(checks[3]).toMatchObject({ state: 'Stale', at: 123, detail: expect.stringContaining('HTTP 503') });
  });

  // Equibles was retired on 28 October 2026 at the owner's request: the check asks it nothing.
  it('has no Equibles row', async () => {
    const checks = await checkResearchAccess('APLD', { analysts: async () => ({ status: 200, text: '[]' }) });
    expect(checks.map((c) => c.dataset)).toEqual(['FMP price targets', 'FMP ratings', 'FMP annual estimates', 'Finnhub recommendation counts']);
  });
  it('continues after a transport error and rejects malformed tickers without sending anything', async () => {
    const analysts = vi.fn<() => Promise<KeyedAnswer>>().mockRejectedValue(new Error('transport error'));
    await expect(checkResearchAccess('APLD&x=1', { analysts })).rejects.toThrow('one US stock ticker');
    expect(analysts).not.toHaveBeenCalled();
    const checks = await checkResearchAccess('APLD', { analysts });
    expect(checks).toHaveLength(4);
    expect(checks.slice(0, 3).every((c) => c.state === 'Error')).toBe(true);
  });
});
