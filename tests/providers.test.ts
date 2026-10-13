import { describe, expect, it } from 'vitest';
import { PROVIDERS, providerState, type ProviderReport } from '../src/data/providers';
import { timingOf } from '../src/data/live/yahoo';
// The main-process module; outside Electron the functions tested here do not touch electron.
import * as providers from '../electron/providers.cjs';

describe('provider credentials', () => {
  it('accepts only well-formed keys and a real SEC contact', () => {
    const { FRED_API_KEY, MASSIVE_API_KEY, SEC_USER_AGENT } = providers.CREDENTIALS;
    expect(FRED_API_KEY.valid('abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
    expect(FRED_API_KEY.valid('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456')).toBe(false);
    expect(FRED_API_KEY.valid('short')).toBe(false);
    expect(MASSIVE_API_KEY.valid('a1B2c3D4e5F6g7H8')).toBe(true);
    expect(MASSIVE_API_KEY.valid('has spaces in it')).toBe(false);
    expect(SEC_USER_AGENT.valid('Armin Terminal someone@mail.org')).toBe(true);
    // The SEC needs a contact it can reach: no placeholder domains, no bare names.
    expect(SEC_USER_AGENT.valid('YourAppName contact@example.com')).toBe(false);
    expect(SEC_USER_AGENT.valid('Armin Terminal')).toBe(false);
  });

  it('reads KEY=VALUE lines from a .env file', () => {
    expect(providers.parseDotEnv('# comment\nFRED_API_KEY=abc\nSEC_USER_AGENT="My App me@mail.org"\n\nBAD LINE\n')).toEqual({ FRED_API_KEY: 'abc', SEC_USER_AGENT: 'My App me@mail.org' });
  });
});

describe('provider accounting', () => {
  it('classifies failures into the documented kinds', () => {
    expect(providers.errorKind(401)).toBe('not-entitled');
    expect(providers.errorKind(429)).toBe('rate-limited');
    expect(providers.errorKind(503)).toBe('provider-error');
    expect(providers.errorKind(0, { name: 'TimeoutError' })).toBe('timeout');
    expect(providers.errorKind(0, new TypeError('fetch failed'))).toBe('network');
  });

  it('records requests and never keeps a URL in an error', () => {
    providers.recordRequest('test-provider');
    providers.recordResult('test-provider', 0, new Error('failed https://api.example.org/x?api_key=SECRET'));
    const s = providers.providerStats()['test-provider'];
    expect(s.lastMinute).toBe(1);
    expect(s.lastErrorKind).toBe('network');
    expect(s.lastError).not.toContain('SECRET');
    expect(s.lastError).toContain('<url>');
  });

  it('keeps the provider\'s own explanation of a failure, without the key or links', () => {
    // FRED's answer to a request without a key, as received on 12 October 2026 (HTTP 400).
    expect(providers.providerMessage('{"error_code":400,"error_message":"Bad Request.  Variable api_key is not set.  Read https:\\/\\/fred.stlouisfed.org\\/docs\\/api\\/api_key.html for more information."}')).toBe('Bad Request. Variable api_key is not set.');
    // An unregistered key, from FRED's errors page, in JSON and XML.
    expect(providers.providerMessage('{"error_code":400,"error_message":"Bad Request.  The value for variable api_key is not registered.  Read https://fred.stlouisfed.org/docs/api/api_key.html for more information."}')).toBe('Bad Request. The value for variable api_key is not registered.');
    expect(providers.providerMessage('<error code="400" message="Bad Request.  Variable api_key has not been set."/>')).toBe('Bad Request. Variable api_key has not been set.');
    // A message that repeats the key loses it.
    const key = 'abcdefghijklmnopqrstuvwxyz123456';
    expect(providers.providerMessage(`{"error_message":"Key ${key} is unknown."}`, [key])).toBe('Key <key> is unknown.');
    expect(providers.providerMessage('<html>Server error</html>')).toBe('');
  });

  it('spaces requests to stay under a limit', async () => {
    const t0 = Date.now();
    await Promise.all([0, 1, 2].map(() => providers.slot('limit-test', 2, 300)));
    // Two go at once; the third waits for the window to pass.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
  });
});

describe('provider status', () => {
  const report: ProviderReport = { credentials: { FRED_API_KEY: { label: 'FRED', configured: false, valid: true, source: null } }, providers: { yahoo: { lastMinute: 3, total: 9, lastSuccessAt: 2000, lastErrorAt: 1000, lastError: 'HTTP 429', lastErrorKind: 'rate-limited' } } };
  const def = (id: string) => PROVIDERS.find((p) => p.id === id)!;

  it('says what each provider is doing from its policy, key and last requests', () => {
    expect(providerState(def('yahoo'), report, 'live')).toBe('live');
    expect(providerState(def('fred'), report)).toBe('not-configured');
    expect(providerState(def('fred'), { ...report, credentials: { FRED_API_KEY: { label: 'FRED', configured: true, valid: true, source: 'environment' } } })).toBe('idle');
    expect(providerState(def('finnhub'), report)).toBe('disabled');
    expect(providerState(def('sec'), report)).toBe('not-configured');
    expect(providerState(def('massive'), report)).toBe('planned');
    expect(providerState(def('yahoo'), { ...report, providers: { yahoo: { ...report.providers.yahoo, lastErrorAt: 3000 } } })).toBe('error');
    // A symbol without data is an answer, not an outage.
    expect(providerState(def('yahoo'), { ...report, providers: { yahoo: { ...report.providers.yahoo, lastErrorAt: 3000, lastErrorKind: 'no-data' } } }, 'live')).toBe('live');
  });

  it('lists official pages and a check date for every provider', () => {
    for (const p of PROVIDERS) {
      expect(p.docs.length).toBeGreaterThan(0);
      for (const d of p.docs) expect(d.url).toMatch(/^https:\/\//);
      expect(p.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('quote timing', () => {
  // Metadata as Yahoo returned it on 12 Oct 2026.
  it('calls a quote live or delayed only when the source says so', () => {
    expect(timingOf({ quoteSourceName: 'Nasdaq Real Time Price', exchangeDataDelayedBy: 15 })).toEqual({ timing: 'realtime', delay: 0, sourceName: 'Nasdaq Real Time Price' });
    expect(timingOf({ quoteSourceName: 'Free Realtime Quote', exchangeDataDelayedBy: 0 }).timing).toBe('realtime');
    expect(timingOf({ quoteSourceName: 'Delayed Quote', exchangeDataDelayedBy: 15 })).toEqual({ timing: 'delayed', delay: 15, sourceName: 'Delayed Quote' });
    expect(timingOf({ exchangeDataDelayedBy: 15 }).timing).toBe('delayed');
    // A delayed label without minutes, or no metadata at all, is not confirmed either way.
    expect(timingOf({ quoteSourceName: 'Delayed Quote', exchangeDataDelayedBy: 0 }).timing).toBe('unknown');
    expect(timingOf({ quoteSourceName: 'CoinMarketCap', exchangeDataDelayedBy: 0 }).timing).toBe('unknown');
    expect(timingOf({}).timing).toBe('unknown');
  });
});
