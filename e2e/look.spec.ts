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

test('IBM Plex Sans is the typeface, fixed: loaded, slightly bold, with no setting to change it and an old choice ignored', async ({ page }) => {
  // A choice saved by 2.26.0 (Bergoom) or earlier (the monospaced face) no longer changes anything.
  await page.addInitScript(() => {
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false, font: 'bergoom' } }));
  });
  const errors = await boot(page);
  expect(await bodyFont(page)).toMatch(/^"?IBM Plex Sans"?,/);
  await expect.poll(() => page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('500 12px "IBM Plex Sans"'); })).toBe(true);
  const plex = await page.evaluate(() => ({ weight: getComputedStyle(document.body).fontWeight, spacing: getComputedStyle(document.body).letterSpacing, size: getComputedStyle(document.body).fontSize, adjust: getComputedStyle(document.body).fontSizeAdjust }));
  expect(plex.weight).toBe('500');
  expect(parseFloat(plex.spacing)).toBeCloseTo(parseFloat(plex.size) * 0.01, 2);
  expect(plex.adjust).toBe('none');
  // Figures on a quote line are IBM Plex Sans too; the command line is IBM Plex Mono.
  await run(page, 'SPX Index QUOTE');
  await expect.poll(() => page.locator('.panel').first().locator('.fnh-code').textContent()).toBeTruthy();
  expect(await page.locator('.panel-body').first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?IBM Plex Sans"?,/);
  expect(await page.locator('#cmd-0').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?IBM Plex Mono"?,/);
  await run(page, 'SETTINGS');
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('SETTINGS');
  await expect(page.locator('.panel').first().getByLabel('Typeface')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-font', /.+/);
  expect(errors).toEqual([]);
});

test("the terminal's measured colours: red function bar, grey section strips, and the 2024 command line with its blue triangle and cursor", async ({ page }) => {
  const errors = await boot(page);
  const css = (selector: string, prop: string) => page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  await run(page, 'MARKET');
  await expect(page.locator('.tbl tr.group').first()).toContainText('Americas');
  expect(await css('.fnh-row', 'background-color')).toBe('rgb(135, 14, 31)');
  // The numbered items sit on the bar's red, white, with a thin dark line between them (TE01 03:11).
  expect(await css('.fnh-actions .act', 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await css('.fnh-actions .act', 'border-right-color')).toBe('rgb(63, 2, 9)');
  expect(await css('.tbl tr.group td', 'background-color')).toBe('rgb(52, 52, 52)');
  // The command line (TE01 05:09, TE04 01:13): a black field with a thin muted blue outline, a blue triangle at its
  // left, a blue block cursor, typed text white and fixed-width. Empty, it shows no text at all: no placeholder and no
  // "<HELP> for explanation.".
  const input = page.locator('#cmd-0');
  const field = page.locator('.panel').first().locator('.cmd-field');
  await input.click();
  expect(await css('.cmd-field', 'border-top-color')).toBe('rgb(109, 150, 212)');
  expect(await css('.cmd-field', 'background-color')).toBe('rgb(0, 0, 0)');
  expect(await field.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(46, 138, 246)');
  expect(await css('#cmd-0', 'caret-color')).toBe('rgb(46, 138, 246)');
  // Playwright's own Chromium may predate caret-shape; the desktop app's Electron has it (checked in desktop-e2e).
  if (await page.evaluate(() => CSS.supports('caret-shape', 'block'))) expect(await css('#cmd-0', 'caret-shape')).toBe('block');
  expect(await css('#cmd-0', 'color')).toBe('rgb(255, 255, 255)');
  expect(await css('#cmd-0', 'font-family')).toMatch(/^"?IBM Plex Mono"?,/);
  expect(await input.getAttribute('placeholder')).toBeNull();
  await expect(page.locator('.panel').first().getByText('for explanation.')).toHaveCount(0);
  // The field covers about three quarters of the row.
  const row = (await page.locator('.panel').first().locator('.cmd').boundingBox())!;
  const box = (await field.boundingBox())!;
  expect(box.width / row.width).toBeGreaterThan(0.6);
  expect(box.width / row.width).toBeLessThan(0.8);
  // What the panel runs is still named, for screen readers.
  await input.blur();
  await expect(input).toHaveAccessibleDescription(/MARKET|WEI/);
  // Messages go on the row below, in white.
  await run(page, 'NOSUCHCODE');
  const hints = page.locator('.panel').first().locator('.cmd-hints');
  await expect(hints.locator('.cmd-msg.error')).toBeVisible();
  expect((await hints.boundingBox())!.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
  expect(errors).toEqual([]);
});

test("the quote strip's two lines sit above the red bar, the first sharing the command line's row until typing starts", async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'AAPL US Equity FA');
  const panel = page.locator('.panel').first();
  // TE04 04:55, TE01 03:11: line 1 is the ticker, the currency, the last price and change, then the bid and ask.
  const line1 = panel.locator('.cmd .qline-1');
  await expect(line1.locator('.qs-ticker')).toHaveText('AAPL US');
  await expect(line1.locator('.qs-ccy')).toHaveText('$');
  await expect(line1.locator('.px')).toHaveText(/^\d[\d,]*\.\d{2}$/);
  expect(await line1.locator('.qs-ticker').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  // Line 2 is on the hint row: amber labels At, Vol, O, H, L, Val and Prev with white values; Val is a labelled blank.
  const line2 = panel.locator('.cmd-hints .qline-2');
  expect(await line2.locator('.lbl').allInnerTexts()).toEqual(['At', 'Vol', 'O', 'H', 'L', 'Val', 'Prev']);
  expect(await line2.locator('.lbl').first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 158, 27)');
  await expect(line2.locator('.qs-clock')).toBeVisible();
  // Both lines come before the red bar, and the screen no longer draws a strip of its own.
  const bar = (await panel.locator('.fnh-row').boundingBox())!;
  expect((await line2.boundingBox())!.y + 1).toBeLessThan(bar.y);
  await expect(panel.locator('.panel-body .qstrip')).toHaveCount(0);
  // Typing turns the first row into the command field and hides the quote; running the command brings it back.
  await panel.locator('#cmd-0').click();
  await expect(line1).toHaveCount(0);
  await page.keyboard.type('DES');
  await expect(panel.locator('.cmd-field')).not.toHaveClass(/as-quote/);
  await page.keyboard.press('Enter');
  await expect(panel.locator('.fnh-code')).toHaveText('PROFILE');
  await expect(line1.locator('.qs-ticker')).toHaveText('AAPL US');
  // A screen without a security keeps the command field and an empty hint row.
  await run(page, 'TOP');
  await expect(panel.locator('.qstrip')).toHaveCount(0);
  await expect(panel.locator('.cmd-field')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a colour-blind scheme turns rises blue in text, heat maps and charts, and plain text a lighter amber', async ({ page }) => {
  const errors = await boot(page);
  // Pixels of a colour on the panel's chart canvas.
  const pixels = (r: number, g: number, b: number) => page.locator('.panel canvas').first().evaluate((el, [r, g, b]) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) n++;
    return n;
  }, [r, g, b]);
  await run(page, 'AAPL US Equity GPC');
  await expect.poll(() => pixels(47, 211, 107)).toBeGreaterThan(50);
  await run(page, 'SETTINGS');
  const colours = page.locator('.panel').first().getByLabel('Colours');
  await expect(colours).toHaveValue('default');
  await colours.selectOption('deuteranopia');
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'deuteranopia');
  const vars = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return [s.getPropertyValue('--up').trim(), s.getPropertyValue('--dn').trim(), s.getPropertyValue('--amber').trim()];
  });
  expect(vars).toEqual(['#0089e8', '#cd4b4c', '#fea028']);
  // The chart's rising candles are blue now, none green.
  await run(page, 'AAPL US Equity GPC');
  await expect.poll(() => pixels(0, 137, 232)).toBeGreaterThan(50);
  expect(await pixels(47, 211, 107)).toBe(0);
  // Heat-map tiles: rises blue (more blue than green), falls red.
  await run(page, 'HEATMAP');
  const fills = await page.locator('.heatmap-box svg rect[fill^="rgb("]').evaluateAll((list) => list.map((el) => el.getAttribute('fill')!.match(/\d+/g)!.map(Number)));
  expect(fills.length).toBeGreaterThan(10);
  const rises = fills.filter(([r, g, b]) => b > r && b > g);
  const falls = fills.filter(([r, g, b]) => r > g && r > b);
  expect(rises.length + falls.length).toBe(fills.length);
  expect(fills.filter(([r, g, b]) => g > r && g > b)).toHaveLength(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'deuteranopia');
  expect(errors).toEqual([]);
});

