import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { openSecurity } from '../components/cells';
import { verdict } from '../components/EarningsExpectations';
import { fmtBig, fmtDay, fmtNum, MONTHS, WEEKDAYS } from '../core/format';
import { growthPct, isoDay, type CalendarFigure, type CalendarReport, type CalendarTiming, type MarketCalendar } from '../data/live/earnings-calendar';
import { lookupSecurity } from '../data/live/lookup';
import { useFundamentals } from '../data/live/yfund';
import { engine } from '../data/market';
import { DAY_MS } from '../data/calendar';
import type { FinPeriod } from '../data/fundamentals';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';

/**
 * EVENTS for the whole market (desktop app): every US-listed company reporting in the window above a market value,
 * from the earnings calendars (src/data/live/earnings-calendar.ts), with the expected and reported EPS and revenue,
 * the beat or miss and the growth on the year and the quarter in one line. A line opens its earnings card.
 */

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const ORDER: Record<CalendarTiming, number> = { 'Bef-mkt': 0, 'During-mkt': 1, 'Aft-mkt': 2, '--': 3 };
const TIMING: Record<CalendarTiming, string> = { 'Bef-mkt': 'Bef-mkt', 'During-mkt': 'Dur-mkt', 'Aft-mkt': 'Aft-mkt', '--': '' };
const SESSION: Record<CalendarTiming, string> = { 'Bef-mkt': 'before the open', 'During-mkt': 'during the session', 'Aft-mkt': 'after the close', '--': 'time not provided' };

/** The app's id of a US ticker: BRK.B is BRK/B US Equity. */
export const appId = (symbol: string) => `${symbol.replace('.', '/')} US Equity`;

/** The fiscal quarter as the calendar names it: "Q3 2026" (Finnhub), else the quarter's last month, "Sep 2026". */
function period(r: CalendarReport): string {
  if (r.label) return r.label;
  if (!r.fiscalEnd) return '';
  const [y, m] = r.fiscalEnd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

const eps = (v: number) => (ok(v) ? fmtNum(v, 2) : '--');
const big = (v: number) => (ok(v) ? fmtBig(v) : '--');
const from = (f: CalendarFigure) => [f.estFrom && `expected: ${f.estFrom}${ok(f.analysts) ? `, ${f.analysts} analysts` : ''}`, f.actualFrom && `reported: ${f.actualFrom}`].filter(Boolean).join('; ') || undefined;

function Surprise({ f }: { f: CalendarFigure }) {
  // Only a comparison within one source is a surprise.
  if (!ok(f.est) || !ok(f.actual) || f.estFrom !== f.actualFrom || f.est === 0) return <span className="muted">{ok(f.actual) || !ok(f.est) ? '--' : ''}</span>;
  const pct = ((f.actual - f.est) / Math.abs(f.est)) * 100;
  return <span className={Math.abs(pct) < 0.05 ? '' : pct > 0 ? 'up' : 'dn'}>{pct > 0 ? '+' : ''}{fmtNum(pct, 1)}%</span>;
}

function Growth({ now, before, what }: { now: number; before: number; what: string }) {
  if (!ok(now) || !ok(before)) return <span className="muted">--</span>;
  const pct = growthPct(now, before);
  if (!ok(pct)) return <span className="muted" title={`${what}: growth is not meaningful to or from a loss`}>NM</span>;
  return <span className={pct >= 0 ? 'up' : 'dn'} title={`${what}: ${fmtNum(now, 2)} against ${fmtNum(before, 2)}`}>{pct >= 0 ? '+' : ''}{fmtNum(pct, Math.abs(pct) < 99.95 ? 1 : 0)}%</span>;
}

/** The ticker, opening the security (looked up first when the app does not hold it yet). */
function Ticker({ symbol }: { symbol: string }) {
  const panel = usePanelId();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="sec-link"
      title={`${symbol} US — click to open, shift-click for the next panel`}
      onClick={(e) => {
        e.stopPropagation();
        const id = appId(symbol);
        const shift = e.shiftKey;
        if (engine.get(id)) return openSecurity(panel, id, e);
        setBusy(true);
        void lookupSecurity(symbol, false).then((r) => {
          setBusy(false);
          if (r.ok) openSecurity(panel, r.def.id, { shiftKey: shift } as unknown as Parameters<typeof openSecurity>[2]);
        });
      }}
    >
      {symbol} US{busy ? '…' : ''}
    </button>
  );
}

