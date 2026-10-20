import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { closeAt } from '../data/analytics';
import { engine, useTick } from '../data/market';
import { nasdaqSymbol, parseFinraShort, type NasdaqShort } from '../data/live/nasdaq-company';
import { getRealFund, useFundamentals } from '../data/live/yfund';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const RANGES = [
  { n: 1, label: '6M', days: 183 },
  { n: 2, label: '1Y', days: 365 },
  { n: 3, label: '2Y', days: 730 },
];

/**
 * SI, short interest: the shares sold short at each settlement (twice a month) from FINRA's consolidated record for
 * every US listing, with the short interest ratio (days to cover), the share of the float and the average daily
 * volume, and their changes, beside the price.
 */
export function SI({ sec }: FnProps) {
  const s = sec!;
  useTick(10);
  const panel = usePanelId();
  useFundamentals(s);
  const [range, setRange] = useState(2);
  const [state, setState] = useState<{ key: string; rows: NasdaqShort[] | null; message?: string } | null>(null);
  const symbol = s.country === 'US' && s.cls === 'equity' ? nasdaqSymbol(s) : null;
  useEffect(() => {
    if (!symbol || typeof window.arminDesktop?.finra !== 'function') return;
    let stopped = false;
    void window.arminDesktop
      .finra('short-history', symbol)
      .then((res) => {
        if (stopped) return;
        const parsed = res.text ? parseFinraShort(res.text) : { error: res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer') };
        setState('error' in parsed ? { key: symbol, rows: null, message: `FINRA: ${parsed.error}` } : { key: symbol, rows: parsed.data ?? [] });
      })
      .catch(() => !stopped && setState({ key: symbol, rows: null, message: 'FINRA: the request could not be made.' }));
    return () => {
      stopped = true;
    };
  }, [symbol]);
  const all = state?.key === symbol ? state.rows ?? [] : [];
  const days = RANGES.find((r) => r.n === range)!.days;
  const from = engine.today * DAY_MS - days * DAY_MS;
  const rows = all.filter((r) => r.date >= from);
  const latest = all[0];
  const prior = all[1];
  const real = getRealFund(s.id);
  const float = real?.float.float;
  const sharesOut = (real?.stats.shares && real.stats.shares > 0 ? real.stats.shares : s.eq?.shares ?? NaN) * 1e6;
  const pctFloat = (r: NasdaqShort | undefined) => (r && float && float > 0 ? (r.shares / float) * 100 : NaN);
  const pctOut = (r: NasdaqShort | undefined) => (r && sharesOut > 0 ? (r.shares / sharesOut) * 100 : NaN);
  const chg = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b - 1) * 100 : NaN);
  const daily = engine.daily(s.id);
  const asc = [...rows].reverse();
  const price = daily.length ? asc.map((r) => ({ x: r.date, y: closeAt(daily, r.date), label: fmtDay(r.date) })) : [];
  const csv = () => [['Settlement Date', 'Short Interest', 'Change', 'Avg Daily Volume', 'Days to Cover', '% Float', '% Shrs Out'], ...rows.map((r, i) => [fmtDay(r.date, true), r.shares, rows[i + 1] ? r.shares - rows[i + 1].shares : '', r.avgVolume, r.daysToCover, pctFloat(r), pctOut(r)])];
  const loading = !!symbol && state?.key !== symbol;
  return (
    <div>
      <FnHeader
        code="SHORTINTEREST"
        title="Short Interest"
        sec={s}
        tabs={RANGES.map((r) => ({ n: r.n, label: r.label }))}
        tab={range}
        onTab={setRange}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_SI.csv`, csv)}
      />
      <QuoteStrip sec={s} />
      {!symbol ? (
        <div className="empty">Short interest comes from FINRA&apos;s consolidated record, which covers US-listed stocks (desktop app).</div>
      ) : loading ? (
        <div className="empty">Reading FINRA&apos;s short interest record…</div>
      ) : !latest ? (
        <div className="empty">{state?.message ?? `FINRA has no short interest for ${symbol}.`}</div>
      ) : (
        <>
          <div className="si-top">
            <KV
              items={[
                ['Settlement Date', fmtDay(latest.date)],
                ['Short Interest', `${fmtBig(latest.shares, 2)}${prior ? `  (${fmtPct(chg(latest.shares, prior.shares), 1)})` : ''}`],
                ['Short Interest Ratio', `${fmtNum(latest.daysToCover, 2)} days${prior ? `  (${fmtPct(chg(latest.daysToCover, prior.daysToCover), 1)})` : ''}`],
                ['Short Interest % Float', Number.isFinite(pctFloat(latest)) ? `${fmtNum(pctFloat(latest), 2)}%${prior ? `  (${fmtNum(pctFloat(latest) - pctFloat(prior), 2)} pts)` : ''}` : '--'],
                ['Short Interest % Shrs Out', Number.isFinite(pctOut(latest)) ? `${fmtNum(pctOut(latest), 2)}%` : '--'],
                ['Avg Daily Volume', fmtBig(latest.avgVolume, 2)],
              ]}
            />
            <XYChart
              height={170}
              series={[
                { label: 'Price', color: '#e8e8e8', points: price },
                { label: 'Short Interest Ratio', color: '#ff9e1b', points: asc.map((r) => ({ x: r.date, y: r.daysToCover, label: fmtDay(r.date) })), axis: 'left', markers: true },
              ]}
              xFormat={(v) => fmtDay(v)}
              yFormat={(v) => fmtNum(v, 2)}
              y2Format={(v) => fmtNum(v, 1)}
            />
          </div>
          <XYChart
            height={130}
            series={[{ label: 'Short Interest', color: '#5aa7ff', kind: 'bar', points: asc.map((r) => ({ x: r.date, y: r.shares, label: fmtDay(r.date) })) }]}
            xFormat={(v) => fmtDay(v)}
            yFormat={(v) => fmtBig(v, 0)}
            yZero
          />
          <table className="tbl zebra">
            <thead>
              <tr>
                <th>Settlement Date</th>
                <th className="num">Short Interest</th>
                <th className="num">Change</th>
                <th className="num hide-m">Avg Daily Vol</th>
                <th className="num">Days to Cover</th>
                <th className="num">% Float</th>
                <th className="num hide-m">% Shrs Out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const before = rows[i + 1] ?? all[all.indexOf(r) + 1];
                const d = before ? r.shares - before.shares : NaN;
                return (
                  <tr key={r.date}>
                    <td className="amber">{fmtDay(r.date)}</td>
                    <td className="num white">{fmtNum(r.shares, 0)}</td>
                    <td className={`num ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}`}>{Number.isFinite(d) ? `${d > 0 ? '+' : ''}${fmtNum(d, 0)}` : ''}</td>
                    <td className="num hide-m">{fmtNum(r.avgVolume, 0)}</td>
                    <td className="num">{fmtNum(r.daysToCover, 2)}</td>
                    <td className="num">{Number.isFinite(pctFloat(r)) ? fmtNum(pctFloat(r), 2) : ''}</td>
                    <td className="num hide-m">{Number.isFinite(pctOut(r)) ? fmtNum(pctOut(r), 2) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="pad-s muted">
            FINRA&apos;s consolidated short interest, reported by brokers for the settlement dates twice a month and published about a week later. Short interest ratio: the short interest over the
            average daily volume (days to cover). % Float uses the latest float{float ? '' : ', which Yahoo did not give this time'}; % Shrs Out the shares outstanding now.
          </p>
        </>
      )}
    </div>
  );
}
