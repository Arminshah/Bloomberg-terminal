import { describe, expect, it } from 'vitest';
import calendar from './fixtures/fomc-calendar.html?raw';
import { fedStatementLinks, parseFedDecision } from '../src/data/live/policy-decisions';

// Synthetic documents exercise the publisher's formats. They are not evidence of actual policy decisions.
const URL = 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm';
const NOW = Date.parse('2026-10-28T18:03:00Z');
const statement = (body: string, date = 'October 28, 2026', when = 'For release at 2:00 p.m. EDT') => `<main><p class="article__time">${date}</p><p>${when}</p><h3>Federal Reserve issues FOMC statement</h3><p>${body}</p></main>`;
const HOLD = 'In support of its goals, the Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.';
const note = (effective = 'October 29, 2026', range = '3-3/4 to 4') => `<p class="article__time">October 28, 2026</p><p>The Board of Governors voted to maintain the interest rate paid on reserve balances at 3.9 percent, effective October 29, 2026.</p><p>Effective ${effective}, the Federal Open Market Committee directs the Desk to:</p><ul><li>Undertake open market operations as necessary to maintain the federal funds rate in a target range of ${range} percent.</li></ul>`;

describe('published Fed policy decisions', () => {
  it('confirms a same-day hold directly from the statement without a next-day rate observation', () => {
    expect(parseFedDecision(statement(HOLD), note(), URL, NOW)).toEqual({
      id: 'FED:2026-10-28', bank: 'FED', date: '2026-10-28', announcedAt: Date.parse('2026-10-28T18:00:00Z'),
      effectiveDate: '2026-10-29', lower: 3.75, upper: 4, changeBp: 0, action: 'hold', status: 'confirmed',
      sourceUrl: URL, implementationUrl: URL.replace('a.htm', 'a1.htm'), retrievedAt: NOW,
    });
  });

  it('preserves a future effective date without changing the announcement time or assuming next day', () => {
    expect(parseFedDecision(statement('The Committee decided to lower the target range for the federal funds rate by 1/4 percentage point to 3-1/2 to 3-3/4 percent.'), note('November 2, 2026', '3-1/2 to 3-3/4'), URL, NOW)).toMatchObject({
      action: 'cut', changeBp: -25, lower: 3.5, upper: 3.75, effectiveDate: '2026-11-02', announcedAt: Date.parse('2026-10-28T18:00:00Z'),
    });
  });

  it('handles decimal rates, basis points, HTML fractions and numeric entities', () => {
    const hike = 'The Committee decided to raise the target range for the federal funds rate by 25 basis points to 4.00 to 4.25 percent.';
    expect(parseFedDecision(statement(hike), '', URL, NOW)).toMatchObject({ action: 'hike', changeBp: 25, lower: 4, upper: 4.25 });
    const fractional = 'The Committee decided to maintain the target range for the federal funds rate at 3&frac34; to 4 percent.';
    expect(parseFedDecision(statement(fractional), '', URL, NOW)).toMatchObject({ action: 'hold', lower: 3.75, upper: 4 });
    expect(parseFedDecision(statement(fractional.replace('&frac34;', '&#190;')), '', URL, NOW)).toMatchObject({ lower: 3.75 });
    expect(parseFedDecision(statement('The Committee decided to maintain the target range for the federal funds rate at zero to 1/4 percent.'), '', URL, NOW)).toMatchObject({ lower: 0, upper: 0.25 });
  });

  it('reads emergency weekend release times and leaves immediate-release times unknown', () => {
    const url = 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20200315a.htm';
    const now = Date.parse('2020-03-15T21:01:00Z');
    const body = 'The Committee decided to lower the target range for the federal funds rate by 1 percentage point to 0 to 1/4 percent.';
    expect(parseFedDecision(statement(body, 'March 15, 2020', 'For release at 5:00 p.m. EDT'), '', url, now)).toMatchObject({ announcedAt: Date.parse('2020-03-15T21:00:00Z'), action: 'cut', changeBp: -100 });
    const immediate = parseFedDecision(statement(body, 'March 15, 2020', 'For immediate release'), '', url, now);
    expect(immediate).toMatchObject({ timeUnknown: true, date: '2020-03-15' });
    expect(immediate?.announcedAt).toBeUndefined();
    expect(immediate?.effectiveDate).toBeUndefined();
  });

  it('converts winter Eastern time and does not invent a 14:00 timestamp when absent', () => {
    const url = URL.replace('20261028', '20261209');
    const now = Date.parse('2026-12-09T20:01:00Z');
    expect(parseFedDecision(statement(HOLD, 'December 9, 2026', 'For release at 2:00 p.m. EST'), '', url, now)?.announcedAt).toBe(Date.parse('2026-12-09T19:00:00Z'));
    expect(parseFedDecision(statement(HOLD, 'December 9, 2026', ''), '', url, now)).toMatchObject({ timeUnknown: true });
  });

  it('rejects future release instants, future publication dates, invalid dates and source/date mismatches', () => {
    expect(parseFedDecision(statement(HOLD), note(), URL, NOW, Date.parse('2026-10-28T17:59:59Z'))).toBeUndefined();
    expect(parseFedDecision(statement(HOLD), note(), URL, Date.parse('2026-10-28T17:59:59Z'), NOW)).toBeUndefined();
    expect(parseFedDecision(statement(HOLD, 'October 29, 2026'), '', URL.replace('20261028', '20261029'), NOW)).toBeUndefined();
    expect(parseFedDecision(statement(HOLD, 'October 27, 2026'), '', URL, NOW)).toBeUndefined();
    expect(parseFedDecision(statement(HOLD, 'February 30, 2026'), '', URL.replace('20261028', '20260230'), NOW)).toBeUndefined();
    expect(parseFedDecision(statement(HOLD), '', URL.replace('www.federalreserve.gov', 'example.org'), NOW)).toBeUndefined();
    expect(parseFedDecision(statement(HOLD), '', URL.replace('a.htm', 'a1.htm'), NOW)).toBeUndefined();
  });

  it('does not infer a hold from an unchanged-looking number or classify an unrelated action', () => {
    const neutral = 'The target range for the federal funds rate is at 3.75 to 4 percent. The Committee decided to maintain its holdings of securities.';
    expect(parseFedDecision(statement(neutral), '', URL, NOW)).toMatchObject({ action: 'unknown', upper: 4 });
    expect(parseFedDecision(statement(neutral), '', URL, NOW)?.changeBp).toBeUndefined();
    expect(parseFedDecision(statement('The Board decided to maintain the interest rate paid on reserve balances at 3.9 percent.'), '', URL, NOW)).toBeUndefined();
  });

  it('rejects conflicting targets and never promotes implementation evidence with a different rate', () => {
    expect(parseFedDecision(statement(`${HOLD} The target range for the federal funds rate at 4 to 4.25 percent.`), '', URL, NOW)).toBeUndefined();
    expect(parseFedDecision(statement(HOLD.replace('3-3/4 to 4', '4.25 to 4')), '', URL, NOW)).toBeUndefined();
    const mismatch = parseFedDecision(statement(HOLD), note('October 29, 2026', '4 to 4.25'), URL, NOW);
    expect(mismatch).toMatchObject({ action: 'hold', upper: 4 });
    expect(mismatch?.effectiveDate).toBeUndefined();
    expect(mismatch?.implementationUrl).toBeUndefined();
  });

  it('does not borrow an IORB effective date or a date from a different statement', () => {
    const iorb = '<p class="article__time">October 28, 2026</p><p>The Board voted to maintain IORB at 3.9 percent effective October 29, 2026.</p><p>Maintain the federal funds rate in a target range of 3-3/4 to 4 percent.</p>';
    expect(parseFedDecision(statement(HOLD), iorb, URL, NOW)?.effectiveDate).toBeUndefined();
    expect(parseFedDecision(statement(HOLD), note().replace('class="article__time">October 28', 'class="article__time">October 27'), URL, NOW)?.effectiveDate).toBeUndefined();
  });

  it('supports a historical single target without fabricating a lower bound', () => {
    const decision = parseFedDecision(statement('The Committee decided to lower the federal funds rate target to 5 percent.', 'January 22, 2008', 'For release at 8:20 a.m. EST'), '', URL.replace('20261028', '20080122'), Date.parse('2008-01-22T14:00:00Z'));
    expect(decision).toMatchObject({ upper: 5, action: 'cut' });
    expect(decision?.lower).toBeUndefined();
  });

  it('honors the publication metadata date and ignores executable markup', () => {
    const html = `<meta content="2026-10-28" name="DC.date"><script>throw new Error('Do not execute');</script>${statement(HOLD)}`;
    expect(parseFedDecision(html, '', URL, NOW)).toMatchObject({ action: 'hold', lower: 3.75 });
  });
});

