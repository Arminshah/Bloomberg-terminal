// Test entrypoint only; desktop-e2e is excluded from the packaged application's build.files.
// Install isolation before importing production main: even its first provider/status request is local.
const { app, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const profile = process.env.ARMIN_DESKTOP_TEST_PROFILE;
if (!profile || !path.isAbsolute(profile) || !fs.statSync(profile).isDirectory()) throw new Error('Desktop tests require an existing disposable ARMIN_DESKTOP_TEST_PROFILE directory.');
const sessionData = path.join(profile, 'session');
fs.mkdirSync(sessionData, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', sessionData);
// Provider .env discovery is the sole production caller. Assets/preload still resolve from main's __dirname.
app.getAppPath = () => profile;

const fixtures = { tradeAgeMs: 0, optionPageFailure: false, optionMalformed: false, optionContractCount: 1, researchPartial: false, equiblesRefusal: false, calls: { fmp: 0, marketaux: 0, alpaca: [], options: [], finnhub: [], equibles: [] } };
globalThis.__desktopFixtures = fixtures;
net.fetch = async (input, init) => {
  const url = new URL(String(input));
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'financialmodelingprep.com') {
    fixtures.calls.fmp++;
    if (fixtures.researchPartial) {
      if (url.pathname.endsWith('/analyst-estimates')) return json([{ date: '2027-12-31', revenueAvg: 500000000, epsAvg: 1.25, numAnalystsEps: 7 }]);
      return new Response(JSON.stringify({ 'Error Message': 'Premium subscription required for this symbol.' }), { status: 402 });
    }
    return json({ 'Error Message': 'Invalid API key. Deterministic FMP refusal.' });
  }
  if (url.hostname === 'finnhub.io') {
    fixtures.calls.finnhub.push(url.href);
    return json([{ symbol: url.searchParams.get('symbol'), period: '2026-10-01', strongBuy: 2, buy: 4, hold: 1, sell: 0, strongSell: 0 }]);
  }
  if (url.hostname === 'mcp.equibles.com') {
    const body = JSON.parse(init.body);
    fixtures.calls.equibles.push(body);
    if (body.method === 'initialize') return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return json({ jsonrpc: '2.0', id: body.id, result: { tools: [
      { name: 'GetAnalystEstimates', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { ticker: { type: 'string' }, limit: { type: 'integer' } }, required: ['ticker'] } },
      { name: 'GetInsiderTransactions', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { ticker: { type: 'string' }, maxResults: { type: 'integer' } }, required: ['ticker'] } },
    ] } });
    return json({ jsonrpc: '2.0', id: body.id, result: fixtures.equiblesRefusal ? { isError: true, content: [{ type: 'text', text: 'Subscription does not include this research.' }] } : { content: [{ type: 'text', text: `${body.params.arguments.ticker} · ${body.params.name}\nSYNTHETIC TEST REPORT · reported source date 2026-10-01 · USD\nProvider coverage and accounting qualifications retained. <script>throw new Error('Do not execute')</script>` }] } });
  }
  if (url.hostname === 'api.marketaux.com') {
    fixtures.calls.marketaux++;
    return json({ error: { code: 'invalid_api_token', message: 'Invalid API token. Deterministic Marketaux refusal.' } });
  }
  if (url.hostname === 'data.alpaca.markets') {
    if (url.pathname.startsWith('/v1beta1/options/snapshots/')) {
      fixtures.calls.options.push(url.href);
      if (fixtures.optionMalformed) return json({ snapshots: [] });
      if (url.searchParams.has('page_token') && fixtures.optionPageFailure) return new Response(JSON.stringify({ code: 40310000, message: 'Deterministic option entitlement refusal.' }), { status: 403 });
      const snapshot = {
        latestQuote: { t: new Date(Date.now() - 30 * 60_000).toISOString(), bp: 5, ap: 5.2, bs: 2, as: 3 },
        latestTrade: { t: new Date(Date.now() - 35 * 60_000).toISOString(), p: 5.1, s: 1 },
        impliedVolatility: 0.25, greeks: { delta: 0.5, gamma: 0.03, theta: -0.02, vega: 0.12, rho: 0.01 },
      };
      const second = url.searchParams.has('page_token');
      const first = Object.fromEntries(Array.from({ length: fixtures.optionContractCount }, (_, k) => [`AAPL261120C${String((100 + k) * 1000).padStart(8, '0')}`, snapshot]));
      return json({ snapshots: second ? { AAPL261120P00100000: snapshot, AAPL1261120C00100000: snapshot } : first, next_page_token: second ? null : 'second-page' });
    }
    fixtures.calls.alpaca.push(url.href);
    const now = Date.now();
    const tradeAt = now - fixtures.tradeAgeMs;
    const date = new Date(tradeAt).toISOString().slice(0, 10);
    const previous = new Date(tradeAt - 86_400_000).toISOString().slice(0, 10);
    return json(Object.fromEntries((url.searchParams.get('symbols') ?? '').split(',').filter(Boolean).map((symbol) => [symbol, {
      latestTrade: { t: new Date(tradeAt).toISOString(), p: 123.45, s: 10, x: 'V' },
      latestQuote: { t: new Date(now).toISOString(), bp: 123.4, bs: 2, ap: 123.5, as: 3, bx: 'V', ax: 'V' },
      dailyBar: { t: `${date}T04:00:00Z`, o: 120, h: 125, l: 119, c: 123.45, v: 1000 },
      prevDailyBar: { t: `${previous}T04:00:00Z`, o: 118, h: 121, l: 117, c: 120, v: 900 },
    }])));
  }
  // Unneeded background providers get an empty fixture; the real transport is never called.
  return json([]);
};

// Production main installs its Yahoo listener before constructing BrowserWindow. Install this later,
// during construction, so every renderer HTTP/WebSocket request is blocked before loadFile starts.
app.on('web-contents-created', (_event, contents) => {
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, done) => done({ cancel: true }));
});

// Exercise the real window, preload, provider storage/reporting, IPC validation and request broker.
require('../electron/main.cjs');
