import { Credits, type CreditId } from '../components/Credits';
import { Fragment, useMemo, useState, type MouseEvent } from 'react';
import { FnHeader } from '../components/FnHeader';
import { XYChart } from '../components/chart/XYChart';
import { Chg, KV, LivePx, SecLink, Section, openSecurity } from '../components/cells';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import { fmtDateTime, fmtDay, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange, type Horizon } from '../data/analytics';
import { CURVES, curveAt, curveMembers, interp, tenorLabel } from '../data/curves';
import { centralBanks, COUNTRY_NAMES } from '../data/eco';
import { DAY_MS } from '../data/calendar';
import { to32nds } from '../finance/bonds';
import type { FnProps } from '../terminal/types';
import { useGroupedRows, useMenu, useNumberedRows, usePanelId } from '../terminal/panel';
import { RatesSource, RealBadge, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';
import { policyRates, type PolicyRates } from '../data/live/policy';
import { currentPolicyTarget, policyMeetingState, policyTargetHealth } from '../data/policy-state';
import { contractSymbols, quotesTiming, useYahooQuotes } from '../data/live/yquotes';
import { fedPath, meetingMoves, type MeetingMoves } from '../data/fedpath';

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
  { c: 'CA', ids: { 2: 'GCAN2YR Index', 5: 'GCAN5YR Index', 10: 'GCAN10YR Index', 30: 'GCAN30YR Index' } },
  { c: 'AU', ids: { 2: 'GACGB2 Index', 5: 'GACGB5 Index', 10: 'GACGB10 Index' } },
  { c: 'CN', ids: { 10: 'GCNY10YR Index' } },
  { c: 'IN', ids: { 10: 'GIND10YR Index' } },
  { c: 'BR', ids: { 10: 'GEBR10Y Index' } },
  { c: 'MX', ids: { 10: 'GMXN10YR Index' } },
];

/** WB's regions, as the terminal's World Bond Markets groups its countries. */
const WB_REGIONS: { name: string; countries: string[] }[] = [
  { name: 'Americas', countries: ['US', 'CA', 'BR', 'MX'] },
  { name: 'EMEA', countries: ['DE', 'GB', 'FR', 'IT', 'ES', 'CH'] },
  { name: 'Asia/Pacific', countries: ['JP', 'AU', 'CN', 'IN'] },
];

