import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtDate, fmtInt, fmtNum, fmtTime } from '../core/format';
import { engine, useQuote, useTick } from '../data/market';
import { resolveSecurity } from '../data/registry';
import { flash, usePanelId } from '../terminal/panel';
import {
  BROKERS, cancelAll, cancelOrder, commission, grossExposure, lotStep, netAssetValue, orders, positionOf, submitOrder, TRADABLE_CLASSES, usdPerPrice,
  type Order, type OrderType, type Side, type Tif,
} from '../terminal/oms';
import { portfolio } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

const STATUS_CLASS: Record<Order['status'], string> = {
  WORKING: 'amber', PARTFILL: 'amber', FILLED: 'up', CANCELLED: 'muted', EXPIRED: 'muted', REJECTED: 'dn',
};

function Ticket({ secId, initialSide }: { secId?: string; initialSide: Side }) {
  const panel = usePanelId();
  const [text, setText] = useState(secId ? engine.get(secId)!.ticker : '');
  const [side, setSide] = useState<Side>(initialSide);
  const [qty, setQty] = useState('');
  const [type, setType] = useState<OrderType>('MKT');
  const [price, setPrice] = useState('');
  const [tif, setTif] = useState<Tif>('DAY');
  const [broker, setBroker] = useState(BROKERS[0]);
  useEffect(() => setSide(initialSide), [initialSide]);
  const def = (secId && engine.get(secId)?.ticker === text ? engine.get(secId) : resolveSecurity(text)) ?? undefined;
  const q = useQuote(def?.id);
  const n = Number(qty);
  const touch = side === 'BUY' ? q?.ask : q?.bid;
  const px = type === 'MKT' ? (touch != null && Number.isFinite(touch) ? touch : q?.last) : Number(price);
  const notional = def && q && n > 0 && px ? n * px * usdPerPrice(def) : NaN;
  const fee = def && n > 0 && px ? commission(def, n, px) : NaN;
  const pos = def ? positionOf(def.id) : 0;
  const send = () => {
    if (!def) return flash(panel, `Unknown security: ${text}`, 'error');
    const r = submitOrder({
      sec: def.id, side, qty: n, type, tif, broker,
      limit: type === 'LMT' ? Number(price) : undefined,
      stop: type === 'STP' ? Number(price) : undefined,
    });
    if (typeof r === 'string') return flash(panel, r, 'error');
    flash(panel, `Order ${r.id} routed: ${side} ${fmtNum(n, def.cls === 'crypto' ? 4 : 0)} ${def.ticker} ${type}${type !== 'MKT' ? ` ${price}` : ''} · ${r.status}`, 'info');
    setQty('');
  };
  const tradable = def && TRADABLE_CLASSES.has(def.cls);
  return (
    <Section title="Order ticket" right={def ? def.name : 'Enter a security'}>
      <div className="pad" style={{ display: 'grid', gap: 8 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${side === 'BUY' ? 'buy on' : ''}`} onClick={() => setSide('BUY')} aria-pressed={side === 'BUY'}>
            BUY
          </button>
          <button type="button" className={`btn ${side === 'SELL' ? 'sell on' : ''}`} onClick={() => setSide('SELL')} aria-pressed={side === 'SELL'}>
            SELL
          </button>
          <input className="inp" style={{ width: 130 }} aria-label="Security" placeholder="Security" value={text} onChange={(e) => setText(e.target.value.toUpperCase())} />
          <input className="inp" style={{ width: 96 }} aria-label="Quantity" placeholder={def?.cls === 'future' || def?.cls === 'commodity' ? 'Contracts' : 'Quantity'} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <select className="inp" aria-label="Order type" value={type} onChange={(e) => setType(e.target.value as OrderType)}>
            <option value="MKT">MKT</option>
            <option value="LMT">LMT</option>
            <option value="STP">STP</option>
          </select>
          {type !== 'MKT' && (
            <input className="inp" style={{ width: 96 }} aria-label={type === 'LMT' ? 'Limit price' : 'Stop price'} placeholder={type === 'LMT' ? 'Limit' : 'Stop'} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          )}
          <select className="inp" aria-label="Time in force" value={tif} onChange={(e) => setTif(e.target.value as Tif)}>
            <option value="DAY">DAY</option>
            <option value="GTC">GTC</option>
          </select>
          <select className="inp" aria-label="Broker" value={broker} onChange={(e) => setBroker(e.target.value)}>
            {BROKERS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <button type="button" className={`btn primary ${side === 'BUY' ? 'buy' : 'sell'}`} onClick={send} disabled={!tradable}>
            Route {side}
          </button>
        </div>
        {def && !tradable && <div className="dn">{def.ticker} is not tradable in EMSX. Equities, futures, commodities and crypto are.</div>}
        {def && q && (
          <KV
            items={[
              ['Bid / Ask', `${fmtNum(q.bid, def.dec)} / ${fmtNum(q.ask, def.dec)}`],
              ['Last', <LivePx key="l" id={def.id} />],
              ['Position', `${fmtNum(pos, def.cls === 'crypto' ? 4 : 0)}${pos ? ` (avg ${fmtNum(portfolio.get().positions.find((p) => p.id === def.id)?.cost, def.dec)})` : ''}`],
              ['Est. notional USD', Number.isFinite(notional) ? fmtNum(notional, 0) : '--'],
              ['Est. commission USD', Number.isFinite(fee) ? fmtNum(fee, 2) : '--'],
              ['Lot size', String(lotStep(def))],
            ]}
          />
        )}
      </div>
    </Section>
  );
}

function Account() {
  useTick(2);
  const st = portfolio.use((s) => s);
  const nav = netAssetValue();
  return (
    <Section title="Account (paper)" right="Fills book into PORT">
      <KV
        items={[
          ['Net asset value', fmtNum(nav, 0)],
          ['Cash', fmtNum(st.cash, 0)],
          ['Gross exposure', fmtNum(grossExposure(), 0)],
          ['Buying power (2x NAV)', fmtNum(Math.max(0, 2 * nav - grossExposure()), 0)],
          ['Realised P&L', fmtNum(st.realised ?? 0, 0)],
          ['Positions', String(st.positions.length)],
        ]}
      />
    </Section>
  );
}

function Blotter({ view }: { view: number }) {
  const panel = usePanelId();
  const list = orders.use((s) => s.list);
  useTick(2);
  const rows = view === 1 ? list.filter((o) => o.status === 'WORKING' || o.status === 'PARTFILL') : list;
  if (view === 3) {
    const fills = list.flatMap((o) => o.fills.map((f) => ({ o, f }))).sort((a, b) => b.f.t - a.f.t).slice(0, 300);
    return (
      <table className="tbl">
        <thead>
          <tr>
            <th>Time</th>
            <th>Order</th>
            <th>Side</th>
            <th>Security</th>
            <th className="num">Qty</th>
            <th className="num">Price</th>
            <th className="hide-m">Broker</th>
          </tr>
        </thead>
        <tbody>
          {fills.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No fills yet.
              </td>
            </tr>
          )}
          {fills.map(({ o, f }, i) => {
            const d = engine.get(o.sec)!;
            return (
              <tr key={`${o.id}:${i}:${f.t}`}>
                <td>
                  {fmtDate(f.t)} {fmtTime(f.t)}
                </td>
                <td className="num">{o.id}</td>
                <td className={o.side === 'BUY' ? 'up' : 'dn'}>{o.side}</td>
                <td>
                  <SecLink id={o.sec}>{d.ticker}</SecLink>
                </td>
                <td className="num">{fmtNum(f.qty, d.cls === 'crypto' ? 4 : 0)}</td>
                <td className="num white">{fmtNum(f.px, d.dec)}</td>
                <td className="hide-m">{o.broker}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="num">Order</th>
          <th>Status</th>
          <th>Side</th>
          <th>Security</th>
          <th className="num">Qty</th>
          <th className="num">Filled</th>
          <th className="hide-m">Type</th>
          <th className="num hide-m">Limit/Stop</th>
          <th className="num">Avg px</th>
          <th className="num hide-m">Last</th>
          <th className="hide-m">TIF</th>
          <th className="hide-m">Broker</th>
          <th className="hide-m">Created</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={14} className="muted">
              {view === 1 ? 'No working orders.' : 'No orders yet. Use the ticket above.'}
            </td>
          </tr>
        )}
        {rows.map((o) => {
          const d = engine.get(o.sec)!;
          const qd = d.cls === 'crypto' ? 4 : 0;
          const open = o.status === 'WORKING' || o.status === 'PARTFILL';
          return (
            <tr key={o.id}>
              <td className="num">{o.id}</td>
              <td className={STATUS_CLASS[o.status]}>{o.status}</td>
              <td className={o.side === 'BUY' ? 'up' : 'dn'}>{o.side}</td>
              <td>
                <SecLink id={o.sec}>{d.ticker}</SecLink>
              </td>
              <td className="num">{fmtNum(o.qty, qd)}</td>
              <td className="num">{fmtNum(o.filled, qd)}</td>
              <td className="hide-m">{o.type}</td>
              <td className="num hide-m">{o.limit != null ? fmtNum(o.limit, d.dec) : o.stop != null ? fmtNum(o.stop, d.dec) : '--'}</td>
              <td className="num white">{o.filled ? fmtNum(o.avgPx, d.dec) : '--'}</td>
              <td className="num hide-m">
                <LivePx id={o.sec} />
              </td>
              <td className="hide-m">{o.tif}</td>
              <td className="hide-m">{o.broker}</td>
              <td className="hide-m">{fmtTime(o.created)}</td>
              <td>
                {open && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      cancelOrder(o.id);
                      flash(panel, `Order ${o.id} cancelled`, 'info');
                    }}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EMSX({ route, sec }: FnProps) {
  const panel = usePanelId();
  const [view, setView] = useState(1);
  const working = orders.use((s) => s.list.filter((o) => o.status === 'WORKING' || o.status === 'PARTFILL').length);
  const total = orders.use((s) => s.list.length);
  const side: Side = route.args?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  return (
    <div>
      <FnHeader
        code="EMSX"
        title="Execution Management"
        sec={sec}
        sub={`${working} working · ${total} orders · paper trading`}
        tabs={[
          { n: 1, label: `Working (${working})` },
          { n: 2, label: 'All orders' },
          { n: 3, label: 'Fills' },
        ]}
        tab={view}
        onTab={setView}
        actions={[
          {
            n: 9,
            label: 'Cancel all',
            onClick: () => {
              const k = cancelAll();
              flash(panel, k ? `Cancelled ${fmtInt(k)} orders` : 'No working orders', 'info');
            },
          },
        ]}
      />
      <div className="cols">
        <Ticket key={sec?.id ?? ''} secId={sec?.id} initialSide={side} />
        <Account />
      </div>
      <Blotter view={view} />
    </div>
  );
}
