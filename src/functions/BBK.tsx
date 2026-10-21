import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { buybackSummary, type BuybackRow } from '../data/buybacks';
import { engine, useTick } from '../data/market';
import { loadCompanyFacts, reportingCurrency, resolveFiler, secAvailable, secTicker, SEC_DESKTOP_ONLY, useSecLoad, type CompanyFacts, type PeriodKind } from '../data/live/sec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** "Q3 FY2026" for a quarter, "FY2025" for a year, else the period end. */
function periodName(r: BuybackRow): string {
  return r.label ?? fmtDay(day(r.end));
}

/**
 * BBK, buyback summary: how much the company spent buying back its stock, how many shares and at what average
 * price, beside the dividends it paid, the share count on each report's cover and the repurchase program's
 * authorization, from its SEC filings (XBRL), with the yields on today's market value.
 */
export function BBK({ sec }: FnProps) {
  const s = sec!;
  useTick(10);
  const panel = usePanelId();
  const [kind, setKind] = useState<PeriodKind>('quarter');
  const [periods, setPeriods] = useState(12);
  const ticker = secTicker(s);
  const facts = useSecLoad<CompanyFacts>(secAvailable() && ticker ? `facts:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadCompanyFacts(c.data.cik, force);
  });
  const cf = facts.result?.ok ? facts.result.data : null;
  const ccy = cf ? reportingCurrency(cf.facts) : s.ccy;
  const sum = cf ? buybackSummary(cf, ccy, kind, periods) : null;
  const q = engine.quote(s.id);
  const price = q?.last ?? NaN;
  const sharesNow = sum?.sharesNow?.val ?? NaN;
  // Market value from the latest cover count; only meaningful when the stock trades in the reporting currency.
  const sameCcy = s.ccy === ccy;
  const cap = sameCcy && Number.isFinite(price) && sharesNow > 0 ? price * sharesNow : NaN;
  const ltm = sum?.ltm;
  const avgPaid = ltm && ltm.shares > 0 ? ltm.buyback / ltm.shares : NaN;
  const bbYield = ltm && cap > 0 ? (ltm.buyback / cap) * 100 : NaN;
  const divYield = ltm && cap > 0 && Number.isFinite(ltm.dividends) ? (ltm.dividends / cap) * 100 : NaN;
  const shareChg = sum?.sharesYearAgo && sharesNow > 0 ? (sharesNow / sum.sharesYearAgo.val - 1) * 100 : NaN;
  const rows = sum?.rows ?? [];
  const desc = [...rows].reverse();
  const asOf = (x?: { end: string }) => (x ? ` (${fmtDay(day(x.end))})` : '');
  const csv = () => [
    ['Period', 'Period End', `Buybacks (${ccy})`, 'Shares Repurchased', 'Average Price', `Dividends (${ccy})`, 'Total Returned', 'Shares Outstanding', 'Calculated'],
    ...desc.map((r) => [periodName(r), r.end, r.buyback ?? '', r.shares ?? '', r.buyback != null && r.shares ? r.buyback / r.shares : '', r.dividends ?? '', (r.buyback ?? 0) + (r.dividends ?? 0), r.sharesOut ?? '', r.derived ? 'yes' : '']),
  ];
  const status = !ticker
    ? 'Buybacks come from SEC filings, which cover US-listed companies.'
    : !secAvailable()
      ? SEC_DESKTOP_ONLY
      : facts.result && !facts.result.ok
        ? facts.result.message
        : !cf
          ? 'Reading the company’s XBRL facts from the SEC…'
          : !rows.some((r) => r.buyback != null)
            ? `${cf.name} reports no repurchases of its stock in its XBRL cash-flow statements.`
            : null;
  return (
    <div>
      <FnHeader
        code="BUYBACKS"
        title="Buyback Summary"
        sec={s}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_BBK.csv`, csv)}
        controls={
          <div className="chart-tools">
            <span className="cyan">{s.name}</span>
            <label className="fld">
              Periodicity
              <select className="sel-inp" aria-label="Periodicity" value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>
                <option value="quarter">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
            <label className="fld">
              Periods
              <select className="sel-inp" aria-label="Periods" value={periods} onChange={(e) => setPeriods(Number(e.target.value))}>
                {[8, 12, 20, 40].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              Currency
              <select className="sel-inp" aria-label="Currency" value={ccy} disabled>
                <option value={ccy}>{ccy}</option>
              </select>
            </label>
          </div>
        }
      />
      <QuoteStrip sec={s} />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        sum &&
        ltm && (
          <>
            <div className="bbk-top">
              <KV
                items={[
                  [`Buybacks, ${ltm.basis === 'quarters' ? 'last 4 quarters' : 'last fiscal year'}`, `${fmtBig(ltm.buyback, 2)} ${ccy}`],
                  ['Shares Repurchased', Number.isFinite(ltm.shares) ? `${fmtBig(ltm.shares, 2)}${sharesNow > 0 ? ` (${fmtNum((ltm.shares / sharesNow) * 100, 2)}% of shares)` : ''}` : '--'],
                  ['Average Price Paid', Number.isFinite(avgPaid) ? `${fmtNum(avgPaid, 2)} ${ccy}` : '--'],
                  ['Last Price vs Average Paid', Number.isFinite(avgPaid) && Number.isFinite(price) && sameCcy ? fmtPct((price / avgPaid - 1) * 100, 1) : '--'],
                  ['Through', fmtDay(day(ltm.through))],
                ]}
              />
              <KV
                items={[
                  ['Buyback Yield', Number.isFinite(bbYield) ? `${fmtNum(bbYield, 2)}%` : '--'],
                  ['Dividend Yield (cash paid)', Number.isFinite(divYield) ? `${fmtNum(divYield, 2)}%` : '--'],
                  ['Shareholder Yield', Number.isFinite(bbYield) && Number.isFinite(divYield) ? `${fmtNum(bbYield + divYield, 2)}%` : '--'],
                  ['Shares Outstanding', sharesNow > 0 ? `${fmtBig(sharesNow, 3)}${asOf(sum.sharesNow)}` : '--'],
                  ['Change over a Year', Number.isFinite(shareChg) ? fmtPct(shareChg, 2) : '--'],
                ]}
              />
              <KV
                items={[
                  ['Program Authorized', sum.authorized ? `${fmtBig(sum.authorized.val, 2)}${asOf(sum.authorized)}` : '--'],
                  ['Authorization Remaining', sum.remaining ? `${fmtBig(sum.remaining.val, 2)}${asOf(sum.remaining)}` : '--'],
                  ['Remaining / Market Value', sum.remaining && cap > 0 ? `${fmtNum((sum.remaining.val / cap) * 100, 2)}%` : '--'],
                  ['Market Value', cap > 0 ? `${fmtBig(cap, 2)} ${ccy}` : '--'],
                ]}
              />
            </div>
            <XYChart
              height={210}
              series={[
                { label: 'Buybacks', color: '#5aa7ff', kind: 'bar', points: rows.filter((r) => r.buyback != null).map((r) => ({ x: day(r.end), y: r.buyback!, label: periodName(r) })) },
                { label: 'Dividends', color: '#ff9e1b', kind: 'bar', points: rows.filter((r) => r.dividends != null).map((r) => ({ x: day(r.end), y: r.dividends!, label: periodName(r) })) },
                { label: 'Shares Outstanding', color: '#e8e8e8', points: rows.filter((r) => r.sharesOut != null).map((r) => ({ x: day(r.end), y: r.sharesOut!, label: periodName(r) })), axis: 'left', markers: true },
              ]}
              xFormat={(v) => fmtDay(v)}
              yFormat={(v) => fmtBig(v, 0)}
              y2Format={(v) => fmtBig(v, 2)}
              yZero
            />
            <table className="tbl zebra">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Period End</th>
                  <th className="num">Buybacks</th>
                  <th className="num">Shares</th>
                  <th className="num">Avg Price</th>
                  <th className="num hide-m">Dividends</th>
                  <th className="num hide-m">Total Returned</th>
                  <th className="num hide-m">Shares Out</th>
                </tr>
              </thead>
              <tbody>
                {desc.map((r) => (
                  <tr key={r.end}>
                    <td className="amber">{periodName(r)}</td>
                    <td>{fmtDay(day(r.end))}</td>
                    <td className="num white" title={r.derived ? 'Calculated: the year-to-date total less the previous one' : r.form ? `As filed (${r.form})` : undefined}>
                      {r.buyback != null ? fmtBig(r.buyback, 2) : ''}
                      {r.derived ? <span className="muted"> ·</span> : null}
                    </td>
                    <td className="num">{r.shares != null ? fmtBig(r.shares, 2) : ''}</td>
                    <td className="num">{r.buyback != null && r.shares ? fmtNum(r.buyback / r.shares, 2) : ''}</td>
                    <td className="num hide-m">{r.dividends != null ? fmtBig(r.dividends, 2) : ''}</td>
                    <td className="num hide-m">{r.buyback != null || r.dividends != null ? fmtBig((r.buyback ?? 0) + (r.dividends ?? 0), 2) : ''}</td>
                    <td className="num hide-m">{r.sharesOut != null ? fmtBig(r.sharesOut, 3) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pad-s muted">
              From {cf!.name}&apos;s SEC filings (XBRL, as filed, in {ccy}): repurchases are the cash paid in the cash-flow statement, shares bought back come from
              the equity statement, and the share count is the one on each report&apos;s cover. Quarters marked · are the year-to-date total less the previous one.
              Share counts before a stock split are as filed. Yields use today&apos;s price times the latest cover count.
            </p>
          </>
        )
      )}
    </div>
  );
}
