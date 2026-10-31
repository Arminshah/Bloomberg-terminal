import { expect, test } from '@playwright/test';

test('watchlist lines reorder with the arrows, also while sorted or filtered, and by drag and drop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    if (!localStorage.getItem('armin:watchlists')) localStorage.setItem('armin:watchlists', JSON.stringify({ v: 1, s: { lists: [{ name: 'Core', ids: ['MSFT US Equity', 'NVDA US Equity', 'AAPL US Equity'] }], active: 0 } }));
  });
  await page.goto('/');
  const cmd = page.locator('#cmd-0');
  await cmd.fill('WATCHLIST');
  await cmd.press('Enter');
  const panel = page.locator('.panel').first();
  const rows = panel.locator('.tbl tbody tr');
  const tickers = () => panel.locator('.tbl tbody .sec-link').allInnerTexts();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('armin:watchlists') ?? 'null')?.s?.lists[0]);
  await expect.poll(tickers).toEqual(['MSFT US', 'NVDA US', 'AAPL US']);

  // Sorted by name, the arrows still move a line: the sorted order becomes the manual order.
  await panel.locator('.tbl thead').getByRole('button', { name: 'Name', exact: true }).click();
  await expect.poll(tickers).toEqual(['AAPL US', 'MSFT US', 'NVDA US']);
  await expect(rows.first().getByRole('button', { name: 'Move up', exact: true })).toBeDisabled();
  await rows.first().getByRole('button', { name: 'Move down', exact: true }).click();
  await expect.poll(tickers).toEqual(['MSFT US', 'AAPL US', 'NVDA US']);
  await expect(panel.locator('.tbl thead th[aria-sort]')).toHaveCount(0);
  await expect.poll(async () => (await saved())?.ids).toEqual(['MSFT US Equity', 'AAPL US Equity', 'NVDA US Equity']);
  expect((await saved())?.sort).toBeUndefined();

  // A line dropped on the upper half of another lands before it, on the lower half after it.
  await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 200, y: 3 } });
  await expect.poll(tickers).toEqual(['NVDA US', 'MSFT US', 'AAPL US']);
  const height = (await rows.nth(2).boundingBox())!.height;
  await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 200, y: height - 3 } });
  await expect.poll(tickers).toEqual(['MSFT US', 'AAPL US', 'NVDA US']);
  // Dragging a line does not open it.
  await expect(panel.locator('.fnh-code').first()).toHaveText('WATCHLIST');

  // Dragging a sorted list starts from the order on screen.
  await panel.locator('.tbl thead').getByRole('button', { name: 'Name', exact: true }).click();
  await expect.poll(tickers).toEqual(['AAPL US', 'MSFT US', 'NVDA US']);
  await rows.nth(0).dragTo(rows.nth(1), { targetPosition: { x: 200, y: height - 3 } });
  await expect.poll(tickers).toEqual(['MSFT US', 'AAPL US', 'NVDA US']);
  await expect(panel.locator('.tbl thead th[aria-sort]')).toHaveCount(0);

  // Filtered, the arrows move a line past the visible neighbour.
  await panel.getByLabel('Filter watchlist').fill('corp');
  await expect.poll(tickers).toEqual(['MSFT US', 'NVDA US']);
  await rows.nth(1).getByRole('button', { name: 'Move up', exact: true }).click();
  await panel.getByLabel('Filter watchlist').fill('');
  await expect.poll(tickers).toEqual(['NVDA US', 'MSFT US', 'AAPL US']);

  await page.reload();
  await expect.poll(tickers).toEqual(['NVDA US', 'MSFT US', 'AAPL US']);
  expect(errors).toEqual([]);
});
