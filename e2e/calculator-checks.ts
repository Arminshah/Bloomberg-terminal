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
  await page.getByLabel('Coupon %', { exact: true }).fill('0');
  const years = (Date.parse('2030-01-01') - Date.parse('2025-01-01')) / 86_400_000 / 365;
  await page.getByLabel('Clean price per 100').fill(String(100 * Math.exp(-0.05 * years)));
  await page.getByLabel('Benchmark nominal yield %').fill('3');
  const y = await displayed(page, 'bond-yield');
  await expect.poll(() => displayed(page, 'bond-g-spread')).toBeCloseTo((y - 3) * 100, 2);
  await page.getByLabel('Bond zero curve').fill('1,3\n10,3');
  await expect.poll(() => displayed(page, 'bond-z-spread')).toBeCloseTo(200, 4);
  await page.getByLabel('Bond zero curve').fill('1,3');
  await expect(page.getByTestId('bond-z-spread')).toHaveCount(0);
  await expect(page.getByTestId('bond-clean')).toHaveCount(1);
  await page.getByLabel('Bond zero curve').fill('1,3\n10,3');
}

/** Excel's published 30/360 PRICE example through the day-count control, then a settlement lag from a trade date. */
export async function checkBondConventions(page: Page, run: RunCommand) {
  await run('YAS', 'BONDCALC');
  await page.getByLabel('Day count').selectOption('30/360');
  await page.getByLabel('Coupons per year').selectOption('2');
  await page.getByLabel('Coupon %', { exact: true }).fill('5.75');
  await page.getByLabel('Settlement', { exact: true }).fill('2008-02-15');
  await page.getByLabel('Maturity', { exact: true }).fill('2017-11-15');
  await page.getByLabel('Solve from').selectOption('yield');
  await page.getByLabel('Yield %', { exact: true }).fill('6.5');
  // Microsoft's PRICE documentation: 5.75% semiannual, 15 Feb 2008 to 15 Nov 2017, 6.50%, basis 0 -> 94.63 (94.63436162).
  await expect.poll(() => displayed(page, 'bond-clean')).toBeCloseTo(94.63436162, 5);
  await expect(page.getByTestId('bond-accrued-days')).toHaveText('90 of 180');
  // A trade date settles on the lag again: T+1 by default, T+2 when chosen; Thursday 15 Oct 2026 + 2 weekdays is Monday.
  await page.getByLabel('Trade date').fill('2026-10-15');
  await expect(page.getByLabel('Settlement', { exact: true })).toHaveValue('2026-10-16');
  await page.getByLabel('Settlement lag').selectOption('2');
  await expect(page.getByLabel('Settlement', { exact: true })).toHaveValue('2026-10-19');
}

