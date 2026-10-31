// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { closeAt } from '../data/analytics';
import { engine, useTick } from '../data/market';
import { nasdaqSymbol, parseFinraShort, type NasdaqShort } from '../data/live/nasdaq-company';
import { getRealFund, useFundamentals } from '../data/live/yfund';
import { loadCompanyFacts, resolveFiler, secAvailable, secTicker, useSecLoad, type CompanyFacts } from '../data/live/sec';
import { realSplits } from '../data/live/yahoo';
import { coverShareCounts } from '../data/marketcap';
import { pctOfSharesAt } from '../data/shortinterest';
import { asxCode, useAsicShort } from '../data/live/asic';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const RANGES = [
  { n: 1, label: '6M', days: 183 },
  { n: 2, label: '1Y', days: 365 },
  { n: 3, label: '2Y', days: 730 },
];

/**
 * SI, short interest: the shares sold short at each settlement (twice a month) from FINRA's consolidated record for
 * every US listing, with the short interest ratio (days to cover) and the average daily volume, and their changes,
 * beside the price. Each settlement's share of the shares outstanding takes the SEC cover count dated on or before
 * it; the share of the float is given for the latest settlement only, against today's float (no dated float exists).
 */
export function SI(props: FnProps) {
  // ASX stocks have ASIC's daily aggregated short positions; every other stock FINRA's record (US listings).
  return asxCode(props.sec) ? <AsxShortInterest {...props} /> : <UsShortInterest {...props} />;
}

