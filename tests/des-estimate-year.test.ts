import { describe, expect, it } from 'vitest';
import { fiscalEstimates } from '../src/functions/DESEquity';
import type { AnalystPart, Estimate } from '../src/data/live/analysts';

const est = (date: string, epsAvg: number) => ({ date, epsAvg, revenueAvg: NaN, revenueLow: NaN, revenueHigh: NaN, epsLow: NaN, epsHigh: NaN, netIncomeAvg: NaN }) as Estimate;
const part: AnalystPart<Estimate[]> = { state: 'ok', source: 'FMP', data: [est('2017-12-31', 2.9), est('2018-12-31', 3.07), est('2019-12-31', 3.2), est('2020-12-31', 3.4)] };
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("PROFILE's Est P/E year", () => {
  it('stays on a year that has ended until its results are in the statements, as the capture of 31 January 2019', () => {
    // Statements end with 2017; 2018 had ended but was not reported until February 2019.
    expect(fiscalEstimates(part, day('2017-12-31'), day('2019-01-31'))).toMatchObject({ fy: { date: '2018-12-31' }, next: { date: '2019-12-31' } });
  });

  it('moves on once that year is reported', () => {
    expect(fiscalEstimates(part, day('2018-12-31'), day('2019-02-28')).fy?.date).toBe('2019-12-31');
    // A 52-week year can end a few days before the estimate's date.
    expect(fiscalEstimates(part, day('2018-12-29'), day('2019-02-28')).fy?.date).toBe('2019-12-31');
  });

  it('counts from today without statements, and never takes a year ended more than a year ago', () => {
    expect(fiscalEstimates(part, NaN, day('2019-01-31')).fy?.date).toBe('2019-12-31');
    // Statements stuck at 2016 do not bring back 2017's estimate in 2019.
    expect(fiscalEstimates(part, day('2016-12-31'), day('2019-01-31')).fy?.date).toBe('2018-12-31');
  });
});