/** A call schedule: the textbook yield-to-call example, 10% semiannual priced 117.50 and callable in five years at 110. */
export async function checkBondCalls(page: Page, run: RunCommand) {
  await run('YAS', 'BONDCALC');
  await page.getByLabel('Day count').selectOption('ACT/ACT ICMA');
  await page.getByLabel('Coupons per year').selectOption('2');
  await page.getByLabel('Coupon %', { exact: true }).fill('10');
  await page.getByLabel('Settlement', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Maturity', { exact: true }).fill('2036-01-15');
  await page.getByLabel('Solve from').selectOption('price');
  await page.getByLabel('Clean price per 100').fill('117.5');
  // YAS keeps the calls on their own page, 6) Calls (TE07 03:47).
  await page.locator('.panel').first().getByRole('button', { name: /6\) Calls/ }).click();
  await page.getByLabel('Call schedule').fill('2031-01-15, 110\n2020-01-15, 115');
  // 7.43% to the call (7.4332997367 from a separate solver), below the 7.48% to maturity: the call is the worst.
  await expect.poll(() => displayed(page, 'bond-ytw')).toBeCloseTo(7.4332997367, 6);
  await expect(page.getByTestId('bond-workout')).toContainText('(call at 110.000)');
  await expect(page.getByTestId('bond-calls').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('bond-calls').locator('tbody tr').first()).toContainText('Call (worst)');
  await expect(page.getByText('Left out: 1 on or before settlement.', { exact: true })).toBeVisible();
  await page.getByLabel('Call schedule').fill('2031-01-15, 0');
  await expect(page.getByRole('status').filter({ hasText: 'The call on 2031-01-15 needs a price above zero.' })).toBeVisible();
  await expect(page.getByTestId('bond-ytw')).toHaveCount(0);
  await page.getByLabel('Call schedule').fill('2031-01-15, 110');
  await expect.poll(() => displayed(page, 'bond-ytw')).toBeCloseTo(7.4332997367, 6);
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
  // At zero rates and ATM, C/S = 2*N(vol*sqrt(T)/2)-1. Numerically
  // integrate the normal density independently to supply a 20% IV premium.
  await page.getByLabel('Rate override', { exact: true }).fill('0');
  await page.getByLabel('Dividend yield override').fill('0');
  await page.getByLabel('Option solve mode').selectOption('iv');
  const z = 0.2 * Math.sqrt(years) / 2;
  const n = 1000;
  const h = z / n;
  let integral = 0;
  for (let k = 0; k <= n; k++) integral += (k === 0 || k === n ? 1 : k % 2 === 0 ? 2 : 4) * Math.exp(-((k * h) ** 2) / 2) / Math.sqrt(2 * Math.PI);
  await page.getByLabel('Option premium per share').fill(String(200 * integral * h / 3));
  await expect(page.getByTestId('option-iv')).toContainText('20.0000%');
  await page.getByLabel('Option premium per share').fill('101');
  await expect(page.getByTestId('option-value')).toHaveCount(0);
  await page.getByLabel('Option solve mode').selectOption('value');
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

export async function checkStrategy(page: Page, run: RunCommand) {
  await run('OSA', 'OPTIONSTRATEGY');
  await expect(page.getByTestId('strategy-debit')).toHaveCount(0);
  await page.getByLabel('Strategy spot').fill('100');
  await page.getByLabel('Continuous rate %', { exact: true }).fill('5');
  await page.getByLabel('Continuous dividend %', { exact: true }).fill('0');
  await page.getByLabel('Option strategy legs').fill('C,100,1,8,25\nC,110,-1,4,25');
  await expect.poll(() => displayed(page, 'strategy-debit')).toBe(400);
  await expect.poll(() => displayed(page, 'strategy-max-loss')).toBe(400);
  await expect.poll(() => displayed(page, 'strategy-max-profit')).toBe(600);
  await expect.poll(() => displayed(page, 'strategy-breakevens')).toBe(104);
  await page.getByLabel('Scenario days forward').fill('90');
  await page.getByLabel('Scenario log spot move %').fill(String(Math.log(1.05) * 100));
  await expect.poll(() => displayed(page, 'strategy-scenario-pnl')).toBe(100);
  await page.getByLabel('Option strategy legs').fill('C,100,-1,5,25');
  await expect(page.getByTestId('strategy-max-loss')).toHaveText('Unlimited');
  await page.getByLabel('Option strategy legs').fill('C,100,-1,,25');
  await expect(page.getByTestId('strategy-debit')).toHaveCount(0);
  await page.getByLabel('Option strategy legs').fill('C,100,1,8,25\nC,110,-1,4,25');
}

/** Independent QuantLib PDE price, manual tenor and ambiguous exercise-floor IV, on both platforms. */
export async function checkAmericanOption(page: Page, run: RunCommand) {
  await run('OVME AAPL P 100 2027-01-15 20', 'OPTIONCALC');
  await expect(page.getByLabel('Strike', { exact: true })).toHaveValue('100');
  await run('OVME AAPL C 110 2027-01-15 15', 'OPTIONCALC');
  await expect(page.getByLabel('Strike', { exact: true })).toHaveValue('110');
  await expect(page.getByLabel('Volatility override')).toHaveValue('15');
  await run('AAPL OVME', 'OPTIONCALC');
  await page.getByLabel('Spot override').fill('100');
  await page.getByLabel('Strike', { exact: true }).fill('100');
  await page.getByLabel('Rate override', { exact: true }).fill('5');
  await page.getByLabel('Dividend yield override').fill('0');
  await page.getByLabel('Volatility override').fill('20');
  await page.getByLabel('Days to expiry override').fill('365');
  await page.getByRole('button', { name: 'Put', exact: true }).click();
  const european = await displayed(page, 'option-value');
  await page.getByLabel('Option exercise style').selectOption('A');
  await expect.poll(async () => Math.abs(await displayed(page, 'option-value') - 6.0900467967)).toBeLessThan(0.025);
  expect(await displayed(page, 'option-value')).toBeGreaterThan(european);
  expect(await displayed(page, 'option-exercise-premium')).toBeGreaterThan(0.4);
  await page.getByLabel('Option solve mode').selectOption('iv');
  await page.getByLabel('Option premium per share').fill('6.0900467967');
  await expect.poll(async () => Math.abs(Number.parseFloat(await page.getByTestId('option-iv').innerText()) - 20)).toBeLessThan(0.05);
  await page.getByLabel('Spot override').fill('50');
  await page.getByLabel('Option premium per share').fill('50');
  await expect(page.getByTestId('option-value')).toHaveCount(0);
  await expect(page.locator('.panel').first().getByRole('status')).toContainText('No unique finite American implied volatility');
  await page.getByLabel('Option solve mode').selectOption('value');
  await expect.poll(() => displayed(page, 'option-value')).toBe(50);
  await page.getByLabel('Spot override').fill('100');
}

export async function checkPortfolioPositions(page: Page, run: RunCommand) {
  await run('PORT', 'PORTFOLIO');
  // PORT opens on Intraday; cash and positions are typed on 2) Holdings.
  await run('2', 'PORTFOLIO');
  await page.getByLabel('Cash in USD').fill('10000');
  await page.getByRole('button', { name: 'Set cash', exact: true }).click();
  await page.getByLabel('Security', { exact: true }).fill('AAPL');
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await page.getByLabel('Price', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Security', { exact: true }).fill('AAPL');
  await page.getByLabel('Quantity', { exact: true }).fill('-5');
  await page.getByLabel('Price', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const holding = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Remove AAPL US Equity', exact: true }) });
  await expect(holding.locator('td').nth(2)).toHaveText('5');
  // Reducing the position must retain its 90 average cost, even with a 200 adjustment price.
  await expect(holding.locator('td').nth(3)).toHaveText('90.00');
  // 4) Risk & Allocation.
  await run('4', 'PORTFOLIO');
}
