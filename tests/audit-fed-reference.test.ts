/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { CALENDAR, statementLinks, fedResponseMatches, discoverStatement, implementationDate, obtainFedReference, effectiveDateComparison } = require('../scripts/live/audit/fed-reference.cjs');
const { FED_PRESS_URLS } = require('../electron/official-feeds.cjs');

// Synthetic publisher-shaped documents exercise discovery and parsing only.
const TODAY = '2026-10-30';
const URL = 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm';
const NOTE = URL.replace('a.htm', 'a1.htm');
const body = (text: string, date = 'October 28, 2026') => `<p class="article__time">${date}</p><p>${text}</p>`;
const STATEMENT = body('The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.');
const implementation = (range = '3-3/4 to 4', date = 'October 29, 2026') => body(`The Board maintained IORB at 3.9 percent, effective October 28, 2026. Effective ${date}, the Federal Open Market Committee directs the Open Market Desk to: Undertake operations to maintain the federal funds rate in a target range of ${range} percent.`);
const rss = (link = URL) => `<rss><channel><item><title>A headline alone is no decision</title><link><![CDATA[${link}]]></link></item></channel></rss>`;
const ok = (text: string) => ({ ok: true, text });
const REF = { date: '2026-10-28', lower: 3.75, upper: 4, outcome: 'hold', sourceUrl: URL };

