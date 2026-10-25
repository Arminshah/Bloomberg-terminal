import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SecLink } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, WEEKDAYS } from '../core/format';
import { SimBadge } from '../components/Source';
import { getRealFund } from '../data/live/yfund';
import { consensusFor, quarterAt, useConsensusFor } from '../data/live/consensus';
import { verdict } from '../components/EarningsExpectations';
import { desktopData, yahooQuotes } from '../data/live/yahoo';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { dividends, earningsEvents } from '../data/fundamentals';
import type { SecurityDef } from '../data/types';
import { portfolio, watchlists } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';
import { calendarAvailable, isoDay, useMarketCalendar } from '../data/live/earnings-calendar';
import { MarketEarnings, MEGA_CAP, MegaTag, scrollerOf } from './EVTSMarket';
import { TopReleases, weekLabel, weekStart } from './EVTSWeek';
import { latestSession, US_MARKET } from '../data/exchanges';
import { marketCapUsd } from '../data/analytics';
import { useNasdaq } from '../data/live/nasdaq-company';

interface Ev {
  date: number;
  id: string;
  kind: 'Earnings' | 'Ex-Dividend';
  detail: string;
  act?: number | null;
  timing?: string;
  approx?: boolean;
  /** From the simulator rather than a real record. */
  sim?: boolean;
}

/** The stocks the calendar covers when no security is loaded. */
const SCOPES = [
  { n: 10, label: 'Most relevant', title: "A week's most traded companies reporting, by day, before the open and after the close (desktop app)" },
  { n: 11, label: 'All', title: 'Every stock in the app' },
  { n: 12, label: 'Watchlist', title: "Your active watchlist's stocks (WATCHLIST)" },
  { n: 13, label: 'Portfolio', title: 'The stocks you hold (PORTFOLIO)' },
  { n: 14, label: 'Market', title: 'Every US-listed company reporting, above the market value chosen (desktop app)' },
];

/** Market values the market calendar can start from, in US dollars. */
const CAPS = [
  { v: 5e9, label: '$5B' },
  { v: 10e9, label: '$10B' },
  { v: 50e9, label: '$50B' },
  { v: 200e9, label: '$200B' },
  { v: 500e9, label: '$500B' },
];

/** The stocks among some securities, each once; one not loaded yet is left out. */
const equitiesOf = (ids: string[]) => [...new Set(ids)].map((id) => engine.get(id)).filter((d): d is SecurityDef => d?.cls === 'equity');

