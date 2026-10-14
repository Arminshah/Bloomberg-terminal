import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { NotConnected } from '../components/NotConnected';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { dividendYield, expiries, expiryLabel, riskFreeRate, strikeStep } from '../data/options';
import { blackScholes, type OptType } from '../finance/options';
import type { FnProps } from '../terminal/types';
import { rangeStats } from '../data/analytics';

/**
 * Option chains: not connected. No permitted free source supplies listed option quotes, and Yahoo's option
 * data is switched off (it is used here only as a personal-use price source). No model chain stands in.
 */
export function OMON({ sec }: FnProps) {
  const s = sec!;
  return (
    <div>
      <FnHeader code="OPTIONS" title="Option Monitor" sec={s} sub="Listed option chains, implied volatility and open interest" />
      <QuoteStrip sec={s} />
      <NotConnected
        what="This screen would list the option chain by expiry: bids, offers, last trades, implied volatility, Greeks, volume and open interest."
        why="Listed option quotes are licensed exchange data (OPRA in the US), and no free source in this app permits showing them. Yahoo's option chains are switched off: Yahoo is used here only as a personal-use price source. No model chain is shown in their place."
        needs="a provider whose terms allow showing option quotes to you, with its key configured in the provider status screen."
        see={[
          { label: 'Option calculator', command: `${s.id} OPTIONCALC` },
          { label: 'Historical volatility', command: `${s.id} VOLATILITY` },
        ]}
      />
    </div>
  );
}

export function OVME({ sec, route }: FnProps) {
  const s = sec!;
  useTick(1);
  const parts = (route.args ?? '').split(/\s+/);
  // Friday expiry dates (weeklies, third-Friday monthlies, January long-dated): a calendar, not a list of
  // listed contracts, which needs option data the app does not have.
  const exps = expiries(engine.now());
  const spotLive = engine.quote(s.id)!.last;
  const [type, setType] = useState<OptType>(parts[0] === 'P' ? 'P' : 'C');
  const [strike, setStrike] = useState(() => (Number(parts[1]) > 0 ? Number(parts[1]) : Math.round(spotLive / strikeStep(spotLive)) * strikeStep(spotLive)));
  const [expiry, setExpiry] = useState(() => {
    const p = parts[2] ? Date.parse(`${parts[2]}T20:00:00Z`) : NaN;
    return Number.isFinite(p) ? p : exps[Math.min(3, exps.length - 1)];
  });
  const [spotOverride, setSpotOverride] = useState('');
  // A fourth argument is a volatility you give, in percent.
  const [volOverride, setVolOverride] = useState(() => (Number(parts[3]) > 0 ? parts[3] : ''));
  const spot = spotOverride && Number(spotOverride) > 0 ? Number(spotOverride) : spotLive;
  const t = Math.max((expiry - engine.now()) / (365 * DAY_MS), 1 / (365 * 24));
  // A rate you type replaces the published one, which some currencies lack.
  const [rateOverride, setRateOverride] = useState('');
  const published = riskFreeRate(s);
  const typedRate = rateOverride.trim() !== '' && Number.isFinite(Number(rateOverride));
  const r = typedRate ? Number(rateOverride) / 100 : published.r;
  const rateName = typedRate ? 'your input' : published.name;
  // On real data an unknown dividend yield counts as zero (and says so). The default volatility is the
  // 30-day realised volatility of the price history: a reference, not an implied volatility, which needs
  // option quotes the app does not have.
  const qSource = dividendYield(s);
  const q = engine.realOnly && !Number.isFinite(qSource) ? 0 : qSource;
  const fwd = spot * Math.exp((r - q) * t);
  const realised = rangeStats(s.id).vol30;
  const volDefault = realised / 100;
  const volSource = volOverride && Number(volOverride) > 0 ? 'your input' : '30D realised (not implied)';
  const vol = volOverride && Number(volOverride) > 0 ? Number(volOverride) / 100 : volDefault;
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
      <FnHeader code="OPTIONCALC" title="Option Valuation" sec={s} sub={engine.realOnly ? `Theoretical value, Black-Scholes-Merton with continuous dividend yield · rate: ${rateName} · dividend from the source` : 'Black-Scholes-Merton with continuous dividend yield'} />
      <QuoteStrip sec={s} />
      {engine.realOnly && !Number.isFinite(r) && (
        <div className="note amber">There is {rateName} (the central bank has no free daily source here), so the option is valued only once you enter a rate.</div>
      )}
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
        <label className="fld">Rate % {numInput(rateOverride, setRateOverride, 'Rate override', Number.isFinite(published.r) ? fmtNum(published.r * 100, 2) : '')}</label>
      </div>
      <div className="cols">
        <Section title="Valuation">
          <KV
            items={[
              ['Theoretical value', <span key="v" className="white b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(g.price, 4)}</span>],
              ['Per contract (x100)', fmtNum(g.price * contract, 2)],
              ['Underlying', fmtNum(spot, s.dec)],
              ['Forward', fmtNum(fwd, s.dec)],
              ['Volatility', `${fmtNum(vol * 100, 2)}% (${volSource})`],
              ['Time to expiry', `${fmtNum(t * 365, 1)} days`],
              [engine.realOnly ? `Rate (${rateName}) / dividend` : 'Rate / dividend', `${fmtNum(r * 100, 2)}% / ${engine.realOnly && !Number.isFinite(qSource) ? 'unknown, 0% used' : `${fmtNum(q * 100, 2)}%`}`],
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
      {engine.realOnly && (
        <div className="note">
          The expiry list is a calendar of Fridays (the next five weeks, third-Friday months and January long-dated), not the contracts actually listed: the option chain is licensed data. The rate is held flat to expiry and the volatility is realised, not implied.
        </div>
      )}
    </div>
  );
}
