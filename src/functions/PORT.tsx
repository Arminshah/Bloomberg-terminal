import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, KV, LivePx, SecLink, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { CLASS_LABEL, resolveSecurity } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { flash, usePanelId } from '../terminal/panel';
import { portfolio, type Position } from '../terminal/userdata';
import { adjustPosition, isMargined, navValue, usdPerPrice } from '../terminal/portfolio';
import type { FnProps } from '../terminal/types';
import { PortfolioPerformance, PortfolioRisk } from './PortfolioRisk';

export { multiplier } from '../terminal/portfolio';

interface Line {
  p: Position;
  d: SecurityDef;
  px: number;
  /** Exposure in USD (futures at full notional). */
  mv: number;
  /** Contribution to NAV in USD (futures at unrealised P&L). */
  nav: number;
  cost: number;
  day: number;
  total: number;
}

function lines(positions: Position[]): Line[] {
  return positions
    .filter((p) => engine.get(p.id))
    .map((p) => {
      const d = engine.get(p.id)!;
      const q = engine.quote(p.id)!;
      const k = usdPerPrice(d);
      const mv = p.qty * q.last * k;
      return { p, d, px: q.last, mv, nav: navValue(d, p.qty, q.last, p.cost), cost: p.qty * p.cost * k, day: p.qty * q.chg * k, total: p.qty * (q.last - p.cost) * k };
    });
}