/** Revenue growth from the company's statements when the calendars give no earlier figures of their own. */
function statementGrowth(r: CalendarReport, statements: FinPeriod[]): { yoy: number; qoq: number; note: string } {
  const none = { yoy: NaN, qoq: NaN, note: '' };
  const quarters = statements.filter((p) => ok(p.end) && ok(p.rev) && p.rev > 0).sort((a, b) => b.end - a.end);
  if (!quarters.length) return none;
  const end = r.fiscalEnd ? Date.UTC(Number(r.fiscalEnd.slice(0, 4)), Number(r.fiscalEnd.slice(5, 7)), 0) : quarters.find((p) => p.end < ms(r.date) && ms(r.date) - p.end <= 120 * DAY_MS)?.end;
  if (!ok(end)) return none;
  const back = (lo: number, hi: number) => quarters.find((p) => end - p.end >= lo * DAY_MS && end - p.end <= hi * DAY_MS);
  const own = quarters.find((p) => Math.abs(p.end - end) <= 20 * DAY_MS);
  // The statements' own figure for the quarter when they have it; else the calendar's reported revenue against them.
  const now = own ? own.rev * 1e6 : r.rev.actual;
  if (!ok(now)) return none;
  return {
    yoy: growthPct(now, (back(340, 390)?.rev ?? NaN) * 1e6),
    qoq: growthPct(now, (back(70, 110)?.rev ?? NaN) * 1e6),
    note: own ? 'from the company’s quarterly statements' : `${r.rev.actualFrom ?? 'reported'} revenue against the company’s earlier quarterly statements`,
  };
}

function GrowthLine({ what, pct, span, note }: { what: string; pct: number; span: string; note?: string }) {
  if (!ok(pct)) return null;
  return (
    <div title={note}>
      {what} <span className={pct >= 0 ? 'up' : 'dn'}>{pct >= 0 ? 'up' : 'down'} {fmtNum(Math.abs(pct), Math.abs(pct) < 9.95 ? 1 : 0)}%</span> {span}
    </div>
  );
}

/** One report as an earnings card: expected against reported, beat or miss, and the growth. */
function EarningsCard({ r }: { r: CalendarReport }) {
  const panel = usePanelId();
  const [def, setDef] = useState<SecurityDef | undefined>(() => engine.get(appId(r.symbol)));
  useEffect(() => {
    if (def) return;
    let live = true;
    void lookupSecurity(r.symbol, false).then((x) => live && x.ok && setDef(x.def));
    return () => {
      live = false;
    };
  }, [r.symbol, def]);
  const { real } = useFundamentals(def);
  const st = statementGrowth(r, real?.quarterly ?? []);
  const revYoy = ok(growthPct(r.rev.actual, r.revYearAgo)) ? growthPct(r.rev.actual, r.revYearAgo) : st.yoy;
  const revQoq = ok(growthPct(r.rev.actual, r.revQuarterAgo)) ? growthPct(r.rev.actual, r.revQuarterAgo) : st.qoq;
  const revNote = ok(growthPct(r.rev.actual, r.revYearAgo)) ? 'FMP’s reported revenue against its year-earlier and quarter-earlier figures' : st.note;
  const reported = ok(r.eps.actual) || ok(r.rev.actual);
  const row = (label: string, f: CalendarFigure, fmt: (v: number) => string) => {
    const v = f.estFrom === f.actualFrom ? verdict(f) : { text: '', cls: '' };
    return (
      <tr title={from(f)}>
        <td className="amber">{label}</td>
        <td className="num">{fmt(f.est)}</td>
        <td className="num white">{fmt(f.actual)}</td>
        <td className={`num ${v.cls}`}>{v.text || (ok(f.actual) ? (ok(f.est) ? 'sources differ' : 'no estimate') : ok(f.est) ? 'not reported yet' : '--')}</td>
      </tr>
    );
  };
  return (
    <div className="earn-card">
      <div className="earn-card-h">
        <span className="white b">{r.name}</span> <span className="muted">{r.symbol} US</span> · {period(r) || 'fiscal quarter not given'} · {reported ? 'reported' : 'reports'} {fmtDay(ms(r.date))}, {SESSION[r.timing]}
        {ok(r.marketCap) ? <> · market value {fmtBig(r.marketCap)} USD</> : null}
        <span className="right">
          <button type="button" className="act" disabled={!def} onClick={() => def && execute(panel, `${def.id} EARNINGS`)}>EARNINGS ›</button>{' '}
          <button type="button" className="act" disabled={!def} onClick={() => def && execute(panel, `${def.id} PROFILE`)}>PROFILE ›</button>
        </span>
      </div>
      <table className="tbl earn-card-tbl">
        <thead>
          <tr>
            <th>Parameters</th>
            <th className="num">Expected</th>
            <th className="num">Reported</th>
            <th className="num">Beat / miss</th>
          </tr>
        </thead>
        <tbody>
          {row('Earnings per share (USD)', r.eps, eps)}
          {row('Revenue (USD)', r.rev, big)}
        </tbody>
      </table>
      <div className="earn-growth">
        <GrowthLine what="EPS" pct={growthPct(reported ? r.eps.actual : r.eps.est, r.epsYearAgo)} span={reported ? 'year over year' : 'year over year expected'} note="Nasdaq’s EPS on one basis: the analysts’ (usually adjusted)" />
        <GrowthLine what="Revenue" pct={revYoy} span="year over year" note={revNote} />
        <GrowthLine what="EPS" pct={growthPct(r.eps.actual, r.epsQuarterAgo)} span="quarter over quarter" note="Nasdaq’s EPS on one basis: the analysts’ (usually adjusted)" />
        <GrowthLine what="Revenue" pct={revQoq} span="quarter over quarter" note={revNote} />
        {!reported && !ok(r.epsYearAgo) ? <div className="muted">Not reported yet.</div> : null}
      </div>
    </div>
  );
}

