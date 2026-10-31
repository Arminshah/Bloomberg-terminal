import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay } from '../core/format';
import { closeAt, marketCap } from '../data/analytics';
import { engine, useHistoryVersion, useTick } from '../data/market';
import { capByYear, capSeries, shareFilings, type CapPoint } from '../data/marketcap';
import { COVER_SHARES, loadCompanyFacts, resolveFiler, secAvailable, secTicker, useSecLoad, type CompanyFacts } from '../data/live/sec';
import { realSplits } from '../data/live/yahoo';
import { wantShares } from '../data/live/shares';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const RANGES = [
  { n: 1, label: '1Y', years: 1 },
  { n: 2, label: '3Y', years: 3 },
  { n: 3, label: '5Y', years: 5 },
  { n: 4, label: '10Y', years: 10 },
  { n: 5, label: 'All', years: Infinity },
];

const YEAR_MS = 365.25 * 86_400_000;

/**
 * MARKETCAP: a company's market value over time, as each day's close times its shares outstanding as last published
 * then (the count on the cover of the latest SEC filing filed before that day, split adjusted), with its value at each
 * year's end and the change on the year before.
 */
export function MCAP({ sec }: FnProps) {
  const s = sec!;
  useTick(5);
  const panel = usePanelId();
  const history = useHistoryVersion();
  const [range, setRange] = useState(4);
  useEffect(() => wantShares(s.id), [s.id]);
  const ticker = secTicker(s);
  const facts = useSecLoad<CompanyFacts>(secAvailable() && ticker ? `facts:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadCompanyFacts(c.data.cik, force);
  });
  const cf = facts.result?.ok ? facts.result.data : null;
  // The value in the trading currency's main unit (pounds for a price in pence), and in US dollars when that is another.
  const ccy = s.ccy === 'GBp' ? 'GBP' : s.ccy === 'USd' ? 'USD' : s.ccy;
  const [inUsd, setInUsd] = useState(false);
  const fxSeries = ccy !== 'USD' ? engine.daily(`CCY:${ccy}`) : null;
  const canUsd = !!fxSeries && fxSeries.length > 0;
  const usd = inUsd && canUsd;
  const sharesNow = (s.eq?.shares ?? NaN) * 1e6;
  const series = useMemo(() => {
    const counts = shareFilings(cf);
    const splits = realSplits.get(s.id) ?? [];
    return capSeries(engine.daily(s.id), sharesNow, counts, splits, s.minor ? 0.01 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, cf, sharesNow, history]);
  // In US dollars at each day's exchange rate, so a year's change includes the currency's.
  const points: CapPoint[] = useMemo(
    () => (usd ? series.points.map((p) => ({ t: p.t, cap: p.cap * closeAt(fxSeries!, p.t) })).filter((p) => Number.isFinite(p.cap)) : series.points),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, usd, history],
  );
  const unit = usd ? 'USD' : ccy;
  // Today: the live price (the last daily bar's close) times the shares the method uses; the quote's own figure, which
  // takes the price source's share count, is shown beside it when they differ.
  const quoteCap = marketCap(s.id) * (usd ? engine.usdValue(ccy) : 1);
  const nowCap = points.length ? points[points.length - 1].cap : quoteCap;
  // The count behind today's value: the latest filed one (as known now).
  const latestCount = points.length ? points[points.length - 1].count : undefined;
  const span = RANGES[range - 1];
  const from = points.length ? Math.max(points[0].t, points[points.length - 1].t - span.years * YEAR_MS) : 0;
  const shown = points.filter((p) => p.t >= from);
  const years = capByYear(points);
  const first = shown[0];
  const last = shown[shown.length - 1];
  const change = first && last ? (last.cap / first.cap - 1) * 100 : NaN;
  const yearTicks = (() => {
    if (!shown.length) return undefined;
    const y0 = new Date(shown[0].t).getUTCFullYear();
    const y1 = new Date(shown[shown.length - 1].t).getUTCFullYear();
    const every = Math.max(1, Math.ceil((y1 - y0 + 1) / 10));
    const ticks: { v: number; label: string }[] = [];
    for (let y = y0 + 1; y <= y1; y += every) ticks.push({ v: Date.UTC(y, 0, 1), label: String(y) });
    return ticks.length >= 2 ? ticks : undefined;
  })();
  // The year's value with the shares behind it: the count's own date and the date it was filed, and the basis.
  const basisWord = series.basis === 'filings' ? 'filed count' : series.basis === 'scaled' ? "estimate: today's count moved back with the filed counts" : "estimate: today's count held";
  const csv = () => [
    ['Year', 'Close date', `Market cap (${unit})`, 'Change %', "Shares used (today's shares)", 'Count as of', 'Count filed', 'Basis'],
    ...years.map((y) => [y.year, fmtDay(y.t, true), Math.round(y.cap), Number.isFinite(y.change) ? y.change.toFixed(2) : '', y.shares ? Math.round(y.shares) : '', y.count?.end ?? '', y.count?.filed ?? '', basisWord]),
  ];
  const loadingFacts = secAvailable() && ticker && facts.loading && !cf;
  // Cover counts, or balance-sheet counts for a company that gives its cover count by share class only.
  const where = cf?.facts[COVER_SHARES]?.shares?.length ? 'cover' : 'balance sheet';
  const fromDay = series.counts[0] ? fmtDay(Date.parse(`${series.counts[0].end}T00:00:00Z`)) : '';
  const sourceNote =
    series.basis === 'filings'
      ? `Each day's close times the shares outstanding as last published: the count on the ${where} of the latest SEC filing filed before that day (${series.counts.length} counts from ${fromDay}), later stock splits applied. A count filed later, a revision included, is not used for earlier days, and the number of shares changes between filings without showing here. Days before the first filing are left out.`
      : series.basis === 'scaled'
      ? `An estimate: the filings' covers count part of the shares (${series.counts.length} counts from ${fromDay}; one share class of several, as a rule), so the share count behind today's market value is moved back in time with the counts filed before each day, later stock splits applied.`
      : loadingFacts
        ? 'Loading the share counts from the SEC filings…'
        : `An estimate: each day's close times today's share count, as ${secAvailable() ? 'the SEC has no recent share counts for this company' : 'share counts from SEC filings need the desktop app'}, so changes in the number of shares are not reflected.`;
  return (
    <div>
      <FnHeader
        code="MARKETCAP"
        title="Market Cap History"
        sec={s}
        tabs={RANGES.map((r) => ({ n: r.n, label: r.label }))}
        tab={range}
        onTab={setRange}
        actions={[
          ...(canUsd ? [{ n: 11, label: usd ? `In ${ccy}` : 'In USD', title: usd ? `Show the value in ${ccy}` : "Show the value in US dollars at each day's rate", onClick: () => setInUsd((v) => !v) }] : []),
          ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_market_cap.csv`, csv),
        ]}
      />
      <div className="mcap-head">
        <div>
          <div className="muted">Market cap now</div>
          <div className="mcap-now">{Number.isFinite(nowCap) ? `${fmtBig(nowCap, 2)} ${unit}` : ''}</div>
          {series.basis === 'filings' && latestCount ? (
            <div className="muted" title={`The live price times the shares on the latest filing's ${where}${latestCount.filed ? `, filed ${fmtDay(Date.parse(`${latestCount.filed}T00:00:00Z`))}` : ''}; the quote's market value takes the price source's own share count`}>
              {fmtBig(latestCount.val, 3)} shares ({where} of {fmtDay(Date.parse(`${latestCount.end}T00:00:00Z`))})
              {Number.isFinite(quoteCap) && Math.abs(quoteCap / nowCap - 1) > 0.005 ? ` · quote: ${fmtBig(quoteCap, 2)}` : ''}
            </div>
          ) : null}
        </div>
        {last && first && last !== first ? (
          <div>
            <div className="muted">
              Over {span.years === Infinity ? 'all the history' : `${span.label}`} (since {fmtDay(first.t)})
            </div>
            <div className="mcap-chg">
              <Chg v={change} pct dec={1} /> <span className="muted">from {fmtBig(first.cap, 2)}</span>
            </div>
          </div>
        ) : null}
        {years[0] && years.length > 1 ? (
          <div>
            <div className="muted">Highest year-end</div>
            <div className="mcap-chg">
              {fmtBig(Math.max(...years.map((y) => y.cap)), 2)} <span className="muted">({years.reduce((a, b) => (b.cap > a.cap ? b : a)).year})</span>
            </div>
          </div>
        ) : null}
      </div>
      <Section title={`Market cap (${unit})${series.basis === 'filings' || loadingFacts ? '' : ' · estimated share count'}`}>
        {shown.length > 1 ? (
          <XYChart
            height={300}
            legend={false}
            series={[{ label: 'Market cap', color: '#ffb547', points: shown.map((p) => ({ x: p.t, y: p.cap })), width: 1.5 }]}
            xFormat={(v) => fmtDay(v)}
            yFormat={(v) => fmtBig(v, 1)}
            xTicks={yearTicks}
          />
        ) : (
          <div className="empty">{loadingFacts || !engine.daily(s.id).length ? 'Loading the price history…' : 'No price history for this security.'}</div>
        )}
      </Section>
      <div className="cols">
        <Section title="Market cap at year end">
          {years.length > 1 ? (
            <XYChart
              height={220}
              legend={false}
              yZero
              series={[{ label: 'Year end', color: '#45d3e6', kind: 'bar', points: [...years].reverse().map((y) => ({ x: y.year, y: y.cap, label: String(y.year) })) }]}
              xFormat={(v) => String(Math.round(v))}
              yFormat={(v) => fmtBig(v, 1)}
            />
          ) : null}
        </Section>
        <Section title="By year">
          <table className="tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">Market cap</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => (
                <tr key={y.year}>
                  <td className="amber" title={`Close of ${fmtDay(y.t)}`}>
                    {y.year}
                    {i === 0 && new Date(y.t).getUTCFullYear() === new Date(engine.now()).getUTCFullYear() ? <span className="muted"> (to {fmtDay(y.t)})</span> : null}
                  </td>
                  <td className="num white">{fmtBig(y.cap, 2)}</td>
                  <td className="num">{Number.isFinite(y.change) ? <Chg v={y.change} pct dec={2} /> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <div className="note">
        {sourceNote} Prices: daily closes as the price source gives them (split adjusted, not for dividends).{' '}
        {usd ? `US dollars at each day's ${ccy} rate.` : ''} Today&apos;s value: the live price times today&apos;s share count.
      </div>
    </div>
  );
}
