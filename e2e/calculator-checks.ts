import { expect, type Page } from '@playwright/test';

export type RunCommand = (command: string, code: string) => Promise<void>;
const displayed = async (page: Page, id: string) => Number((await page.getByTestId(id).innerText()).replace(/,/g, ''));

/** Independent closed-form examples, shared by the browser and real desktop UI checks. */
export async function checkBond(page: Page, run: RunCommand) {
  await run('YAS', 'BONDCALC');
  await expect(page.getByTestId('bond-clean')).toHaveCount(0);
  await page.getByLabel('Coupon %', { exact: true }).fill('5');
  await page.getByLabel('Settlement', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Maturity', { exact: true }).fill('2030-01-01');
  await page.getByLabel('Yield %', { exact: true }).fill('4');
  const expected = 2.5 * (1 - 1.02 ** -10) / 0.02 + 100 * 1.02 ** -10;
  await expect.poll(() => displayed(page, 'bond-clean')).toBeCloseTo(expected, 5);
  await page.getByLabel('Solve from').selectOption('price');
  await page.getByLabel('Clean price per 100').fill(String(expected));
  await expect.poll(() => displayed(page, 'bond-yield')).toBeCloseTo(4, 5);
  await page.getByLabel('Clean price per 100').fill('-1');
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('positive clean price');
  await expect(page.getByTestId('bond-clean')).toHaveCount(0);
  await page.getByLabel('Clean price per 100').fill(String(expected));
}

export async function checkForward(page: Page, run: RunCommand) {
  await run('EURUSD Curncy FRD', 'FXFORWARD');
  await page.getByLabel('Spot override').fill('1.1');
  await page.getByLabel('EUR deposit %').fill('2');
  await page.getByLabel('USD deposit %').fill('5');
  await page.getByLabel('Contractual forward rate').fill('1.09');
  const outright = 1.1 * 1.0125 / 1.005;
  await expect.poll(() => displayed(page, 'forward-outright')).toBeCloseTo(outright, 7);
  await expect.poll(() => displayed(page, 'forward-pv')).toBeCloseTo(1e6 * (outright - 1.09) / 1.0125, 1);
  await page.getByLabel('EUR deposit %').fill('-400');
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('factor zero or negative');
  await expect(page.getByTestId('forward-outright')).toHaveCount(0);
  await page.getByLabel('EUR deposit %').fill('2');
}

export async function checkSwap(page: Page, run: RunCommand) {
  await run('SWPM', 'SWAPCALC');
  await page.getByLabel('Valuation date').fill('2025-01-01');
  await page.getByLabel('Swap start').fill('2025-01-01');
  await page.getByLabel('Swap maturity').fill('2027-01-01');
  await page.getByLabel('Fixed coupon %').fill('3');
  await page.getByLabel('Zero curve').fill('1,5\n2,5\n5,5');
  const expected = 1e6 * (1 - Math.exp(-0.1) - 0.03 * (Math.exp(-0.05) + Math.exp(-0.1)));
  await expect.poll(() => displayed(page, 'swap-par')).toBeCloseTo(Math.expm1(0.05) * 100, 5);
  await expect.poll(() => displayed(page, 'swap-npv')).toBeCloseTo(expected, 1);
  await page.getByLabel('Side', { exact: true }).selectOption('receive');
  await expect.poll(() => displayed(page, 'swap-npv')).toBeCloseTo(-expected, 1);
  await page.getByLabel('Fixed coupon %').fill('');
  await expect.poll(() => displayed(page, 'swap-npv')).toBeCloseTo(0, 1);
  await page.getByLabel('Zero curve').fill('1,5');
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('cover every payment date');
  await expect(page.getByTestId('swap-npv')).toHaveCount(0);
}

export async function checkOptions(page: Page, run: RunCommand) {
  await run('AAPL OVME', 'OPTIONCALC');
  await page.getByLabel('Spot override').fill('100');
  await page.getByLabel('Strike', { exact: true }).fill('100');
  await page.getByLabel('Rate override', { exact: true }).fill('5');
  await page.getByLabel('Dividend yield override').fill('2');
  await page.getByLabel('Volatility override').fill('0');
  const expiry = Number(await page.getByLabel('Expiry', { exact: true }).inputValue());
  const years = Math.max(0, (expiry - Date.now()) / (365 * 86_400_000));
  const expected = 100 * (Math.exp(-0.02 * years) - Math.exp(-0.05 * years));
  await expect.poll(() => displayed(page, 'option-value')).toBeCloseTo(expected, 3);
  await page.getByLabel('Volatility override').fill('-1');
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('nonnegative volatility');
  await expect(page.getByTestId('option-value')).toHaveCount(0);
  await page.getByLabel('Volatility override').fill('0');
  await page.getByLabel('Spot override').fill('0');
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('positive spot');
  await expect(page.getByTestId('option-value')).toHaveCount(0);
  await run('USDJPY Curncy OVML', 'FXOPTION');
  await page.getByLabel('Spot override').fill('100');
  await page.getByLabel('Strike', { exact: true }).fill('100');
  await page.getByLabel('USD rate override %').fill('2');
  await page.getByLabel('JPY rate override %').fill('5');
  await page.getByLabel('Volatility override').fill('0');
  await page.getByLabel('Expiry', { exact: true }).selectOption('7'); // 365 days, ACT/365F.
  await expect.poll(() => displayed(page, 'fx-option-value')).toBeCloseTo(1e6 * 100 * (Math.exp(-0.02) - Math.exp(-0.05)), 1);
  await page.getByLabel('Notional', { exact: true }).fill('-1');
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('positive base-currency notional');
  await expect(page.getByTestId('fx-option-value')).toHaveCount(0);
}
