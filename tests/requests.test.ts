import { describe, expect, it, vi } from 'vitest';
import { createRequester, retryAfter, type ProviderProblem, type RequesterResponse, type RequestPace } from '../electron/requests.cjs';

const URL = 'https://data.example.test/quotes?symbol=AAPL';
const SECRET = 'test-only-credential';
const DATA = '{"price":123.45}';
const START = Date.parse('2026-10-17T12:00:00Z');

function response(text = DATA, status = 200, headers: Record<string, string> = {}): RequesterResponse {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), text: vi.fn(async () => text) };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  let time = START;
  const providers = {
    // Sanitization is injected; these tests check that the transport uses it for returned and logged errors.
    providerMessage: vi.fn((text: string, secrets: string[] = []) => {
      let message = text;
      try { message = JSON.parse(text).message ?? text; } catch { /* plain-text refusal */ }
      for (const secret of secrets) message = message.split(secret).join('<key>');
      return message.replace(/https?:\/\/\S+/g, '<url>');
    }),
    providerPayloadProblem: vi.fn<(_provider: string, _text: string, _secrets?: string[]) => ProviderProblem | null>(() => null),
    withinDailyCap: vi.fn((_provider: string) => true),
    slot: vi.fn(async (_provider: string, _max: number, _windowMs: number) => undefined),
    recordRequest: vi.fn((_provider: string) => time),
    recordResult: vi.fn((_provider: string, _status: number, _error?: unknown, _startedAt?: number) => undefined),
    recordProblem: vi.fn((_provider: string, _kind: string, _message: string) => undefined),
    errorKind: vi.fn((status: number) => status === 429 ? 'rate-limited' : status >= 500 ? 'provider-error' : 'not-entitled'),
  };
  const fetch = vi.fn<(_url: string, _init: RequestInit) => Promise<RequesterResponse>>().mockResolvedValue(response());
  const sleep = vi.fn(async (_ms: number) => undefined);
  const request = createRequester({ providers, fetch, agent: () => 'TestTerminal/1', now: () => time, sleep, random: () => 0 });
  const ask = (url = URL, credential = SECRET, provider = 'fmp', pace: RequestPace = [30, 60_000]) => request(provider, url, { Authorization: `Bearer ${credential}` }, 1_000, pace, [credential]);
  return { providers, fetch, sleep, request, ask, advance: (ms: number) => { time += ms; } };
}

