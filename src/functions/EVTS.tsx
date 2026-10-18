import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SecLink } from '../components/cells';
import { fmtDay, fmtNum, WEEKDAYS } from '../core/format';
import { SimBadge } from '../components/Source';
import { getRealFund } from '../data/live/yfund';
import { desktopData, yahooQuotes } from '../data/live/yahoo';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { dividends, earningsEvents } from '../data/fundamentals';
import type { SecurityDef } from '../data/types';
import { portfolio, watchlists } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

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
  { n: 11, label: 'All', title: 'Every stock in the app' },
  { n: 12, label: 'Watchlist', title: "Your active watchlist's stocks (WATCHLIST)" },
  { n: 13, label: 'Portfolio', title: 'The stocks you hold (PORTFOLIO)' },
];

/** The stocks among some securities, each once; one not loaded yet is left out. */
const equitiesOf = (ids: string[]) => [...new Set(ids)].map((id) => engine.get(id)).filter((d): d is SecurityDef => d?.cls === 'equity');

export function EVTS({ sec }: FnProps) {
  const [range, setRange] = useState(2);
  // Re-reads the calendar as real dates arrive.
  useTick(10);
  const now = engine.now();
  const wl = watchlists.use((w) => w.lists[w.active] ?? w.lists[0]);
  const held = portfolio.use((p) => p.positions);
  // Looked-up stocks load after the lists do, so the lists are read again as time moves.
  const watched = useMemo(() => equitiesOf(wl?.ids ?? []), [wl, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdings = useMemo(() => equitiesOf(held.map((p) => p.id)), [held, now]); // eslint-disable-line react-hooks/exhaustive-deps
  // Your watchlist's stocks when it has any, every stock otherwise, until you pick.
  const [picked, setPicked] = useState<number | null>(null);
  const scope = picked ?? (watched.length ? 12 : 11);
  const spans = [
    { n: 1, label: 'This week', from: -3, to: 7 },
    { n: 2, label: '±2 weeks', from: -14, to: 14 },
    { n: 3, label: 'Next 60 days', from: 0, to: 60 },
    { n: 4, label: 'Past 90 days', from: -90, to: 0 },
  ];
  const span = spans[range - 1];
  const events = useMemo(() => {
    const from = now + span.from * DAY_MS;
    const to = now + span.to * DAY_MS;
    const list: Ev[] = [];
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
  }, [sec, scope, watched, holdings, span.from, span.to, now]);
  const stocks = (n: number) => `${n} ${n === 1 ? 'stock' : 'stocks'}`;
  const covered = sec ? '' : scope === 12 ? `watchlist ${wl?.name ?? ''}: ${stocks(watched.length)} · ` : scope === 13 ? `portfolio: ${stocks(holdings.length)} · ` : 'all stocks · ';
  const none =
    !sec && scope === 12 && !watched.length
      ? `Your active watchlist${wl ? ` (${wl.name})` : ''} has no stocks: add some on WATCHLIST, or pick 11) All.`
      : !sec && scope === 13 && !holdings.length
        ? 'Your portfolio holds no stocks: enter your holdings on PORTFOLIO, or pick 11) All.'
        : 'No events in this window.';
  let lastDay = '';
  return (
    <div>
      <FnHeader code="EVENTS" title={sec ? 'Corporate Events' : 'Corporate Events Calendar'} sec={sec} sub={
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
        } tabs={spans.map((s) => ({ n: s.n, label: s.label }))} tab={range} onTab={setRange}
        actions={sec ? [] : SCOPES.map((x) => ({ n: x.n, label: x.label, title: `${x.title} · type ${x.n} and press Enter`, on: x.n === scope, onClick: () => setPicked(x.n) }))} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Security</th>
            <th className="hide-m">Name</th>
            <th>Event</th>
            <th>Detail</th>
            <th className="num" title="Diluted EPS as reported">EPS reported</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                {none}
              </td>
            </tr>
          )}
          {events.map((e, i) => {
            const day = fmtDay(e.date);
            const head = day !== lastDay;
            lastDay = day;
            const d = engine.get(e.id)!;
            const past = e.date < now - DAY_MS;
            return [
              head ? (
                <tr key={`h${i}`} className="group">
                  <td colSpan={6}>
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
                </td>
                <td className="hide-m ellipsis" style={{ maxWidth: 220 }}>
                  {d.name}
                </td>
                <td className={e.kind === 'Earnings' ? 'amber' : 'cyan'}>{e.kind}</td>
                <td>
                  {e.detail}
                  {e.sim ? <span className="muted"> SIM</span> : null}
                </td>
                <td className="num white">{e.act != null ? fmtNum(e.act, 2) : e.kind === 'Earnings' ? <span className="muted">{e.date > now ? 'pending' : '--'}</span> : ''}</td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
