import { describe, expect, it } from 'vitest';
import { candidateDays, couponText, hasPrices, parseFedInvest, treasuryDef, treasuryTicker } from '../src/data/live/fedinvest';

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
    expect(def.alias).toEqual(['91282CAA1']);
    expect(def.bond).toMatchObject({ coupon: 4.625, maturity: '2036-08-15', freq: 2 });
    expect(def.px).toBe(97.515625);
  });
});

describe('candidateDays', () => {
  it('counts back from today over weekdays only', () => {
    // Saturday 31 October 2026.
    expect(candidateDays(new Date(Date.UTC(2026, 9, 31)), 4)).toEqual(['2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27']);
    expect(candidateDays(new Date(Date.UTC(2026, 10, 2)), 2)).toEqual(['2026-11-02', '2026-10-30']);
  });
});
