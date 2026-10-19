import { FnHeader } from '../components/FnHeader';
import { RowNo } from '../components/Numbered';
import { fmtDay, fmtTime, WEEKDAYS } from '../core/format';
import { useInterval } from '../data/market';
import { EXCHANGES, exchangeStatus, fmtCountdown, type Exchange, type ExchangeStatus } from '../data/exchanges';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const STATE_CLASS: Record<ExchangeStatus['state'], string> = { OPEN: 'up', CLOSED: 'white', HOLIDAY: 'dn', WEEKEND: 'muted' };

const dayOf = (iso: string) => `${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${fmtDay(Date.parse(`${iso}T00:00:00Z`))}`;

/** The weekday and time of a moment in the exchange's own zone: "Tue 09:30". */
function localAt(ms: number, tz: string): string {
  if (!Number.isFinite(ms)) return '--';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('hour')}:${get('minute')}`;
}

/**
 * EXCH: the regular trading session of each exchange the app keeps a calendar for, with its local time, whether it
 * is open, a holiday or early close today, and when it next opens or closes. Typing a row's number opens that
 * exchange's holiday calendar (HOLIDAYS).
 */
export function EXCH(_: FnProps) {
  useInterval(1000);
  const panel = usePanelId();
  const now = Date.now();
  const open = (ex: Exchange) => execute(panel, `HOLIDAYS ${ex.id}`);
  const nums = useNumberedRows('exch-rows', EXCHANGES, 1, open, (ex) => ex.name);
  const rows = EXCHANGES.map((ex) => ({ ex, s: exchangeStatus(ex, now) }));
  const openCount = rows.filter((r) => r.s.state === 'OPEN').length;
  return (
    <div>
      <FnHeader code="EXCHANGES" title="Exchange Hours" sub={`${openCount} of ${rows.length} open now · regular sessions in each exchange's own time · your times in the display time zone`} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Exchange</th>
            <th className="hide-m">City</th>
            <th className="num">Local time</th>
            <th>Status</th>
            <th className="num">Session</th>
            <th>Next</th>
            <th className="num">In</th>
            <th className="num hide-m">Your time</th>
            <th className="hide-m">Today</th>
            <th className="hide-m">Calendar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ ex, s }, i) => {
            const next = Number.isFinite(s.nextAt) ? (s.state === 'OPEN' ? 'Closes' : 'Opens') : 'No session in 3 weeks';
            const session = `${ex.open}-${s.earlyClose && s.state === 'OPEN' ? s.earlyClose : ex.close}`;
            return (
              <tr key={ex.id} className="click" onClick={() => open(ex)} title={`${ex.name}: ${ex.source}. Click, or type ${nums[i]} and GO, for the holiday calendar.`}>
                <td>
                  <RowNo n={nums[i]} />
                  <span className="amber">{ex.label}</span> <span className="hide-m">{ex.name}</span>
                </td>
                <td className="hide-m">{ex.city}</td>
                <td className="num white" title={dayOf(s.localDate)}>
                  {s.localTime}
                </td>
                <td className={STATE_CLASS[s.state]}>
                  {s.state}
                  {s.state === 'OPEN' && s.earlyClose ? <span className="amber"> · early close</span> : null}
                </td>
                <td className="num" title="Regular session, local time; pre-market, after-hours and auctions are not included">
                  {session}
                </td>
                <td>
                  {next}
                  {Number.isFinite(s.nextAt) ? <span className="muted"> {localAt(s.nextAt, ex.tz)}</span> : null}
                  {s.state !== 'OPEN' && s.earlyClose ? <span className="amber"> (closes {s.earlyClose})</span> : null}
                </td>
                <td className={`num ${s.state === 'OPEN' ? 'up' : 'white'}`}>{fmtCountdown(s.nextAt - now)}</td>
                <td className="num hide-m">{Number.isFinite(s.nextAt) ? fmtTime(s.nextAt, false) : '--'}</td>
                <td className="hide-m">{s.today ? <span className={s.today.close ? 'amber' : 'dn'}>{s.today.name}</span> : <span className="muted">{s.state === 'WEEKEND' ? 'Weekend' : 'Regular day'}</span>}</td>
                <td className="hide-m">
                  {s.uncovered ? <span className="amber">Table ends {ex.through}: holidays after it not known</span> : <span className="muted">{ex.through ? `Published table to ${ex.through}` : 'Published rules'}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">
        Regular sessions only, from each exchange&apos;s published hours, holiday rules and tables (HOLIDAYS shows the sources). Pre-market and after-hours trading, auctions and closures announced at short notice are not
        included. The top bar&apos;s market timers use the same calendars.
      </p>
    </div>
  );
}
