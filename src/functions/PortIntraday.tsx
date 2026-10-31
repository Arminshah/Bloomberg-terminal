import { Fragment, useState, type ReactNode } from 'react';
import { fmtDay, fmtNum, fmtSigned } from '../core/format';
import { engine, useTick } from '../data/market';
import { BOARD_INDICES, membersAvailable, useIndexList, useIndexMembers } from '../data/live/index-members';
import { CLASS_LABEL } from '../data/registry';
import { COUNTRY_NAMES } from '../data/eco';
import { buckets, movers, type Bucket, type PortLine } from '../data/port-intraday';
import { SecLink } from '../components/cells';
import { portfolio } from '../terminal/userdata';
import { basePerPrice, isMargined, navValue } from '../terminal/portfolio';

export type Classification = 'GICS Sector' | 'Country' | 'Asset Class';

/** A rise green and a fall red, as the frame colours the contribution columns. */
function Signed({ v, dec = 2 }: { v: number; dec?: number }) {
  if (!Number.isFinite(v)) return <span className="muted">--</span>;
  return <span className={v > 0 ? 'up' : v < 0 ? 'dn' : ''}>{fmtSigned(v, dec)}</span>;
}

const num = (v: number, dec = 2) => (Number.isFinite(v) && v !== 0 ? fmtNum(v, dec) : Number.isFinite(v) ? fmtNum(0, dec) : '');

/**
 * PORT's Intraday tab, as PT_PORT_Enterprise_attribution 0:09 draws it: the Intraday Navigator at the left, a Summary
 * strip (contribution to return against the benchmark, the movers by bucket and by security), and the portfolio
 * against its benchmark by GICS sector: counts, weights, contributions and returns, with their differences.
 */
/** Nasdaq's sector names on its stock list, as GICS sectors (used only when neither the S&P 500's list nor the app has one). */
const NASDAQ_TO_GICS: Record<string, string> = {
  Technology: 'Information Technology', Telecommunications: 'Communication Services', Finance: 'Financials', 'Basic Materials': 'Materials',
  'Health Care': 'Health Care', 'Real Estate': 'Real Estate', 'Consumer Discretionary': 'Consumer Discretionary', 'Consumer Staples': 'Consumer Staples',
  Industrials: 'Industrials', Energy: 'Energy', Utilities: 'Utilities',
};

export interface PortException {
  id: string;
  why: string;
}

/**
 * The portfolio against its benchmark, bucketed by `classification`: the figures the Intraday, Characteristics and
 * Attribution tabs share.
 *
 * The portfolio's weights are each holding's exposure at the previous close over the net asset value then (securities
 * at market, futures at full notional, shorts below zero, cash as a line), so they add to 100 and each contribution is
 * the holding's day P&L over that value, the day return Holdings shows. A holding without a confirmed change or an
 * exchange rate is an exception and leaves the totals blank.
 *
 * The benchmark's members come from IMAP's index data (the desktop app). Its columns wait until members holding 95% of
 * its weight are priced; a sector's return is then its priced members'. Members of the Nasdaq-100 and the Dow take
 * their GICS sector from the S&P 500's list, or the app's own, before Nasdaq's sector names.
 */
