/// <reference types="vite/client" />
import { _electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, open, realpath, rm, unlink, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KeyedAnswer } from '../src/data/live/lookup';
import { checkBond, checkForward, checkOptions, checkStrategy, checkSwap } from '../e2e/calculator-checks';

const repository = fileURLToPath(new URL('..', import.meta.url));
const FMP_ERROR = 'Invalid API key. Deterministic FMP refusal.';
const MARKETAUX_ERROR = 'Invalid API token. Deterministic Marketaux refusal.';
const PRICE = '123.45';

interface Fixtures {
  tradeAgeMs: number;
  optionPageFailure: boolean;
  optionMalformed: boolean;
  optionContractCount: number;
  calls: { fmp: number; marketaux: number; alpaca: string[]; options: string[] };
}
type FixtureGlobal = typeof globalThis & { __desktopFixtures: Fixtures };
type Desktop = { app: ElectronApplication; page: Page; errors: string[] };

const test = base.extend<{ desktop: Desktop; sourceDotEnv: boolean }>({
  sourceDotEnv: [false, { option: true }],
  desktop: async ({ playwright: _playwright, sourceDotEnv }, runFixture) => {
    if (process.platform === 'linux' && !process.env.DISPLAY) throw new Error('Desktop tests need an X display. Run with xvfb-run or set DISPLAY to a running Xvfb server.');
    const profile = await mkdtemp(join(tmpdir(), 'armin-desktop-test-'));
    // Do not inherit provider credentials. These syntactically valid strings are test fixtures only.
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value !== undefined && !/(?:API_(?:KEY|TOKEN|SECRET)|ALPACA|APCA|MARKETAUX|FINNHUB|POLYGON|SEC_USER_AGENT|ELECTRON_RUN_AS_NODE)/i.test(name))) as Record<string, string>;
    let app: ElectronApplication | undefined;
    let sourceFile: FileHandle | undefined;
    const sourceFilePath = join(repository, '.env');
    try {
      if (sourceDotEnv) {
        // Regression for a copied .env.example. Exclusive creation never reads or overwrites user keys.
        try {
          sourceFile = await open(sourceFilePath, 'wx', 0o600);
          await sourceFile.writeFile('ALPACA_IEX_PRICES_ENABLED=false\nCOINGECKO_API_KEY=SourceFileFixtureKey1234567890\n');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      app = await _electron.launch({
        args: [join(repository, 'desktop-e2e', 'bootstrap.cjs'), '--no-sandbox'], // Test only: the cloud cannot create Chromium user namespaces.
        cwd: repository,
        env: {
          ...inherited,
          ARMIN_DESKTOP_TEST_PROFILE: profile,
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
      // Windows may expand the runner's short TEMP path; compare actual filesystem locations.
      const canonicalProfile = await realpath(profile);
      expect(await realpath(await app.evaluate(({ app }) => app.getAppPath()))).toBe(canonicalProfile);
      expect(await realpath(await app.evaluate(({ app }) => app.getPath('userData')))).toBe(canonicalProfile);
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
      try {
        await app?.close();
      } finally {
        if (sourceFile) {
          await sourceFile.close();
          await unlink(sourceFilePath);
        }
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
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

test('manual analytics work in real-data desktop mode without any provider prices or rates', async ({ desktop: { page } }) => {
  await checkBond(page, (text, code) => command(page, text, code));
  await checkForward(page, (text, code) => command(page, text, code));
  await checkSwap(page, (text, code) => command(page, text, code));
  await checkOptions(page, (text, code) => command(page, text, code));
  await checkStrategy(page, (text, code) => command(page, text, code));
});

test('indicative option chains cross real IPC, paginate and keep adjusted roots and old timestamps explicit', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.optionContractCount = 101; });
  await command(page, 'AAPL OMON', 'OPTIONS');
  await expect(page.getByTestId('option-chain').getByRole('row')).toHaveCount(101); // header + 100 displayed rows
  await expect(page.getByText('INDICATIVE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next rows', exact: true }).click();
  await expect(page.getByTestId('option-chain').getByRole('row')).toHaveCount(3);
  await expect(page.getByTestId('option-chain')).toContainText('AAPL1');
  await page.getByRole('button', { name: 'Previous rows', exact: true }).click();
  const strikeHeader = page.getByTestId('option-chain').getByRole('columnheader', { name: /^Strike/ });
  await strikeHeader.click();
  // Sorting includes the 200 strike originally beyond the first displayed page.
  await expect(page.getByTestId('option-chain').getByRole('row').nth(1).getByRole('cell').nth(6)).toHaveText('200.000');
  await strikeHeader.focus();
  await strikeHeader.press('Enter');
  await expect(strikeHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByTestId('option-chain').getByRole('row').nth(1).getByRole('cell').nth(6)).toHaveText('100.000');
  await expect(page.getByTestId('option-chain')).toContainText('5.20');
  await command(page, '2', 'OPTIONS');
  await expect(page.getByTestId('option-chain')).toContainText('STALE · 30m ago');
  await expect(page.getByTestId('option-chain')).toContainText('25.00');
  expect((await calls(app)).options).toHaveLength(2);
  for (const value of (await calls(app)).options) {
    const url = new URL(value);
    expect(url.host).toBe('data.alpaca.markets');
    expect(url.searchParams.get('feed')).toBe('indicative');
  }
  const rejected = await page.evaluate(async () => {
    try { await window.arminDesktop!.optionChain!({ symbol: 'AAPL', feed: 'opra' } as { symbol: string }); return false; }
    catch { return true; }
  });
  expect(rejected).toBe(true);
  expect((await calls(app)).options).toHaveLength(2);
});

test('a refused next option page leaves a visibly partial stale chain', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.optionPageFailure = true; });
  await command(page, 'AAPL OMON', 'OPTIONS');
  await expect(page.getByTestId('option-chain').getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: 'PARTIAL CHAIN' })).toContainText('STALE RESPONSE');
  await expect(page.getByRole('status').filter({ hasText: 'PARTIAL CHAIN' })).toContainText('Deterministic option entitlement refusal');
  const report = await page.evaluate(() => window.arminDesktop!.providersStatus!());
  expect(report.providers.alpaca.lastErrorKind).toBe('not-entitled');
});