/** What a calendar line shows: a line whose figures have not changed is not drawn again when more days arrive. */
function signature(r: CalendarReport): string {
  const f = (x: CalendarFigure) => `${x.est}/${x.actual}/${x.estFrom ?? ''}/${x.actualFrom ?? ''}/${x.analysts ?? ''}`;
  return [r.symbol, r.date, r.timing, r.marketCap, r.name, r.label ?? '', r.fiscalEnd, f(r.eps), f(r.rev), r.epsYearAgo, r.epsQuarterAgo, r.revYearAgo, r.revQuarterAgo].join('|');
}

interface RowProps {
  r: CalendarReport;
  sig: string;
  rowKey: string;
  open: boolean;
  today: string;
  onToggle: (key: string) => void;
}

const MarketRow = memo(
  function MarketRow({ r, rowKey, open, today, onToggle }: RowProps) {
    const reported = ok(r.eps.actual) || ok(r.rev.actual);
    return (
      <tr className={`click${open ? ' sel' : ''}`} onClick={() => onToggle(rowKey)} title="Click for the earnings card">
        <td className="muted">{TIMING[r.timing]}</td>
        <td className="nowrap"><Ticker symbol={r.symbol} /></td>
        <td className="ellipsis hide-w" style={{ maxWidth: 220 }}>{r.name}</td>
        <td className="num hide-n">{big(r.marketCap)}</td>
        <td className="hide-w amber">{period(r)}</td>
        <td className="num" title={from(r.eps)}>{eps(r.eps.est)}</td>
        <td className="num white" title={from(r.eps)}>{ok(r.eps.actual) ? eps(r.eps.actual) : <span className="muted">{ms(r.date) >= ms(today) ? 'pending' : '--'}</span>}</td>
        <td className="num"><Surprise f={r.eps} /></td>
        <td className="num hide-n">{reported ? <Growth now={r.eps.actual} before={r.epsYearAgo} what="EPS, year over year" /> : <Growth now={r.eps.est} before={r.epsYearAgo} what="Expected EPS against the year-earlier EPS" />}</td>
        <td className="num hide-w"><Growth now={r.eps.actual} before={r.epsQuarterAgo} what="EPS, quarter over quarter" /></td>
        <td className="num hide-m" title={from(r.rev)}>{big(r.rev.est)}</td>
        <td className="num white hide-m" title={from(r.rev)}>{big(r.rev.actual)}</td>
        <td className="num hide-m"><Surprise f={r.rev} /></td>
        <td className="num hide-n"><Growth now={r.rev.actual} before={r.revYearAgo} what="Revenue, year over year" /></td>
        <td className="num hide-w"><Growth now={r.rev.actual} before={r.revQuarterAgo} what="Revenue, quarter over quarter" /></td>
      </tr>
    );
  },
  (a, b) => a.sig === b.sig && a.open === b.open && a.today === b.today && a.onToggle === b.onToggle,
);