function Holdings() {
  const panel = usePanelId();
  useTick(1);
  const st = portfolio.use((s) => s);
  const ls = lines(st.positions);
  const unresolved = st.positions.filter((p) => !engine.get(p.id));
  const mv = unresolved.length ? NaN : ls.reduce((a, l) => a + l.mv, 0);
  const day = ls.reduce((a, l) => a + l.day, 0);
  const tot = ls.reduce((a, l) => a + l.total, 0);
  const grossCost = ls.reduce((a, l) => a + Math.abs(l.cost), 0);
  const nav = unresolved.length ? NaN : st.cash + ls.reduce((a, l) => a + l.nav, 0);
  const futNotional = ls.filter((l) => isMargined(l.d)).reduce((a, l) => a + l.mv, 0);
  // A day's P&L counts only changes against a previous close confirmed for the right session.
  const unconfirmed = (l: Line) => !Number.isFinite(l.day) || engine.quote(l.p.id)?.chgCheck === 'unverified';
  const pending = [...ls.filter(unconfirmed).map((l) => l.d.ticker), ...unresolved.map((p) => p.id)];
  const waiting = (key: string) => (
    <span key={key} className="muted" title={`Waiting for a confirmed previous close: ${pending.join(', ')}`}>
      --
    </span>
  );
  const [sec, setSec] = useState('');
  const [qty, setQty] = useState('');
  const [px, setPx] = useState('');
  const [cash, setCash] = useState('');
  const saveCash = () => {
    const c = Number(cash.replace(/,/g, ''));
    if (!cash.trim() || !Number.isFinite(c)) return flash(panel, 'Enter the cash amount in USD', 'error');
    portfolio.set((s) => ({ ...s, cash: c }));
    setCash('');
    flash(panel, `Cash set to ${fmtNum(c, 0)} USD`, 'info');
  };
  const add = () => {
    const d = resolveSecurity(sec);
    if (!d) return flash(panel, `Unknown security: ${sec}`, 'error');
    if (d.quote === 'yield') return flash(panel, 'A yield reference is not a priced portfolio instrument', 'error');
    const q = Number(qty);
    if (!Number.isFinite(q) || q === 0) return flash(panel, 'Enter a non-zero quantity', 'error');
    const c = px.trim() ? Number(px) : engine.quote(d.id)!.last;
    if (!Number.isFinite(c) || (!isMargined(d) && c < 0)) return flash(panel, 'Enter a valid cost price or wait for a market price', 'error');
    try {
      const adjusted = adjustPosition(st.positions.find((p) => p.id === d.id), d.id, q, c);
      portfolio.set((s) => ({ ...s, positions: [...s.positions.filter((p) => p.id !== d.id), ...(adjusted ? [adjusted] : [])] }));
    } catch { return flash(panel, 'Position quantity or cost is outside the valid range', 'error'); }
    setSec('');
    setQty('');
    setPx('');
    flash(panel, `Added ${q} ${d.ticker}`, 'info');
  };
  return (
    <>
      {unresolved.length > 0 && <div className="note amber" role="status">Some saved holdings are not in the security directory. Resolve or remove them to calculate total NAV: {unresolved.map((p) => <span key={p.id}>{p.id} <button type="button" className="btn" aria-label={`Remove unresolved ${p.id}`} onClick={() => portfolio.set((s) => ({ ...s, positions: s.positions.filter((r) => r.id !== p.id) }))}>Remove</button> </span>)}</div>}
      <div className="cols">
        <Section title="Summary (USD)">
          <KV
            items={[
              ['Net asset value', <span key="n" className="white b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(nav, 0)}</span>],
              ['Securities at market', fmtNum(mv - futNotional, 0)],
              ['Futures notional', fmtNum(futNotional, 0)],
              ['Cash', fmtNum(st.cash, 0)],
              ['Day P&L', pending.length ? waiting('d') : <Chg key="d" v={day} dec={0} />],
              ['Day return', pending.length ? waiting('dr') : <Chg key="dr" v={nav - day > 0 ? (day / (nav - day)) * 100 : NaN} pct />],
              ['Unrealised local-price P&L', <Chg key="u" v={unresolved.length ? NaN : tot} dec={0} />],
              ['Return on absolute cost', <Chg key="rc" v={unresolved.length || grossCost === 0 ? NaN : (tot / grossCost) * 100} pct />],
            ]}
          />
        </Section>
        <Section title="Add or adjust a position">
          <div className="pad row" style={{ gap: 8 }}>
            <input className="inp" placeholder="Security (e.g. AAPL)" aria-label="Security" value={sec} onChange={(e) => setSec(e.target.value)} />
            <input className="inp" style={{ width: 90 }} placeholder="Qty (− to sell)" aria-label="Quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="inp" style={{ width: 90 }} placeholder="Price (mkt)" aria-label="Price" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button type="button" className="btn primary" onClick={add}>
              Add
            </button>
          </div>
          <div className="pad row" style={{ gap: 8 }}>
            <input className="inp" style={{ width: 140 }} placeholder="Cash (USD)" aria-label="Cash in USD" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCash()} />
            <button type="button" className="btn" onClick={saveCash}>
              Set cash
            </button>
          </div>
          <div className="note">
            The portfolio holds only the positions and cash you enter here: there is no order entry and no simulated trading. Futures quantities are contracts and count toward NAV at unrealised P&L; Treasury quantities are face value. A
            blank price records today&apos;s market price as your cost. Adding on the same side averages cost; reducing retains the remaining cost; reversing uses the entered cost for the new side. Cash is adjusted separately.
          </div>
        </Section>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Security</th>
            <th className="hide-m">Class</th>
            <th className="num">Qty</th>
            <th className="num hide-m">Cost</th>
            <th className="num">Last</th>
            <th className="num">Mkt val USD</th>
            <th className="num">Weight</th>
            <th className="num">Day P&L</th>
            <th className="num hide-m">Total P&L</th>
            <th className="num">Return</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ls
            .sort((a, b) => b.mv - a.mv)
            .map((l) => (
              <tr key={l.p.id}>
                <td>
                  <SecLink id={l.p.id}>{l.d.ticker}</SecLink>
                </td>
                <td className="muted hide-m">{CLASS_LABEL[l.d.cls]}</td>
                <td className="num">{fmtNum(l.p.qty, Number.isInteger(l.p.qty) ? 0 : 4)}</td>
                <td className="num hide-m">{fmtNum(l.p.cost, l.d.dec)}</td>
                <td className="num white">
                  <LivePx id={l.p.id} />
                </td>
                <td className="num">{fmtNum(l.mv, 0)}</td>
                <td className="num">{fmtNum(nav > 0 ? (l.mv / nav) * 100 : NaN, 1)}%</td>
                <td className="num">
                  {unconfirmed(l) ? (
                    <span className="muted" title="Waiting for a confirmed previous close">
                      --
                    </span>
                  ) : (
                    <Chg v={l.day} dec={0} />
                  )}
                </td>
                <td className="num hide-m">
                  <Chg v={l.total} dec={0} />
                </td>
                <td className="num">
                  <Chg v={(l.total / Math.abs(l.cost)) * 100} pct dec={1} />
                </td>
                <td>
                  <button type="button" className="act" aria-label={`Remove ${l.p.id}`} onClick={() => portfolio.set((s) => ({ ...s, positions: s.positions.filter((p) => p.id !== l.p.id) }))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
}

export function PORT(_: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const st = portfolio.use((s) => s);
  const csv = () => [['Security', 'Quantity', 'Cost', 'Last', 'Exposure USD'], ...st.positions.map((p) => { const d = engine.get(p.id); const last = engine.quote(p.id)?.last; return [p.id, p.qty, p.cost, d ? last : 'Unknown security', d && last !== undefined ? p.qty * last * usdPerPrice(d) : undefined]; })];
  return (
    <div>
      <FnHeader
        code="PORTFOLIO"
        title="Portfolio & Risk Analytics"
        sub={`${st.name} · the holdings you enter`}
        tabs={[
          { n: 1, label: 'Holdings' },
          { n: 2, label: 'Performance' },
          { n: 3, label: 'Risk & Allocation' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, 'portfolio.csv', csv).map((a) => ({ ...a, label: `${a.label} holdings` }))}
      />
      {tab === 1 ? <Holdings /> : tab === 2 ? <PortfolioPerformance /> : <PortfolioRisk />}
      <div className="note">Current values use source FX marks, which may be delayed or stale. Holdings day/cost P&L translates local price changes at current FX; entry-date FX is not recorded. Holdings are stored {engine.realOnly ? 'on this computer' : 'in this browser'} only.</div>
    </div>
  );
}
