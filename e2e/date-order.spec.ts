import { expect, test, type Page } from '@playwright/test';

const run = async (page: Page, text: string) => {
  const cmd = page.locator('#cmd-0');
  await cmd.fill(text);
  await cmd.press('Enter');
};

test('dates are DD/MM/YYYY by default, and the setting switches shown and typed dates to MM/DD/YYYY and back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
  });
  await page.goto('/');
  const panel = page.locator('.panel').first();
  const start = panel.getByLabel('Start date');
  const europeanDates = panel.getByLabel(/European dates/);

  // The chart's default range, day first.
  await run(page, 'AAPL GP');
  await expect(start).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
  const [d, m, y] = (await start.inputValue()).split('/');
  await start.fill('25/12/2025');
  await start.press('Enter');
  await expect(start).toHaveValue('25/12/2025');
  await expect(start).not.toHaveClass(/\bbad\b/);

  await run(page, 'SETTINGS');
  await expect(europeanDates).toBeChecked();
  await europeanDates.uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('armin:settings') ?? 'null')?.s?.dateOrder)).toBe('MDY');

  // The same default range, month first, and typed dates read month first.
  await run(page, 'AAPL GP');
  await expect(start).toHaveValue(`${m}/${d}/${y}`);
  await start.fill('01/31/2026');
  await start.press('Enter');
  await expect(start).toHaveValue('01/31/2026');
  await expect(start).not.toHaveClass(/\bbad\b/);

  await page.reload();
  await run(page, 'SETTINGS');
  await expect(europeanDates).not.toBeChecked();
  await europeanDates.check();
  await run(page, 'AAPL GP');
  await expect(start).toHaveValue(`${d}/${m}/${y}`);
  expect(errors).toEqual([]);
});