/**
 * The slice of a long list of equal-height table lines that is in view in its scrolling ancestor, with a margin, so a
 * thousand-line calendar draws a few dozen lines. The line height is measured from a drawn line.
 */
function useVisibleRange(ref: RefObject<HTMLTableSectionElement | null>, count: number): { start: number; end: number; rowH: number } {
  const [view, setView] = useState({ start: 0, end: Math.min(count, 80), rowH: 20 });
  useEffect(() => {
    const body = ref.current;
    if (!body) return;
    // The panel body scrolls the screen; a table wrapper scrolls only sideways and grows with its table.
    let scroller: HTMLElement | null = body.closest<HTMLElement>('.panel-body');
    if (!scroller) {
      scroller = body.parentElement;
      while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.clientHeight < scroller.scrollHeight)) scroller = scroller.parentElement;
    }
    const host = scroller ?? document.documentElement;
    const update = () => {
      const line = body.querySelector<HTMLElement>('tr.click, tr.group');
      const rowH = Math.max(14, line?.offsetHeight || 20);
      const top = body.getBoundingClientRect().top - host.getBoundingClientRect().top;
      const margin = 30;
      const start = Math.max(0, Math.min(count, Math.floor(-top / rowH) - margin));
      const end = Math.max(start, Math.min(count, Math.ceil((host.clientHeight - top) / rowH) + margin));
      setView((v) => (v.start === start && v.end === end && v.rowH === rowH ? v : { start, end, rowH }));
    };
    update();
    host.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      host.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, count]);
  return { ...view, end: Math.min(view.end, count) };
}

