import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, SecLink } from '../components/cells';
import { fmtDay, fmtMln, fmtNum, WEEKDAYS } from '../core/format';
import { engine } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { dividends, earningsHistory } from '../data/fundamentals';
import type { FnProps } from '../terminal/types';

interface Ev {
  date: number;
  id: string;
  kind: 'Earnings' | 'Ex-Dividend';
  detail: string;
  est?: number;
  act?: number | null;
  surprise?: number | null;
  timing?: string;
}

export function EVTS({ sec }: FnProps) {
  const [range, setRange] = useState(2);
  const now = engine.now();
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
    const secs = sec ? [sec] : engine.securities.filter((d) => d.cls === 'equity');
    for (const d of secs) {
      for (const e of earningsHistory(d)) {
        if (e.date >= from && e.date <= to) list.push({ date: e.date, id: d.id, kind: 'Earnings', detail: `${e.period} results`, est: e.estimate, act: e.actual, surprise: e.surprise, timing: e.timing });
      }
      for (const v of dividends(d)) {
        if (v.ex >= from && v.ex <= to) list.push({ date: v.ex, id: d.id, kind: 'Ex-Dividend', detail: `${fmtNum(v.amount, 4)} ${d.ccy} ${v.type === 'Projected' ? '(projected)' : ''}`.trim() });
      }
    }
    return list.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  }, [sec, span.from, span.to, now]);
  let lastDay = '';
  return (
    <div>
      <FnHeader code="EVTS" title={sec ? 'Corporate Events' : 'Corporate Events Calendar'} sec={sec} sub={`${events.length} events · earnings and ex-dividend dates`} tabs={spans.map((s) => ({ n: s.n, label: s.label }))} tab={range} onTab={setRange} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Security</th>
            <th className="hide-m">Name</th>
            <th>Event</th>
            <th>Detail</th>
            <th className="num">EPS est</th>
            <th className="num">Actual</th>
            <th className="num">Surprise</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">
                No events in this window.
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
                  <td colSpan={8}>
                    {WEEKDAYS[new Date(e.date).getUTCDay()]} {day}
                    {Math.floor(e.date / DAY_MS) === Math.floor(now / DAY_MS) ? '  · TODAY' : ''}
                  </td>
                </tr>
              ) : null,
              <tr key={`${e.id}${e.kind}${e.date}`} style={past ? { opacity: 0.8 } : undefined}>
                <td className="muted">{e.timing ?? ''}</td>
                <td>
                  <SecLink id={e.id}>{d.ticker}</SecLink>
                </td>
                <td className="hide-m ellipsis" style={{ maxWidth: 220 }}>
                  {d.name}
                </td>
                <td className={e.kind === 'Earnings' ? 'amber' : 'cyan'}>{e.kind}</td>
                <td>{e.detail}</td>
                <td className="num">{e.est != null ? fmtNum(e.est, 2) : ''}</td>
                <td className="num white">{e.act != null ? fmtNum(e.act, 2) : e.kind === 'Earnings' ? <span className="muted">pending</span> : ''}</td>
                <td className="num">{e.surprise != null ? <Chg v={e.surprise} pct dec={1} /> : ''}</td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
      {sec?.eq && <div className="note">Revenue base LTM {fmtMln(sec.eq.rev)} {sec.ccy}.</div>}
    </div>
  );
}