describe('provider GET transport', () => {
  it('caches complete answers with their original arrival time', async () => {
    const h = harness();
    expect(await h.ask()).toEqual({ status: 200, text: DATA, at: START });
    h.advance(500);
    expect(await h.ask()).toEqual({ status: 200, text: DATA, at: START, cached: true });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.providers.recordRequest).toHaveBeenCalledTimes(1);
    expect(h.providers.recordResult).toHaveBeenCalledWith('fmp', 200, undefined, START);
  });

  it.each([
    ['fmp', '{"Error Message":"Premium endpoint"}', 'not-entitled'],
    ['alphavantage', '{"Information":"Daily API limit reached"}', 'rate-limited'],
    ['twelvedata', '{"status":"error","message":"Provider temporarily unavailable"}', 'provider-error'],
  ])('does not cache or record success for an HTTP-200 %s refusal', async (provider, payload, kind) => {
    const h = harness();
    h.providers.providerPayloadProblem.mockReturnValueOnce({ kind, message: 'Provider declined the request.' });
    h.fetch.mockResolvedValueOnce(response(payload));
    expect(await h.ask(URL, SECRET, provider)).toMatchObject({ status: 0, text: '', error: 'Provider declined the request.' });
    expect(h.providers.providerPayloadProblem).toHaveBeenCalledWith(provider, payload, [SECRET]);
    expect(h.providers.recordResult).not.toHaveBeenCalled();
    expect(h.providers.recordProblem).toHaveBeenCalledWith(provider, kind, 'Provider declined the request.');
    // A new valid answer must be fetched; the HTTP-200 refusal must never become cached data.
    h.advance(60_001);
    expect(await h.ask(URL, SECRET, provider)).toMatchObject({ status: 200, text: DATA });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['network', 'body'] as const)('preserves stale data and sanitizes a %s failure, including recorded errors', async (failure) => {
    const h = harness();
    await h.ask();
    h.advance(1_001);
    const error = Object.assign(new Error(`Connection lost for ${SECRET} at https://data.example.test/?apikey=${SECRET}`), { name: 'TimeoutError' });
    if (failure === 'network') h.fetch.mockRejectedValue(error);
    else h.fetch.mockResolvedValue({ ...response(), text: vi.fn(async () => { throw error; }) });

    const result = await h.ask();
    expect(result).toMatchObject({ status: 0, text: DATA, at: START, stale: true });
    expect(result.error).toContain('<key>');
    expect(result.error).not.toContain(SECRET);
    expect(result.error).not.toContain('https://');
    expect(h.fetch).toHaveBeenCalledTimes(4); // one complete answer and three bounded attempts
    expect(h.sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000]);
    const recordedFailures = h.providers.recordResult.mock.calls.slice(1);
    expect(recordedFailures).toHaveLength(3);
    for (const [, status, recorded] of recordedFailures) {
      expect(status).toBe(0);
      expect(recorded).toBeInstanceOf(Error);
      expect((recorded as Error).name).toBe('TimeoutError');
      expect((recorded as Error).message).not.toContain(SECRET);
      expect((recorded as Error).message).not.toContain('https://');
    }
  });

  it('shares an in-flight request between identical callers', async () => {
    const h = harness();
    const started = deferred<void>();
    const answer = deferred<RequesterResponse>();
    h.fetch.mockImplementationOnce(() => { started.resolve(); return answer.promise; });
    const first = h.ask();
    const second = h.ask();
    await started.promise;
    expect(h.fetch).toHaveBeenCalledTimes(1);
    answer.resolve(response());
    expect(await first).toEqual(await second);
    expect(h.providers.recordRequest).toHaveBeenCalledTimes(1);
    expect(h.providers.recordResult).toHaveBeenCalledTimes(1);
  });

  it('keeps cached answers separate when the credential changes', async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(response('{"account":"first"}')).mockResolvedValueOnce(response('{"account":"second"}'));
    expect((await h.ask(URL, 'first-credential')).text).toBe('{"account":"first"}');
    expect((await h.ask(URL, 'second-credential')).text).toBe('{"account":"second"}');
    expect(await h.ask(URL, 'first-credential')).toMatchObject({ text: '{"account":"first"}', cached: true });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each<RequestPace>([[30, 60_000], [30, 60_000, 40]])('rechecks the daily cap after all pacing queues (%j)', async (...pace) => {
    const h = harness();
    const waiting = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    h.providers.slot.mockImplementation(async () => {
      if (++calls === (pace[2] ? 2 : 1)) { waiting.resolve(); await release.promise; }
    });
    const pending = h.ask(URL, SECRET, 'fmp', pace);
    await waiting.promise;
    h.providers.withinDailyCap.mockReturnValue(false);
    release.resolve();
    expect(await pending).toMatchObject({ status: 0, text: '', budget: true });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.providers.recordRequest).not.toHaveBeenCalled();
    if (pace[2]) expect(h.providers.slot).toHaveBeenCalledWith('fmp:hour', pace[2], 3_600_000);
  });

  it('counts a request before fetch so competing requests cannot spend the last daily slot twice', async () => {
    const h = harness();
    let remaining = 1;
    h.providers.withinDailyCap.mockImplementation(() => remaining > 0);
    h.providers.recordRequest.mockImplementation(() => { remaining--; return START; });
    h.fetch.mockImplementation(async () => {
      expect(remaining).toBe(0);
      expect(h.providers.recordRequest).toHaveBeenCalledTimes(1);
      return response();
    });
    const answers = await Promise.all([h.ask(), h.ask(`${URL}&request=second`)]);
    expect(answers.filter((r) => r.status === 200)).toHaveLength(1);
    expect(answers.filter((r) => r.budget)).toHaveLength(1);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['120', 120_000],
    [new Date(START + 90_000).toUTCString(), 90_000],
    ['invalid', 60_000],
  ])('pauses only the throttled provider until Retry-After %s has elapsed', async (header, duration) => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(response('{"message":"Too many requests"}', 429, { 'Retry-After': header }));
    expect(await h.ask()).toMatchObject({ status: 429, retryAt: START + duration });
    expect(await h.ask(`${URL}&other=true`)).toMatchObject({ status: 0, retryAt: START + duration });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    // Another provider is independent of this provider's cooldown.
    expect((await h.ask(URL, SECRET, 'finnhub')).status).toBe(200);
    h.advance(duration - 1);
    expect((await h.ask()).retryAt).toBe(START + duration);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    h.advance(1);
    expect((await h.ask()).status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.sleep).not.toHaveBeenCalled();
  });

  it('opens a temporary breaker after five failed requests and resumes afterwards', async () => {
    const h = harness();
    h.fetch.mockRejectedValue(new TypeError('Service unreachable'));
    for (let i = 0; i < 5; i++) expect((await h.ask()).error).toContain('Service unreachable');
    expect(h.fetch).toHaveBeenCalledTimes(15);
    expect(await h.ask()).toMatchObject({ status: 0, retryAt: START + 120_000, error: 'Paused after 5 failures in a row.' });
    h.advance(119_999);
    expect((await h.ask()).retryAt).toBe(START + 120_000);
    expect(h.fetch).toHaveBeenCalledTimes(15);
    h.advance(1);
    h.fetch.mockResolvedValue(response());
    expect((await h.ask()).status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(16);
  });

  it('retries server errors twice, counting every attempt, and accepts a later complete answer', async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(response('Service unavailable', 503)).mockResolvedValueOnce(response('Bad gateway', 502));
    expect(await h.ask()).toMatchObject({ status: 200, text: DATA });
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.providers.recordRequest).toHaveBeenCalledTimes(3);
    expect(h.providers.recordResult.mock.calls.map(([, status]) => status)).toEqual([503, 502, 200]);
    expect(h.sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000]);
  });

  it('stops retrying a persistent server error after three attempts', async () => {
    const h = harness();
    h.fetch.mockResolvedValue(response('Service unavailable', 503));
    expect(await h.ask()).toMatchObject({ status: 503, text: '', error: 'HTTP 503: Service unavailable' });
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.sleep).toHaveBeenCalledTimes(2);
    expect(h.providers.recordResult.mock.calls.every(([, status]) => status === 503)).toBe(true);
  });

  it.each([401, 402, 403, 404])('does not retry HTTP %i refusals', async (status) => {
    const h = harness();
    h.fetch.mockResolvedValue(response('{"message":"Request refused"}', status));
    expect((await h.ask()).status).toBe(status);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.sleep).not.toHaveBeenCalled();
  });

  it.each(['', 'not JSON', '{"incomplete":'])('rejects an empty or malformed body without caching or recording success (%j)', async (body) => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(response(body));
    expect(await h.ask()).toMatchObject({ status: 0, text: '', error: 'The provider returned an empty or invalid JSON response.' });
    expect(h.providers.recordResult).not.toHaveBeenCalled();
    expect((await h.ask()).text).toBe(DATA);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['sec', 'marketwatch'])('allows complete XML feed bodies from %s', async (provider) => {
    const h = harness();
    h.fetch.mockResolvedValue(response('<feed><title>Official announcements</title></feed>'));
    expect(await h.ask(URL, SECRET, provider)).toMatchObject({ status: 200, text: '<feed><title>Official announcements</title></feed>' });
    expect(h.providers.recordResult).toHaveBeenCalledTimes(1);
  });
});

describe('Retry-After parsing', () => {
  it('accepts seconds and future HTTP dates, and ignores unusable values', () => {
    expect(retryAfter('2', START)).toBe(2_000);
    expect(retryAfter(new Date(START + 5_000).toUTCString(), START)).toBe(5_000);
    for (const value of [undefined, null, '', 'invalid', new Date(START - 1_000).toUTCString()]) expect(retryAfter(value, START)).toBe(0);
  });
});
