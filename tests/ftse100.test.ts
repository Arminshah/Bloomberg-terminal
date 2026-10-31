import { describe, expect, it } from 'vitest';
import * as main from '../electron/index-members.cjs';
import * as providers from '../electron/providers.cjs';
import { annualFigures, constituentsSection, convertMoney, dailyFigures, dailyPath, htmlText, londonSymbols, parseFtseConstituents, statementsPath } from '../src/data/live/ftse100';
import { parseListing, yahooListingSymbol } from '../src/data/listings';
// Yahoo's answers of 30 October 2026, kept to what the app reads: the annual statement lines and share counts of
// British American Tobacco, HSBC (no gross profit) and Smiths Group (no figures for its 2025 balance sheet), and
// British American Tobacco's daily closes and dividends from 1 December 2025.
import STATEMENTS from './fixtures/yahoo-ftse100-statements-2026-10-30.json';
import BATS_DAILY from './fixtures/yahoo-bats-daily-2026-10-30.json';
// The MediaWiki API's answers of 30 October 2026 for Wikipedia's FTSE 100 Index article: its sections (titles and
// numbers only) and its Constituents section, kept to the heading and the table (Wikipedia's text is CC BY-SA).
import SECTIONS from './fixtures/wikipedia-ftse100-sections-2026-10-30.json?raw';
import CONSTITUENTS from './fixtures/wikipedia-ftse100-constituents-2026-10-30.json?raw';

describe("the FTSE 100's members from Wikipedia", () => {
  it('finds the section titled Constituents by its title, not its place', () => {
    expect(constituentsSection(SECTIONS)).toEqual({ index: '7' });
    // Moved: a section added above it changes its number, and the title still finds it.
    const moved = JSON.parse(SECTIONS);
    moved.parse.tocdata.sections.splice(1, 0, { line: 'Notes', index: '2' });
    moved.parse.tocdata.sections.forEach((s: { line: string; index: string }, i: number) => (s.index = String(i + 1)));
    expect(constituentsSection(JSON.stringify(moved))).toEqual({ index: '8' });
    // The older form of the answer (prop=sections) reads the same.
    expect(constituentsSection(JSON.stringify({ parse: { sections: [{ line: 'History', index: '1' }, { line: 'Constituents', index: '7' }] } }))).toEqual({ index: '7' });
    expect(constituentsSection(JSON.stringify({ parse: { tocdata: { sections: [{ line: 'Past constituents', index: '8' }] } } }))).toEqual({ error: expect.stringMatching(/no section titled Constituents/) });
    expect(constituentsSection(JSON.stringify({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } }))).toEqual({ error: "Wikipedia: The page you specified doesn't exist." });
    expect(constituentsSection('<html>')).toEqual({ error: expect.any(String) });
  });

  it('reads all 100 members with ticker, ISIN and ICB sector from the table', () => {
    const r = parseFtseConstituents(CONSTITUENTS);
    if ('error' in r) throw new Error(r.error);
    expect(r.data).toHaveLength(100);
    expect(r.data[0]).toEqual({ name: '3i', ticker: 'III', root: 'III', yahoo: 'III.L', isin: 'GB00B1YW4409', sector: 'Investment Banking and Brokerage Services' });
    expect(r.data.find((m) => m.isin === 'GB0002875804')).toEqual({ name: 'British American Tobacco', ticker: 'BATS', root: 'BATS', yahoo: 'BATS.L', isin: 'GB0002875804', sector: 'Tobacco' });
    // A share class in the ticker; names with entities decoded.
    expect(r.data.find((m) => m.name === 'BT Group')).toMatchObject({ ticker: 'BT.A', root: 'BT/A', yahoo: 'BT-A.L' });
    expect(r.data.find((m) => m.ticker === 'FCIT')!.name).toBe('F & C Investment Trust');
    expect(r.data.find((m) => m.ticker === 'STJ')!.name).toBe("St. James's Place");
    // Companies registered outside Britain keep their own ISINs.
    expect(r.data.find((m) => m.ticker === 'IAG')!.isin).toBe('ES0177542018');
    expect(new Set(r.data.map((m) => m.yahoo)).size).toBe(100);
    // The table's text names no review date once it is trimmed to the table.
    expect(r.asOf).toBeUndefined();
  });

  it('takes the review date from the text above the table, and refuses a broken table', () => {
    const j = JSON.parse(CONSTITUENTS);
    j.parse.text = j.parse.text.replace('<table', '<p>Members after the changes on 1 October 2026.</p><table');
    const r = parseFtseConstituents(JSON.stringify(j));
    expect('error' in r ? r.error : r.asOf).toBe('1 October 2026');
    const short = JSON.parse(CONSTITUENTS);
    const rows: string[] = short.parse.text.match(/<tr\b[\s\S]*?<\/tr>/g);
    short.parse.text = `<table>${rows.slice(0, 21).join('')}</table>`;
    expect(parseFtseConstituents(JSON.stringify(short))).toEqual({ error: "Wikipedia's FTSE 100 table has only 20 members." });
    expect(parseFtseConstituents(JSON.stringify({ parse: { text: '<table><tr><th>Year</th><th>Close</th></tr></table>' } }))).toEqual({ error: expect.stringMatching(/no table/) });
  });

  it("maps London tickers to the terminal's form and Yahoo's symbols", () => {
    expect(londonSymbols('BATS')).toEqual({ root: 'BATS', yahoo: 'BATS.L' });
    expect(londonSymbols('BT.A')).toEqual({ root: 'BT/A', yahoo: 'BT-A.L' });
    // The exchange writes some two-letter tickers with a trailing dot.
    expect(londonSymbols('RR.')).toEqual({ root: 'RR', yahoo: 'RR.L' });
    expect(londonSymbols(' iii ')).toEqual({ root: 'III', yahoo: 'III.L' });
    expect(londonSymbols('BT.AB')).toBeNull();
    expect(londonSymbols('')).toBeNull();
    // The app's own parsing of "BT/A LN" gives the same Yahoo symbol, so a row opens the same line.
    const listed = parseListing('BT/A LN')!;
    expect(yahooListingSymbol(listed.root, listed.listing)).toBe('BT-A.L');
    expect(htmlText('<a href="x">F &amp; C</a><sup>[1]</sup> &#39;s&nbsp;x')).toBe("F & C 's x");
  });

  it('asks the main process for the sections, then one section by its number', () => {
    expect(main.membersRequest('ftse100-sections')).toMatchObject({ provider: 'wikipedia', url: 'https://en.wikipedia.org/w/api.php?action=parse&page=FTSE_100_Index&prop=tocdata&format=json&formatversion=2' });
    expect(main.ftse100Request('7')?.url).toBe('https://en.wikipedia.org/w/api.php?action=parse&page=FTSE_100_Index&prop=text&section=7&format=json&formatversion=2');
    expect(main.ftse100Request('7')?.ttl).toBe(24 * 3_600_000);
    for (const bad of ['0', '100', '7&prop=wikitext', '../x', 7, '']) expect(main.ftse100Request(bad)).toBeNull();
  });

  it("counts the API's error answers as failures, so none is kept as the list", () => {
    expect(providers.providerPayloadProblem('wikipedia', JSON.stringify({ error: { code: 'nosuchsection', info: 'There is no section 9 in FTSE 100 Index.' } }))).toMatchObject({ kind: 'no-data' });
    expect(providers.providerPayloadProblem('wikipedia', JSON.stringify({ error: { code: 'ratelimited', info: "You've exceeded your rate limit." } }))).toMatchObject({ kind: 'rate-limited' });
    expect(providers.providerPayloadProblem('wikipedia', SECTIONS)).toBeNull();
  });
});

