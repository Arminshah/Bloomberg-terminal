import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CapLink } from '../components/CapLink';
import { openSecurity } from '../components/cells';
import { verdict } from '../components/EarningsExpectations';
import { fmtBig, fmtDay, fmtNum, MONTHS, WEEKDAYS } from '../core/format';
import { growthPct, type CalendarFigure, type CalendarReport, type CalendarTiming, type MarketCalendar } from '../data/live/earnings-calendar';
import { lookupSecurity } from '../data/live/lookup';
import { useFundamentals } from '../data/live/yfund';
import { useConsensus, type Consensus } from '../data/live/consensus';
import { historyData, historyFor, loadHistory, wantHistories } from '../data/live/estimate-history';
import { engine } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { latestSession, localDate, US_MARKET } from '../data/exchanges';
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

/**
 * A report with what the calendars leave out filled from the company's earnings history (Zacks or MarketBeat): the
 * consensus before the report and the revenue reported, for a line on the report date (within a week); and, for the
 * open card, the company's merged expectations (Yahoo, Finnhub, FMP, Alpha Vantage, the history and its statements).
 */
export function completeReport(r: CalendarReport, c?: Consensus | null): CalendarReport {
  let out = r;
  const day = ms(r.date);
  for (const h of historyFor(r.symbol) ?? []) {
    const zs = h.sales.find((x) => Math.abs(ms(x.date) - day) <= 7 * DAY_MS);
    const ze = h.eps.find((x) => Math.abs(ms(x.date) - day) <= 7 * DAY_MS);
    // One source for both figures, so the surprise compares like with like; a coming report gets the estimate.
    if (zs && (!ok(out.rev.est) || (!ok(out.rev.actual) && ok(zs.actual))) && (ok(zs.est) || ok(zs.actual))) out = { ...out, rev: { est: zs.est, actual: zs.actual, estFrom: ok(zs.est) ? h.source : undefined, actualFrom: ok(zs.actual) ? h.source : undefined } };
    if (ze && ((!ok(out.eps.actual) && ok(ze.actual)) || (!ok(out.eps.est) && !ok(out.eps.actual) && ok(ze.est)))) out = { ...out, eps: { est: ze.est, actual: ze.actual, estFrom: ok(ze.est) ? h.source : undefined, actualFrom: ok(ze.actual) ? h.source : undefined } };
    // The session, when the calendar gives none: the history's, for a report on the same day.
    const t = [zs, ze].find((x) => x?.timing && x.date === r.date)?.timing;
    if (out.timing === '--' && t) out = { ...out, timing: t };
  }
  if (c) {
    const q = [...c.past, c.next, c.following].find((x) => x?.date && Math.abs(x.date - day) <= 7 * DAY_MS);
    if (q) {
      // A reported figure the line lacks comes with its own source's estimate, so the surprise compares like with like.
      const take = (have: CalendarFigure, f: { est: number; actual: number; estFrom?: string; actualFrom?: string }): CalendarFigure => {
        if (!ok(have.actual) && ok(f.actual)) return ok(f.est) ? { est: f.est, actual: f.actual, estFrom: f.estFrom, actualFrom: f.actualFrom } : { ...have, actual: f.actual, actualFrom: f.actualFrom };
        if (!ok(have.est) && ok(f.est)) return { ...have, est: f.est, estFrom: f.estFrom };
        return have;
      };
      out = { ...out, eps: take(out.eps, q.eps), rev: take(out.rev, q.rev) };
    }
  }
  return out;
}

/** The surprise of reported against expected, in percent of the estimate; NaN without both. */
export function surprise(f: CalendarFigure): number {
  return ok(f.actual) && ok(f.est) && f.est !== 0 ? ((f.actual - f.est) / Math.abs(f.est)) * 100 : NaN;
}

/**
 * The ticker, opening the security (looked up first when the app does not hold it yet). With children it is a larger
 * target (a company's tile on the week's board) holding them instead of the ticker.
 */
