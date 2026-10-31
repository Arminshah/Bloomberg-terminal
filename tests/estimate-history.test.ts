import { describe, expect, it } from 'vitest';
import * as main from '../electron/estimate-history.cjs';
import { parseHistory, periodMonth } from '../src/data/live/estimate-history';
import { mergeConsensus } from '../src/data/live/consensus';
import type { FinPeriod } from '../src/data/fundamentals';

// The shape of Zacks' earnings calendar page: the tables are JavaScript arrays in the page (APLD, October 2026).
const ZACKS = `<html><script>
var obj_data = {
    "earnings_announcements_earnings_table"   :
             [  [ "10/7/26", "8/2026", "-$0.26", "-$0.76", "<div class=\\"right pos negative\\">-0.50</div>", "<div>-192.31%</div>", "After Close" ] ,  [ "7/27/26", "5/2026", "-$0.18", "-$0.39", "-0.21", "-116.67%", "After Close" ] ]
                ,
    "earnings_announcements_sales_table"      :
             [  [ "10/7/26", "8/2026", "$134.10", "$341.88", "<div class=\\"up\\">+207.78</div>", "<div>+154.94%</div>", "After Close" ] ,  [ "7/27/26", "5/2026", "$99.34", "$240.35", "+141.01", "+141.95%", "After Close" ], [ "1/16/24", "11/2023", "$54.78", "$42.20", "-12.58", "-22.96%", "Before Open" ] ]
                ,
    "earnings_announcements_guidance_table"   :  [ ] ,
  };</script></html>`;

// MarketBeat's earnings history table (APLD, October 2026), with its coming report marked "(Estimated)".
const row = (date: string, q: string, est: string, eps: string, revEst: string, rev: string) =>
  `<tr><td data-sort-value="1">${date}</td><td>${q}</td><td>${est}</td><td>${eps}</td><td class="c-green">+$0.28</td><td>-$0.82</td><td>${revEst}</td><td>${rev}</td><td><a href="/x/">x</a></td></tr>`;
const MARKETBEAT = `<html><table class="scroll-table" id="earnings-history"><thead><tr><th data-sort="int">Date</th><th>Quarter</th><th data-sort="float">Consensus Estimate</th><th data-sort="float">Reported EPS</th><th data-sort="float">Beat/Miss</th><th data-sort="float">GAAP EPS</th><th data-sort="float">Revenue Estimate</th><th data-sort="float">Actual Revenue</th><th>Details</th></tr></thead><tbody>
<tr><td> 1/6/2027<br/>(Estimated)</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
${row('10/7/2026', 'Q1 2027', '-$0.2954', '-$0.01', '$116.29M', '$300.39M')}
${row('7/27/2026', 'Q4 2026', '-$0.0917', '-$0.39', '$96.85M', '$240.35M')}
${row('10/9/2025', 'Q1 2026', '-$0.11', '-$0.03', '$52.25M', '$64.22M')}
${row('6/25/2026', 'Q2 2026', '$1.53', '$1.62', '$68.13B', '$68.13B')}
</tbody></table></html>`;

// Finviz's quote page embeds its chart's events as JSON (APLD and its coming report, October 2026): seconds since 1970.
const FINVIZ = `<script>var data = {"ticker":"APLD","chartEvents":[{"dateTimestamp":1767821400,"eventType":"chartEvent/earnings","fiscalPeriod":"2025Q2","fiscalEndDate":1764478800,"epsActual":-0.07,"epsEstimate":-0.1218,"salesActual":126.588,"salesEstimate":89.6519},{"dateTimestamp":1770000000,"eventType":"chartEvent/ratings","rating":"Buy"},{"dateTimestamp":1791405000,"eventType":"chartEvent/earnings","fiscalPeriod":"2026Q1","fiscalEndDate":1788148800,"epsActual":-0.82,"epsEstimate":-0.2954,"salesActual":341.875,"salesEstimate":116.2886},{"dateTimestamp":1799274600,"eventType":"chartEvent/earnings","fiscalPeriod":"2026Q2","fiscalEndDate":1796014800,"epsEstimate":-0.17,"salesEstimate":180.5}]};</script>`;

const statement = (end: string, rev: number) => ({ label: end, end: Date.parse(`${end}T00:00:00Z`), rev }) as unknown as FinPeriod;

