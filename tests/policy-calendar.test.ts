import { afterEach, describe, expect, it } from 'vitest';
import { centralBanks, ecoEvents, policyCalendarEvents, rateDecision } from '../src/data/eco';
import { policyRates, type PolicyRates, type PolicySeries } from '../src/data/live/policy';
import type { NasdaqEcoEvent } from '../src/data/live/nasdaq-eco';
import type { PolicyDecision } from '../src/data/live/policy-decisions';
import { engine } from '../src/data/market';

// Synthetic policy documents and market levels exercise chronology only. They are not actual Fed observations.
const RELEASE = Date.parse('2026-10-28T18:00:00Z');
const FROM = Date.parse('2026-10-26T00:00:00Z');
const TO = Date.parse('2026-11-02T00:00:00Z');
const OBS: PolicySeries = { changes: [['2026-01-01', 4.25], ['2026-09-17', 4]], last: 4, asOf: '2026-10-27' };
const HOLD: PolicyDecision = { id: 'FED:2026-10-28', bank: 'FED', date: '2026-10-28', announcedAt: RELEASE, effectiveDate: '2026-10-29', action: 'hold', changeBp: 0, lower: 3.75, upper: 4, status: 'confirmed', sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm', implementationUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a1.htm', retrievedAt: RELEASE + 60_000 };
const VENDOR: NasdaqEcoEvent = { id: 'vendor-fed', time: RELEASE, country: 'US', countryName: 'United States', name: 'Fed Interest Rate Decision', actual: '3.75%', consensus: '3.75%', previous: '4.00%', description: '', relevance: 3 };
const rates = (decisions: PolicyDecision[] = []): PolicyRates => ({ fedUpper: OBS, fomc: ['2026-10-28', '2026-12-09'], decisions });
afterEach(() => policyRates.set({}));

