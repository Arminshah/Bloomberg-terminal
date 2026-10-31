// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo } from 'react';
import { fmtBig, fmtDay, fmtNum, fmtTime } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { latestSession, localDate, marketDay, US_MARKET } from '../data/exchanges';
import { isoDay, requestYahooFacts, type CalendarReport, type MarketCalendar } from '../data/live/earnings-calendar';
import { MEGA_CAP, MegaTag, surprise, Ticker } from './EVTSMarket';

/**
 * The week's most relevant earnings releases as earnings sites lay them out: a column a day, each split into the
 * companies reporting before the open and after the close, a few each, the most traded first. The market trades a
 * company in proportion to how much attention it gets, so the dollars traded in the latest session rank the companies
 * (Nasdaq's stock list, or Yahoo Finance's quotes when that list does not load): the largest ones and the ones
 * investors are watching come first, a small bank nobody trades does not.
 */

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Companies shown per day before the open and after the close; the rest are counted. */
export const PER_SLOT = 6;
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

/** A company's name as people say it: "Verizon Communications", "Coca-Cola", not "… Inc." or "Company (The)". */
export function shortName(name: string, symbol: string): string {
  let n = name.trim();
  if (!n || n.toUpperCase() === symbol.toUpperCase()) return '';
  const suffix = /(?:,?\s+|\s*\(|\/)(?:inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|l\.?p|n\.?v|s\.?a\.?b\.? de c\.?v|s\.?a|a\.?g|s\.?e|holdings?|group|the)\.?\)?$/i;
  for (let k = 0; k < 4 && suffix.test(n); k++) n = n.replace(suffix, '').trim();
  n = n.replace(/\s+(?:and|&)$/i, '').replace(/^the\s+/i, '').trim();
  return n || name.trim();
}

/** The week's most relevant companies across its days and sessions, each once. */
export function weekLeaders(days: WeekDay[], n = 5): { r: CalendarReport; date: string; session: WeekSession }[] {
  const all = days.flatMap((d) => (['pre', 'post', 'other'] as const).flatMap((s) => d[s].reports.map((r) => ({ r, date: d.date, session: s }))));
  return all.sort((a, b) => byRelevance(a.r, b.r)).slice(0, n);
}

