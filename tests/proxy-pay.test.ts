import { describe, expect, it } from 'vitest';
import { amount, parseSummaryCompensation, splitNameTitle } from '../electron/proxy-pay.cjs';
import { executiveRows, sameName } from '../src/functions/MGMT';
import type { Officer } from '../src/data/live/yfund';
import type { Person } from '../src/data/live/insiders';

// The layouts proxy statements use (Applied Digital, Apple, Coca-Cola, 2025-2026): name and title on separate rows or
// in one cell, a title over two rows, dollar signs and footnote marks in cells of their own, dashes for zero.
const td = (...cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
const PROXY = `<p>Summary Compensation Table</p><p>The following table sets forth...</p>
<table>
${td('Name and Principal Position(s)', 'Year', 'Salary <sup>(1)</sup>', 'Bonus', 'Stock Awards (2)', 'All Other Compensation (3)', 'Total')}
${td('Wes Cummins', '2026', '$', '875,000', '$', '1,200,000', '$', '185,900,249', '$', '1,242,271', '$', '189,217,520')}
${td('Chief Executive Officer and Chairman', '2025', '706,251', '1,500,000', '25,462,000', '39,841', '27,708,092')}
${td('', '2024', '600,000', '600,000', '&#8212;', '37,002', '1,237,002')}
${td('Jason Zhang (4)', '2026', '688,279', '&#8212;', '99,325,997', '21,069', '100,035,346')}
${td('President and Co-Founder', '2025', '-', '-', '-', '-', '-')}
${td('Kate Adams Senior Vice President, General Counsel', '2026', '1,000,000', '&#8203;', '22,009,766', '22,482', '(4)(6)', '27,032,248')}
${td('James Quincey (2)', '2026', '1,675,000', '0', '12,516,109', '1,108,486', '31,208,165')}
${td('Chairman of the Board and', '2025', '1,656,250', '0', '9,549,022', '8,588,282', '28,002,284')}
${td('Chief Executive Officer', '2024', '1,600,000', '0', '8,299,550', '7,217,020', '24,742,908')}
</table>`;

describe('Executive pay from the proxy statement', () => {
  it("reads each named executive's title, salary and total by year", () => {
    const people = parseSummaryCompensation(PROXY)!;
    expect(people.map((p) => p.name)).toEqual(['Wes Cummins', 'Jason Zhang', 'Kate Adams', 'James Quincey']);
    expect(people[0]).toEqual({ name: 'Wes Cummins', title: 'Chief Executive Officer and Chairman', years: [{ year: 2026, salary: 875_000, total: 189_217_520 }, { year: 2025, salary: 706_251, total: 27_708_092 }, { year: 2024, salary: 600_000, total: 1_237_002 }] });
    // A year of dashes: not a named executive that year.
    expect(people[1].years).toEqual([{ year: 2026, salary: 688_279, total: 100_035_346 }]);
    expect(people[2]).toMatchObject({ title: 'Senior Vice President, General Counsel', years: [{ year: 2026, total: 27_032_248 }] });
    expect(people[3].title).toBe('Chairman of the Board and Chief Executive Officer');
    expect(parseSummaryCompensation('<p>Summary Compensation Table</p><table><tr><td>Director</td><td>Fees</td></tr></table>')).toBeNull();
    expect(amount('1,234')).toBe(1234);
    expect(amount('—')).toBe(0);
    expect(splitNameTitle('Tim Cook Chief Executive Officer')).toEqual({ name: 'Tim Cook', title: 'Chief Executive Officer' });
  });

  it("matches the proxy's executives to Yahoo's officers and the Form 4 filers, largest pay first", () => {
    expect(sameName('Saidal Mohmand', 'Mohammad Saidal L. Mohmand')).toBe(true);
    expect(sameName('Wes Cummins', 'Mr. Wesley Cummins')).toBe(true);
    expect(sameName('Mark Cummins', 'Wesley Cummins')).toBe(false);
    expect(sameName('Kate Adams', 'Katherine L. Adams')).toBe(true);
    expect(sameName('Bob Iger', 'Robert A. Iger')).toBe(true);
    const officer = (name: string, title: string, age = NaN): Officer => ({ name, title, age, yearBorn: NaN, totalPay: NaN, exercised: NaN, unexercised: NaN, fiscalYear: NaN });
    const officers = [officer('Wesley Cummins', 'Chairman, CEO, Secretary & Treasurer', 47), officer('Mohammad Saidal L. Mohmand', 'Chief Financial Officer', 34), officer('Nick Phillips', 'Executive Vice President of External Affairs')];
    const executives = [
      { name: 'Saidal Mohmand', title: 'Chief Financial Officer', years: [{ year: 2026, salary: 525_000, total: 40_480_906 }, { year: 2025, salary: 369_792, total: 9_787_555 }] },
      { name: 'Wes Cummins', title: 'Chief Executive Officer and Chairman', years: [{ year: 2026, salary: 875_000, total: 189_217_520 }] },
    ];
    const filer = { owner: { name: 'Wes Cummins', secName: 'CUMMINS WES' }, heldAfter: 5_874_453, netShares: 1_414_469 } as unknown as Person;
    const rows = executiveRows(officers, executives, [filer]);
    expect(rows.map((r) => r.name)).toEqual(['Wesley Cummins', 'Mohammad Saidal L. Mohmand', 'Nick Phillips']);
    expect(rows[0]).toMatchObject({ title: 'Chairman, CEO, Secretary & Treasurer', age: 47, pay: { year: 2026, total: 189_217_520 } });
    expect(rows[0].person?.heldAfter).toBe(5_874_453);
    expect(rows[1].pay).toMatchObject({ total: 40_480_906, previous: 9_787_555 });
    expect(rows[2].pay).toBeUndefined();
  });
});