export function Ticker({ symbol, className = 'sec-link', title, children }: { symbol: string; className?: string; title?: string; children?: ReactNode }) {
  const panel = usePanelId();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={title ?? `${symbol} US — click to open, shift-click for the next panel`}
      aria-busy={busy || undefined}
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
      {children ?? `${symbol} US`}
      {busy ? '…' : ''}
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
function EarningsCard({ r: line }: { r: CalendarReport }) {
  const panel = usePanelId();
  const [def, setDef] = useState<SecurityDef | undefined>(() => engine.get(appId(line.symbol)));
  useEffect(() => {
    if (def) return;
    let live = true;
    void lookupSecurity(line.symbol, false).then((x) => live && x.ok && setDef(x.def));
    return () => {
      live = false;
    };
  }, [line.symbol, def]);
  historyData.use((s) => s.v);
  useEffect(() => void loadHistory(line.symbol), [line.symbol]);
  const c = useConsensus(def);
  const r = completeReport(line, c);
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
        <td className={`num ${v.cls}`}>{v.text || (ok(f.actual) ? (ok(f.est) ? 'sources differ' : 'no estimate given') : ok(f.est) ? 'not reported yet' : 'not given')}</td>
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

/** Companies worth more than this are tagged on the calendar. */
export const MEGA_CAP = 500e9;

/** The tag for a company worth more than $500 billion. */
export function MegaTag() {
  return (
    <span className="badge mega" title="Market value above $500 billion">
      500B+
    </span>
  );
}

const SIGN = (v: number) => (v > 0.05 ? 'up' : v < -0.05 ? 'dn' : '');
const pctText = (v: number) => (ok(v) ? `${v > 0 ? '+' : ''}${fmtNum(v, Math.abs(v) < 99.95 ? 1 : 0)}%` : '');
const epsText = (v: number) => (ok(v) ? fmtNum(v, Math.abs(v) >= 100 ? 1 : 2) : '');
const revText = (v: number) => (ok(v) ? fmtBig(v) : '');

const MarketRow = memo(
  function MarketRow({ r, rowKey, open, today, onToggle }: RowProps) {
    const es = r.eps.estFrom === r.eps.actualFrom ? surprise(r.eps) : NaN;
    const rs = r.rev.estFrom === r.rev.actualFrom ? surprise(r.rev) : NaN;
    const pending = !ok(r.eps.actual) && !ok(r.rev.actual) && ms(r.date) >= ms(today);
    // Reported in the last days, but the sources have no figures yet.
    const awaiting = !pending && !ok(r.eps.actual) && ms(today) - ms(r.date) <= 5 * DAY_MS;
    return (
      <tr className={`click${open ? ' sel' : ''}`} onClick={() => onToggle(rowKey)} title={[from(r.eps) && `EPS ${from(r.eps)}`, from(r.rev) && `Revenue ${from(r.rev)}`].filter(Boolean).join(' · ') || 'Click for the earnings card'}>
        <td className="ellipsis evts-co">
          <Ticker symbol={r.symbol} />
          {ok(r.marketCap) && r.marketCap >= MEGA_CAP ? <MegaTag /> : null} <span className="evts-name">{r.name}</span>
        </td>
        <td className="evts-per">{period(r)}</td>
        <td className="num">{epsText(r.eps.est)}</td>
        <td className={`num ${pending ? '' : SIGN(es) || 'white'}`}>{pending ? <span className="amber">due</span> : awaiting ? <span className="muted" title="Reported; the sources have not published the figures yet">awaiting</span> : epsText(r.eps.actual)}</td>
        <td className={`num ${SIGN(es)}`}>{pctText(es)}</td>
        <td className="num hide-m">{revText(r.rev.est)}</td>
        <td className={`num hide-m ${SIGN(rs) || 'white'}`}>{revText(r.rev.actual)}</td>
        <td className={`num hide-m ${SIGN(rs)}`}>{pctText(rs)}</td>
        <td className="num hide-n muted">{ok(r.marketCap) ? <CapLink id={appId(r.symbol)} symbol={r.symbol}>{revText(r.marketCap)}</CapLink> : ''}</td>
        <td className="muted">{TIMING[r.timing]}</td>
      </tr>
    );
  },
  (a, b) => a.sig === b.sig && a.open === b.open && a.today === b.today && a.onToggle === b.onToggle,
);

/**
 * The slice of a long list of equal-height table lines that is in view in its scrolling ancestor, with a margin, so a
 * thousand-line calendar draws a few dozen lines. The line height is measured from a drawn line.
 */
/** What scrolls a screen's lines up and down: the panel body; a table wrapper scrolls only sideways and grows with its table. */
export function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  let scroller: HTMLElement | null = el.closest<HTMLElement>('.panel-body');
  if (!scroller) {
    scroller = el.parentElement;
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.clientHeight < scroller.scrollHeight)) scroller = scroller.parentElement;
  }
  return scroller;
}

