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
  // The independent security named after the function, in the red bar's field and as the panel's X.
  await expect(panel.getByLabel('Independent security')).toHaveAttribute('placeholder', 'MSFT US');
  await expect(panel.locator('.beta-stats')).toContainText(`X = ${'MICROSOFT'}`, { ignoreCase: true });
  await expect(panel.getByTestId('beta-stats')).toContainText('R^2 (Correlation^2)');
  // BETA keeps its own name and default index.
  await run(page, 'AAPL US Equity BETA');
  await expect(panel.locator('.fnh-code')).toHaveText('BETA');
  await expect(panel.getByLabel('Relative index')).toHaveAttribute('placeholder', 'SPX');
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
  // A chart a study opened shows Edit Chart's panel with the study ticked (TE02 04:43).
  await expect(panel.getByRole('checkbox', { name: 'RSI', exact: true })).toBeChecked();
  await run(page, 'AAPL US Equity TECH');
  await panel.locator('tbody tr', { hasText: '200 closes' }).click();
  await expect(panel.getByRole('checkbox', { name: 'SMA 200', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test("CHART takes the report's studies: the 10-, 20- and 30-day averages and the 15-day average of volume", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US GP SMA10 SMA20 SMA30 VMA15');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CHART');
  for (const name of ['SMA 10', 'SMA 20', 'SMA 30', 'Vol MA 15']) await expect(panel.getByRole('checkbox', { name, exact: true })).toBeChecked();
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
  await expect(panel.locator('.kv')).toContainText(/Next decision\d{2}\/\d{2}\/\d{2}, 14:00 New York \(scheduled\)/);
  await expect(panel.locator('.kv')).toContainText('Latest confirmed decisionStatement not archived');
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

test("FLNG says 13F filings are read in the desktop app, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'FLNG');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('FILINGS13F');
  await expect(panel.locator('.empty')).toContainText('no 13F filings, and none are generated');
  expect(errors).toEqual([]);
});

test("RELS says a company's related securities are read in the desktop app, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL RELS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('RELATED');
  await expect(panel.locator('.empty').first()).toContainText('The browser demo has none, and none are generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ECOW says FRED series are read in the desktop app, and charts none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'ECOW HOUST');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('ECONCHART');
  await expect(panel.locator('.empty')).toContainText('The browser demo has no economic series, and none are generated');
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("CCRV says contract months are read in the desktop app, and draws no curve in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'CCRV');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('FUTURESCURVE');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none are generated');
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('CTM lists the futures the app carries with their terms, found by sector and words', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'CTM');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CONTRACTS');
  await panel.getByLabel('Sector', { exact: true }).selectOption('Precious Metals');
  await expect(panel.locator('tbody tr')).toHaveCount(4);
  await expect(panel.locator('tbody tr', { hasText: 'GC1' })).toContainText('100 troy oz');
  await panel.getByLabel('Find a contract').fill('gold');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  // The browser demo shows the terms only: no front month or price is made up.
  await expect(panel.locator('tbody tr').first().locator('td').nth(9)).toHaveText('');
  await panel.locator('tbody tr').first().click();
  await expect(panel.locator('.fnh-code')).toHaveText('FUTURESCURVE');
  expect(errors).toEqual([]);
});

test("ECFC says the IMF's forecasts are read in the desktop app, and shows none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'ECFC');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('ECOFORECASTS');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none is generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("AUCR says the Treasury's auctions are read in the desktop app, and shows none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AUCR');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('AUCTIONS');
  await expect(panel.locator('.empty')).toContainText('read from Fiscal Data and TreasuryDirect in the desktop app. The browser demo has none, and none is generated.');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ECTR says trade by partner is read from the IMF in the desktop app, and shows none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'ECTR DEU');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('TRADEFLOWS');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none is generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('EQBT says backtests run on real closes in the desktop app, and runs none in the demo', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'EQBT');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('BACKTEST');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none are generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('FRONTIER says the analysis runs on real month-end prices in the desktop app, and shows none in the demo', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'FRONTIER');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('FRONTIER');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none are generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('MPC says the back-tests run on real prices in the desktop app, and runs none in the demo', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'MPC');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('MPC');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none are generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await expect(panel.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('BILL says legislation is read from Congress.gov in the desktop app, and shows none in the demo', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'BILL');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('LEGISLATION');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none is generated');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('FXCA says conversion uses real rates in the desktop app, and converts nothing in the demo', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'FXCA 1000 EUR USD');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CONVERT');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none are generated');
  await expect(panel.locator('.fxca-big')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('W opens worksheets: securities by fields, fundamentals beside market fields, sorted, added to and saved', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'W');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('WORKSHEET');
  const rows = panel.getByRole('table', { name: 'Worksheet' }).locator('tbody tr');
  await expect(rows).toHaveCount(7);
  const head = panel.getByRole('table', { name: 'Worksheet' }).locator('thead');
  await expect(head).toContainText('Mkt Cap USD');
  await expect(head).toContainText('EV/EBITDA');
  // The browser build's fundamentals are the demo engine's, and say so.
  await expect(panel.locator('.fnh-sub')).toContainText('demo figures');
  await expect(rows.first().locator('td').nth(4).locator('span[title]')).toHaveAttribute('title', /Demo engine/);
  // A column from the picker; a sort by clicking its header.
  await panel.getByRole('button', { name: 'Columns', exact: true }).click();
  await panel.getByLabel('Pick columns').getByLabel('Beta').check();
  await expect(head).toContainText('Beta');
  await head.getByText('P/E', { exact: true }).click();
  await expect(head).toContainText('P/E ▼');
  // A security added, then removed.
  await panel.getByLabel('Add security to sheet').fill('TSLA');
  await panel.getByLabel('Add security to sheet').press('Enter');
  await expect(rows).toHaveCount(8);
  await panel.getByRole('button', { name: 'Remove TSLA US Equity' }).click();
  await expect(rows).toHaveCount(7);
  // A second sheet starts empty; the first keeps its rows.
  await panel.getByRole('button', { name: 'New sheet', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await panel.getByRole('button', { name: /^1\)\s*Sheet 1$/ }).click();
  await expect(rows).toHaveCount(7);
  // W with a name opens that sheet.
  await run(page, 'W SHEET 2');
  await expect(page.locator('.panel').first().getByRole('table', { name: 'Worksheet' }).locator('tbody tr')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('SRCH as TE07 02:23: criteria joined by And with their matches, the count, and the results on their own page', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL CORP');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('BONDSEARCH');
  await expect(page.locator('.cmd-hints')).toContainText('1 <GO> for Results');
  await expect(panel.locator('.tab')).toHaveText(['Build/Edit Search', 'Example Searches']);
  await expect(panel.locator('.subtab.on')).toContainText('Build with Criterion');
  // "AAPL CORP" starts with corporates by that issuer; the query is echoed at the right.
  await expect(panel.getByTestId('srch-query')).toHaveText('DEMO BONDS SECURITY TYPE CORP ISSUER AAPL');
  const count = async () => Number((await panel.getByTestId('srch-count').textContent())?.replace(/\D/g, ''));
  const apple = await count();
  expect(apple).toBeGreaterThan(0);
  await expect(panel.getByTestId('srch-left-2')).toHaveText(String(apple));
  // A criterion added from the amber row narrows the matches; removing it brings them back.
  await panel.getByLabel('Add a criterion').selectOption('maturity');
  await panel.getByLabel('Criterion 3', { exact: true }).fill('100');
  await expect(panel.getByTestId('srch-left-3')).toHaveText('0');
  await expect.poll(count).toBe(0);
  await panel.getByRole('button', { name: 'Remove criterion 3' }).click();
  await expect.poll(count).toBe(apple);
  // 1 <GO> opens the results; Back returns to the criteria.
  await run(page, '1');
  await expect(panel.locator('table tbody tr')).toHaveCount(apple);
  await page.locator('#cmd-0').press('End');
  await expect(panel.getByTestId('srch-count')).toBeVisible();
  // An example search replaces the criteria.
  await panel.getByRole('button', { name: 'Example Searches' }).click();
  await panel.getByRole('button', { name: 'Coupons of 5% or more' }).click();
  await expect(panel.getByTestId('srch-query')).toHaveText('DEMO BONDS COUPON > 4.999');
  expect(errors).toEqual([]);
});

test('WB as TE07 01:15: Regional view, Bonds, Spreads and Curves tabs, a Data Range band, and Security Analysis', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'WB');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('BONDS');
  await expect(panel.getByTestId('wb-view')).toHaveValue('Regional');
  await expect(panel.locator('.fnh-actions .act')).toHaveText(['Export', 'Settings▾']);
  await expect(panel.locator('.tab')).toHaveText(['91) Bonds', '92) Spreads', '93) Curves']);
  await expect(panel.getByLabel('Maturity')).toHaveValue('10');
  await expect(panel.getByLabel('Data range')).toHaveValue('YTD');
  const table = panel.getByTestId('wb-table');
  await expect(table.locator('thead tr').nth(1).locator('th')).toHaveText(['Region', 'RMI', 'Security', '', 'Price', 'Chg', 'Yld', 'Chg', 'Yld', 'Low', /^Range/, 'High', 'YTD Chg']);
  // The countries keep the terminal's numbers under their regions: 10) United States, 22) Germany, 30) Japan.
  await expect(panel.getByTestId('wb-row-US').locator('td').first()).toHaveText('10)United States');
  await expect(panel.getByTestId('wb-row-DE').locator('td').first()).toHaveText('22)Germany');
  await expect(panel.getByTestId('wb-row-JP').locator('td').first()).toHaveText('30)Japan');
  await expect(panel.getByTestId('wb-row-US').getByTestId('wb-range')).toBeVisible();
  // Spreads: the Sell country (Germany) has no spread of its own; the others are measured against it.
  await run(page, '92');
  await expect(panel.getByLabel('Spread against')).toHaveValue('DE');
  await expect(panel.getByLabel('Data range')).toHaveValue('3M');
  await expect(panel.getByTestId('wb-row-DE')).toHaveClass(/wb-base/);
  await expect(table.locator('thead tr').nth(1).locator('th.num')).toHaveText(['Yld', 'Spd', 'Chg', '#SD/Day', 'Low', 'High', 'Avg', '+/-', '#SD', 'RSI']);
  const us = await panel.getByTestId('wb-row-US').locator('td').nth(3).textContent();
  expect(Number(us?.replace(/,/g, ''))).not.toBeNaN();
  // Curves: the 2-year to 10-year slope by default.
  await run(page, '93');
  await expect(panel.getByLabel('Curve')).toHaveValue('2-10');
  await expect(table.locator('thead tr').nth(1).locator('th.num').nth(2)).toHaveText('Crv');
  // Developed: one list, lowest yield first, numbered from 1.
  await run(page, '91');
  await panel.getByTestId('wb-view').selectOption('Developed');
  await expect(panel.locator('.fnh-title')).toHaveText('World Bond Markets: Developed');
  await expect(panel.getByTestId('wb-row-BR')).toHaveCount(0);
  const ylds = (await table.locator('tbody tr td.num.cyan').allTextContents()).map(Number);
  expect(ylds).toEqual([...ylds].sort((a, b) => a - b));
  // A country's number opens its Security Analysis: headlines and other markets; Close shuts it.
  await panel.getByTestId('wb-view').selectOption('Regional');
  await run(page, '22');
  const sa = page.getByTestId('wb-analysis');
  await expect(sa).toContainText('1) News Headlines | More »');
  await expect(sa).toContainText('2) Germany: Other Markets');
  await expect(sa.locator('.wb-tile')).toHaveCount(2);
  await sa.getByRole('button', { name: 'Close' }).click();
  await expect(sa).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ALLQ as TE07 04:17: security box, Request Access and Settings, Spreads vs a benchmark, and the quote montage', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL 4.65 02/23/46 CORP ALLQ');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('DEALERQUOTES');
  await expect(panel.locator('.fnh-sec')).toHaveText('AAPL 4.65 02/23/46 Corp');
  await expect(panel.locator('.fnh-actions .act')).toHaveText(['Request Access▾', 'Settings▾']);
  const table = panel.getByTestId('allq-table');
  await expect(table.locator('thead th')).toHaveText(['PCS', 'Firm Name', 'Bid Px / Ask Px', 'Bid Spd / Ask Spd', 'BSz(M) x ASz(M)', 'Time']);
  // Two lines above the dealers, then the demo's eight fictional dealers, said so.
  await expect(table.locator('tr.allq-lead')).toHaveCount(2);
  await expect(panel.getByTestId('allq-dealer')).toHaveCount(8);
  await expect(panel.locator('.allq-status')).toContainText('dealers and their quotes are generated');
  // The spreads are measured against the latest Treasury of the nearest tenor, priced in 32nds.
  await expect(panel.getByLabel('Benchmark')).toHaveValue(/ Govt$/);
  await expect(panel.locator('.allq-bench')).toContainText(/\d+-\d{2}\+? \/ \d+-\d{2}\+?/);
  // Settings shows yields instead; Split Bid/Offer sorts each side on its own.
  await panel.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Show Bid Yld / Ask Yld' }).click();
  await expect(table.locator('thead th').nth(3)).toHaveText('Bid Yld / Ask Yld');
  await panel.getByLabel('Split Bid/Offer').check();
  const asks = (await panel.getByTestId('allq-dealer').locator('td:nth-child(3)').allTextContents()).map((t) => Number(t.split('/')[1]));
  expect(asks).toEqual([...asks].sort((a, b) => a - b));
  expect(errors).toEqual([]);
});

test("PORT's Intraday tab as the 2025 frame: navigator, summary movers, and the portfolio by GICS sector", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'PORTFOLIO');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.tab.on')).toContainText('Intraday');
  await expect(panel.getByTestId('port-intraday')).toContainText('No holdings in');
  // Positions are added on 2) Holdings.
  await run(page, '2');
  for (const [sec, qty] of [['AAPL', '10'], ['XOM', '20']]) {
    await panel.getByLabel('Security', { exact: true }).fill(sec);
    await panel.getByLabel('Quantity', { exact: true }).fill(qty);
    await panel.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await run(page, '1');
  const nav = panel.getByRole('complementary', { name: 'Intraday Navigator' });
  await expect(nav).toContainText('Report Definition');
  await expect(nav.getByLabel('Classification')).toHaveValue('GICS Sector');
  const grid = panel.getByTestId('port-grid');
  await expect(grid.locator('thead tr').first().locator('th')).toHaveText(['', '#', '% Wgt', 'Contribution to Return', 'Total Return']);
  // The total: both holdings, all the weight; every GICS sector listed under it.
  const total = grid.locator('tbody tr.port-total');
  await expect(total.locator('td').nth(1)).toHaveText('2');
  await expect(total.locator('td').nth(3)).toHaveText('100.00');
  await expect(grid.locator('tbody tr').filter({ hasText: 'Information Technology' })).toHaveCount(1);
  // A sector opens to its holdings.
  await grid.locator('tbody tr').filter({ hasText: 'Energy' }).click();
  await expect(grid.locator('tr.port-line')).toContainText('Exxon Mobil');
  // The benchmark's members load in the desktop app only: here its columns are blank, and the foot says why.
  await expect(panel.locator('.port-foot')).toContainText('load in the desktop app');
  // Differences off: the Diff columns go.
  await nav.getByLabel('Differences').uncheck();
  await expect(grid.locator('thead tr').nth(1).locator('th')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test("PORT's tabs as the 2021 guide lists them, with Characteristics and Attribution on the holdings", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'PORTFOLIO');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.tab')).toHaveText(['1) Intraday', '2) Holdings', '3) Characteristics', '4) VaR', '5) Scenarios', '6) Tracking Error/Volatility', '7) Performance', '8) Attribution', '9) Transactions']);
  await run(page, '2');
  for (const [sec, qty] of [['AAPL', '10'], ['XOM', '20']]) {
    await panel.getByLabel('Security', { exact: true }).fill(sec);
    await panel.getByLabel('Quantity', { exact: true }).fill(qty);
    await panel.getByRole('button', { name: 'Add', exact: true }).click();
  }
  // Characteristics: the portfolio's own figures; the benchmark's need its members (the desktop app).
  await run(page, '3');
  const chars = panel.getByTestId('port-characteristics');
  await expect(chars.locator('tbody tr').filter({ hasText: 'Number of Securities' }).locator('td').nth(1)).toHaveText('2');
  await expect(chars.locator('tbody tr').filter({ hasText: 'Largest Holding (%)' }).locator('td').nth(2)).toHaveText('--');
  // Attribution: the summary and both views, blank without the benchmark's members, and saying why.
  await run(page, '8');
  const attr = panel.getByTestId('port-attribution');
  await expect(attr.locator('.port-box-h')).toHaveText(['Outperformance', 'Global Details', 'Attribution Effects']);
  await expect(attr.getByTestId('attr-active')).toHaveText('--');
  await expect(attr).toContainText('load in the desktop app');
  await expect(attr.getByRole('button', { name: 'Asset Allocation & Security Selection' })).toBeVisible();
  // Manage ▾ opens Transactions on 9).
  await panel.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('menuitem', { name: 'Record a Transaction' }).click();
  await expect(panel.locator('.tab.on')).toHaveText('9) Transactions');
  expect(errors).toEqual([]);
});