describe('Earnings history pages', () => {
  it("reads Zacks' two tables as quarters, revenue in dollars", () => {
    const p = main.parseZacks(ZACKS)!;
    expect(p.source).toBe('Zacks');
    expect(p.sales[0]).toEqual({ date: '2026-10-07', period: '2026-08', est: 134.1e6, actual: 341.88e6, timing: 'Aft-mkt' });
    expect(p.sales[2]).toMatchObject({ date: '2024-01-16', period: '2023-11', timing: 'Bef-mkt' });
    expect(p.eps[0]).toMatchObject({ est: -0.26, actual: -0.76 });
    expect(p.eps).toHaveLength(2);
    // The bot protection page, or an unknown ticker, has neither table.
    expect(main.parseZacks('<html><title>Pardon Our Interruption</title></html>')).toBeNull();
    expect(main.zacksUrl('APLD')).toBe('https://www.zacks.com/stock/research/APLD/earnings-calendar');
    expect(main.zacksUrl('BRK-B')).toBe('https://www.zacks.com/stock/research/BRK.B/earnings-calendar');
    expect(main.zacksUrl('apld; rm')).toBeNull();
  });

  it("reads MarketBeat's history table by fiscal quarter, skipping the estimated coming report", () => {
    const p = main.parseMarketBeat(MARKETBEAT)!;
    expect(p.source).toBe('MarketBeat');
    expect(p.sales).toHaveLength(4);
    expect(p.sales[0]).toEqual({ date: '2026-10-07', period: '', label: 'Q1 2027', est: 116_290_000, actual: 300_390_000 });
    expect(p.eps[0]).toMatchObject({ label: 'Q1 2027', est: -0.2954, actual: -0.01 });
    // Whole dollars: "$68.13B" is 68,130,000,000.
    expect(p.sales[3].est).toBe(68_130_000_000);
    expect(main.parseMarketBeat('<html><table><thead><tr><th>Date</th></tr></thead></table></html>')).toBeNull();
    expect(main.marketbeatUrl('APLD')).toBe('https://www.marketbeat.com/stocks/NASDAQ/APLD/earnings/');
    expect(main.marketbeatUrl('../x')).toBeNull();
  });

  it("reads Finviz's earnings events: New York dates and sessions, quarter ends, revenue and EPS", () => {
    const p = main.parseFinviz(FINVIZ)!;
    expect(p.source).toBe('Finviz');
    expect(p.eps[1]).toEqual({ date: '2026-10-07', period: '2026-08', end: '2026-08-31', est: -0.2954, actual: -0.82, timing: 'Aft-mkt', basis: 'unknown', unit: 'per-share', dataset: 'Finviz chartEvents EPS comparison', sourceUrl: 'https://finviz.com/', scheduledAt: 1791405000000 });
    expect(p.eps[0]).toMatchObject({ date: '2027-01-06', est: -0.17 });
    expect(p.sales).toHaveLength(3);
    expect(p.sales[1]).toEqual({ date: '2026-10-07', period: '2026-08', end: '2026-08-31', est: 116_288_600, actual: 341_875_000, timing: 'Aft-mkt' });
    expect(p.sales[2]).toMatchObject({ date: '2026-01-07', end: '2025-11-30', est: 89_651_900, actual: 126_588_000 });
    // The coming report: the estimate only.
    expect(p.sales[0]).toMatchObject({ date: '2027-01-06', end: '2026-11-30', est: 180_500_000 });
    expect(p.sales[0].actual).toBeNaN();
    expect(main.parseFinviz('<html>no events</html>')).toBeNull();
    expect(main.finvizUrl('BRK.B')).toBe('https://finviz.com/quote.ashx?t=BRK-B&p=d');
    expect(main.finvizUrl('a b')).toBeNull();
  });

  it('parses the figures the main process sends, in order, and nothing else', () => {
    const [h, z] = parseHistory(JSON.stringify([main.parseFinviz(FINVIZ), main.parseZacks(ZACKS)]))!;
    expect(h.source).toBe('Finviz');
    expect(z.sales[0]).toEqual({ date: '2026-10-07', period: '2026-08', est: 134.1e6, actual: 341.88e6, timing: 'Aft-mkt', basis: 'unknown' });
    expect(parseHistory(JSON.stringify([{ source: 'Other', eps: [], sales: [{ date: '2026-01-01', period: '2025-12', est: 1, actual: 1 }] }]))).toBeNull();
    expect(parseHistory(JSON.stringify(main.parseZacks(ZACKS)))).toBeNull();
    expect(parseHistory('not json')).toBeNull();
    // Apple's 52-week year: the quarter ending 3 January belongs to December.
    expect(periodMonth('2026-01-03')).toBe('2025-12');
    expect(periodMonth('2026-08-31')).toBe('2026-08');
  });

  it("fills past quarters' expected revenue and adds the quarters no other source gives (Zacks)", () => {
    const history = parseHistory(JSON.stringify([main.parseZacks(ZACKS)]))!;
    const c = mergeConsensus({ history, fye: 5, statements: [statement('2026-08-31', 341.88), statement('2026-05-31', 240.35)], statementCcy: 'USD', now: Date.parse('2026-10-21') });
    const q1 = c.past.find((q) => q.label === 'Q1 2027')!;
    expect(q1.rev).toMatchObject({ est: 134.1e6, actual: 341.88e6, estFrom: 'Zacks', actualFrom: 'Zacks' });
    expect(q1.revComparisons).toEqual(expect.arrayContaining([expect.objectContaining({ actual: 341.88e6, actualFrom: 'statements' })]));
    expect(q1.eps).toMatchObject({ est: -0.26, actual: -0.76, estFrom: 'Zacks' });
    expect(q1.timing).toBe('Aft-mkt');
    expect(c.past.find((q) => q.label === 'Q4 2026')!.rev.est).toBe(99.34e6);
    // A quarter only Zacks gives keeps Zacks' own reported revenue.
    expect(c.past.find((q) => q.label === 'Q2 2024')!.rev).toMatchObject({ est: 54.78e6, actual: 42.2e6, actualFrom: 'Zacks' });
  });

  it('matches MarketBeat quarters by fiscal quarter and keeps each complete provider pair separate from filings', () => {
    const history = parseHistory(JSON.stringify([main.parseMarketBeat(MARKETBEAT)]))!;
    const c = mergeConsensus({ history, fye: 5, statements: [statement('2026-08-31', 341.88), statement('2026-05-31', 240.35)], statementCcy: 'USD', now: Date.parse('2026-10-21') });
    const q1 = c.past.find((q) => q.label === 'Q1 2027')!;
    expect(q1.end).toBe('2026-08-31');
    expect(q1.rev).toMatchObject({ est: 116.29e6, actual: 300.39e6, estFrom: 'MarketBeat', actualFrom: 'MarketBeat' });
    expect(q1.revComparisons).toEqual(expect.arrayContaining([expect.objectContaining({ actual: 341.88e6, actualFrom: 'statements' })]));
    expect(c.past.find((q) => q.label === 'Q1 2026')!.rev).toMatchObject({ est: 52.25e6, actual: 64.22e6 });
    // "Q2 2026" reported in June does not fit a fiscal year ending in May (its quarter ended in November): left out.
    expect(c.past.some((q) => q.label === 'Q2 2026')).toBe(false);
    expect(c.past.filter((q) => q.label === 'Q4 2026')).toHaveLength(1);
    expect(c.past.find((q) => q.label === 'Q4 2026')!.rev.est).toBe(96.85e6);
  });

  it("uses Finviz first, the older quarters from the next source, and the coming quarter's revenue estimate", () => {
    const history = parseHistory(JSON.stringify([main.parseFinviz(FINVIZ), main.parseMarketBeat(MARKETBEAT)]))!;
    const c = mergeConsensus({ history, fye: 5, statements: [statement('2026-08-31', 341.88), statement('2026-05-31', 258.75)], statementCcy: 'USD', now: Date.parse('2026-10-21') });
    const q1 = c.past.find((q) => q.label === 'Q1 2027')!;
    expect(q1.rev).toMatchObject({ est: 116_288_600, actual: 341_875_000, estFrom: 'Finviz', actualFrom: 'Finviz' });
    expect(q1.revComparisons).toEqual(expect.arrayContaining([expect.objectContaining({ actual: 341.88e6, actualFrom: 'statements' }), expect.objectContaining({ est: 116.29e6, actual: 300.39e6, actualFrom: 'MarketBeat' })]));
    // Finviz's own EPS comparison comes first.
    expect(q1.eps).toMatchObject({ est: -0.2954, actual: -0.82, estFrom: 'Finviz', actualFrom: 'Finviz' });
    expect(q1.timing).toBe('Aft-mkt');
    expect(c.past.find((q) => q.label === 'Q2 2026')!.rev).toMatchObject({ est: 89_651_900, actual: 126_588_000, estFrom: 'Finviz' });
    expect(c.past.find((q) => q.label === 'Q4 2026')!.rev).toMatchObject({ est: 96.85e6, actual: 240.35e6, estFrom: 'MarketBeat', actualFrom: 'MarketBeat' });
    expect(c.past.find((q) => q.label === 'Q4 2026')!.revComparisons).toEqual(expect.arrayContaining([expect.objectContaining({ actual: 258.75e6, actualFrom: 'statements' })]));
    // The coming report is not a past quarter; it is the next one, with its revenue estimate.
    expect(c.past.some((q) => q.label === 'Q2 2027')).toBe(false);
    expect(c.next).toMatchObject({ label: 'Q2 2027', end: '2026-11-30' });
    expect(c.next!.rev).toMatchObject({ est: 180_500_000, estFrom: 'Finviz' });
  });

  it('retains a provider pair without joining it to statement values of a different magnitude or currency', () => {
    const history = parseHistory(JSON.stringify([main.parseZacks(ZACKS)]))!;
    const c = mergeConsensus({ history, fye: 5, statements: [statement('2026-08-31', 34188)], statementCcy: 'USD' });
    const q = c.past.find((q) => q.label === 'Q1 2027')!;
    expect(q.rev).toMatchObject({ est: 134.1e6, actual: 341.88e6, actualFrom: 'Zacks' });
    expect(q.revComparisons).toEqual(expect.arrayContaining([expect.objectContaining({ actual: 34188e6, actualFrom: 'statements' })]));
    const eur = mergeConsensus({ history, fye: 5, statements: [], statementCcy: 'EUR' });
    expect(eur.past.find((q) => q.label === 'Q1 2027')!.rev).toMatchObject({ est: 134.1e6, actual: 341.88e6, actualFrom: 'Zacks' });
    expect(eur.past.find((q) => q.label === 'Q1 2027')!.rev.ccy).toBeUndefined();
  });
});
