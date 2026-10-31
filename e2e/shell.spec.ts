import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '2' } }));
  });
  await page.goto('/');
  await expect(page.locator('.panel')).toHaveCount(2);
}

async function run(page: Page, text: string, panel = 0) {
  await page.locator(`#cmd-${panel}`).fill(text);
  await page.locator(`#cmd-${panel}`).press('Enter');
}

test('panel toolbar retains securities, switches recent securities and preserves analysis', async ({ page }) => {
  await boot(page);
  await run(page, 'MSFT GP');
  await run(page, 'AAPL GP');
  const loaded = page.getByLabel('Panel 1 loaded security', { exact: true });
  await loaded.selectOption('MSFT US Equity');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveText('MSFT US Equity');
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('CHART');
  await run(page, 'WEI');
  await expect(loaded).toHaveValue('MSFT US Equity');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveCount(0);
  await page.reload();
  await expect(loaded).toHaveValue('MSFT US Equity');
  await run(page, 'GP');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveText('MSFT US Equity');
});

test('MENU climbs the security, sector and main menu hierarchy independently of BACK', async ({ page }) => {
  await boot(page);
  await run(page, 'AAPL GP');
  // The MENU key (Alt+End, or MENU on the key bar) climbs the menus; the toolbar's Related Functions Menu opens an
  // overlay instead (look.spec.ts).
  const menu = () => page.keyboard.press('Alt+End');
  await menu();
  await expect(page.getByRole('navigation', { name: 'Menu path' })).toContainText('Analyze APPLE INC Equity');
  await menu();
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('EQUITY');
  await menu();
  await expect(page.locator('.panel').first().locator('.fnh-title')).toHaveText('Main Menu');
  await expect(page.getByLabel('Panel 1 loaded security', { exact: true })).toHaveValue('AAPL US Equity');
  await page.locator('#cmd-0').press('Alt+ArrowLeft');
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('EQUITY');
});

test('F1 opens contextual help and panel cycling keeps command focus local', async ({ page }) => {
  await boot(page);
  await run(page, 'NVDA GP');
  await page.keyboard.press('F1');
  await expect(page.getByTestId('function-example')).toHaveText('NVDA US Equity GP');
  // Twice: Live Help, the help desk's window (the 2017 student guide p.2; TE03 09:07).
  await page.keyboard.press('F1');
  await expect(page.getByTestId('live-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('live-help')).toHaveCount(0);
  // End is BACK on the terminal's keyboard: on an empty command line it returns to the screen before.
  await page.locator('#cmd-0').click();
  await page.keyboard.press('End');
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('CHART');
  await page.keyboard.press('Control+Tab');
  await expect(page.locator('#cmd-1')).toBeFocused();
  await page.keyboard.press('Control+Shift+Tab');
  await expect(page.locator('#cmd-0')).toBeFocused();
});

test('toolbar function picker uses retained securities and disables incompatible analysis', async ({ page }) => {
  await boot(page);
  const picker = page.getByLabel('Panel 1 function', { exact: true });
  await expect(picker.locator('option[value="FINANCIALS"]')).toBeDisabled();
  await run(page, 'AAPL DES');
  await picker.selectOption('CHART');
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('CHART');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveText('AAPL US Equity');
  await picker.selectOption('MARKET');
  await picker.selectOption('FINANCIALS');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveText('AAPL US Equity');
  await run(page, 'EURUSD CRNCY DES');
  await expect(picker.locator('option[value="FINANCIALS"]')).toBeDisabled();
  await expect(picker).toHaveValue('PROFILE');
});