export function MarketEarnings({ cal, minCap, caps, onCap, now }: { cal: MarketCalendar; minCap: number; caps: { v: number; label: string }[]; onCap: (v: number) => void; now: number }) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = filter.trim().toLowerCase();
  const rows = useMemo(
    () =>
      cal.reports
        .filter((r) => (minCap <= 0 || (ok(r.marketCap) && r.marketCap >= minCap)) && (!q || `${r.symbol} ${r.name}`.toLowerCase().includes(q)))
        .sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.timing] - ORDER[b.timing] || (ok(b.marketCap) ? b.marketCap : 0) - (ok(a.marketCap) ? a.marketCap : 0)),
    [cal.reports, minCap, q],
  );
  const today = isoDay(now);
  const cols = 15;
  const toggle = useCallback((key: string) => setOpen((o) => (o === key ? null : key)), []);
  // One flat list of day headings and lines; only the lines in view (and a margin) are drawn, the rest is spacer.
  const flat = useMemo(() => {
    const list: ({ kind: 'day'; date: string } | { kind: 'row'; r: CalendarReport; key: string; sig: string })[] = [];
    let lastDay = '';
    for (const r of rows) {
      if (r.date !== lastDay) {
        lastDay = r.date;
        list.push({ kind: 'day', date: r.date });
      }
      list.push({ kind: 'row', r, key: `${r.symbol}|${r.date}`, sig: signature(r) });
    }
    return list;
  }, [rows]);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const view = useVisibleRange(bodyRef, flat.length);
  const chosen = open ? rows.find((r) => `${r.symbol}|${r.date}` === open) : undefined;
  const out: ReactNode[] = [];
  if (view.start > 0) out.push(<tr key="pad-top" aria-hidden="true" style={{ height: view.start * view.rowH }} />);
  for (const item of flat.slice(view.start, view.end)) {
    if (item.kind === 'day') {
      out.push(
        <tr key={`h${item.date}`} className="group">
          <td colSpan={cols}>
            {WEEKDAYS[new Date(ms(item.date)).getUTCDay()]} {fmtDay(ms(item.date))}
            {item.date === today ? '  · TODAY' : ''}
          </td>
        </tr>,
      );
    } else {
      out.push(<MarketRow key={item.key} r={item.r} sig={item.sig} rowKey={item.key} open={open === item.key} today={today} onToggle={toggle} />);
    }
  }
  if (view.end < flat.length) out.push(<tr key="pad-bottom" aria-hidden="true" style={{ height: (flat.length - view.end) * view.rowH }} />);
  const empty = cal.loading && !cal.reports.length ? 'Loading the earnings calendar…' : cal.problems.length && !cal.reports.length ? cal.problems.join(' ') : 'No reports in this window above this market value.';
  return (
    <div>
      <div className="chart-tools">
        <span className="fld">Market value from</span>
        <span className="seg" role="group" aria-label="Smallest market value">
          {caps.map((c) => (
            <button key={c.v} type="button" className={c.v === minCap ? 'on' : ''} aria-pressed={c.v === minCap} onClick={() => onCap(c.v)}>
              {c.label}
            </button>
          ))}
        </span>
        <input className="inp" aria-label="Filter the calendar" placeholder="Filter ticker or name" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 170 }} />
        <span className="muted hide-m">Click a line for its earnings card · the ticker opens the company</span>
        {cal.loading ? <span className="amber">loading {cal.days - cal.loading} of {cal.days} days…</span> : null}
      </div>
      {chosen ? (
        <div className="earn-card-pane">
          <button type="button" className="act" onClick={() => setOpen(null)}>Close</button>
          <EarningsCard r={chosen} />
        </div>
      ) : null}
      <div className="tbl-wrap">
        <table className="tbl evts-mkt">
          <colgroup>
            <col style={{ width: 62 }} />
            <col style={{ width: 92 }} />
            <col className="hide-w" style={{ width: '18%' }} />
            <col className="hide-n" style={{ width: 70 }} />
            <col className="hide-w" style={{ width: 72 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 66 }} />
            <col style={{ width: 66 }} />
            <col className="hide-n" style={{ width: 64 }} />
            <col className="hide-w" style={{ width: 64 }} />
            <col className="hide-m" style={{ width: 72 }} />
            <col className="hide-m" style={{ width: 72 }} />
            <col className="hide-m" style={{ width: 66 }} />
            <col className="hide-n" style={{ width: 64 }} />
            <col className="hide-w" style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Time</th>
              <th>Security</th>
              <th className="hide-w">Name</th>
              <th className="num hide-n" title="Market value, US dollars (Nasdaq)">Mkt Cap</th>
              <th className="hide-w" title="Fiscal quarter reported">Period</th>
              <th className="num" title="The analysts' average EPS estimate for the quarter">EPS Est</th>
              <th className="num" title="EPS as reported, on the analysts' basis (usually adjusted)">EPS Act</th>
              <th className="num" title="Reported EPS against the estimate of the same source">EPS Surp</th>
              <th className="num hide-n" title="EPS against the same quarter a year earlier; for a coming report, the estimate against it">EPS YoY</th>
              <th className="num hide-w" title="EPS against the quarter before">EPS QoQ</th>
              <th className="num hide-m" title="The analysts' average revenue estimate (Finnhub, FMP)">Rev Est</th>
              <th className="num hide-m" title="Revenue as reported (Finnhub, FMP)">Rev Act</th>
              <th className="num hide-m" title="Reported revenue against the estimate of the same source">Rev Surp</th>
              <th className="num hide-n" title="Revenue against the same quarter a year earlier (FMP)">Rev YoY</th>
              <th className="num hide-w" title="Revenue against the quarter before (FMP)">Rev QoQ</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rows.length ? out : (
              <tr>
                <td colSpan={cols} className="empty">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="note">
        Every US-listed company reporting in the window, from Nasdaq&apos;s earnings calendar (EPS expected and reported, market value, time of the report) and, with your keys, Finnhub&apos;s and FMP&apos;s
        (revenue expected and reported, companies Nasdaq leaves out). EPS is on the analysts&apos; basis, usually adjusted, and is compared only within one source. YoY and QoQ set a report against the
        same quarter a year earlier and the quarter before, from the same source&apos;s earlier calendars; NM: not meaningful to or from a loss. Hover a figure for its source.
        {cal.revenueFrom.length ? ` Revenue from ${cal.revenueFrom.join(' and ')}.` : ' Revenue needs FINNHUB_API_KEY or FMP_API_KEY on PROVIDERS.'}
        {cal.problems.length ? ` ${cal.problems.slice(0, 3).join(' ')}` : ''}
      </div>
    </div>
  );
}
