import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { curveAt, interp } from '../data/curves';
import { analytics, cleanFromYield, couponSchedule, settlementDate, to32nds, yieldFromClean } from '../finance/bonds';
import type { FnProps } from '../terminal/types';

export function YAS({ sec }: FnProps) {
  const s = sec!;
  useTick(2);
  const b = s.bond!;
  const terms = { coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: 2 };
  const settle = settlementDate(new Date(engine.now()));
  const mktYield = engine.quote(b.curve)!.last + b.spread / 100;
  const [mode, setMode] = useState<'live' | 'price' | 'yield'>('live');
  const [input, setInput] = useState('');
  const [face, setFace] = useState(1_000_000);
  let y = mktYield;
  if (mode === 'yield' && Number.isFinite(Number(input)) && input !== '') y = Number(input);
  if (mode === 'price' && Number.isFinite(Number(input)) && input !== '') y = yieldFromClean(terms, settle, Number(input));
  const a = analytics(terms, settle, y);
  const curve = curveAt('US', 0);
  const gSpread = (y - interp(curve, a.years)) * 100;
  const pts = [];
  for (let dy = -2; dy <= 2.0001; dy += 0.1) pts.push({ x: y + dy, y: cleanFromYield(terms, settle, y + dy) });
  const tangent = [-1.2, 1.2].map((dy) => ({ x: y + dy, y: a.clean - a.modified * a.dirty * (dy / 100) }));
  const flows = couponSchedule(terms, settle).slice(1);
  const v = 1 / (1 + y / 200);
  const w = (a.nextCoupon.getTime() - settle.getTime()) / (a.nextCoupon.getTime() - a.prevCoupon.getTime());
  const cash = flows.map((d, i) => {
    const cf = b.coupon / 2 + (i === flows.length - 1 ? 100 : 0);
    return { d, cf, pv: cf * v ** (w + i) };
  });
  const moveTable = [-100, -50, -25, -10, 10, 25, 50, 100].map((bp) => {
    const p = cleanFromYield(terms, settle, y + bp / 100);
    return { bp, p, chg: p - a.clean, pnl: ((p - a.clean) / 100) * face };
  });
  return (
    <div>
      <FnHeader code="YAS" title="Yield & Spread Analysis" sec={s} sub={`${s.alias?.[0]} · ${fmtNum(b.coupon, 3)}% due ${fmtDay(terms.maturity.getTime(), true)}`} />
      <QuoteStrip sec={s} />
      <div className="chart-tools">
        <span className="seg" role="group" aria-label="Pricing mode">
          {(['live', 'price', 'yield'] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setInput(m === 'price' ? a.clean.toFixed(4) : m === 'yield' ? y.toFixed(4) : ''); }}>
              {m === 'live' ? 'Live' : m === 'price' ? 'Solve from price' : 'Solve from yield'}
            </button>
          ))}
        </span>
        {mode !== 'live' && (
          <input className="inp" aria-label={mode === 'price' ? 'Clean price' : 'Yield'} style={{ width: 110 }} value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" />
        )}
        <label className="fld" htmlFor="yas-face">
          Face
          <select id="yas-face" className="sel-inp" value={face} onChange={(e) => setFace(Number(e.target.value))}>
            {[100_000, 1_000_000, 10_000_000, 100_000_000].map((f) => (
              <option key={f} value={f}>
                {fmtNum(f, 0)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">Settles {fmtDay(settle.getTime())} (T+1)</span>
      </div>
      <div className="cols">
        <Section title="Price and yield">
          <KV
            items={[
              ['Clean price', <span key="p" className="white b">{fmtNum(a.clean, 6)}</span>],
              ['Price (32nds)', to32nds(a.clean)],
              ['Yield (street)', <span key="y" className="amber b">{fmtNum(y, 4)}%</span>],
              ['Accrued interest', fmtNum(a.accrued, 6)],
              ['Accrued days', String(a.accruedDays)],
              ['Dirty price', fmtNum(a.dirty, 6)],
              ['Invoice amount', fmtNum((a.dirty / 100) * face, 2)],
              ['Previous / next coupon', `${fmtDay(a.prevCoupon.getTime())} / ${fmtDay(a.nextCoupon.getTime())}`],
            ]}
          />
        </Section>
        <Section title="Risk">
          <KV
            items={[
              ['Macaulay duration', fmtNum(a.macaulay, 4)],
              ['Modified duration', fmtNum(a.modified, 4)],
              ['Convexity', fmtNum(a.convexity, 4)],
              ['DV01 per 100', fmtNum(a.dv01, 5)],
              [`Risk per ${fmtNum(face, 0)} face`, fmtNum(a.dv01 * (face / 100), 2)],
              ['Years to maturity', fmtNum(a.years, 3)],
              ['G-spread to curve', `${fmtNum(gSpread, 1)} bp`],
              ['Remaining coupons', String(a.remaining)],
            ]}
          />
        </Section>
        <Section title="Price / yield">
          <XYChart
            height={220}
            series={[
              { label: 'Price', color: '#ffb547', points: pts },
              { label: 'Duration line', color: '#45d3e6', points: tangent, dash: [4, 4], width: 1.2 },
            ]}
            xFormat={(v) => `${fmtNum(v, 2)}%`}
            yFormat={(v) => fmtNum(v, 1)}
            refLines={[{ x: y, color: '#5c5c5c' }]}
          />
        </Section>
      </div>
      <div className="cols">
        <Section title="Scenario: parallel yield shift">
          <table className="tbl">
            <thead>
              <tr>
                <th className="num">Shift bp</th>
                <th className="num">Price</th>
                <th className="num">Chg</th>
                <th className="num">P&L</th>
              </tr>
            </thead>
            <tbody>
              {moveTable.map((m) => (
                <tr key={m.bp}>
                  <td className="num amber">{m.bp > 0 ? '+' : ''}{m.bp}</td>
                  <td className="num">{fmtNum(m.p, 4)}</td>
                  <td className={`num ${m.chg >= 0 ? 'up' : 'dn'}`}>{fmtNum(m.chg, 4)}</td>
                  <td className={`num ${m.pnl >= 0 ? 'up' : 'dn'}`}>{fmtNum(m.pnl, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Cash flows" right={`${cash.length} payments`}>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Cash flow</th>
                  <th className="num">PV</th>
                </tr>
              </thead>
              <tbody>
                {cash.map((c) => (
                  <tr key={c.d.getTime()}>
                    <td>{fmtDay(c.d.getTime(), true)}</td>
                    <td className="num">{fmtNum(c.cf, 4)}</td>
                    <td className="num">{fmtNum(c.pv, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