test("WACC as the 2022 screen: cost of capital, capital structure, history and Economic Value Added", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US Equity WACC');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('WACC');
  await expect(panel.locator('.fnh-actions .act')).toHaveText(['1) Create Report']);
  await expect(panel.getByLabel('Period')).toHaveValue('MR');
  const cost = panel.getByTestId('wacc-cost');
  await expect(cost.locator('thead th')).toHaveText(['', 'Weight', 'Cost', 'W x C']);
  await expect(cost.locator('tbody td:first-child')).toHaveText(['3) Equity', '4) Debt Cost (A-T)', '5) Preferred Equity', 'WACC']);
  // The weights add up to the total capital, and WACC is the sum of the weighted costs.
  const pctOf = async (loc: ReturnType<typeof panel.locator>) => Number((await loc.innerText()).replace('%', ''));
  const weights = await Promise.all([0, 1, 2].map((i) => pctOf(cost.locator('tbody tr').nth(i).locator('td').nth(1))));
  expect(weights.reduce((a, w) => a + w, 0)).toBeCloseTo(100, 0);
  const parts = await Promise.all([0, 1, 2].map((i) => pctOf(cost.locator('tbody tr').nth(i).locator('td').nth(3))));
  expect(parts.reduce((a, w) => a + w, 0)).toBeCloseTo(await pctOf(panel.getByTestId('wacc-value')), 0);
  await expect(panel.getByTestId('wacc-capital').locator('td:first-child')).toHaveText(['Market Cap', 'ST Debt', 'LT Debt', 'Pref. Eqty', 'Total']);
  await expect(panel.getByTestId('wacc-eva').locator('td:first-child')).toHaveText(['7) Net Operating Profit', '8) Cash Operating Taxes', 'NOPAT', '9) Total Investment Capital', 'Capital Charge', 'Economic Value Added', 'ROIC', 'EVA Spread']);
  await expect(panel.getByRole('radiogroup', { name: 'History field' }).getByRole('radio')).toHaveCount(4);
  // 4) opens the cost of debt as the help page sets it without a fair market curve.
  await run(page, '4');
  await expect(panel.getByLabel('Adjustment factor')).toHaveValue('1.38');
  await expect(panel.locator('.note')).toContainText('Rough approximation for WACC');
  expect(errors).toEqual([]);
});

