/// <reference types="vite/client" />
import { _electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, open, realpath, rm, unlink, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KeyedAnswer } from '../src/data/live/lookup';
import { checkAmericanOption, checkBond, checkForward, checkOptions, checkPortfolioPositions, checkStrategy, checkSwap } from '../e2e/calculator-checks';
import { checkLinkedPanels } from '../e2e/workspace-checks';

const repository = fileURLToPath(new URL('..', import.meta.url));
const FMP_ERROR = 'Invalid API key. Deterministic FMP refusal.';
const MARKETAUX_ERROR = 'Invalid API token. Deterministic Marketaux refusal.';
const PRICE = '123.45';

interface Fixtures {
  dataAccuracy: boolean;
  extendedHours: boolean;
  tradeAgeMs: number;
  optionPageFailure: boolean;
  optionMalformed: boolean;
  optionContractCount: number;
  researchPartial: boolean;
  researchBlocked: boolean;
  profileMissing: boolean;
  mixedEstimateCurrencies: boolean;
  equiblesRefusal: boolean;
  newsStories: boolean;
  newsAgeMs: number;
  marketCalendar?: boolean;
  weekCalendar?: boolean;
  insiders?: boolean;
  thirteenF?: boolean;
  congress?: boolean;
  ecbFx?: boolean;
  supplyChain?: boolean;
  calls: { ecbFx?: string[]; congress?: string[]; sec13f?: string[]; openfigi?: { jobs: { idType: string; idValue: string; exchCode: string }[]; keyed: boolean }[]; fts?: string[]; fmp: number; marketaux: number; alpaca: string[]; options: string[]; alpacaNews: string[]; google: string[]; finnhub: string[]; yahoo: string[]; equibles: { method: string; params: { name?: string; arguments?: Record<string, unknown> } }[]; tipranks: { method: string; name?: string; keyed: boolean }[] };
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
          YAHOO_RESEARCH_ENABLED: 'true',
          FINNHUB_ENABLED: 'false', MARKETWATCH_RSS_ENABLED: 'false',
          FMP_ENABLED: 'true', EQUIBLES_ENABLED: 'true', MARKETAUX_ENABLED: 'true', ALPACA_ENABLED: 'true',
          FMP_API_KEY: 'DesktopFixtureKey1234567890',
          FINNHUB_API_KEY: 'abcd1234efgh5678ij90abcd1234efgh5678kl12',
          EQUIBLES_API_KEY: 'eq_DesktopFixtureEquibles1234567890',
          TIPRANKS_API_KEY: 'tr_live_DesktopFixtureTipRanks0001',
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
      // firstWindow can return while it is still about:blank, whose storage
      // is unavailable. Wait for the real document before resetting state.
      await expect(page).toHaveURL(/^file:/);
      // The first launch on a cold CI runner can take longer than the default 15 seconds to render.
      await expect(page.locator('#cmd-0')).toBeVisible({ timeout: 45_000 });
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

async function command(page: Page, text: string, code = text.split(' ').at(-1)!, panel = 0) {
  const input = page.locator(`#cmd-${panel}`);
  await input.click();
  await input.press('Escape');
  await input.fill(text);
  await input.press('Enter');
  await expect(page.locator('.panel').nth(panel).locator('.fnh-code').first()).toHaveText(code);
}

test("the tab bar is the window's title bar: the window's own buttons sit at its right end, behind a line no tab passes", async ({ desktop: { app, page } }) => {
  const overlay = await page.evaluate(() => {
    const o = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay;
    const r = o?.getTitlebarAreaRect();
    return { visible: !!o?.visible, right: r ? r.x + r.width : NaN, height: r?.height ?? NaN };
  });
  expect(overlay.visible).toBe(true);
  expect(overlay.height).toBe(32);
  const bar = page.locator('.wtabs-bar');
  await expect(bar).toHaveClass(/\bwco\b/);
  const region = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region') || getComputedStyle(el).getPropertyValue('app-region'));
  // The bar drags the window; the tabs and the + button do not.
  expect(await region('.wtabs-bar')).toBe('drag');
  expect(await region('.wtab')).toBe('no-drag');
  expect(await region('.wtab-new')).toBe('no-drag');
  const controls = (await page.locator('.wtabs-controls').boundingBox())!;
  expect(Math.round(controls.x)).toBe(Math.round(overlay.right));
  expect(controls.width).toBeGreaterThan(0);
  // A line marks where the buttons begin.
  expect(await page.locator('.wtabs-controls').evaluate((el) => getComputedStyle(el, '::before').width)).toBe('1px');
  for (let i = 0; i < 11; i++) await page.getByRole('button', { name: 'New tab', exact: true }).click();
  await expect(page.locator('.wtab')).toHaveCount(12);
  const tabs = async () => (await page.locator('nav.wtabs').boundingBox())!;
  const plus = (await page.getByRole('button', { name: 'New tab', exact: true }).boundingBox())!;
  expect(plus.x + plus.width).toBeLessThanOrEqual(controls.x);
  // In a narrow window the tabs scroll; they never pass under the buttons.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(820, 600));
  await expect.poll(async () => Math.round((await page.locator('.wtabs-controls').boundingBox())!.x)).toBeLessThan(820);
  const narrow = (await page.locator('.wtabs-controls').boundingBox())!;
  const nav = await tabs();
  expect(nav.x + nav.width).toBeLessThanOrEqual(narrow.x + 0.5);
});

test('EVENTS opens on the week\'s most traded companies reporting, by day and session, share classes once', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.weekCalendar = true; });
  await command(page, 'EVENTS');
  const panel = page.locator('.panel').first();
  await expect(panel.getByRole('button', { name: '10) Most relevant', exact: true })).toHaveClass(/\bon\b/);
  await expect(panel.locator('.tabs .tab.on')).toContainText('2) Week of');
  const week = panel.locator('table.evts-week');
  // Columns: the session's name, then Monday to Friday.
  const cell = (session: string, day: number) => week.locator('tbody tr', { has: page.locator('th', { hasText: session }) }).locator('td').nth(day);
  await expect(cell('Before open', 1).locator('li')).toHaveCount(3, { timeout: 30_000 });
  // The most traded first: Coca-Cola, then SoFi, then the small bank.
  await expect(cell('Before open', 1).locator('li .sec-link')).toHaveText(['KO US', 'SOFI US', 'BFST US']);
  // Twelve report after Tuesday's close: the ten most traded are shown, the other two counted.
  const late = cell('After close', 1);
  await expect(late.locator('li')).toHaveCount(10);
  await expect(late.locator('li .sec-link').first()).toHaveText('ACL US');
  await expect(late.locator('.evts-week-more')).toHaveText('+2 more');
  // GOOG and GOOGL are one company: the more traded class stands for it.
  await expect(cell('After close', 2).locator('li .sec-link')).toHaveText(['GOOGL US']);
  await expect(week.locator('thead th').nth(2)).toContainText('15 reports');
  await expect(panel.locator('.note')).toContainText("Nasdaq's stock list");
  await expect(panel.locator('.note')).toContainText('16 companies report this week');
  // The week after has no reports in the fixture.
  await panel.locator('.tabs .tab', { hasText: '3) Week of' }).click();
  await expect(panel.getByText('No reports this week.')).toBeVisible({ timeout: 30_000 });
});

