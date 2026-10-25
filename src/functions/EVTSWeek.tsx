import { useMemo } from 'react';
import { fmtBig, fmtDay, fmtNum, fmtTime, WEEKDAYS } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { latestSession, localDate, marketDay, US_MARKET } from '../data/exchanges';
import { isoDay, type CalendarReport, type MarketCalendar } from '../data/live/earnings-calendar';
import { MEGA_CAP, MegaTag, surprise, Ticker } from './EVTSMarket';

/**
 * The week's most relevant earnings releases, by day and session, as earnings sites lay them out: each day's
 * companies before the open and after the close, the most traded first. The market trades a company in proportion to
 * how much attention it gets, so the dollars traded in the latest session (Nasdaq's stock list) rank the companies:
 * the largest ones and the ones investors are watching come first, a small bank nobody trades does not.
 */

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Companies shown per day before the open and after the close; the rest are counted. */
export const PER_SLOT = 10;
/** Companies shown per day for other times (during the session, or no time given): fewer, they matter less. */
export const PER_OTHER = 5;

/**
 * The Monday (YYYY-MM-DD, New York's date) of the week EVTS opens on, `offset` weeks later or earlier: this week on a
 * weekday, the coming one at a weekend.
 */
export function weekStart(now: number, offset = 0): string {
  const t = ms(localDate(US_MARKET, now));
  const wd = new Date(t).getUTCDay();
  const toMonday = wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd;
  return isoDay(t + (toMonday + 7 * offset) * DAY_MS);
}

export type WeekSession = 'pre' | 'post' | 'other';

export interface WeekSlot {
  reports: CalendarReport[];
  /** How many more of the day's companies report in this session. */
  more: number;
}

export interface WeekDay {
  date: string;
  /** The market's holiday that day, when it is closed. */
  holiday?: string;
  /** Every company reporting that day (share classes once). */
  total: number;
  pre: WeekSlot;
  post: WeekSlot;
  other: WeekSlot;
}

const sessionOf = (r: CalendarReport): WeekSession => (r.timing === 'Bef-mkt' ? 'pre' : r.timing === 'Aft-mkt' ? 'post' : 'other');

/** One company however many share classes it lists (GOOG and GOOGL are both "Alphabet Inc."). */
const companyKey = (r: CalendarReport) =>
  r.name
    .toLowerCase()
    .replace(/\b(class|series) [a-z]\b|\b(common|capital|ordinary|subordinate voting) (stock|shares?)\b/g, '')
    .replace(/[^a-z0-9]/g, '') || r.symbol;

/** The most traded first; a company without trading figures by its market value, after those with them. */
export function byRelevance(a: CalendarReport, b: CalendarReport): number {
  const t = (r: CalendarReport) => (ok(r.traded) ? r.traded : -1);
  const c = (r: CalendarReport) => (ok(r.marketCap) ? r.marketCap : -1);
  return t(b) - t(a) || c(b) - c(a) || a.symbol.localeCompare(b.symbol);
}