export function usePortVsBench(classification: Classification = 'GICS Sector') {
  const st = portfolio.use((s) => s);
  const base = st.base ?? 'USD';
  const benchIsBoard = !!BOARD_INDICES[st.benchmark];
  const board = useIndexMembers(benchIsBoard ? st.benchmark : undefined);
  const spxList = useIndexList(benchIsBoard && st.benchmark !== 'SPX Index' ? 'SPX Index' : undefined);
  const gicsBySymbol = new Map((spxList?.members ?? []).map((m) => [m.symbol, m.sector]));
  const members = board?.members ?? [];
  const weightAll = members.reduce((a, m) => a + (Number.isFinite(m.weight) ? m.weight : 0), 0);
  const weightPriced = members.reduce((a, m) => a + (Number.isFinite(m.weight) && Number.isFinite(m.pct) ? m.weight : 0), 0);
  const benchReady = weightAll > 0 && weightPriced >= 0.95 * weightAll;
  const pricedCount = members.filter((m) => Number.isFinite(m.pct)).length;

  const exceptions: PortException[] = [];
  let navNow = Number.isFinite(st.cash) ? st.cash : 0;
  let dayPnl = 0;
  const raw: { id: string; name: string; bucket: string; exposure: number; ret: number; margined: boolean; value: number }[] = [];
  for (const p of st.positions) {
    const d = engine.get(p.id);
    const q = engine.quote(p.id);
    if (!d || !q) {
      exceptions.push({ id: p.id, why: d ? 'no price yet' : 'unknown security' });
      continue;
    }
    const k = basePerPrice(d, base);
    if (!Number.isFinite(k)) exceptions.push({ id: p.id, why: `no exchange rate into ${base} yet` });
    const confirmed = q.chgCheck !== 'unverified' && Number.isFinite(q.chg) && Number.isFinite(q.pct);
    if (!confirmed) exceptions.push({ id: p.id, why: 'no confirmed day change yet' });
    const prev = confirmed ? q.last - q.chg : q.last;
    navNow += navValue(d, p.qty, q.last, p.cost, base);
    if (confirmed) dayPnl += p.qty * q.chg * k;
    const bucket = classification === 'GICS Sector' ? d.eq?.sector ?? CLASS_LABEL[d.cls] : classification === 'Country' ? COUNTRY_NAMES[d.country] ?? (d.country || 'Unclassified') : CLASS_LABEL[d.cls];
    raw.push({ id: p.id, name: d.name, bucket, exposure: p.qty * prev * k, ret: confirmed ? q.pct : NaN, margined: isMargined(d), value: p.qty * q.last * k });
  }
  const navPrev = navNow - dayPnl;
  const navOk = Number.isFinite(navPrev) && navPrev > 0;
  const port: PortLine[] = raw.map((r) => ({ id: r.id, name: r.name, bucket: r.bucket, weight: navOk ? (r.exposure / navPrev) * 100 : NaN, ret: r.ret }));
  const held = port.reduce((a, l) => a + (Number.isFinite(l.weight) ? l.weight : 0), 0);
  if (navOk && port.length && Math.abs(100 - held) > 1e-6) port.push({ name: 'Cash and Financing', bucket: 'Cash', weight: 100 - held, ret: 0 });
  if (!navOk && st.positions.length) exceptions.push({ id: st.name, why: 'net asset value not positive or not known' });

  let mapped = 0;
  const sectorOf = (m: (typeof members)[number]) => {
    if (st.benchmark === 'SPX Index') return m.sector || 'Unclassified';
    const fromSpx = gicsBySymbol.get(m.symbol);
    if (fromSpx) return fromSpx;
    const own = m.id ? engine.get(m.id)?.eq?.sector : undefined;
    if (own) return own;
    if (NASDAQ_TO_GICS[m.sector]) {
      mapped++;
      return NASDAQ_TO_GICS[m.sector];
    }
    return m.sector && Object.values(NASDAQ_TO_GICS).includes(m.sector) ? m.sector : 'Unclassified';
  };
  const bench: PortLine[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    bucket: classification === 'GICS Sector' ? sectorOf(m) : classification === 'Country' ? COUNTRY_NAMES[m.country] ?? (m.country || 'Unclassified') : 'Equity',
    weight: m.weight * 100,
    ret: m.pct,
  }));
  const { rows, total } = buckets(port, bench, classification === 'GICS Sector' ? undefined : []);
  const benchName = engine.get(st.benchmark)?.ticker ?? st.benchmark;
  const secValue = raw.reduce((a, r) => a + (!r.margined && Number.isFinite(r.value) ? r.value : 0), 0);
  const futNotional = raw.reduce((a, r) => a + (r.margined && Number.isFinite(r.value) ? r.value : 0), 0);
  const weightsFrom = board?.weightsFrom
    ? `State Street's SPY holdings of ${fmtDay(Date.parse(`${board.weightsFrom.asOf}T00:00:00Z`))} at each member's previous close`
    : BOARD_INDICES[st.benchmark]?.weighting === 'price'
      ? "the members' previous closes (the index is price-weighted)"
      : "estimates from Nasdaq's market values (the index's own float adjustments are not published)";
  const benchNote = benchReady
    ? `Benchmark weights: ${weightsFrom}; members' day changes from their previous close${pricedCount < members.length ? `; ${pricedCount} of ${members.length} members priced, a sector's return is its priced members'` : ''}${mapped ? `; ${mapped} members' sectors mapped from Nasdaq's names` : ''}.`
    : benchIsBoard
      ? membersAvailable()
        ? `Loading ${benchName}'s members and prices (${pricedCount} of ${members.length || '…'} priced)…`
        : `${benchName}'s members load in the desktop app; the benchmark columns are blank here.`
      : `${benchName} has no member list here: the benchmark columns need the S&P 500, the Nasdaq-100 or the Dow (set it on 7) Performance).`;
  return { st, base, benchIsBoard, benchReady, members, port, bench, rows, total, benchName, exceptions, nav: navNow, secValue, futNotional, benchNote };
}

