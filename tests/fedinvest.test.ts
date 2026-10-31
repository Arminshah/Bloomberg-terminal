import { describe, expect, it } from 'vitest';
import { candidateDays, couponText, hasPrices, parseFedInvest, treasuryDef, treasuryTicker } from '../src/data/live/fedinvest';
import { engine } from '../src/data/market';
import { resolveSecurity } from '../src/data/registry';
import { TREASURY_TYPED } from '../src/terminal/exec';

// The price table in FedInvest's layout (CUSIP, type, rate, maturity, call date, Buy, Sell, End of Day); the rows
// are made up, in the form the page gave on 31 October 2026.
const row = (cells: string[]) => `<tr>${cells.map((c) => `<td class="text">${c}</td>`).join('')}</tr>`;
const PAGE = `<html><body><table class="data1">
<tr><th>CUSIP</th><th>SECURITY TYPE</th><th>RATE</th><th>MATURITY DATE</th><th>CALL DATE</th><th>BUY</th><th>SELL</th><th>END OF DAY</th></tr>
${row(['912797AA1', 'MARKET BASED BILL', '0.000%', '11/03/2026', '', '0.000000', '99.957333', '0.000000'])}
${row(['91282CAA1', 'MARKET BASED NOTE', '4.625%', '08/15/2036', '&nbsp;', '97.531250', '97.515625', '0.000000'])}
${row(['912810AA1', 'MARKET BASED BOND', '3.375%', '08/15/2042', '', '79.859375', '79.812500', '79.828125'])}
${row(['912828AA1', 'TIPS', '0.125%', '02/15/2051', '', '49.546875', '49.500000', '0.000000'])}
${row(['91282CBB2', 'MARKET BASED FRN', '0.205%', '10/31/2027', '', '100.031250', '100.015625', '0.000000'])}
${row(['NOT A ROW', 'x', 'y', 'z', '', '1', '2', '3'])}
</table></body></html>`;

describe('parseFedInvest', () => {
  const rows = parseFedInvest(PAGE);

  it('reads every security row and leaves out the header and anything else', () => {
    expect(rows.map((r) => r.cusip)).toEqual(['912797AA1', '91282CAA1', '912810AA1', '912828AA1', '91282CBB2']);
    expect(rows.map((r) => r.type)).toEqual(['Bills', 'Notes', 'Bonds', 'TIPS', 'FRN']);
  });

  it('reads the coupon, the maturity and the prices, a 0 price as none', () => {
    expect(rows[1]).toEqual({ cusip: '91282CAA1', type: 'Notes', rate: 4.625, maturity: '2036-08-15', buy: 97.53125, sell: 97.515625, eod: NaN });
    expect(rows[0].buy).toBeNaN();
    expect(rows[2].eod).toBe(79.828125);
  });

  it('tells a day with prices from one not yet published', () => {
    expect(hasPrices(rows)).toBe(true);
    expect(hasPrices(parseFedInvest(row(['91282CAA1', 'MARKET BASED NOTE', '4.625%', '08/15/2036', '', '0', '0', '0'])))).toBe(false);
    expect(hasPrices([])).toBe(false);
  });
});

describe('Treasury names', () => {
  it('writes the coupon in eighths where it is one, otherwise in decimals', () => {
    expect(couponText(4.625)).toBe('4 5/8');
    expect(couponText(3)).toBe('3');
    expect(couponText(0.125)).toBe('0 1/8');
    expect(couponText(4.6)).toBe('4.6');
  });

  it('names a note as the terminal does, with its CUSIP as an alias', () => {
    const r = parseFedInvest(PAGE)[1];
    expect(treasuryTicker(r)).toBe('T 4 5/8 08/15/36');
    const def = treasuryDef(r);
    expect(def.id).toBe('T 4 5/8 08/15/36 Govt');
    // Its CUSIP, and its name with the coupon in decimals as SRCH writes it.
    expect(def.alias).toEqual(['91282CAA1', 'T 4.625 08/15/36']);
    expect(def.bond).toMatchObject({ coupon: 4.625, maturity: '2036-08-15', freq: 2 });
    expect(def.px).toBe(97.515625);
  });
});

describe('Treasury names typed', () => {
  it('needs no decimal alias for a whole coupon, and keeps the CUSIP suffix of a second issue of the same name', () => {
    const whole = treasuryDef({ cusip: '91282CRN3', type: 'Notes', rate: 5, maturity: '2031-09-30', buy: 100, sell: 100, eod: NaN });
    expect(whole.alias).toEqual(['91282CRN3']);
    const twin = { cusip: '912810ZZ9', type: 'Bonds' as const, rate: 4.625, maturity: '2036-08-15', buy: 97, sell: 97, eod: NaN };
    expect(treasuryDef(twin, 'T 4 5/8 08/15/36 912810ZZ9').alias).toEqual(['912810ZZ9', 'T 4.625 08/15/36 912810ZZ9']);
  });

  it('starts the FedInvest load for a Treasury typed before or after its function', () => {
    for (const t of ['T 4 5/8 08/15/36 Govt ALLQ', 'ALLQ 91282CAA1 Govt', 'YAS T 4 5/8 08/15/36 Govt', 'T 4.625 08/15/36 Govt YAS', '91282CAA1 Govt']) expect(TREASURY_TYPED.test(t), t).toBe(true);
    for (const t of ['AAPL US Equity GP', 'WEI', 'TLT US Equity', 'GT10 Govt']) expect(TREASURY_TYPED.test(t), t).toBe(false);
  });
});

describe("FedInvest's Treasury in place of the simulator's of the same name", () => {
  it('replaces the hidden on-the-run note with the real one, so its CUSIP and decimal name find it', () => {
    const sim = engine.securities.find((d) => d.yk === 'Govt' && d.tenor === 5 && d.bond)!;
    const before = engine.securities.length;
    const real = treasuryDef({ cusip: '91282CXX0', type: 'Notes', rate: sim.bond!.coupon, maturity: sim.bond!.maturity, buy: 100.25, sell: 100.21875, eod: NaN }, sim.ticker);
    expect(real.id).toBe(sim.id);
    expect(engine.replaceSecurities([real])).toEqual([sim.id]);
    expect(engine.get(sim.id)).toBe(real);
    expect(engine.securities.length).toBe(before);
    expect(resolveSecurity('91282CXX0')).toBe(real);
    // The simulator's own aliases went with it.
    expect(resolveSecurity(`CT5`)?.id).not.toBe(sim.id);
    expect(engine.quote(sim.id)!.last).toBeCloseTo(100.21875, 6);
  });
});

describe('candidateDays', () => {
  it('counts back from today over weekdays only', () => {
    // Saturday 31 October 2026.
    expect(candidateDays(new Date(Date.UTC(2026, 9, 31)), 4)).toEqual(['2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27']);
    expect(candidateDays(new Date(Date.UTC(2026, 10, 2)), 2)).toEqual(['2026-11-02', '2026-10-30']);
  });
});
