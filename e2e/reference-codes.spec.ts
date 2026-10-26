import { expect, test, type Page } from '@playwright/test';

// Codes from the reference guides that the app now has (docs/audit-v2.23.0-coverage.md, section 2a).
const run = async (page: Page, text: string) => {
  const cmd = page.locator('#cmd-0');
  await cmd.fill(text);
  await cmd.press('Enter');
};

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
  });
  await page.goto('/');
  await expect(page.locator('.panel').first()).toBeVisible();
  return errors;
}

test('WBMV ranks government yields by their move, largest first, for each period', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'WBMV');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('BONDMOVERS');
  const sizes = async () => (await panel.locator('tbody tr td:nth-child(4)').allTextContents()).map((t) => Math.abs(Number(t.replace(/[^\d.-]/g, ''))));
  await expect.poll(async () => (await sizes()).length).toBeGreaterThan(10);
  const day = await sizes();
  expect(day).toEqual([...day].sort((a, b) => b - a));
  await panel.getByRole('button', { name: '3) 1M' }).click();
  await expect(panel.locator('thead')).toContainText('1M chg (bp)');
  const month = await sizes();
  expect(month).toEqual([...month].sort((a, b) => b - a));
  // A line opens its yield chart.
  await panel.locator('tbody tr').first().click();
  await expect(panel.locator('.fnh-code')).toHaveText('CHART');
  expect(errors).toEqual([]);
});

test('HRA regresses one security on another, named after the function, with its statistics', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US Equity HRA MSFT US Equity');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('REGRESSION');
  await expect(panel.locator('.fnh-title')).toContainText('Regression Analysis');
  await expect(panel.locator('.fnh')).toContainText('vs MSFT US Equity');
  await expect(panel.getByText('Against (independent)')).toBeVisible();
  await expect(panel.locator('.kv')).toContainText('R²');
  // BETA keeps its own name and default index.
  await run(page, 'AAPL US Equity BETA');
  await expect(panel.locator('.fnh-code')).toHaveText('BETA');
  await expect(panel.getByText('Relative index')).toBeVisible();
  expect(errors).toEqual([]);
});

test('TECH lists the studies with what each computes, and a study opens the chart with it added', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US Equity TECH');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('STUDIES');
  await expect(panel.locator('tbody tr')).toHaveCount(8);
  await expect(panel.locator('tbody tr', { hasText: 'Relative strength index' })).toContainText('AAPL US GP RSI');
  await panel.locator('tbody tr', { hasText: 'Relative strength index' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('CHART');
  await expect(panel.getByRole('button', { name: 'RSI', exact: true })).toHaveClass(/\bon\b/);
  await run(page, 'AAPL US Equity TECH');
  await panel.locator('tbody tr', { hasText: '200 closes' }).click();
  await expect(panel.getByRole('button', { name: 'SMA 200', exact: true })).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

test('IN lists the indices by region with what each is, and opens their chart or members', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'IN');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('INDEXLIST');
  await expect(panel.locator('tr.group')).toHaveText([/Americas/, /EMEA/, /Asia\/Pacific/]);
  const spx = panel.locator('tbody tr', { hasText: 'S&P 500 INDEX' });
  await expect(spx).toContainText('Market-capitalisation-weighted index of 500 leading US companies');
  await expect(spx.getByRole('button', { name: 'Members' })).toBeVisible();
  await expect(panel.locator('tbody tr', { hasText: 'NIKKEI 225' }).getByRole('button', { name: 'Members' })).toHaveCount(0);
  await panel.locator('tbody tr', { hasText: 'DAX INDEX' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('CHART');
  await expect(panel.locator('.fnh-sec')).toHaveText('DAX Index');
  expect(errors).toEqual([]);
});

test("IYC lists the yield curve screens and opens each country's curve", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'IYC');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CURVEMENU');
  await expect(panel.locator('tbody tr').first()).toContainText('US Treasuries curve');
  await panel.locator('tbody tr', { hasText: 'German Bunds curve' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('CURVE');
  await expect(panel.locator('.fnh .tab.on, .fnh-actions .act.on').first()).toContainText(/German|DE|Bund/);
  expect(errors).toEqual([]);
});

test('FED gathers the policy rate, the meetings, the Board’s pages and the screens on US rates', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'FED');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('FEDPORTAL');
  await expect(panel.locator('.kv')).toContainText('Target range for fed funds');
  await expect(panel.locator('.kv')).toContainText(/Next decision\d{2}\/\d{2}\/\d{2} \((today|in \d+ days?)\)/);
  // The browser demo has no Fed rate of its own and says so.
  await expect(panel.locator('.fnh')).toContainText('reference rate');
  await expect(panel.getByRole('link', { name: 'Beige Book ↗' })).toHaveAttribute('href', 'https://www.federalreserve.gov/monetarypolicy/publications/beige-book-default.htm');
  await panel.locator('tbody tr', { hasText: 'Rate probabilities' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('RATEPROBS');
  expect(errors).toEqual([]);
});

test('INSD says the insiders\' filings are read in the desktop app, and generates none', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US Equity INSD');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('INSIDERS');
  await expect(panel.locator('.empty')).toContainText('read from SEC EDGAR in the desktop app; none are generated');
  expect(errors).toEqual([]);
});

test("EEG says the consensus history is the desktop app's, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'NVDA EEG');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('ESTIMATEGRAPH');
  await expect(panel.locator('.empty')).toContainText('read from Yahoo Finance in the desktop app');
  await expect(panel.locator('canvas')).toHaveCount(0);
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('EM says reported and expected earnings are the desktop app\'s, and generates none in the demo', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'NVDA EM');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('EARNINGSTREND');
  await expect(panel.locator('.empty')).toContainText('read from the earnings sources in the desktop app');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("EA says an index's earnings season is the desktop app's, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'SPX INDEX EA');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('EARNINGSSEASON');
  await expect(panel.locator('.empty')).toContainText('needs the desktop app');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("CACT says the market's corporate action calendars are the desktop app's, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'CACT');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('ACTIONCALENDAR');
  await expect(panel.locator('.empty')).toContainText('read from Nasdaq in the desktop app');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("SIA says the market's short interest is the desktop app's, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'SIA');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('SHORTRANKING');
  await expect(panel.locator('.empty')).toContainText('read from FINRA in the desktop app');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("GX says an index's cross section is the desktop app's, and plots nothing in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'SPX INDEX GX');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CROSSSECTION');
  await expect(panel.locator('.empty')).toContainText('needs the desktop app');
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("CCB says the classification is the desktop app's, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'CCB');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CLASSIFICATION');
  await expect(panel.locator('.empty')).toContainText("Nasdaq\u2019s stock list in the desktop app");
  expect(errors).toEqual([]);
});
