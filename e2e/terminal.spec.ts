import { expect, test, type Page } from '@playwright/test';

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
    localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    if (lay) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: lay } }));
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

const COMMANDS: [string, string][] = [
  ['AAPL US EQUITY PROFILE', 'PROFILE'], ['AAPL CHART', 'CHART'], ['AAPL INTRADAY', 'INTRADAY'], ['AAPL HISTORY', 'HISTORY'], ['AAPL FINANCIALS', 'FINANCIALS'], ['AAPL ANALYSTS', 'ANALYSTS'],
  ['AAPL EARNINGS', 'EARNINGS'], ['AAPL DIVIDENDS', 'DIVIDENDS'], ['AAPL HOLDERS', 'HOLDERS'], ['AAPL PEERS', 'PEERS'], ['EVENTS', 'EVENTS'], ['AAPL WACC', 'WACC'],
  ['AAPL RETURNS', 'RETURNS'], ['AAPL BETA', 'BETA'], ['CORRELATION', 'CORRELATION'], ['TSLA QUOTE', 'QUOTE'], ['TSLA TRADES', 'TRADES'], ['TSLA DEPTH', 'DEPTH'],
  ['HEADLINES', 'HEADLINES'], ['NEWS CRYPTO', 'NEWS'], ['AAPL COMPANYNEWS', 'COMPANYNEWS'], ['MARKET', 'MARKET'], ['HEATMAP', 'HEATMAP'], ['MOVERS', 'MOVERS'], ['SCREEN', 'SCREEN'],
  ['FXMATRIX', 'FXMATRIX'], ['FXRANK', 'FXRANK'], ['CRYPTO', 'CRYPTO'], ['BONDS', 'BONDS'], ['CURVE', 'CURVE'], ['MONEYMARKET', 'MONEYMARKET'], ['CT10 GOVT BONDCALC', 'BONDCALC'],
  ['RATEPROBS', 'RATEPROBS'], ['COMMODITIES', 'COMMODITIES'], ['RELEASES', 'RELEASES'], ['ECONSTATS', 'ECONSTATS'], ['NVDA OPTIONS', 'OPTIONS'], ['NVDA OPTIONCALC', 'OPTIONCALC'],
  ['WATCHLIST', 'WATCHLIST'], ['PORTFOLIO', 'PORTFOLIO'], ['ALERTS', 'ALERTS'], ['SEARCH', 'SEARCH'], ['RECENT', 'RECENT'], ['LAYOUTS', 'LAYOUTS'], ['MESSAGES', 'MESSAGES'],
  ['SETTINGS', 'SETTINGS'], ['PROVIDERS', 'PROVIDERS'], ['HELP', 'HELP'], ['EURUSD CRNCY PROFILE', 'PROFILE'], ['SPX INDEX PROFILE', 'PROFILE'], ['CL1 CMDTY PROFILE', 'PROFILE'],
  ['USGG10YR INDEX PROFILE', 'PROFILE'], ['XBTUSD CRNCY PROFILE', 'PROFILE'], ['CT2 GOVT PROFILE', 'PROFILE'], ['USGG10YR INDEX SPREAD', 'SPREAD'], ['AAPL NOTES', 'NOTES'],
  ['IBM US EQUITY', 'MENU'], ['EQUITY', 'EQUITY'], ['GOVT', 'GOVT'], ['CORP', 'CORP'], ['CRNCY', 'CRNCY'], ['MTGE', 'MTGE'], ['MENU', 'MENU'],
  ['AAPL CORP', 'BONDSEARCH'], ['JPM CORP DEBTPROFILE', 'DEBTPROFILE'], ['AAPL 4.65 02/23/46 CORP PROFILE', 'PROFILE'], ['AAPL 4.65 02/23/46 CORP BONDCALC', 'BONDCALC'],
  ['AAPL 4.65 02/23/46 CORP DEALERQUOTES', 'DEALERQUOTES'], ['CT10 GOVT DEALERQUOTES', 'DEALERQUOTES'], ['ES1 INDEX PROFILE', 'PROFILE'], ['ES1 INDEX INTRADAY', 'INTRADAY'], ['ES1 INDEX TRADES', 'TRADES'],
  ['ES1 INDEX DEPTH', 'DEPTH'], ['INDEXFUTURES', 'INDEXFUTURES'], ['SPX INDEX CONTRIB', 'CONTRIB'], ['INDU INDEX CONTRIB', 'CONTRIB'], ['AAPL TOTALRETURN', 'TOTALRETURN'], ['SPX INDEX TOTALRETURN', 'TOTALRETURN'],
  ['AAPL FUNDCHART', 'FUNDCHART'], ['AAPL VOLATILITY', 'VOLATILITY'], ['USGG10YR INDEX VOLATILITY', 'VOLATILITY'], ['AAPL VWAP', 'VWAP'], ['EURUSD CRNCY FXFORWARD', 'FXFORWARD'], ['USDJPY CRNCY FXOPTION', 'FXOPTION'],
  ['SWAPCALC', 'SWAPCALC'], ['HOLIDAYS', 'HOLIDAYS'], ['CENTRALBANKS', 'CENTRALBANKS'], ['HELP HELP', 'MESSAGES'],
  ['$APLD', 'MENU'], ['APLD US EQUITY PROFILE', 'PROFILE'], ['$APLD CHART', 'CHART'], ['APLD FINANCIALS', 'FINANCIALS'],
];

test('default workspace renders four live panels and the watchlist column', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.panel')).toHaveCount(5);
  await expect(page.locator('.fnh-code').first()).toHaveText('MARKET');
  await expect(page.locator('.panel').nth(4).locator('.fnh-code')).toHaveText('WATCHLIST');
  await expect(page.locator('.clock').first()).toContainText('BRUSSELS');
  const first = await page.locator('.panel').nth(1).locator('.qstrip .px').textContent();
  await page.waitForTimeout(2500);
  const later = await page.locator('.panel').nth(1).locator('.qstrip .px').textContent();
  expect(first).toBeTruthy();
  expect(later).toBeTruthy();
  expect(errors).toEqual([]);
});

test('every function renders without errors', async ({ page }) => {
  test.setTimeout(180_000);
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

test('watchlist add and alert creation persist', async ({ page }) => {
  await boot(page, '1');
  await run(page, 'WATCHLIST');
  await page.getByLabel('Add security to monitor').fill('ORCL');
  await page.getByLabel('Add security to monitor').press('Enter');
  await expect(page.locator('table.tbl')).toContainText('ORCL US');
  await run(page, 'ALERTS');
  await page.getByLabel('Security').fill('AAPL US Equity');
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