function UsShortInterest({ sec }: FnProps) {
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
  // Today's float, for the latest settlement only: the sources give no float for earlier dates.
  const pctFloat = latest && float && float > 0 ? (latest.shares / float) * 100 : NaN;
  // The shares outstanding at each settlement, from the SEC filings' cover pages.
  const ticker = secTicker(s);
  const facts = useSecLoad<CompanyFacts>(symbol && secAvailable() && ticker ? `facts:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadCompanyFacts(c.data.cik, force);
  });
  const cf = facts.result?.ok ? facts.result.data : null;
  const counts = useMemo(() => coverShareCounts(cf), [cf]);
  const splits = realSplits.get(s.id) ?? [];
  const outAt = (r: NasdaqShort | undefined) => (r ? pctOfSharesAt(r.shares, r.date, counts, splits) : { pct: NaN, basis: null });
  const pctOut = (r: NasdaqShort | undefined) => outAt(r).pct;
  const basisText = (r: NasdaqShort) => {
    const b = outAt(r).basis;
    return b ? `${fmtBig(b.val, 3)} shares outstanding as of ${fmtDay(Date.parse(`${b.end}T00:00:00Z`))} (SEC filing cover)` : 'No SEC share count dated within 200 days before this settlement';
  };
  const chg = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b - 1) * 100 : NaN);
  const daily = engine.daily(s.id);
  const asc = [...rows].reverse();
  const price = daily.length ? asc.map((r) => ({ x: r.date, y: closeAt(daily, r.date), label: fmtDay(r.date) })) : [];
  const csv = () => [
    ['Settlement Date', 'Short Interest', 'Change', 'Avg Daily Volume', 'Days to Cover', '% Shrs Out (at settlement)', 'Shares Out Used', 'Shares Out As Of', '% of Current Float (latest only)'],
    ...rows.map((r, i) => {
      const o = outAt(r);
      return [fmtDay(r.date, true), r.shares, rows[i + 1] ? r.shares - rows[i + 1].shares : '', r.avgVolume, r.daysToCover, Number.isFinite(o.pct) ? o.pct : '', o.basis?.val ?? '', o.basis?.end ?? '', r === latest && Number.isFinite(pctFloat) ? pctFloat : ''];
    }),
  ];
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
                [
                  'Short Interest % Current Float',
                  Number.isFinite(pctFloat) ? (
                    <span key="f" title={`The latest settlement's short interest over today's float (${fmtBig(float!, 3)} shares, as the source gives it now); no float is published for earlier dates`}>
                      {fmtNum(pctFloat, 2)}%
                    </span>
                  ) : (
                    <span key="f" className="muted" title="The price source gives no float for this company">no float from the source</span>
                  ),
                ],
                [
                  'Short Interest % Shrs Out',
                  Number.isFinite(pctOut(latest)) ? (
                    <span key="o" title={basisText(latest)}>{`${fmtNum(pctOut(latest), 2)}%${prior && Number.isFinite(pctOut(prior)) ? `  (${fmtNum(pctOut(latest) - pctOut(prior), 2)} pts)` : ''}`}</span>
                  ) : (
                    <span key="o" className="muted" title={basisText(latest)}>{facts.loading ? 'reading SEC share counts…' : 'no dated share count'}</span>
                  ),
                ],
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
                <th className="num" title="Short interest over the shares outstanding at the settlement date (the SEC cover count dated on or before it)">% Shrs Out</th>
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
                    <td className="num" title={basisText(r)}>{Number.isFinite(pctOut(r)) ? fmtNum(pctOut(r), 2) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="pad-s muted">
            FINRA&apos;s consolidated short interest, reported by brokers for the settlement dates twice a month and published about a week later. Short interest ratio: the short interest over the
            average daily volume (days to cover). % Shrs Out: each settlement&apos;s short interest over the shares outstanding then, the count on the cover of the SEC filing
            dated on or before it (a split between the two dates applied; hover for the count and its date), blank without one. % Current Float: the latest settlement only, over today&apos;s
            float{float ? '' : ', which the source did not give this time'}, as no float is published for earlier dates.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * SI for an ASX stock: ASIC's daily aggregated short positions, the shares reported short over the product in issue,
 * on the latest published day and on two days a month (mid-month and month end) over two years. Positions are those of
 * four trading days before ASIC publishes them.
 */
function AsxShortInterest({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const [range, setRange] = useState(2);
  const { available, code, rows: all, loading, problem } = useAsicShort(s);
  const days = RANGES.find((r) => r.n === range)!.days;
  const from = engine.today * DAY_MS - days * DAY_MS;
  const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const rows = all.filter((r) => at(r.date) >= from);
  const latest = all[0];
  const prior = all[1];
  const asc = [...rows].reverse();
  const daily = engine.daily(s.id);
  const price = daily.length ? asc.map((r) => ({ x: at(r.date), y: closeAt(daily, at(r.date)), label: fmtDay(at(r.date)) })) : [];
  const csv = () => [['Position Date', 'Reported Short Positions', 'Total Product in Issue', '% Short', 'Source'], ...rows.map((r) => [r.date, r.short, r.issued, r.pct, 'ASIC daily aggregated short positions (CC BY 4.0)'])];
  return (
    <div>
      <FnHeader code="SHORTINTEREST" title="Short Interest" sec={s} tabs={RANGES.map((r) => ({ n: r.n, label: r.label }))} tab={range} onTab={setRange}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_SI.csv`, csv)} />
      {!available ? (
        <div className="empty">ASX short positions come from ASIC&apos;s daily files, read by the desktop app.</div>
      ) : !latest ? (
        <div className="empty">{loading ? 'Reading ASIC\u2019s short position files…' : problem ?? `ASIC reports no short position in ${code}.`}</div>
      ) : (
        <>
          <div className="si-top">
            <KV
              items={[
                ['Position Date', fmtDay(at(latest.date))],
                ['Reported Short Positions', `${fmtBig(latest.short, 2)}${prior ? `  (${fmtPct(prior.short ? (latest.short / prior.short - 1) * 100 : NaN, 1)} since ${fmtDay(at(prior.date))})` : ''}`],
                ['Short % of Product in Issue', `${fmtNum(latest.pct, 2)}%${prior ? `  (${fmtNum(latest.pct - prior.pct, 2)} pts)` : ''}`],
                ['Product in Issue', fmtBig(latest.issued, 3)],
              ]}
            />
            <XYChart
              height={170}
              series={[
                { label: 'Price', color: '#e8e8e8', points: price },
                { label: 'Short %', color: '#ff9e1b', points: asc.map((r) => ({ x: at(r.date), y: r.pct, label: fmtDay(at(r.date)) })), axis: 'left', markers: true },
              ]}
              xFormat={(v) => fmtDay(v)}
              yFormat={(v) => fmtNum(v, 2)}
              y2Format={(v) => fmtNum(v, 2)}
            />
          </div>
          <table className="tbl zebra" data-testid="asic-short">
            <thead>
              <tr>
                <th>Position Date</th>
                <th className="num">Reported Short</th>
                <th className="num">Change</th>
                <th className="num hide-m">Product in Issue</th>
                <th className="num">% Short</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const before = rows[i + 1];
                const d = before ? r.short - before.short : NaN;
                return (
                  <tr key={r.date}>
                    <td className="amber">{fmtDay(at(r.date))}</td>
                    <td className="num white">{fmtNum(r.short, 0)}</td>
                    <td className={`num ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}`}>{Number.isFinite(d) ? `${d > 0 ? '+' : ''}${fmtNum(d, 0)}` : ''}</td>
                    <td className="num hide-m">{fmtNum(r.issued, 0)}</td>
                    <td className="num">{fmtNum(r.pct, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="pad-s muted">
            ASIC&apos;s daily aggregated short positions: the short positions reported to ASIC in each product, over the product in issue, as of four trading days before ASIC
            publishes them. Shown: the latest published day, and the last day published on or before each 15th and each month end. ASX has no days-to-cover or settlement
            record like FINRA&apos;s. Source: © Australian Securities &amp; Investments Commission, licensed under CC BY 4.0.
            {loading ? ' Reading more days…' : ''}
          </p>
        </>
      )}
    </div>
  );
}