describe('independent official Fed reference discovery', () => {
  it('uses RSS only to discover a canonical link, then verifies both complete dated documents', async () => {
    const request = vi.fn(async (url: string) => url === CALENDAR ? { kind: 'network-or-access', detail: 'HTTP 403' } : url === FED_PRESS_URLS[0] ? ok(rss()) : url === URL ? ok(STATEMENT) : url === NOTE ? ok(implementation()) : { kind: 'no-data' });
    const result = await obtainFedReference(request, TODAY);
    expect(result).toMatchObject({ ok: true, reference: { ...REF, effectiveDate: '2026-10-29', implementationUrl: NOTE }, discovery: { discoveryUrl: FED_PRESS_URLS[0], attempts: [{ url: CALENDAR, detail: 'HTTP 403' }] } });
    expect(request.mock.calls.map(([url]) => url)).toEqual([CALENDAR, FED_PRESS_URLS[0], URL, NOTE]);
  });

  it('uses the calendar first and the monetary feed only when earlier discovery candidates fail', async () => {
    const request = vi.fn(async (url: string) => url === FED_PRESS_URLS[1] ? ok(rss()) : { kind: 'network-or-access', detail: 'HTTP 403' });
    expect(await discoverStatement(request, TODAY)).toMatchObject({ ok: true, discoveryUrl: FED_PRESS_URLS[1], url: URL });
    expect(request.mock.calls.map(([url]) => url)).toEqual([CALENDAR, ...FED_PRESS_URLS]);
    const calendar = vi.fn(async () => ok(`<a href="${URL}">Statement</a>`));
    expect(await discoverStatement(calendar, TODAY)).toMatchObject({ ok: true, discoveryUrl: CALENDAR });
    expect(calendar).toHaveBeenCalledTimes(1);
  });

  it('rejects future, implementation, invalid-date and external URLs in calendar and RSS markup', () => {
    const candidates = [URL.replace('20261028', '20261209'), NOTE, URL.replace('20261028', '20260230'), URL.replace('www.federalreserve.gov', 'www.federalreserve.gov.evil.example'), URL + '?source=anything'];
    expect(statementLinks(candidates.map((url) => `<a href="${url}">link</a>`).join('') + rss(), TODAY)).toEqual([URL]);
  });

  it('keeps malformed, empty and headline-only discovery blocked with every failure retained', async () => {
    const request = vi.fn(async (url: string) => url === CALENDAR ? { kind: 'network-or-access', detail: 'HTTP 403' } : url === FED_PRESS_URLS[0] ? ok('<html>Not RSS</html>') : ok('<rss><channel><item><title>Maintain rates at 4 percent</title></item></channel></rss>'));
    const result = await obtainFedReference(request, TODAY);
    expect(result.ok).toBeUndefined();
    expect(result.attempts).toHaveLength(3);
    for (const url of [CALENDAR, ...FED_PRESS_URLS]) expect(result.detail).toContain(url);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('does not turn a discovered headline into a pass when the full statement is unavailable or contradictory', async () => {
    const unavailable = vi.fn(async (url: string) => url === CALENDAR ? ok(`<a href="${URL}">The Committee maintained 3.75 to 4</a>`) : { kind: 'network-or-access', detail: 'HTTP 403' });
    expect(await obtainFedReference(unavailable, TODAY)).toMatchObject({ kind: 'network-or-access' });
    expect(unavailable).toHaveBeenCalledTimes(2);
    const contradictory = vi.fn(async (url: string) => url === CALENDAR ? ok(`<a href="${URL}">Statement</a>`) : ok(STATEMENT + body('The target range for the federal funds rate at 4 to 4.25 percent.')));
    expect(await obtainFedReference(contradictory, TODAY)).toMatchObject({ kind: 'malformed' });
    expect(contradictory).toHaveBeenCalledTimes(2);
  });

  it('requires the matching FOMC Desk effective date, never the Board IORB date or announcement plus one', () => {
    expect(implementationDate(implementation(), NOTE, REF)).toBe('2026-10-29');
    expect(implementationDate(implementation('3-3/4 to 4', 'November 2, 2026'), NOTE, REF)).toBe('2026-11-02');
    expect(implementationDate(body('The Board maintained IORB at 3.9 percent effective October 29, 2026. Maintain the target range for the federal funds rate at 3-3/4 to 4 percent.'), NOTE, REF)).toBeNull();
    expect(implementationDate(implementation('4 to 4.25'), NOTE, REF)).toBeNull();
    expect(implementationDate(implementation().replace('article__time">October 28', 'article__time">October 27'), NOTE, REF)).toBeNull();
    expect(implementationDate(implementation(), NOTE.replace('20261028', '20261029'), REF)).toBeNull();
  });

  it('keeps a refused or ambiguous implementation blocked after a valid statement', async () => {
    for (const note of [{ kind: 'network-or-access', detail: 'HTTP 403' }, ok(body('Implementation forthcoming'))]) {
      const request = vi.fn(async (url: string) => url === CALENDAR ? ok(`<a href="${URL}">Statement</a>`) : url === URL ? ok(STATEMENT) : note);
      expect((await obtainFedReference(request, TODAY)).ok).toBeUndefined();
      expect(request.mock.calls.map(([url]) => url)).toEqual([CALENDAR, URL, NOTE]);
    }
  });

  it('compares an explicitly captured effective date and leaves missing capture incomplete', () => {
    const ref = { ...REF, effectiveDate: '2026-10-29', implementationUrl: NOTE };
    expect(effectiveDateComparison({ effectiveDate: '2026-10-29' }, ref)).toMatchObject({ status: 'PASS', refName: NOTE });
    expect(effectiveDateComparison({ effectiveDate: '2026-10-30' }, ref)).toMatchObject({ status: 'FAIL', app: '2026-10-30', ref: '2026-10-29' });
    expect(effectiveDateComparison({}, ref)).toMatchObject({ status: 'INCOMPLETE' });
  });

  it('rejects conflicting or invalid visible and metadata publication dates in either document', async () => {
    const conflictingStatement = '<meta name="DC.date" content="2026-10-28">' + STATEMENT.replace('article__time">October 28', 'article__time">October 27');
    const request = vi.fn(async (url: string) => url === CALENDAR ? ok(`<a href="${URL}">Statement</a>`) : ok(conflictingStatement));
    expect(await obtainFedReference(request, TODAY)).toMatchObject({ kind: 'malformed' });
    expect(request).toHaveBeenCalledTimes(2);
    const conflictingNote = '<meta name="DC.date" content="2026-10-28">' + implementation().replace('article__time">October 28', 'article__time">October 27');
    expect(implementationDate(conflictingNote, NOTE, REF)).toBeNull();
    expect(implementationDate('<meta name="DC.date" content="2026-02-30">' + implementation(), NOTE, REF)).toBeNull();
    expect(implementationDate('<meta name="DC.date" content="invalid">' + implementation(), NOTE, REF)).toBeNull();
    expect(implementationDate('<meta name="DC.date" content="2026-10-28">' + implementation(), NOTE, REF)).toBe('2026-10-29');
  });

  it('accepts the explicit Desk paragraph with its immediately associated target list, not a target elsewhere', () => {
    const date = '<p class="article__time">October 28, 2026</p>';
    const direction = '<p>Effective October 29, 2026, the Federal Open Market Committee directs the Open Market Desk to:</p>';
    const target = '<ul><li>Undertake operations to maintain the federal funds rate in a target range of 3-3/4 to 4 percent.</li></ul>';
    expect(implementationDate(date + direction + target, NOTE, REF)).toBe('2026-10-29');
    expect(implementationDate(date + target + direction + '<ul><li>Conduct an unrelated operation.</li></ul>', NOTE, REF)).toBeNull();
    expect(implementationDate(date + direction + '<p>Unrelated text separates these blocks.</p>' + target, NOTE, REF)).toBeNull();
    expect(implementationDate(date + body('Maintain the target range for the federal funds rate at 4 to 4.25 percent.') + direction + target, NOTE, REF)).toBeNull();
  });

  it('requires the actual transport response to retain the exact official canonical document', () => {
    expect(fedResponseMatches(URL, URL)).toBe(true);
    expect(fedResponseMatches(URL, URL.replace('www.federalreserve.gov', 'federalreserve.gov'))).toBe(true);
    for (const actual of [undefined, '', URL.replace('www.federalreserve.gov', 'evil.example'), URL.replace('20261028', '20261029'), NOTE, URL + '?token=anything', URL.replace('https:', 'http:')]) expect(fedResponseMatches(URL, actual)).toBe(false);
    expect(fedResponseMatches(CALENDAR, FED_PRESS_URLS[0])).toBe(false);
    expect(fedResponseMatches(FED_PRESS_URLS[0], FED_PRESS_URLS[0])).toBe(true);
  });
});