test('EVENTS covers the whole market above $5B with expected and reported EPS and revenue, growth and an earnings card', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.marketCalendar = true; process.env.FINNHUB_ENABLED = 'true'; });
  await command(page, 'EVENTS');
  const panel = page.locator('.panel').first();
  await panel.getByRole('button', { name: '14) Market', exact: true }).click();
  await expect(panel.getByRole('button', { name: '14) Market', exact: true })).toHaveClass(/\bon\b/);
  // The market list starts from $50B; this test reads it from $5B.
  await expect(panel.getByRole('button', { name: '$50B', exact: true })).toHaveClass(/\bon\b/);
  await panel.getByRole('button', { name: '$5B', exact: true }).click();
  // It opens on the latest trading day: the days before are folded into one line above it, and a company worth over
  // $500B is tagged.
  const meta0 = panel.locator('tbody tr.click', { hasText: 'META US' });
  await expect(meta0).toBeVisible({ timeout: 30_000 });
  await expect(meta0.locator('.badge.mega')).toHaveText('500B+');
  const fold = panel.locator('tbody tr.evts-fold');
  await expect(fold).toContainText('Earlier in this window', { timeout: 30_000 });
  await expect(fold).toContainText('2 reports');
  await expect(panel.locator('tbody tr.click', { hasText: 'MMM US' })).toHaveCount(0);
  await expect(panel.locator('tbody tr.group').nth(1)).not.toContainText(new Date(Date.now() - 86_400_000).toISOString().slice(8, 10) + '/');
  await fold.click();
  const mmm = panel.locator('tbody tr.click', { hasText: 'MMM US' });
  await expect(mmm.locator('.badge.mega')).toHaveCount(0);
  // EPS from Nasdaq, revenue from FMP, one figure per column: period, EPS expected, reported and surprise, the same
  // for revenue, market value and time.
  const cells = mmm.locator('td');
  await expect(cells.nth(1)).toHaveText(/^Q\d \d{4}$/, { timeout: 30_000 });
  await expect(cells.nth(0)).toContainText('3M Company');
  for (const [i, text] of ['2.38', '2.50', '+5.0%', '6.61B', '6.58B', '-0.4%', '83.55B', 'Bef-mkt'].entries()) await expect(cells.nth(i + 2)).toHaveText(text);
  // A company only Finnhub lists takes its market value from Nasdaq's stock list; one below $5B is left out.
  await expect(panel.locator('tbody tr.click', { hasText: 'XYZW US' })).toContainText('6.10B');
  await expect(panel.locator('tbody tr.click', { hasText: 'TINY US' })).toHaveCount(0);
  // A report still to come: its EPS estimate, and "due" where the reported figure will be.
  const meta = panel.locator('tbody tr.click', { hasText: 'META US' }).locator('td');
  await expect(meta.nth(2)).toHaveText('6.54');
  await expect(meta.nth(3)).toHaveText('due');
  await expect(panel.locator('tbody td.empty')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '$5B', exact: true })).toHaveClass(/\bon\b/);
  await expect(panel.getByRole('button', { name: 'any', exact: true })).toHaveCount(0);
  // The earnings card: expected against reported, beat or miss, and the growth, as an earnings correspondent shows it.
  await cells.nth(1).click();
  const card = panel.locator('.earn-card');
  await expect(card).toContainText('3M Company');
  await expect(card.locator('tr', { hasText: 'Earnings per share' })).toContainText('Beat by 5.0%');
  await expect(card.locator('tr', { hasText: 'Revenue' })).toContainText('Missed by 0.4%');
  await expect(card).toContainText('EPS up 14% year over year');
  await expect(card).toContainText('Revenue up 4.0% year over year');
  await expect(card).toContainText('EPS up 4.2% quarter over quarter');
  await expect(card).toContainText('Revenue up 1.0% quarter over quarter');
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-events-market-fixture.png') });
  await panel.getByLabel('Filter the calendar').fill('meta');
  await expect(panel.locator('tbody tr.click')).toHaveCount(1);
});

test("MANAGEMENT totals each insider's Form 4 purchases, sales and awards, and lists every transaction with its filing", async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.insiders = true;
    // NBIS is looked up on Yahoo (the fixture's search answers it).
    fixtures.dataAccuracy = true;
    process.env.SEC_USER_AGENT = 'Armin Desktop Test desktop-fixture@example.invalid';
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  await command(page, 'NBIS', 'MENU');
  await command(page, 'MANAGEMENT', 'MANAGEMENT');
  const section = page.locator('.sect', { hasText: 'Insider transactions, last 12 months' });
  await expect(section).toContainText('2 of 2 Form 4 filings read', { timeout: 30_000 });
  await expect(section.locator('.insider-total')).toContainText('1 buyer bought 1,000 shares');
  await expect(section.locator('.insider-total')).toContainText('1 seller sold 25,000 shares (4.01M)');
  await expect(section.locator('.insider-total')).toContainText('awarded 12,000 shares');
  const arkady = section.locator('tbody tr', { hasText: 'Arkady Volozh' }).first();
  await expect(arkady).toContainText('Chief Executive Officer');
  await expect(arkady).toContainText('25,000');
  await expect(arkady).toContainText('-24,000');
  await expect(arkady).toContainText('1,476,000');
  await expect(section.locator('tbody tr', { hasText: 'Ophir Boynton' }).first()).toContainText('12,000');
  const sale = section.locator('tbody tr', { hasText: 'Sale · 10b5-1' });
  await expect(sale).toContainText('160.40');
  await expect(sale.getByRole('link', { name: 'Form 4 ›' })).toHaveAttribute('href', /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1513845\/000151384526000011\/xslF345X05\/form4-sale\.xml$/);
  await expect(section.locator('tbody tr', { hasText: 'Grant or award' })).toContainText('+12,000');
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-management-insiders-fixture.png') });
});

