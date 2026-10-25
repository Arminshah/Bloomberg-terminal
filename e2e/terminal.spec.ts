import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { checkAmericanOption, checkBond, checkBondConventions, checkForward, checkOptions, checkPortfolioPositions, checkStrategy, checkSwap } from './calculator-checks';
import { checkLinkedPanels } from './workspace-checks';

// Keep runs deterministic: no live network feeds.
async function boot(page: Page, layout?: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript((lay) => {
    // The browser build only runs the demo once it has been opened.
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    if (lay && !localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: lay } }));
  }, layout ?? '');
  await page.goto('/');
  await expect(page.locator('.panel').first()).toBeVisible();
  return errors;
}

test('the browser build opens without data until the demo is chosen, and the demo says so', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('This browser version has no market data source.')).toBeVisible();
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open the demo (simulated data)' }).click();
  await expect(page.locator('.panel').first()).toBeVisible();
  await expect(page.locator('.demo-banner')).toContainText('DEMO DATA');
  await expect(page.locator('.status-chip')).toContainText('DEMO DATA');
  await page.getByRole('button', { name: 'Leave demo' }).click();
  await expect(page.getByText('This browser version has no market data source.')).toBeVisible();
});

async function run(page: Page, cmd: string, panel = 0) {
  const input = page.locator(`#cmd-${panel}`);
  await input.click();
  await page.keyboard.press('Escape');
  await input.fill(cmd);
  await input.press('Enter');
}

test('linked security groups preserve functions, skip incompatible screens, and restore saved workspaces', async ({ page }) => {
  const errors = await boot(page, '4');
  await checkLinkedPanels(page, async (text, code, panel = 0) => {
    await run(page, text, panel);
    await expect(page.locator('.panel').nth(panel).locator('.fnh-code').first()).toHaveText(code);
  });
  expect(errors).toEqual([]);
});

test('field search inspects values and exports only filtered fields with provenance', async ({ page }) => {
  const errors = await boot(page, '1');
  await run(page, 'AAPL FLDS PX_LAST');
  await expect(page.locator('.fnh-code').first()).toHaveText('FIELDS');
  await expect(page.getByLabel('Search data fields')).toHaveValue('PX_LAST');
  await expect(page.getByTestId('field-value')).not.toContainText('--');
  await expect(page.locator('.field-definition')).toContainText('DEMO DATA');
  await page.getByLabel('Search data fields').fill('ARMIN_BID_ASK');
  await expect(page.locator('.tbl tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Inspect ARMIN_BID_ASK_SPREAD', exact: true }).click();
  await expect(page.locator('.field-definition')).toContainText('does not expose a separate bid/ask event timestamp');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export fields/ }).click();
  const download = await pending;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('ARMIN_BID_ASK_SPREAD,Bid/ask spread,Calculated,');
  expect(csv).toContain('ARMIN_BID_ASK_MID,Bid/ask midpoint,Calculated,');
  expect(csv).toContain('DEMO DATA');
  expect(csv).not.toContain('\nPX_LAST,');
  await page.getByLabel('Search data fields').fill('no_such_field');
  await expect(page.getByText('No fields match this search and category.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mnemonic display can be changed and stays saved without changing command behavior', async ({ page }) => {
  const errors = await boot(page, '1');
  await run(page, 'AAPL GP');
  await expect(page.locator('.fnh-mnemonic')).toContainText('GP');
  await expect(page.locator('#cmd-0')).toHaveAttribute('placeholder', /AAPL US Equity GP/);
  await run(page, 'SETTINGS');
  await page.getByRole('checkbox', { name: 'Show short function mnemonics and <GO> cues' }).uncheck();
  await run(page, 'AAPL GP');
  await expect(page.locator('.fnh-mnemonic')).toHaveCount(0);
  await expect(page.locator('.fnh-code')).toHaveText('CHART');
  await expect(page.locator('#cmd-0')).toHaveAttribute('placeholder', /AAPL US Equity CHART/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('armin:settings') ?? 'null')?.s?.mnemonics)).toBe(false);
  await page.reload();
  await expect(page.locator('.fnh-code')).toHaveText('CHART');
  await expect(page.locator('.fnh-mnemonic')).toHaveCount(0);
  expect(errors).toEqual([]);
});

