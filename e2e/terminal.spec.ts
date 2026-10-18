import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { checkAmericanOption, checkBond, checkForward, checkOptions, checkPortfolioPositions, checkStrategy, checkSwap } from './calculator-checks';

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
  ['FILINGS MSFT', 'FILINGS'], ['CROSSCHECK AAPL', 'CROSSCHECK'], ['MARKETNEWS NVDA', 'MARKETNEWS'], ['MACRO CPI', 'MACRO'],
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
  ['OSA', 'OPTIONSTRATEGY'],
  ['$APLD', 'MENU'], ['APLD US EQUITY PROFILE', 'PROFILE'], ['$APLD CHART', 'CHART'], ['APLD FINANCIALS', 'FINANCIALS'],
];

test('default workspace renders four live panels and the watchlist column', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('.panel')).toHaveCount(5);
  await expect(page.locator('.fnh-code').first()).toHaveText('MARKET');
  await expect(page.locator('.panel').nth(4).locator('.fnh-code')).toHaveText('WATCHLIST');
  // The market timers come first in the row, Euronext then NYSE, before the Brussels clock.
  await expect(page.locator('.clock.mkt').first()).toContainText(/Euronext (opens|closes) in/i);
  await expect(page.locator('.clock.mkt').nth(1)).toContainText(/NYSE (opens|closes) in/i);
  await expect(page.locator('.clock:not(.mkt)').first()).toContainText('BRUSSELS');
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
  for (const [cmd, code] of [['GP AAPL', 'CHART'], ['AAPL US EQUITY DES', 'PROFILE'], ['FA AAPL', 'FINANCIALS'], ['BQ AAPL', 'QUOTE'], ['WEI', 'MARKET'], ['W', 'WATCHLIST']]) {
    await run(page, cmd);
    await expect(page.locator('.panel').first().locator('.fnh-code').first(), cmd).toHaveText(code);
  }
  await run(page, 'HELP GP');
  await expect(page.locator('.panel').first()).toContainText('CHART');
  await run(page, 'DES?');
  await expect(page.locator('.panel').first()).toContainText('PROFILE');
  expect(errors).toEqual([]);
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
