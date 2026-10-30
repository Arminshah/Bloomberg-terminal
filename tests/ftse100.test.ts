import { describe, expect, it } from 'vitest';
import * as main from '../electron/index-members.cjs';
import * as providers from '../electron/providers.cjs';
import { constituentsSection, htmlText, londonSymbols, parseFtseConstituents } from '../src/data/live/ftse100';
import { parseListing, yahooListingSymbol } from '../src/data/listings';
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
