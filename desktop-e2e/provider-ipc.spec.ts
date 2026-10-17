/// <reference types="vite/client" />
import { _electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KeyedAnswer } from '../src/data/live/lookup';

const repository = fileURLToPath(new URL('..', import.meta.url));
const FMP_ERROR = 'Invalid API key. Deterministic FMP refusal.';
const MARKETAUX_ERROR = 'Invalid API token. Deterministic Marketaux refusal.';
const PRICE = '123.45';

interface Fixtures {
  tradeAgeMs: number;
  calls: { fmp: number; marketaux: number; alpaca: string[] };
}
type FixtureGlobal = typeof globalThis & { __desktopFixtures: Fixtures };
type Desktop = { app: ElectronApplication; page: Page; errors: string[] };

const test = base.extend<{ desktop: Desktop }>({
  desktop: async ({ playwright: _playwright }, runFixture) => {
    if (process.platform === 'linux' && !process.env.DISPLAY) throw new Error('Desktop tests need an X display. Run with xvfb-run or set DISPLAY to a running Xvfb server.');
    const profile = await mkdtemp(join(tmpdir(), 'armin-desktop-test-'));
    // Do not inherit provider credentials. These syntactically valid strings are test fixtures only.
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value !== undefined && !/(?:API_(?:KEY|TOKEN|SECRET)|ALPACA|APCA|MARKETAUX|FINNHUB|POLYGON|SEC_USER_AGENT|ELECTRON_RUN_AS_NODE)/i.test(name))) as Record<string, string>;
    let app: ElectronApplication | undefined;
    try {
      app = await _electron.launch({
        args: ['.', '--no-sandbox'], // Only this test process: the cloud cannot create Chromium user namespaces.
        cwd: repository,
        env: {
          ...inherited,
          XDG_CONFIG_HOME: profile,
          XDG_CACHE_HOME: join(profile, 'cache'),
          APPDATA: profile,
          LOCALAPPDATA: profile,
          YAHOO_PRICES_ENABLED: 'false', KRAKEN_ENABLED: 'false',
          FINNHUB_ENABLED: 'false', MARKETWATCH_RSS_ENABLED: 'false',
          FMP_ENABLED: 'true', MARKETAUX_ENABLED: 'true', ALPACA_ENABLED: 'true',
          FMP_API_KEY: 'DesktopFixtureKey1234567890',
          MARKETAUX_API_TOKEN: 'DesktopFixtureToken1234567890',
          ALPACA_API_KEY_ID: 'PKFIXTURE0000000000',
          ALPACA_API_SECRET_KEY: 'DesktopFixtureSecret0000000000000000',
        },
      });
      // Replace the transport, not IPC or renderer data. Every later main-process request is local;
      // unneeded background providers receive an empty fixture and never call the real transport.
      await app.evaluate(({ net }) => {
        const fixtures: Fixtures = { tradeAgeMs: 0, calls: { fmp: 0, marketaux: 0, alpaca: [] } };
        (globalThis as FixtureGlobal).__desktopFixtures = fixtures;
        net.fetch = async (input) => {
          const url = new URL(String(input));
          const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
          if (url.hostname === 'financialmodelingprep.com') {
            fixtures.calls.fmp++;
            return json({ 'Error Message': 'Invalid API key. Deterministic FMP refusal.' });
          }
          if (url.hostname === 'api.marketaux.com') {
            fixtures.calls.marketaux++;
            return json({ error: { code: 'invalid_api_token', message: 'Invalid API token. Deterministic Marketaux refusal.' } });
          }
          if (url.hostname === 'data.alpaca.markets') {
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
          return json([]);
        };
      });
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // Block any direct renderer connection as well. Desktop provider traffic uses the mocked net.fetch.
      await app.context().route(/^https?:/, (route) => route.abort());
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
      });
      await page.reload();
      await expect(page.locator('#cmd-0')).toBeVisible();
      await runFixture({ app, page, errors });
      expect(errors).toEqual([]);
    } finally {
      await app?.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

async function command(page: Page, text: string, code = text.split(' ').at(-1)!) {
  const input = page.locator('#cmd-0');
  await input.click();
  await input.press('Escape');
  await input.fill(text);
  await input.press('Enter');
  await expect(page.locator('.panel').first().locator('.fnh-code').first()).toHaveText(code);
}

async function enableIex(page: Page) {
  await command(page, 'PROVIDERS');
  const setting = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'ALPACA_IEX_PRICES_ENABLED', exact: true }) });
  await expect(setting.getByRole('button', { name: 'Switch on', exact: true })).toBeEnabled();
  await setting.getByRole('button', { name: 'Switch on', exact: true }).click();
  await expect(setting).toContainText('Saved. Reload the window to apply it.');
  await setting.getByRole('button', { name: 'Reload now', exact: true }).click();
  await expect(page.locator('#cmd-0')).toBeVisible();
}