const COMMANDS: [string, string][] = [
  ['AAPL FLDS', 'FIELDS'],
  ['FILINGS MSFT', 'FILINGS'], ['CROSSCHECK AAPL', 'CROSSCHECK'], ['MARKETNEWS NVDA', 'MARKETNEWS'], ['MACRO CPI', 'MACRO'],
  ['AAPL US EQUITY PROFILE', 'PROFILE'], ['AAPL CHART', 'CHART'], ['AAPL INTRADAY', 'INTRADAY'], ['AAPL HISTORY', 'HISTORY'], ['AAPL FINANCIALS', 'FINANCIALS'], ['AAPL ANALYSTS', 'ANALYSTS'],
  ['AAPL EARNINGS', 'EARNINGS'], ['AAPL DIVIDENDS', 'DIVIDENDS'], ['AAPL HOLDERS', 'HOLDERS'], ['AAPL MGMT', 'MANAGEMENT'], ['AAPL PEERS', 'PEERS'], ['EVENTS', 'EVENTS'], ['AAPL WACC', 'WACC'],
  ['AAPL RETURNS', 'RETURNS'], ['AAPL MCAP', 'MARKETCAP'], ['AAPL BETA', 'BETA'], ['CORRELATION', 'CORRELATION'], ['TSLA QUOTE', 'QUOTE'], ['TSLA TRADES', 'TRADES'], ['TSLA DEPTH', 'DEPTH'],
  ['HEADLINES', 'HEADLINES'], ['NEWS CRYPTO', 'NEWS'], ['AAPL COMPANYNEWS', 'COMPANYNEWS'], ['MARKET', 'MARKET'], ['HEATMAP', 'HEATMAP'], ['IMAP', 'INDEXMAP'], ['MOVERS', 'MOVERS'], ['SCREEN', 'SCREEN'],
  ['FXMATRIX', 'FXMATRIX'], ['FXRANK', 'FXRANK'], ['CRYPTO', 'CRYPTO'], ['BONDS', 'BONDS'], ['CURVE', 'CURVE'], ['MONEYMARKET', 'MONEYMARKET'], ['CT10 GOVT BONDCALC', 'BONDCALC'],
  ['RATEPROBS', 'RATEPROBS'], ['COMMODITIES', 'COMMODITIES'], ['RELEASES', 'RELEASES'], ['ECONSTATS', 'ECONSTATS'], ['NVDA OPTIONS', 'OPTIONS'], ['NVDA OPTIONCALC', 'OPTIONCALC'],
  ['WATCHLIST', 'WATCHLIST'], ['PORTFOLIO', 'PORTFOLIO'], ['ALERTS', 'ALERTS'], ['SEARCH', 'SEARCH'], ['RECENT', 'RECENT'], ['LAYOUTS', 'LAYOUTS'], ['MESSAGES', 'MESSAGES'],
  ['SETTINGS', 'SETTINGS'], ['PROVIDERS', 'PROVIDERS'], ['HELP', 'HELP'], ['WHATSNEW', 'WHATSNEW'], ['EURUSD CRNCY PROFILE', 'PROFILE'], ['SPX INDEX PROFILE', 'PROFILE'], ['CL1 CMDTY PROFILE', 'PROFILE'],
  ['USGG10YR INDEX PROFILE', 'PROFILE'], ['XBTUSD CRNCY PROFILE', 'PROFILE'], ['CT2 GOVT PROFILE', 'PROFILE'], ['USGG10YR INDEX SPREAD', 'SPREAD'], ['AAPL NOTES', 'NOTES'],
  ['IBM US EQUITY', 'MENU'], ['EQUITY', 'EQUITY'], ['GOVT', 'GOVT'], ['CORP', 'CORP'], ['CRNCY', 'CRNCY'], ['MTGE', 'MTGE'], ['MENU', 'MENU'],
  ['AAPL CORP', 'BONDSEARCH'], ['JPM CORP DEBTPROFILE', 'DEBTPROFILE'], ['AAPL 4.65 02/23/46 CORP PROFILE', 'PROFILE'], ['AAPL 4.65 02/23/46 CORP BONDCALC', 'BONDCALC'],
  ['AAPL 4.65 02/23/46 CORP DEALERQUOTES', 'DEALERQUOTES'], ['CT10 GOVT DEALERQUOTES', 'DEALERQUOTES'], ['ES1 INDEX PROFILE', 'PROFILE'], ['ES1 INDEX INTRADAY', 'INTRADAY'], ['ES1 INDEX TRADES', 'TRADES'],
  ['ES1 INDEX DEPTH', 'DEPTH'], ['INDEXFUTURES', 'INDEXFUTURES'], ['SPX INDEX CONTRIB', 'CONTRIB'], ['INDU INDEX CONTRIB', 'CONTRIB'], ['AAPL TOTALRETURN', 'TOTALRETURN'], ['SPX INDEX TOTALRETURN', 'TOTALRETURN'],
  ['AAPL FUNDCHART', 'FUNDCHART'], ['AAPL VOLATILITY', 'VOLATILITY'], ['USGG10YR INDEX VOLATILITY', 'VOLATILITY'], ['AAPL VWAP', 'VWAP'], ['EURUSD CRNCY FXFORWARD', 'FXFORWARD'], ['USDJPY CRNCY FXOPTION', 'FXOPTION'],
  ['SWAPCALC', 'SWAPCALC'], ['HOLIDAYS', 'HOLIDAYS'], ['CENTRALBANKS', 'CENTRALBANKS'], ['HELP HELP', 'MESSAGES'],
  ['OSA', 'OPTIONSTRATEGY'],
  ['BREAKING', 'BREAKING'], ['FIRST FAV', 'BREAKING'], ['FAVOURITES', 'FAVOURITES'], ['FAV NEWS', 'FAVOURITES'], ['NEWS SPEECH', 'NEWS'], ['GC1 COMDTY COMPANYNEWS', 'COMPANYNEWS'],
  ['$APLD', 'MENU'], ['APLD US EQUITY PROFILE', 'PROFILE'], ['$APLD CHART', 'CHART'], ['APLD FINANCIALS', 'FINANCIALS'],
  ['EXCH', 'EXCHANGES'], ['GPC AAPL', 'CHART'], ['AAPL GPO', 'CHART'], ['CF MSFT', 'FILINGS'], ['AAPL ERN', 'EARNINGS'], ['QR TSLA', 'TRADES'], ['PDF', 'SETTINGS'],
  ['FOMC', 'FEDMEETINGS'], ['EVT', 'EVENTS'], ['ECMX', 'ECONSTATS'], ['AAPL RSI', 'CHART'], ['MACD AAPL', 'CHART'], ['BOLL AAPL', 'CHART'], ['AAPL HP OHLC', 'HISTORY'], ['FA AAPL BS', 'FINANCIALS'],
  ['AAPL EEO', 'ESTIMATES'], ['AAPL CACS', 'CORPACTIONS'], ['AAPL SI', 'SHORTINTEREST'], ['AAPL EQRP', 'RISKPREMIUM'], ['SPX INDEX MEMB', 'MEMBERS'], ['NDX INDEX MRR', 'RANKEDRETURNS'],
  ['MLRT', 'ALERTS'], ['AAPL GV', 'VOLATILITY'], ['NVDA SPLC', 'SUPPLYCHAIN'], ['SPX INDEX GRR', 'GROUPRETURNS'], ['AAPL BBK', 'BUYBACKS'], ['IPO', 'IPOS'], ['AAPL DS', 'DOCSEARCH'], ['WBF', 'BONDFUTURES'], ['GAINERS', 'TOPMOVERS'], ['TOPMOVERS', 'TOPMOVERS'],
  ['NVDA HOLDINGS', 'HOLDINGS'], ['BRK/B 13F', 'HOLDINGS'], ['CONGRESS', 'CONGRESS'], ['NVDA CONGRESS', 'CONGRESS'], ['CONG', 'CONGRESS'],
];