test("HOLDINGS lists a company's 13F holdings with the change since the quarter before, tickers by CUSIP and today's value", async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.thirteenF = true;
    // NBIS is looked up on Yahoo (the fixture's search answers it); its filings are NVIDIA's 13Fs, as filed.
    fixtures.dataAccuracy = true;
    process.env.SEC_USER_AGENT = 'Armin Desktop Test desktop-fixture@example.invalid';
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  await command(page, 'NBIS', 'MENU');
  // The stock's menu lists it under Company Analysis, beside HOLDERS.
  const panel = page.locator('.panel').first();
  await panel.locator('.sect', { hasText: 'Company Analysis' }).locator('tr', { hasText: '13F Holdings' }).click();
  await expect(panel.locator('.fnh-code').first()).toHaveText('HOLDINGS');
  await expect(panel.locator('.kv').first()).toContainText('NVIDIA CORP', { timeout: 30_000 });
  await expect(panel.locator('.kv').first()).toContainText('30/06/26');
  await expect(panel.locator('.kv').first()).toContainText('63.44B USD');
  await expect(panel.locator('.kv').nth(1)).toContainText('18.37B USD');
  await expect(panel.locator('.kv').nth(1)).toContainText('1 · 0 · 0');
  await expect(panel.locator('.kv').nth(1)).toContainText('7 · 0');
  const intel = panel.locator('tbody tr', { hasText: 'INTEL CORP' });
  await expect(intel).toContainText('INTC US');
  await expect(intel).toContainText('214,776,632');
  await expect(intel).toContainText('29.99B');
  await expect(intel).toContainText('47.27');
  await expect(intel).toContainText('UNCHANGED');
  // The fixture's price for every stock is 123.45: the quarter's end at 139.63 (value / shares), -11.6% since.
  await expect(intel).toContainText('139.63');
  await expect(intel).toContainText('123.45');
  await expect(intel).toContainText('-11.6%');
  await expect(intel).toContainText('26.51B');
  await expect(panel.locator('tbody tr', { hasText: 'SPACE EXPLORATION' })).toContainText('NEW');
  await expect(panel.locator('tbody tr', { hasText: 'SPACE EXPLORATION' })).toContainText('SPCX US');
  // Nebius's code is a CINS (it starts with a letter): asked for as one, it has a ticker.
  await expect(panel.locator('tbody tr', { hasText: 'NEBIUS GROUP' })).toContainText('NBIS US');
  const figi = await app.evaluate(() => (globalThis as FixtureGlobal).__desktopFixtures.calls.openfigi ?? []);
  expect(figi).toHaveLength(1);
  expect(figi[0].keyed).toBe(false);
  expect(figi[0].jobs).toHaveLength(8);
  expect(figi[0].jobs).toContainEqual({ idType: 'ID_CINS', idValue: 'N97284108', exchCode: 'US' });
  expect(figi[0].jobs).toContainEqual({ idType: 'ID_CUSIP', idValue: '458140100', exchCode: 'US' });
  await panel.getByRole('button', { name: /^2\)\s*Map$/ }).click();
  await expect(panel.getByRole('img', { name: 'Heat map' })).toContainText('INTC');
  await panel.getByRole('button', { name: /^3\)\s*Sold Out$/ }).click();
  await expect(panel).toContainText('Nothing held on 31/03/26 was sold out by 30/06/26.');
  await panel.getByLabel('Quarter', { exact: true }).selectOption('2026-03-31');
  await expect(panel.locator('.kv').first()).toContainText('18.37B USD');
  await expect(panel.locator('.kv').nth(1)).toContainText('no 13F for Q4 2025');
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-holdings-13f-fixture.png') });
  // Each filing is read once: the second quarter's cover, list and table, then the first quarter's.
  const sec = await app.evaluate(() => (globalThis as FixtureGlobal).__desktopFixtures.calls.sec13f ?? []);
  expect(sec.filter((p) => p.endsWith('/information_table.xml'))).toHaveLength(2);
  // A 13F lists what the manager has investment discretion over: a bank's or adviser's includes its clients' accounts.
  await expect(panel).toContainText('over which it had investment discretion');
  await expect(panel).toContainText('so its list is not its own holdings');
  await expect(panel).toContainText('fewer than 10,000 shares worth less than $200,000');
});

test("CONGRESS ranks representatives by their annual reports' assets, lists both chambers' trades and the stocks bought and owned most", async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    (globalThis as FixtureGlobal).__desktopFixtures.congress = true;
  });
  await command(page, 'CONGRESS', 'CONGRESS');
  const panel = page.locator('.panel').first();
  // Nothing is asked for before the law's notice is read.
  await expect(panel).toContainText('5 U.S.C. § 13107(c)');
  expect(await app.evaluate(() => (globalThis as FixtureGlobal).__desktopFixtures.calls.congress ?? [])).toEqual([]);
  await panel.getByRole('button', { name: 'I understand: read the disclosures' }).click();
  const pelosi = panel.locator('tbody tr', { hasText: 'Nancy Pelosi' }).first();
  await expect(pelosi).toContainText('85.94M–412.41M', { timeout: 30_000 });
  await expect(panel.locator('tbody tr').first()).toContainText('Nancy Pelosi');
  await expect(panel.locator('tbody tr', { hasText: 'Brian J. Mast' })).toContainText('600.00K–1.25M');
  await expect(panel.locator('tbody tr', { hasText: 'Cleo Fields' })).toContainText('none');
  await panel.getByRole('button', { name: /^2\)\s*Trades$/ }).click();
  await panel.getByLabel('Filter', { exact: true }).fill('NVDA');
  const nvda = panel.locator('tbody tr', { hasText: 'NVIDIA' });
  // Three purchases in three accounts from the report itself (FMP's one line of it left out), and a senator's from FMP.
  await expect(nvda).toHaveCount(4);
  await expect(nvda.filter({ hasText: 'Cleo Fields' })).toHaveCount(3);
  await expect(nvda.filter({ hasText: 'Cleo Fields' }).first().getByRole('link', { name: 'PDF ›' })).toHaveAttribute('href', /ptr-pdfs\/\d{4}\/20035669\.pdf$/);
  await expect(nvda.filter({ hasText: 'John Boozman' })).toContainText('Sen. AR');
  await expect(nvda.filter({ hasText: 'John Boozman' }).getByRole('link', { name: 'FMP ›' })).toHaveAttribute('href', 'https://efdsearch.senate.gov/search/view/ptr/fixture-boozman/');
  await panel.getByLabel('Filter', { exact: true }).fill('');
  // A report filed on paper is a scan: its trade is FMP's line.
  await expect(panel.locator('tbody tr', { hasText: 'Microsoft Corporation' })).toContainText('Michael McCaul');
  await expect(panel.locator('tbody tr', { hasText: 'Bloom Energy' })).toHaveCount(4);
  await panel.getByRole('button', { name: /^3\)\s*Most Traded$/ }).click();
  await panel.getByLabel('Rank', { exact: true }).selectOption('buys');
  await expect(panel.locator('tbody tr').first()).toContainText('NVDA US');
  await expect(panel.locator('tbody tr').first()).toContainText('4');
  await panel.getByLabel('Chamber', { exact: true }).selectOption('Senate');
  await panel.getByLabel('Rank', { exact: true }).selectOption('sells');
  await expect(panel.locator('tbody tr').first()).toContainText('WMB US');
  await panel.getByLabel('Chamber', { exact: true }).selectOption('all');
  await panel.getByRole('button', { name: /^4\)\s*Most Owned$/ }).click();
  await panel.getByLabel('Filter', { exact: true }).fill('AAPL');
  await expect(panel.locator('tbody tr').first()).toContainText('Apple Inc.');
  await expect(panel.locator('tbody tr').first()).toContainText('5.00M–25.00M');
  await panel.getByLabel('Chamber', { exact: true }).selectOption('Senate');
  await expect(panel).toContainText("Senators' holdings are in their annual reports on the Senate's disclosure site");
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-congress-fixture.png') });
  // A stock's own view: its trades.
  await command(page, 'NVDA US Equity CONGRESS', 'CONGRESS');
  await expect(panel.getByLabel('Filter', { exact: true })).toHaveValue('NVDA');
  await expect(panel.locator('tbody tr', { hasText: 'NVIDIA' })).toHaveCount(4);
});

