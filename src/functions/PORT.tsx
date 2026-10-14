import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { ChartView } from '../components/chart/ChartView';
import type { ChartOptions } from '../components/chart/PriceChart';
import { Chg, HBar, KV, LivePx, SecLink, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { alignedReturns, closeAt } from '../data/analytics';
import { CLASS_LABEL, resolveSecurity } from '../data/registry';
import { makeSeries } from '../data/series';
import type { SecurityDef } from '../data/types';
import { maxDrawdown, percentile, regress, stdev } from '../finance/stats';
import { flash, usePanelId } from '../terminal/panel';
import { portfolio, type Position } from '../terminal/userdata';
import { isMargined, navValue, usdPerPrice } from '../terminal/portfolio';
import type { FnProps } from '../terminal/types';

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
  const mv = ls.reduce((a, l) => a + l.mv, 0);
  const day = ls.reduce((a, l) => a + l.day, 0);
  const tot = ls.reduce((a, l) => a + l.total, 0);
  const cost = ls.reduce((a, l) => a + l.cost, 0);
  const nav = st.cash + ls.reduce((a, l) => a + l.nav, 0);
  const futNotional = ls.filter((l) => isMargined(l.d)).reduce((a, l) => a + l.mv, 0);
  // A day's P&L counts only changes against a previous close confirmed for the right session.
  const unconfirmed = (l: Line) => !Number.isFinite(l.day) || engine.quote(l.p.id)?.chgCheck === 'unverified';
  const pending = ls.filter(unconfirmed).map((l) => l.d.ticker);
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
    if (!Number.isFinite(c)) return flash(panel, 'Enter the cash amount in USD', 'error');
    portfolio.set((s) => ({ ...s, cash: c }));
    setCash('');
    flash(panel, `Cash set to ${fmtNum(c, 0)} USD`, 'info');
  };
  const add = () => {
    const d = resolveSecurity(sec);
    if (!d) return flash(panel, `Unknown security: ${sec}`, 'error');
    const q = Number(qty);
    if (!Number.isFinite(q) || q === 0) return flash(panel, 'Enter a non-zero quantity', 'error');
    const c = px.trim() ? Number(px) : engine.quote(d.id)!.last;
    portfolio.set((s) => {
      const existing = s.positions.find((p) => p.id === d.id);
      const positions = existing
        ? s.positions.map((p) => (p.id === d.id ? { ...p, qty: p.qty + q, cost: (p.cost * p.qty + c * q) / (p.qty + q || 1) } : p)).filter((p) => p.qty !== 0)
        : [...s.positions, { id: d.id, qty: q, cost: c }];
      return { ...s, positions };
    });
    setSec('');
    setQty('');
    setPx('');
    flash(panel, `Added ${q} ${d.ticker}`, 'info');
  };
  return (
    <>
      <div className="cols">
        <Section title="Summary (USD)">
          <KV
            items={[
              ['Net asset value', <span key="n" className="white b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(nav, 0)}</span>],
              ['Securities at market', fmtNum(mv - futNotional, 0)],
              ['Futures notional', fmtNum(futNotional, 0)],
              ['Cash', fmtNum(st.cash, 0)],
              ['Day P&L', pending.length ? waiting('d') : <Chg key="d" v={day} dec={0} />],
              ['Day return', pending.length ? waiting('dr') : <Chg key="dr" v={(day / (nav - day)) * 100} pct />],
              ['Unrealised P&L', <Chg key="u" v={tot} dec={0} />],
              ['Return on cost', <Chg key="rc" v={(tot / cost) * 100} pct />],
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
            blank price records today&apos;s market price as your cost.
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
                <td className="num">{fmtNum((l.mv / nav) * 100, 1)}%</td>
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

/** Daily NAV of today's holdings and cash replayed over history (static weights). */
function navHistory(positions: Position[], bars: number, cash = portfolio.get().cash) {
  const ids = positions.map((p) => p.id).filter((id) => engine.get(id));
  const spine = engine.daily('SPX Index');
  const n = spine.length;
  const from = Math.max(0, n - bars);
  const out = makeSeries(n - from, spine.span);
  let w = 0;
  for (let i = from; i < n; i++) {
    const t = spine.t[i];
    let v = cash;
    for (const id of ids) {
      const d = engine.get(id)!;
      const p = positions.find((x) => x.id === id)!;
      const px = i === n - 1 ? engine.quote(id)!.last : closeAt(engine.daily(id), t + 43_200_000);
      if (!Number.isFinite(px)) continue;
      v += navValue(d, p.qty, px, p.cost);
    }
    out.t[w] = t;
    out.o[w] = out.h[w] = out.l[w] = out.c[w] = v;
    out.v[w] = 0;
    w++;
  }
  out.length = w;
  return out;
}

function Performance() {
  const st = portfolio.use((s) => s);
  const tick = useTick(15);
  const nav = useMemo(() => navHistory(st.positions, 520), [st.positions, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const bench = engine.daily(st.benchmark);
  const options: ChartOptions = useMemo(
    () => ({ type: 'mountain', dec: 0, label: 'Portfolio', intraday: false, overlays: [], lower: [], compare: [{ label: engine.get(st.benchmark)!.ticker, series: bench, color: '#45d3e6' }], percent: true, annotate: false, initialBars: 252, dateLabel: (t) => fmtDay(t) }),
    [bench, st.benchmark],
  );
  return (
    <div className="fn-fill" style={{ height: 420 }}>
      <ChartView series={nav} options={options} resetKey={`port|${st.positions.length}`} />
      <div className="note">Current holdings replayed over history (no trading), rebased at the first visible date.</div>
    </div>
  );
}

function Risk() {
  const st = portfolio.use((s) => s);
  const tick = useTick(15);
  const r = useMemo(() => {
    const nav = navHistory(st.positions, 253);
    const rets: number[] = [];
    for (let i = 1; i < nav.length; i++) rets.push(nav.c[i] / nav.c[i - 1] - 1);
    const { rets: br } = alignedReturns([st.benchmark], 252);
    const n = Math.min(rets.length, br[0].length);
    const reg = regress(br[0].slice(-n), rets.slice(-n));
    const vol = stdev(rets) * Math.sqrt(252);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const rf = (engine.quote('USGG3M Index')!.last / 100) / 252;
    const total = nav.c[nav.length - 1];
    const var95 = -percentile(rets, 0.05) * total;
    const tail = rets.filter((x) => x <= percentile(rets, 0.05));
    const cvar = (-tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length)) * total;
    return { reg, vol, sharpe: ((mean - rf) / stdev(rets)) * Math.sqrt(252), var95, cvar, mdd: maxDrawdown(nav.c.subarray(0, nav.length)), total, ret1y: (nav.c[nav.length - 1] / nav.c[0] - 1) * 100 };
  }, [st.positions, st.benchmark, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ls = lines(st.positions);
  const mv = ls.reduce((a, l) => a + l.mv, 0);
  const groups = (key: (l: Line) => string) => {
    const m = new Map<string, number>();
    for (const l of ls) m.set(key(l), (m.get(key(l)) ?? 0) + l.mv);
    return [...m.entries()].map(([k, v]) => ({ k, w: (v / mv) * 100 })).sort((a, b) => b.w - a.w);
  };
  const alloc = [
    { title: 'Asset class', rows: groups((l) => CLASS_LABEL[l.d.cls]) },
    { title: 'Sector (equities)', rows: groups((l) => l.d.eq?.sector ?? 'Non-equity') },
    { title: 'Region', rows: groups((l) => l.d.region) },
  ];
  return (
    <>
      <div className="cols">
        <Section title="Risk (1Y daily, USD)">
          <KV
            items={[
              ['Annualised volatility', fmtPct(r.vol * 100, 2, false)],
              [`Beta vs ${engine.get(st.benchmark)!.ticker}`, fmtNum(r.reg.beta, 2)],
              ['Correlation', fmtNum(r.reg.corr, 2)],
              ['Sharpe ratio', fmtNum(r.sharpe, 2)],
              ['1-day VaR 95% (historical)', fmtNum(r.var95, 0)],
              ['1-day CVaR 95%', fmtNum(r.cvar, 0)],
              ['Max drawdown', fmtPct(r.mdd * 100, 1)],
              ['1Y return (static holdings)', <Chg key="r" v={r.ret1y} pct />],
            ]}
          />
        </Section>
        {alloc.map((a) => (
          <Section key={a.title} title={a.title}>
            <table className="tbl">
              <tbody>
                {a.rows.map((x) => (
                  <tr key={x.k}>
                    <td style={{ width: '42%' }}>{x.k}</td>
                    <td>
                      <HBar value={x.w} max={a.rows[0].w} color="var(--amber)" />
                    </td>
                    <td className="num" style={{ width: 60 }}>
                      {fmtNum(x.w, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ))}
      </div>
    </>
  );
}

export function PORT(_: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const st = portfolio.use((s) => s);
  const csv = () => [['Security', 'Quantity', 'Cost', 'Last', 'Market value USD'], ...lines(st.positions).map((l) => [l.p.id, l.p.qty, l.p.cost, l.px, Math.round(l.mv)])];
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
        actions={exportActions(panel, 'portfolio.csv', csv)}
      />
      {tab === 1 ? <Holdings /> : tab === 2 ? <Performance /> : <Risk />}
      <div className="note">Values in USD at live FX rates. Holdings are stored {engine.realOnly ? 'on this computer' : 'in this browser'} only.</div>
    </div>
  );
}