test('malformed option schemas are not cached or reported as successful and recover on retry', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.optionMalformed = true; });
  for (let k = 0; k < 2; k++) {
    const answer = await page.evaluate(() => window.arminDesktop!.optionChain!({ symbol: 'AAPL' }));
    expect(answer).toMatchObject({ status: 0, text: '', error: 'Alpaca returned no option snapshot map.' });
    expect(answer.cached).toBeUndefined();
  }
  expect((await calls(app)).options).toHaveLength(2);
  const report = await page.evaluate(() => window.arminDesktop!.providersStatus!());
  expect(report.providers.alpaca.lastSuccessAt).toBeNull();
  expect(report.providers.alpaca.lastErrorKind).toBe('schema-changed');
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.optionMalformed = false; });
  await command(page, 'AAPL OMON', 'OPTIONS');
  await expect(page.getByTestId('option-chain').getByRole('row')).toHaveCount(3);
  expect((await calls(app)).options).toHaveLength(4);
});

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

test.describe('source configuration isolation', () => {
  test.use({ sourceDotEnv: true });

  test('ignores source .env settings and credentials before the real application starts', async ({ desktop: { page } }) => {
    const report = await page.evaluate(() => window.arminDesktop!.providersStatus!());
    expect(report.settings?.ALPACA_IEX_PRICES_ENABLED).toMatchObject({ value: false, source: 'default' });
    expect(report.credentials.COINGECKO_API_KEY).toMatchObject({ configured: false, source: null });
    await enableIex(page);
    const updated = await page.evaluate(() => window.arminDesktop!.providersStatus!());
    expect(updated.settings?.ALPACA_IEX_PRICES_ENABLED).toMatchObject({ value: true, source: 'saved in this app' });
    expect(updated.credentials.COINGECKO_API_KEY?.configured).toBe(false);
    await command(page, 'AAPL QUOTE');
    await expect(page.locator('.panel').first().getByText('Alpaca · IEX only', { exact: false }).first()).toBeVisible();
  });
});
