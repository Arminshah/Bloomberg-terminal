import { describe, expect, it } from 'vitest';
import type { FinPeriod } from '../src/data/fundamentals';
import { epsText, fiscalGrid, fiscalQuarterOf, fiscalYearOf, revenueText } from '../src/data/fiscal-grid';

const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const p = (end: string, rev: number, eps: number) => ({ label: end, end: at(end), rev, eps }) as FinPeriod;

// DES's Revenue & EPS page (TE01 02:31): FY and Q1 to Q4 by fiscal year, reported, else estimated.
describe('fiscal years and quarters', () => {
  it('places a period in its fiscal year and quarter for any year end', () => {
    // Apple: the year ends in late September; the quarter ending in December is the next year's first.
    expect(fiscalYearOf(at('2025-12-27'), 9)).toBe(2026);
    expect(fiscalQuarterOf(at('2025-12-27'), 9)).toBe(1);
    expect(fiscalYearOf(at('2025-09-27'), 9)).toBe(2025);
    expect(fiscalQuarterOf(at('2025-09-27'), 9)).toBe(4);
    expect(fiscalQuarterOf(at('2025-06-28'), 9)).toBe(3);
    // A 52-53 week year ending a few days into October still belongs to the September year.
    expect(fiscalYearOf(at('2024-10-03'), 9)).toBe(2024);
    // A calendar year.
    expect(fiscalYearOf(at('2025-03-31'), 12)).toBe(2025);
    expect(fiscalQuarterOf(at('2025-03-31'), 12)).toBe(1);
    expect(fiscalQuarterOf(at('2025-12-31'), 12)).toBe(4);
  });

  it('fills six fiscal years with reported figures, and estimates where nothing is reported', () => {
    const annual = [p('2023-12-31', 307394, 5.8), p('2024-12-31', 350018, 8.04)];
    const quarterly = [p('2025-03-31', 90234, 2.81), p('2025-06-30', 96428, 2.31)];
    const g = fiscalGrid(annual, quarterly, 12, (x) => x.rev, [{ year: 2025, value: 400000 }, { year: 2024, value: 1 }]);
    expect(g.years).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
    expect(g.cells.FY.slice(3)).toEqual([{ value: 307394, estimate: false }, { value: 350018, estimate: false }, { value: 400000, estimate: true }]);
    expect(g.cells.Q1[5]).toEqual({ value: 90234, estimate: false });
    expect(g.cells.Q3[5]).toBeNull();
    expect(g.cells.FY[0]).toBeNull();
  });

  it('writes revenue in billions and EPS as the page does', () => {
    expect(revenueText(131_800)).toBe('131.8B');
    expect(revenueText(512.25)).toBe('512.3M');
    expect(epsText(0.541)).toBe('.541');
    expect(epsText(-0.4)).toBe('-.400');
    expect(epsText(2.33)).toBe('2.33');
    expect(epsText(NaN)).toBe('');
  });
});