test("PORTFOLIO takes a past purchase's entry exchange rate from the ECB's reference rate of that day", async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    (globalThis as FixtureGlobal).__desktopFixtures.ecbFx = true;
  });
  await command(page, 'PORTFOLIO', 'PORTFOLIO');
  const panel = page.locator('.panel').first();
  await panel.getByLabel('Security', { exact: true }).fill('HSBA LN Equity');
  await panel.getByLabel('Quantity', { exact: true }).fill('100');
  await panel.getByLabel('Price', { exact: true }).fill('1000');
  // Sunday 28 June 2026: the ECB published no rates, so Friday's.
  await panel.getByLabel('Bought on', { exact: true }).fill('2026-06-28');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.cmd-msg')).toContainText("Entry rate 1.321809 USD per GBP: the ECB's of 26/06/26.");
  const calls = await app.evaluate(() => (globalThis as FixtureGlobal).__desktopFixtures.calls.ecbFx ?? []);
  expect(calls).toEqual(['/service/data/EXR/D..EUR.SP00.A?format=csvdata&startPeriod=2026-06-18&endPeriod=2026-06-28']);
  // The portfolio store saves after a moment.
  const savedPosition = () => page.evaluate(() => JSON.parse(localStorage.getItem('armin:portfolios') ?? 'null')?.s?.list?.[0]?.positions?.[0] ?? null);
  await expect.poll(savedPosition).not.toBeNull();
  const saved = await savedPosition();
  expect(saved).toMatchObject({ id: 'HSBA LN Equity', qty: 100, cost: 1000, entryBase: 'USD', entryFxNote: 'ECB reference rate of 2026-06-26' });
  expect(saved.entryFx).toBeCloseTo(1.1401 / 0.86253, 12);
  // The ECB's framework (23 June 2026): rates for information, set around 14:10 CET, published around 16:00 CET.
  await expect(panel).toContainText('The ECB publishes its rates for information, at about 16:00 CET for about 14:10 CET: the rate your bank or broker applied can differ.');
});

test('SPLC reads suppliers, customers and competitors from the SEC filings that name the company and from its own report', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.supplyChain = true;
    fixtures.dataAccuracy = true;
    process.env.SEC_USER_AGENT = 'Armin Desktop Test desktop-fixture@example.invalid';
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  await command(page, 'NBIS', 'MENU');
  await command(page, 'SPLC', 'SUPPLYCHAIN');
  const panel = page.locator('.panel').first();
  // Fabrinet's report: Nebius brought 12.5% of its revenue, in the place Nebius has in its list of three.
  const fabrinet = panel.locator('.splc-box', { hasText: 'Fabrinet' });
  await expect(fabrinet).toContainText('Rev: 12.5%', { timeout: 30_000 });
  await expect(panel.locator('.splc-center')).toContainText('Rev. quantified 12.0% (1 customer)');
  await expect(panel.locator('.splc-center')).toContainText('3 filings read');
  await panel.getByRole('button', { name: '2) Suppliers' }).click();
  await expect(panel.locator('tbody tr').first()).toContainText('NBIS US brought 12.5% of its revenue');
  const row = (name: string) => panel.locator('tbody tr', { has: page.locator('td:nth-child(2)', { hasText: name }) });
  await expect(row('NVIDIA')).toContainText('Named by NBIS US as a supplier');
  await expect(row('NVIDIA')).toContainText('NVDA');
  await expect(row('Dell Technologies')).toContainText('DELL');
  await panel.getByRole('button', { name: '3) Customers' }).click();
  await expect(panel.locator('tbody tr').first()).toContainText('12% of NBIS US');
  await expect(row('Example Cloud')).toContainText('Names NBIS US as a supplier');
  await expect(row('Example Cloud').getByRole('link', { name: /10-K/ })).toHaveAttribute('href', 'https://www.sec.gov/Archives/edgar/data/2222222/000222222226000004/excl-20251231.htm');
  await panel.getByRole('button', { name: '4) Competitors' }).click();
  await expect(row('Microsoft')).toContainText('Named by NBIS US as a competitor');
  await expect(row('CoreWeave')).toHaveCount(1);
  const searched = await app.evaluate(() => (globalThis as FixtureGlobal).__desktopFixtures.calls.fts ?? []);
  // Few documents name it: they are all read, found by the name alone (the shortest name covers the longer ones).
  expect(searched).toContain('"Nebius"');
  expect(searched.some((q) => /Nebius Group/.test(q ?? ''))).toBe(false);
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-splc-fixture.png') });
});

test('linked panels preserve functions and saved groups in the real desktop renderer', async ({ desktop: { page } }) => {
  await checkLinkedPanels(page, (text, code, panel) => command(page, text, code, panel));
});

test('field inspection distinguishes missing data, IEX trade freshness, and unknown bid/ask time', async ({ desktop: { app, page } }) => {
  await command(page, 'AAPL FLDS PX_LAST', 'FIELDS');
  await expect(page.getByTestId('field-value')).toContainText('Not available');
  await expect(page.locator('.field-definition')).toContainText('UNAVAILABLE');
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.tradeAgeMs = 5 * 60_000; });
  await enableIex(page);
  await command(page, 'AAPL FLDS PX_LAST', 'FIELDS');
  await expect(page.getByTestId('field-value')).toHaveText('123.4500 · USD');
  await expect(page.locator('.field-definition')).toContainText('STALE');
  await expect(page.locator('.field-definition')).toContainText('Alpaca · IEX only');
  await page.getByLabel('Search data fields').fill('BID');
  await page.getByRole('button', { name: 'Inspect BID', exact: true }).click();
  await expect(page.getByTestId('field-value')).toHaveText('123.4000 · USD');
  await expect(page.locator('.field-definition')).toContainText('TIMESTAMP UNAVAILABLE');
  await expect(page.locator('.field-definition')).toContainText('SOURCE STALE');
  await expect(page.locator('.field-definition')).toContainText('The last trade timestamp does not verify bid/ask freshness');
});

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

test('holders sort and filter by reported period, and short float is calculated from reported share counts', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.dataAccuracy = true; process.env.YAHOO_PRICES_ENABLED = 'true'; });
  await page.reload();
  await command(page, 'AAPL HOLDERS');
  const positions = page.locator('table.tbl tbody tr').filter({ hasText: 'Synthetic Holder' });
  await expect(positions).toHaveCount(2);
  await expect(positions.first()).toContainText('Recent Synthetic Holder');
  // Newest holdings first, then oldest first.
  await page.getByRole('columnheader', { name: /File Dt/ }).click();
  await expect(positions.first()).toContainText('Recent Synthetic Holder');
  await page.getByRole('columnheader', { name: /File Dt/ }).click();
  await expect(positions.first()).toContainText('Older Synthetic Holder');
  await page.getByLabel('Holdings as of').selectOption('latest');
  await expect(positions).toHaveCount(1);
  await expect(positions.first()).toContainText('Recent Synthetic Holder');
  await command(page, 'AAPL DES', 'PROFILE');
  await page.getByRole('button', { name: /2\) Issue Info/ }).click();
  const shortFloat = page.locator('dt').filter({ hasText: 'Short interest, % of float' });
  await expect(shortFloat.locator('+ dd')).toHaveText('15.00%');
  await expect(shortFloat).toContainText('calculated');
  await command(page, 'AAPL MANAGEMENT');
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic Chief' })).toContainText('Chief Executive Officer');
  // Yahoo's unlabelled "Pay" and its zero option values are not shown; pay comes from the proxy statement only.
  await expect(page.getByRole('columnheader', { name: /Yahoo Pay|Options exercised/ })).toHaveCount(0);
});