test("BETA as the 2022 screen: Relative Index, range buttons, the scatter with its fit and histograms, and the statistics", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US Equity BETA');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('BETA');
  await expect(panel.getByLabel('Relative index')).toHaveAttribute('placeholder', 'SPX');
  await expect(panel.locator('.fnh-actions .act')).toHaveText(['Actions▾', 'Edit▾']);
  await expect(panel.locator('.beta-range')).toHaveText(['6M', 'YTD', '1Y', '2Y', '5Y', 'Max']);
  await expect(panel.locator('.beta-range.on')).toHaveText('2Y');
  await expect(panel.getByLabel('Frequency')).toHaveValue('W');
  const stats = panel.getByTestId('beta-stats');
  await expect(stats.locator('tbody td.amber')).toHaveText(['Raw BETA', 'Adjusted BETA', 'ALPHA (Intercept)', 'R^2 (Correlation^2)', 'R (Correlation)', 'Std Dev of Error', 'Std Error of ALPHA', 'Std Error of BETA', 't-Test', 'Significance', 'Last T-Value', 'Last P-Value', 'Number of Points', 'Last Spread', 'Last Ratio', '1Y Daily BETA']);
  const val = async (label: string) => Number((await stats.locator('tr', { hasText: label }).first().locator('td').nth(1).innerText()).replace(/,/g, ''));
  // Adjusted = 0.67 × raw + 0.33; t-Test = beta over its standard error; R² = R × R.
  const raw = await val('Raw BETA');
  expect(await val('Adjusted BETA')).toBeCloseTo(0.67 * raw + 0.33, 2);
  expect(await val('t-Test')).toBeCloseTo(raw / (await val('Std Error of BETA')), 0);
  expect(await val('R^2 (Correlation^2)')).toBeCloseTo((await val('R (Correlation)')) ** 2, 2);
  // The plot: orange points, the red line and its equation, a histogram on each axis.
  const plot = panel.getByRole('img', { name: 'Returns scatter with the fitted line' });
  await expect(plot.locator('circle')).toHaveCount((await val('Number of Points')) + 1);
  await expect(plot.locator('.beta-eq')).toContainText('Y = ');
  // Edit ▾ hides the histograms; 1Y reruns the regression on a year.
  await panel.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: 'Hide the Histograms' }).click();
  await panel.locator('.beta-range', { hasText: '1Y' }).click();
  await expect(panel.locator('.beta-range.on')).toHaveText('1Y');
  expect(await val('Number of Points')).toBeLessThan(60);
  expect(errors).toEqual([]);
});