test('default workspace renders four live panels and the watchlist column', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.panel')).toHaveCount(5);
  await expect(page.locator('.fnh-code').first()).toHaveText('MARKET');
  await expect(page.locator('.panel').nth(4).locator('.fnh-code')).toHaveText('WATCHLIST');
  // The market timers come first in the row, Euronext then NYSE, before the Brussels clock.
  await expect(page.locator('.market-timer').first()).toHaveAccessibleName(/Euronext: regular session (open|closed), (opens|closes) in .*Open market calendar/);
  await expect(page.locator('.market-timer').nth(1)).toHaveAccessibleName(/NYSE: regular session (open|closed), (opens|closes) in .*Open market calendar/);
  await expect(page.locator('.clock').first()).toContainText('BRUSSELS');
  // The demo has no data source to ask again, so there is no REFRESH button.
  await expect(page.locator('.tb-refresh')).toHaveCount(0);
  const first = await page.locator('.panel').nth(1).locator('.qstrip .px').textContent();
  await page.waitForTimeout(2500);
  const later = await page.locator('.panel').nth(1).locator('.qstrip .px').textContent();
  expect(first).toBeTruthy();
  expect(later).toBeTruthy();
  expect(errors).toEqual([]);
});

test('every function renders without errors', async ({ page }) => {
  test.setTimeout(180_000);
  const registry = await readFile(new URL('../src/terminal/registry.ts', import.meta.url), 'utf8');
  const registered = [...registry.matchAll(/\{ code: '([^']+)'/g)].map((m) => m[1]);
  const tested = new Set(COMMANDS.map(([, code]) => code));
  expect(registered.filter((code) => !tested.has(code)), 'Every registered function needs a rendering check').toEqual([]);
  const errors = await boot(page, '1');
  for (const [cmd, code] of COMMANDS) {
    await run(page, cmd);
    await expect(page.locator('.panel').first().locator('.fnh-code').first(), cmd).toHaveText(code);
    await expect(page.locator('text=failed to render'), cmd).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('typing anywhere goes to the command line, with autocomplete', async ({ page }) => {
  await boot(page, '1');
  await page.locator('.panel-body').first().click();
  await page.keyboard.type('nvid');
  await expect(page.locator('#cmd-0')).toHaveValue('nvid');
  await expect(page.locator('.ac-item').first()).toContainText('NVDA US Equity');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cmd-0')).toHaveValue(/NVDA US EQUITY/);
  await page.keyboard.type('CHART');
  await page.keyboard.press('Enter');
  await expect(page.locator('.fnh-sec').first()).toHaveText('NVDA US Equity');
  await expect(page.locator('.fnh-code').first()).toHaveText('CHART');
});

test('numbered menu items and back navigation work', async ({ page }) => {
  await boot(page, '1');
  await run(page, 'MSFT CHART');
  await run(page, '3');
  await expect(page.locator('.tab.on')).toContainText('3M');
  await run(page, 'MSFT PROFILE');
  await expect(page.locator('.fnh-code').first()).toHaveText('PROFILE');
  await page.locator('#cmd-0').click();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.fnh-code').first()).toHaveText('CHART');
});

test('the mouse back and forward buttons move through the screens of the panel under the pointer', async ({ page }) => {
  const errors = await boot(page, '2');
  await run(page, 'MSFT CHART', 1);
  await run(page, 'MSFT PROFILE', 1);
  await run(page, 'WEI', 0);
  const right = page.locator('.panel').nth(1);
  const left = page.locator('.panel').first();
  await expect(right.locator('.fnh-code').first()).toHaveText('PROFILE');
  const leftCode = await left.locator('.fnh-code').first().textContent();
  // Press the side buttons as a mouse does, over the right panel's body.
  const box = (await right.locator('.panel-body').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const press = async (button: 'back' | 'forward') => {
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button, clickCount: 1 });
  };
  await press('back');
  await expect(right.locator('.fnh-code').first()).toHaveText('CHART');
  await press('forward');
  await expect(right.locator('.fnh-code').first()).toHaveText('PROFILE');
  // The other panel stays where it was, and the page itself never navigates.
  await expect(left.locator('.fnh-code').first()).toHaveText(leftCode!);
  expect(page.url()).toMatch(/\/$/);
  expect(errors).toEqual([]);
});

test("the mouse back button steps back through a screen's tabs before leaving it, as a browser does", async ({ page }) => {
  const errors = await boot(page, '1');
  await run(page, 'MSFT CHART');
  await run(page, 'MSFT PROFILE');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code').first()).toHaveText('PROFILE');
  const tabs = panel.locator('nav.tabs .tab');
  await tabs.nth(1).click();
  await tabs.nth(2).click();
  await expect(panel.locator('.tab.on')).toContainText('3)');
  const box = (await panel.locator('.panel-body').boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const press = async (button: 'back' | 'forward') => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button, clickCount: 1 });
  };
  await press('back');
  await expect(panel.locator('.tab.on')).toContainText('2)');
  await press('back');
  await expect(panel.locator('.tab.on')).toContainText('1)');
  await press('back');
  await expect(panel.locator('.fnh-code').first()).toHaveText('CHART');
  // Forward returns to the profile on the tab it was left on, then through the tabs again.
  await press('forward');
  await expect(panel.locator('.fnh-code').first()).toHaveText('PROFILE');
  await expect(panel.locator('.tab.on')).toContainText('1)');
  await press('forward');
  await expect(panel.locator('.tab.on')).toContainText('2)');
  expect(errors).toEqual([]);
});

test('numbered rows open by number, as on terminal monitors', async ({ page }) => {
  const errors = await boot(page, '1');
  const panel = page.locator('.panel').first();
  await run(page, 'WEI');
  await expect(panel.locator('tbody tr').nth(1).locator('.row-no')).toHaveText('11)');
  await run(page, '12');
  await expect(panel.locator('.fnh-code').first()).toHaveText('CHART');
  await expect(panel.locator('.fnh-sec')).toHaveText('SPX Index');
  // Region headings collapse and expand by their numbers.
  await run(page, 'WEI');
  const rows = panel.locator('tbody tr.click:not(.group)');
  const all = await rows.count();
  await run(page, '1');
  await expect(panel.locator('tr.group').first()).toHaveAttribute('aria-expanded', 'false');
  await expect(rows).toHaveCount(all - 8);
  // Each region numbers from its own ten, as WEI does, so EMEA keeps 21) with the Americas folded.
  await expect(rows.first().locator('.row-no')).toHaveText('21)');
  await expect(rows.first()).toContainText('EURO STOXX 50');
  await run(page, '21');
  await expect(panel.locator('.fnh-sec')).toHaveText('SX5E Index');
  await run(page, 'WEI');
  await run(page, '1');
  await expect(rows).toHaveCount(all - 8);
  await run(page, '1');
  await expect(rows).toHaveCount(all);
  // MOVERS rows start after its tabs and regions.
  await run(page, 'MOST');
  await expect(panel.locator('td.idx').first()).toHaveText('21)');
  const first = (await panel.locator('tbody tr').first().locator('.sec-link').innerText()).trim();
  await run(page, '21');
  await expect(panel.locator('.fnh-code').first()).toHaveText('PROFILE');
  await expect(panel.locator('.fnh-sec')).toHaveText(`${first} Equity`);
  // EXCH lists the exchange calendars; a row number opens that exchange's holidays.
  await run(page, 'EXCH');
  await expect(panel.locator('tbody tr')).toHaveCount(5);
  await expect(panel.locator('tbody tr').first()).toContainText(/OPEN|CLOSED|HOLIDAY|WEEKEND/);
  await run(page, '2');
  await expect(panel.locator('.fnh-code').first()).toHaveText('HOLIDAYS');
  await expect(panel.locator('.tab.on')).toHaveText('2) EU');
  expect(errors).toEqual([]);
});

test('screens page with PgUp and PgDn, a typed count moves that many pages, and headings stay in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  const errors = await boot(page, '1');
  const panel = page.locator('.panel').first();
  // HP's own view is the terminal's price table: weekday-dated last prices and volume in blocks across the screen.
  await run(page, 'AAPL HP');
  await expect(panel.locator('table.hp-blocks').first().locator('thead th').first()).toHaveText('Date');
  await expect(panel.locator('table.hp-blocks .hp-wd').first()).toHaveText(/^(Mo|Tu|We|Th|Fr)$/);
  await expect(panel.getByLabel('Range summary')).toContainText('High');
  await run(page, 'AAPL HP OHLC');
  const indicator = panel.getByTestId('page-indicator');
  await expect(indicator).toHaveText(/^Page 1\/\d+$/);
  const pages = Number((await indicator.innerText()).split('/')[1]);
  expect(pages).toBeGreaterThan(2);
  await page.locator('#cmd-0').click();
  await page.keyboard.press('PageDown');
  await expect(indicator).toHaveText(`Page 2/${pages}`);
  // Column names stay below the pinned function bar on every page.
  const bar = await panel.locator('.fnh').boundingBox();
  const heading = await panel.locator('thead th').first().boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
  await page.keyboard.type('5');
  await page.keyboard.press('PageDown');
  await expect(indicator).toHaveText(`Page ${pages}/${pages}`);
  await expect(page.locator('#cmd-0')).toHaveValue('');
  await page.keyboard.press('PageUp');
  await expect(indicator).toHaveText(`Page ${pages - 1}/${pages}`);
  await page.getByRole('button', { name: 'PG BK' }).click();
  await expect(indicator).toHaveText(`Page ${pages - 2}/${pages}`);
  expect(errors).toEqual([]);
});

