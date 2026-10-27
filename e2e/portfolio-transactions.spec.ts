import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function run(page: Page, cmd: string) {
  const input = page.locator('#cmd-0');
  await input.click();
  await page.keyboard.press('Escape');
  await input.fill(cmd);
  await input.press('Enter');
}

test("PORTFOLIO's transactions: lots matched oldest first, refusals, rates, the holding kept in step, export and reload", async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
  });
  await page.goto('/');
  const panel = page.locator('.panel').first();
  const msg = page.locator('.cmd-msg');
  await run(page, 'PORTFOLIO');
  await expect(panel.locator('.fnh-code').first()).toHaveText('PORTFOLIO');
  await run(page, '4');
  await expect(panel.getByText('No transactions yet', { exact: false })).toBeVisible();

  const record = async (type: string, sec: string, date: string, qty: string, price: string, fee = '', rate = '') => {
    await panel.getByLabel('Transaction type', { exact: true }).selectOption(type);
    await panel.getByLabel('Security', { exact: true }).fill(sec);
    await panel.getByLabel('Trade date', { exact: true }).fill(date);
    if (type !== 'dividend') {
      await panel.getByLabel('Quantity', { exact: true }).fill(qty);
      await panel.getByLabel('Fee', { exact: true }).fill(fee);
    }
    await panel.getByLabel(type === 'dividend' ? 'Amount received' : 'Price', { exact: true }).fill(price);
    await panel.getByLabel('Exchange rate', { exact: true }).fill(rate);
    await panel.getByRole('button', { name: 'Record', exact: true }).click();
  };
  const kv = (label: string) => panel.locator('dl.kv dt', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }).locator('xpath=following-sibling::dd[1]');

  await record('buy', 'AAPL', '2026-01-05', '10', '100', '5');
  await expect(msg).toContainText('Recorded: Buy 10 AAPL US on');
  await expect(msg).toContainText('Holding updated.');
  await record('buy', 'AAPL', '2026-02-02', '10', '120', '5');
  await record('sell', 'AAPL', '2026-03-02', '15', '130', '6');

  // The sale takes the first lot whole and 5 of the second: 10 × 30 − 5 − 4 = 291, then 5 × 10 − 2.50 − 2 = 45.50.
  const realised = panel.getByTestId('realised-table').locator('tbody tr');
  await expect(realised).toHaveCount(2);
  await expect(realised.nth(0)).toContainText('+291.00');
  await expect(realised.nth(1)).toContainText('+45.50');
  await expect(kv('Realised P&L')).toHaveText('+336.50');
  const lots = panel.getByTestId('lots-table').locator('tbody tr');
  await expect(lots).toHaveCount(1);
  await expect(lots.first()).toContainText('120.50');

  // A sale larger than the shares held then is refused.
  await record('sell', 'AAPL', '2026-03-03', '6', '130');
  await expect(msg).toContainText('The sale of AAPL US Equity on 2026-03-03 would be 1 more than the shares held then.');
  await expect(panel.getByTestId('txn-table').locator('tbody tr')).toHaveCount(3);

  await record('dividend', 'AAPL', '2026-02-12', '', '2.60');
  await expect(kv('Dividends')).toHaveText('2.60');

  // A stock quoted in pence, with the rate typed: (100 × 10.00 + 10) pounds at 1.32.
  await record('buy', 'HSBA LN', '2026-06-29', '100', '1000', '10', '1.32');
  await expect(panel.getByTestId('txn-table').locator('tbody tr').first()).toContainText('-1,333.20');
  // With no rate typed on a past day, the browser has no ECB rates: the transaction says so and returns stay blank.
  await record('buy', 'HSBA LN', '2026-06-30', '10', '1000');
  await expect(msg).toContainText("No rate: the ECB's reference rates are read by the desktop app, so type the rate.");
  await expect(panel.getByText('1 transaction has no exchange rate into USD', { exact: false })).toBeVisible();
  await expect(kv('Time-weighted return')).toHaveText('--');
  await panel.getByRole('button', { name: 'Delete buy HSBA LN 2026-06-30', exact: true }).click();
  await expect(panel.getByText('1 transaction has no exchange rate into USD', { exact: false })).toHaveCount(0);
  await expect(kv('Time-weighted return')).toHaveText(/^[+-]?\d+\.\d\d%$/);
  await expect(kv('Money-weighted return')).toHaveText(/^[+-]?\d+\.\d\d%$/);

  // Holdings follow the transactions; a holding typed there differs, and both tabs say so until it is put right.
  await run(page, '1');
  const holdingRow = panel.locator('.tbl tbody tr', { has: page.getByRole('button', { name: 'Remove AAPL US Equity', exact: true }) });
  await expect(holdingRow.locator('td').nth(2)).toHaveText('5');
  await panel.getByLabel('Security', { exact: true }).fill('AAPL');
  await panel.getByLabel('Quantity', { exact: true }).fill('10');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(holdingRow.locator('td').nth(2)).toHaveText('15');
  await expect(panel.getByTestId('holding-mismatch')).toContainText('AAPL US: Holdings say 15, the transactions 5');
  await run(page, '4');
  await expect(panel.getByTestId('holding-mismatch')).toContainText('AAPL US: Holdings say 15, the transactions 5');
  await panel.getByRole('button', { name: 'Use the transactions for AAPL US', exact: true }).click();
  await expect(panel.getByTestId('holding-mismatch')).toHaveCount(0);

  // Deleting the sale puts its shares back in the lots and on the holding.
  await panel.getByRole('button', { name: 'Delete sell AAPL US 2026-03-02', exact: true }).click();
  await expect(lots).toHaveCount(3);
  await expect(realised).toHaveCount(1);
  await expect(realised.first()).toContainText('Nothing sold yet.');
  await run(page, '1');
  await expect(holdingRow.locator('td').nth(2)).toHaveText('20');

  // The export on this tab is the transactions.
  await run(page, '4');
  const saving = page.waitForEvent('download');
  await panel.getByRole('button', { name: /Export transactions$/ }).click();
  const csv = await readFile((await (await saving).path())!, 'utf8');
  expect(csv).toContain('Date,Type,Security,Quantity,Price,Fee,Rate (USD per currency unit),Rate source,Rate into');
  expect(csv).toContain('2026-01-05,buy,AAPL US Equity,10,100,5,1,same currency,USD');
  expect(csv).toContain('2026-06-29,buy,HSBA LN Equity,100,1000,10,1.32,entered,USD');

  // Kept after a reload.
  await page.reload();
  await run(page, 'PORTFOLIO');
  await run(page, '4');
  await expect(panel.getByTestId('txn-table').locator('tbody tr')).toHaveCount(4);
  expect(errors).toEqual([]);
});