test('SCREEN joins criteria by AND within a group and OR across groups, says its universe, and keeps saved screens', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'EQS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('SCREEN');
  await expect(panel.locator('.fnh-sub')).toContainText("of the app's");
  // The full US list needs the desktop app; the browser build says so rather than offering it.
  await expect(panel.locator('option[value="us"]')).toHaveAttribute('disabled', '');
  await expect(panel.locator('option[value="us"]')).toContainText('desktop app');
  // So do the FTSE 100 (Wikipedia's member list, Yahoo's statements) and the paper's preset that switches to it.
  await expect(panel.locator('option[value="ftse"]')).toHaveAttribute('disabled', '');
  await expect(panel.locator('option[value="ftse"]')).toContainText('desktop app');
  await expect(panel.getByRole('button', { name: /FTSE 100: gross margin and ROE above 25%/ })).toBeDisabled();
  // TE04 03:01: the hint row, the screens at the left, the categories and Selected Screening Criteria with Matches.
  await expect(page.locator('.cmd-hints')).toContainText('1 <GO> for Results, <Back> to Return');
  await expect(panel.locator('.eqs-strip')).toHaveText(['My Recent Screens', 'Popular Screens', 'Screening Criteria', 'Add Criteria']);
  await expect(panel.locator('.eqs-cat').first()).toHaveText('31) Market');
  const count = async () => Number((await panel.getByTestId('eqs-result-count').textContent())?.replace(/\D/g, ''));
  const all = await count();
  // The universe's size comes first, as the screen's first line, before any criterion narrows it.
  expect(Number((await panel.getByTestId('eqs-universe-count').textContent())?.replace(/\D/g, ''))).toBe(all);
  await panel.getByLabel('Value 1.1').fill('500');
  const logic = panel.getByTestId('eqs-logic');
  await expect(logic).toContainText('Screen: Market value ≥ 500 $bn.');
  await expect.poll(count).toBeLessThan(all);
  const big = await count();
  // The stocks left after the criterion, beside it (as the fixed income search's Matches column).
  await expect(panel.getByTestId('eqs-left-1.1')).toHaveText(`${big} left`);
  // A second group, joined by OR: more stocks, never fewer.
  await panel.getByRole('button', { name: '+ Or group' }).click();
  await panel.getByLabel('Field 2.1').selectOption('divYld');
  await panel.getByLabel('Value 2.1').fill('3');
  await expect(logic).toContainText('Screen: Market value ≥ 500 $bn or Dividend yield ≥ 3 %.');
  await expect.poll(count).toBeGreaterThan(big);
  // 1 <GO> opens the results on a page of their own, one row a match; Back returns to the criteria.
  const matches = await count();
  await run(page, '1');
  await expect(panel.locator('table tbody tr')).toHaveCount(matches);
  await page.locator('#cmd-0').press('End');
  await expect(logic).toBeVisible();
  // Typing a field's name adds it as a criterion, numbered on from 51).
  await panel.getByLabel('Add criteria').fill('Beta');
  await panel.getByLabel('Add criteria').press('Enter');
  await expect(panel.getByLabel('Field 2.2')).toHaveValue('beta');
  await panel.getByRole('button', { name: 'Remove criterion 2.2' }).click();
  // A second criterion in the first group, joined by AND.
  await panel.getByRole('button', { name: '+ And' }).first().click();
  await panel.getByLabel('Field 1.2').selectOption('sector');
  await panel.getByLabel('Value 1.2').fill('Information Technology');
  await expect(logic).toContainText('(Market value ≥ 500 $bn and Sector is "Information Technology") or Dividend yield ≥ 3 %');
  // Each criterion in a group can only narrow what the ones above it left.
  const leftAfter = async (at: string) => Number((await panel.getByTestId(`eqs-left-${at}`).textContent())?.replace(/\D/g, ''));
  await expect.poll(() => leftAfter('1.2')).toBeLessThanOrEqual(big);
  await expect(panel.getByTestId('eqs-left-2.1')).toContainText('left');
  await expect(panel.getByLabel('A stock missing a value')).toHaveValue('leave-out');
  // Saved by name, and opened again after a restart with SCREEN and the name.
  await panel.getByLabel('Screen name').fill('Big tech or yield');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((v) => v.includes('Big tech or yield')))).toBe(true);
  await page.reload();
  await expect(page.locator('.panel').first()).toBeVisible();
  await run(page, 'SCREEN BIG');
  await expect(page.locator('.panel').first().getByTestId('eqs-logic')).toContainText('(Market value ≥ 500 $bn and Sector is "Information Technology") or Dividend yield ≥ 3 %');
  await expect(page.locator('.panel').first().getByLabel('Saved screens')).toHaveValue('Big tech or yield');
  expect(errors).toEqual([]);
});