export function PortIntraday({ onHoldings }: { onHoldings?: () => void }) {
  useTick(2);
  const [diffs, setDiffs] = useState(true);
  const [classification, setClassification] = useState<Classification>('GICS Sector');
  const [open, setOpen] = useState<string[]>([]);
  const [navOpen, setNavOpen] = useState(true);
  const { st, base, benchReady, rows, total, benchName, exceptions, benchNote } = usePortVsBench(classification);
  const toggle = (n: string) => setOpen((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]));
  const bucketMovers = movers(rows, (r) => r.ctrDiff);
  const secMovers = movers(rows.flatMap((r) => r.lines), (l) => l.ctr);
  const retMovers = movers(rows.filter((r) => Number.isFinite(r.retDiff)), (r) => r.retDiff);
  const bar = (v: number, max: number) => <i className={`port-bar ${v >= 0 ? 'up' : 'dn'}`} style={{ width: `${Math.min(100, (Math.abs(v) / (max || 1)) * 100)}%` }} />;
  const maxB = Math.max(...bucketMovers.map((r) => Math.abs(r.ctrDiff)), 0);
  const maxS = Math.max(...secMovers.map((l) => Math.abs(l.ctr)), 0);
  const diffCell = (v: number, dec = 2) => (diffs ? <td className="num"><Signed v={v} dec={dec} /></td> : null);
  return (
    <div className={`port-intra${navOpen ? '' : ' nav-closed'}`} data-testid="port-intraday">
      {navOpen ? (
        <aside className="port-nav" aria-label="Intraday Navigator">
          <div className="port-nav-h">
            Intraday Navigator
            <button type="button" className="port-nav-x" onClick={() => setNavOpen(false)} title="Hide the navigator">«</button>
          </div>
          <div className="port-nav-sec">Report Definition</div>
          <label className="port-nav-row"><input type="checkbox" checked readOnly /> Portfolio <span className="port-fld">{st.name}</span></label>
          <label className="port-nav-row"><input type="checkbox" checked={benchReady} readOnly /> Benchmark <span className="port-fld">{benchName}</span></label>
          <label className="port-nav-row"><input type="checkbox" checked={diffs} onChange={(e) => setDiffs(e.target.checked)} /> Differences</label>
          <div className="port-nav-sec">Currency</div>
          <span className="port-fld">Default ({base})</span>
          <div className="port-nav-sec">Classification</div>
          <select className="sel-inp" aria-label="Classification" value={classification} onChange={(e) => setClassification(e.target.value as Classification)}>
            <option>GICS Sector</option>
            <option>Country</option>
            <option>Asset Class</option>
          </select>
          <div className="port-nav-sec">Intraday Field Settings</div>
          <div className="port-nav-kv"><span>Display Units</span><span className="port-fld">Percentage</span></div>
          <div className="port-nav-kv"><span>Perf Start Time</span><span className="port-fld">Previous Close</span></div>
          <div className="port-nav-kv"><span>Analytics Level</span><span className="port-fld">Security</span></div>
        </aside>
      ) : (
        <button type="button" className="port-nav-open" onClick={() => setNavOpen(true)} title="Show the Intraday Navigator">»</button>
      )}
      <div className="port-main">
        <div className="port-summary" data-testid="port-summary">
          <div className="port-box">
            <div className="port-box-h">Contr To Return <span className="muted">vs {benchName}</span></div>
            <div className={`port-big ${total.ctrDiff >= 0 ? 'up' : 'dn'}`}>{Number.isFinite(total.ctrDiff) && benchReady ? fmtSigned(total.ctrDiff, 2) : '--'}</div>
            <div className="port-kv"><span className="amber">{st.name}</span><span>{Number.isFinite(total.ctrPort) ? fmtNum(total.ctrPort, 2) : '--'}</span></div>
            <div className="port-kv"><span className="amber">{benchName}</span><span>{benchReady && Number.isFinite(total.ctrBench) ? fmtNum(total.ctrBench, 2) : '--'}</span></div>
          </div>
          <div className="port-box">
            <div className="port-box-h">CTR Movers <span className="muted">Buckets</span></div>
            {bucketMovers.map((r) => (
              <div key={r.name} className="port-mv"><span className="amber">{r.name}</span><span>{fmtNum(r.ctrDiff, 2)}</span>{bar(r.ctrDiff, maxB)}</div>
            ))}
          </div>
          <div className="port-box">
            <div className="port-box-h">CTR Movers <span className="muted">Securities</span></div>
            {secMovers.map((l) => (
              <div key={l.id ?? l.name} className="port-mv"><span className="amber">{l.name}</span><span>{fmtNum(l.ctr, 2)}</span>{bar(l.ctr, maxS)}</div>
            ))}
          </div>
          <div className="port-box">
            <div className="port-box-h">Most Tot Ret Diff</div>
            {retMovers.map((r) => (
              <div key={r.name} className="port-mv"><span className="amber">{r.name}</span><Signed v={r.retDiff} /></div>
            ))}
          </div>
        </div>
        {st.positions.length === 0 ? (
          <div className="empty">
            No holdings in {st.name} yet.{' '}
            {onHoldings ? (
              <button type="button" className="link-btn amber" onClick={onHoldings}>
                Add them on 2) Holdings
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="port-colset">
          <span>Column Set</span> <span className="port-fld">Default</span>
        </div>
        <table className="tbl port-grid" data-testid="port-grid">
          <thead>
            <tr className="port-grid-top">
              <th />
              <th className="num" colSpan={2}>#</th>
              <th className="num" colSpan={diffs ? 3 : 2}>% Wgt</th>
              <th className="num" colSpan={diffs ? 3 : 2}>Contribution to Return</th>
              <th className="num" colSpan={diffs ? 3 : 2}>Total Return</th>
            </tr>
            <tr>
              <th>{classification === 'GICS Sector' ? 'Classification' : classification}</th>
              <th className="num">Port</th>
              <th className="num">Bmrk</th>
              {['% Wgt', 'Contribution to Return', 'Total Return'].map((g) => (
                <Fragment key={g}>
                  <th className="num">Port</th>
                  <th className="num">Bmrk</th>
                  {diffs ? <th className="num">Diff</th> : null}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            <BucketRow b={total} total bench={benchReady} diffCell={diffCell} />
            {rows.map((r) => (
              <Fragment key={r.name}>
                <BucketRow b={r} bench={benchReady} diffCell={diffCell} open={open.includes(r.name)} onToggle={r.lines.length ? () => toggle(r.name) : undefined} />
                {open.includes(r.name)
                  ? r.lines.map((l) => (
                      <tr key={l.id ?? l.name} className="port-line">
                        <td className="port-indent">{l.id ? <SecLink id={l.id}>{l.name}</SecLink> : l.name}</td>
                        <td className="num">1</td>
                        <td className="num">{l.wBench > 0 ? 1 : ''}</td>
                        <td className="num">{num(l.weight)}</td>
                        <td className="num">{l.wBench > 0 ? num(l.wBench) : ''}</td>
                        {diffCell(benchReady ? l.weight - l.wBench : NaN)}
                        <td className="num"><Signed v={l.ctr} /></td>
                        <td className="num" />
                        {diffs ? <td className="num" /> : null}
                        <td className="num"><Signed v={l.ret} /></td>
                        <td className="num" />
                        {diffs ? <td className="num" /> : null}
                      </tr>
                    ))
                  : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="port-foot">
          <span className={exceptions.length ? 'dn' : 'muted'} title={exceptions.map((x) => `${x.id}: ${x.why}`).join('\n')} data-testid="port-exceptions">Exceptions ({exceptions.length})</span>
          <span className="muted">{benchNote}</span>
        </div>
      </div>
    </div>
  );
}

function BucketRow({ b, total, bench, diffCell, open, onToggle }: { b: Bucket; total?: boolean; bench: boolean; diffCell: (v: number, dec?: number) => ReactNode; open?: boolean; onToggle?: () => void }) {
  const bv = (v: number) => (bench ? v : NaN);
  return (
    <tr className={total ? 'port-total' : onToggle ? 'click' : ''} onClick={onToggle} aria-expanded={onToggle ? !!open : undefined}>
      <td>
        {total ? <span className="port-caret">▾</span> : <span className="port-caret">{onToggle ? (open ? '▾' : '▸') : ''}</span>}
        {b.name}
      </td>
      <td className="num">{b.nPort}</td>
      <td className="num">{bench ? b.nBench : ''}</td>
      <td className="num">{num(b.wPort)}</td>
      <td className="num">{bench ? num(b.wBench) : ''}</td>
      {diffCell(bv(b.wDiff))}
      <td className="num"><Signed v={b.ctrPort} /></td>
      <td className="num">{bench ? <Signed v={b.ctrBench} /> : ''}</td>
      {diffCell(bv(b.ctrDiff))}
      <td className="num"><Signed v={b.retPort} /></td>
      <td className="num">{bench ? <Signed v={b.retBench} /> : ''}</td>
      {diffCell(bv(b.retDiff))}
    </tr>
  );
}
