// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, KV, LivePx, SecLink, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtIso, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { ecbRateOn } from '../data/live/ecb-fx';
import { officialAvailable } from '../data/live/official';
import { CLASS_LABEL, resolveSecurity } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { flash, usePanelId } from '../terminal/panel';
import { closePortfolio, holdsAnything, movePortfolio, newPortfolio, renamePortfolio, switchPortfolio } from '../terminal/portfolio-tabs';
import { MAX_PORTFOLIOS, portfolio, portfolios, type Portfolio, type Position } from '../terminal/userdata';
import { adjustPosition, BASE_CURRENCIES, baseFx, basePerPrice, isMargined, navValue, pnlSplit, priceCurrency } from '../terminal/portfolio';
import type { FnProps } from '../terminal/types';
import { PortfolioPerformance, PortfolioRisk } from './PortfolioRisk';
import { PortIntraday } from './PortIntraday';
import { PortAttribution } from './PortAttribution';
import { PortCharacteristics } from './PortCharacteristics';
import { HoldingMismatch, transactionRows, Transactions } from './PortTransactions';
import { complianceSummary, PreTradeCheck, preTradeProblems } from './PreTrade';
import { execute } from '../terminal/exec';
import { txnsOf } from '../terminal/transactions';

export { multiplier } from '../terminal/portfolio';

interface Line {
  p: Position;
  d: SecurityDef;
  px: number;
  /** Exposure in the base currency (futures at full notional). */
  mv: number;
  /** Contribution to NAV in the base currency (futures at unrealised P&L). */
  nav: number;
  cost: number;
  day: number;
  /** Local price P&L at today's FX. */
  total: number;
  /** FX gain or loss on the entry value since entry (NaN when the entry rate is unknown). */
  fx: number;
}

function lines(positions: Position[], base: string): Line[] {
  return positions
    .filter((p) => engine.get(p.id))
    .map((p) => {
      const d = engine.get(p.id)!;
      const q = engine.quote(p.id)!;
      const k = basePerPrice(d, base);
      const mv = p.qty * q.last * k;
      const split = pnlSplit(d, p, q.last, base);
      return { p, d, px: q.last, mv, nav: navValue(d, p.qty, q.last, p.cost, base), cost: p.qty * p.cost * k, day: p.qty * q.chg * k, total: split.price, fx: split.fx };
    });
}