test('SCREEN keeps the top N of the stocks the criteria above left, in an order you set, and reads a figure for its period', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'EQS');
  const panel = page.locator('.panel').first();
  const rows = panel.locator('tbody tr');
  const logic = panel.getByTestId('eqs-logic');
  const back = () => page.locator('#cmd-0').press('End');
  await panel.getByLabel('Value 1.1').fill('50');
  await expect(logic).toContainText('Screen: Market value ≥ 50 $bn.');
  // The results open sorted by market value, largest first: the three a rank should keep.
  const firstThree = async () => (await rows.locator('td:nth-child(2)').allTextContents()).slice(0, 3).map((t) => t.trim());
  await run(page, '1');
  await expect.poll(() => rows.count()).toBeGreaterThan(3);
  const largest = await firstThree();
  await back();
  await panel.getByRole('button', { name: '+ And' }).first().click();
  await panel.getByLabel('Comparison 1.2').selectOption('top');
  await panel.getByLabel('Value 1.2').fill('3');
  await expect(logic).toContainText('Market value ≥ 50 $bn and Top 3 by Market value, higher is better');
  await expect(panel.getByTestId('eqs-left-1.2')).toHaveText('3 left');
  await run(page, '1');
  await expect(rows).toHaveCount(3);
  expect((await firstThree()).sort()).toEqual([...largest].sort());
  await back();
  // Criteria apply in order: moved up, the rank comes first.
  await panel.getByRole('button', { name: 'Move criterion 1.2 up' }).click();
  await expect(logic).toContainText('Top 3 by Market value, higher is better and Market value ≥ 50 $bn');
  await expect(panel.getByTestId('eqs-left-1.1')).toHaveText('3 left');
  // A figure for a period of its own: P/E on the latest fiscal year, shown in its own column.
  await panel.getByLabel('Field 1.2').selectOption('pe');
  await panel.getByLabel('Period 1.2').selectOption('lfy');
  await panel.getByLabel('Comparison 1.2').selectOption('lte');
  await panel.getByLabel('Value 1.2').fill('1000');
  await expect(logic).toContainText('Top 3 by Market value, higher is better and P/E, latest fiscal year ≤ 1000');
  await run(page, '1');
  await expect(panel.locator('thead th', { hasText: 'P/E LFY' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('CORRELATION finds the lines that moved most closely with the one loaded, and opens them in the matrix', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'SPX INDEX CORRELATION');
  const panel = page.locator('.panel').first();
  await panel.getByRole('button', { name: 'Most correlated', exact: true }).click();
  const rows = panel.getByTestId('corr-search').locator('tbody tr');
  // The S&P 500 future first; the volatility index when the order is the most opposite.
  await expect(rows.first()).toContainText('ES1');
  await expect(rows).toHaveCount(25);
  await expect(panel.locator('.note')).toContainText("lines ranked by the correlation of their daily returns with SPX's over 1Y");
  await panel.getByLabel('Order').selectOption('low');
  await expect(rows.first()).toContainText('VIX');
  await panel.getByLabel('Among').selectOption('fx');
  await expect(rows.first().locator('td').nth(3)).toHaveText('fx');
  // The first nine beside SPX in the matrix.
  await panel.getByRole('button', { name: 'Compare the first 9 in the matrix' }).click();
  await expect(panel.locator('table.tbl tbody tr')).toHaveCount(10);
  await expect(panel.locator('table.tbl tbody tr').first()).toContainText('SPX');
  expect(errors).toEqual([]);
});

test('BTST ranks popular trading rules on the loaded security by return or risk, and draws one beside buying and holding', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'BTST SPX INDEX');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code').first()).toHaveText('STRATEGIES');
  const rows = panel.getByTestId('btst-table').locator('tbody tr');
  await expect(rows).toHaveCount(8);
  await expect(panel.getByTestId('btst-table')).toContainText('Buy and hold');
  // Ranked by total return: each row's total is at least the next one's.
  const totals = async () => (await rows.locator('td:nth-child(3)').allTextContents()).map((t) => Number(t.replace('%', '').replace('+', '')));
  const byReturn = await totals();
  expect(byReturn.every((v, i) => i === 0 || byReturn[i - 1] >= v)).toBe(true);
  // By the smallest drawdown: the drawdown column rises down the table.
  await panel.getByLabel('Rank by').selectOption('maxDrawdown');
  const dd = (await rows.locator('td:nth-child(7)').allTextContents()).map((t) => Number(t.replace('%', '')));
  expect(dd.every((v, i) => i === 0 || dd[i - 1] >= v)).toBe(true);
  // A row draws that rule beside buying and holding, with its rule in words.
  await rows.filter({ hasText: 'MACD 12/26/9' }).click();
  await expect(panel.locator('.note.amber')).toContainText('MACD 12/26/9: Long while the MACD line is above its 9-day signal line');
  await panel.getByLabel('Positions').selectOption('ls');
  await expect(panel.locator('.note.amber')).toContainText('short on the mirror signal');
  expect(errors).toEqual([]);
});

test("the watchlist's layout: changes, both extended sessions, volumes, YTD and 52 weeks, two range bars, a day chart on the previous close, market value", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'WATCH');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('WATCHLIST');
  const heads = (await panel.locator('thead th').allTextContents()).map((h) => h.replace(/[▲▼]/g, '').trim()).filter(Boolean);
  expect(heads.slice(0, 15)).toEqual(['Security', 'Name', 'Last Price', 'Change (%)', 'Change', 'Pre-mkt', 'After-hrs', 'Volume', 'Avg Vol (3M)', 'YTD', '52-Wk %', 'Day Range', '52-Wk Range', 'Day Chart', 'Market Cap']);
  const row = panel.getByRole('row').filter({ has: page.getByRole('button', { name: 'AAPL US', exact: true }) });
  // Both ranges: low and high either side of a bar, the marker inside it.
  const bars = row.locator('.rangebar');
  await expect(bars).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const track = await bars.nth(i).getByTestId('range-track').boundingBox();
    const mark = await bars.nth(i).locator('.rb-mark').boundingBox();
    expect(track && mark && mark.x + mark.width / 2 >= track.x - 1 && mark.x + mark.width / 2 <= track.x + track.width + 1).toBe(true);
  }
  // The ends are white and the price is a white bar across the track (the owner's choice, 27 October 2026).
  const white = await page.evaluate(() => {
    const d = document.createElement('span');
    d.style.color = 'var(--white)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  });
  const look = await bars.first().evaluate((el) => {
    const mark = el.querySelector('.rb-mark')!;
    const r = mark.getBoundingClientRect();
    return { end: getComputedStyle(el.querySelector('.rb-end')!).color, bar: getComputedStyle(mark).backgroundColor, w: r.width, h: r.height };
  });
  expect(look.end).toBe(white);
  expect(look.bar).toBe(white);
  expect(look.w).toBeLessThanOrEqual(3);
  expect(look.h).toBeGreaterThan(8);
  // The day chart, on a dotted line at the previous close.
  await expect(row.getByTestId('day-chart')).toBeVisible();
  await expect(row.getByTestId('day-chart-base')).toHaveAttribute('stroke-dasharray', '1.5 1.5');
  // Market value and average volume are figures, and their sources show on hover.
  const cell = async (label: string) => row.getByRole('cell').nth((await panel.locator('thead th').allTextContents()).findIndex((h) => h.replace(/[▲▼]/g, '').trim() === label));
  await expect(await cell('Market Cap')).toHaveText(/^\d+(\.\d+)?[KMBT]$/);
  await expect((await cell('Avg Vol (3M)')).locator('span[title]')).toHaveAttribute('title', /Calculated from the daily history[\s\S]*session is left out/);
  expect(errors).toEqual([]);
});