export function WB(_: FnProps) {
  useTick(2);
  const ust = engine.quote('USGG10YR Index')!.last;
  const bund = engine.quote('GDBR10 Index')!.last;
  // The desktop app lists only countries with an official source, and only their published tenors.
  const has = (id?: string) => !!id && engine.hasSource(id);
  const rows = WB_ROWS.filter((r) => Object.values(r.ids).some(has));
  const panel = usePanelId();
  // A country's line opens its 10-year yield chart, or its longest published tenor where there is no 10-year.
  const benchmark = (r: (typeof rows)[number]) => (has(r.ids[10]) ? r.ids[10] : [30, 5, 2].map((t) => r.ids[t]).find(has));
  const open = (r: (typeof rows)[number], e?: MouseEvent) => {
    const id = benchmark(r);
    if (id) openSecurity(panel, id, e, 'CHART');
  };
  // Regions 1) to 3) fold and unfold; each numbers its countries from its own ten, so the numbers stay put.
  const [collapsed, toggle] = useCollapsed();
  const lists = WB_REGIONS.map((g) => g.countries.map((c) => rows.find((r) => r.c === c)).filter((r): r is (typeof rows)[number] => !!r));
  const regions = WB_REGIONS.map((g, gi) => ({ ...g, rows: lists[gi], gi })).filter((g) => g.rows.length > 0);
  const nums = useGroupedRows('wb-rows', lists, WB_REGIONS.map((g) => !collapsed.includes(g.name)), (r) => open(r), (r) => COUNTRY_NAMES[r.c]);
  useMenu('wb-regions', WB_REGIONS.map((g, gi) => ({ n: gi + 1, label: g.name, run: () => toggle(g.name) })));
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
          {regions.map((g) => (
            <Fragment key={g.name}>
              <GroupRow n={g.gi + 1} name={g.name} span={11} open={!collapsed.includes(g.name)} onToggle={() => toggle(g.name)} />
          {(collapsed.includes(g.name) ? [] : g.rows).map((r, i) => {
            const ten = r.ids[10];
            const q10 = engine.quote(ten)!;
            const two = has(r.ids[2]) ? engine.quote(r.ids[2])!.last : NaN;
            const n = nums[g.gi][i];
            return (
              <tr key={r.c} className="click" onClick={(e) => open(r, e)} title={`${COUNTRY_NAMES[r.c]}: click, or type ${n} and GO, for the ${has(ten) ? '10-year' : 'benchmark'} yield chart`}>
                <td className="amber">
                  <RowNo n={n} />
                  {COUNTRY_NAMES[r.c]}
                </td>
                {[2, 5, 10, 30].map((t) => (
                  <td key={t} className="num white">
                    {has(r.ids[t]) ? (
                      <SecLink id={r.ids[t]} fn="CHART">
                        <LivePx id={r.ids[t]} />
                      </SecLink>
                    ) : (
                      // A tenor the country's source does not publish (the Bank of England's par yields stop at 5, 10
                      // and 20 years; the RBA's at 10).
                      <span className="faint" title="Not published by this country's official source" />
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
                <td className="num">{r.c === 'US' ? '' : spread(q10.last, ust)}</td>
                <td className="num hide-m">{r.c === 'DE' ? '' : spread(q10.last, bund)}</td>
                <td className="num hide-m">{spread(q10.last, two)}</td>
              </tr>
            );
          })}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="note">
        {engine.realOnly
          ? 'Spreads and curve slope in basis points. Each yield is the figure its source publishes: US Treasury par yields, Bundesbank zero-coupon yields, Bank of England par yields, Japanese Ministry of Finance constant-maturity yields, Bank of Canada benchmark yields and RBA interpolated yields, so methods differ slightly between countries. All are end of day; the Cboe intraday 5, 10 and 30-year Treasury yield indices are separate lines (FVX, TNX, TYX). Countries without a free official source are not listed.'
          : 'Spreads and curve slope in basis points. Simulated curves move with US rates through a country beta.'}
      </div>
      <Credits ids={['treasury', 'bundesbank', 'boe', 'mof', 'boc', 'rba']} />
    </div>
  );
}

// ----------------------------------------------------------------- WBMV

const MOVER_PERIODS: { n: number; label: string; h: Horizon }[] = [
  { n: 1, label: '1D', h: '1D' },
  { n: 2, label: '5D', h: '5D' },
  { n: 3, label: '1M', h: '1M' },
  { n: 4, label: 'YTD', h: 'YTD' },
];

/** Lines ranked by the size of their move, largest first, rises and falls together; lines without one are left out. */
export function rankMovers<T extends { chg: number }>(lines: T[]): T[] {
  return lines.filter((l) => Number.isFinite(l.chg)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg));
}

/**
 * WBMV, World Bond Movers: every government yield the app has (the lines of BONDS), ranked by how far it moved over
 * the period, so the markets with the most price action come first.
 */
export function WBMV(_: FnProps) {
  useTick(2);
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const period = MOVER_PERIODS[tab - 1];
  const lines = rankMovers(
    WB_ROWS.flatMap((r) =>
      Object.entries(r.ids)
        .filter(([, id]) => engine.hasSource(id))
        .map(([tenor, id]) => ({ c: r.c, tenor: Number(tenor), id, chg: periodChange(id, period.h) })),
    ),
  );
  const nums = useNumberedRows('wbmv-rows', lines, 1, (l) => openSecurity(panel, l.id, undefined, 'CHART'), (l) => `${COUNTRY_NAMES[l.c]} ${l.tenor}Y`);
  const max = Math.max(...lines.map((l) => Math.abs(l.chg)), 0.0001);
  const up = lines.filter((l) => l.chg > 0).length;
  return (
    <div>
      <FnHeader code="BONDMOVERS" title="World Bond Movers" sub={<>Government yields ranked by their move · <RatesSource /></>} tabs={MOVER_PERIODS.map((p) => ({ n: p.n, label: p.label }))} tab={tab} onTab={setTab} />
      <div className="pad-s muted">
        {lines.length ? `${up} of ${lines.length} yields rose over ${period.label === '1D' ? 'the day' : period.label}; the largest moves first.` : 'No government yield has a change for this period yet.'}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Country</th>
            <th className="num">Tenor</th>
            <th className="num">Yield</th>
            <th className="num">{period.label} chg (bp)</th>
            <th className="hide-m" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="click" onClick={(e) => openSecurity(panel, l.id, e, 'CHART')}>
              <td className="amber">
                <RowNo n={nums[i]} />
                {COUNTRY_NAMES[l.c]}
              </td>
              <td className="num">{l.tenor}Y</td>
              <td className="num white">
                <SecLink id={l.id} fn="CHART">
                  <LivePx id={l.id} />
                </SecLink>
              </td>
              <td className="num">
                <Chg v={l.chg} bp />
              </td>
              <td className="hide-m" style={{ width: '30%' }}>
                <span className={`mover-bar ${l.chg >= 0 ? 'up' : 'dn'}`} style={{ width: `${(Math.abs(l.chg) / max) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        Each yield is its official source&apos;s, as on BONDS, so methods differ slightly between countries; changes are in basis points against the close {period.label === '1D' ? 'before' : `at the start of the ${period.label} period`}. Countries without a free official source are not listed.
      </div>
      <Credits ids={['treasury', 'bundesbank', 'boe', 'mof', 'boc', 'rba']} />
    </div>
  );
}

/** Difference in basis points, or nothing when either yield is missing. */
function spread(a: number, b: number): string {
  return Number.isFinite(a) && Number.isFinite(b) ? fmtNum((a - b) * 100, 0) : '';
}

// ------------------------------------------------------------------- GC

const COMPARE = [
  { k: 0, label: 'Current', color: '#ffb547' },
  { k: 7, label: '1W ago', color: '#45d3e6' },
  { k: 30, label: '1M ago', color: '#d77bff' },
  { k: 365, label: '1Y ago', color: '#6d6d6d' },
];

/** Whose credit a country's curve carries. */
const CURVE_CREDIT: Record<string, CreditId> = { US: 'treasury', DE: 'bundesbank', GB: 'boe', JP: 'mof', CA: 'boc', AU: 'rba' };

export function GC({ route }: FnProps) {
  useTick(2);
  // CURVE DE opens on Germany's curve (IYC lists one line per country).
  const [tab, setTab] = useState(() => Math.max(1, CURVES.findIndex((c) => c.code === route.args?.trim().toUpperCase()) + 1));
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

function fedTargetRange(target: ReturnType<typeof currentPolicyTarget>): string {
  if (!Number.isFinite(target.value)) return '--';
  return Number.isFinite(target.lower) ? `${fmtNum(target.lower!, 2)}-${fmtNum(target.value, 2)}%` : `${fmtNum(target.value, 2)}% (upper bound; lower unavailable)`;
}

/** A target's check belongs to its actual statement/implementation pair or to its daily observation source. */
function FedTargetSource({ rates, now }: { rates: PolicyRates; now: number }) {
  const target = currentPolicyTarget(rates, 'FED', rates.fedUpper, now);
  const health = policyTargetHealth(rates, 'FED', 'fedUpper', now);
  return <div className="note" data-testid="fed-target-source">
    Target source: {target.source === 'statement' ? <a href={target.sourceUrl} target="_blank" rel="noreferrer noopener">Federal Reserve statement and implementation</a> : 'New York Fed observations'}{target.sourceAsOf ? ` dated ${target.sourceAsOf}` : '; no current target available'}.
    {target.effectiveDate && ` In force from ${target.effectiveDate}.`}
    {health?.checkedAt ? ` Last successful target check: ${fmtDateTime(health.checkedAt)}.` : ' No successful target check recorded.'}
    {health?.state === 'cached' && ' Cached source response; the successful-check date is unchanged.'}
    {health?.state === 'error' && ` Latest target check failed${health.error ? `: ${health.error}` : '.'} Retained target keeps its source dates.`}
    {target.conflict && ` ${target.conflict}`}
  </div>;
}

function FundingSource({ rates, source }: { rates: PolicyRates; source: 'nyfed' | 'effr' }) {
  const health = rates.health?.[source];
  return <div className="note">
    {health?.checkedAt ? `Last successful funding-rate check: ${fmtDateTime(health.checkedAt)}.` : 'No successful funding-rate check recorded.'}
    {health?.state === 'cached' && ' Cached source response; observations retain their dates.'}
    {health?.state === 'error' && ` Latest funding-rate check failed${health.error ? `: ${health.error}` : '.'} Retained observations keep their source dates.`}
  </div>;
}

/** BTMM on real data: New York Fed reference rates, Treasury bills, curve spreads and SOFR futures. */
function BTMMReal() {
  useTick(2);
  const pr = policyRates.use((x) => x);
  const funding = pr.funding ?? [];
  const asOf = funding.reduce((m, f) => (f.date > m ? f.date : m), '');
  const now = engine.now();
  const target = currentPolicyTarget(pr, 'FED', pr.fedUpper, now);
  const fed = centralBanks(now).find((b) => b.code === 'FED');
  const calendar = policyMeetingState('FED', pr.fomc ?? fed?.meetings ?? [], pr.decisions ?? [], now);
  const nextFomc = calendar.next?.date;
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
              {Number.isFinite(target.value) ? (
                <tr data-testid="money-target">
                  <td className="amber">Fed funds target</td>
                  <td className="num white">
                    {fedTargetRange(target)}
                  </td>
                  <td className="num hide-m muted">{target.effectiveDate ? `since ${fmtDay(Date.parse(`${target.effectiveDate}T00:00:00Z`))}` : 'Effective date unavailable'}</td>
                  {/* A target, not a traded rate: no volume. */}
                  <td className="num" />
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
          <FedTargetSource rates={pr} now={now} />
          <FundingSource rates={pr} source="nyfed" />
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
      <Section title="Three-month SOFR futures (CME)" right={`implied rate = 100 - price${sofr.length ? ` · ${quotesTiming(sofr.map((c) => c.q))}` : ''}`}>
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
      <Credits ids={['treasury', 'nyfed', 'fedboard', 'bundesbank', 'boe']} />
    </div>
  );
}

function BTMMSim(_: FnProps) {
  useTick(2);
  const fed = centralBanks()[0];
  // The New York Fed's published levels in the desktop app; otherwise the usual spreads to the range.
  const pr = policyRates.use((x) => x);
  const target = currentPolicyTarget(pr, 'FED', pr.fedUpper, engine.now());
  const realPolicy = Number.isFinite(target.value);
  const upper = realPolicy ? target.value : fed.rate;
  const lower = realPolicy ? target.lower ?? NaN : fed.rate - 0.25;
  const effr = pr.effr?.last ?? lower + 0.08;
  const sofr = pr.sofr?.last ?? effr + 0.02;
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
        <Section title="Policy and funding" right={<SimBadge />}>
          <KV
            items={[
              ['Fed funds target', realPolicy ? fedTargetRange(target) : `${fmtNum(lower, 2)}-${fmtNum(upper, 2)}%`],
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

const WIRP_NOTE =
  '#Hikes/Cuts counts the 25 bp moves priced from today’s rate to after each meeting (cumulative); %Hike/Cut is the move priced at that meeting alone ÷ 25 bp, signed and uncapped, so +140% is one hike fully priced and a 40% chance of a second at that meeting, and -100% one full cut. Imp. rate Δ is the implied rate after the meeting minus today’s rate.';

/** Column headers shared by the real and simulated WIRP tables. */
function WirpHead() {
  return (
    <thead>
      <tr>
        <th>Meeting</th>
        <th className="num" title="Cumulative: 25 bp moves priced from today's rate to after the meeting">#Hikes/Cuts</th>
        <th className="num" title="This meeting alone: its own priced move ÷ 25 bp, signed and uncapped (+ hike, - cut)">%Hike/Cut</th>
        <th className="num">Imp. rate</th>
        <th className="num" title="Cumulative: implied rate after the meeting minus today's rate, bp">Imp. rate Δ bp</th>
      </tr>
    </thead>
  );
}

function WirpCells({ m }: { m: MeetingMoves }) {
  return (
    <>
      <td className="num">
        <Chg v={m.cumMoves} dec={2} />
      </td>
      <td className="num">
        <Chg v={m.stepPct} dec={1} pct />
      </td>
    </>
  );
}

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
  const target = currentPolicyTarget(pr, 'FED', pr.fedUpper, now);
  const current = pr.effr?.last ?? NaN;
  const awaitingEffr = !!target.effectiveDate && !!pr.effr?.asOf && pr.effr.asOf < target.effectiveDate;
  const meetings = pr.fomc ?? centralBanks().find((b) => b.code === 'FED')?.meetings ?? [];
  const months = strip.map((c) => ({ year: c.year, month: c.month, avg: 100 - Number(c.q.regularMarketPrice) }));
  const path = awaitingEffr ? [] : fedPath(months, meetings, current, now);
  const step = 0.25;
  const header = (
    <FnHeader
      code="RATEPROBS"
      title="World Interest Rate Probability"
      sub={
        <>
          Federal Reserve · <RealBadge /> CBOT 30-day fed funds futures (via Yahoo{strip.length ? `, ${quotesTiming(strip.map((c) => c.q))}` : ''}), New York Fed effective rate, FOMC calendar
        </>
      }
    />
  );
  return (
    <div>
      {header}
      <div className="chart-tools">
        <span>
          <span className="amber">Latest observed effective fed funds</span> {Number.isFinite(current) ? <>{fmtNum(current, 2)}% ({fmtDay(Date.parse(`${pr.effr!.asOf}T00:00:00Z`))})</> : '--'}
        </span>
        <span data-testid="probability-target"><span className="amber">Target range</span> {fedTargetRange(target)}</span>
        <span className="muted">Positive = hikes priced, negative = cuts.</span>
      </div>
      <FedTargetSource rates={pr} now={now} />
      <FundingSource rates={pr} source="effr" />
      {awaitingEffr ? <div className="empty">Awaiting an effective fed funds observation on or after {target.effectiveDate}. The older observation remains dated above; current probabilities are unavailable.</div> : !Number.isFinite(current) || !strip.length ? <div className="empty">{!Number.isFinite(current) ? 'Loading the effective fed funds rate from the New York Fed…' : 'Loading fed funds futures…'}</div> : path.length === 0 ? (
        <div className="empty">No upcoming FOMC decision is covered by the listed futures.</div>
      ) : (
        <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
          <Section title="Meeting by meeting">
            <table className="tbl">
              <WirpHead />
              <tbody>
                {path.map((r) => {
                  const m = meetingMoves(r.start, r.end, current, step * 100);
                  return (
                    <tr key={r.date}>
                      <td className="amber">{fmtDay(Date.parse(`${r.date}T00:00:00Z`))}</td>
                      <WirpCells m={m} />
                      <td className="num white">{fmtNum(r.end, 3)}</td>
                      <td className="num">
                        <Chg v={m.cumBp} dec={1} />
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
        Method as CME FedWatch: each contract settles on its month's average effective rate. A month without a decision fixes the rate after the meeting before it; in a decision month the average splits into the days before and after the decision. {WIRP_NOTE} Futures settle on the effective rate, which trades inside the target range, so implied rates sit near the middle of the range. Only the Fed is covered: the ECB, Bank of England and Bank of Japan have no free futures source here.
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
      return { t, implied, step };
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
              <WirpHead />
              <tbody>
                {rows.map((r) => {
                  const m = meetingMoves(r.implied - r.step, r.implied, current, cfg.step * 100);
                  return (
                    <tr key={r.t}>
                      <td className="amber">{fmtDay(r.t)}</td>
                      <WirpCells m={m} />
                      <td className="num white">{fmtNum(r.implied, 3)}</td>
                      <td className="num">
                        <Chg v={m.cumBp} dec={1} />
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
      <div className="note">Bars use forward rates between meeting dates. {WIRP_NOTE}</div>
    </div>
  );
}

