import { Fragment, useState, type ReactNode } from 'react';
import { fmtNum, fmtSigned } from '../core/format';
import { engine, useTick } from '../data/market';
import { BOARD_INDICES, membersAvailable, useIndexMembers } from '../data/live/index-members';
import { CLASS_LABEL } from '../data/registry';
import { COUNTRY_NAMES } from '../data/eco';
import { buckets, movers, toWeights, type Bucket, type PortLine } from '../data/port-intraday';
import { SecLink } from '../components/cells';
import { portfolio } from '../terminal/userdata';
import { basePerPrice } from '../terminal/portfolio';

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
/**
 * The portfolio against its benchmark, bucketed by `classification`: the figures the Intraday, Characteristics and
 * Attribution tabs share. The benchmark's members come from IMAP's index data (the desktop app); until they load, and
 * in the browser, `benchReady` is false and the benchmark's figures are left blank.
 */
export function usePortVsBench(classification: Classification = 'GICS Sector') {
  const st = portfolio.use((s) => s);
  const base = st.base ?? 'USD';
  const benchIsBoard = !!BOARD_INDICES[st.benchmark];
  const board = useIndexMembers(benchIsBoard ? st.benchmark : undefined);
  const benchReady = !!board && board.members.some((m) => Number.isFinite(m.weight));
  const bucketOf = (d: { cls: string; country: string; eq?: { sector: string } }) =>
    classification === 'GICS Sector' ? d.eq?.sector ?? CLASS_LABEL[d.cls as keyof typeof CLASS_LABEL] : classification === 'Country' ? COUNTRY_NAMES[d.country] ?? d.country : CLASS_LABEL[d.cls as keyof typeof CLASS_LABEL];
  const held = st.positions
    .map((p) => {
      const d = engine.get(p.id);
      const q = engine.quote(p.id);
      if (!d || !q) return null;
      const ret = q.chgCheck === 'unverified' ? NaN : q.pct;
      return { id: p.id, name: d.name, bucket: bucketOf(d), mv: p.qty * q.last * basePerPrice(d, base), ret };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const port: PortLine[] = toWeights(held).map(({ mv: _mv, ...l }) => l);
  const members = board?.members ?? [];
  const bench: PortLine[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    bucket: classification === 'GICS Sector' ? m.sector || 'Unclassified' : classification === 'Country' ? COUNTRY_NAMES[m.country] ?? m.country : 'Equity',
    weight: m.weight * 100,
    ret: m.pct,
  }));
  const { rows, total } = buckets(port, bench, classification === 'GICS Sector' ? undefined : []);
  const benchName = engine.get(st.benchmark)?.ticker ?? st.benchmark;
  const exceptions = st.positions.filter((p) => !engine.get(p.id) || !Number.isFinite(engine.quote(p.id)?.pct ?? NaN));
  const mvTotal = held.reduce((x, h) => x + (Number.isFinite(h.mv) ? h.mv : 0), 0);
  const benchNote = benchReady
    ? `Benchmark weights: ${BOARD_INDICES[st.benchmark].from}; members' day changes from their previous close.`
    : benchIsBoard
      ? membersAvailable()
        ? `Loading ${benchName}'s members…`
        : `${benchName}'s members load in the desktop app; the benchmark columns are blank here.`
      : `${benchName} has no member list here: the benchmark columns need the S&P 500, the Nasdaq-100 or the Dow (set it on 7) Performance).`;
  return { st, base, benchIsBoard, benchReady, members, port, bench, rows, total, benchName, exceptions, mvTotal, benchNote };
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
                        {diffCell(l.weight - l.wBench)}
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
          <span className={exceptions.length ? 'dn' : 'muted'} title={exceptions.map((p) => p.id).join(', ')}>Exceptions ({exceptions.length})</span>
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