test('watchlist price markers keep even white edges across positions, resizing and fractional display scaling', async ({ browser }, testInfo) => {
  for (const scale of [1, 1.25, 1.5]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: scale });
    try {
      const page = await context.newPage();
      const errors = await boot(page);
      await run(page, 'WATCH');
      const panel = page.locator('.panel').first();
      await expect(panel.locator('.fnh-code')).toHaveText('WATCHLIST');
      const markers = panel.locator('.rb-mark');
      await expect.poll(() => markers.count()).toBeGreaterThan(10);
      const geometry = () => markers.evaluateAll((nodes) => {
        const dpr = window.devicePixelRatio;
        return nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const track = node.parentElement!.getBoundingClientRect();
          return {
            x: box.x * dpr, y: box.y * dpr, width: box.width * dpr, height: box.height * dpr,
            at: (box.x + box.width / 2 - track.x) / track.width,
            white: getComputedStyle(node).backgroundColor,
          };
        });
      });
      const even = async () => {
        const boxes = await geometry();
        return boxes.every((box) =>
          Math.abs(box.x - Math.round(box.x)) < 0.02 && Math.abs(box.y - Math.round(box.y)) < 0.02 &&
          Math.abs(box.width - Math.round(2 * scale)) < 0.02 && Math.abs(box.height - Math.round(13 * scale)) < 0.02,
        );
      };
      await expect.poll(even).toBe(true);
      const before = await geometry();
      expect(new Set(before.map((box) => box.at.toFixed(2))).size).toBeGreaterThan(3);
      expect(new Set(before.map((box) => box.white)).size).toBe(1);
      // Fractional track sizes and origins must not be mistaken for a parent scale.
      await panel.locator('.rangebar').evaluateAll((nodes) => nodes.forEach((node, index) => {
        (node.querySelector('.rb-track') as HTMLElement).style.width = '77.5px';
        (node as HTMLElement).style.marginLeft = `${index % 4 * 0.19}px`;
      }));
      await expect.poll(even).toBe(true);
      await page.setViewportSize({ width: 1273, height: 917 });
      await expect.poll(even).toBe(true);
      // The actual rendered close-ups remain ignored test output, not committed reference images.
      if (scale === 1.25) {
        const ranges = panel.locator('.rangebar');
        await ranges.nth(0).screenshot({ path: testInfo.outputPath('day-range-125.png') });
        await ranges.nth(1).screenshot({ path: testInfo.outputPath('year-range-125.png') });
        await expect.poll(even).toBe(true);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});


