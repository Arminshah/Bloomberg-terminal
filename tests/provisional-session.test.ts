import { afterEach, describe, expect, it } from 'vitest';
import { dayNum } from '../src/data/calendar';
import { engine } from '../src/data/market';
import { SETTLED_OPEN_SOURCE, SETTLED_RANGE_SOURCE, SETTLED_SOURCE } from '../src/data/live/settled-volume';
import { provisionalSession } from '../src/functions/BQ';

const D = (iso: string) => dayNum(Date.parse(`${iso}T00:00:00Z`));
const ID = 'AAPL US Equity';
// The data audit read Apple's quote at 01:50 UTC on 31 October 2026, before Nasdaq's record of the 30 October session
// had arrived: the price source's low of 342.35 against the official 334.35.
const AUDIT = Date.parse('2026-10-31T01:50:00Z');

describe("a finished US session before its official record", () => {
  const realOnly = engine.realOnly;
  afterEach(() => {
    engine.realOnly = realOnly;
  });

  const load = (low: number) => engine.setExternalDaily(ID, [
    { day: D('2026-10-29'), o: 340, h: 345, l: 338, c: 344, v: 50_000_000 },
    { day: D('2026-10-30'), o: 344.5, h: 349.19, l: low, c: 346, v: 67_000_000 },
  ]);

  it("is provisional until Nasdaq's record arrives, and says so on the quote screen", () => {
    engine.realOnly = true;
    load(342.35);
    expect(provisionalSession(ID, engine.quote(ID)!, AUDIT)).toBe(true);
    // During the session itself the figures are the session's own, not provisional.
    expect(provisionalSession(ID, engine.quote(ID)!, Date.parse('2026-10-30T18:00:00Z'))).toBe(false);
    // The record corrects the low and settles the session.
    expect(engine.settleVolume(ID, D('2026-10-30'), 67_841_000, SETTLED_SOURCE, { price: 344.5, source: SETTLED_OPEN_SOURCE }, { high: 349.19, low: 334.35, source: SETTLED_RANGE_SOURCE })).toBe(true);
    const q = engine.quote(ID)!;
    expect(q.low).toBe(334.35);
    expect(q.sessionSettled).toBe(true);
    expect(provisionalSession(ID, q, AUDIT)).toBe(false);
  });

  it('is settled too when the record agrees with every figure the source gave', () => {
    engine.realOnly = true;
    const MSFT = 'MSFT US Equity';
    engine.setExternalDaily(MSFT, [
      { day: D('2026-10-29'), o: 520, h: 525, l: 518, c: 524, v: 20_000_000 },
      { day: D('2026-10-30'), o: 524, h: 530, l: 515, c: 521.91, v: 25_000_000 },
    ]);
    expect(provisionalSession(MSFT, engine.quote(MSFT)!, AUDIT)).toBe(true);
    // Nothing to correct (the return says no figure changed), yet the session is marked as checked.
    expect(engine.settleVolume(MSFT, D('2026-10-30'), 25_000_000, SETTLED_SOURCE, { price: 524, source: SETTLED_OPEN_SOURCE }, { high: 530, low: 515, source: SETTLED_RANGE_SOURCE })).toBe(false);
    expect(engine.quote(MSFT)!.sessionSettled).toBe(true);
    expect(provisionalSession(MSFT, engine.quote(MSFT)!, AUDIT)).toBe(false);
  });

  it('never marks the browser demo, a non-US line or a line without a source', () => {
    engine.realOnly = false;
    load(342.35);
    expect(provisionalSession(ID, engine.quote(ID)!, AUDIT)).toBe(false);
    engine.realOnly = true;
    expect(provisionalSession('SPX Index', { ...engine.quote(ID)!, sessionSettled: undefined }, AUDIT)).toBe(false);
    expect(provisionalSession(ID, { ...engine.quote(ID)!, src: 'NONE' }, AUDIT)).toBe(false);
  });
});