function useVisibleRange(ref: RefObject<HTMLTableSectionElement | null>, count: number): { start: number; end: number; rowH: number; first: number; last: number } {
  const [view, setView] = useState({ start: 0, end: Math.min(count, 80), rowH: 20, first: 0, last: Math.min(count, 50) });
  useEffect(() => {
    const body = ref.current;
    if (!body) return;
    const host = scrollerOf(body) ?? document.documentElement;
    const update = () => {
      const line = body.querySelector<HTMLElement>('tr.click, tr.group');
      const rowH = Math.max(14, line?.offsetHeight || 20);
      const top = body.getBoundingClientRect().top - host.getBoundingClientRect().top;
      const margin = 30;
      // The lines on screen (not those under the sticky function header and column headings), and those drawn around them.
      const inset = (host.querySelector<HTMLElement>('.fnh')?.offsetHeight ?? 0) + (body.parentElement?.querySelector('thead')?.getBoundingClientRect().height ?? 0);
      const first = Math.max(0, Math.min(count, Math.floor((inset - top) / rowH)));
      const last = Math.max(first, Math.min(count, Math.ceil((host.clientHeight - top) / rowH)));
      const start = Math.max(0, first - margin);
      const end = Math.min(count, last + margin);
      setView((v) => (v.start === start && v.end === end && v.rowH === rowH && v.first === first && v.last === last ? v : { start, end, rowH, first, last }));
    };
    update();
    host.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      host.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, count]);
  return { ...view, end: Math.min(view.end, count), last: Math.min(view.last, count) };
}