test('OIL, GAS, MINE and AGS gather their sector: contracts, measures worked out from them, curves and news', async ({ page }) => {
  const errors = await boot(page);
  const panel = page.locator('.panel').first();
  await run(page, 'OIL');
  await expect(panel.locator('.fnh-code')).toHaveText('OILMARKET');
  await expect(panel.getByTestId('sector-contracts').locator('tbody tr')).toHaveCount(4);
  const spread = panel.getByTestId('sector-measures').locator('tbody tr', { hasText: 'Brent − WTI spread' });
  // The spread is the two contracts' own prices, as shown above it.
  const price = async (ticker: string) => Number((await panel.getByTestId('sector-contracts').locator('tbody tr', { hasText: ticker }).locator('td').nth(2).innerText()).replace(/,/g, ''));
  await expect.poll(async () => Number((await spread.locator('td').nth(1).innerText()).replace(/,/g, ''))).toBeCloseTo((await price('CO1')) - (await price('CL1')), 1);
  await expect(spread.locator('td').nth(3)).not.toHaveText('--');
  // EIA's figures (connected on 28 October 2026) are the desktop app's: the browser says where they are.
  await expect(panel).toContainText("US storage, inventories, production and consumption are the EIA's: on NGAS and below in the desktop app.");
  await panel.getByRole('button', { name: 'WTI Crude futures curve', exact: true }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('FUTURESCURVE');
  await run(page, 'GAS');
  await expect(panel.locator('.fnh-code')).toHaveText('NATURALGAS');
  await expect(panel.getByTestId('sector-contracts').locator('tbody tr')).toHaveCount(1);
  await expect(panel.getByTestId('sector-measures')).toContainText('Crude to gas ratio');
  await panel.locator('tbody tr', { hasText: 'Natural gas statistics (EIA)' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('NGAS');
  await expect(panel).toContainText('The browser demo has none, and none are generated.');
  await run(page, 'MINE');
  await expect(panel.locator('.fnh-code')).toHaveText('METALS');
  await expect(panel.getByTestId('sector-measures')).toContainText('Gold to silver ratio');
  await run(page, 'AGS');
  await expect(panel.locator('.fnh-code')).toHaveText('AGRICULTURE');
  await expect(panel.getByTestId('sector-contracts').locator('tbody tr')).toHaveCount(9);
  await panel.locator('tbody tr', { hasText: 'Agriculture news' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('NEWS');
  expect(errors).toEqual([]);
});

test('WCR gives every currency against a base by region, and keeps a basket of your own', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'WCR');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('CURRENCYRATES');
  const table = panel.getByTestId('wcr-table');
  // Against the dollar, the dollar itself is not listed.
  await expect(table.locator('tbody tr', { hasText: 'EUR' })).toHaveCount(1);
  await expect(table.locator('tbody tr').filter({ has: page.locator('td.b', { hasText: /^USD$/ }) })).toHaveCount(0);
  const eurPerUsd = Number(await table.locator('tbody tr', { hasText: 'Euro' }).locator('td').nth(2).innerText());
  await panel.getByLabel('Base currency').selectOption('EUR');
  // Against the euro the dollar is listed, at the inverse of the euro's rate a dollar.
  const usd = table.locator('tbody tr').filter({ has: page.locator('td.b', { hasText: /^USD$/ }) });
  await expect.poll(async () => Number(await usd.locator('td').nth(2).innerText())).toBeCloseTo(1 / eurPerUsd, 3);
  await panel.getByRole('button', { name: /Asia-Pacific$/ }).click();
  await expect(table).toContainText('Japanese Yen');
  await expect(table).not.toContainText('Mexican Peso');
  await panel.getByRole('button', { name: /My basket$/ }).click();
  // Six currencies to start with; the euro, now the base, is not listed against itself.
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await panel.getByLabel('Currency to add').fill('mxn');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(table).toContainText('Mexican Peso');
  await panel.getByRole('button', { name: 'Remove JPY from the basket' }).click();
  await expect(table).not.toContainText('Japanese Yen');
  await page.reload();
  await expect(panel.getByLabel('Base currency')).toHaveValue('EUR');
  expect(errors).toEqual([]);
});

test('WEIS ranks the indices by return over a period, in their own currency or one, and WM maps them', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'WEIS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('INDEXRANKING');
  const table = panel.getByTestId('weis-table');
  await panel.getByRole('button', { name: /YTD$/ }).click();
  // Ranked highest first.
  const values = async () => (await table.locator('tbody tr td:nth-child(6)').allInnerTexts()).map((s) => Number(s.replace(/[%+,]/g, ''))).filter(Number.isFinite);
  await expect.poll(async () => (await values()).length).toBeGreaterThan(20);
  const v = await values();
  expect(v).toEqual([...v].sort((a, b) => b - a));
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('1');
  // In dollars the ranking changes with the currencies; Asia-Pacific alone lists its own.
  await panel.getByLabel('Return currency').selectOption('USD');
  await panel.getByLabel('Region').selectOption('Asia/Pacific');
  await expect(table).toContainText('NIKKEI');
  await expect(table).not.toContainText('DAX');
  await run(page, 'WM');
  await expect(panel.locator('.fnh-code')).toHaveText('WORLDMAP');
  await expect(panel.getByTestId('wm-grid').locator('.wm-tile')).toHaveCount(24);
  await panel.getByRole('button', { name: /^Japan NIKKEI / }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('CHART');
  expect(errors).toEqual([]);
});

test('ECB, BOE and BOJ gather each bank: its rate, the next decision, its pages and the screens on its market', async ({ page }) => {
  const errors = await boot(page);
  const panel = page.locator('.panel').first();
  await run(page, 'ECB');
  await expect(panel.locator('.fnh-code')).toHaveText('ECBPORTAL');
  await expect(panel.locator('.kv')).toContainText('Deposit facility rate');
  await expect(panel.locator('.kv')).toContainText(/Next decision\d{2}\/\d{2}\/\d{2}, 14:15 Frankfurt \(scheduled\)/);
  await expect(panel.locator('.kv')).toContainText('Latest confirmed decisionStatement not archived');
  // The browser demo has no rate of the bank's own and says so; the overnight rate is left blank, not made up.
  await expect(panel.locator('.fnh')).toContainText('reference rate');
  await expect(panel.locator('.kv')).toContainText('(reference)');
  await expect(panel.locator('.kv')).toContainText('Euro short-term rate (€STR)--');
  await expect(panel.getByRole('link', { name: 'Accounts of the monetary policy meetings ↗' })).toHaveAttribute('href', 'https://www.ecb.europa.eu/press/accounts/html/index.en.html');
  await panel.locator('tbody tr', { hasText: 'German Bund curve' }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('CURVE');
  await run(page, 'BOE');
  await expect(panel.locator('.fnh-code')).toHaveText('BOEPORTAL');
  await expect(panel.locator('.kv')).toContainText('Bank Rate');
  await expect(panel.locator('.kv')).toContainText('12:00 London');
  await run(page, 'BOJ');
  await expect(panel.locator('.fnh-code')).toHaveText('BOJPORTAL');
  await expect(panel.locator('.kv')).toContainText('Basic loan rate');
  await expect(panel.locator('.kv')).toContainText('when the meeting ends, usually around midday Tokyo (scheduled)');
  await expect(panel.locator('.note').last()).toContainText('This service uses the API provided by the "Bank of Japan Time-Series Data Search."');
  expect(errors).toEqual([]);
});

test("CBRT says the banks' rate histories are the desktop app's, and generates none in the demo", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'CBRT');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('RATEANALYSIS');
  await expect(panel.locator('.empty')).toContainText('The browser demo has none, and none are generated');
  await expect(panel.getByTestId('cbrt-banks')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('MYN keeps pages of news sections, each a saved search, and opens NEWS on one', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'MYN');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('MYNEWS');
  await expect(panel.locator('.empty')).toContainText('This page has no sections yet');
  await panel.getByLabel('Section title').fill('Fed watch');
  await panel.getByLabel('Section search').fill('FOMC');
  await panel.getByRole('button', { name: 'Add section', exact: true }).click();
  await panel.getByLabel('Section search').fill('NVDA');
  await panel.getByRole('button', { name: 'Add section', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Fed watch', exact: true })).toBeVisible();
  // The browser build reads no news and says so in each section.
  await expect(panel.getByText('News is read by the desktop app; the browser build has no data source.')).toHaveCount(2);
  await panel.getByLabel('New page name').fill('Energy');
  await panel.getByRole('button', { name: 'New page', exact: true }).click();
  await expect(panel.locator('.empty')).toContainText('This page has no sections yet');
  await panel.getByRole('button', { name: /My news$/ }).click();
  await panel.getByRole('button', { name: 'Remove the section NVDA' }).click();
  await expect(panel.getByText('News is read by the desktop app; the browser build has no data source.')).toHaveCount(1);
  await page.reload();
  await expect(panel.getByRole('button', { name: /Energy$/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Fed watch', exact: true }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('NEWS');
  expect(errors).toEqual([]);
});

test('EE is the earnings and estimates page: its boxes open the screens with the detail', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL EE');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('EARNINGSSUMMARY');
  await expect(panel.locator('.fnh-title')).toHaveText('Earnings & Estimates');
  // TE04 06:27: the boxes in the terminal's order, 4) on annual figures with its period tabs and numbered measures.
  for (const box of ['1) Earnings History', '2) Consensus Overview', '3) Analyst Coverage', '4) Company Financials', '5) Earnings Trends', '6) Company News', '7) Earnings Estimates Graph']) await expect(panel.locator('.sect-h', { hasText: box })).toBeVisible();
  await expect(panel.locator('.ee-tab').first()).toContainText('21) Current Period Overview');
  await expect(panel.getByTestId('ee-current').locator('thead th')).toHaveText([/Measure/, /Est$/, '4Wk Chg', 'YoY Gr', 'Growth vs Peers', 'Past Surprise', 'Analysts']);
  await expect(panel.getByTestId('ee-current').locator('tbody tr').first()).toHaveClass(/\bsel\b/);
  // The demo's own statements give the last report; the analysts' figures are the desktop app's, and none are generated.
  await expect(panel.locator('.kv').first()).toContainText('Prior Announcement');
  await expect(panel.locator('.kv').first()).toContainText('Avg/Implied 1 Day Move');
  await expect(panel.getByTestId('ee-current').locator('tbody tr').first().locator('td').nth(1)).toHaveText('--');
  // 22) shows the last fiscal year from the demo's statements.
  await run(page, '22');
  await expect(panel.getByTestId('ee-prior').locator('tbody tr').nth(2)).toContainText('Revenue');
  await expect(panel.locator('.empty').first()).toContainText('none are generated');
  await run(page, '2');
  await expect(panel.locator('.fnh-code')).toHaveText('ESTIMATES');
  await run(page, 'AAPL EE');
  await run(page, '7');
  await expect(panel.locator('.fnh-code')).toHaveText('ESTIMATEGRAPH');
  // ERN stays the earnings history.
  await run(page, 'AAPL ERN');
  await expect(panel.locator('.fnh-code')).toHaveText('EARNINGS');
  expect(errors).toEqual([]);
});

test("PEERS has RV's Overview columns in their order, its Comp Sheets and Markets, and pins the loaded stock as 100)", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL PEERS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('PEERS');
  const headers = () => panel.locator('table.rv-comps:not(.rv-seg) thead th').allTextContents().then((hs) => hs.map((h) => h.replace(/\s*[▲▼]$/, '').trim()));
  expect(await headers()).toEqual(['#', 'Name', '', 'Mkt Cap USD', 'Last Px', 'Chg Pct 1D', 'Chg Pct 1M', 'Rev - 1 Yr Gr:Y', 'EPS - 1 Yr Gr:Y', 'P/E', 'ROE', 'Dvd 12M Yld']);
  const body = panel.locator('table.rv-comps:not(.rv-seg) tbody:not(.tbl-summary) tr');
  // RV's comp range panel: five figures, each with the subject, low and high.
  const range = panel.getByTestId('rv-range');
  await expect(range.locator('tbody tr td:first-child')).toHaveText(['P/E', 'EV/EBITDA', 'Revenue Growth', 'EBITDA Margin', 'ROE']);
  await expect(range.locator('thead th')).toHaveText(['Metric', 'AAPL', 'Low', 'Comp Range', 'High']);
  await expect(body.first().locator('td').first()).toHaveText('100)');
  await expect(body.first()).toContainText('AAPL US');
  await expect(body.nth(1).locator('td').first()).toHaveText('101)');
  // TE04 04:11: the segment panel opens on Whole Firm (the browser has no 10-K), the tabs are unnumbered, Export is a
  // dropdown without a number, and Mkt Cap > leaves out the peers below it while the loaded stock stays.
  await expect(panel.getByTestId('rv-segments').locator('tbody tr').first()).toContainText('Whole Firm100%');
  await expect(panel.locator('.tab').first()).toHaveText('Overview');
  await panel.locator('.fnh-actions').getByRole('button', { name: /^Export/ }).click();
  await expect(page.getByTestId('red-drop').getByRole('menuitem')).toHaveText(['Copy to Clipboard', 'Download as CSV']);
  await page.keyboard.press('Escape');
  const before = await body.count();
  await panel.getByLabel('Minimum market value in billions of US dollars').fill('100000');
  await expect(body).toHaveCount(1);
  await expect(body.first()).toContainText('AAPL US');
  await panel.getByLabel('Minimum market value in billions of US dollars').fill('0');
  await expect(body).toHaveCount(before);
  await panel.getByRole('button', { name: 'Comp Sheets' }).first().click();
  for (const name of ['Equity Valuation', 'Profitability', 'Balance Sheet']) await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Profitability', exact: true }).click();
  expect(await headers()).toEqual(['#', 'Name', '', 'Revenue Growth', 'Gross Margin', 'Op Margin', 'EBITDA Margin TTM', 'Net Profit Margin TTM', 'Return On Assets', 'Return On Equity', 'Eff Tax Rate', 'Revenue/Employee USD']);
  await expect(body.first()).toContainText('AAPL US');
  await panel.getByRole('button', { name: 'Markets' }).first().click();
  expect(await headers()).toEqual(['#', 'Name', '', 'Last Px', 'Chg Pct 1D', 'Chg Pct 1M', 'Chg Pct YTD', 'Chg Pct 1Y']);
  expect(errors).toEqual([]);
});

test("PEERS' Median line comes first and is the median of the loaded stock and its peers, as the report's RV captures give it", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL PEERS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('PEERS');
  await expect(panel.locator('tbody.tbl-summary tr').first()).toHaveAttribute('data-testid', 'rv-median');
  // Read the P/E column and the Median line at one moment, as the demo's prices move.
  const snap = await panel.evaluate((el) => {
    const headers = Array.from(el.querySelectorAll('table.rv-comps:not(.rv-seg) thead th')).map((h) => h.textContent?.trim() ?? '');
    const col = headers.findIndex((h) => h.startsWith('P/E'));
    const rows = Array.from(el.querySelectorAll('table.rv-comps:not(.rv-seg) tbody:not(.tbl-summary) tr')).filter((r) => r.querySelectorAll('td').length > col);
    const valueAt = (r: Element) => Number(r.querySelectorAll('td')[col]?.querySelector('[data-value]')?.getAttribute('data-value') ?? NaN);
    const cell = el.querySelector('[data-testid="rv-median"] td[data-key="pe"]');
    return { col, values: rows.map(valueAt), hasSubject: rows.some((r) => r.textContent?.includes('AAPL US')), median: Number(cell?.querySelector('[data-value]')?.getAttribute('data-value') ?? NaN) };
  });
  expect(snap.col).toBeGreaterThan(0);
  expect(snap.hasSubject).toBe(true);
  const xs = snap.values.filter(Number.isFinite).sort((a, b) => a - b);
  expect(xs.length).toBeGreaterThan(2);
  const mid = Math.floor(xs.length / 2);
  const expected = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  expect(snap.median).toBeCloseTo(expected, 9);
  expect(errors).toEqual([]);
});

test("PEERS ranks the loaded stock among its peers on each figure, as the table's own figures give", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL PEERS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('PEERS');
  const rank = panel.getByTestId('rv-rank');
  await expect(rank).toContainText('percentile among peers');
  // The P/E column: the subject's rank is the share of the others with a lower P/E. The exact figures (each cell
  // carries its own) and the rank row are read at one moment, as the demo's prices move, and two P/Es can look
  // equal at one decimal while one is lower.
  const snap = await panel.evaluate((el) => {
    const headers = Array.from(el.querySelectorAll('table.rv-comps:not(.rv-seg) thead th')).map((h) => h.textContent?.trim() ?? '');
    const col = headers.findIndex((h) => h.startsWith('P/E'));
    const rows = Array.from(el.querySelectorAll('table.rv-comps:not(.rv-seg) tbody:not(.tbl-summary) tr')).filter((r) => r.getAttribute('data-testid') !== 'rv-rank' && r.querySelectorAll('td').length > col);
    const valueAt = (r: Element) => Number(r.querySelectorAll('td')[col]?.querySelector('[data-value]')?.getAttribute('data-value') ?? NaN);
    const subject = rows.find((r) => r.textContent?.includes('AAPL US'));
    const rankCell = el.querySelector('[data-testid="rv-rank"] td[data-key="pe"]');
    return { col, values: rows.map(valueAt), subject: subject ? valueAt(subject) : NaN, rank: rankCell?.textContent?.trim() ?? '' };
  });
  expect(snap.col).toBeGreaterThan(0);
  const finite = snap.values.filter((v) => Number.isFinite(v) && v > 0);
  expect(Number.isFinite(snap.subject)).toBe(true);
  const expected = Math.round((finite.filter((v) => v < snap.subject).length / (finite.length - 1)) * 100);
  expect(snap.rank).toBe(String(expected));
  expect(errors).toEqual([]);
});

test("PEERS' Curr shows a London stock's market values and prices in pounds, not pence, or in US dollars", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'SHEL LN Equity PEERS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('PEERS');
  const curr = panel.getByLabel('Currency', { exact: true });
  await expect(curr).toHaveValue('GBP');
  await expect(curr.locator('option')).toHaveText(['GBP', 'USD']);
  const head = panel.locator('table.rv-comps thead');
  await expect(head).toContainText('Mkt Cap GBP');
  // Shell's market value and price, read at one moment, as the demo's prices and rates move.
  const shell = () =>
    panel.evaluate((el) => {
      const headers = Array.from(el.querySelectorAll('table.rv-comps thead th')).map((h) => h.textContent?.trim() ?? '');
      const row = Array.from(el.querySelectorAll('table.rv-comps tbody:not(.tbl-summary) tr')).find((r) => r.textContent?.includes('SHEL LN'));
      const cell = (label: string) => row?.querySelectorAll('td')[headers.findIndex((h) => h.startsWith(label))];
      const value = (label: string) => Number(cell(label)?.querySelector('[data-value]')?.getAttribute('data-value') ?? NaN);
      return { cap: value('Mkt Cap'), px: value('Last Px'), text: cell('Last Px')?.textContent?.trim() ?? '' };
    });
  const gbp = await shell();
  // Pounds with two decimals, as RV writes a London price.
  expect(gbp.text).toMatch(/^[\d,]+\.\d{2}$/);
  await expect(panel.locator('[data-testid="rv-median"] td[data-key="px"] [data-value]')).toHaveCount(1);
  await curr.selectOption('USD');
  await expect(head).toContainText('Mkt Cap USD');
  await expect(head).not.toContainText('GBP');
  const usd = await shell();
  // A pound is worth more than a dollar. The market value and the price convert at the same rate, so their ratio (the
  // share count) is the same in both currencies.
  expect(usd.px / gbp.px).toBeGreaterThan(1);
  expect(usd.px / gbp.px).toBeLessThan(2);
  expect(usd.cap / usd.px / (gbp.cap / gbp.px)).toBeCloseTo(1, 6);
  expect(errors).toEqual([]);
});