const SLOTS: { key: 'pre' | 'post'; label: string; title: string }[] = [
  { key: 'pre', label: 'Before open', title: 'Reporting before the market opens' },
  { key: 'post', label: 'After close', title: 'Reporting after the market closes' },
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** What a company's tile says under its name: the EPS surprise once reported (one source), else the EPS expected. */
function figure(r: CalendarReport): { text: string; cls: string; title: string } {
  const from = r.eps.estFrom ? ` (${r.eps.estFrom})` : '';
  if (ok(r.eps.actual)) {
    const s = r.eps.estFrom === r.eps.actualFrom ? surprise(r.eps) : NaN;
    if (ok(s)) return { text: `${s > 0 ? '+' : ''}${fmtNum(s, Math.abs(s) < 99.95 ? 1 : 0)}%`, cls: s > 0.05 ? 'up' : s < -0.05 ? 'dn' : '', title: `EPS ${fmtNum(r.eps.actual, 2)} against ${fmtNum(r.eps.est, 2)} expected${from}` };
    return { text: `EPS ${fmtNum(r.eps.actual, 2)}`, cls: 'white', title: `EPS reported${r.eps.actualFrom ? ` (${r.eps.actualFrom})` : ''}` };
  }
  if (ok(r.eps.est)) return { text: `EPS ${fmtNum(r.eps.est, 2)}`, cls: 'muted', title: `EPS expected${from}` };
  return { text: '', cls: '', title: '' };
}

/** The revenue line under it: the surprise once reported (one source), else the revenue reported or expected. */
export function revenue(r: CalendarReport): { text: string; cls: string; title: string } {
  const from = r.rev.estFrom ? ` (${r.rev.estFrom})` : '';
  if (ok(r.rev.actual)) {
    const s = r.rev.estFrom === r.rev.actualFrom ? surprise(r.rev) : NaN;
    if (ok(s)) return { text: `Rev ${s > 0 ? '+' : ''}${fmtNum(s, Math.abs(s) < 99.95 ? 1 : 0)}%`, cls: s > 0.05 ? 'up' : s < -0.05 ? 'dn' : '', title: `revenue ${fmtBig(r.rev.actual)} against ${fmtBig(r.rev.est)} expected${from}` };
    return { text: `Rev ${fmtBig(r.rev.actual)}`, cls: 'white', title: `revenue reported${r.rev.actualFrom ? ` (${r.rev.actualFrom})` : ''}` };
  }
  if (ok(r.rev.est)) return { text: `Rev ${fmtBig(r.rev.est)}`, cls: 'muted', title: `revenue expected${from}` };
  return { text: 'Rev --', cls: 'muted', title: 'no revenue estimate from the calendars' };
}

function Tile({ r }: { r: CalendarReport }) {
  const f = figure(r);
  const rv = revenue(r);
  const name = shortName(r.name, r.symbol);
  const traded = ok(r.traded) ? `${fmtBig(r.traded)} USD traded in the latest session` : 'no trading figure';
  const title = `${r.name || r.symbol} (${r.symbol} US) · ${traded}${ok(r.marketCap) ? ` · market value ${fmtBig(r.marketCap)} USD` : ''}${f.title ? ` · ${f.title}` : ''} · ${rv.title} · click to open`;
  return (
    <Ticker symbol={r.symbol} className="evts-tile" title={title}>
      <span className="evts-tile-name">{name || r.symbol}</span>
      <span className="evts-tile-sub">
        <span className="amber">{r.symbol}</span>
        {ok(r.marketCap) && r.marketCap >= MEGA_CAP ? <MegaTag /> : null}
        <span className={`evts-tile-fig ${f.cls}`}>{f.text}</span>
      </span>
      <span className={`evts-tile-sub evts-tile-fig ${rv.cls}`}>{rv.text}</span>
    </Ticker>
  );
}

export function TopReleases({ cal, monday, now }: { cal: MarketCalendar; monday: string; now: number }) {
  const days = useMemo(() => topReleases(cal.reports, monday), [cal.reports, monday]);
  const today = localDate(US_MARKET, now);
  const session = latestSession(US_MARKET, now);
  const total = days.reduce((a, d) => a + d.total, 0);
  const nasdaq = Number.isFinite(cal.listingsAt);
  const weekSymbols = useMemo(() => {
    const friday = isoDay(ms(monday) + 4 * DAY_MS);
    return cal.reports.filter((r) => r.date >= monday && r.date <= friday).map((r) => r.symbol);
  }, [cal.reports, monday]);
  // Without Nasdaq's stock list, Yahoo Finance's quotes name and rank the week's companies.
  const listFailed = !!cal.listingsProblem;
  useEffect(() => {
    if (listFailed && weekSymbols.length) requestYahooFacts(weekSymbols);
  }, [listFailed, weekSymbols]);
  const ranked = cal.reports.some((r) => ok(r.traded));
  const leaders = useMemo(() => (ranked ? weekLeaders(days) : []), [days, ranked]);
  const empty = cal.loading ? `Loading the week's calendar: ${cal.days - cal.loading} of ${cal.days} days…` : cal.calendarProblems.length ? cal.calendarProblems.join(' ') : 'No reports this week.';
  const when = (date: string, s: WeekSession) => `${DAY_NAMES[new Date(ms(date)).getUTCDay()].slice(0, 3)}${s === 'pre' ? ', before the open' : s === 'post' ? ', after the close' : ''}`;
  return (
    <div>
      {!total ? (
        <div className="empty">{empty}</div>
      ) : (
        <div className="evts-board">
          {leaders.length > 0 && (
            <div className="evts-lead">
              <span className="amber">Most traded reporting this week:</span>{' '}
              {leaders.map((l, i) => (
                <span key={l.r.symbol}>
                  {i ? ', ' : ''}
                  <span className="white">{shortName(l.r.name, l.r.symbol) || l.r.symbol}</span> <span className="muted">({when(l.date, l.session)})</span>
                </span>
              ))}
            </div>
          )}
          <div className="evts-days">
            {days.map((d) => {
              const other = d.other.reports.length + d.other.more;
              return (
                <section key={d.date} className={`evts-day${d.date === today ? ' today' : ''}${d.date < session ? ' past' : ''}`} aria-label={`${DAY_NAMES[new Date(ms(d.date)).getUTCDay()]} ${fmtDay(ms(d.date))}`}>
                  <header className="evts-day-head">
                    <span className="evts-day-name">
                      {DAY_NAMES[new Date(ms(d.date)).getUTCDay()]}
                      {d.date === today ? ' · today' : ''}
                    </span>
                    <span className="muted">
                      {fmtDay(ms(d.date))} · {d.holiday ? `market closed: ${d.holiday}` : `${d.total} ${d.total === 1 ? 'report' : 'reports'}`}
                    </span>
                  </header>
                  <div className="evts-day-cols">
                    {SLOTS.map((s) => {
                      const slot = d[s.key];
                      return (
                        <div key={s.key} className="evts-slot" data-session={s.key}>
                          <div className="evts-slot-head" title={s.title}>
                            {s.label}
                          </div>
                          {slot.reports.map((r) => (
                            <Tile key={r.symbol} r={r} />
                          ))}
                          {slot.more ? (
                            <div className="evts-more muted" title="14) Market lists every company">
                              +{slot.more} more
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {other ? <div className="evts-day-other muted">{other} at other times or no time given · 14) Market</div> : null}
                </section>
              );
            })}
          </div>
        </div>
      )}
      <div className="note">
        <div>
          <span className="amber">Ranking</span>{' '}
          {nasdaq ? (
            <>
              The {PER_SLOT} most traded companies of each day before the open and after the close: dollars traded in the latest session (last price × shares
              traded) in Nasdaq&apos;s stock list, read {fmtDay(cal.listingsAt)} {fmtTime(cal.listingsAt, false)}.
            </>
          ) : listFailed ? (
            ranked ? (
              <span className="amber">Nasdaq&apos;s stock list did not load ({cal.listingsProblem}): the companies are ranked by dollars traded in the latest session from Yahoo Finance&apos;s quotes instead.</span>
            ) : (
              <span className="amber">Nasdaq&apos;s stock list did not load ({cal.listingsProblem}); Yahoo Finance&apos;s quotes are being read to rank the companies, which are in alphabetical order until then.</span>
            )
          ) : (
            <>Loading Nasdaq&apos;s stock list to rank the companies…</>
          )}{' '}
          Share classes count once. {total} {total === 1 ? 'company reports' : 'companies report'} this week; 14) Market lists every one.
        </div>
        <div>
          <span className="amber">Reading</span> Before a report: the EPS and revenue expected · after it: reported against expected, <span className="up">green</span> beat, <span className="dn">red</span> missed · hover a company for its figures and sources, click to open it
        </div>
        <div>
          <span className="amber">Sources</span> {cal.reports.some((r) => r.sources.includes('Nasdaq')) ? 'Nasdaq earnings calendar: dates, sessions, EPS' : 'Finnhub earnings calendar: dates, sessions, EPS (Nasdaq\'s calendar did not load)'}
          {cal.revenueFrom.length ? ` · ${cal.revenueFrom.join(', ')}: revenue` : ''}
          {cal.loading ? <span className="amber"> · loading {cal.days - cal.loading} of {cal.days} days…</span> : null}
        </div>
      </div>
    </div>
  );
}

/** "Week of 26/10/26": a week tab's name. */
export const weekLabel = (monday: string) => `Week of ${fmtDay(ms(monday))}`;

