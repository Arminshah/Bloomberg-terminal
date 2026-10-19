import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '2' } }));
  });
  await page.goto('/');
  await expect(page.locator('#cmd-0')).toBeVisible();
}

test('command history recalls entries per panel, restores drafts and reruns on GO', async ({ page }) => {
  await boot(page);
  const input = page.locator('#cmd-0');
  for (const text of ['AAPL DES', 'WEI']) {
    await input.fill(text);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
  await input.press('ArrowUp');
  await expect(input).toHaveValue('WEI');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('AAPL DES');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('WEI');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('');
  await input.fill('NVDA');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('Control+ArrowUp');
  await expect(input).toHaveValue('WEI');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.press('Control+ArrowDown');
  await expect(input).toHaveValue('NVDA');
  await page.locator('#cmd-1').click();
  await page.locator('#cmd-1').press('ArrowUp');
  await expect(page.locator('#cmd-1')).toHaveValue('');
  await input.clear();
  await input.press('Control+ArrowUp');
  await input.press('ArrowUp');
  await page.locator('.keybar').getByRole('button', { name: 'GO ENTER', exact: true }).click();
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('PROFILE');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveText('AAPL US Equity');
});

test('the footer GO key uses the selected autocomplete item', async ({ page }) => {
  await boot(page);
  const input = page.locator('#cmd-0');
  await input.fill('nvid');
  await input.press('ArrowDown');
  const option = page.locator(`#${await input.getAttribute('aria-activedescendant')}`);
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect(option).toContainText('NVDA US Equity');
  await page.locator('.keybar').getByRole('button', { name: 'GO ENTER', exact: true }).click();
  await expect(input).toHaveValue('NVDA US EQUITY ');
  await input.press('Enter');
  await expect(page.locator('.panel').first().locator('.fnh-sec')).toHaveText('NVDA US Equity');
});
