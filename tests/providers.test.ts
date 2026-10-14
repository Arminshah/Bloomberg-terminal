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

  it('reads pasted keys in the forms people write them, without taking a name for a value', () => {
    // Made-up values in the layout of a list pasted into chat: numbered lines, site names, a Markdown link.
    const text = [
      '1: ALPHA_VANTAGE_API_KEY:  ABCDEFGH12345678',
      '2: TWELVE_DATA_API_KEY: 0123456789abcdef0123456789abcdef',
      '3: COINGECKO_API_KEY: CG-abcdefghijklmnop1234',
      '4: FRED_API_KEY: 0123456789abcdef0123456789abcdef',
      '5: MASSIVE_API_KEY: abcdEFGH1234ijklMNOP5678qrstUVWX',
      '6: SEC_USER_AGENT: Name: Ann Example e-mail: ann@mail.org',
      '7: Finnhub.io: abc123def456ghi789jkl012mno345pqr678stu9',
      '8: Tiingo.Com: 0123456789abcdef0123456789abcdef01234567',
      '9: marketaux.com:  AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCd',
      '10: app.alpaca.markets : PKABCDEFGHIJKLMNOPQRSTUV12',
      '11: site.financialmodelingprep.com: AbCdEfGhIjKlMnOpQrStUvWxYz012345 (with API Calls / Day 0/250)',
      '12: tipranks.com : (Use it as ?apikey=<key>, or as Authorization: Bearer <key>.)  tr_live_AbCdEfGhIjKlMnOpQrStUvWx Authorization: Bearer tr_live_xxxxxxxx',
      'GET https://mcp.tipranks.com/mcp/?apikey=tr_live_xxxxxxxx',
      '[https://app.alpaca.markets/: PKABCDEFGHIJKLMNOPQRSTUV12](https://app.alpaca.markets/:PKABCDEFGHIJKLMNOPQRSTUV12)',
      'ALPACA_API_SECRET_KEY = AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGh',
      'a line about nothing',
    ].join('\n');
    const { found, skipped } = providers.parseCredentialList(text);
    expect(Object.fromEntries(found.map((f: { name: string; value: string }) => [f.name, f.value]))).toEqual({
      ALPHA_VANTAGE_API_KEY: 'ABCDEFGH12345678',
      TWELVE_DATA_API_KEY: '0123456789abcdef0123456789abcdef',
      COINGECKO_API_KEY: 'CG-abcdefghijklmnop1234',
      FRED_API_KEY: '0123456789abcdef0123456789abcdef',
      MASSIVE_API_KEY: 'abcdEFGH1234ijklMNOP5678qrstUVWX',
      SEC_USER_AGENT: 'Ann Example ann@mail.org',
      FINNHUB_API_KEY: 'abc123def456ghi789jkl012mno345pqr678stu9',
      TIINGO_API_KEY: '0123456789abcdef0123456789abcdef01234567',
      MARKETAUX_API_TOKEN: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCd',
      ALPACA_API_KEY_ID: 'PKABCDEFGHIJKLMNOPQRSTUV12',
      FMP_API_KEY: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      TIPRANKS_API_KEY: 'tr_live_AbCdEfGhIjKlMnOpQrStUvWx',
      ALPACA_API_SECRET_KEY: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGh',
    });
    // The placeholder line, the repeated Alpaca link and the line naming no provider are reported, not saved.
    expect(skipped.map((x: { line?: number }) => x.line)).toEqual([13, 14, 16]);
    expect(JSON.stringify(skipped)).not.toContain('PKABCDEFGHIJKLMNOPQRSTUV12');
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
    // Times in this report are a few seconds after the epoch; `now` is set to match.
    const now = 3500;
    expect(providerState(def('yahoo'), report, 'live', now)).toBe('live');
    // A provider asked continually that has not answered for several rounds is stale.
    expect(providerState(def('yahoo'), report, 'live', 2000 + 4 * 60_000)).toBe('stale');
    // Its switch off: switched off, whatever its last answers.
    expect(providerState(def('yahoo'), { ...report, settings: { YAHOO_PRICES_ENABLED: { label: 'Yahoo', value: false, source: 'saved in this app' } } }, 'live', now)).toBe('switched-off');
    expect(providerState(def('fred'), report)).toBe('not-configured');
    expect(providerState(def('fred'), { ...report, credentials: { FRED_API_KEY: { label: 'FRED', configured: true, valid: true, source: 'environment' } } })).toBe('idle');
    expect(providerState(def('coinbase'), report)).toBe('disabled');
    expect(providerState(def('finnhub'), report)).toBe('not-configured');
    expect(providerState(def('sec'), report)).toBe('not-configured');
    expect(providerState(def('massive'), report)).toBe('not-configured');
    expect(providerState(def('fmp'), report)).toBe('not-configured');
    expect(providerState(def('tipranks'), report)).toBe('planned');
    // Alpaca needs both its key ID and its secret, and has its own switch.
    const one = { label: 'Alpaca', configured: true, valid: true, source: 'saved in this app' };
    expect(providerState(def('alpaca'), { ...report, credentials: { ALPACA_API_KEY_ID: one } })).toBe('not-configured');
    const both = { ...report, credentials: { ALPACA_API_KEY_ID: one, ALPACA_API_SECRET_KEY: one } };
    expect(providerState(def('alpaca'), both)).toBe('idle');
    expect(providerState(def('alpaca'), { ...both, settings: { ALPACA_ENABLED: { label: 'Alpaca', value: false, source: 'saved in this app' } } })).toBe('switched-off');
    // Twelve Data with a key stays off until its display-rights switch is on.
    const td = { ...report, credentials: { TWELVE_DATA_API_KEY: { label: 'Twelve Data', configured: true, valid: true, source: 'environment' } }, settings: { TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED: { label: 'Twelve Data display rights', value: false, source: null } } };
    expect(providerState(def('twelvedata'), td)).toBe('switched-off');
    expect(providerState(def('twelvedata'), { ...td, settings: { TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED: { label: 'Twelve Data display rights', value: true, source: 'saved in this app' } } })).toBe('idle');
    expect(providerState(def('yahoo'), { ...report, providers: { yahoo: { ...report.providers.yahoo, lastErrorAt: 3000 } } }, undefined, now)).toBe('error');
    // A symbol without data is an answer, not an outage.
    expect(providerState(def('yahoo'), { ...report, providers: { yahoo: { ...report.providers.yahoo, lastErrorAt: 3000, lastErrorKind: 'no-data' } } }, 'live', now)).toBe('live');
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

describe('provider accounting for the status page', () => {
  it('records when a request went out and how long a successful one took', () => {
    const t = providers.recordRequest('latency-test');
    providers.recordResult('latency-test', 200, undefined, t - 120);
    const st = providers.providerStats()['latency-test'];
    expect(st.lastAttemptAt).toBe(t);
    expect(st.lastLatencyMs).toBeGreaterThanOrEqual(120);
    // A failure keeps the last good latency and records its kind.
    providers.recordRequest('latency-test');
    providers.recordResult('latency-test', 429);
    const after = providers.providerStats()['latency-test'];
    expect(after.lastErrorKind).toBe('rate-limited');
    expect(after.lastLatencyMs).toBe(st.lastLatencyMs);
  });
});

describe('daily allowances and refusals of the keyed sources', () => {
  it('keeps every daily allowance below the free plan, and counts requests', () => {
    for (const d of Object.values(providers.DAILY)) expect(d.cap).toBeLessThan(d.limit);
    expect(providers.DAILY.fmp).toEqual({ limit: 250, cap: 220 });
    expect(providers.DAILY.marketaux).toEqual({ limit: 100, cap: 90 });
    const before = providers.usedToday('marketaux');
    providers.recordRequest('marketaux');
    expect(providers.usedToday('marketaux')).toBe(before + 1);
    expect(providers.withinDailyCap('marketaux')).toBe(true);
    for (let i = providers.usedToday('marketaux'); i < providers.DAILY.marketaux.cap; i++) providers.recordRequest('marketaux');
    expect(providers.withinDailyCap('marketaux')).toBe(false);
    // A provider without a daily allowance is never stopped by one.
    expect(providers.withinDailyCap('finnhub')).toBe(true);
  });

  it('has a switch for each new source, on by default', () => {
    for (const name of ['FMP_ENABLED', 'FINNHUB_ENABLED', 'MARKETAUX_ENABLED', 'ALPACA_ENABLED', 'TIINGO_ENABLED'] as const) expect(providers.SETTINGS[name].default).toBe(true);
    expect(providers.SETTINGS.MARKETWATCH_RSS_ENABLED.default).toBe(false);
  });

  it("reads each provider's refusal, without the key or links", () => {
    const key = 'AbCdEfGh12345678';
    expect(providers.providerMessage('{"Error Message":"Invalid API KEY. Feel free to create a Free API Key or visit https://site.example/faqs for more information."}')).toBe('Invalid API KEY.');
    expect(providers.providerMessage('{"error":"Invalid API key"}')).toBe('Invalid API key');
    expect(providers.providerMessage('{"error":{"code":"usage_limit_reached","message":"Daily limit reached."}}')).toBe('Daily limit reached.');
    expect(providers.providerMessage('{"detail":"Invalid token."}')).toBe('Invalid token.');
    expect(providers.providerMessage('{"message":"forbidden."}')).toBe('forbidden.');
    expect(providers.providerMessage('"Premium Query Parameter: not available under your current subscription."')).toBe('Premium Query Parameter: not available under your current subscription.');
    expect(providers.providerMessage(`Restricted: key ${key} has no access`, [key])).toBe('Restricted: key <key> has no access');
    expect(providers.providerMessage('<!DOCTYPE html><html>Blocked</html>')).toBe('');
  });
});
