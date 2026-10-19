import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { RealBadge, SimBadge } from '../components/Source';
import { fmtNum } from '../core/format';
import { centralBanks, newYorkDate } from '../data/eco';
import { fomcRows, fomcYears } from '../data/fomc';
import { policyRates } from '../data/live/policy';
import { engine, useTick } from '../data/market';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps, MenuItem } from '../terminal/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "January 28", as the terminal's FOMC table writes its announcement dates. */
function longDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

const RELATED: [string, string][] = [
  ['RATEPROBS', 'Fed funds futures implied probabilities'],
  ['CENTRALBANKS', 'Central bank rates and next decisions'],
  ['MONEYMARKET', 'Treasury and money markets'],
  ['RELEASES', 'Economic calendar'],
  ['NEWS CB', 'Central bank announcements'],
];

/**
 * FOMC: the year's scheduled announcement days from the Federal Reserve Board's calendar, each decided one with the
 * target range that took effect after it and the size of the move, from the New York Fed's daily series. Days the
 * series does not reach, and every past decision in the browser demo, show "--".
 */
export function FOMC(_: FnProps) {
  useTick(30);
  const panel = usePanelId();
  const fed = centralBanks().find((b) => b.code === 'FED');
  const rates = policyRates.use((r) => r);
  const meetings = fed?.meetings ?? [];
  const years = fomcYears(meetings);
  const today = newYorkDate(engine.now());
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(years.includes(thisYear) ? thisYear : (years[years.length - 1] ?? thisYear));
  // A handful of meetings a year: worked out on every render, so a newly loaded rate series shows at once.
  const rows = fomcRows(meetings.filter((m) => m.startsWith(String(year))), rates.fedLower, rates.fedUpper, today);
  const items: MenuItem[] = useMemo(() => RELATED.map(([cmd, label], i) => ({ n: 21 + i, label, run: () => execute(panel, cmd) })), [panel]);
  useMenu('fomc-related', items);
  const real = !!rates.fedUpper;
  const range = (lo: number, hi: number) => (Number.isFinite(hi) ? (Number.isFinite(lo) && lo !== hi ? `${fmtNum(lo, 2)} - ${fmtNum(hi, 2)}` : fmtNum(hi, 2)) : '--');
  return (
    <div>
      <FnHeader
        code="FEDMEETINGS"
        title="FOMC Announcement Dates"
        sub={
          real ? (
            <>
              <RealBadge /> Federal Reserve Board calendar · target range from the New York Fed
            </>
          ) : engine.realOnly ? (
            'Federal Reserve Board calendar · loading the target range from the New York Fed…'
          ) : (
            <>
              <SimBadge /> meeting calendar only; the browser demo has no record of past decisions
            </>
          )
        }
        tabs={years.map((y, i) => ({ n: i + 1, label: String(y) }))}
        tab={years.indexOf(year) + 1}
        onTab={(n) => setYear(years[n - 1])}
      />
      <table className="tbl">
        <thead>
          <tr>
            <th>Announcement Date</th>
            <th>Time</th>
            <th className="num" title="Target range for the federal funds rate in effect after the announcement">
              Rate (%)
            </th>
            <th className="num" title="Change of the upper bound at that meeting">
              Change (bp)
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                {engine.realOnly ? 'Loading the meeting calendar from the Federal Reserve Board…' : 'No meetings listed for this year.'}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.date} className={r.status === 'decided' ? '' : 'eco-ahead'}>
              <td className={r.status === 'decided' ? 'white' : 'amber'}>
                {longDate(r.date)}
              </td>
              <td>14:00 ET</td>
              <td className="num white">{range(r.lower, r.upper)}</td>
              <td className="num">
                {Number.isFinite(r.changeBp) ? <span className={r.changeBp > 0 ? 'up' : r.changeBp < 0 ? 'dn' : ''}>{r.changeBp > 0 ? `+${r.changeBp}` : r.changeBp}</span> : '--'}
              </td>
              <td className={r.status === 'today' ? 'yellow' : 'muted'}>{r.status === 'decided' ? 'Decided' : r.status === 'today' ? 'Today' : 'Scheduled'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Section title="Related Information">
        <div className="des-related" style={{ borderTop: 0 }}>
          {RELATED.map(([cmd, label], i) => (
            <button key={cmd} type="button" className="des-link" onClick={() => execute(panel, cmd)}>
              <b className="des-n">{21 + i})</b> {label}
            </button>
          ))}
        </div>
      </Section>
      <div className="note">
        Scheduled announcements are at 2:00 p.m. Eastern time. The related functions open with 21) to 25). Unscheduled meetings and notation votes are not listed.
        {real ? ` The target range series reaches ${rates.fedUpper!.asOf}.` : ''}
      </div>
    </div>
  );
}