test('watchlist loads supplementary pre-market and after-hours quotes while IEX owns the regular price', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.extendedHours = true;
    // The IEX trade a minute before the page's clock below, whenever the test runs: a trade timed after the page's
    // present is refused as a bad timestamp.
    fixtures.tradeAgeMs = Date.now() - Date.parse('2026-10-20T11:59:00Z');
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  await enableIex(page);
  await page.clock.install({ time: new Date('2026-10-20T12:00:00Z') });
  // MarketEngine captures Date.now on construction, so install the clock before its next load.
  await page.reload();
  await command(page, 'W', 'WATCHLIST');
  const row = page.getByRole('row').filter({ hasText: 'Apple Inc' }).first();
  await expect(row).toContainText('123.45');
  await expect(row).toContainText('1.26%');
  await expect(row).toContainText('0.45%');
  expect((await calls(app)).yahoo.some((path) => path.startsWith('/v7/finance/quote?') && path.includes('AAPL'))).toBe(true);
  // 08:00 in New York on a Tuesday: the pre-market is live, and IEX's last price is its latest trade.
  const session = page.locator('.session-now');
  await expect(session.locator('.badge')).toHaveText('PRE-MARKET');
  await expect(session).toContainText('pre-market, 04:00 to 09:30 New York · the regular session opens in 1:');
  await expect(session).toContainText("Pre-mkt is live; Last is IEX's latest trade, outside the regular session too");
  await expect(page.locator('th', { hasText: 'Pre-mkt' }).locator('.live-tag')).toHaveText('LIVE');
  await expect(page.locator('th.live-col')).toHaveCount(1);
  await expect(row.locator('td.live-col')).toContainText('1.26%');
  await command(page, 'AAPL FLDS PX_LAST', 'FIELDS');
  await expect(page.getByTestId('field-value')).toHaveText('123.4500 · USD');
  await expect(page.locator('.field-definition')).toContainText('Alpaca · IEX only');
});

test('manual analytics work in real-data desktop mode without any provider prices or rates', async ({ desktop: { page } }) => {
  await checkBond(page, (text, code) => command(page, text, code));
  await checkForward(page, (text, code) => command(page, text, code));
  await checkSwap(page, (text, code) => command(page, text, code));
  await checkOptions(page, (text, code) => command(page, text, code));
  await checkStrategy(page, (text, code) => command(page, text, code));
});

test('American exercise and independent premium inversion work without provider data', async ({ desktop: { page } }) => {
  await checkAmericanOption(page, (text, code) => command(page, text, code));
});

test('portfolio adjustments retain cost and unavailable real histories never produce fabricated risk', async ({ desktop: { page } }) => {
  await checkPortfolioPositions(page, (text, code) => command(page, text, code));
  await expect(page.getByTestId('risk-nav')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Missing completed price or FX history' })).toBeVisible();
  await expect(page.getByTestId('stress-pnl')).toHaveText('--');
  await expect(page.getByRole('button', { name: 'Export risk CSV', exact: true })).toBeDisabled();
  await command(page, 'CORR', 'CORRELATION');
  await expect(page.locator('table.tbl tbody tr').first().locator('td.num').first()).toHaveText('--');
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
  await expect(page.locator('.panel').first().getByText(FMP_ERROR, { exact: false }).first()).toBeVisible();
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

test('research remains usable across FMP 402s, Finnhub fallback and manual Equibles reports', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.researchPartial = true; process.env.FINNHUB_ENABLED = 'true'; });
  await command(page, 'AAPL ANALYSTS');
  await page.getByText('Research source availability', { exact: true }).click();
  await expect(page.getByText('Your FMP subscription does not include this request for AAPL (HTTP 402)', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Source: Finnhub', { exact: false }).first()).toContainText('recommendation period 01/10/2026');
  await expect(page.getByRole('cell', { name: '1.25', exact: true })).toBeVisible();
  expect((await calls(app)).finnhub.some((url) => new URL(url).pathname === '/api/v1/stock/recommendation')).toBe(true);
  expect((await calls(app)).equibles).toHaveLength(0);
  await page.getByRole('button', { name: 'Load Analyst estimates for AAPL', exact: true }).click();
  await expect(page.getByTestId('equibles-report')).toContainText('AAPL · GetAnalystEstimates');
  await expect(page.getByTestId('equibles-report')).toContainText('<script>');
  await expect(page.getByText('Source: Equibles', { exact: false })).toBeVisible();
  expect((await calls(app)).equibles.map((r) => r.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  await page.getByRole('button', { name: 'Load Analyst estimates for AAPL', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load Analyst estimates for AAPL', exact: true })).toBeEnabled();
  expect((await calls(app)).equibles).toHaveLength(4); // The valid answer is reused, with its original timestamp.
  await page.getByRole('button', { name: 'Insider trades', exact: true }).click();
  await page.getByRole('button', { name: 'Load Insider trades for AAPL', exact: true }).click();
  await expect(page.getByTestId('equibles-report')).toContainText('GetInsiderTransactions');
  expect((await calls(app)).equibles.filter((r) => r.method === 'tools/call').map((r) => r.params.name)).toEqual(['GetAnalystEstimates', 'GetInsiderTransactions']);
  const rejected = await page.evaluate(async () => {
    try { await window.arminDesktop!.equibles!('DeletePortfolio' as 'estimates', 'AAPL'); return false; } catch { return true; }
  });
  expect(rejected).toBe(true);
  await page.getByRole('button', { name: 'Retry analyst research', exact: true }).click();
  await expect(page.getByTestId('equibles-report')).toHaveCount(0);
  await page.getByRole('button', { name: 'Load Analyst estimates for AAPL', exact: true }).click();
  await expect(page.getByTestId('equibles-report')).toContainText('GetAnalystEstimates');
  expect((await calls(app)).equibles.filter((r) => r.method === 'tools/call')).toHaveLength(2);
});

test('a company typed by its name is found and opened, with the function typed after it', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  const input = page.locator('#cmd-0');
  await input.click();
  await input.fill('acme widgets');
  // The online search's stock shows among the suggestions while typing.
  const list = page.locator('#cmd-suggestions-0');
  await expect(list).toContainText('WXYZ US Equity', { timeout: 15_000 });
  await expect(list).toContainText('Acme Widgets Inc.');
  await input.press('Escape');
  // Run without choosing a suggestion: the name is looked up and the function opens for the stock.
  await command(page, 'acme widgets profile', 'PROFILE');
  await expect(page.locator('.fnh')).toContainText('WXYZ');
  expect((await calls(app)).yahoo.some((path) => path.startsWith('/v1/finance/search?q=acme'))).toBe(true);
});

test('APLD research recovers from both reported provider refusals and lookup survives missing company profiles', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.researchBlocked = true;
    fixtures.profileMissing = true;
    process.env.YAHOO_PRICES_ENABLED = 'true';
    process.env.FINNHUB_ENABLED = 'true';
    process.env.FINNHUB_API_KEY = 'abcd1234efgh5678ij90'; // Simulates a key shortened by the old build.
  });
  await page.reload();
  await command(page, 'WXYZ PROFILE');
  await expect(page.locator('.fnh')).toContainText('WXYZ');
  await command(page, 'APLD ANALYSTS');
  await expect(page.getByTestId('research-coverage')).toContainText('4/5 datasets loaded');
  await expect(page.getByText('Source: Yahoo Finance', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Current snapshot', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '-0.25 USD', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0.00 USD', exact: true }).first()).toBeVisible();
  expect((await calls(app)).equibles).toHaveLength(0);
  const bundle = (await calls(app)).yahoo.filter((path) => path.startsWith('/v10/finance/quoteSummary/APLD?') && path.includes('earningsTrend'));
  expect(bundle).toHaveLength(1);
  await expect(page.getByTestId('research-coverage').locator('details')).not.toHaveAttribute('open');
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-v272-apld-research-fixture.png') });
  await page.getByText('Research source availability', { exact: true }).click();
  await expect(page.getByTestId('research-coverage')).toContainText('HTTP 402');
  await expect(page.getByTestId('research-coverage')).toContainText('HTTP 401');
  await app.evaluate(() => { process.env.FINNHUB_API_KEY = 'abcd1234efgh5678ij90abcd1234efgh5678kl12'; });
  // A replaced complete key must work immediately, even while the previous key's 401 is cooling down.
  const recovered = await page.evaluate(() => window.arminDesktop!.finnhubResearch!('ratings', 'APLD'));
  expect(recovered.status).toBe(200);
  expect(JSON.parse(recovered.text)[0].buy).toBe(4);
  const checks = await page.evaluate(() => window.arminDesktop!.providersSelfTest!());
  expect(checks.results.find((r) => r.id === 'yahoo-summary')).toMatchObject({ state: 'fail', status: 200 });
  expect(checks.results.find((r) => r.id === 'yahoo-search')).toMatchObject({ state: 'pass' });
  expect(checks.results.find((r) => r.id === 'yahoo-research')).toMatchObject({ state: 'pass' });
  expect(checks.report).not.toContain('abcd1234');
  await command(page, 'PROVIDERS');
  const stream = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Yahoo Finance streaming', exact: true }) });
  await expect(stream).toContainText('ERROR'); // Direct and relay sockets are deliberately blocked in this test.
  await expect(stream).toContainText('Socket events');
  const scroller = page.getByRole('region', { name: 'Provider status and diagnostics' });
  await scroller.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  const label = stream.getByRole('cell', { name: 'Yahoo Finance streaming', exact: true });
  const bounds = await label.boundingBox();
  const frame = await scroller.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(frame!.x - 1);
  expect(bounds!.x).toBeLessThan(frame!.x + 10);
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await scroller.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-v272-provider-scroll-fixture.png') });
});

test('SEC reported figures default to the latest reporting currency and expose actual coverage', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { process.env.SEC_USER_AGENT = 'Armin Desktop Test desktop-fixture@example.invalid'; });
  await command(page, 'FILINGS NBIS', 'FILINGS');
  await page.getByRole('button', { name: /8\) Reported figures/ }).click();
  await expect(page.getByLabel('SEC reporting currency')).toHaveValue('USD');
  await expect(page.getByTestId('sec-coverage')).toContainText('latest annual period 31/12/2025');
  await expect(page.getByRole('link', { name: '600.0', exact: true }).first()).toBeVisible();
  const columnAlignment = await page.getByRole('table', { name: 'SEC reported figures' }).evaluate((table) => {
    const header = table.querySelector('th.num')!;
    const value = table.querySelector('td.num')!;
    return Math.abs(header.getBoundingClientRect().right - value.getBoundingClientRect().right);
  });
  expect(columnAlignment).toBeLessThan(1);
  if (process.env.ARMIN_REVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.ARMIN_REVIEW_ARTIFACTS, 'armin-v272-sec-currency-fixture.png') });
  await page.getByLabel('SEC reporting currency').selectOption('RUB');
  await expect(page.getByTestId('sec-coverage')).toContainText('Historical currency selected');
  await expect(page.getByTestId('sec-coverage')).toContainText('latest annual period 31/12/2023');
  await expect(page.getByRole('columnheader').filter({ hasText: 'FY2025' })).toHaveCount(0);
  await page.getByLabel('SEC reporting currency').selectOption('USD');
  await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
  await expect(page.getByTestId('sec-coverage')).toContainText('latest standalone or calculated quarter not available');
  await expect(page.getByRole('link', { name: 'Latest current report: 6-K filed 01/10/2026', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '600.0', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View current reports', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '6-K' }).getByRole('link', { name: 'Document', exact: true })).toHaveAttribute('href', /synthetic-current\.htm$/);
});

test('NBIS quarterly filings show distinct provider coverage when SEC has only annual facts', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    (globalThis as FixtureGlobal).__desktopFixtures.dataAccuracy = true;
    process.env.SEC_USER_AGENT = 'Armin Desktop Test desktop-fixture@example.invalid';
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  await command(page, 'FILINGS NBIS', 'FILINGS');
  await page.getByRole('button', { name: /8\) Reported figures/ }).click();
  await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
  await expect(page.getByTestId('sec-coverage')).toContainText('latest standalone or calculated quarter not available');
  const table = page.getByRole('table', { name: 'Provider quarterly statements', exact: true });
  await expect(table.getByRole('row').filter({ hasText: 'Revenue' })).toContainText('250.0');
  await expect(table.getByRole('row').filter({ hasText: 'Diluted EPS' })).toContainText('-0.50');
  await expect(page.getByText('they are not SEC reported facts', { exact: false })).toBeVisible();
  await expect(page.getByRole('table', { name: 'SEC reported figures', exact: true })).toHaveCount(0);
});