async function calls(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as FixtureGlobal).__desktopFixtures.calls);
}

test('HTTP 200 provider refusals cross desktop IPC as errors and are never cached as successes', async ({ desktop: { app, page } }) => {
  await command(page, 'AAPL ANALYSTS');
  await expect(page.locator('.panel').first().locator('.pad .amber')).toContainText(FMP_ERROR);
  await expect.poll(async () => (await calls(app)).fmp).toBe(5);
  const beforeFmp = (await calls(app)).fmp;
  const fmp: KeyedAnswer = await page.evaluate(() => window.arminDesktop!.analysts!('consensus', 'AAPL'));
  expect(fmp).toMatchObject({ text: '', error: expect.stringContaining(FMP_ERROR) });
  expect(fmp.cached).toBeUndefined();
  expect((await calls(app)).fmp).toBe(beforeFmp + 1);

  await command(page, 'AAPL COMPANYNEWS');
  await expect(page.locator('.panel').first().locator('.fnh-sub')).toContainText(MARKETAUX_ERROR);
  await expect(page.locator('.panel').first().locator('.news-item')).toHaveCount(0);
  const beforeNews = (await calls(app)).marketaux;
  const news: KeyedAnswer = await page.evaluate(() => window.arminDesktop!.news!('marketaux', 'AAPL'));
  expect(news).toMatchObject({ text: '', error: expect.stringContaining(MARKETAUX_ERROR) });
  expect(news.cached).toBeUndefined();
  expect((await calls(app)).marketaux).toBe(beforeNews + 1);

  const report = await page.evaluate(() => window.arminDesktop!.providersStatus!());
  for (const provider of ['fmp', 'marketaux']) {
    expect(report.providers[provider].lastSuccessAt).toBeNull();
    expect(report.providers[provider].lastErrorKind).toBe('not-entitled');
  }
  await command(page, 'PROVIDERS');
  for (const [name, message] of [['Financial Modeling Prep', FMP_ERROR], ['Marketaux', MARKETAUX_ERROR]]) {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
    await expect(row.locator('.badge')).toHaveText('ERROR');
    await expect(row).toContainText(message);
  }
});

test('the explicit IEX source switch supplies watchlist and quote prices with one-venue labels', async ({ desktop: { app, page } }) => {
  expect((await calls(app)).alpaca).toHaveLength(0);
  await enableIex(page);
  await command(page, 'WATCHLIST');
  const row = page.locator('.panel').first().getByRole('row').filter({ has: page.getByRole('button', { name: 'AAPL US', exact: true }) });
  await expect(row.getByRole('cell').nth(2)).toHaveText(PRICE);
  await expect(row.getByRole('cell').nth(5)).toHaveText('123.40');
  await expect(row.getByRole('cell').nth(6)).toHaveText('123.50');
  await expect(row.getByRole('cell').nth(2).locator('[title]')).toHaveAttribute('title', /IEX/i);
  await expect(row.locator('.stale-px')).toHaveCount(0);
  await command(page, 'AAPL QUOTE');
  const quote = page.locator('.panel').first();
  await expect(quote.getByText('Alpaca · IEX only', { exact: false }).first()).toBeVisible();
  await expect(quote.getByText('IEX ONLY', { exact: true })).toBeVisible();
  await expect(quote.getByText('REAL-TIME', { exact: true })).toBeVisible();
  expect((await calls(app)).alpaca.length).toBeGreaterThan(0);
  for (const url of (await calls(app)).alpaca) expect(new URL(url).searchParams.get('feed')).toBe('iex');
});

test('a newly fetched IEX snapshot keeps an old trade stale on the main quote and watchlist', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.tradeAgeMs = 5 * 60_000; });
  await enableIex(page);
  await command(page, 'AAPL QUOTE');
  const quote = page.locator('.panel').first();
  await expect(quote.locator('.fr-stale')).toHaveText('STALE');
  await expect(quote.locator('.fr-rt')).toHaveCount(0);
  await expect(quote.getByText('IEX ONLY', { exact: true })).toBeVisible();
  const answer: KeyedAnswer = await page.evaluate(() => window.arminDesktop!.alpaca!('snapshots', 'AAPL'));
  expect(answer.status).toBe(200);
  expect(answer.stale).not.toBe(true);
  const tradeAt = Date.parse(JSON.parse(answer.text).AAPL.latestTrade.t);
  expect(answer.at! - tradeAt).toBeGreaterThanOrEqual(5 * 60_000);
  expect(Date.now() - answer.at!).toBeLessThan(10_000);
  await command(page, 'WATCHLIST');
  const row = page.locator('.panel').first().getByRole('row').filter({ has: page.getByRole('button', { name: 'AAPL US', exact: true }) });
  await expect(row.getByRole('cell').nth(2)).toHaveText(PRICE);
  await expect(row.locator('.stale-px')).toHaveAttribute('title', /STALE:.*IEX/i);
});