/** The week from `monday` to Friday: each day's companies by session, the most relevant first. */
export function topReleases(reports: CalendarReport[], monday: string, perSlot = PER_SLOT): WeekDay[] {
  return [0, 1, 2, 3, 4].map((k) => {
    const date = isoDay(ms(monday) + k * DAY_MS);
    const seen = new Set<string>();
    const ofDay = reports
      .filter((r) => r.date === date)
      .sort(byRelevance)
      .filter((r) => {
        const key = companyKey(r);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const slot = (s: WeekSession): WeekSlot => {
      const all = ofDay.filter((r) => sessionOf(r) === s);
      const n = s === 'other' ? Math.min(perSlot, PER_OTHER) : perSlot;
      return { reports: all.slice(0, n), more: Math.max(0, all.length - n) };
    };
    const special = marketDay(US_MARKET, date);
    return { date, ...(special && !special.close ? { holiday: special.name } : {}), total: ofDay.length, pre: slot('pre'), post: slot('post'), other: slot('other') };
  });
}

const SESSIONS: { key: WeekSession; label: string; title: string }[] = [
  { key: 'pre', label: 'Before open', title: 'Reporting before the market opens' },
  { key: 'post', label: 'After close', title: 'Reporting after the market closes' },
  { key: 'other', label: 'Other times', title: 'During the session, or the calendar gives no time' },
];

/** What a company's line says: the EPS surprise once reported (one source), else the EPS expected. */
function figure(r: CalendarReport): { text: string; cls: string; title: string } {
  const from = r.eps.estFrom ? ` (${r.eps.estFrom})` : '';
  if (ok(r.eps.actual)) {
    const s = r.eps.estFrom === r.eps.actualFrom ? surprise(r.eps) : NaN;
    if (ok(s)) return { text: `${s > 0 ? '+' : ''}${fmtNum(s, Math.abs(s) < 99.95 ? 1 : 0)}%`, cls: s > 0.05 ? 'up' : s < -0.05 ? 'dn' : '', title: `EPS ${fmtNum(r.eps.actual, 2)} against ${fmtNum(r.eps.est, 2)} expected${from}` };
    return { text: fmtNum(r.eps.actual, 2), cls: 'white', title: `EPS reported${r.eps.actualFrom ? ` (${r.eps.actualFrom})` : ''}` };
  }
  if (ok(r.eps.est)) return { text: fmtNum(r.eps.est, 2), cls: 'muted', title: `EPS expected${from}` };
  return { text: '', cls: '', title: '' };
}

function Line({ r }: { r: CalendarReport }) {
  const f = figure(r);
  const traded = ok(r.traded) ? `${fmtBig(r.traded)} USD traded in the latest session` : 'no trading figure in Nasdaq’s stock list';
  return (
    <li title={`${r.name} · ${traded}${ok(r.marketCap) ? ` · market value ${fmtBig(r.marketCap)} USD` : ''}${f.title ? ` · ${f.title}` : ''}`}>
      <Ticker symbol={r.symbol} />
      {ok(r.marketCap) && r.marketCap >= MEGA_CAP ? <MegaTag /> : null}
      <span className="evts-week-name">{r.name}</span>
      <span className={`evts-week-fig ${f.cls}`}>{f.text}</span>
    </li>
  );
}

export function TopReleases({ cal, monday, now }: { cal: MarketCalendar; monday: string; now: number }) {
  const days = useMemo(() => topReleases(cal.reports, monday), [cal.reports, monday]);
  const today = localDate(US_MARKET, now);
  const session = latestSession(US_MARKET, now);
  const total = days.reduce((a, d) => a + d.total, 0);
  // Without Nasdaq's stock list there is no trading figure: the companies then go by market value.
  const traded = cal.reports.some((r) => ok(r.traded));
  const shownSessions = SESSIONS.filter((s) => s.key !== 'other' || days.some((d) => d.other.reports.length));
  const empty = cal.loading ? `Loading the week's calendar: ${cal.days - cal.loading} of ${cal.days} days…` : cal.calendarProblems.length ? cal.calendarProblems.join(' ') : 'No reports this week.';
  return (
    <div>
      {!total ? (
        <div className="empty">{empty}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl evts-week">
            <colgroup>
              <col className="evts-week-label" />
              {days.map((d) => (
                <col key={d.date} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d.date} className={d.date === today ? 'evts-week-today' : undefined}>
                    {WEEKDAYS[new Date(ms(d.date)).getUTCDay()]} {fmtDay(ms(d.date))}
                    {d.date === today ? ' · TODAY' : ''}
                    <div className="muted evts-week-count">{d.holiday ? `Market closed: ${d.holiday}` : `${d.total} ${d.total === 1 ? 'report' : 'reports'}`}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownSessions.map((s) => (
                <tr key={s.key}>
                  <th scope="row" className="evts-week-session" title={s.title}>
                    {s.label}
                  </th>
                  {days.map((d) => {
                    const slot = d[s.key];
                    return (
                      <td key={d.date} className={d.date < session ? 'evts-week-past' : undefined}>
                        {slot.reports.length ? (
                          <ol className="evts-week-list">
                            {slot.reports.map((r) => (
                              <Line key={r.symbol} r={r} />
                            ))}
                          </ol>
                        ) : null}
                        {slot.more ? <div className="muted evts-week-more" title="14) Market lists every company">+{slot.more} more</div> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="note">
        <div>
          <span className="amber">Ranking</span>{' '}
          {traded || !total ? (
            <>
              The {PER_SLOT} most traded companies of each day before the open and after the close ({PER_OTHER} at other times): dollars traded in the latest session (last price × shares traded) in Nasdaq&apos;s stock list
              {ok(cal.listingsAt) ? `, read ${fmtDay(cal.listingsAt)} ${fmtTime(cal.listingsAt, false)}` : ''}.
            </>
          ) : (
            <span className="amber">Nasdaq&apos;s stock list has not loaded, so there are no trading figures: the largest companies by market value are shown instead.</span>
          )}{' '}
          Share classes count once. {total} {total === 1 ? 'company reports' : 'companies report'} this week; 14) Market lists every one.
        </div>
        <div>
          <span className="amber">Reading</span> Before a report: the EPS expected · after it: reported against expected, <span className="up">green</span> beat, <span className="dn">red</span> missed · hover a company for its figures and sources
        </div>
        <div>
          <span className="amber">Sources</span> Nasdaq earnings calendar: dates, sessions, EPS{cal.revenueFrom.length ? ` · ${cal.revenueFrom.join(', ')}: revenue` : ''}
          {cal.loading ? <span className="amber"> · loading {cal.days - cal.loading} of {cal.days} days…</span> : null}
        </div>
      </div>
    </div>
  );
}

/** "Week of 26/10/26": a week tab's name. */
export const weekLabel = (monday: string) => `Week of ${fmtDay(ms(monday))}`;