function Holdings() {
  const panel = usePanelId();
  useTick(1);
  const st = portfolio.use((s) => s);
  const base = st.base ?? 'USD';
  const ls = lines(st.positions, base);
  const unresolved = st.positions.filter((p) => !engine.get(p.id));
  const mv = unresolved.length ? NaN : ls.reduce((a, l) => a + l.mv, 0);
  const day = ls.reduce((a, l) => a + l.day, 0);
  const tot = ls.reduce((a, l) => a + l.total, 0);
  const fxKnown = ls.filter((l) => Number.isFinite(l.fx));
  const fxPnl = fxKnown.reduce((a, l) => a + l.fx, 0);
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
  const [bought, setBought] = useState('');
  const [busy, setBusy] = useState(false);
  const [cash, setCash] = useState('');
  const [asking, setAsking] = useState<{ problems: string[]; commit: () => void } | null>(null);
  const compliance = complianceSummary(st);
  const saveCash = () => {
    const c = Number(cash.replace(/,/g, ''));
    if (!cash.trim() || !Number.isFinite(c)) return flash(panel, `Enter the cash amount in ${base}`, 'error');
    portfolio.set((s) => ({ ...s, cash: c }));
    setCash('');
    flash(panel, `Cash set to ${fmtNum(c, 0)} ${base}`, 'info');
  };
  // Changing the base converts the cash at today's rate and keeps every position's cost in its own currency.
  const changeBase = (next: string) => {
    if (next === base) return;
    const rate = baseFx(base, next);
    if (!(rate > 0)) return flash(panel, `No ${base}/${next} rate yet: wait for the currency prices to load`, 'error');
    portfolio.set((s) => ({ ...s, base: next, cash: s.cash * rate }));
    flash(panel, `Portfolio now in ${next}. Cash converted at ${fmtNum(rate, 6)} ${next} per ${base}.`, 'info');
  };
  const add = async () => {
    if (busy) return;
    const d = resolveSecurity(sec);
    if (!d) return flash(panel, `Unknown security: ${sec}`, 'error');
    if (d.quote === 'yield') return flash(panel, 'A yield reference is not a priced portfolio instrument', 'error');
    const q = Number(qty);
    if (!Number.isFinite(q) || q === 0) return flash(panel, 'Enter a non-zero quantity', 'error');
    const c = px.trim() ? Number(px) : engine.quote(d.id)!.last;
    if (!Number.isFinite(c) || (!isMargined(d) && c < 0)) return flash(panel, 'Enter a valid cost price or wait for a market price', 'error');
    // The entry rate of this lot into the base, for the FX part of its P&L later: on a past purchase date the ECB's
    // reference rate of that day; otherwise today's market rate.
    const today = new Date().toISOString().slice(0, 10);
    const ccy = priceCurrency(d);
    let entry: { fx: number; base: string; note: string } | undefined;
    let note = '';
    if (bought && bought < today && ccy !== base && !isMargined(d)) {
      setBusy(true);
      const r = await ecbRateOn(bought, ccy, base, today);
      setBusy(false);
      if ('error' in r) note = ` No entry rate: ${r.error} The currency part of this lot's P&L is unknown.`;
      else {
        entry = { fx: r.rate, base, note: `ECB reference rate of ${r.asOf}` };
        note = ` Entry rate ${fmtNum(r.rate, 6)} ${base} per ${ccy}: the ECB's of ${fmtIso(r.asOf)}.`;
      }
    } else {
      const fxNow = baseFx(ccy, base);
      if (Number.isFinite(fxNow) && fxNow > 0) entry = { fx: fxNow, base, note: `market rate when entered, ${today}` };
    }
    let next: Portfolio;
    try {
      const cur = portfolio.get();
      const adjusted = adjustPosition(cur.positions.find((p) => p.id === d.id), d.id, q, c, entry);
      next = { ...cur, positions: [...cur.positions.filter((p) => p.id !== d.id), ...(adjusted ? [adjusted] : [])] };
    } catch { return flash(panel, 'Position quantity or cost is outside the valid range', 'error'); }
    const commit = () => {
      portfolio.set((s) => ({ ...s, positions: next.positions }));
      setAsking(null);
      setSec('');
      setQty('');
      setPx('');
      setBought('');
      flash(panel, `Added ${q} ${d.ticker}.${note}`, note.startsWith(' No') ? 'error' : 'info');
    };
    // The portfolio's compliance rules, checked on the portfolio as it would be: asked first when it adds an exception.
    const problems = preTradeProblems(portfolio.get(), next);
    if (problems.length) return setAsking({ problems, commit });
    commit();
  };
  return (
    <>
      <HoldingMismatch />
      {compliance && (
        <div className={`note ${compliance.status === 'breach' ? 'dn' : compliance.status === 'warn' ? 'amber' : 'muted'}`} data-testid="port-compliance">
          Compliance: {compliance.text}.{' '}
          <button type="button" className="link-btn" onClick={() => execute(panel, 'COMPLIANCE')}>
            Open COMPLIANCE
          </button>
        </div>
      )}
      {unresolved.length > 0 && <div className="note amber" role="status">Some saved holdings are not in the security directory. Resolve or remove them to calculate total NAV: {unresolved.map((p) => <span key={p.id}>{p.id} <button type="button" className="btn" aria-label={`Remove unresolved ${p.id}`} onClick={() => portfolio.set((s) => ({ ...s, positions: s.positions.filter((r) => r.id !== p.id) }))}>Remove</button> </span>)}</div>}
      <div className="cols">
        <Section
          title={`Summary (${base})`}
          right={
            <select className="sel-inp" aria-label="Portfolio currency" value={base} onChange={(e) => changeBase(e.target.value)}>
              {BASE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          }
        >
          <KV
            // An empty book has no return to show: its return lines are left out until a position is added.
            items={([
              ['Net asset value', <span key="n" className="white b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(nav, 0)}</span>],
              ['Securities at market', fmtNum(mv - futNotional, 0)],
              ['Futures notional', fmtNum(futNotional, 0)],
              ['Cash', fmtNum(st.cash, 0)],
              ['Day P&L', pending.length ? waiting('d') : <Chg key="d" v={day} dec={0} />],
              ['Day return', pending.length ? waiting('dr') : <Chg key="dr" v={nav - day > 0 ? (day / (nav - day)) * 100 : NaN} pct />],
              ['Unrealised local-price P&L', <Chg key="u" v={unresolved.length ? NaN : tot} dec={0} />],
              ['Unrealised FX P&L', fxKnown.length ? <Chg key="fx" v={fxPnl} dec={0} /> : '--'],
              ['Return on absolute cost', <Chg key="rc" v={unresolved.length || grossCost === 0 ? NaN : (tot / grossCost) * 100} pct />],
            ] as [string, ReactNode][]).filter(([k]) => ls.length > 0 || !['Day return', 'Unrealised FX P&L', 'Return on absolute cost'].includes(k))}
          />
        </Section>
        <Section title="Add or adjust a position">
          {asking && <PreTradeCheck problems={asking.problems} onGo={asking.commit} onCancel={() => setAsking(null)} go="Add anyway" />}
          <div className="pad row" style={{ gap: 8 }}>
            <input className="inp" placeholder="Security (e.g. AAPL)" aria-label="Security" value={sec} onChange={(e) => setSec(e.target.value)} />
            <input className="inp" style={{ width: 90 }} placeholder="Qty (− to sell)" aria-label="Quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="inp" style={{ width: 90 }} placeholder="Price (mkt)" aria-label="Price" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
            {officialAvailable() && (
              <input className="inp" type="date" style={{ width: 140 }} aria-label="Bought on" title="Bought on: for a past date the entry exchange rate is the ECB's reference rate of that day" max={new Date().toISOString().slice(0, 10)} value={bought} onChange={(e) => setBought(e.target.value)} />
            )}
            <button type="button" className="btn primary" onClick={() => void add()} disabled={busy}>
              {busy ? 'Asking the ECB…' : 'Add'}
            </button>
          </div>
          <div className="pad row" style={{ gap: 8 }}>
            <input className="inp" style={{ width: 140 }} placeholder={`Cash (${base})`} aria-label={`Cash in ${base}`} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCash()} />
            <button type="button" className="btn" onClick={saveCash}>
              Set cash
            </button>
          </div>
          <div className="note">
            The portfolio holds only the positions and cash you enter here: there is no order entry and no simulated trading. Futures quantities are contracts and count toward NAV at unrealised P&L; Treasury quantities are face value. A
            blank price records today&apos;s market price as your cost. Adding on the same side averages cost; reducing retains the remaining cost; reversing uses the entered cost for the new side. Cash is adjusted separately.
            {officialAvailable() ? ' For a lot in another currency bought on a past date, give the date: its entry exchange rate is then the ECB\'s reference rate of that day (or of the last day before it with rates), crossed through the euro; otherwise it is today\'s. The ECB publishes its rates for information, at about 16:00 CET for about 14:10 CET: the rate your bank or broker applied can differ.' : ''}
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
            <th className="num">Mkt val {base}</th>
            <th className="num">Weight</th>
            <th className="num">Day P&L</th>
            <th className="num hide-m">Price P&L</th>
            <th className="num hide-m">FX P&L</th>
            <th className="num">Return</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ls.length === 0 && (
            <tr>
              <td colSpan={12} className="empty">
                No positions yet: enter a security, a quantity and, if you like, your price, then Add.
              </td>
            </tr>
          )}
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
                <td className="num hide-m" title={Number.isFinite(l.fx) ? `${priceCurrency(l.d)} to ${base} since entry at ${fmtNum(l.p.entryFx, 6)}${l.p.entryFxNote ? ` (${l.p.entryFxNote})` : ''}` : 'No entry FX rate recorded for this position (entered before 2.8.0, in another base currency, a future, or a past date the ECB has no rate for)'}>
                  {Number.isFinite(l.fx) ? <Chg v={l.fx} dec={0} /> : <span className="muted">--</span>}
                </td>
                <td className="num">
                  {/* With an entry rate: price and FX P&L over the entry value in the base currency; else the local price return. */}
                  <Chg v={(Number.isFinite(l.fx) ? (l.total + l.fx) / Math.abs(l.cost - l.fx) : l.total / Math.abs(l.cost)) * 100} pct dec={1} />
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

/**
 * One tab per portfolio, across the top as in a browser: click to show one, + opens a new one (named as you type),
 * a double click renames, × closes and dragging reorders. Closing one that holds anything asks first.
 */
export function PortfolioTabs() {
  const s = portfolios.use((x) => x);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [dragged, setDragged] = useState<number | null>(null);
  // The portfolio waiting for "Close and delete"; a change to it (another window) withdraws the question.
  const [closing, setClosing] = useState<Portfolio | null>(null);
  const rename = (i: number) => {
    setDraft(portfolios.get().list[i]?.name ?? '');
    setEditing(i);
  };
  const commit = (i: number) => {
    renamePortfolio(i, draft);
    setEditing(null);
  };
  const close = (i: number) => {
    setEditing(null);
    if (holdsAnything(s.list[i])) setClosing(s.list[i]);
    else closePortfolio(i);
  };
  const doomed = closing && s.list.includes(closing) ? closing : undefined;
  return (
    <>
      <nav className="ptabs" role="tablist" aria-label="Portfolios">
        {s.list.map((p, i) => {
          const on = i === s.active;
          return (
            <div
              key={i}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className={`ptab${on ? ' on' : ''}${dragged === i ? ' dragging' : ''}`}
              title={`${p.name}: ${p.positions.length} holding${p.positions.length === 1 ? '' : 's'} in ${p.base} (double-click to rename)`}
              draggable={editing !== i}
              onClick={() => switchPortfolio(i)}
              onDoubleClick={() => rename(i)}
              onDragStart={(e) => {
                setDragged(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.name);
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => {
                if (dragged !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged !== null) movePortfolio(dragged, i);
                setDragged(null);
              }}
            >
              {editing === i ? (
                <input
                  className="ptab-edit"
                  aria-label="Portfolio name"
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  value={draft}
                  maxLength={40}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commit(i);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={() => commit(i)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="ptab-title">{p.name}</span>
              )}
              {s.list.length > 1 && (
                <button
                  type="button"
                  className="ptab-x"
                  aria-label={`Close ${p.name}`}
                  title="Close this portfolio"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(i);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="ptab-new"
          aria-label="New portfolio"
          title={s.list.length >= MAX_PORTFOLIOS ? `At most ${MAX_PORTFOLIOS} portfolios` : 'New portfolio'}
          disabled={s.list.length >= MAX_PORTFOLIOS}
          onClick={() => {
            setClosing(null);
            if (newPortfolio()) rename(portfolios.get().active);
          }}
        >
          +
        </button>
      </nav>
      {doomed && (
        <div className="note amber row" role="alert" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span>
            Close {doomed.name}? Its {doomed.positions.length} holding{doomed.positions.length === 1 ? '' : 's'}
            {txnsOf(doomed).length ? `, ${txnsOf(doomed).length} transaction${txnsOf(doomed).length === 1 ? '' : 's'}` : ''}
            {doomed.cash !== 0 ? ` and cash of ${fmtNum(doomed.cash, 0)} ${doomed.base}` : ''} will be deleted.
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              closePortfolio(portfolios.get().list.indexOf(doomed));
              setClosing(null);
            }}
          >
            Close and delete
          </button>
          <button type="button" className="btn primary" onClick={() => setClosing(null)}>
            Keep it
          </button>
        </div>
      )}
    </>
  );
}

export function PORT(_: FnProps) {
  const panel = usePanelId();
  // Intraday first, as the 2025 frame opens on it (PT_PORT_Enterprise_attribution 0:09); the app's own tabs follow.
  const [tab, setTab] = useState(1);
  const st = portfolio.use((s) => s);
  // A half-typed position stays with the portfolio it was typed for: another tab starts with empty boxes.
  const active = portfolios.use((s) => s.active);
  const base = st.base ?? 'USD';
  const fileBase = st.name.replace(/\W+/g, '_') || 'portfolio';
  const csv = () => [['Security', 'Quantity', 'Cost', 'Last', `Exposure ${base}`, `Entry ${base} per currency unit`], ...st.positions.map((p) => { const d = engine.get(p.id); const last = engine.quote(p.id)?.last; return [p.id, p.qty, p.cost, d ? last : 'Unknown security', d && last !== undefined ? p.qty * last * basePerPrice(d, base) : undefined, p.entryBase === base ? p.entryFx : '']; })];
  return (
    <div>
      <FnHeader
        code="PORTFOLIO"
        title="Portfolio & Risk Analytics"
        sub={`${st.name} · the holdings you enter`}
        tabs={[
          // PORT's tabs as the 2021 guide lists them (Intraday to Attribution), then the app's own Transactions.
          { n: 1, label: 'Intraday' },
          { n: 2, label: 'Holdings' },
          { n: 3, label: 'Characteristics' },
          { n: 4, label: 'VaR' },
          { n: 5, label: 'Scenarios' },
          { n: 6, label: 'Tracking Error/Volatility' },
          { n: 7, label: 'Performance' },
          { n: 8, label: 'Attribution' },
          { n: 9, label: 'Transactions' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={[
          // The red bar as the 2025 frame draws it (PT_PORT_Enterprise_attribution 0:09): Manage, Export and Settings
          // without numbers. Each item does what the app already does, or opens the control that does it.
          {
            n: 9901,
            bare: true,
            label: 'Manage',
            onClick: () => {},
            menu: [
              { label: 'New Portfolio', onClick: () => { if (!newPortfolio()) flash(panel, `At most ${MAX_PORTFOLIOS} portfolios`, 'error'); } },
              { label: 'Add Holdings', onClick: () => setTab(2) },
              { label: 'Record a Transaction', onClick: () => setTab(9) },
              { label: 'Compliance Rules (COMPLIANCE)', sep: true, onClick: () => execute(panel, 'COMPLIANCE') },
            ],
          },
          {
            n: 9902,
            bare: true,
            label: 'Export',
            onClick: () => {},
            menu: [
              ...exportActions(panel, `${fileBase}.csv`, csv).map((a) => ({ label: a.label === 'Copy' ? 'Copy Holdings' : 'Download Holdings as CSV', title: a.title, onClick: a.onClick })),
              ...exportActions(panel, `${fileBase}-transactions.csv`, transactionRows).map((a, i) => ({ label: a.label === 'Copy' ? 'Copy Transactions' : 'Download Transactions as CSV', title: a.title, sep: i === 0, onClick: a.onClick })),
            ],
          },
          {
            n: 9903,
            bare: true,
            label: 'Settings',
            onClick: () => {},
            menu: [
              { label: `Benchmark: ${engine.get(st.benchmark)?.ticker ?? st.benchmark} (set on 7) Performance)`, onClick: () => setTab(7) },
              { label: `Base Currency: ${base} (set on 2) Holdings)`, onClick: () => setTab(2) },
            ],
          },
        ]}
        controls={<PortfolioTabs />}
      />
      {tab === 1 ? <PortIntraday key={active} onHoldings={() => setTab(2)} />
        : tab === 2 ? <Holdings key={active} />
        : tab === 3 ? <PortCharacteristics key={active} />
        : tab === 4 ? <PortfolioRisk view="var" />
        : tab === 5 ? <PortfolioRisk view="scenarios" />
        : tab === 6 ? <PortfolioRisk view="tev" />
        : tab === 7 ? <PortfolioPerformance />
        : tab === 8 ? <PortAttribution key={active} />
        : <Transactions key={active} />}
      <div className="note">Current values use source FX marks, which may be delayed or stale. Day and price P&L translate local price changes at current FX; FX P&L is the change in the {st.base ?? 'USD'} value of each position's cost since you entered it, for positions entered from 2.8.0 on. Holdings are stored {engine.realOnly ? 'on this computer' : 'in this browser'} only.</div>
    </div>
  );
}
