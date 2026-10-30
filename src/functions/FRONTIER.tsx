import { useMemo, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { cmlSlope, frontierSd } from '../finance/mean-variance';
import { analyse, optimum, parseAssets, priceTable } from '../data/frontier';
import { useMonthEndPrices } from '../data/live/month-end-prices';
import { desktopData } from '../data/live/yahoo';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * FRONTIER, mean-variance portfolio analysis as the first portfolio paper built it: month-end last prices, a long-only
 * minimum-variance optimum over the screened names (names under 1% marked), then the efficient frontier, the global
 * minimum-variance, equally weighted and tangency portfolios, the capital market line and the Sharpe ratio on the
 * names kept. Monthly figures throughout, as in the paper; rf is a yearly rate divided by 12.
 */

const SCREENED = 'BATS LN, GSK LN, RKT LN, FERG LN, PSN LN, REL LN, NXT LN, DGE LN, CRDA LN, BKG LN';
const PORTFOLIO = 'BATS LN, GSK LN, RKT LN, DGE LN';
const TABS = [
  { n: 1, label: 'Prices' },
  { n: 2, label: 'Optimum' },
  { n: 3, label: 'Frontier' },
  { n: 4, label: 'GMVP' },
  { n: 5, label: 'EWP' },
  { n: 6, label: 'Tangency' },
  { n: 7, label: 'Summary' },
];
const COLORS = { epf: '#29b6f6', cml: '#3cb043', tp: '#ff3b30', gmvp: '#f0a030', ewp: '#ffd400' };
/** The paper's cell colours: return green, variance yellow, standard deviation orange, a weight under 1% yellow. */
const CELL = { ret: '#92d050', variance: '#ffff00', sd: '#ffc000' };

/** A spreadsheet's general format: up to nine decimals, no trailing zeros. */
export const general = (v: number, dec = 9) => (Number.isFinite(v) ? String(Number(v.toFixed(dec))) : '');
const pct = (v: number, dec = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(dec)}%` : '');
/** 2009-02-27 as 27/02/2009. */
const dmy = (day: string) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '');
const monthName = (m: string) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

/** The last whole month before today's. */
function lastWholeMonth(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num" style={color ? { background: color, color: '#000' } : undefined}>{value}</td>
    </tr>
  );
}

export function FRONTIER(_: FnProps) {
  const panel = usePanelId();
  const [screened, setScreened] = useState(SCREENED);
  const [chosen, setChosen] = useState(PORTFOLIO);
  const [from, setFrom] = useState('2009-02');
  const [to, setTo] = useState('2019-01');
  const [rfYear, setRfYear] = useState('3');
  const [tab, setTab] = useState(7);
  const last = lastWholeMonth();
  const scr = useMemo(() => parseAssets(screened), [screened]);
  const port = useMemo(() => parseAssets(chosen), [chosen]);
  const symbols = useMemo(() => [...new Set([...scr.assets, ...port.assets].map((a) => a.yahoo))], [scr.assets, port.assets]);
  const valid = /^\d{4}-\d{2}$/.test(from) && /^\d{4}-\d{2}$/.test(to) && from < to && to <= last;
  const { by, pending, problem } = useMonthEndPrices(desktopData() && valid ? symbols : [], from, to);
  const rf = Number(rfYear) / 100 / 12;
  const ready = valid && pending === 0;
  const screenedTable = useMemo(() => (ready ? priceTable(scr.assets, by, from, to) : null), [ready, scr.assets, by, from, to]);
  const table = useMemo(() => (ready ? priceTable(port.assets, by, from, to) : null), [ready, port.assets, by, from, to]);
  const opt = useMemo(() => (screenedTable && screenedTable.kept.length >= 2 ? optimum(screenedTable.prices) : null), [screenedTable]);
  const res = useMemo(() => (table && table.kept.length >= 2 && Number.isFinite(rf) ? analyse(table.prices, rf) : null), [table, rf]);
  const names = table?.kept.map((a) => a.label) ?? [];

  const chart: XYSeries[] = useMemo(() => {
    if (!res) return [];
    const { mv } = res;
    const top = Math.max(res.tp ? res.tp.stats.ret * 5.5 : 0, Math.max(...mv.mu) * 2, res.gmvp.ret * 2);
    // From a 0% return up, as the paper draws it; lower when the minimum-variance return is itself below zero.
    const bottom = Math.min(0, res.gmvp.ret * 2);
    const epf = Array.from({ length: 161 }, (_, i) => bottom + ((top - bottom) * i) / 160).map((m) => ({ x: frontierSd(mv, m) * 100, y: m * 100 }));
    const sdMax = Math.max(...epf.map((p) => p.x));
    const near = Math.abs(res.gmvp.sd - res.ewp.sd) < 0.001 && Math.abs(res.gmvp.ret - res.ewp.ret) < 0.0005;
    const out: XYSeries[] = [{ label: 'EPF', color: COLORS.epf, points: epf, width: 2.2 }];
    if (res.tp) {
      const slope = cmlSlope(mv, rf);
      out.push({ label: 'CML', color: COLORS.cml, points: [{ x: 0, y: rf * 100 }, { x: sdMax, y: (rf + (slope * sdMax) / 100) * 100 }] });
      out.push({ label: 'TP', color: COLORS.tp, kind: 'scatter', shape: 'diamond', points: [{ x: res.tp.stats.sd * 100, y: res.tp.stats.ret * 100, label: 'TP' }] });
    }
    out.push({ label: 'GMVP', color: COLORS.gmvp, kind: 'scatter', shape: 'cross', points: [{ x: res.gmvp.sd * 100, y: res.gmvp.ret * 100, label: near ? 'GMVP ≈ EWP' : 'GMVP' }] });
    out.push({ label: 'EWP', color: COLORS.ewp, kind: 'scatter', shape: 'dot', labelBelow: true, points: [{ x: res.ewp.sd * 100, y: res.ewp.ret * 100, label: near ? undefined : 'EWP' }] });
    return out;
  }, [res, rf]);

  const csv = (): (string | number)[][] => {
    if (tab === 1 && table) return [['Dates', ...names], ...table.dates.map((d, i) => [dmy(d), ...table.prices.map((p) => p[i])])];
    if (tab === 2 && opt && screenedTable) return [['Security', 'Weight'], ...screenedTable.kept.map((a, i) => [a.label, opt.weights[i]])];
    if (!res) return [['No results']];
    return [
      ['', 'GMVP', 'EWP', 'TP'],
      ...names.map((n, i) => [n, res.mv.gmvp[i], res.mv.ewp[i], res.tp?.weights[i] ?? '']),
      ['Portfolio Return', res.gmvp.ret, res.ewp.ret, res.tp?.stats.ret ?? ''],
      ['Portfolio Variance', res.gmvp.variance, res.ewp.variance, res.tp?.stats.variance ?? ''],
      ['Portfolio SD', res.gmvp.sd, res.ewp.sd, res.tp?.stats.sd ?? ''],
    ];
  };

  const status = !desktopData()
    ? 'The analysis runs on real month-end prices from Yahoo Finance in the desktop app. The browser demo has none, and none are generated.'
    : !valid
      ? `Choose whole months, the start before the end and the end no later than ${monthName(last)}.`
      : !port.assets.length
        ? 'Type the portfolio securities, e.g. BATS LN, GSK LN.'
        : pending > 0
          ? `Reading month-end prices from Yahoo Finance: ${symbols.length - pending} of ${symbols.length}…`
          : '';

  const weightsTable = (title: string, weights: number[], stats: { ret: number; variance: number; sd: number }, extra?: ReactNode) => (
    <div className="row" style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <table className="tbl" style={{ width: 'auto', minWidth: 300 }} aria-label={`${title} weights`}>
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Portfolio Weights</th>
          </tr>
        </thead>
        <tbody>
          {names.map((n, i) => (
            <tr key={n}>
              <td>{n}</td>
              <td className="num">{pct(weights[i])}</td>
            </tr>
          ))}
          <tr>
            <td />
            <td className="num">{pct(weights.reduce((a, b) => a + b, 0))}</td>
          </tr>
        </tbody>
      </table>
      <table className="tbl" style={{ width: 'auto', minWidth: 280 }} aria-label={`${title} results`}>
        <tbody>
          <Stat label="Portfolio Return" value={general(stats.ret)} color={CELL.ret} />
          <Stat label="Portfolio Variance" value={general(stats.variance)} />
          <Stat label="Portfolio SD" value={general(stats.sd)} color={CELL.sd} />
          {extra}
        </tbody>
      </table>
    </div>
  );

  const notes = (t: typeof table, what: string) =>
    t ? (
      <>
        {t.missing.map((a) => (
          <div key={a.yahoo} className="note amber" role="status">{`No prices from Yahoo Finance for ${a.label} (${a.yahoo}): left out of the ${what}.`}</div>
        ))}
        {t.partial.map((p) => (
          <div key={p.asset.yahoo} className="note amber" role="status">{`${p.asset.label} has month-end prices only from ${monthName(p.first!)} to ${monthName(p.last!)}: left out of the ${what}, as every security needs a price in every month.`}</div>
        ))}
      </>
    ) : null;

  return (
    <div>
      <FnHeader
        code="FRONTIER"
        title="Mean-Variance Portfolio"
        sub={
          <>
            <RealBadge /> Month-end last prices from Yahoo Finance, adjusted for splits and not dividends
            {table ? `, ${monthName(from)} to ${monthName(to)}: ${Math.max(0, table.months.length - 1)} monthly returns. Monthly figures; rf ${general(rf)} a month.` : ''}
          </>
        }
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `FRONTIER_${TABS[tab - 1].label}.csv`, csv)}
        controls={
          <div className="chart-tools" style={{ flexWrap: 'wrap' }}>
            <label className="fld">
              Screened
              <input className="inp" style={{ width: 420 }} aria-label="Screened securities" value={screened} onChange={(e) => setScreened(e.target.value)} />
            </label>
            <label className="fld">
              Portfolio
              <input className="inp" style={{ width: 260 }} aria-label="Portfolio securities" value={chosen} onChange={(e) => setChosen(e.target.value)} />
            </label>
            <label className="fld">
              From
              <input className="inp" type="month" aria-label="First month" max={last} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="fld">
              To
              <input className="inp" type="month" aria-label="Last month" max={last} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="fld">
              Rf % a year
              <input className="inp" style={{ width: 60 }} aria-label="Risk-free rate, percent a year" inputMode="decimal" value={rfYear} onChange={(e) => setRfYear(e.target.value)} />
            </label>
          </div>
        }
      />
      {[...scr.bad, ...port.bad].length > 0 && <div className="note amber" role="status">{`Not understood: ${[...new Set([...scr.bad, ...port.bad])].join(', ')}. Type a security as BATS LN, BATS.L or AAPL US.`}</div>}
      {status ? (
        <div className="empty">{status}</div>
      ) : tab === 1 && table ? (
        <>
          {notes(table, 'portfolio')}
          <table className="tbl" aria-label="Month-end last prices">
            <thead>
              <tr>
                <th>Start Date</th>
                <th className="num">{dmy(table.dates[0])}</th>
              </tr>
              <tr>
                <th>End Date</th>
                <th className="num">{dmy(table.dates.at(-1) ?? '')}</th>
              </tr>
              <tr>
                <th />
                {names.map((n) => (
                  <th key={n} className="num">{n}</th>
                ))}
              </tr>
              <tr>
                <th>Dates</th>
                {names.map((n) => (
                  <th key={n} className="num">PX_LAST</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.dates.map((d, i) => (
                <tr key={d}>
                  <td>{dmy(d)}</td>
                  {table.prices.map((p, k) => (
                    <td key={names[k]} className="num">{general(p[i], 3)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : tab === 2 ? (
        <>
          {notes(screenedTable, 'optimum')}
          {opt && screenedTable ? (
            <>
              <div className="row" style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <table className="tbl" style={{ width: 'auto', minWidth: 300 }} aria-label="Optimum weights">
                  <thead>
                    <tr>
                      <th />
                      <th className="num">Portfolio Weights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenedTable.kept.map((a, i) => (
                      <tr key={a.yahoo}>
                        <td>{a.label}</td>
                        <td className="num" style={opt.weights[i] < 0.01 ? { background: CELL.variance, color: '#000' } : undefined}>{pct(opt.weights[i])}</td>
                      </tr>
                    ))}
                    <tr>
                      <td />
                      <td className="num">{pct(opt.weights.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  </tbody>
                </table>
                <table className="tbl" style={{ width: 'auto', minWidth: 280 }} aria-label="Optimum results">
                  <tbody>
                    <Stat label="Portfolio Return" value={general(opt.stats.ret)} color={CELL.ret} />
                    <Stat label="Portfolio Variance" value={general(opt.stats.variance)} />
                    <Stat label="Portfolio SD" value={general(opt.stats.sd)} color={CELL.sd} />
                  </tbody>
                </table>
              </div>
              <div className="chart-tools">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setChosen(screenedTable.kept.filter((_, i) => opt.weights[i] >= 0.01).map((a) => a.label.replace(/ Equity$/, '')).join(', '))}
                >
                  Keep weights of 1% or more as the portfolio
                </button>
              </div>
              <div className="note">
                The minimum-variance portfolio of the screened names with no short positions (weights at least 0%, summing to 100%), on their monthly returns. Weights under 1% are marked, as the paper drops them.
              </div>
            </>
          ) : (
            <div className="empty">{problem ?? 'Too few screened securities with prices in every month.'}</div>
          )}
        </>
      ) : !res || !table ? (
        <>
          {notes(table, 'portfolio')}
          <div className="empty">{problem ?? (table && table.kept.length < 2 ? 'At least two portfolio securities need a price in every month.' : 'The covariance matrix cannot be inverted: one security moves as a mix of the others.')}</div>
        </>
      ) : tab === 3 ? (
        <>
          {notes(table, 'portfolio')}
          <div style={{ textAlign: 'center', fontWeight: 600 }}>Mean-St Deviation Portfolio</div>
          <div style={{ maxWidth: 920 }}>
            <div style={{ textAlign: 'right', fontWeight: 600 }}>Portfolio Return</div>
            <XYChart series={chart} xFormat={(v) => `${v.toFixed(2)}%`} yFormat={(v) => `${v.toFixed(2)}%`} height={540} legend />
            <div style={{ textAlign: 'center', fontWeight: 600 }}>St deviation</div>
          </div>
          <div className="note">
            Portfolio return (y) against standard deviation (x), monthly. EPF: σp = √((A·µp² − 2·B·µp + C)/D) with A = {general(res.mv.A, 4)}, B = {general(res.mv.B, 4)}, C = {general(res.mv.C, 6)}, D = {general(res.mv.D, 4)}.
            {res.tp ? ` CML: µp = rf + σp·√(C − 2·rf·B + rf²·A), slope ${general(cmlSlope(res.mv, rf), 6)}, tangent to the EPF at TP.` : ' No CML: rf is at or above the minimum-variance return.'}
          </div>
        </>
      ) : tab === 4 ? (
        <>
          {notes(table, 'portfolio')}
          <div style={{ fontWeight: 600 }}>Global Minimum Variance Portfolio</div>
          {weightsTable('GMVP', res.mv.gmvp, res.gmvp)}
          <div className="note">W = Σ⁻¹·1 / (1′·Σ⁻¹·1), on the sample covariance of monthly returns.</div>
        </>
      ) : tab === 5 ? (
        <>
          {notes(table, 'portfolio')}
          <div style={{ fontWeight: 600 }}>Equally Weighted Portfolio</div>
          {weightsTable('EWP', res.mv.ewp, res.ewp)}
        </>
      ) : tab === 6 ? (
        <>
          {notes(table, 'portfolio')}
          <div style={{ fontWeight: 600 }}>Tangency Portfolio</div>
          {res.tp ? (
            weightsTable('TP', res.tp.weights, res.tp.stats, (
              <>
                <Stat label="Rf=" value={general(rf)} />
                <Stat label="Risk Premium=" value={general(res.tp.stats.ret - rf)} />
                <Stat label="Sharpe Ratio =" value={general(res.tp.sharpe, 8)} color={CELL.variance} />
              </>
            ))
          ) : (
            <div className="empty">No tangency portfolio: the risk-free rate ({general(rf)} a month) is at or above the minimum-variance portfolio&apos;s return ({general(res.gmvp.ret)}).</div>
          )}
          <div className="note">W = Σ⁻¹·(µ − rf·1) / (B − A·rf). Sharpe ratio = (µp − rf)/σp, monthly; a negative weight is a short position.</div>
        </>
      ) : (
        <>
          {notes(table, 'portfolio')}
          <table className="tbl" style={{ width: 'auto', minWidth: 520 }} aria-label="Portfolio optimisation results">
            <thead>
              <tr>
                <th />
                <th className="num">GMVP</th>
                <th className="num">EWP</th>
                <th className="num">TP</th>
              </tr>
            </thead>
            <tbody>
              {names.map((n, i) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="num">{pct(res.mv.gmvp[i], 3)}</td>
                  <td className="num">{pct(res.mv.ewp[i], 3)}</td>
                  <td className="num">{res.tp ? pct(res.tp.weights[i], 3) : ''}</td>
                </tr>
              ))}
              {(
                [
                  ['Portfolio Return', 'ret', CELL.ret],
                  ['Portfolio Variance', 'variance', CELL.variance],
                  ['Portfolio SD', 'sd', CELL.sd],
                ] as const
              ).map(([label, k, color]) => (
                <tr key={label}>
                  <td style={{ background: color, color: '#000' }}>{label}</td>
                  {[res.gmvp, res.ewp, res.tp?.stats].map((s, i) => (
                    <td key={i} className="num" style={{ background: color, color: '#000' }}>{s ? pct(s[k], 3) : ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
