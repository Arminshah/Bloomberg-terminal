import { afterEach, describe, expect, it } from 'vitest';
import { BLS_RELEASE_OF, blsReleaseTimes, parseBlsSchedule, type BlsRelease } from '../src/data/live/bls-schedule';
import { fredData } from '../src/data/live/fred';
import { ecoEvents } from '../src/data/eco';
import { engine } from '../src/data/market';
import mainSource from '../electron/main.cjs?raw';
// The BLS's release calendar as www.bls.gov sent it on 31 October 2026, trimmed to five releases in October to
// December 2026.
import ICS from './fixtures/bls-schedule-2026-10-31.ics?raw';

const releases = (() => {
  const r = parseBlsSchedule(ICS);
  if ('error' in r) throw new Error(r.error);
  return r;
})();

describe("the BLS's release schedule", () => {
  it('is asked from bls.gov with the SEC_USER_AGENT contact, and not at all without one', () => {
    expect(mainSource).toContain("blsSchedule: () => 'https://www.bls.gov/schedule/news_release/bls.ics'");
    const branch = mainSource.slice(mainSource.indexOf("if (source === 'blsSchedule')"), mainSource.indexOf("if (source === 'newsSec')"));
    expect(branch).toContain("providers.credential('SEC_USER_AGENT').value");
    expect(branch).toContain("return { status: 0, text: '', missing: 'SEC_USER_AGENT' }");
    expect(branch).toContain("'User-Agent': agent");
  });

  it('reads each release with its day and time in New York', () => {
    expect(releases).toHaveLength(14);
    expect(releases).toContainEqual({ name: 'Employment Situation', date: '2026-11-06', time: '08:30' });
    expect(releases).toContainEqual({ name: 'Job Openings and Labor Turnover Survey', date: '2026-11-03', time: '10:00' });
    expect(releases).toContainEqual({ name: 'Consumer Price Index', date: '2026-12-10', time: '08:30' });
  });

  it('unfolds long lines, unescapes the summary, and names a page that is not the calendar', () => {
    const folded = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:20261106T083000\r\nSUMMARY:Productivity and Costs\\, Revised\r\n  (Quarterly)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    expect(parseBlsSchedule(folded)).toEqual([{ name: 'Productivity and Costs, Revised (Quarterly)', date: '2026-11-06', time: '08:30' }]);
    expect(parseBlsSchedule('<html>Access Denied</html>')).toEqual({ error: 'The BLS did not send its release calendar.' });
    expect(parseBlsSchedule('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual({ error: 'The BLS release calendar had no releases.' });
  });

  it("keeps the times of the four BLS releases ECO shows, under FRED's release ids", () => {
    const times = blsReleaseTimes(releases);
    expect(Object.keys(times).map(Number).sort((a, b) => a - b)).toEqual(Object.keys(BLS_RELEASE_OF).map(Number).sort((a, b) => a - b));
    expect(times[50]).toEqual({ '2026-10-02': '08:30', '2026-11-06': '08:30', '2026-12-04': '08:30' });
    expect(times[192]).toEqual({ '2026-11-03': '10:00', '2026-12-01': '10:00' });
    expect(times[10]['2026-11-10']).toBe('08:30');
    expect(times[46]['2026-11-13']).toBe('08:30');
  });
});

describe("ECO's US releases with the BLS's times", () => {
  const was = { realOnly: engine.realOnly, state: fredData.get() };
  afterEach(() => {
    engine.realOnly = was.realOnly;
    fredData.set(() => was.state);
  });

  it("puts a release at the BLS's time in New York on the BLS's day, and leaves the others to their date", () => {
    engine.realOnly = true;
    const times: Record<number, Record<string, string>> = blsReleaseTimes(releases as BlsRelease[]);
    fredData.set((s) => ({ ...s, releases: { 50: ['2026-10-02', '2026-11-06'], 10: ['2026-11-10'], 9: ['2026-11-17'], 192: ['2026-11-04'] }, releaseTimes: times }));
    const events = ecoEvents(Date.UTC(2026, 8, 28), Date.UTC(2026, 10, 20), Date.UTC(2026, 9, 31));
    const at = (id: string) => events.find((e) => e.id === id)!;
    // 08:30 in New York: 12:30 UTC in daylight saving time (2 October), 13:30 UTC after it ends (6 November).
    expect(at('US:Change in Nonfarm Payrolls:2026-10-02')).toMatchObject({ time: Date.UTC(2026, 9, 2, 12, 30), timeFrom: 'BLS release schedule' });
    expect(at('US:Change in Nonfarm Payrolls:2026-11-06')).toMatchObject({ time: Date.UTC(2026, 10, 6, 13, 30) });
    expect(at('US:Change in Nonfarm Payrolls:2026-11-06').date).toBeUndefined();
    expect(at('US:Unemployment Rate:2026-11-06').time).toBe(Date.UTC(2026, 10, 6, 13, 30));
    expect(at('US:CPI MoM:2026-11-10').time).toBe(Date.UTC(2026, 10, 10, 13, 30));
    // Retail sales are the Census Bureau's: no BLS time, the date only.
    expect(at('US:Retail Sales Advance MoM:2026-11-17')).toMatchObject({ date: '2026-11-17', time: Date.UTC(2026, 10, 17, 12) });
    expect(at('US:Retail Sales Advance MoM:2026-11-17').timeFrom).toBeUndefined();
    // A FRED day the BLS does not list for that release (JOLTS on 4 November; the BLS says the 3rd) gets no time.
    expect(at('US:JOLTS Job Openings:2026-11-04')).toMatchObject({ date: '2026-11-04' });
  });
});
