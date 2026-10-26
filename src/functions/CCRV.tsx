import { useMemo } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { Chg } from '../components/cells';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { fmtDay, fmtInt, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { engine } from '../data/market';
import type { SecurityDef } from '../data/types';
import { closeOnOrBefore, CURVE_COMMODITIES, MONTH, rootOf, useCurveHistory, WEEK, type Closes } from '../data/live/futures-curve';
import { contractSymbols, FUTURES_EXCHANGE, useYahooQuotes } from '../data/live/yquotes';
import { desktopData } from '../data/live/yahoo';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * CCRV, a commodity's forward curve: every listed contract month with its own price on Yahoo, by expiry, with the
 * curve a week and a month ago from each contract's own closes, the change, the spread to the front month and the
 * open interest. Contango or backwardation is read from the first and last months shown.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface CurveRow {
  symbol: string;
  label: string;
  expiry: number;
  last: number;
  change: number;
  weekAgo: number;
  monthAgo: number;
  openInterest: number;
  volume: number;
}

/** The contract months still trading, with a price, by expiry; each with its close a week and a month before `now`. */
export function curveRows(
  root: string,
  contracts: { symbol: string; month: number; year: number }[],
  quote: (symbol: string) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  history: Record<string, Closes | null>,
  now: number,
): CurveRow[] {
  return contracts
    .map((c) => {
      const q = quote(c.symbol);
      const expiry = Date.parse(String(q?.expireIsoDate ?? ''));
      return {
        symbol: c.symbol,
        label: `${root} ${MONTHS[c.month]} ${String(c.year).slice(2)}`,
        expiry,
        last: Number(q?.regularMarketPrice),
        change: Number(q?.regularMarketChange),
        weekAgo: closeOnOrBefore(history[c.symbol], now - WEEK),
        monthAgo: closeOnOrBefore(history[c.symbol], now - MONTH),
        openInterest: Number(q?.openInterest),
        volume: Number(q?.regularMarketVolume),
      };
    })
    .filter((r) => r.last > 0 && Number.isFinite(r.expiry) && r.expiry >= now - DAY_MS)
    .sort((a, b) => a.expiry - b.expiry);
}

/** Below this open interest a month barely trades, so its last price may be days old. */
export const THIN = 100;
export const thin = (r: Pick<CurveRow, 'openInterest'>) => Number.isFinite(r.openInterest) && r.openInterest < THIN;

/** Contango when the last month shown is dearer than the first, backwardation when it is cheaper. */
export function curveShape(rows: Pick<CurveRow, 'last'>[]): 'Contango' | 'Backwardation' | 'Flat' | '' {
  if (rows.length < 2) return '';
  const a = rows[0].last;
  const b = rows[rows.length - 1].last;
  return b > a ? 'Contango' : b < a ? 'Backwardation' : 'Flat';
}

function pick(sec: SecurityDef | undefined, args: string | undefined): SecurityDef {
  if (sec && CURVE_COMMODITIES.some((c) => c.id === sec.id)) return sec;
  const word = (args ?? '').trim().toUpperCase();
  return CURVE_COMMODITIES.find((c) => c.ticker === word || rootOf(c) === word || c.alias?.includes(word)) ?? engine.get('CL1 Comdty') ?? CURVE_COMMODITIES[0];
}

export function CCRV({ sec, route }: FnProps) {
  const panel = usePanelId();
  const def = pick(sec, route.args);
  const root = rootOf(def);
  const exch = FUTURES_EXCHANGE[root];
  const contracts = useMemo(() => (exch && def.cmd ? contractSymbols(root, exch, def.cmd.months, 36) : []), [root, exch, def.cmd]);
  const symbols = contracts.map((c) => c.symbol);
  const quotes = useYahooQuotes(symbols);
  const history = useCurveHistory(symbols);
  const now = Date.now();
  const rows = curveRows(root, contracts, (s) => quotes.get(s), history, now);
  const shape = curveShape(rows);
  const front = rows[0]?.last ?? NaN;
  const dec = def.dec;
  const line = (label: string, color: string, get: (r: CurveRow) => number, dash?: number[]): XYSeries => ({
    label,
    color,
    markers: true,
    ...(dash ? { dash } : {}),
    points: rows.filter((r) => Number.isFinite(get(r))).map((r) => ({ x: r.expiry, y: get(r), label: r.label })),
  });
  const series = [line('Today', '#e8e8e8', (r) => r.last), line('A week ago', '#45d3e6', (r) => r.weekAgo, [4, 3]), line('A month ago', '#ff9e1b', (r) => r.monthAgo, [2, 3])].filter((s) => s.points.length);
  const csv = () => [['Contract', 'Symbol', 'Expiry', 'Last', 'Change', 'A week ago', 'A month ago', 'Spread to front', 'Open interest', 'Volume'], ...rows.map((r) => [r.label, r.symbol, new Date(r.expiry).toISOString().slice(0, 10), r.last, r.change, r.weekAgo, r.monthAgo, r.last - front, r.openInterest, r.volume])];
  const status = !desktopData()
    ? 'Contract months are read from Yahoo Finance in the desktop app. The browser demo has none, and none are generated.'
    : !rows.length
      ? quotes.size
        ? 'Yahoo gives no price for this commodity’s contract months.'
        : 'Loading the contract months…'
      : '';
  return (
    <div>
      <FnHeader
        code="FUTURESCURVE"
        title="Commodity Forward Curves"
        sec={def}
        sub={<><RealBadge /> Yahoo Finance contract months · {def.cmd?.exch} · {def.cmd?.unit}{shape ? ` · ${shape}` : ''}</>}
        actions={exportActions(panel, `CCRV_${root}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Commodity
              <select className="sel-inp" aria-label="Commodity" value={def.id} onChange={(e) => execute(panel, `${e.target.value} FUTURESCURVE`)}>
                {CURVE_COMMODITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.alias?.[0] ?? c.ticker} · {c.ticker}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">Listed months: {def.cmd?.months}</span>
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        <>
          <XYChart series={series} xFormat={(v) => fmtDay(v)} yFormat={(v) => fmtNum(v, dec)} height={260} legend />
          <table className="tbl" aria-label="Contract months">
            <thead>
              <tr>
                <th>Contract</th>
                <th className="num">Expiry</th>
                <th className="num">Last</th>
                <th className="num">Chg</th>
                <th className="num hide-m">A week ago</th>
                <th className="num hide-m">A month ago</th>
                <th className="num">Spread to front</th>
                <th className="num hide-n">Open int.</th>
                <th className="num hide-n">Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className={thin(r) ? 'muted' : undefined} title={thin(r) ? `Thinly traded (open interest under ${THIN}): the last price may be days old` : undefined}>
                  <td className={thin(r) ? undefined : 'amber'} title={r.symbol}>{r.label}{thin(r) ? ' *' : ''}</td>
                  <td className="num">{fmtDay(r.expiry)}</td>
                  <td className="num white">{fmtNum(r.last, dec)}</td>
                  <td className="num"><Chg v={r.change} dec={dec} /></td>
                  <td className="num hide-m">{Number.isFinite(r.weekAgo) ? fmtNum(r.weekAgo, dec) : ''}</td>
                  <td className="num hide-m">{Number.isFinite(r.monthAgo) ? fmtNum(r.monthAgo, dec) : ''}</td>
                  <td className="num"><Chg v={r.last - front} dec={dec} /></td>
                  <td className="num hide-n">{Number.isFinite(r.openInterest) ? fmtInt(r.openInterest) : ''}</td>
                  <td className="num hide-n">{Number.isFinite(r.volume) ? fmtInt(r.volume) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            Each contract month&apos;s own price and expiry from Yahoo Finance (prices can be delayed); a week and a month ago are each contract&apos;s close
            on or before that day. A month Yahoo gives no price for is left out; * marks a month with open interest under {THIN}, whose last trade may
            be days old.
          </div>
        </>
      )}
    </div>
  );
}
