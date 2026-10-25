import { expect, type Page } from '@playwright/test';

/** Exercises the same user workflow in Chromium and the actual Electron renderer. */
export async function checkLinkedPanels(page: Page, run: (text: string, code: string, panel?: number) => Promise<void>) {
  await page.getByRole('button', { name: 'Four panels', exact: true }).click();
  const p = (i: number) => page.locator('.panel').nth(i);
  await run('AAPL GP', 'CHART', 0);
  await run('AAPL DES', 'PROFILE', 1);
  await run('WATCHLIST', 'WATCHLIST', 2);
  await run('AAPL FA', 'FINANCIALS', 3);
  for (let i = 0; i < 4; i++) await page.getByLabel(`Panel ${i + 1} security link group`, { exact: true }).selectOption('1');
  await p(2).getByRole('button', { name: 'MSFT US', exact: true }).click();
  await expect(p(2).locator('.fnh-code').first()).toHaveText('WATCHLIST');
  for (const i of [0, 1, 3]) await expect(p(i).locator('.fnh-sec').first()).toHaveText('MSFT US Equity');
  await expect(p(0).locator('.fnh-mnemonic')).toContainText('GP');
  await expect(p(1).locator('.fnh-code').first()).toHaveText('PROFILE');
  await run('EURUSD GP', 'CHART', 0);
  await expect(p(1).locator('.fnh-sec').first()).toHaveText('EURUSD Curncy');
  // A currency selection cannot replace an equity financial statement.
  await expect(p(3).locator('.fnh-sec').first()).toHaveText('MSFT US Equity');
  await p(0).getByRole('button', { name: 'Back', exact: true }).click();
  await expect(p(1).locator('.fnh-sec').first()).toHaveText('MSFT US Equity');
  await p(0).getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(p(1).locator('.fnh-sec').first()).toHaveText('EURUSD Curncy');
  await run('LAYOUTS', 'LAYOUTS', 2);
  await p(2).getByLabel('Layout name', { exact: true }).fill('Research links');
  await p(2).getByRole('button', { name: 'Save current panels', exact: true }).click();
  for (let i = 0; i < 4; i++) await page.getByLabel(`Panel ${i + 1} security link group`, { exact: true }).selectOption('0');
  await run('MARKET', 'MARKET', 0);
  await p(2).getByRole('cell', { name: 'Research links', exact: true }).click();
  await expect(p(0).locator('.fnh-code').first()).toHaveText('CHART');
  await expect(p(0).locator('.fnh-sec').first()).toHaveText('EURUSD Curncy');
  await expect(p(2).locator('.fnh-code').first()).toHaveText('WATCHLIST');
  for (let i = 0; i < 4; i++) await expect(page.getByLabel(`Panel ${i + 1} security link group`, { exact: true })).toHaveValue('1');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('armin:terminal') ?? 'null')?.s?.panels?.[0]?.linkGroup)).toBe(1);
  await page.reload();
  await expect(p(0).locator('.fnh-sec').first()).toHaveText('EURUSD Curncy');
  await expect(p(3).locator('.fnh-sec').first()).toHaveText('MSFT US Equity');
  for (let i = 0; i < 4; i++) await expect(page.getByLabel(`Panel ${i + 1} security link group`, { exact: true })).toHaveValue('1');
  await page.getByLabel('Panel 1 security link group', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'LAYOUTS ▾', exact: true }).click();
  // The link group changed since it was saved, so the menu also offers to save that; this is the saved layout's line.
  await page.getByRole('menuitem').filter({ hasText: 'Research links' }).filter({ hasText: 'panels' }).click();
  await expect(page.getByLabel('Panel 1 security link group', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'LAYOUTS ▾', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Linked Security Research' }).click();
  await expect(page.locator('.panel')).toHaveCount(5);
  await expect(page.locator('.panel').nth(3).locator('.fnh-code').first()).toHaveText('FIELDS');
  await expect(page.getByLabel('Panel 5 security link group', { exact: true })).toHaveValue('1');
}