test('foreign issuer research retains separate local revenue and dollar EPS units', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.researchBlocked = true;
    fixtures.mixedEstimateCurrencies = true;
    process.env.YAHOO_PRICES_ENABLED = 'true';
  });
  await page.reload();
  await command(page, 'TM ANALYSTS');
  await expect(page.getByTestId('research-coverage')).toContainText('4/5 datasets loaded');
  await expect(page.getByRole('cell', { name: '600.00M JPY', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '-0.25 USD', exact: true })).toBeVisible();
});

test('Equibles automatically loads one estimate report when structured research has no coverage', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.researchBlocked = true; });
  await command(page, 'APLD ANALYSTS');
  await expect(page.getByTestId('equibles-report')).toContainText('APLD · GetAnalystEstimates');
  expect((await calls(app)).equibles.filter((r) => r.method === 'tools/call')).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry analyst research', exact: true }).click();
  await expect(page.getByTestId('equibles-report')).toContainText('APLD · GetAnalystEstimates');
  expect((await calls(app)).equibles.filter((r) => r.method === 'tools/call')).toHaveLength(1);
});

test('Equibles tool refusals stay visible and can recover without caching the refusal', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.equiblesRefusal = true; });
  await command(page, 'AAPL ANALYSTS');
  await expect(page.getByRole('status')).toContainText('Subscription does not include this research.');
  await expect(page.getByTestId('equibles-report')).toHaveCount(0);
  const report = await page.evaluate(() => window.arminDesktop!.providersStatus!());
  expect(report.providers.equibles.lastErrorKind).toBe('not-entitled');
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.equiblesRefusal = false; });
  await page.getByRole('button', { name: 'Load Analyst estimates for AAPL', exact: true }).click();
  await expect(page.getByTestId('equibles-report')).toContainText('GetAnalystEstimates');
  expect((await calls(app)).equibles.filter((r) => r.method === 'tools/call')).toHaveLength(2);
});