export function MarketEarnings({ cal, minCap, caps, onCap, now, spansPast = false }: { cal: MarketCalendar; minCap: number; caps: { v: number; label: string }[]; onCap: (v: number) => void; now: number; spansPast?: boolean }) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // A window around today opens on the latest trading day (Friday at a weekend): the days before it are folded into
  // one line above it, to show on demand.
  const [showPast, setShowPast] = useState(false);
  const q = filter.trim().toLowerCase();
  // Earnings histories arrive for the lines in view; the lines are completed from them.
  const zv = historyData.use((s) => s.v);
  const rows = useMemo(
    () =>
      cal.reports
        .filter((r) => (minCap <= 0 || (ok(r.marketCap) && r.marketCap >= minCap)) && (!q || `${r.symbol} ${r.name}`.toLowerCase().includes(q)))
        .map((r) => completeReport(r))
        .sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.timing] - ORDER[b.timing] || (ok(b.marketCap) ? b.marketCap : 0) - (ok(a.marketCap) ? a.marketCap : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cal.reports, minCap, q, zv],
  );
  // New York's dates, as the calendar's.
  const today = localDate(US_MARKET, now);
  const session = latestSession(US_MARKET, now);
  const cols = 10;
  const toggle = useCallback((key: string) => setOpen((o) => (o === key ? null : key)), []);
  const past = spansPast ? rows.filter((r) => r.date < session) : [];
  const folded = past.length > 0 && !showPast && !q;
  // One flat list of day headings and lines; only the lines in view (and a margin) are drawn, the rest is spacer.
  const flat = useMemo(() => {
    const list: ({ kind: 'fold' } | { kind: 'day'; date: string } | { kind: 'row'; r: CalendarReport; key: string; sig: string })[] = [];
    if (past.length && !q) list.push({ kind: 'fold' });
    let lastDay = '';
    for (const r of folded ? rows.filter((x) => x.date >= session) : rows) {
      if (r.date !== lastDay) {
        lastDay = r.date;
        list.push({ kind: 'day', date: r.date });
      }
      list.push({ kind: 'row', r, key: `${r.symbol}|${r.date}`, sig: signature(r) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, folded, session, q]);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const view = useVisibleRange(bodyRef, flat.length);
  // The column headings stay in view under the function's header while the calendar scrolls.
  const [headTop, setHeadTop] = useState(0);
  useEffect(() => {
    const fnh = bodyRef.current?.closest<HTMLElement>('.panel-body')?.querySelector<HTMLElement>('.fnh');
    if (!fnh) return;
    const measure = () => setHeadTop(fnh.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(fnh);
    return () => ro.disconnect();
  }, []);
  // A new window (another tab) opens on today again.
  const windowKey = `${cal.days}|${spansPast}`;
  const lastWindow = useRef(windowKey);
  useEffect(() => {
    if (lastWindow.current === windowKey) return;
    lastWindow.current = windowKey;
    setShowPast(false);
  }, [windowKey]);
  const chosen = open ? rows.find((r) => `${r.symbol}|${r.date}` === open) : undefined;
  // Lines in view without the revenue expected (or, once reported, the revenue reported): ask for those companies'
  // earnings histories (Finviz's two years; paced in the main process).
  // The lines on screen first, then those just above and below; none while the calendar's days are still loading
  // (the list then opens at today).
  const lacks = (x: (typeof flat)[number]) => x.kind === 'row' && (!ok(x.r.rev.est) || (ms(x.r.date) <= ms(today) && (!ok(x.r.rev.actual) || !ok(x.r.eps.actual))));
  const missing = cal.loading
    ? ''
    : [...flat.slice(view.first, view.last), ...flat.slice(view.last, view.end), ...flat.slice(view.start, view.first).reverse()]
        .filter(lacks)
        .map((x) => (x.kind === 'row' ? x.r.symbol : ''))
        .join(',');
  useEffect(() => wantHistories(missing.split(',').filter(Boolean)), [missing]);
  useEffect(() => () => wantHistories([]), []);
  const out: ReactNode[] = [];
  if (view.start > 0) out.push(<tr key="pad-top" aria-hidden="true" style={{ height: view.start * view.rowH }} />);
  const pastDays = new Set(past.map((r) => r.date));
  // Showing the earlier days puts them above the latest trading day without moving it: the screen scrolls by the
  // lines added (or taken away), all one height.
  const keepAt = useRef<number | null>(null);
  const toggleFold = () => {
    const scroller = scrollerOf(bodyRef.current);
    const moved = (pastDays.size + past.length) * view.rowH;
    if (scroller) keepAt.current = scroller.scrollTop + (folded ? moved : -moved);
    setShowPast((v) => !v);
  };
  useLayoutEffect(() => {
    const top = keepAt.current;
    keepAt.current = null;
    const scroller = scrollerOf(bodyRef.current);
    if (top != null && scroller) scroller.scrollTop = Math.max(0, top);
  }, [showPast]);
  for (const item of flat.slice(view.start, view.end)) {
    if (item.kind === 'fold') {
      out.push(
        <tr key="fold" className="group click evts-fold" onClick={toggleFold} title={folded ? 'Show the reports of the days before the latest trading day, above it' : 'Fold the days before the latest trading day away'}>
          <td colSpan={cols}>
            {folded ? '▸' : '▾'} Earlier in this window: {past.length ? `${fmtDay(ms(past[0].date))} to ${fmtDay(ms(past[past.length - 1].date))}` : ''} · {pastDays.size} {pastDays.size === 1 ? 'day' : 'days'},{' '}
            {past.length} {past.length === 1 ? 'report' : 'reports'} · <span className="amber">{folded ? 'show' : 'hide'}</span>
          </td>
        </tr>,
      );
    } else if (item.kind === 'day') {
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
      <div className="tbl-wrap evts-wrap" style={{ ['--evts-head-top' as string]: `${headTop}px` }}>
        <table className="tbl evts-mkt">
          <colgroup>
            <col />
            <col style={{ width: 74 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col className="hide-m" style={{ width: 82 }} />
            <col className="hide-m" style={{ width: 82 }} />
            <col className="hide-m" style={{ width: 70 }} />
            <col className="hide-n" style={{ width: 78 }} />
            <col style={{ width: 62 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Company</th>
              <th title="The fiscal quarter reported (or its last month)">Period</th>
              <th className="num" title="The analysts' EPS estimate">EPS Est</th>
              <th className="num" title="EPS reported on the analysts' basis (usually adjusted)">EPS Act</th>
              <th className="num" title="Reported against the estimate, from one source">Surp</th>
              <th className="num hide-m" title="The analysts' revenue estimate">Rev Est</th>
              <th className="num hide-m" title="Revenue reported">Rev Act</th>
              <th className="num hide-m" title="Reported against the estimate, from one source">Surp</th>
              <th className="num hide-n" title="Market value, US dollars (Nasdaq)">Mkt Cap</th>
              <th>Time</th>
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
        <div>
          <span className="amber">Sources</span> Nasdaq earnings calendar: EPS, market value, time · Finviz, Zacks or MarketBeat: revenue and past estimates, read for the lines in view
          {cal.revenueFrom.length ? ` · ${cal.revenueFrom.join(', ')}: revenue` : ''}
        </div>
        <div>
          <span className="amber">Reading</span> EPS on the analysts&apos; basis (usually adjusted) · Surp: reported against expected, from one source · <span className="up">green</span> beat, <span className="dn">red</span> missed · <span className="amber">due</span>: not reported yet · awaiting: reported, figures not published yet · click a line for its card
        </div>
        {cal.problems.length ? ` ${cal.problems.slice(0, 3).join(' ')}` : ''}
      </div>
    </div>
  );
}