export function EVTS({ sec }: FnProps) {
  const [range, setRange] = useState(2);
  // The most relevant releases' week: 1 the week before, 2 this week (the coming one at a weekend), 3 the week after.
  const [week, setWeek] = useState(2);
  // Re-reads the calendar as real dates arrive.
  useTick(10);
  const now = engine.now();
  const wl = watchlists.use((w) => w.lists[w.active] ?? w.lists[0]);
  const held = portfolio.use((p) => p.positions);
  // Looked-up stocks load after the lists do, so the lists are read again as time moves.
  const watched = useMemo(() => equitiesOf(wl?.ids ?? []), [wl, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdings = useMemo(() => equitiesOf(held.map((p) => p.id)), [held, now]); // eslint-disable-line react-hooks/exhaustive-deps
  // The week's most relevant releases in the desktop app; elsewhere your watchlist's stocks when it has any, every
  // stock otherwise, until you pick.
  const [picked, setPicked] = useState<number | null>(null);
  const market = calendarAvailable();
  const scope = picked ?? (market ? 10 : watched.length ? 12 : 11);
  const [minCap, setMinCap] = useState(50e9);
  // A window around today opens on the latest trading day: the days before it are folded into one line, shown on demand.
  const [showPast, setShowPast] = useState(false);
  const spans = [
    { n: 1, label: 'This week', from: -3, to: 7 },
    { n: 2, label: '±2 weeks', from: -14, to: 14 },
    { n: 3, label: 'Next 60 days', from: 0, to: 60 },
    { n: 4, label: 'Past 90 days', from: -90, to: 0 },
  ];
  const span = spans[range - 1];
  const showMarket = !sec && scope === 14 && market;
  const showWeek = !sec && scope === 10 && market;
  const mondays = [weekStart(now, -1), weekStart(now, 0), weekStart(now, 1)];
  const monday = mondays[week - 1];
  // Whole days around today (or the chosen week's Monday to Friday); the year- and quarter-earlier calendars only for
  // windows up to a month.
  const fromIso = showWeek ? monday : isoDay(now + span.from * DAY_MS);
  const toIso = showWeek ? isoDay(Date.parse(`${monday}T00:00:00Z`) + 4 * DAY_MS) : isoDay(now + span.to * DAY_MS);
  const cal = useMarketCalendar(fromIso, toIso, !showWeek && span.to - span.from <= 31, showMarket || showWeek);
  // One stock's next report date from Nasdaq, for when the quote and company data give none.
  const nasdaqParts = useNasdaq(sec?.eq ? sec : undefined, ['earnings-date']);
  const above = cal.reports.filter((r) => minCap <= 0 || (Number.isFinite(r.marketCap) && r.marketCap >= minCap));
  const events = useMemo(() => {
    const from = now + span.from * DAY_MS;
    const to = now + span.to * DAY_MS;
    const list: Ev[] = [];
    if (showMarket) return list;
    const secs = sec ? [sec] : scope === 12 ? watched : scope === 13 ? holdings : engine.securities.filter((d) => d.cls === 'equity');
    for (const d of secs) {
      const realEarnings = !!getRealFund(d.id) || yahooQuotes.has(d.id) || engine.isExternal(d.id);
      for (const e of earningsEvents(d)) {
        // A report whose date the source does not give has no place on a calendar.
        if (!e.dateUnknown && e.date >= from && e.date <= to) {
          list.push({ date: e.date, id: d.id, kind: 'Earnings', detail: e.period ? `${e.period} results` : 'Earnings release', act: e.actual, timing: e.timing, approx: e.approx, sim: !realEarnings });
        }
      }
      const realDvd = engine.isExternal(d.id) || !!getRealFund(d.id);
      for (const v of dividends(d)) {
        if (v.ex < from || v.ex > to) continue;
        // The next ex-date the source announces comes without an amount.
        const expected = v.type === 'Expected' || !Number.isFinite(v.amount);
        const detail = expected ? 'Expected ex-date, amount not given' : `${fmtNum(v.amount, 4)} ${d.ccy} ${v.type === 'Projected' ? '(projected)' : ''}`.trim();
        list.push({ date: v.ex, id: d.id, kind: 'Ex-Dividend', detail, approx: expected, sim: !realDvd });
      }
    }
    return list.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  }, [sec, scope, watched, holdings, span.from, span.to, now, showMarket, nasdaqParts]); // eslint-disable-line react-hooks/exhaustive-deps
  // The analysts' expectations for the reports in view, nearest to today first (desktop app).
  const reporting = useMemo(() => {
    const byDistance = events.filter((e) => e.kind === 'Earnings' && !e.sim).sort((a, b) => Math.abs(a.date - now) - Math.abs(b.date - now));
    return [...new Set(byDistance.map((e) => e.id))].map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps
  useConsensusFor(desktopData() ? reporting : []);
  const stocks = (n: number) => `${n} ${n === 1 ? 'stock' : 'stocks'}`;
  const covered = sec ? '' : scope === 12 ? `watchlist ${wl?.name ?? ''}: ${stocks(watched.length)} · ` : scope === 13 ? `portfolio: ${stocks(holdings.length)} · ` : 'all stocks · ';
  const capLabel = CAPS.find((c) => c.v === minCap)?.label ?? '';
  const marketSub = (
    <>
      {above.length} {above.length === 1 ? 'report' : 'reports'}{minCap > 0 ? ` above ${capLabel} market value` : ''} · {cal.reports.length} in all · EPS: Nasdaq
      {cal.revenueFrom.length ? `, revenue: ${cal.revenueFrom.join(', ')}` : ''} · <span className="badge live">REAL</span>
    </>
  );
  const weekSub = (
    <>
      Most relevant earnings releases, {weekLabel(monday).toLowerCase()} · the most traded companies first · Nasdaq · <span className="badge live">REAL</span>
    </>
  );
  const none =
    !sec && scope === 12 && !watched.length
      ? `Your active watchlist${wl ? ` (${wl.name})` : ''} has no stocks: add some on WATCHLIST, or pick 11) All.`
      : !sec && scope === 13 && !holdings.length
        ? 'Your portfolio holds no stocks: enter your holdings on PORTFOLIO, or pick 11) All.'
        : 'No events in this window.';
  // The latest trading day (Friday at a weekend), New York's date, and what lies before it.
  const session = Date.parse(`${latestSession(US_MARKET, now)}T00:00:00Z`);
  const pastEvents = !sec && span.from < 0 && span.to > 0 ? events.filter((e) => e.date < session) : [];
  const folded = pastEvents.length > 0 && !showPast;
  const shown = folded ? events.filter((e) => e.date >= session) : events;
  // Showing the earlier days puts them above the latest trading day without moving it on screen.
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const keep = useRef<{ top: number; scroller: HTMLElement } | null>(null);
  const toggleFold = () => {
    const scroller = scrollerOf(tableRef.current);
    const anchor = tableRef.current?.querySelector<HTMLElement>('tr[data-session-start]');
    if (scroller && anchor) keep.current = { top: anchor.getBoundingClientRect().top, scroller };
    setShowPast((v) => !v);
  };
  useLayoutEffect(() => {
    const k = keep.current;
    keep.current = null;
    const anchor = tableRef.current?.querySelector<HTMLElement>('tr[data-session-start]');
    if (k && anchor) k.scroller.scrollTop += anchor.getBoundingClientRect().top - k.top;
  }, [showPast]);
  let lastDay = '';
  let marked = false;
  return (
    <div>
      <FnHeader code="EVENTS" title={sec ? 'Corporate Events' : 'Corporate Events Calendar'} sec={sec} sub={showWeek ? weekSub : showMarket ? marketSub :
          <>
            {covered}
            {events.length} {events.length === 1 ? 'event' : 'events'} · earnings and ex-dividend dates ·{' '}
            {events.some((e) => e.sim) ? (
              <>
                <SimBadge /> rows marked SIM are generated{desktopData() ? ' while real data loads' : '; real dates need the desktop app'}
              </>
            ) : (
              <>
                <span className="badge live">REAL</span> Yahoo Finance · ~ marks an expected date
              </>
            )}
          </>
        } tabs={showWeek ? mondays.map((m, i) => ({ n: i + 1, label: weekLabel(m) })) : spans.map((s) => ({ n: s.n, label: s.label }))} tab={showWeek ? week : range} onTab={(n) => { if (showWeek) setWeek(n); else { setRange(n); setShowPast(false); } }}
        actions={sec ? [] : SCOPES.filter((x) => (x.n !== 14 && x.n !== 10) || market).map((x) => ({ n: x.n, label: x.label, title: `${x.title} · type ${x.n} and press Enter`, on: x.n === scope, onClick: () => setPicked(x.n) }))} />
      {showWeek ? (
        <TopReleases cal={cal} monday={monday} now={Date.now()} />
      ) : showMarket ? (
        <MarketEarnings cal={cal} minCap={minCap} caps={CAPS} onCap={setMinCap} now={Date.now()} spansPast={span.from < 0 && span.to > 0} />
      ) : (
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Security</th>
            <th className="hide-m">Name</th>
            <th>Event</th>
            <th>Detail</th>
            <th className="num" title="The analysts' average EPS estimate for the quarter (Yahoo Finance, Finnhub)">EPS expected</th>
            <th className="num" title="EPS as reported, on the analysts' basis where a source compares it, else diluted EPS from the statements">EPS reported</th>
            <th className="num hide-m" title="Reported EPS against the estimate">Beat / miss</th>
            <th className="num hide-m" title="The analysts' average revenue estimate for the quarter">Revenue expected</th>
          </tr>
        </thead>
        <tbody ref={tableRef}>
          {events.length === 0 && (
            <tr>
              <td colSpan={9} className="empty">
                {none}
              </td>
            </tr>
          )}
          {pastEvents.length > 0 && (
            <tr className="group click evts-fold" onClick={toggleFold}>
              <td colSpan={9}>
                {folded ? '▸' : '▾'} Earlier in this window: {fmtDay(pastEvents[0].date)} to {fmtDay(pastEvents[pastEvents.length - 1].date)} · {pastEvents.length} {pastEvents.length === 1 ? 'event' : 'events'} ·{' '}
                <span className="amber">{folded ? 'show' : 'hide'}</span>
              </td>
            </tr>
          )}
          {shown.map((e, i) => {
            const day = fmtDay(e.date);
            const head = day !== lastDay;
            lastDay = day;
            // The first line of the latest trading day or after: it stays in place when the earlier days are shown.
            const start = head && !marked && e.date >= session;
            if (start) marked = true;
            const d = engine.get(e.id)!;
            const past = e.date < now - DAY_MS;
            const q = e.kind === 'Earnings' && !e.sim && desktopData() ? quarterAt(consensusFor(d), e.date) : null;
            const v = q ? verdict(q.eps) : { text: '', cls: '' };
            const reported = q && Number.isFinite(q.eps.actual) ? q.eps.actual : e.act;
            return [
              head ? (
                <tr key={`h${i}`} className="group" {...(start ? { 'data-session-start': '' } : {})}>
                  <td colSpan={9}>
                    {WEEKDAYS[new Date(e.date).getUTCDay()]} {day}
                    {Math.floor(e.date / DAY_MS) === Math.floor(now / DAY_MS) ? '  · TODAY' : ''}
                  </td>
                </tr>
              ) : null,
              <tr key={`${e.id}${e.kind}${e.date}`} style={past ? { opacity: 0.8 } : undefined}>
                <td className="muted">
                  {e.approx ? '~ ' : ''}
                  {e.timing && e.timing !== '--' ? e.timing : ''}
                </td>
                <td>
                  <SecLink id={e.id}>{d.ticker}</SecLink>
                  {marketCapUsd(e.id) >= MEGA_CAP ? <MegaTag /> : null}
                </td>
                <td className="hide-m ellipsis" style={{ maxWidth: 220 }}>
                  {d.name}
                </td>
                <td className={e.kind === 'Earnings' ? 'amber' : 'cyan'}>{e.kind}</td>
                <td>
                  {e.detail}
                  {e.sim ? <span className="muted"> SIM</span> : null}
                </td>
                <td className="num" title={q?.eps.estFrom ? `${q.eps.estFrom}${Number.isFinite(q.eps.analysts) ? `, ${q.eps.analysts} analysts` : ''}` : undefined}>
                  {q && Number.isFinite(q.eps.est) ? fmtNum(q.eps.est, 2) : ''}
                </td>
                <td className="num white">{reported != null && Number.isFinite(reported) ? fmtNum(reported, 2) : e.kind === 'Earnings' ? <span className="muted">{e.date > now ? 'pending' : '--'}</span> : ''}</td>
                <td className={`num hide-m ${v.cls}`}>{v.text}</td>
                <td className="num hide-m" title={q?.rev.estFrom ? `${q.rev.estFrom}${q.rev.ccy ? `, ${q.rev.ccy}` : ''}` : undefined}>
                  {q && Number.isFinite(q.rev.est) ? `${fmtBig(q.rev.est)}${q.rev.ccy && q.rev.ccy !== d.ccy ? ` ${q.rev.ccy}` : ''}` : ''}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
      )}
    </div>
  );
}