describe("the FTSE 100's figures from Yahoo", () => {
  const NOW = Date.UTC(2026, 9, 30, 18);

  it('asks for four years of the statement lines and the year so far of daily closes with dividends', () => {
    expect(statementsPath('BT-A.L', NOW)).toBe(`/ws/fundamentals-timeseries/v1/finance/timeseries/BT-A.L?symbol=BT-A.L&type=annualGrossProfit,annualTotalRevenue,annualNetIncomeCommonStockholders,annualCommonStockEquity,annualDilutedEPS,annualOrdinarySharesNumber,quarterlyOrdinarySharesNumber&period1=${NOW / 1000 - 4 * 365 * 86_400}&period2=${NOW / 1000}`);
    expect(dailyPath('BATS.L', NOW)).toBe(`/v8/finance/chart/BATS.L?interval=1d&period1=${Date.UTC(2025, 11, 1) / 1000}&period2=${NOW / 1000}&events=div`);
  });

  it("takes the latest fiscal year's lines, the year before's equity and the latest share count", () => {
    // British American Tobacco, FY2025 in pounds, as its annual report gives them in millions.
    expect(annualFigures(STATEMENTS['BATS.L'])).toEqual({
      end: '2025-12-31', currency: 'GBP',
      grossProfit: 21_384e6, revenue: 25_610e6, netIncome: 7_677e6, equity: 47_926e6,
      equityBefore: 49_643e6, beforeEnd: '2024-12-31',
      eps: 3.491, epsCurrency: 'GBP',
      // The half-year count of 30 June 2026 is later than the year-end one.
      shares: 2_159_189_751, sharesAt: '2026-06-30',
    });
    // A bank reports no gross profit: missing, not zero.
    const hsbc = annualFigures(STATEMENTS['HSBA.L']);
    expect(hsbc).toMatchObject({ end: '2025-12-31', currency: 'USD', revenue: 71_020e6, netIncome: 21_102e6, equityBefore: 184_973e6, eps: 1.2, epsCurrency: 'USD' });
    expect(hsbc.grossProfit).toBeNaN();
    // Smiths Group: Yahoo has no balance sheet for July 2025, so the year to July 2026 has no starting equity; the
    // one from July 2024, two years back, does not stand in for it.
    const smiths = annualFigures(STATEMENTS['SMIN.L']);
    expect(smiths).toMatchObject({ end: '2026-07-31', grossProfit: 808e6, revenue: 1_937e6, netIncome: 1_970e6, equity: 2_582e6 });
    expect(smiths.equityBefore).toBeNaN();
    expect(smiths.beforeEnd).toBeUndefined();
    // A line missing in the latest year is missing, never an older year's figure.
    const older = structuredClone(STATEMENTS['BATS.L']);
    for (const r of older.timeseries.result) if (r.meta.type[0] === 'annualGrossProfit') r.annualGrossProfit = r.annualGrossProfit!.slice(0, 3);
    expect(annualFigures(older).grossProfit).toBeNaN();
    expect(annualFigures(null)).toMatchObject({ revenue: NaN, shares: NaN });
  });

  it("works out the price, the previous close and the year's price and total returns from the daily chart", () => {
    const d = dailyFigures(BATS_DAILY, NOW)!;
    // Checked by hand on the same answer: last year's final close 4,214p on 31 December 2025, the latest 4,592p, the
    // close before 4,516p, and three dividends of 61.26p this year (the one of 29 December 2025 is last year's).
    expect(d).toMatchObject({ currency: 'GBp', last: 4592, lastDay: '2026-10-30', prev: 4516, prevDay: '2026-10-29', base: 4214, baseDay: '2025-12-31' });
    expect(d.dividends.map((x) => x.day)).toEqual(['2026-03-26', '2026-07-09', '2026-10-01']);
    expect(d.priceReturn).toBeCloseTo((4592 / 4214 - 1) * 100, 10);
    expect(d.priceReturn).toBeCloseTo(8.9701, 4);
    expect(d.totalReturn).toBeCloseTo(13.74, 4);
  });

  it("reinvests a dividend at the close of its ex-date, and has no return without last year's close", () => {
    // Synthetic: 1,000 at the end of 2025; a dividend of 50 goes ex on a day the price falls to 950, then 1,045.
    const day = (s: string) => Date.parse(`${s}T08:00:00Z`) / 1000;
    const chart = (days: string[], close: (number | null)[], dividends: Record<string, { amount: number; date: number }> = {}) => ({ chart: { result: [{ meta: { currency: 'GBp', gmtoffset: 0 }, timestamp: days.map(day), events: { dividends }, indicators: { quote: [{ close }] } }] } });
    const d = dailyFigures(chart(['2025-12-31', '2026-01-02', '2026-01-05', '2026-01-06'], [1000, 1000, 950, 1045], { x: { amount: 50, date: day('2026-01-05') } }), NOW)!;
    expect(d.totalReturn).toBeCloseTo(10, 10);
    expect(d.priceReturn).toBeCloseTo(4.5, 10);
    expect(d.prev).toBe(950);
    // A dividend going ex on a day without a close counts on the next one; empty closes are skipped.
    const gap = dailyFigures(chart(['2025-12-31', '2026-01-02', '2026-01-06'], [1000, null, 1045], { x: { amount: 50, date: day('2026-01-05') } }), NOW)!;
    expect(gap.totalReturn).toBeCloseTo(9.5, 10);
    expect(gap.prev).toBe(1000);
    // Listed this year: no base, so no return rather than one from its first day.
    const listed = dailyFigures(chart(['2026-03-02', '2026-03-03'], [500, 510]), NOW)!;
    expect(listed.last).toBe(510);
    expect(listed.priceReturn).toBeNaN();
    expect(listed.totalReturn).toBeNaN();
    expect(dailyFigures({ chart: { result: null } }, NOW)).toBeNull();
  });

  it('converts pence and pounds by 100 and other currencies only at a known rate', () => {
    const usd = (c: string) => ({ USD: 1, GBP: 1.25, EUR: 1.1 })[c] ?? NaN;
    expect(convertMoney(4592, 'GBp', 'GBP', usd)).toBeCloseTo(45.92, 10);
    expect(convertMoney(3.491, 'GBP', 'GBp', usd)).toBeCloseTo(349.1, 10);
    expect(convertMoney(100, 'USD', 'GBP', usd)).toBeCloseTo(80, 10);
    expect(convertMoney(100, 'GEL', 'GBP', usd)).toBeNaN();
    expect(convertMoney(100, undefined, 'GBP', usd)).toBeNaN();
    // Pence and pounds need no rate; pence to another currency go through pounds.
    expect(convertMoney(1277, 'GBp', 'GBP', () => NaN)).toBeCloseTo(12.77, 10);
    expect(convertMoney(1277, 'GBp', 'USD', usd)).toBeCloseTo(15.9625, 10);
    expect(convertMoney(80, 'USD', 'GBp', usd)).toBeCloseTo(6400, 10);
  });
});
