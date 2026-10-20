import { expect, test } from '@playwright/test';

test('holders date sorting works by mouse and keyboard and the latest-period filter is selectable', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
  });
  await page.goto('/');
  const command = page.locator('#cmd-0');
  await command.fill('AAPL HOLDERS');
  await command.press('Enter');
  const date = page.getByRole('columnheader', { name: /^As of/ });
  await expect(date).toHaveAttribute('aria-sort', 'descending');
  await date.click();
  await expect(date).toHaveAttribute('aria-sort', 'ascending');
  await date.focus();
  await page.keyboard.press('Enter');
  await expect(date).not.toHaveAttribute('aria-sort');
  await page.keyboard.press('Enter');
  await expect(date).toHaveAttribute('aria-sort', 'descending');
  const filter = page.getByLabel('Holdings as of');
  await filter.selectOption('latest');
  await expect(filter).toHaveValue('latest');
  await expect(page.locator('.tbl tbody tr').first()).not.toContainText('No data');
  await expect(page.getByText('As of is the date of the holding, not of the filing.', { exact: false })).toBeVisible();
  await filter.selectOption('all');
  await expect(filter).toHaveValue('all');
});
