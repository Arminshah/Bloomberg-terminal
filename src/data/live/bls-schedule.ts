/**
 * The BLS's release schedule (www.bls.gov/schedule/news_release/bls.ics; electron/main.cjs, official 'blsSchedule'):
 * every scheduled BLS news release of this year and the last with its date and time in New York. FRED gives the
 * dates of the same releases without a time, so ECO takes the time from here where the BLS lists the release on
 * FRED's date. bls.gov refuses automated clients that do not name a contact; the app sends SEC_USER_AGENT's.
 */

export interface BlsRelease {
  /** The release as the BLS names it: "Employment Situation". */
  name: string;
  /** Its day in New York (ISO) and time there ("08:30"). */
  date: string;
  time: string;
}

/** The ECO releases the BLS publishes, by FRED release id, under the BLS's own names. */
export const BLS_RELEASE_OF: Record<number, string> = {
  50: 'Employment Situation',
  10: 'Consumer Price Index',
  46: 'Producer Price Index',
  192: 'Job Openings and Labor Turnover Survey',
};

/** The calendar's events: unfolded lines, the summary unescaped, the start in the BLS's US-Eastern zone. */
export function parseBlsSchedule(text: string): BlsRelease[] | { error: string } {
  if (!/^BEGIN:VCALENDAR/m.test(text)) return { error: 'The BLS did not send its release calendar.' };
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const out: BlsRelease[] = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const start = /^DTSTART;TZID=US-Eastern:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}$/m.exec(block);
    const summary = /^SUMMARY:(.*)$/m.exec(block);
    if (!start || !summary) continue;
    const name = summary[1].replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').trim();
    out.push({ name, date: `${start[1]}-${start[2]}-${start[3]}`, time: `${start[4]}:${start[5]}` });
  }
  return out.length ? out : { error: 'The BLS release calendar had no releases.' };
}

/** FRED release id → day → the BLS's time in New York, for the releases ECO shows. */
export function blsReleaseTimes(releases: BlsRelease[]): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {};
  for (const [rid, name] of Object.entries(BLS_RELEASE_OF)) {
    for (const r of releases) if (r.name === name) (out[Number(rid)] ??= {})[r.date] = r.time;
  }
  return out;
}