test('TipRanks answers only on request, shows the free usage check and its credit, and never shows the key', async ({ desktop: { app, page } }) => {
  await command(page, 'AAPL ANALYSTS');
  await expect(page.getByText('TipRanks reports 3 of 50 calls used this month, 47 left')).toBeVisible();
  expect((await calls(app)).tipranks.filter((c) => c.method === 'tools/call').map((c) => c.name)).toEqual(['get_my_usage']);
  await expect(page.getByLabel('TipRanks ticker')).toHaveValue('AAPL');
  await page.getByRole('button', { name: 'Consensus and price target · 1 call', exact: true }).click();
  await expect(page.getByText('Moderate Buy', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data by TipRanks' }).first()).toHaveAttribute('href', 'https://www.tipranks.com/stocks/aapl');
  await page.getByRole('button', { name: 'Analyst rating actions · 1 call', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Fixture Securities', exact: true })).toBeVisible();
  // Asked again within the hour: kept in memory, no further call.
  await page.getByRole('button', { name: 'Consensus and price target · 1 call', exact: true }).click();
  await expect(page.getByText('kept from an earlier request')).toBeVisible();
  const tipranks = (await calls(app)).tipranks;
  expect(tipranks.filter((c) => c.method === 'tools/call').map((c) => c.name)).toEqual(['get_my_usage', 'get_assets_data', 'get_recent_analyst_ratings']);
  expect(tipranks.every((c) => c.keyed)).toBe(true);
  expect(await page.content()).not.toContain('DesktopFixtureTipRanks');
  await command(page, 'SHEL LN ANALYSTS');
  await expect(page.getByLabel('TipRanks ticker')).toHaveValue('GB:SHEL');
});

test('provider research checks report access for each APLD endpoint instead of a blanket success', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.researchPartial = true; process.env.FINNHUB_ENABLED = 'true'; });
  await command(page, 'PROVIDERS');
  await expect(page.getByRole('textbox', { name: 'Research test ticker' })).toHaveValue('APLD');
  await page.getByRole('button', { name: 'Test research access', exact: true }).click();
  const results = page.getByRole('table', { name: 'Research access results for APLD' });
  await expect(results.getByRole('row')).toHaveCount(7);
  await expect(results.getByRole('row').filter({ hasText: 'FMP price targets' })).toContainText('Denied');
  await expect(results.getByRole('row').filter({ hasText: 'FMP annual estimates' })).toContainText('Answered');
  await expect(results.getByRole('row').filter({ hasText: 'Finnhub recommendation counts' })).toContainText('Answered');
  await expect(results.getByRole('row').filter({ hasText: 'Equibles analyst estimates' })).toContainText('Answered');
  expect((await calls(app)).equibles.find((r) => r.method === 'tools/call')?.params.arguments?.ticker).toBe('APLD');
});

test('the inherited all-source self-test includes Equibles, detects refusals and keeps reports free of keys', async ({ desktop: { app, page } }) => {
  const report = await page.evaluate(() => window.arminDesktop!.providersSelfTest!());
  expect(report.results.find((r) => r.id === 'fmp')).toMatchObject({ state: 'fail', detail: expect.stringContaining(FMP_ERROR) });
  expect(report.results.find((r) => r.id === 'equibles-estimates')).toMatchObject({ state: 'pass', detail: expect.stringContaining('Research report received') });
  expect(report.report).not.toContain('DesktopFixture');
  expect(report.report).not.toContain('https://');
  expect((await calls(app)).equibles.filter((r) => r.method === 'tools/call')).toHaveLength(1);
});

test('the self-test maps a CUSIP on OpenFIGI, with or without a key, and reads the House Clerk\'s index', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => {
    const fixtures = (globalThis as FixtureGlobal).__desktopFixtures;
    fixtures.thirteenF = true;
    fixtures.congress = true;
    delete process.env.OPENFIGI_API_KEY;
  });
  const keyless = await page.evaluate(() => window.arminDesktop!.providersSelfTest!());
  expect(keyless.results.find((r) => r.id === 'openfigi')).toMatchObject({ state: 'pass', detail: 'without a key (no OPENFIGI_API_KEY set): 037833100 is AAPL, AAPL' });
  expect(keyless.results.find((r) => r.id === 'house-clerk')).toMatchObject({ state: 'pass', detail: expect.stringMatching(/^\d{4}: [1-9]\d* filings, \d+ of them trade reports, latest filed \d{4}-\d{2}-\d{2}$/) });
  await app.evaluate(() => { process.env.OPENFIGI_API_KEY = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'; });
  const keyed = await page.evaluate(() => window.arminDesktop!.providersSelfTest!());
  expect(keyed.results.find((r) => r.id === 'openfigi')).toMatchObject({ state: 'pass', detail: '037833100 is AAPL, AAPL' });
  expect(keyed.report).not.toContain('0f1e2d3c');
  // One POST each, the key in its header only when one is set.
  expect((await calls(app)).openfigi?.map((c) => [c.jobs, c.keyed])).toEqual([
    [[{ idType: 'ID_CUSIP', idValue: '037833100', exchCode: 'US' }], false],
    [[{ idType: 'ID_CUSIP', idValue: '037833100', exchCode: 'US' }], true],
  ]);
});

test("company news merges Benzinga's stories through Alpaca with Google News's search, keys in headers only", async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.newsStories = true; });
  await command(page, 'AAPL COMPANYNEWS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.news-item')).toHaveCount(2);
  // Newest first: Alpaca's story is an hour old, Google's two hours. Google's title loses its " - Reuters".
  await expect(panel.locator('.news-item').nth(0)).toContainText('Synthetic Benzinga story about the company');
  // The source shows as a short code beside the time, the publisher's name on hover.
  await expect(panel.locator('.news-item').nth(0).locator('.src')).toHaveText('BZ');
  await expect(panel.locator('.news-item').nth(0).locator('.src')).toHaveAttribute('title', 'Benzinga');
  await expect(panel.locator('.news-item').nth(1).locator('.hl')).toHaveText('Synthetic Google story about the company · AAPL');
  await expect(panel.locator('.news-item').nth(1).locator('.src')).toHaveText('RTRS');
  // Headlines are numbered; typing a headline's number and GO opens it in the reader.
  await expect(panel.locator('.news-item .news-n')).toHaveText(['1)', '2)']);
  await expect(panel.locator('.story h2')).toHaveText('Synthetic Benzinga story about the company');
  await page.locator('#cmd-0').fill('2');
  await page.locator('#cmd-0').press('Enter');
  await expect(panel.locator('.story h2')).toHaveText('Synthetic Google story about the company');
  await expect(panel.locator('.news-item.sel .news-n')).toHaveText('2)');
  await expect(panel.locator('.fnh-sub')).toContainText('Alpaca: 1');
  await expect(panel.locator('.fnh-sub')).toContainText('Google News: 1');
  // Massive has no key here; it says so rather than failing silently.
  await expect(panel.locator('.fnh-sub')).toContainText('Massive: Needs MASSIVE_API_KEY');
  const { alpacaNews, google } = await calls(app);
  expect(alpacaNews.some((u) => new URL(u).searchParams.get('symbols') === 'AAPL')).toBe(true);
  for (const u of alpacaNews) expect(u).not.toMatch(/PKFIXTURE|DesktopFixtureSecret/);
  expect(google.map((u) => new URL(u).searchParams.get('q'))).toContain('"Apple" (stock OR shares OR earnings OR AAPL) when:7d');
});

test('without an Anthropic key nothing goes to Anthropic and the built-in assistant answers', async ({ desktop: { page } }) => {
  // No ANTHROPIC_API_KEY: the main process says so and sends nothing; the built-in assistant answers.
  expect(await page.evaluate(() => window.arminDesktop!.assistant!([{ role: 'user', content: 'hi' }]))).toEqual({ missing: 'ANTHROPIC_API_KEY' });
  await command(page, 'MESSAGES');
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill('how do I set a price alert?');
  await box.press('Enter');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.msg').last()).toContainText('Alerts');
  await expect(panel.locator('.msg').last().locator('.msg-cmds button').first()).toBeVisible();
});

