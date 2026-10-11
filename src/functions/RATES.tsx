import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { XYChart } from '../components/chart/XYChart';
import { Chg, KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange } from '../data/analytics';
import { CURVES, curveAt, curveMembers, interp, tenorLabel } from '../data/curves';
import { centralBanks, COUNTRY_NAMES } from '../data/eco';
import { DAY_MS } from '../data/calendar';
import { to32nds } from '../finance/bonds';
import type { FnProps } from '../terminal/types';

// ------------------------------------------------------------------- WB

const WB_ROWS: { c: string; ids: Record<number, string> }[] = [
  { c: 'US', ids: { 2: 'USGG2YR Index', 5: 'USGG5YR Index', 10: 'USGG10YR Index', 30: 'USGG30YR Index' } },
  { c: 'DE', ids: { 2: 'GDBR2 Index', 5: 'GDBR5 Index', 10: 'GDBR10 Index', 30: 'GDBR30 Index' } },
  { c: 'GB', ids: { 2: 'GUKG2 Index', 5: 'GUKG5 Index', 10: 'GUKG10 Index', 30: 'GUKG30 Index' } },
  { c: 'JP', ids: { 2: 'GJGB2 Index', 5: 'GJGB5 Index', 10: 'GJGB10 Index', 30: 'GJGB30 Index' } },
  { c: 'FR', ids: { 10: 'GFRN10 Index' } },
  { c: 'IT', ids: { 10: 'GBTPGR10 Index' } },
  { c: 'ES', ids: { 10: 'GSPG10YR Index' } },
  { c: 'CH', ids: { 10: 'GSWISS10 Index' } },
  { c: 'CA', ids: { 10: 'GCAN10YR Index' } },
  { c: 'AU', ids: { 10: 'GACGB10 Index' } },
  { c: 'CN', ids: { 10: 'GCNY10YR Index' } },
  { c: 'IN', ids: { 10: 'GIND10YR Index' } },
  { c: 'BR', ids: { 10: 'GEBR10Y Index' } },
  { c: 'MX', ids: { 10: 'GMXN10YR Index' } },
];