describe('official statement discovery', () => {
  it('discovers only published statement HTML and matching implementation notes from the calendar', () => {
    const links = fedStatementLinks(calendar);
    expect(links.find((x) => x.date === '2026-01-28')).toEqual({ date: '2026-01-28', statementPath: '/newsevents/pressreleases/monetary20260128a.htm', implementationPath: '/newsevents/pressreleases/monetary20260128a1.htm' });
    // This fixture was captured before the October statement appeared. The scheduled date is no statement.
    expect(links.some((x) => x.date === '2026-10-28')).toBe(false);
    expect(links.every((x) => /a\.htm$/.test(x.statementPath))).toBe(true);
  });

  it('discovers unscheduled statements from RSS and rejects untrusted hosts, ports and other document types', () => {
    const rss = `<rss><channel><item><link>${URL}</link></item><item><link><![CDATA[${URL.replace('20261028', '20200315')}]]></link></item></channel></rss>`;
    const hostile = `<a href="https://www.federalreserve.gov.evil.example/newsevents/pressreleases/monetary20261028a.htm">bad</a><a href="http://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm">bad</a><a href="https://www.federalreserve.gov:444/newsevents/pressreleases/monetary20261028a.htm">bad</a><a href="${URL.replace('a.htm', 'b.htm')}">strategy</a>`;
    expect(fedStatementLinks(rss + hostile).map((x) => x.date)).toEqual(['2020-03-15', '2026-10-28']);
    expect(fedStatementLinks(hostile)).toEqual([]);
  });
});