describe('one policy event across economic calendar paths', () => {
  it('keeps an elapsed vendor calendar event pending even when the vendor supplies an actual', () => {
    const row = policyCalendarEvents([VENDOR], FROM, TO, RELEASE + 1, rates())[0];
    expect(row).toMatchObject({ policyStatus: 'awaiting-publication', actual: '', reportedActual: '3.75%', reportedConsensus: '3.75%', consensus: '' });
    expect(row.policyDecision).toBeUndefined();
  });

  it('shows a same-day statement-confirmed HOLD before the next daily observation', () => {
    const row = policyCalendarEvents([VENDOR], FROM, TO, RELEASE + 60_000, rates([HOLD]))[0];
    expect(row).toMatchObject({ policyStatus: 'confirmed', actual: '4.00%', policyDecision: { action: 'hold', changeBp: 0, sourceUrl: HOLD.sourceUrl } });
    expect(row.policyDecision).toBe(HOLD);
    expect(row).toMatchObject({ previous: '4.00%', reportedPrevious: '4.00%' });
    expect(rateDecision({ code: 'FED', rate: 4 }, HOLD.date, OBS, [HOLD], RELEASE + 60_000)).toMatchObject({ actual: 4, prior: 4 });
    expect(rateDecision({ code: 'FED', rate: 4 }, HOLD.date, OBS, [HOLD], RELEASE + 59_999).actual).toBeNull();
  });

  it('retains the confirmed fallback event when its effective target is future and the daily provider is absent', () => {
    const previousMode = engine.realOnly;
    engine.realOnly = true;
    policyRates.set({ decisions: [HOLD], fomc: ['2026-10-28'] });
    try {
      const event = ecoEvents(FROM, TO, RELEASE + 60_000).find((e) => e.id === HOLD.id)!;
      expect(event).toMatchObject({ policyStatus: 'confirmed', actual: 4, prior: 4, real: true, policyDecision: HOLD });
      expect(policyCalendarEvents([{ ...VENDOR, previous: '3.5%' }], FROM, TO, RELEASE + 60_000)[0]).toMatchObject({ previous: '4.00%', reportedPrevious: '3.5%' });
    } finally { engine.realOnly = previousMode; }
  });

  it('adds the official policy event when the vendor omits it and leaves other releases intact', () => {
    const cpi = { ...VENDOR, id: 'cpi', country: 'CA', name: 'CPI', actual: '0.2%' };
    const rows = policyCalendarEvents([cpi], FROM, TO, RELEASE + 60_000, rates([HOLD]));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === 'cpi')).toEqual(cpi);
    expect(rows.find((r) => r.id === HOLD.id)).toMatchObject({ actual: '4.00%', policyDecision: HOLD });
  });

  it('keeps an announced future-effective cut separate from the current effective level', () => {
    const cut: PolicyDecision = { ...HOLD, action: 'cut', changeBp: -25, lower: 3.5, upper: 3.75, effectiveDate: '2026-11-02' };
    policyRates.set(rates([cut]));
    expect(centralBanks(RELEASE + 60_000).find((b) => b.code === 'FED')).toMatchObject({ rate: 4, last: '2026-09-17', lastMove: -0.25 });
    expect(centralBanks(Date.parse('2026-11-02T05:00:00Z')).find((b) => b.code === 'FED')).toMatchObject({ rate: 3.75, last: '2026-11-02', lastMove: -0.25 });
    expect(policyCalendarEvents([VENDOR], FROM, TO, RELEASE + 60_000)[0]).toMatchObject({ actual: '3.75%', policyDecision: { effectiveDate: '2026-11-02' } });
  });

  it('uses a confirmed statement move amount when no prior daily series is available', () => {
    const cut: PolicyDecision = { ...HOLD, action: 'cut', changeBp: -25, upper: 3.75, lower: 3.5 };
    policyRates.set({ decisions: [cut] });
    expect(centralBanks(Date.parse('2026-10-29T12:00:00Z')).find((b) => b.code === 'FED')).toMatchObject({ rate: 3.75, last: '2026-10-29', lastMove: -0.25, real: true });
  });

  it('keeps the fallback calendar pending until that same statement is visible', () => {
    policyRates.set(rates([HOLD]));
    const pending = ecoEvents(FROM, TO, RELEASE + 1).find((e) => e.id === HOLD.id)!;
    expect(pending).toMatchObject({ policyStatus: 'awaiting-publication', actual: null });
    const confirmed = ecoEvents(FROM, TO, RELEASE + 60_000).find((e) => e.id === HOLD.id)!;
    expect(confirmed).toMatchObject({ policyStatus: 'confirmed', actual: 4, policyDecision: HOLD });
  });

  it('retains emergency Sunday timing and never attaches its actual to a nearby scheduled meeting', () => {
    const announcedAt = Date.parse('2020-03-15T21:00:00Z');
    const emergency: PolicyDecision = { ...HOLD, id: 'FED:2020-03-15', date: '2020-03-15', announcedAt, effectiveDate: '2020-03-16', retrievedAt: announcedAt + 60_000, action: 'cut', changeBp: -100, lower: 0, upper: 0.25, sourceUrl: HOLD.sourceUrl.replace('20261028', '20200315') };
    const rows = policyCalendarEvents([], Date.parse('2020-03-15T00:00:00Z'), Date.parse('2020-03-19T00:00:00Z'), announcedAt + 60_000, { fomc: ['2020-03-18'], decisions: [emergency] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: emergency.id, time: announcedAt, actual: '0.25%', policyStatus: 'confirmed' });
    expect(rows[1]).toMatchObject({ id: 'FED:2020-03-18', actual: '', policyStatus: 'scheduled' });
  });

  it('does not invent meetings after schedule coverage ends or turn an unchanged observation into HOLD', () => {
    expect(policyCalendarEvents([], Date.parse('2027-01-01T00:00:00Z'), Date.parse('2027-02-01T00:00:00Z'), Date.parse('2027-01-15T00:00:00Z'), rates())).toEqual([]);
    const flat = { ...OBS, asOf: '2026-10-29' };
    expect(rateDecision({ code: 'FED', rate: 4 }, HOLD.date, flat, [], Date.parse('2026-10-29T12:00:00Z'))).toMatchObject({ actual: null, observed: 4 });
  });
});
