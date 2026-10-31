import { expect, test, type Locator, type Page } from '@playwright/test';

// The owner built the watchlist on 27 October 2026 and fixed it on 31 October: its columns and their order, the range
// bars, the day chart, its row height, text size and colours, and its place as the right-hand column of the default
// layout. These checks fail if any of that changes. Never edit, weaken or remove them, or update their screenshot, to
// let a change through; only the owner can change the watchlist, by asking in so many words. The look-alike work on
// the rest of the app (docs/parity-build-plan.md) changes the chrome around the panel, never the table inside it.

const LABELS = ['Security', 'Name', 'Last Price', 'Change (%)', 'Change', 'Pre-mkt', 'After-hrs', 'Volume', 'Avg Vol (3M)', 'YTD', '52-Wk %', 'Day Range', '52-Wk Range', 'Day Chart', 'Market Cap'];
const LIST = ['AAPL US Equity', 'MSFT US Equity', 'NVDA US Equity', 'JPM US Equity', 'XOM US Equity', 'EURUSD Curncy', 'USGG10YR Index'];
// A Wednesday at 15:00 in New York, in the regular session: the demo's prices are a function of the security and the
// minute, so with the clock held here and the jitter's randomness fixed, the table draws the same every time.
const AT = new Date('2026-10-28T19:00:00Z');

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

async function boot(page: Page, terminal?: object) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(AT);
  await page.addInitScript(({ terminal, list }) => {
    // A fixed sequence for the demo's tick jitter, so two runs draw the same.
    let seed = 20261031;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    localStorage.setItem('armin:demo', '1');
    if (terminal && !localStorage.getItem('armin:terminal')) localStorage.setItem('armin:terminal', JSON.stringify(terminal));
    if (!localStorage.getItem('armin:settings')) localStorage.setItem('armin:settings', JSON.stringify({ v: 1, s: { liveCrypto: false, liveFx: false, newsFlashes: false } }));
    if (!localStorage.getItem('armin:watchlists')) localStorage.setItem('armin:watchlists', JSON.stringify({ v: 1, s: { lists: [{ name: 'Guard', ids: list }], active: 0 } }));
  }, { terminal, list: LIST });
  await page.goto('/');
  await expect(page.locator('.panel').first()).toBeVisible();
  return errors;
}

/** The header cells' own labels, without the LIVE mark of the session column or a sort arrow. */
const labels = (panel: Locator) =>
  panel.locator('.tbl thead th').evaluateAll((ths) =>
    ths.map((th) => {
      const copy = th.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.live-tag').forEach((e) => e.remove());
      return (copy.textContent ?? '').replace(/ [▲▼]$/, '').trim();
    }),
  );

test('the default layout keeps the watchlist as its right-hand column, with the owner\'s columns in order', async ({ page }) => {
  const errors = await boot(page);
  const watch = page.locator('.panel[data-panel="4"]');
  await expect(watch.locator('.fnh-code')).toHaveText('WATCHLIST');
  const box = (await watch.boundingBox())!;
  const workspace = (await page.locator('.workspace').boundingBox())!;
  for (const i of [0, 1, 2, 3]) {
    const other = (await page.locator(`.panel[data-panel="${i}"]`).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(other.x + other.width - 1);
  }
  // It runs the full height of the workspace, beside both rows of panels.
  expect(box.height).toBeGreaterThan(workspace.height * 0.9);
  expect(await labels(watch)).toEqual([...LABELS, '']);
  expect(errors).toEqual([]);
});

test('typing WATCH opens the watchlist; W opens the worksheets', async ({ page }) => {
  const errors = await boot(page, { v: 3, s: { layout: '1' } });
  const panel = page.locator('.panel').first();
  const cmd = page.locator('#cmd-0');
  await cmd.fill('WATCH');
  await cmd.press('Enter');
  await expect(panel.locator('.fnh-code')).toHaveText('WATCHLIST');
  await cmd.fill('W');
  await cmd.press('Enter');
  await expect(panel.locator('.fnh-code')).toHaveText('WORKSHEET');
  expect(errors).toEqual([]);
});

test('the watchlist table keeps its row height, text size, colours and drawing', async ({ page }) => {
  const errors = await boot(page, { v: 3, s: { layout: '1' } });
  const cmd = page.locator('#cmd-0');
  await cmd.fill('WATCHLIST');
  await cmd.press('Enter');
  const panel = page.locator('.panel').first();
  const table = panel.locator('.tbl-wrap');
  await expect(panel.locator('.tbl tbody tr')).toHaveCount(LIST.length);
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await labels(panel)).toEqual([...LABELS, '']);

  // Row height, text size and colours, as computed.
  const style = (selector: string, props: string[]) =>
    panel.locator(selector).first().evaluate((el, ps) => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(ps.map((p) => [p, p === 'height' ? `${Math.round(el.getBoundingClientRect().height)}px` : cs.getPropertyValue(p)]));
    }, props);
  expect(await style('.tbl tbody tr', ['height'])).toEqual({ height: '22px' });
  expect(await style('.tbl tbody td', ['font-size', 'font-weight', 'color', 'background-color', 'border-bottom-color'])).toEqual({
    'font-size': '12px',
    'font-weight': '500',
    color: 'rgb(232, 232, 232)',
    'background-color': 'rgba(0, 0, 0, 0)',
    'border-bottom-color': 'rgb(20, 20, 20)',
  });
  expect(await style('.tbl thead th', ['font-size', 'color', 'background-color'])).toEqual({ 'font-size': '11px', color: 'rgb(238, 238, 238)', 'background-color': 'rgb(41, 43, 46)' });
  expect(await style('.tbl tbody td.white', ['color'])).toEqual({ color: 'rgb(255, 255, 255)' });

  // The range bars and the day chart are drawn in every line that has the data.
  await expect(panel.locator('.tbl tbody svg').first()).toBeVisible();

  // The drawing, with the prices and other figures masked: the table's layout, labels, bars and charts.
  await expect(table).toHaveScreenshot('watchlist-table.png', {
    mask: [panel.locator('.tbl tbody td.num')],
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.02,
  });
  expect(errors).toEqual([]);
});
