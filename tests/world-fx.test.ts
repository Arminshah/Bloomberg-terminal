import { describe, expect, it } from 'vitest';
import { crossPct, rateDecimals, ratePerBase } from '../src/data/world-fx';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

describe('world currency rates against a base', () => {
  it('gives units of a currency for one unit of the base, through the dollar', () => {
    // EUR at 1.16 dollars and GBP at 1.33: 1.1466 euros a pound; yen at 1/150 of a dollar: 150 yen a dollar.
    expect(ratePerBase(1.16, 1.33)).toBeCloseTo(1.33 / 1.16, 12);
    expect(ratePerBase(1 / 150, 1)).toBeCloseTo(150, 9);
    expect(ratePerBase(NaN, 1)).toBeNaN();
  });

  it("nets the base's own move against the dollar out of the currency's", () => {
    // The euro up 1% on the dollar, the pound up 0.5%: the euro gained 0.4975% on the pound.
    expect(crossPct(1, 0.5)).toBeCloseTo((1.01 / 1.005 - 1) * 100, 12);
    // Against the dollar itself the base's move is 0.
    expect(crossPct(-2, 0)).toBeCloseTo(-2, 12);
    // The dollar against a euro that rose 1%: down 0.990%.
    expect(crossPct(0, 1)).toBeCloseTo((1 / 1.01 - 1) * 100, 12);
    expect(crossPct(NaN, 1)).toBeNaN();
  });

  it('quotes small rates to more places', () => {
    expect([rateDecimals(150.123), rateDecimals(11.2), rateDecimals(0.8612), rateDecimals(NaN)]).toEqual([3, 4, 5, 2]);
  });

  it('opens under WCR, while WCRS still ranks the currencies', () => {
    expect(parseCommand('WCR', lookupFn)).toEqual({ kind: 'route', fn: 'CURRENCYRATES' });
    expect(parseCommand('WCRS', lookupFn)).toEqual({ kind: 'route', fn: 'FXRANK' });
  });
});
