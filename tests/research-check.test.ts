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

  it('distinguishes endpoint denial, empty coverage, missing keys and cached responses', async () => {
    const analysts = vi.fn().mockResolvedValueOnce({ status: 402, text: '', error: 'HTTP 402: premium request' }).mockResolvedValueOnce({ status: 200, text: '[]' }).mockResolvedValueOnce({ status: 200, text: '[{"date":"2027-05-31","epsAvg":1}]', cached: true });
    const checks = await checkResearchAccess('APLD', { analysts, finnhubResearch: async () => ({ status: 0, text: '', missing: 'FINNHUB_API_KEY' }), equibles: async () => ({ status: 429, text: '', error: 'Daily quota exceeded' }) });
    expect(checks.map((c) => c.state)).toEqual(['Denied', 'No data', 'Answered', 'Needs key', 'Rate limited']);
    expect(checks[2].detail).toContain('not a new provider access check');
    expect(analysts.mock.calls.map((c) => c[1])).toEqual(['APLD', 'APLD', 'APLD']);
  });
  it('labels stale reports and treats malformed successful responses as errors', async () => {
    const checks = await checkResearchAccess('APLD', { analysts: async () => ({ status: 200, text: '{}' }), equibles: async () => ({ status: 0, text: JSON.stringify({ tool: 'GetAnalystEstimates', report: 'Old report' }), stale: true, at: 123, error: 'HTTP 503' }) });
    expect(checks.slice(0, 3).every((c) => c.state === 'Error')).toBe(true);
    expect(checks[3].state).toBe('Unavailable');
    expect(checks[4]).toMatchObject({ state: 'Stale', at: 123, detail: expect.stringContaining('HTTP 503') });
  });
  it('continues after a transport error and rejects malformed tickers without sending anything', async () => {
    const analysts = vi.fn<() => Promise<KeyedAnswer>>().mockRejectedValue(new Error('transport error'));
    await expect(checkResearchAccess('APLD&x=1', { analysts })).rejects.toThrow('one US stock ticker');
    expect(analysts).not.toHaveBeenCalled();
    const checks = await checkResearchAccess('APLD', { analysts });
    expect(checks).toHaveLength(5);
    expect(checks.slice(0, 3).every((c) => c.state === 'Error')).toBe(true);
  });
});
