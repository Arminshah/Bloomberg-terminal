import { useState } from 'react';
import { fmtNum, fmtSigned } from '../core/format';
import { useTick } from '../data/market';
import { attribution, securitySelection } from '../data/port-attribution';
import { SecLink } from '../components/cells';
import { usePortVsBench } from './PortIntraday';

const pct = (v: number, dec = 2) => (Number.isFinite(v) ? fmtNum(v, dec) : '--');

function Signed({ v, dec = 2 }: { v: number; dec?: number }) {
  if (!Number.isFinite(v)) return <span className="muted">--</span>;
  return <span className={v > 0 ? 'up' : v < 0 ? 'dn' : ''}>{fmtSigned(v, dec)}</span>;
}

/**
 * PORT's Attribution tab, as PT_PORT_Enterprise_attribution 0:14 draws it: a Summary strip (Outperformance with the
 * portfolio's and the benchmark's returns as bars, Global Details, the attribution effects), then Overview, the top and
 * bottom contributors by security selection, and Asset Allocation & Security Selection, the effects by sector. The
 * period is today, from each line's previous close; the model is two-effect Brinson-Fachler on GICS sectors.
 */
export function PortAttribution() {
  useTick(2);
  const [view, setView] = useState<'overview' | 'sectors'>('overview');
  const { st, benchReady, rows, total, benchName, benchNote } = usePortVsBench('GICS Sector');
  const a = attribution(rows, total);
  const sel = securitySelection(rows).sort((x, y) => y.effect - x.effect);
  const top = sel.filter((s) => s.effect > 0).slice(0, 10);
  const bottom = sel.filter((s) => s.effect < 0).slice(-10);
  const maxSel = Math.max(...sel.map((s) => Math.abs(s.effect)), 0) || 1;
  const show = benchReady && st.positions.length > 0;
  const barH = (v: number) => {
    const m = Math.max(Math.abs(a.port), Math.abs(a.bench), 0) || 1;
    return `${Math.max(2, (Math.abs(v) / m) * 100)}%`;
  };
  return (
    <div className="port-attr" data-testid="port-attribution">
      <div className="port-summary port-attr-summary">
        <div className="port-box">
          <div className="port-box-h">Outperformance</div>
          <div className="port-attr-out">
            <div>
              <div className={`port-big ${a.active >= 0 ? 'up' : 'dn'}`} data-testid="attr-active">{show ? `${fmtSigned(a.active, 2)} %` : '--'}</div>
              <div className="port-kv"><span className="amber">Port</span><span>{show ? pct(a.port) : '--'}</span></div>
              <div className="port-kv"><span className="amber">Bmrk</span><span>{show ? pct(a.bench) : '--'}</span></div>
            </div>
            {show ? (
              <div className="port-attr-bars" aria-hidden="true">
                <i className={a.port >= 0 ? 'up' : 'dn'} style={{ height: barH(a.port) }} />
                <i className={a.bench >= 0 ? 'up' : 'dn'} style={{ height: barH(a.bench) }} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="port-box">
          <div className="port-box-h">Global Details</div>
          <div className="port-kv"><span className="amber">Attribution Effects</span><span>{show ? <Signed v={a.allocation + a.selection} /> : '--'}</span></div>
          <div className="port-kv" title="Returns are each line's own, in its trading currency: currency effects are not split out"><span className="amber">FX Allocation &amp; Hedging</span><span className="muted">--</span></div>
        </div>
        <div className="port-box">
          <div className="port-box-h">Attribution Effects</div>
          <div className="port-kv"><span className="amber">Security Selection</span><span>{show ? <Signed v={a.selection} /> : '--'}</span></div>
          <div className="port-kv"><span className="amber">Asset Allocation</span><span>{show ? <Signed v={a.allocation} /> : '--'}</span></div>
        </div>
      </div>
      <nav className="tabs tabs-plain port-attr-views" aria-label="Attribution views">
        <button type="button" className={`tab${view === 'overview' ? ' on' : ''}`} onClick={() => setView('overview')}>Overview</button>
        <button type="button" className={`tab${view === 'sectors' ? ' on' : ''}`} onClick={() => setView('sectors')}>Asset Allocation &amp; Security Selection</button>
      </nav>
      {!show ? (
        <div className="empty">{st.positions.length ? benchNote : `No holdings in ${st.name} yet: add them on 2) Holdings.`}</div>
      ) : view === 'overview' ? (
        <section aria-label="Top/Bottom Contributors by Security Selection">
          <div className="port-attr-h">Top/Bottom Contributors by Security Selection</div>
          <table className="tbl port-attr-list" data-testid="attr-contributors">
            <thead>
              <tr>
                <th className="num">Neg Outper</th>
                <th>Instrument Name</th>
                <th className="num">Outper</th>
                <th>Pos Outper</th>
              </tr>
            </thead>
            <tbody>
              <tr className="port-attr-group"><td /><td colSpan={3}>Top Contributors</td></tr>
              {top.map((s) => (
                <tr key={`t-${s.id ?? s.name}`}>
                  <td />
                  <td className="amber">{s.id ? <SecLink id={s.id}>{s.name}</SecLink> : s.name}</td>
                  <td className="num up">{fmtNum(s.effect, 2)}</td>
                  <td><i className="port-bar up" style={{ width: `${(Math.abs(s.effect) / maxSel) * 100}%` }} /></td>
                </tr>
              ))}
              <tr className="port-attr-group"><td /><td colSpan={3}>Bottom Contributors</td></tr>
              {bottom.map((s) => (
                <tr key={`b-${s.id ?? s.name}`}>
                  <td className="port-attr-neg"><i className="port-bar dn" style={{ width: `${(Math.abs(s.effect) / maxSel) * 100}%` }} /></td>
                  <td className="amber">{s.id ? <SecLink id={s.id}>{s.name}</SecLink> : s.name}</td>
                  <td className="num dn">{fmtNum(s.effect, 2)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <table className="tbl port-grid" data-testid="attr-sectors">
          <thead>
            <tr>
              <th>GICS Sector</th>
              <th className="num">Port Wgt</th>
              <th className="num">Bmrk Wgt</th>
              <th className="num">Port Rtn</th>
              <th className="num">Bmrk Rtn</th>
              <th className="num">Allocation</th>
              <th className="num">Selection</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="port-total">
              <td>Total</td>
              <td className="num">{pct(total.wPort)}</td>
              <td className="num">{pct(total.wBench)}</td>
              <td className="num"><Signed v={a.port} /></td>
              <td className="num"><Signed v={a.bench} /></td>
              <td className="num"><Signed v={a.allocation} /></td>
              <td className="num"><Signed v={a.selection} /></td>
              <td className="num"><Signed v={a.active} /></td>
            </tr>
            {a.rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{pct(r.wPort)}</td>
                <td className="num">{pct(r.wBench)}</td>
                <td className="num">{r.wPort > 0 ? <Signed v={r.retPort} /> : ''}</td>
                <td className="num">{r.wBench > 0 ? <Signed v={r.retBench} /> : ''}</td>
                <td className="num"><Signed v={r.allocation} /></td>
                <td className="num"><Signed v={r.selection} /></td>
                <td className="num"><Signed v={r.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="note">
        Today, from each line&apos;s previous close, against {benchName}; percent and percentage points. Two-effect Brinson-Fachler on GICS sectors: Allocation = (portfolio weight − benchmark weight) × (benchmark sector return − benchmark return); Selection = portfolio weight × (portfolio sector return − benchmark sector return), interaction included; the two add up to the outperformance. A holding&apos;s share of selection is its weight × (its return − its sector&apos;s benchmark return). {benchReady ? benchNote : ''}
      </div>
    </div>
  );
}