export function WB(_: FnProps) {
  useTick(2);
  const ust = engine.quote('USGG10YR Index')!.last;
  const bund = engine.quote('GDBR10 Index')!.last;
  return (
    <div>
      <FnHeader code="WB" title="World Bond Markets" sub="Generic government yields · changes in basis points" />
      <table className="tbl">
        <thead>
          <tr>
            <th>Country</th>
            {[2, 5, 10, 30].map((t) => (
              <th key={t} className="num">
                {t}Y
              </th>
            ))}
            <th className="num">10Y 1D</th>
            <th className="num hide-m">10Y 1M</th>
            <th className="num hide-m">10Y YTD</th>
            <th className="num">vs UST</th>
            <th className="num hide-m">vs Bund</th>
            <th className="num hide-m">2s10s</th>
          </tr>
        </thead>
        <tbody>
          {WB_ROWS.map((r) => {
            const ten = r.ids[10];
            const q10 = engine.quote(ten)!;
            const two = r.ids[2] ? engine.quote(r.ids[2])!.last : NaN;
            return (
              <tr key={r.c}>
                <td className="amber">{COUNTRY_NAMES[r.c]}</td>
                {[2, 5, 10, 30].map((t) => (
                  <td key={t} className="num white">
                    {r.ids[t] ? (
                      <SecLink id={r.ids[t]} fn="GP">
                        <LivePx id={r.ids[t]} />
                      </SecLink>
                    ) : (
                      <span className="faint">--</span>
                    )}
                  </td>
                ))}
                <td className="num">
                  <Chg v={q10.chg} bp />
                </td>
                <td className="num hide-m">
                  <Chg v={periodChange(ten, '1M')} bp dec={0} />
                </td>
                <td className="num hide-m">
                  <Chg v={periodChange(ten, 'YTD')} bp dec={0} />
                </td>
                <td className="num">{r.c === 'US' ? '--' : fmtNum((q10.last - ust) * 100, 0)}</td>
                <td className="num hide-m">{r.c === 'DE' ? '--' : fmtNum((q10.last - bund) * 100, 0)}</td>
                <td className="num hide-m">{Number.isFinite(two) ? fmtNum((q10.last - two) * 100, 0) : '--'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">Spreads and curve slope in basis points. Non-US curves move with US rates through a country beta in the simulation.</div>
    </div>
  );
}

// ------------------------------------------------------------------- GC

const COMPARE = [
  { k: 0, label: 'Current', color: '#ffb547' },
  { k: 5, label: '1W ago', color: '#45d3e6' },
  { k: 30, label: '1M ago', color: '#d77bff' },
  { k: 365, label: '1Y ago', color: '#6d6d6d' },
];

export function GC(_: FnProps) {
  useTick(2);
  const [tab, setTab] = useState(1);
  const code = CURVES[tab - 1].code;
  const curves = COMPARE.map((c) => ({ ...c, pts: curveAt(code, c.k) }));
  const cur = curves[0].pts;
  const y = (t: number) => interp(cur, t);
  const spreads = [
    ['2s10s', (y(10) - y(2)) * 100],
    ['5s30s', (y(30) - y(5)) * 100],
    [code === 'US' ? '3m10y' : '2s30s', ((code === 'US' ? y(10) - y(0.25) : y(30) - y(2))) * 100],
  ] as const;
  const ticks = cur.map((p) => ({ v: p.tenor, label: tenorLabel(p.tenor) }));
  return (
    <div>
      <FnHeader code="GC" title="Graph Curves" sub={CURVES[tab - 1].name} tabs={CURVES.map((c, i) => ({ n: i + 1, label: c.name }))} tab={tab} onTab={setTab} />
      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' }}>
        <Section title="Yield curve" right="% · square-root tenor scale">
          <XYChart
            height={330}
            xScale="sqrt"
            xTicks={ticks}
            series={curves.map((c) => ({ label: c.label, color: c.color, points: c.pts.map((p) => ({ x: p.tenor, y: p.y, label: tenorLabel(p.tenor) })), markers: c.k === 0, width: c.k === 0 ? 2.2 : 1.3, dash: c.k === 365 ? [4, 4] : undefined }))}
            yFormat={(v) => fmtNum(v, 2)}
          />
        </Section>
        <Section title="Curve slope" right="bp">
          <KV items={spreads.map(([k, v]) => [k, <span key={k} className={v < 0 ? 'dn' : 'up'}>{fmtNum(v, 1)}</span>])} />
          <div className="note">{spreads[0][1] < 0 ? 'The 2s10s curve is inverted.' : 'The 2s10s curve is positively sloped.'}</div>
        </Section>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Tenor</th>
            <th>Security</th>
            <th className="num">Yield</th>
            <th className="num">1D bp</th>
            <th className="num">1W bp</th>
            <th className="num">1M bp</th>
            <th className="num">1Y bp</th>
          </tr>
        </thead>
        <tbody>
          {curveMembers(code).map((d, i) => (
            <tr key={d.id}>
              <td className="amber">{tenorLabel(d.tenor!)}</td>
              <td>
                <SecLink id={d.id} fn="GP">
                  {d.ticker}
                </SecLink>
              </td>
              <td className="num white">
                <LivePx id={d.id} />
              </td>
              <td className="num">
                <Chg v={engine.quote(d.id)!.chg} bp />
              </td>
              {[1, 2, 3].map((k) => (
                <td key={k} className="num">
                  <Chg v={cur[i].y - curves[k].pts[i].y} bp dec={0} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------- BTMM

export function BTMM(_: FnProps) {
  useTick(2);
  const fed = centralBanks()[0];
  const lower = fed.rate - 0.25;
  const effr = lower + 0.08;
  const sofr = effr + 0.02;
  const bonds = engine.securities.filter((d) => d.cls === 'bond');
  const us = curveAt('US', 0);
  const y = (t: number) => interp(us, t);
  const swaps = [2, 5, 10, 30].map((t) => ({ t, rate: y(t) + (t <= 2 ? 0.05 : t <= 5 ? -0.08 : t <= 10 ? -0.22 : -0.48) }));
  return (
    <div>
      <FnHeader code="BTMM" title="US Treasury & Money Markets" sub="Policy rates, actives, bills, swaps" />
      <div className="cols">
        <Section title="Policy and funding">
          <KV
            items={[
              ['Fed funds target', `${fmtNum(lower, 2)} - ${fmtNum(fed.rate, 2)}%`],
              ['Effective fed funds', `${fmtNum(effr, 2)}%`],
              ['Interest on reserves', `${fmtNum(fed.rate - 0.1, 2)}%`],
              ['SOFR', `${fmtNum(sofr, 2)}%`],
              ['Prime rate', `${fmtNum(fed.rate + 3, 2)}%`],
              ['Discount rate', `${fmtNum(fed.rate + 0.0, 2)}%`],
              ['Next FOMC', fmtDay(Date.parse(`${fed.meetings.find((m) => Date.parse(`${m}T18:00:00Z`) > engine.now()) ?? ''}T00:00:00Z`))],
            ]}
          />
        </Section>
        <Section title="Bills">
          <table className="tbl">
            <tbody>
              {['USGG3M Index', 'USGG6M Index', 'USGG12M Index'].map((id) => (
                <tr key={id}>
                  <td>
                    <SecLink id={id} fn="GP">
                      {engine.get(id)!.ticker}
                    </SecLink>
                  </td>
                  <td className="num white">
                    <LivePx id={id} />
                  </td>
                  <td className="num">
                    <Chg v={engine.quote(id)!.chg} bp />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Spreads (bp)">
          <KV
            items={[
              ['2s10s', fmtNum((y(10) - y(2)) * 100, 1)],
              ['5s30s', fmtNum((y(30) - y(5)) * 100, 1)],
              ['3m10y', fmtNum((y(10) - y(0.25)) * 100, 1)],
              ['10Y vs Bund', fmtNum((y(10) - engine.quote('GDBR10 Index')!.last) * 100, 1)],
              ['10Y vs Gilt', fmtNum((y(10) - engine.quote('GUKG10 Index')!.last) * 100, 1)],
            ]}
          />
        </Section>
      </div>
      <Section title="Treasury actives" right="Price in 32nds · click for YAS">
        <table className="tbl">
          <thead>
            <tr>
              <th>Security</th>
              <th className="num">Coupon</th>
              <th>Maturity</th>
              <th className="num">Bid</th>
              <th className="num">Ask</th>
              <th className="num">Yield</th>
              <th className="num">Chg bp</th>
            </tr>
          </thead>
          <tbody>
            {bonds.map((b) => {
              const q = engine.quote(b.id)!;
              const gq = engine.quote(b.bond!.curve)!;
              return (
                <tr key={b.id}>
                  <td>
                    <SecLink id={b.id} fn="YAS">
                      {b.alias![0]} · {b.ticker}
                    </SecLink>
                  </td>
                  <td className="num">{fmtNum(b.bond!.coupon, 3)}</td>
                  <td>{fmtDay(Date.parse(`${b.bond!.maturity}T00:00:00Z`))}</td>
                  <td className="num">{to32nds(q.bid)}</td>
                  <td className="num">{to32nds(q.ask)}</td>
                  <td className="num white">{fmtNum(gq.last + b.bond!.spread / 100, 3)}</td>
                  <td className="num">
                    <Chg v={gq.chg} bp />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title="SOFR swap rates (indicative)">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tenor</th>
              <th className="num">Swap rate</th>
              <th className="num">Swap spread bp</th>
            </tr>
          </thead>
          <tbody>
            {swaps.map((s) => (
              <tr key={s.t}>
                <td className="amber">{s.t}Y</td>
                <td className="num white">{fmtNum(s.rate, 3)}</td>
                <td className="num">{fmtNum((s.rate - y(s.t)) * 100, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- WIRP

const WIRP_BANKS = [
  { n: 1, code: 'FED', curve: [['USGG3M Index', 0.25], ['USGG6M Index', 0.5], ['USGG12M Index', 1], ['USGG2YR Index', 2]] as [string, number][], basis: 0.06, step: 0.25 },
  { n: 2, code: 'ECB', curve: [['GDBR2 Index', 2]] as [string, number][], basis: 0.0, step: 0.25 },
  { n: 3, code: 'BOE', curve: [['GUKG2 Index', 2]] as [string, number][], basis: 0.0, step: 0.25 },
  { n: 4, code: 'BOJ', curve: [['GJGB2 Index', 2]] as [string, number][], basis: 0.0, step: 0.25 },
];

export function WIRP(_: FnProps) {
  useTick(3);
  const [tab, setTab] = useState(1);
  const cfg = WIRP_BANKS[tab - 1];
  const cb = centralBanks().find((b) => b.code === cfg.code)!;
  const now = engine.now();
  const current = cfg.code === 'FED' ? cb.rate - 0.25 + 0.08 : cb.rate;
  const pts = [{ tenor: 0, y: current }, ...cfg.curve.map(([id, t]) => ({ tenor: t, y: engine.quote(id)!.last + cfg.basis }))];
  const meetings = cb.meetings.map((m) => Date.parse(`${m}T18:00:00Z`)).filter((t) => t > now).slice(0, 8);
  const rows = useMemo(() => {
    let prev = current;
    return meetings.map((t, i) => {
      const t0 = (t - now) / (365 * DAY_MS);
      const t1 = i + 1 < meetings.length ? (meetings[i + 1] - now) / (365 * DAY_MS) : t0 + 0.12;
      const fwd = (interp(pts, t1) * t1 - interp(pts, t0) * t0) / (t1 - t0);
      const implied = Math.max(-0.5, fwd);
      const step = implied - prev;
      prev = implied;
      return { t, implied, step, cum: implied - current, hikes: (implied - current) / cfg.step };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.map((p) => p.y).join(), meetings.join(), current]);
  return (
    <div>
      <FnHeader code="WIRP" title="World Interest Rate Probability" sub={`${cb.bank} · implied from the simulated short end`} tabs={WIRP_BANKS.map((b) => ({ n: b.n, label: b.code === 'FED' ? 'Fed' : b.code }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <span>
          <span className="amber">Current {cfg.code === 'FED' ? 'effective rate' : 'policy rate'}</span> {fmtNum(current, 3)}%
        </span>
        <span>
          <span className="amber">Policy rate</span> {cfg.code === 'FED' ? `${fmtNum(cb.rate - 0.25, 2)}-${fmtNum(cb.rate, 2)}%` : `${fmtNum(cb.rate, 2)}%`}
        </span>
        <span className="muted">Positive = hikes priced, negative = cuts.</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No scheduled meetings ahead.</div>
      ) : (
        <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
          <Section title="Meeting by meeting">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th className="num">#Hikes/Cuts</th>
                  <th className="num">% Prob of move</th>
                  <th className="num">Imp. rate</th>
                  <th className="num">Δ bp</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const prob = Math.min(100, (Math.abs(r.step) / cfg.step) * 100);
                  return (
                    <tr key={r.t}>
                      <td className="amber">{fmtDay(r.t)}</td>
                      <td className="num">
                        <Chg v={r.hikes} dec={2} />
                      </td>
                      <td className="num">
                        <span className={r.step >= 0 ? 'up' : 'dn'}>{fmtPct(prob, 1, false)}</span> {r.step >= 0 ? 'hike' : 'cut'}
                      </td>
                      <td className="num white">{fmtNum(r.implied, 3)}</td>
                      <td className="num">
                        <Chg v={r.cum * 100} dec={1} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
          <Section title="Implied policy path">
            <XYChart
              height={260}
              series={[{ label: 'Implied rate', color: '#ffb547', markers: true, points: [{ x: now, y: current, label: 'Now' }, ...rows.map((r) => ({ x: r.t, y: r.implied, label: fmtDay(r.t) }))] }]}
              xTicks={rows.map((r) => ({ v: r.t, label: fmtDay(r.t).slice(0, 5) }))}
              yFormat={(v) => fmtNum(v, 2)}
              refLines={[{ y: current, color: '#5c5c5c', label: 'Current' }]}
            />
          </Section>
        </div>
      )}
      <div className="note">Bars use forward rates between meeting dates; one move = 25 bp.</div>
    </div>
  );
}

