import { afterEach, describe, expect, it } from 'vitest';
import { chartEvents } from '../src/functions/GP';
import { realDividends, realSplits } from '../src/data/live/yahoo';
import { engine } from '../src/data/market';

const def = engine.get('AAPL US Equity')!;
const DAY = 86_400_000;

describe("CHART's Key Events, as GP marks them", () => {
  afterEach(() => {
    realDividends.delete(def.id);
    realSplits.delete(def.id);
  });

  it("takes the ex-dividend dates and splits from the price history's source, in date order", () => {
    realDividends.set(def.id, [{ day: 20_400, amount: 0.26 }, { day: 20_310, amount: 0.25 }]);
    realSplits.set(def.id, [{ day: 18_500, numerator: 4, denominator: 1 }]);
    const events = chartEvents(def).filter((e) => e.kind !== 'E');
    expect(events).toEqual([{ t: 18_500 * DAY, kind: 'S' }, { t: 20_310 * DAY, kind: 'D' }, { t: 20_400 * DAY, kind: 'D' }]);
  });
});
