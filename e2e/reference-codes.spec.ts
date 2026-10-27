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

test('SCREEN joins criteria by AND within a group and OR across groups, says its universe, and keeps saved screens', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'EQS');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code')).toHaveText('SCREEN');
  await expect(panel.locator('.fnh-sub')).toContainText("of the app's");
  // The full US list needs the desktop app; the browser build says so rather than offering it.
  await expect(panel.locator('option[value="us"]')).toHaveAttribute('disabled', '');
  await expect(panel.locator('option[value="us"]')).toContainText('desktop app');
  const rows = panel.locator('tbody tr');
  const all = await rows.count();
  await panel.getByLabel('Value 1.1').fill('500');
  const logic = panel.getByTestId('eqs-logic');
  await expect(logic).toContainText('Screen: Market value ≥ 500 $bn.');
  await expect.poll(() => rows.count()).toBeLessThan(all);
  const big = await rows.count();
  // A second group, joined by OR: more stocks, never fewer.
  await panel.getByRole('button', { name: '+ Or group' }).click();
  await panel.getByLabel('Field 2.1').selectOption('divYld');
  await panel.getByLabel('Value 2.1').fill('3');
  await expect(logic).toContainText('Screen: Market value ≥ 500 $bn or Dividend yield ≥ 3 %.');
  await expect.poll(() => rows.count()).toBeGreaterThan(big);
  // A second criterion in the first group, joined by AND.
  await panel.getByRole('button', { name: '+ And' }).first().click();
  await panel.getByLabel('Field 1.2').selectOption('sector');
  await panel.getByLabel('Value 1.2').fill('Information Technology');
  await expect(logic).toContainText('(Market value ≥ 500 $bn and Sector is "Information Technology") or Dividend yield ≥ 3 %');
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
  // The day chart, on a dotted line at the previous close.
  await expect(row.getByTestId('day-chart')).toBeVisible();
  await expect(row.getByTestId('day-chart-base')).toHaveAttribute('stroke-dasharray', '1.5 1.5');
  // Market value and average volume are figures, and their sources show on hover.
  const cell = async (label: string) => row.getByRole('cell').nth((await panel.locator('thead th').allTextContents()).findIndex((h) => h.replace(/[▲▼]/g, '').trim() === label));
  await expect(await cell('Market Cap')).toHaveText(/^\d+(\.\d+)?[KMBT]$/);
  await expect((await cell('Avg Vol (3M)')).locator('span[title]')).toHaveAttribute('title', /Calculated from the daily history[\s\S]*session is left out/);
  expect(errors).toEqual([]);
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
  await expect(panel).toContainText("the app needs its free key for them (NGAS)");
  await panel.getByRole('button', { name: 'WTI Crude futures curve', exact: true }).click();
  await expect(panel.locator('.fnh-code')).toHaveText('FUTURESCURVE');
  await run(page, 'GAS');
  await expect(panel.locator('.fnh-code')).toHaveText('NATURALGAS');
  await expect(panel.getByTestId('sector-contracts').locator('tbody tr')).toHaveCount(1);
  await expect(panel.getByTestId('sector-measures')).toContainText('Crude to gas ratio');
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
  await expect(panel.locator('.kv')).toContainText(/Next decision\d{2}\/\d{2}\/\d{2} \((today|in \d+ days?)\), 14:15 Frankfurt/);
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
  await expect(panel.locator('.note').last()).toContainText('This service uses the API provided by the "Bank of Japan Time-Series Data Search."');
  expect(errors).toEqual([]);
});