test('chart style mnemonics, intraday period and help on a typed mnemonic', async ({ page }) => {
  const errors = await boot(page, '1');
  const panel = page.locator('.panel').first();
  await run(page, 'GPC AAPL');
  await expect(panel.locator('.fnh-mnemonic')).toContainText('GPC');
  await expect(panel.getByRole('group', { name: 'Chart type' }).locator('button.on')).toHaveText('Candle');
  await expect(page.locator('#cmd-0')).toHaveAttribute('placeholder', /AAPL US Equity GPC/);
  await run(page, 'AAPL GPO 3M');
  await expect(panel.getByRole('group', { name: 'Chart type' }).locator('button.on')).toHaveText('Bar');
  await expect(panel.locator('.tab.on')).toHaveText('3) 3M');
  // The style belongs to that chart; a plain GP keeps the saved style.
  await run(page, 'AAPL GP');
  await expect(panel.locator('.fnh-mnemonic')).toContainText('GP');
  await expect(panel.getByRole('group', { name: 'Chart type' }).locator('button.on')).toHaveText('Mountain');
  await run(page, 'CHART AAPL 1D');
  await expect(panel.locator('.fnh-code').first()).toHaveText('INTRADAY');
  // DES <HELP>: a mnemonic typed before HELP opens its help page.
  await page.locator('#cmd-0').click();
  await page.keyboard.type('DES');
  await page.keyboard.press('F1');
  await expect(panel.locator('.fnh-code').first()).toHaveText('HELP');
  await expect(panel.locator('.fnh-title')).toHaveText('Help: Profile');
  await expect(page.locator('#cmd-0')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('DES pages and numbered boxes, the security in the red bar and typed chart ranges', async ({ page }) => {
  const errors = await boot(page, '1');
  const panel = page.locator('.panel').first();
  await run(page, 'AAPL DES');
  // The loaded security sits in the amber field of the red bar; the title reads as the terminal's.
  await expect(panel.locator('.fnh-row .fnh-sec')).toHaveText('AAPL US Equity');
  await expect(panel.locator('.fnh-title')).toHaveText('Security Description: Equity');
  await expect(panel.locator('.tab')).toHaveText(['1) Profile', '2) Issue Info', '3) Ratios', '4) Revenue & EPS', '5) Industry Info']);
  await expect(panel.locator('.des-name')).toHaveText('APPLE INC');
  await expect(panel.getByRole('button', { name: /8\) Price Chart/ })).toBeVisible();
  await run(page, '3');
  await expect(panel.locator('.tab.on')).toHaveText('3) Ratios');
  await expect(panel.locator('.sect-h', { hasText: 'Per Share Data' })).toBeVisible();
  await run(page, '1');
  await run(page, '9');
  await expect(panel.locator('.fnh-code').first()).toHaveText('EARNINGS');
  // GP's amber range boxes take a typed start date; the period tabs then show none chosen.
  await run(page, 'AAPL GP');
  const start = panel.getByLabel('Start date');
  await expect(start).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
  await start.fill('01/02/2026');
  await start.press('Enter');
  await expect(panel.locator('.tab.on')).toHaveCount(0);
  await expect(start).toHaveValue('01/02/2026');
  await start.fill('13/45/2026');
  await start.press('Enter');
  await expect(start).toHaveClass(/\bbad\b/);
  await run(page, '6');
  await expect(panel.locator('.tab.on')).toHaveText('6) 1Y');
  // RSI <GO> is a chart with the RSI study added for that chart, shown under its own mnemonic.
  await run(page, 'AAPL RSI');
  await expect(panel.locator('.fnh-mnemonic')).toContainText('RSI');
  await expect(panel.getByRole('button', { name: 'RSI', exact: true })).toHaveClass(/\bon\b/);
  await run(page, 'AAPL GP');
  await expect(panel.getByRole('button', { name: 'RSI', exact: true })).not.toHaveClass(/\bon\b/);
  // FA opens a page by name; MOST lists the stocks nearest their 52-week highs.
  await run(page, 'FA AAPL BS');
  await expect(panel.locator('.tab.on')).toHaveText('3) B/S');
  await run(page, 'MOST');
  await run(page, '6');
  await expect(panel.locator('thead th', { hasText: 'vs High' })).toBeVisible();
  // FOMC lists the year's meetings with the related functions numbered from 21.
  await run(page, 'FOMC');
  await expect(panel.locator('.fnh-title')).toHaveText('FOMC Announcement Dates');
  await expect(panel.locator('tbody tr').first()).toContainText('14:00 ET');
  await run(page, '21');
  await expect(panel.locator('.fnh-code').first()).toHaveText('RATEPROBS');
  expect(errors).toEqual([]);
});

test('bad commands explain themselves', async ({ page }) => {
  await boot(page, '1');
  await run(page, 'ZZZZ CHART');
  await expect(page.locator('.cmd-msg.error')).toContainText('Unknown');
  await run(page, 'EURUSD CRNCY FINANCIALS');
  await expect(page.locator('.cmd-msg.error')).toContainText('not available');
  // The browser demo cannot look stocks up and says where to do it.
  await run(page, '$SOFI');
  await expect(page.locator('.cmd-msg.error')).toContainText('the desktop app looks up any US stock');
});

test('mnemonic commands run the implemented functions and open their help', async ({ page }) => {
  const errors = await boot(page, '1');
  for (const [cmd, code] of [['GP AAPL', 'CHART'], ['AAPL US EQUITY DES', 'PROFILE'], ['FA AAPL', 'FINANCIALS'], ['BQ AAPL', 'QUOTE'], ['WEI', 'MARKET'], ['W', 'WATCHLIST'], ['TOP', 'MARKETNEWS']]) {
    await run(page, cmd);
    await expect(page.locator('.panel').first().locator('.fnh-code').first(), cmd).toHaveText(code);
  }
  // TOP is the market news; its numbered Official item opens the official announcements.
  await run(page, '4');
  await expect(page.locator('.panel').first().locator('.fnh-code').first()).toHaveText('HEADLINES');
  await run(page, 'HELP GP');
  await expect(page.locator('.panel').first()).toContainText('CHART');
  await run(page, 'DES?');
  await expect(page.locator('.panel').first()).toContainText('PROFILE');
  expect(errors).toEqual([]);
});

test("clicking a market value opens the company's market cap history", async ({ page }) => {
  const errors = await boot(page, '1');
  await run(page, 'AAPL PROFILE');
  const panel = page.locator('.panel').first();
  await panel.locator('.cap-link').first().click();
  await expect(panel.locator('.fnh-code')).toHaveText('MARKETCAP');
  await expect(panel.locator('.mcap-now')).toContainText(/\d/);
  await expect(panel.locator('table.tbl tbody tr').first()).toContainText(/^\d{4}/);
  expect(errors).toEqual([]);
});

test('the events calendar covers the watchlist first, then every stock or the portfolio', async ({ page }) => {
  const errors = await boot(page, '1');
  await run(page, 'EVTS');
  const header = page.locator('.panel').first().locator('.fnh');
  await expect(header.locator('.fnh-code')).toHaveText('EVENTS');
  // The default watchlist holds stocks, so the calendar starts on them.
  await expect(header.getByRole('button', { name: '12) Watchlist' })).toHaveClass(/\bon\b/);
  await expect(header.locator('.fnh-sub')).toContainText('watchlist Core:');
  await run(page, '11');
  await expect(header.getByRole('button', { name: '11) All' })).toHaveClass(/\bon\b/);
  await expect(header.locator('.fnh-sub')).toContainText('all stocks');
  await run(page, '13');
  await expect(header.getByRole('button', { name: '13) Portfolio' })).toHaveClass(/\bon\b/);
  await expect(page.locator('.panel').first().locator('.empty')).toContainText('Your portfolio holds no stocks');
  // One company's calendar has no list to pick.
  await run(page, 'AAPL EVENTS');
  await expect(header.getByRole('button', { name: '12) Watchlist' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('watchlist add and alert creation persist', async ({ page }) => {
  await boot(page, '1');
  await run(page, 'WATCHLIST');
  await page.getByLabel('Add security to monitor').fill('ORCL');
  await page.getByLabel('Add security to monitor').press('Enter');
  await expect(page.locator('table.tbl')).toContainText('ORCL US');
  await run(page, 'ALERTS');
  await page.getByLabel('Security', { exact: true }).fill('AAPL US Equity');
  await page.getByLabel('Trigger value').fill('1');
  await page.getByRole('button', { name: 'Create alert' }).click();
  // A price alert at 1 or above fires immediately.
  await expect(page.locator('.toast.toast-alert')).toBeVisible({ timeout: 5000 });
  await page.reload();
  await run(page, 'WATCHLIST');
  await expect(page.locator('table.tbl')).toContainText('ORCL US');
});

test('phone layout shows one panel without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expect(page.locator('.mobile-tabs')).toBeVisible();
  await expect(page.locator('.panel:visible')).toHaveCount(1);
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
  await page.locator('.mobile-tabs button').nth(1).click();
  await expect(page.locator('.panel:visible .fnh-code').first()).toHaveText('CHART');
});

test('bond and FX forward calculators solve independent examples, reject invalid inputs and export inputs with results', async ({ page }) => {
  const errors = await boot(page, '1');
  const execute = async (text: string, code: string) => {
    await run(page, text);
    await expect(page.locator('.fnh-code').first()).toHaveText(code);
  };
  await checkBond(page, execute);
  const saving = page.waitForEvent('download');
  await run(page, '99');
  const download = await saving;
  expect(download.suggestedFilename()).toBe('bond-calculation.csv');
  const path = await download.path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, 'utf8');
  expect(csv).toContain('Actual/Actual ICMA');
  expect(csv).toContain('2030-01-01');
  expect(csv).toContain('User-entered contract terms');
  await checkBondConventions(page, execute);
  await checkForward(page, execute);
  expect(errors).toEqual([]);
});

test('swap and option calculators respect curve coverage, contract direction and zero volatility', async ({ page }) => {
  const errors = await boot(page, '1');
  const execute = async (text: string, code: string) => {
    await run(page, text);
    await expect(page.locator('.fnh-code').first()).toHaveText(code);
  };
  await checkSwap(page, execute);
  await checkOptions(page, execute);
  expect(errors).toEqual([]);
});

test('multi-leg option strategies expose exact expiry risk and export their entered positions', async ({ page }) => {
  const errors = await boot(page, '1');
  await checkStrategy(page, async (text, code) => { await run(page, text); await expect(page.locator('.fnh-code').first()).toHaveText(code); });
  const saving = page.waitForEvent('download');
  await run(page, '99');
  const download = await saving;
  expect(download.suggestedFilename()).toBe('option-strategy.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('European Black-Scholes-Merton');
  expect(csv).toContain('C,100,1,8,25');
  expect(csv).toContain('Max expiry loss,400');
  expect(errors).toEqual([]);
});

test('American option valuation, independent PDE premium inversion and calculation export', async ({ page }) => {
  const errors = await boot(page, '1');
  await checkAmericanOption(page, async (cmd, code) => { await run(page, cmd); await expect(page.locator('.fnh-code').first()).toHaveText(code); });
  const saving = page.waitForEvent('download');
  await run(page, '99');
  const download = await saving;
  expect(download.suggestedFilename()).toBe('option-calculation.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('American Tian binomial');
  expect(csv).toContain('Tenor calendar days,365');
  expect(csv).toContain('Early exercise premium,');
  expect(errors).toEqual([]);
});

test('portfolio date-aligned risk, independent stress P&L and coverage-labelled exports', async ({ page }) => {
  // Fixed marks keep the independent stress calculation stable while actual UI timers run.
  await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
  const errors = await boot(page, '1');
  await checkPortfolioPositions(page, async (cmd, code) => { await run(page, cmd); await expect(page.locator('.fnh-code').first()).toHaveText(code); });
  await expect(page.getByTestId('risk-samples')).toHaveText('252');
  const nav = Number((await page.getByTestId('risk-nav').innerText()).replace(/,/g, ''));
  await page.getByRole('button', { name: 'All prices −10%', exact: true }).click();
  const pnl = Number((await page.getByTestId('stress-pnl').innerText()).replace(/,/g, ''));
  expect(pnl).toBeCloseTo(-0.1 * (nav - 10_000), 1);
  await page.getByLabel('Risk confidence').selectOption('0.975');
  await page.getByLabel('Risk horizon').selectOption('5');
  await expect(page.getByTestId('risk-samples')).toHaveText('248');
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export risk CSV', exact: true }).click();
  const download = await saving;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Confidence,0.975');
  expect(csv).toContain('Horizon shared intervals,5');
  expect(csv).toContain('Expected shortfall contribution USD');
  expect(csv).toContain('AAPL US Equity,5,90,1,false');
  expect(csv).toContain('Historical session,Replay NAV USD,AAPL US Equity local price,AAPL US Equity USD per currency unit');
  await run(page, '2');
  await expect(page.getByText('Fixed holdings replay (USD)', { exact: true })).toBeVisible();
  await expect(page.getByText('Historical NAV', { exact: true })).toBeVisible();
  await run(page, 'CORR');
  while (await page.getByRole('button', { name: /^Remove / }).count()) await page.getByRole('button', { name: /^Remove / }).first().click();
  await expect(page.getByText('Add securities to compare their daily returns.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('workspace tabs open, keep each workspace, rename, close and reopen as a browser\'s tabs', async ({ page }) => {
  const errors = await boot(page);
  const titles = () => page.locator('.wtab .wtab-title, .wtab .wtab-edit').allTextContents();
  await expect(page.locator('.wtab')).toHaveCount(1);
  await run(page, 'AAPL US Equity DES');
  await expect(page.locator('.wtab.on')).toContainText('AAPL PROFILE');
  await page.getByRole('button', { name: 'New tab' }).click();
  await expect(page.locator('.wtab')).toHaveCount(2);
  await expect(page.locator('.wtab.on')).toContainText('New Tab');
  await run(page, 'NVDA US Equity GP');
  await expect(page.locator('.wtab.on')).toContainText('NVDA CHART');
  await page.locator('.wtab').first().click();
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('PROFILE');
  await page.locator('.wtab').first().dblclick();
  await page.getByRole('textbox', { name: 'Tab name' }).fill('EQUITY_LONG');
  await page.getByRole('textbox', { name: 'Tab name' }).press('Enter');
  expect(await titles()).toEqual(['EQUITY_LONG', 'NVDA CHART']);
  await page.getByRole('button', { name: 'Close NVDA CHART' }).click();
  await expect(page.locator('.wtab')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+T');
  await expect(page.locator('.wtab')).toHaveCount(2);
  await expect(page.locator('.wtab.on')).toContainText('NVDA CHART');
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('CHART');
  expect(errors).toEqual([]);
});

test('a layout of your own: rows first, a screen per tile, a name; resized, saved, and back at the same sizes', async ({ page }) => {
  const errors = await boot(page, '1');
  await run(page, 'LAYOUTS');
  const panel = page.locator('.panel').first();
  // One tile across the top, two below: the heat map, the market news and a stock's chart.
  await panel.getByRole('button', { name: '2 rows: 1 + 2 tiles', exact: true }).click();
  await expect(panel.locator('.lb-prow')).toHaveCount(2);
  await panel.getByLabel('Screen for tile 1').fill('HEATMAP');
  await panel.getByLabel('Screen for tile 2').fill('MARKETNEWS');
  await panel.getByLabel('Screen for tile 3').fill('AAPL US Equity CHART');
  await panel.getByLabel('New layout name').fill('Morning');
  await panel.getByRole('button', { name: 'Make and save' }).click();
  const panels = page.locator('.workspace > .panel');
  await expect(panels).toHaveCount(3);
  await expect(panels.nth(0).locator('.fnh-code').first()).toHaveText('HEATMAP');
  await expect(panels.nth(2).locator('.fnh-code').first()).toHaveText('CHART');
  const box = async (i: number) => (await panels.nth(i).boundingBox())!;
  const [top, left, right] = [await box(0), await box(1), await box(2)];
  // The heat map spans the width; the other two share the row below it.
  expect(Math.abs(top.width - (right.x + right.width - left.x))).toBeLessThan(4);
  expect(left.y).toBeGreaterThan(top.y + top.height - 2);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  expect(Math.abs(left.width - right.width)).toBeLessThan(4);
  const menu = page.getByRole('button', { name: 'LAYOUTS ▾', exact: true });
  await expect(menu.locator('.unsaved-dot')).toHaveCount(0);
  // Drag the line between the two lower tiles to the left: the news gets narrower than the chart.
  const line = page.getByRole('separator', { name: 'Resize row 2, tiles 1 and 2' });
  const l = (await line.boundingBox())!;
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2);
  await page.mouse.down();
  await page.mouse.move(l.x + l.width / 2 - 300, l.y + l.height / 2, { steps: 6 });
  await page.mouse.up();
  const narrow = (await box(1)).width;
  expect(narrow).toBeLessThan((await box(2)).width - 200);
  // The menu offers to save the change.
  await expect(menu.locator('.unsaved-dot')).toHaveCount(1);
  await expect(menu).toHaveAttribute('title', 'Unsaved changes to "Morning": the menu saves them');
  await menu.click();
  await page.getByRole('menuitem', { name: /Save changes to .Morning./ }).click();
  await expect(menu.locator('.unsaved-dot')).toHaveCount(0);
  // Another layout, then this one again: the same tiles at the saved sizes, and after a reload too.
  await page.getByRole('button', { name: 'Four panels', exact: true }).click();
  await expect(panels).toHaveCount(4);
  await menu.click();
  // Switching to four panels is a change the menu would save; the saved layout itself is the line with its panels.
  await expect(page.getByRole('menuitem', { name: /Save changes to .Morning./ })).toBeVisible();
  await page.getByRole('menuitem').filter({ hasText: 'Morning' }).filter({ hasText: '3 panels' }).click();
  await expect(panels).toHaveCount(3);
  expect(Math.abs((await box(1)).width - narrow)).toBeLessThan(3);
  await page.reload();
  await expect(panels).toHaveCount(3);
  expect(Math.abs((await box(1)).width - narrow)).toBeLessThan(3);
  await expect(page.getByRole('button', { name: 'Your own layout' })).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

test('portfolio tabs keep each portfolio\'s holdings and cash, open, rename, close only when asked, and stay after a reload', async ({ page }) => {
  const errors = await boot(page, '1');
  const panel = page.locator('.panel').first();
  const tabs = () => panel.locator('.ptab').allTextContents();
  const add = async (sec: string, qty: string) => {
    await panel.getByLabel('Security', { exact: true }).fill(sec);
    await panel.getByLabel('Quantity', { exact: true }).fill(qty);
    await panel.getByRole('button', { name: 'Add', exact: true }).click();
  };
  await run(page, 'PORTFOLIO');
  await expect(panel.locator('.ptab')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /^Close / })).toHaveCount(0);
  await panel.locator('.ptab').first().dblclick();
  await panel.getByRole('textbox', { name: 'Portfolio name' }).fill('EQUITY_LONG');
  await panel.getByRole('textbox', { name: 'Portfolio name' }).press('Enter');
  await add('AAPL', '10');
  await panel.getByLabel('Cash in USD').fill('5000');
  await panel.getByRole('button', { name: 'Set cash', exact: true }).click();

  // A new portfolio opens empty, with its name ready to type.
  await panel.getByRole('button', { name: 'New portfolio' }).click();
  await panel.getByRole('textbox', { name: 'Portfolio name' }).fill('DOMESTIC BOND FUND');
  await panel.getByRole('textbox', { name: 'Portfolio name' }).press('Enter');
  expect(await tabs()).toEqual(['EQUITY_LONG×', 'DOMESTIC BOND FUND×']);
  await expect(panel.locator('.ptab.on')).toHaveText('DOMESTIC BOND FUND×');
  await expect(panel.getByText('No positions yet', { exact: false })).toBeVisible();
  await add('MSFT', '3');
  await expect(panel.getByRole('button', { name: 'Remove MSFT US Equity', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Remove AAPL US Equity', exact: true })).toHaveCount(0);

  await panel.locator('.ptab').first().click();
  await expect(panel.getByRole('button', { name: 'Remove AAPL US Equity', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Remove MSFT US Equity', exact: true })).toHaveCount(0);
  await expect(panel.locator('dl.kv dt', { hasText: /^Cash$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText('5,000');

  // Closing a portfolio that holds something asks first.
  await panel.getByRole('button', { name: 'Close DOMESTIC BOND FUND' }).click();
  await expect(panel.getByRole('alert')).toContainText('Close DOMESTIC BOND FUND? Its 1 holding will be deleted.');
  await panel.getByRole('button', { name: 'Keep it' }).click();
  expect(await tabs()).toHaveLength(2);

  // The tabs and their holdings are still there after a reload.
  await page.reload();
  await expect(panel.locator('.ptab')).toHaveCount(2);
  await expect(panel.locator('.ptab.on')).toHaveText('EQUITY_LONG×');
  await expect(panel.getByRole('button', { name: 'Remove AAPL US Equity', exact: true })).toBeVisible();

  await panel.getByRole('button', { name: 'Close DOMESTIC BOND FUND' }).click();
  await panel.getByRole('button', { name: 'Close and delete' }).click();
  await expect(panel.locator('.ptab')).toHaveCount(1);
  await expect(panel.locator('.ptab.on')).toHaveText('EQUITY_LONG');
  expect(errors).toEqual([]);
});

test('WHATSNEW shows the installed version\'s release notes and earlier releases', async ({ page }) => {
  const errors = await boot(page);
  const version = JSON.parse(await readFile('package.json', 'utf8')).version as string;
  await run(page, 'WHATSNEW');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.fnh-code').first()).toHaveText('WHATSNEW');
  await expect(panel.getByTestId('whatsnew-notes')).toContainText(`Armin Terminal ${version}`);
  await expect(panel.locator('.whatsnew-item.on')).toContainText('installed');
  await panel.locator('.whatsnew-item', { hasText: '2.23.0' }).click();
  await expect(panel.getByTestId('whatsnew-notes')).toContainText('Armin Terminal 2.23.0');
  expect(errors).toEqual([]);
});

test('WACC and EQRP use the beta BETA shows by default: two years of weekly returns against the local index', async ({ page }) => {
  const errors = await boot(page);
  const open = async (cmd: string, code: string) => {
    await run(page, cmd);
    const panel = page.locator('.panel').first();
    await expect(panel.locator('.fnh-code').first()).toHaveText(code);
    return panel;
  };
  const kv = (panel: ReturnType<Page['locator']>, label: string) => panel.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');
  const beta = kv(await open('AAPL US Equity BETA', 'BETA'), 'Adjusted beta');
  await expect(beta).toHaveText(/^\d+\.\d{3}$/);
  const adjusted = (await beta.innerText()).trim();
  const wacc = await open('AAPL US Equity WACC', 'WACC');
  await expect(kv(wacc, 'Adjusted beta')).toHaveText(adjusted);
  await expect(wacc.locator('dt', { hasText: /^Raw beta \(2Y weekly vs SPX, as BETA\)$/ })).toBeVisible();
  const eqrp = await open('AAPL US Equity EQRP', 'RISKPREMIUM');
  await expect(eqrp.getByLabel('Beta', { exact: true })).toHaveAttribute('placeholder', adjusted);
  expect(errors).toEqual([]);
});
