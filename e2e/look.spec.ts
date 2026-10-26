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

test("the terminal's measured colours: red function bar, grey section strips, and a cyan command line that reads <HELP> for explanation.", async ({ page }) => {
  const errors = await boot(page);
  const css = (selector: string, prop: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  await run(page, 'MARKET');
  await expect(page.locator('.tbl tr.group').first()).toContainText('Americas');
  expect(await css('.fnh-row', 'background-color')).toBe('rgb(162, 24, 38)');
  expect(await css('.tbl tr.group td', 'background-color')).toBe('rgb(52, 52, 52)');
  // Focused and empty: the hint, with <HELP> in green; the box and cursor are cyan, typed text white and fixed-width.
  const input = page.locator('#cmd-0');
  await input.click();
  const hint = page.locator('.panel').first().locator('.cmd-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('<HELP> for explanation.');
  expect(await css('.cmd-hint b', 'color')).toBe('rgb(60, 191, 79)');
  expect(await css('#cmd-0', 'box-shadow')).toContain('rgb(31, 182, 240)');
  expect(await css('#cmd-0', 'caret-color')).toBe('rgb(31, 182, 240)');
  expect(await css('#cmd-0', 'caret-shape')).toBe('block');
  expect(await css('#cmd-0', 'color')).toBe('rgb(255, 255, 255)');
  expect(await css('#cmd-0', 'font-family')).toMatch(/^"?IBM Plex Mono"?,/);
  await page.keyboard.type('w');
  await expect(hint).toBeHidden();
  await page.keyboard.press('Backspace');
  await expect(hint).toBeVisible();
  // Elsewhere, the empty line names the command behind the screen.
  await input.blur();
  await expect(hint).toBeHidden();
  await expect(input).toHaveAttribute('placeholder', /MARKET|WEI/);
  expect(errors).toEqual([]);
});
