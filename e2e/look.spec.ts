import { expect, test, type Page } from '@playwright/test';

// The visual pass: typeface, colours and colour-blind schemes.
const run = async (page: Page, text: string) => {
  const cmd = page.locator('#cmd-0');
  await cmd.fill(text);
  await cmd.press('Enter');
};

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('armin:demo', '1');
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '1' } }));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
  });
  await page.goto('/');
  await expect(page.locator('.panel').first()).toBeVisible();
  return errors;
}

const bodyFont = (page: Page) => page.evaluate(() => getComputedStyle(document.body).fontFamily);

test('Bergoom is the typeface, loaded and spaced as the terminal is; SETTINGS switches to IBM Plex Sans or the monospaced face', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('html')).toHaveAttribute('data-font', 'terminal');
  expect(await bodyFont(page)).toMatch(/^"?Bergoom"?,/);
  // The font file loads (it is bundled), and its figures and letters are spaced 0.02em wider.
  await expect.poll(() => page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('12px Bergoom'); })).toBe(true);
  const look = await page.evaluate(() => ({ spacing: getComputedStyle(document.body).letterSpacing, adjust: getComputedStyle(document.body).fontSizeAdjust, size: getComputedStyle(document.body).fontSize }));
  expect(parseFloat(look.spacing)).toBeCloseTo(parseFloat(look.size) * 0.02, 2);
  expect(look.adjust).toBe('0.563');
  await run(page, 'SETTINGS');
  const typeface = page.locator('.panel').first().getByLabel('Typeface');
  await expect(typeface).toHaveValue('terminal');
  await typeface.selectOption('plex');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'plex');
  expect(await bodyFont(page)).toMatch(/^"?IBM Plex Sans"?,/);
  await typeface.selectOption('mono');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
  expect(await bodyFont(page)).toMatch(/^"?IBM Plex Mono"?,/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'mono');
  expect(errors).toEqual([]);
});
