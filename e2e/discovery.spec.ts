import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false, mnemonics: true } }));
    localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
  });
  await page.goto('/');
  await expect(page.locator('.panel').first()).toBeVisible();
}

async function run(page: Page, command: string) {
  const input = page.locator('#cmd-0');
  await input.fill(command);
  await input.press('Enter');
}

test('main menu discovers news through numbered workflows and has a working path home', async ({ page }) => {
  await boot(page);
  await run(page, 'MENU');
  await run(page, '12');
  await expect(page.locator('.fnh-title')).toHaveText('News & Research');
  await expect(page.locator('.menu-tbl').first()).toContainText('TOP');
  await run(page, '1');
  await expect(page.locator('.fnh-code')).toHaveText('MARKETNEWS');
  await run(page, 'MENU NEWS');
  await page.getByRole('navigation', { name: 'Menu path' }).getByRole('button', { name: 'Main Menu' }).click();
  await expect(page.locator('.fnh-title')).toHaveText('Main Menu');
});

test('commodity sector aliases and security breadcrumbs lead to the same sector menu', async ({ page }) => {
  await boot(page);
  await run(page, 'CMDTY');
  await expect(page.locator('.fnh-title')).toHaveText('Commodities');
  await expect(page.locator('.menu-tbl').first()).toContainText('GLCO');
  await run(page, 'GC1 CMDTY');
  await expect(page.locator('.fnh-sec')).toHaveText('GC1 Comdty');
  await page.getByRole('navigation', { name: 'Menu path' }).getByRole('button', { name: 'Commodities' }).click();
  await expect(page.locator('.fnh-title')).toHaveText('Commodities');
});

test('help keeps security context, runs numbered search results and uses bond examples for ALLQ', async ({ page }) => {
  await boot(page);
  await run(page, 'NVDA DES');
  await run(page, 'HELP GP');
  await expect(page.getByTestId('function-example')).toHaveText('NVDA US Equity GP');
  await page.getByRole('button', { name: 'Run example', exact: true }).click();
  await expect(page.locator('.fnh-code')).toHaveText('CHART');
  await expect(page.locator('.fnh-sec')).toHaveText('NVDA US Equity');
  await run(page, 'HELP');
  await page.getByLabel('Filter', { exact: true }).fill('GP');
  await run(page, '1');
  await expect(page.locator('.fnh-code')).toHaveText('CHART');
  await expect(page.locator('.fnh-sec')).toHaveText('NVDA US Equity');
  await run(page, 'HELP ALLQ');
  await expect(page.getByTestId('function-example')).toContainText('ALLQ');
  await expect(page.getByTestId('function-example')).not.toContainText('NVDA');
  await page.getByRole('button', { name: 'Run example', exact: true }).click();
  await expect(page.locator('.fnh-code')).toHaveText('DEALERQUOTES');
  await expect(page.locator('.fnh-sec')).toContainText(/Govt|Corp/);
});
