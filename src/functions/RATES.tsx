import { Credits, type CreditId } from '../components/Credits';
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
import { RatesSource, RealBadge, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';
import { policyRates } from '../data/live/policy';
import { contractSymbols, useYahooQuotes } from '../data/live/yquotes';
import { fedPath } from '../data/fedpath';

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
  // The desktop app lists only countries with an official source, and only their published tenors.
  const has = (id?: string) => !!id && engine.hasSource(id);
  const rows = WB_ROWS.filter((r) => Object.values(r.ids).some(has));
  return (
    <div>
      <FnHeader
        code="BONDS"
        title="World Bond Markets"
        sub={
          <>
            Generic government yields, changes in bp · <RatesSource />
          </>
        }
      />
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
          {rows.map((r) => {
            const ten = r.ids[10];
            const q10 = engine.quote(ten)!;
            const two = has(r.ids[2]) ? engine.quote(r.ids[2])!.last : NaN;
            return (
              <tr key={r.c}>
                <td className="amber">{COUNTRY_NAMES[r.c]}</td>
                {[2, 5, 10, 30].map((t) => (
                  <td key={t} className="num white">
                    {has(r.ids[t]) ? (
                      <SecLink id={r.ids[t]} fn="CHART">
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
                <td className="num">{r.c === 'US' ? '--' : spread(q10.last, ust)}</td>
                <td className="num hide-m">{r.c === 'DE' ? '--' : spread(q10.last, bund)}</td>
                <td className="num hide-m">{spread(q10.last, two)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">
        {engine.realOnly
          ? 'Spreads and curve slope in basis points. Each yield is the figure its source publishes: US Treasury par yields (5Y, 10Y and 30Y stream during the session), Bundesbank zero-coupon yields, Bank of England par yields, Japanese Ministry of Finance constant-maturity yields, Bank of Canada benchmark yields and RBA interpolated yields, so methods differ slightly between countries. Countries without a free official source are not listed.'
          : 'Spreads and curve slope in basis points. Simulated curves move with US rates through a country beta.'}
      </div>
      <Credits ids={['treasury', 'bundesbank', 'boe', 'mof', 'boc', 'rba']} />
    </div>
  );
}

/** Difference in basis points, or "--" when either yield is missing. */
function spread(a: number, b: number): string {
  return Number.isFinite(a) && Number.isFinite(b) ? fmtNum((a - b) * 100, 0) : '--';
}

// ------------------------------------------------------------------- GC

const COMPARE = [
  { k: 0, label: 'Current', color: '#ffb547' },
  { k: 5, label: '1W ago', color: '#45d3e6' },
  { k: 30, label: '1M ago', color: '#d77bff' },
  { k: 365, label: '1Y ago', color: '#6d6d6d' },
];

/** Whose credit a country's curve carries. */
const CURVE_CREDIT: Record<string, CreditId> = { US: 'treasury', DE: 'bundesbank', GB: 'boe', JP: 'mof', CA: 'boc', AU: 'rba' };

export function GC(_: FnProps) {
  useTick(2);
  const [tab, setTab] = useState(1);
  const code = CURVES[tab - 1].code;
  const curves = COMPARE.map((c) => ({ ...c, pts: curveAt(code, c.k) }));
  const cur = curves[0].pts;
  // Slopes use published tenors only; a missing tenor is never filled in from its neighbours.
  const y = (t: number) => cur.find((p) => p.tenor === t)?.y ?? NaN;
  const spreads = (
    [
      ['2s10s', (y(10) - y(2)) * 100],
      ['5s30s', (y(30) - y(5)) * 100],
      ['5s20s', (y(20) - y(5)) * 100],
      [code === 'US' ? '3m10y' : '2s30s', (code === 'US' ? y(10) - y(0.25) : y(30) - y(2)) * 100],
    ] as const
  ).filter(([k, v]) => Number.isFinite(v) && !(k === '5s20s' && Number.isFinite(y(30))));
  const ticks = cur.map((p) => ({ v: p.tenor, label: tenorLabel(p.tenor) }));
  return (
    <div>
      <FnHeader
        code="CURVE"
        title="Graph Curves"
        sub={
          <>
            {CURVES[tab - 1].name} · <RatesSource curve={code} />
          </>
        }
        tabs={CURVES.map((c, i) => ({ n: i + 1, label: c.name }))}
        tab={tab}
        onTab={setTab}
      />
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
          {spreads.length ? <KV items={spreads.map(([k, v]) => [k, <span key={k} className={v < 0 ? 'dn' : 'up'}>{fmtNum(v, 1)}</span>])} /> : <div className="empty">No published tenors to compare yet.</div>}
          {spreads[0]?.[0] === '2s10s' ? <div className="note">{spreads[0][1] < 0 ? 'The 2s10s curve is inverted.' : 'The 2s10s curve is positively sloped.'}</div> : null}
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
                <SecLink id={d.id} fn="CHART">
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
      {CURVE_CREDIT[code] ? <Credits ids={[CURVE_CREDIT[code]]} /> : null}
    </div>
  );
}

// ----------------------------------------------------------------- BTMM

export function BTMM(props: FnProps) {
  if (engine.realOnly) return <BTMMReal />;
  return <BTMMSim {...props} />;
}

const FUNDING_NAMES: Record<string, string> = {
  EFFR: 'Effective fed funds',
  OBFR: 'Overnight bank funding',
  SOFR: 'SOFR',
  BGCR: 'Broad general collateral',
  TGCR: 'Tri-party general collateral',
};

/** Futures contract months with prices from the source: [symbol, month, year, quote]. */
function useStrip(root: string, exch: string, listed: string, n: number) {
  const contracts = useMemo(() => contractSymbols(root, exch, listed, n), [root, exch, listed, n]);
  const quotes = useYahooQuotes(contracts.map((c) => c.symbol));
  return contracts.map((c) => ({ ...c, q: quotes.get(c.symbol) })).filter((c) => Number.isFinite(Number(c.q?.regularMarketPrice)));
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** BTMM on real data: New York Fed reference rates, Treasury bills, curve spreads and SOFR futures. */
function BTMMReal() {
  useTick(2);
  const pr = policyRates.use((x) => x);
  const funding = pr.funding ?? [];
  const asOf = funding.reduce((m, f) => (f.date > m ? f.date : m), '');
  const fed = centralBanks().find((b) => b.code === 'FED');
  const nextFomc = (pr.fomc ?? fed?.meetings ?? []).find((m) => Date.parse(`${m}T18:00:00Z`) > engine.now());
  const us = curveAt('US', 0);
  const y = (t: number) => us.find((p) => p.tenor === t)?.y ?? NaN;
  const y10 = y(10);
  const vs = (id: string) => (engine.hasSource(id) ? (y10 - engine.quote(id)!.last) * 100 : NaN);
  const sofr = useStrip('SR3', 'CME', 'H,M,U,Z', 8);
  const bp = (v: number) => (Number.isFinite(v) ? fmtNum(v, 1) : '--');
  return (
    <div>
      <FnHeader
        code="MONEYMARKET"
        title="US Treasury & Money Markets"
        sub={
          <>
            Reference rates, bills, curve and SOFR futures · <RealBadge /> New York Fed, US Treasury, CME futures via Yahoo
          </>
        }
      />
      <div className="cols">
        <Section title="Policy and funding" right={asOf ? <>New York Fed, rates for {fmtDay(Date.parse(`${asOf}T00:00:00Z`))}</> : 'Loading the New York Fed…'}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Rate</th>
                <th className="num">%</th>
                <th className="num hide-m">1st-99th pct</th>
                <th className="num">Vol $bn</th>
              </tr>
            </thead>
            <tbody>
              {pr.fedLower && pr.fedUpper ? (
                <tr>
                  <td className="amber">Fed funds target</td>
                  <td className="num white">
                    {fmtNum(pr.fedLower.last, 2)} - {fmtNum(pr.fedUpper.last, 2)}
                  </td>
                  <td className="num hide-m muted">since {fmtDay(Date.parse(`${pr.fedUpper.changes[pr.fedUpper.changes.length - 1][0]}T00:00:00Z`))}</td>
                  <td className="num">--</td>
                </tr>
              ) : null}
              {['EFFR', 'OBFR', 'SOFR', 'BGCR', 'TGCR'].map((type) => {
                const f = funding.find((x) => x.type === type);
                if (!f) return null;
                return (
                  <tr key={type}>
                    <td className="amber">{FUNDING_NAMES[type]}</td>
                    <td className="num white">{fmtNum(f.rate, 2)}</td>
                    <td className="num hide-m">{Number.isFinite(f.p1) ? `${fmtNum(f.p1, 2)} - ${fmtNum(f.p99, 2)}` : '--'}</td>
                    <td className="num">{Number.isFinite(f.volume) ? fmtNum(f.volume, 0) : '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <KV items={[['Next FOMC decision', nextFomc ? fmtDay(Date.parse(`${nextFomc}T00:00:00Z`)) : '--']]} />
        </Section>
        <Section title="Bills" right="Treasury par yield curve">
          <table className="tbl">
            <tbody>
              {['USGG3M Index', 'USGG6M Index', 'USGG12M Index'].map((id) => (
                <tr key={id}>
                  <td>
                    <SecLink id={id} fn="CHART">
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
              ['2s10s', bp((y10 - y(2)) * 100)],
              ['5s30s', bp((y(30) - y(5)) * 100)],
              ['3m10y', bp((y10 - y(0.25)) * 100)],
              ['10Y vs Bund', bp(vs('GDBR10 Index'))],
              ['10Y vs Gilt', bp(vs('GUKG10 Index'))],
            ]}
          />
          <div className="note">Bund and gilt yields are the Bundesbank's zero-coupon and the Bank of England's par yields, so these two spreads mix methods.</div>
        </Section>
      </div>
      <Section title="Three-month SOFR futures (CME)" right="implied rate = 100 - price · delayed 10 min">
        {sofr.length === 0 ? (
          <div className="empty">Loading SOFR futures…</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Month</th>
                <th className="num">Price</th>
                <th className="num">Implied %</th>
                <th className="num">Chg bp</th>
                <th className="num hide-m">Open int.</th>
              </tr>
            </thead>
            <tbody>
              {sofr.map((c) => {
                const px = Number(c.q.regularMarketPrice);
                const chg = Number(c.q.regularMarketChange);
                return (
                  <tr key={c.symbol}>
                    <td className="amber">{c.symbol.replace(/\..*$/, '')}</td>
                    <td>
                      {MONTH_ABBR[c.month]} {c.year}
                    </td>
                    <td className="num white">{fmtNum(px, 3)}</td>
                    <td className="num">{fmtNum(100 - px, 3)}</td>
                    <td className="num">
                      <Chg v={Number.isFinite(chg) ? -chg : NaN} bp />
                    </td>
                    <td className="num hide-m">{Number(c.q.openInterest) > 0 ? fmtNum(Number(c.q.openInterest), 0) : '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
      <div className="note">Treasury note and bond prices have no free source here, so the actives table is not shown in the desktop app.</div>
      <Credits ids={['treasury', 'nyfed']} />
    </div>
  );
}

function BTMMSim(_: FnProps) {
  useTick(2);
  const fed = centralBanks()[0];
  // The New York Fed's published levels in the desktop app; otherwise the usual spreads to the range.
  const pr = policyRates.use((x) => x);
  const lower = pr.fedLower?.last ?? fed.rate - 0.25;
  const effr = pr.effr?.last ?? lower + 0.08;
  const sofr = pr.sofr?.last ?? effr + 0.02;
  const realPolicy = !!pr.fedUpper;
  const bonds = engine.securities.filter((d) => d.cls === 'bond' && d.yk === 'Govt');
  const us = curveAt('US', 0);
  const y = (t: number) => interp(us, t);
  const swaps = [2, 5, 10, 30].map((t) => ({ t, rate: y(t) + (t <= 2 ? 0.05 : t <= 5 ? -0.08 : t <= 10 ? -0.22 : -0.48) }));
  return (
    <div>
      <FnHeader
        code="MONEYMARKET"
        title="US Treasury & Money Markets"
        sub={
          <>
            Policy rates, actives, bills, swaps · <RatesSource curve="US" />
          </>
        }
      />
      <div className="cols">
        <Section title="Policy and funding" right={realPolicy ? <><RealBadge /> New York Fed, as of {fmtDay(Date.parse(`${pr.fedUpper!.asOf}T00:00:00Z`))}</> : <SimBadge />}>
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
                    <SecLink id={id} fn="CHART">
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
      <Section title="Treasury actives" right={<>{desktopData() ? 'Model prices off the real curve' : <SimBadge />} · price in 32nds · click for BONDCALC</>}>
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
              const by = engine.bondYields(b.id)!;
              return (
                <tr key={b.id}>
                  <td>
                    <SecLink id={b.id} fn="BONDCALC">
                      {b.alias![0]} · {b.ticker}
                    </SecLink>
                  </td>
                  <td className="num">{fmtNum(b.bond!.coupon, 3)}</td>
                  <td>{fmtDay(Date.parse(`${b.bond!.maturity}T00:00:00Z`))}</td>
                  <td className="num">{to32nds(q.bid)}</td>
                  <td className="num">{to32nds(q.ask)}</td>
                  <td className="num white">{fmtNum(by.last, 3)}</td>
                  <td className="num">
                    <Chg v={by.last - by.prev} bp />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title="SOFR swap rates" right={<><SimBadge /> modelled from the Treasury curve</>}>
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

export function WIRP(props: FnProps) {
  if (engine.realOnly) return <WIRPReal />;
  return <WIRPSim {...props} />;
}

/**
 * WIRP on real data: the Fed path priced in CBOT 30-day fed funds futures,
 * meeting by meeting, from the New York Fed's effective rate and the Board's
 * FOMC calendar. Other central banks have no free futures source here.
 */
function WIRPReal() {
  useTick(3);
  const pr = policyRates.use((x) => x);
  const strip = useStrip('ZQ', 'CBT', 'All months', 16);
  const now = engine.now();
  const current = pr.effr?.last ?? NaN;
  const meetings = pr.fomc ?? centralBanks().find((b) => b.code === 'FED')?.meetings ?? [];
  const months = strip.map((c) => ({ year: c.year, month: c.month, avg: 100 - Number(c.q.regularMarketPrice) }));
  const path = fedPath(months, meetings, current, now);
  const step = 0.25;
  const header = (
    <FnHeader
      code="RATEPROBS"
      title="World Interest Rate Probability"
      sub={
        <>
          Federal Reserve · <RealBadge /> CBOT 30-day fed funds futures (via Yahoo, delayed 10 min), New York Fed effective rate, FOMC calendar
        </>
      }
    />
  );
  if (!Number.isFinite(current) || !strip.length) {
    return (
      <div>
        {header}
        <div className="empty">{!Number.isFinite(current) ? 'Loading the effective fed funds rate from the New York Fed…' : 'Loading fed funds futures…'}</div>
      </div>
    );
  }
  return (
    <div>
      {header}
      <div className="chart-tools">
        <span>
          <span className="amber">Effective fed funds</span> {fmtNum(current, 2)}% ({fmtDay(Date.parse(`${pr.effr!.asOf}T00:00:00Z`))})
        </span>
        {pr.fedLower && pr.fedUpper ? (
          <span>
            <span className="amber">Target range</span> {fmtNum(pr.fedLower.last, 2)}-{fmtNum(pr.fedUpper.last, 2)}%
          </span>
        ) : null}
        <span className="muted">Positive = hikes priced, negative = cuts.</span>
      </div>
      {path.length === 0 ? (
        <div className="empty">No upcoming FOMC decision is covered by the listed futures.</div>
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
                {path.map((r) => {
                  const move = r.end - r.start;
                  const prob = Math.min(100, (Math.abs(move) / step) * 100);
                  return (
                    <tr key={r.date}>
                      <td className="amber">{fmtDay(Date.parse(`${r.date}T00:00:00Z`))}</td>
                      <td className="num">
                        <Chg v={(r.end - current) / step} dec={2} />
                      </td>
                      <td className="num">
                        <span className={move >= 0 ? 'up' : 'dn'}>{fmtPct(prob, 1, false)}</span> {move >= 0 ? 'hike' : 'cut'}
                      </td>
                      <td className="num white">{fmtNum(r.end, 3)}</td>
                      <td className="num">
                        <Chg v={(r.end - current) * 100} dec={1} />
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
              series={[{ label: 'Implied rate', color: '#ffb547', markers: true, points: [{ x: now, y: current, label: 'Now' }, ...path.map((r) => ({ x: Date.parse(`${r.date}T00:00:00Z`), y: r.end, label: fmtDay(Date.parse(`${r.date}T00:00:00Z`)) }))] }]}
              xTicks={path.map((r) => ({ v: Date.parse(`${r.date}T00:00:00Z`), label: fmtDay(Date.parse(`${r.date}T00:00:00Z`)).slice(0, 5) }))}
              yFormat={(v) => fmtNum(v, 2)}
              refLines={[{ y: current, color: '#5c5c5c', label: 'Current' }]}
            />
          </Section>
        </div>
      )}
      <Section title="Fed funds futures" right="implied average rate for the month = 100 - price">
        <table className="tbl">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Month</th>
              <th className="num">Price</th>
              <th className="num">Implied %</th>
              <th className="num hide-m">Open int.</th>
            </tr>
          </thead>
          <tbody>
            {strip.map((c) => {
              const px = Number(c.q.regularMarketPrice);
              return (
                <tr key={c.symbol}>
                  <td className="amber">{c.symbol.replace(/\..*$/, '')}</td>
                  <td>
                    {MONTH_ABBR[c.month]} {c.year}
                  </td>
                  <td className="num white">{fmtNum(px, 4)}</td>
                  <td className="num">{fmtNum(100 - px, 4)}</td>
                  <td className="num hide-m">{Number(c.q.openInterest) > 0 ? fmtNum(Number(c.q.openInterest), 0) : '--'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <div className="note">
        Method as CME FedWatch: each contract settles on its month's average effective rate. A month without a decision fixes the rate after the meeting before it; in a decision month the average splits into the days before and after the decision. One move = 25 bp. Futures settle on the effective rate, which trades inside the target range, so implied rates sit near the middle of the range.
      </div>
      <Credits ids={['fedboard', 'nyfed']} />
    </div>
  );
}

function WIRPSim(_: FnProps) {
  useTick(3);
  const [tab, setTab] = useState(1);
  const cfg = WIRP_BANKS[tab - 1];
  const cb = centralBanks().find((b) => b.code === cfg.code)!;
  const now = engine.now();
  const effr = policyRates.use((x) => x.effr?.last);
  const current = cfg.code === 'FED' ? (effr ?? cb.rate - 0.25 + 0.08) : cb.rate;
  const realCurve = desktopData() && cfg.code === 'FED';
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
      <FnHeader code="RATEPROBS" title="World Interest Rate Probability" sub={
          realCurve ? (
            <>
              {cb.bank} · <RealBadge /> rates, implied with a simple forward model from Treasury bills and the 2Y (not fed funds futures)
            </>
          ) : (
            <>
              {cb.bank} · <SimBadge /> implied from a simulated short end
            </>
          )
        } tabs={WIRP_BANKS.map((b) => ({ n: b.n, label: b.code === 'FED' ? 'Fed' : b.code }))} tab={tab} onTab={setTab} />
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