test("each panel's frame names its function and number, and maximises it alone and back", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify({ v: 3, s: { layout: '4' } }));
  });
  const errors = await boot(page);
  const panels = page.locator('.panel');
  await expect(panels).toHaveCount(4);
  await run(page, 'AAPL US Equity GP');
  const frame = panels.first().locator('.panel-frame');
  await expect(frame.locator('.panel-frame-mn')).toHaveText('GP');
  await expect(frame.locator('.panel-frame-title')).toHaveText('1-ARMIN');
  await expect(panels.nth(1).locator('.panel-frame-title')).toHaveText('2-ARMIN');
  const quarter = (await panels.nth(1).boundingBox())!;
  await panels.nth(1).getByRole('button', { name: 'Show panel 2 alone' }).click();
  await expect(page.locator('.panel:visible')).toHaveCount(1);
  // Alone, it takes the room of all four.
  const alone = (await panels.nth(1).boundingBox())!;
  expect(alone.width).toBeGreaterThan(quarter.width * 1.95);
  expect(alone.height).toBeGreaterThan(quarter.height * 1.95);
  await panels.nth(1).getByRole('button', { name: 'Show every panel again' }).click();
  await expect(page.locator('.panel:visible')).toHaveCount(4);
  // A double-click on the title does the same; the first panel kept its chart while hidden.
  await frame.dblclick();
  await expect(page.locator('.panel:visible')).toHaveCount(1);
  await expect(panels.first().locator('.fnh-code')).toHaveText('CHART');
  await frame.dblclick();
  await expect(page.locator('.panel:visible')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('suggestions read as the terminal lists them: amber heading, white mnemonics, typed letters bold, More Functions…', async ({ page }) => {
  const errors = await boot(page);
  const input = page.locator('#cmd-0');
  await input.click();
  await page.keyboard.type('corp');
  const list = page.locator('.panel').first().locator('.ac');
  await expect(list.locator('.ac-head').first()).toHaveText('FUNCTIONS');
  expect(await list.locator('.ac-head').first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 158, 27)');
  const item = list.locator('.ac-item', { hasText: 'Corporate Actions' }).first();
  await expect(item.locator('b')).toHaveText('Corp');
  expect(await item.locator('.fn').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  const more = list.getByRole('button', { name: 'More Functions…' });
  expect(await more.evaluate((el) => [getComputedStyle(el).fontStyle, getComputedStyle(el).color])).toEqual(['italic', 'rgb(77, 155, 230)']);
  await more.click();
  await expect(page.locator('.panel').first().locator('.fnh-code')).toHaveText('HELP');
  await expect(page.locator('.panel').first().locator('.fnh-title')).toContainText('CORP');
  // The directory lists the functions that match, not every function.
  await expect(page.locator('.panel').first().locator('.sect', { hasText: 'Corporate Actions' })).toBeVisible();
  await expect(page.locator('.panel').first().getByText('World Equity Indices', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the help desk opens on its own page, says who answers, and starts again with New chat', async ({ page }) => {
  const errors = await boot(page);
  await run(page, 'MESSAGES');
  const panel = page.locator('.panel').first();
  await expect(panel.locator('.desk-title')).toHaveText('HELP DESK');
  await expect(panel.locator('.desk-sub')).toContainText('Nothing you type goes to an AI service');
  expect(await panel.locator('.chat-input.desk .inp').evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe('rgb(255, 158, 27)');
  await panel.getByRole('button', { name: 'How do I set a price alert?' }).click();
  const box = panel.getByRole('textbox', { name: 'Message' });
  await expect(box).toHaveValue('How do I set a price alert?');
  await box.press('Enter');
  await expect(panel.locator('.desk-title')).toHaveCount(0);
  await expect(panel.locator('.msg.me')).toContainText('How do I set a price alert?');
  await expect(panel.locator('.msg').last()).not.toHaveClass(/\bme\b/);
  await panel.getByRole('button', { name: '＋ New chat' }).click();
  await expect(panel.locator('.desk-title')).toHaveText('HELP DESK');
  await expect(panel.locator('.msg.me')).toHaveCount(0);
  expect(errors).toEqual([]);
});
