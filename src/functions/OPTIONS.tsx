import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { chainFor, dividendYield, expiries, expiryLabel, riskFree, smileVol, strikeStep, atmVol } from '../data/options';
import { blackScholes, type OptType } from '../finance/options';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

export function OMON({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const tick = useTick(2);
  const exps = useMemo(() => expiries(engine.now()), []);
  const [ei, setEi] = useState(Math.min(2, exps.length - 1));
  const [count, setCount] = useState(10);
  const [view, setView] = useState<'quotes' | 'greeks'>('quotes');
  const chain = useMemo(() => chainFor(s, exps[ei], count), [s, exps, ei, count, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const spot = engine.quote(s.id)!.last;
  const atm = chain.rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), chain.rows[0]);
  const callVol = chain.rows.reduce((a, r) => a + r.call.volume, 0);
  const putVol = chain.rows.reduce((a, r) => a + r.put.volume, 0);
  const term = exps.slice(0, 10).map((e) => ({ x: (e - engine.now()) / DAY_MS, y: atmVol(s, Math.max((e - engine.now()) / (365 * DAY_MS), 1 / 365)) * 100, label: fmtDay(e) }));
  const open = (type: OptType, strike: number) => execute(panel, `${s.id} OVME ${type} ${strike} ${new Date(exps[ei]).toISOString().slice(0, 10)}`);
  const side = (type: OptType) => {
    const cols = view === 'quotes' ? ['Bid', 'Ask', 'Last', 'IVM', 'Volm', 'OInt'] : ['IVM', 'Delta', 'Gamma', 'Theta', 'Vega', 'Mid'];
    return type === 'C' ? cols : [...cols].reverse();
  };
  const cell = (o: (typeof chain.rows)[number]['call'], k: string) => {
    switch (k) {
      case 'Bid':
        return fmtNum(o.bid, 2);
      case 'Ask':
        return fmtNum(o.ask, 2);
      case 'Last':
        return fmtNum(o.last, 2);
      case 'IVM':
        return fmtNum(o.iv, 2);
      case 'Volm':
        return fmtBig(o.volume);
      case 'OInt':
        return fmtBig(o.oi);
      case 'Delta':
        return fmtNum(o.delta, 3);
      case 'Gamma':
        return fmtNum(o.gamma, 4);
      case 'Theta':
        return fmtNum(o.theta, 3);
      case 'Vega':
        return fmtNum(o.vega, 3);
      default:
        return fmtNum(o.mid, 2);
    }
  };
  return (
    <div>
      <FnHeader
        code="OMON"
        title="Option Monitor"
        sec={s}
        sub="Simulated chain priced with Black-Scholes and a volatility smile"
        actions={[
          { n: 11, label: 'Quotes', on: view === 'quotes', onClick: () => setView('quotes') },
          { n: 12, label: 'Greeks', on: view === 'greeks', onClick: () => setView('greeks') },
        ]}
      />
      <QuoteStrip sec={s} />
      <div className="chart-tools">
        <label className="fld" htmlFor="omon-exp">
          Expiry
          <select id="omon-exp" className="sel-inp" value={ei} onChange={(e) => setEi(Number(e.target.value))}>
            {exps.map((e, i) => (
              <option key={e} value={i}>
                {expiryLabel(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="fld" htmlFor="omon-n">
          Strikes
          <select id="omon-n" className="sel-inp" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                ±{n}
              </option>
            ))}
          </select>
        </label>
        <span>
          <span className="amber">Fwd</span> {fmtNum(chain.fwd, s.dec)} <span className="amber">ATM IV</span> {fmtNum(chain.atmIv, 2)}% <span className="amber">Rate</span> {fmtNum(chain.rate, 2)}% <span className="amber">Div</span> {fmtNum(chain.div, 2)}%{' '}
          <span className="amber">P/C vol</span> {fmtNum(putVol / Math.max(1, callVol), 2)}
        </span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl omon">
          <thead>
            <tr>
              <th colSpan={6} className="side">
                Calls
              </th>
              <th className="side">{fmtDay(chain.expiry)}</th>
              <th colSpan={6} className="side">
                Puts
              </th>
            </tr>
            <tr>
              {side('C').map((k) => (
                <th key={`c${k}`} className="num">
                  {k}
                </th>
              ))}
              <th style={{ textAlign: 'center' }}>Strike</th>
              {side('P').map((k) => (
                <th key={`p${k}`} className="num">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chain.rows.map((r) => (
              <tr key={r.strike} className={r === atm ? 'atm' : ''}>
                {side('C').map((k) => (
                  <td key={`c${k}`} className={`num click ${r.strike < spot ? 'itm' : ''}`} onClick={() => open('C', r.strike)}>
                    {cell(r.call, k)}
                  </td>
                ))}
                <td className="strike">{fmtNum(r.strike, strikeStep(spot) < 1 ? 1 : 0)}</td>
                {side('P').map((k) => (
                  <td key={`p${k}`} className={`num click ${r.strike > spot ? 'itm' : ''}`} onClick={() => open('P', r.strike)}>
                    {cell(r.put, k)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cols">
        <Section title="Volatility smile" right={expiryLabel(chain.expiry)}>
          <XYChart height={190} series={[{ label: 'Implied vol', color: '#ffb547', markers: true, points: chain.rows.map((r) => ({ x: r.strike, y: r.call.iv })) }]} refLines={[{ x: spot, color: '#5c5c5c', label: 'Spot' }]} xFormat={(v) => fmtNum(v, 0)} yFormat={(v) => `${fmtNum(v, 1)}%`} />
        </Section>
        <Section title="ATM term structure">
          <XYChart height={190} series={[{ label: 'ATM vol', color: '#45d3e6', markers: true, points: term }]} xFormat={(v) => `${fmtNum(v, 0)}d`} yFormat={(v) => `${fmtNum(v, 1)}%`} />
        </Section>
      </div>
      <div className="note">Shaded cells are in the money. Click any quote to value it in OVME.</div>
    </div>
  );
}

export function OVME({ sec, route }: FnProps) {
  const s = sec!;
  useTick(1);
  const parts = (route.args ?? '').split(/\s+/);
  const exps = expiries(engine.now());
  const spotLive = engine.quote(s.id)!.last;
  const [type, setType] = useState<OptType>(parts[0] === 'P' ? 'P' : 'C');
  const [strike, setStrike] = useState(() => (Number(parts[1]) > 0 ? Number(parts[1]) : Math.round(spotLive / strikeStep(spotLive)) * strikeStep(spotLive)));
  const [expiry, setExpiry] = useState(() => {
    const p = parts[2] ? Date.parse(`${parts[2]}T20:00:00Z`) : NaN;
    return Number.isFinite(p) ? p : exps[Math.min(3, exps.length - 1)];
  });
  const [spotOverride, setSpotOverride] = useState('');
  const [volOverride, setVolOverride] = useState('');
  const spot = spotOverride && Number(spotOverride) > 0 ? Number(spotOverride) : spotLive;
  const t = Math.max((expiry - engine.now()) / (365 * DAY_MS), 1 / (365 * 24));
  const r = riskFree(s);
  const q = dividendYield(s);
  const fwd = spot * Math.exp((r - q) * t);
  const vol = volOverride && Number(volOverride) > 0 ? Number(volOverride) / 100 : smileVol(s, t, strike, fwd);
  const g = blackScholes(type, spot, strike, t, r, q, vol);
  const contract = s.cls === 'index' ? 100 : 100;
  const scen = [-20, -10, -5, -2, 0, 2, 5, 10, 20].map((pct) => {
    const sp = spot * (1 + pct / 100);
    const v = blackScholes(type, sp, strike, t, r, q, vol).price;
    const payoff = type === 'C' ? Math.max(0, sp - strike) : Math.max(0, strike - sp);
    return { pct, sp, v, pnl: (v - g.price) * contract, payoff };
  });
  const curve = [];
  const atExp = [];
  for (let k = -30; k <= 30; k += 1.5) {
    const sp = spot * (1 + k / 100);
    curve.push({ x: sp, y: blackScholes(type, sp, strike, t, r, q, vol).price - g.price });
    atExp.push({ x: sp, y: (type === 'C' ? Math.max(0, sp - strike) : Math.max(0, strike - sp)) - g.price });
  }
  const numInput = (value: string, set: (v: string) => void, label: string, ph: string) => (
    <input className="inp" style={{ width: 96, textAlign: 'right' }} aria-label={label} placeholder={ph} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" />
  );
  return (
    <div>
      <FnHeader code="OVME" title="Option Valuation" sec={s} sub="Black-Scholes-Merton with continuous dividend yield" />
      <QuoteStrip sec={s} />
      <div className="chart-tools" style={{ gap: '6px 14px' }}>
        <span className="seg" role="group" aria-label="Option type">
          {(['C', 'P'] as OptType[]).map((x) => (
            <button key={x} type="button" className={type === x ? 'on' : ''} onClick={() => setType(x)}>
              {x === 'C' ? 'Call' : 'Put'}
            </button>
          ))}
        </span>
        <label className="fld">
          Strike
          <input className="inp" style={{ width: 90, textAlign: 'right' }} aria-label="Strike" value={strike} onChange={(e) => setStrike(Number(e.target.value) || 0)} inputMode="decimal" />
        </label>
        <label className="fld">
          Expiry
          <select className="sel-inp" aria-label="Expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
            {[...new Set([expiry, ...exps])].sort((a, b) => a - b).map((e) => (
              <option key={e} value={e}>
                {expiryLabel(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">Spot {numInput(spotOverride, setSpotOverride, 'Spot override', fmtNum(spotLive, s.dec))}</label>
        <label className="fld">Vol % {numInput(volOverride, setVolOverride, 'Volatility override', fmtNum(vol * 100, 2))}</label>
      </div>
      <div className="cols">
        <Section title="Valuation">
          <KV
            items={[
              ['Theoretical value', <span key="v" className="white b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(g.price, 4)}</span>],
              ['Per contract (x100)', fmtNum(g.price * contract, 2)],
              ['Underlying', fmtNum(spot, s.dec)],
              ['Forward', fmtNum(fwd, s.dec)],
              ['Volatility', `${fmtNum(vol * 100, 2)}%`],
              ['Time to expiry', `${fmtNum(t * 365, 1)} days`],
              ['Rate / dividend', `${fmtNum(r * 100, 2)}% / ${fmtNum(q * 100, 2)}%`],
              ['Intrinsic / time value', `${fmtNum(Math.max(0, type === 'C' ? spot - strike : strike - spot), 4)} / ${fmtNum(g.price - Math.max(0, type === 'C' ? spot - strike : strike - spot), 4)}`],
            ]}
          />
        </Section>
        <Section title="Greeks">
          <KV
            items={[
              ['Delta', fmtNum(g.delta, 4)],
              ['Gamma', fmtNum(g.gamma, 5)],
              ['Vega (per vol pt)', fmtNum(g.vega, 4)],
              ['Theta (per day)', fmtNum(g.theta, 4)],
              ['Rho (per 1%)', fmtNum(g.rho, 4)],
              ['Delta $ / contract', fmtNum(g.delta * spot * contract, 0)],
            ]}
          />
        </Section>
        <Section title="P&L vs underlying (per share)">
          <XYChart
            height={210}
            series={[
              { label: 'Today', color: '#ffb547', points: curve },
              { label: 'At expiry', color: '#45d3e6', points: atExp, dash: [4, 4] },
            ]}
            refLines={[{ y: 0, color: '#3a3a3a' }, { x: spot, color: '#5c5c5c', label: 'Spot' }, { x: strike, color: '#9a5e0f', label: 'K' }]}
            xFormat={(v) => fmtNum(v, s.dec > 2 ? 2 : 0)}
            yFormat={(v) => fmtNum(v, 2)}
          />
        </Section>
      </div>
      <Section title="Scenario analysis (instant spot move)">
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Spot move</th>
              <th className="num">Spot</th>
              <th className="num">Option value</th>
              <th className="num">P&L / contract</th>
              <th className="num">Value at expiry</th>
            </tr>
          </thead>
          <tbody>
            {scen.map((x) => (
              <tr key={x.pct} className={x.pct === 0 ? 'sel' : ''}>
                <td className="num amber">{x.pct > 0 ? '+' : ''}{x.pct}%</td>
                <td className="num">{fmtNum(x.sp, s.dec)}</td>
                <td className="num white">{fmtNum(x.v, 4)}</td>
                <td className={`num ${x.pnl >= 0 ? 'up' : 'dn'}`}>{fmtNum(x.pnl, 2)}</td>
                <td className="num">{fmtNum(x.payoff, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