test('the explicit IEX source switch supplies watchlist and quote prices with one-venue labels', async ({ desktop: { app, page } }) => {
  expect((await calls(app)).alpaca).toHaveLength(0);
  await enableIex(page);
  await command(page, 'WATCHLIST');
  const row = page.locator('.panel').first().getByRole('row').filter({ has: page.getByRole('button', { name: 'AAPL US', exact: true }) });
  await expect(row.getByRole('cell').nth(2)).toHaveText(PRICE);
  // Bid and ask by their headers: the default columns include the extended sessions before them.
  const headers = await page.locator('.panel').first().locator('thead th').allTextContents();
  await expect(row.getByRole('cell').nth(headers.findIndex((h) => h.trim() === 'Bid'))).toHaveText('123.40');
  await expect(row.getByRole('cell').nth(headers.findIndex((h) => h.trim() === 'Ask'))).toHaveText('123.50');
  // The selected-field wrapper and live price both carry provenance; inspect the cell's field wrapper.
  await expect(row.getByRole('cell').nth(2).locator(':scope > span[title]')).toHaveAttribute('title', /IEX/i);
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

test('REFRESH asks the sources the open screens use again, past answers the main process kept, and says what it left alone', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { (globalThis as FixtureGlobal).__desktopFixtures.newsStories = true; });
  await command(page, 'AAPL COMPANYNEWS');
  await expect(page.locator('.panel').first().locator('.news-item')).toHaveCount(2);
  const before = (await calls(app)).alpacaNews.length;
  // The main process keeps Alpaca's company news for ten minutes: asked again now, it answers from memory.
  expect(await page.evaluate(() => window.arminDesktop!.news!('alpaca-company', 'AAPL'))).toMatchObject({ cached: true });
  expect((await calls(app)).alpacaNews).toHaveLength(before);
  const button = page.locator('.tb-refresh');
  await expect(button).toHaveAccessibleName('Refresh every source now');
  await button.click();
  await expect(button).toHaveAccessibleName(/^Refresh every source again; last refreshed at \d\d:\d\d:\d\d$/);
  await expect(button).toContainText(/REFRESHED\s*\d\d:\d\d:\d\d/);
  expect((await calls(app)).alpacaNews.length).toBeGreaterThan(before);
  const title = await button.getAttribute('title');
  expect(title).toMatch(/^Refreshed at \d\d:\d\d:\d\d, in \d+ s\./);
  expect(title).toMatch(/Company news: \d+ asked/);
  expect(title).toContain('Not asked again:');
  expect(title).toContain('Marketaux');
  expect(title).toContain('TipRanks: asked only when you ask on ANALYSTS (monthly allowance)');
  // Alt+R does the same.
  const after = (await calls(app)).alpacaNews.length;
  await page.keyboard.press('Alt+r');
  await expect.poll(async () => (await calls(app)).alpacaNews.length).toBeGreaterThan(after);
});

test("PROFILE lists the company's six latest stories under its profile; only breaking news is tagged BREAKING", async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { const f = (globalThis as FixtureGlobal).__desktopFixtures; f.newsStories = true; f.newsAgeMs = 20 * 60_000; });
  await command(page, 'AAPL PROFILE');
  const box = page.locator('.panel').first().locator('.sect', { hasText: 'Latest news' });
  await expect(box.locator('.news-item')).toHaveCount(2, { timeout: 30_000 });
  await expect(box.locator('.news-item').nth(0)).toContainText('Synthetic Benzinga story about the company');
  // Fresh, but neither names the company nor reports an event that moves its shares (tests/breaking.test.ts).
  await expect(box.locator('.badge.brk')).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'All news ›' })).toBeVisible();
});

test('a story about a favourite pops up and stays until dismissed, through a reload, and never pops up twice', async ({ desktop: { app, page } }) => {
  await app.evaluate(() => { const f = (globalThis as FixtureGlobal).__desktopFixtures; f.newsStories = true; f.newsAgeMs = 60_000; });
  // AAPL is a favourite and the app last looked at the news ten minutes ago: a story from a minute ago pops up.
  // Saved before the page's own scripts run, once: the page being left saves its state as it goes.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('fav-seeded')) return;
    sessionStorage.setItem('fav-seeded', '1');
    localStorage.setItem('armin:favourites', JSON.stringify({ v: 1, s: { ids: ['AAPL US Equity'] } }));
    localStorage.setItem('armin:fav-alerts', JSON.stringify({ v: 1, s: { open: [], seen: [], until: Date.now() - 10 * 60_000 } }));
  });
  await page.reload();
  const pop = page.locator('.toast-fav');
  await expect(pop).toHaveCount(1);
  await expect(pop).toContainText('★');
  await expect(pop.locator('.fav-tickers')).toHaveText('AAPL');
  await expect(pop.locator('.tb')).toHaveText('Synthetic Benzinga story about the company');
  await expect(pop.locator('.tb')).toHaveAttribute('href', 'https://www.benzinga.com/synthetic-story');
  await expect(pop.locator('.fav-pub')).toHaveText('Benzinga');
  await expect(pop.locator('.time')).toHaveText(/^[12]m ago$/);
  const count = page.getByRole('button', { name: '1 favourite news pop-up not dismissed', exact: true });
  await expect(count).toBeVisible();
  // Still there after a reload, and listed on BREAKING's favourites tab.
  await page.reload();
  await expect(page.locator('.toast-fav')).toHaveCount(1);
  await count.click();
  await expect(page.locator('.panel').first().locator('.fnh-code').first()).toHaveText('BREAKING');
  await expect(page.locator('.fav-missed-row')).toHaveCount(1);
  await expect(page.locator('.fav-missed-row')).toContainText('Synthetic Benzinga story about the company');
  await page.locator('.toast-fav').getByRole('button', { name: /^Dismiss/ }).click();
  await expect(page.locator('.toast-fav')).toHaveCount(0);
  await expect(page.locator('.fav-missed')).toHaveCount(0);
  await expect(count).toHaveCount(0);
  // Once the news has loaded again after a reload, the dismissed story does not come back.
  await page.reload();
  await command(page, 'AAPL COMPANYNEWS');
  await expect(page.locator('.panel').first().locator('.news-item')).toHaveCount(2);
  await expect(page.locator('.toast-fav')).toHaveCount(0);
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

test('the mouse back and forward buttons and the window\'s back command step through a panel\'s screens once per press', async ({ desktop: { app, page } }) => {
  await command(page, 'WEI', 'MARKET');
  await command(page, 'TOPMOVERS');
  const panel = page.locator('.panel').first();
  const box = (await panel.locator('.panel-body').boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'back', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'back', clickCount: 1 });
  await expect(panel.locator('.fnh-code').first()).toHaveText('MARKET');
  // Windows also reports the press as the window's "browser-backward" command: the same press is not a second step.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', { preventDefault() {} }, 'browser-backward'));
  await page.waitForTimeout(150);
  await expect(panel.locator('.fnh-code').first()).toHaveText('MARKET');
  // A keyboard's Browser Forward key later is a step of its own.
  await page.waitForTimeout(450);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('app-command', { preventDefault() {} }, 'browser-forward'));
  await expect(panel.locator('.fnh-code').first()).toHaveText('TOPMOVERS');
});
