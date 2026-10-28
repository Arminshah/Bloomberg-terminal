import { expect, test, type Page } from '@playwright/test';

async function run(page: Page, cmd: string) {
  const input = page.locator('#cmd-0');
  await input.click();
  await page.keyboard.press('Escape');
  await input.fill(cmd);
  await input.press('Enter');
}

test('COMPLIANCE checks your rules on a portfolio as prices move, and PORTFOLIO asks before a trade that would break one', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
  });
  await page.goto('/');
  const panel = page.locator('.panel').first();
  await run(page, 'PORTFOLIO');
  await expect(panel.locator('.fnh-code').first()).toHaveText('PORTFOLIO');
  const addPosition = async (sec: string, qty: string) => {
    await panel.getByLabel('Security', { exact: true }).fill(sec);
    await panel.getByLabel('Quantity', { exact: true }).fill(qty);
    await panel.getByRole('button', { name: 'Add', exact: true }).click();
  };
  await addPosition('AAPL', '10');
  await addPosition('XOM', '10');
  await expect(panel.locator('tbody tr', { hasText: 'XOM' })).toHaveCount(1);

  // CMGR opens COMPLIANCE on the same portfolio.
  await run(page, 'CMGR');
  await expect(panel.locator('.fnh-code').first()).toHaveText('COMPLIANCE');
  await expect(panel.getByTestId('cmgr-summary')).toContainText('No rules yet');
  // A restricted list breaks at once: the portfolio holds XOM.
  await panel.getByLabel('Rule', { exact: true }).selectOption('restricted');
  await panel.getByLabel('Securities', { exact: true }).fill('XOM, TSLA');
  await panel.getByRole('button', { name: 'Add rule' }).click();
  const exceptions = panel.getByTestId('cmgr-exceptions').locator('tbody tr');
  await expect(exceptions).toHaveCount(1);
  await expect(exceptions.first()).toContainText('Breach');
  await expect(exceptions.first()).toContainText('XOM US');
  await expect(panel.getByTestId('cmgr-summary')).toContainText('1 of 1 rules on · 1 breach · 0 warnings');
  // Switched off, the rule is not checked.
  await panel.getByLabel('Rule 1 on').uncheck();
  await expect(panel.getByText('No rules on.')).toBeVisible();
  await panel.getByLabel('Rule 1 on').check();
  // The 5/10/40 rule: two holdings are each far above 10%.
  await panel.getByRole('button', { name: 'UCITS 5/10/40' }).click();
  await expect(panel.getByTestId('cmgr-rules').locator('tbody tr')).toHaveCount(2);
  await expect(exceptions.filter({ hasText: 'UCITS 5/10/40' }).first()).toContainText('Breach');

  // Back on PORTFOLIO: the exceptions are named, and a trade that adds one asks first.
  await run(page, 'PORTFOLIO');
  await expect(panel.getByTestId('port-compliance')).toContainText('Compliance:');
  await expect(panel.getByTestId('port-compliance')).toContainText('breach');
  await addPosition('TSLA', '5');
  const ask = panel.getByTestId('pre-trade');
  await expect(ask).toContainText('Restricted list: TSLA US');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(ask).toHaveCount(0);
  await expect(panel.locator('tbody tr', { hasText: 'TSLA' })).toHaveCount(0);
  await addPosition('TSLA', '5');
  await panel.getByRole('button', { name: 'Add anyway' }).click();
  await expect(panel.locator('tbody tr', { hasText: 'TSLA' })).toHaveCount(1);
  expect(errors).toEqual([]);
});
