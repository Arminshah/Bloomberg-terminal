// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { KV } from '../components/cells';
import { DataTable, type Column } from '../components/DataTable';
import { HeatTreemap, type HeatLeaf } from '../components/HeatTreemap';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtIso, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { secAvailable, secTicker, SEC_DESKTOP_ONLY, useSecLoad } from '../data/live/sec';
import { quotesTiming, useYahooQuotes } from '../data/live/yquotes';
import { lookupSecurity } from '../data/live/lookup';
import { cikArg, compareQuarters, impliedPrice, loadHoldings, loadHoldingsOf, previousQuarterEnd, useFigi, type Compared, type FigiHit, type HoldingsReport } from '../data/live/thirteenf';
import { openSecurity } from '../components/cells';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { appId, Ticker } from './EVTSMarket';

/** Tickers and today's prices are looked up for this many of the largest holdings (a bank files thousands). */
const PRICED = 300;

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const quarterName = (iso: string) => `Q${Math.ceil(Number(iso.slice(5, 7)) / 3)} ${iso.slice(0, 4)}`;

/** Opens a holding's stock, looking it up first when the app does not carry it. */
function openTicker(panel: number, symbol: string) {
  const id = appId(symbol);
  if (engine.get(id)) return openSecurity(panel, id);
  void lookupSecurity(symbol, false).then((r) => {
    if (r.ok) openSecurity(panel, r.def.id);
  });
}

/** A holding with its ticker and today's price, where they are known. */
interface Row extends Compared {
  hit?: FigiHit;
  /** Today's price in US dollars and where it comes from. */
  last: number;
  lastSource: string;
  /** Value ÷ shares at the quarter's end. */
  then: number;
}

const CHANGE_TEXT: Record<string, string> = { new: 'NEW', added: 'ADDED', reduced: 'REDUCED', same: 'UNCHANGED', sold: 'SOLD OUT' };
const CHANGE_CLASS: Record<string, string> = { new: 'up', added: 'up', reduced: 'dn', same: 'muted', sold: 'dn' };

function kindText(r: { type: string; putCall: string }): string {
  return r.putCall ? `${r.putCall} options` : r.type === 'PRN' ? 'Principal' : 'Shares';
}

/** Today's value: shares held outright times today's price. Options and bonds have none from a stock's price. */
const valueNow = (r: Row) => (r.type === 'SH' && !r.putCall && Number.isFinite(r.last) ? r.amount * r.last : NaN);
const sinceEnd = (r: Row) => (Number.isFinite(r.last) && r.then > 0 ? (r.last / r.then - 1) * 100 : NaN);

/**
 * The stock's US ticker, for shares and options on them: a bond's identifier names the bond ("MSTR 0 12/01/29"), not
 * a stock to open or price.
 */
function stockTicker(r: { type: string; hit?: FigiHit }): string | undefined {
  const t = r.hit?.ticker;
  return r.type === 'SH' && t && /^[A-Z][A-Z0-9]{0,6}([./][A-Z]{1,2})?$/.test(t) ? t : undefined;
}

function TickerCell({ r }: { r: Row }) {
  const t = stockTicker(r);
  if (t) return <Ticker symbol={t} />;
  if (r.hit?.ticker) return <span className="muted" title={`OpenFIGI: ${r.hit.name ?? ''} (${r.hit.securityType ?? ''})`}>{r.hit.ticker}</span>;
  if (r.hit?.none) return <span className="muted" title={`OpenFIGI has no US listing for CUSIP ${r.cusip}: not listed in the US, or no longer listed`}>none</span>;
  return <span className="muted" title={`CUSIP ${r.cusip}`}>{r.cusip}</span>;
}

/**
 * HOLDINGS, a company's 13F portfolio: the US-listed stocks, options and convertible bonds it reported holding at a
 * quarter's end on Form 13F, each with its value as filed, its share of the portfolio and the change in shares since
 * the quarter before, beside today's price and value. A map sizes each holding by its filed value and colours it by
 * the price change since the quarter's end.
 */
export function HOLDINGS13F({ sec, route }: FnProps) {
  const s = sec;
  useTick(10);
  const panel = usePanelId();
  const [period, setPeriod] = useState('');
  const [tab, setTab] = useState(1);
  const [all, setAll] = useState(false);
  const ticker = s ? secTicker(s) : null;
  // An investment manager with no listed shares is opened by its CIK (from FLNG).
  const filerCik = s ? null : cikArg(route.args);
  const key = ticker ? `13f:${ticker}:${period}` : filerCik ? `13f:cik${filerCik}:${period}` : null;
  const load = useSecLoad<HoldingsReport>(secAvailable() && key ? key : null, (force) => (s ? loadHoldings(s, period || undefined, force) : loadHoldingsOf(filerCik!, period || undefined, force)));
  const rep = load.result?.ok ? load.result.data : null;
  const cur = rep?.current;
  const cmp = cur ? compareQuarters(cur.positions, rep!.previous?.positions ?? null) : { rows: [], sold: [] };
  // Tickers by CUSIP for the largest holdings and the ones sold.
  const codes = [...new Set([...cmp.rows.slice(0, PRICED), ...cmp.sold.slice(0, PRICED)].map((r) => r.cusip))];
  const figi = useFigi(codes);
  // Today's price: the app's own quote for a stock it carries, Yahoo's for the others (US dollars).
  const tickerOf = (c: Compared) => stockTicker({ type: c.type, hit: figi.hits.get(c.cusip) });
  const carried = (t: string) => {
    const id = appId(t);
    return engine.get(id) && engine.hasSource(id) ? id : undefined;
  };
  const yahooSymbols = [...new Set(cmp.rows.slice(0, PRICED).map(tickerOf).filter((t): t is string => !!t && !carried(t)).map((t) => t.replace('/', '-')))];
  const quotes = useYahooQuotes(yahooSymbols);
  const rows: Row[] = cmp.rows.map((c, i) => {
    const hit = figi.hits.get(c.cusip);
    const t = i < PRICED ? stockTicker({ type: c.type, hit }) : undefined;
    let last = NaN;
    let lastSource = '';
    if (t) {
      const id = carried(t);
      if (id) {
        const q = engine.quote(id);
        if (q && engine.get(id)?.ccy === 'USD') {
          last = q.last;
          lastSource = 'the app’s quote';
        }
      } else {
        const q = quotes.get(t.replace('/', '-'));
        if (q && q.currency === 'USD' && Number.isFinite(q.regularMarketPrice)) {
          last = q.regularMarketPrice;
          lastSource = 'Yahoo Finance';
        }
      }
    }
    return { ...c, hit, last, lastSource, then: impliedPrice(c) };
  });
  const sold: Row[] = cmp.sold.map((c) => ({ ...c, hit: figi.hits.get(c.cusip), last: NaN, lastSource: '', then: NaN }));
  const total = cur?.total ?? 0;
  const weight = (r: Compared) => (total > 0 ? (r.value / total) * 100 : NaN);
  const priced = rows.filter((r) => Number.isFinite(valueNow(r)));
  const pricedThen = priced.reduce((a, r) => a + r.value, 0);
  const pricedNow = priced.reduce((a, r) => a + valueNow(r), 0);
  const counts = { new: 0, added: 0, reduced: 0, same: 0 } as Record<string, number>;
  for (const r of rows) if (r.change) counts[r.change]++;
  const prev = rep?.previous;
  const amended = cur?.filings.filter((f) => f.use !== 'report') ?? [];
  const report = cur?.filings.find((f) => f.use === 'report') ?? cur?.filings[0];
  const lines = cur?.filings.reduce((a, f) => a + (f.use === 'restatement' ? 0 : f.lines), 0) ?? 0;
  const top10 = rows.slice(0, 10).reduce((a, r) => a + r.value, 0);
  const mismatch = cur && cur.filedTotal != null && total > 0 && Math.abs(cur.filedTotal - total) > Math.max(1, total * 0.001);
  const history = (rep?.history ?? []).filter((h) => h.total != null);
  const yahooQuotes = rows.filter((r) => r.lastSource === 'Yahoo Finance').map((r) => quotes.get(stockTicker(r)!.replace('/', '-')));

  const status = !ticker && !filerCik
    ? '13F filings are made with the SEC, for US-listed companies.'
    : !secAvailable()
      ? SEC_DESKTOP_ONLY
      : load.result && !load.result.ok
        ? load.result.message
        : !rep
          ? 'Reading the company’s 13F filings from the SEC…'
          : cur!.notice
            ? `${rep.company} files 13F notices for ${fmtIso(cur!.period)}: its holdings are reported in another manager's 13F${cur!.reportedBy.length ? ` (${cur!.reportedBy.join(', ')})` : ''}.`
            : null;

  const csv = () => [
    ['Ticker', 'Issuer (as filed)', 'Class', 'CUSIP', 'Kind', 'Amount', `Value ${cur?.period ?? ''} (USD, as filed)`, '% of Portfolio', 'Change', 'Change in Amount', 'Previous Amount', 'Quarter-End Price (value / shares)', 'Last Price (USD)', 'Price Source', 'Value at Last Price (USD)'],
    ...[...rows, ...sold].map((r) => [r.hit?.ticker ?? '', r.issuer, r.cls, r.cusip, kindText(r), r.amount, r.value, Number.isFinite(weight(r)) ? weight(r) : '', r.change ? CHANGE_TEXT[r.change] : '', Number.isFinite(r.diff) ? r.diff : '', Number.isFinite(r.prevAmount) ? r.prevAmount : '', Number.isFinite(r.then) ? r.then : '', Number.isFinite(r.last) ? r.last : '', r.lastSource, Number.isFinite(valueNow(r)) ? valueNow(r) : '']),
  ];

  const changeCell = (r: Row): ReactNode => {
    if (!r.change) return '';
    const pct = r.change === 'added' || r.change === 'reduced' ? ` ${fmtPct(r.diffPct, 1)}` : '';
    return <span className={CHANGE_CLASS[r.change]}>{CHANGE_TEXT[r.change]}{pct}</span>;
  };
  const columns: Column<Row>[] = [
    { key: 't', label: 'Ticker', render: (r) => <TickerCell r={r} />, sort: (r) => r.hit?.ticker ?? '' },
    { key: 'n', label: 'Issuer (as filed)', render: (r) => <span title={`CUSIP ${r.cusip}${r.cls ? ` · ${r.cls}` : ''}`}>{r.issuer}{r.putCall ? <span className="amber"> {r.putCall.toUpperCase()}</span> : r.type === 'PRN' ? <span className="amber"> PRN</span> : null}</span>, sort: (r) => r.issuer },
    { key: 'c', label: 'Class', hideN: true, render: (r) => <span className="muted">{r.cls}</span>, sort: (r) => r.cls },
    { key: 'a', label: 'Shares', num: true, title: 'Shares held at the quarter’s end, as filed (principal amount for a bond; the underlying shares for an option)', render: (r) => fmtNum(r.amount, 0), sort: (r) => r.amount },
    { key: 'v', label: 'Value (filed)', num: true, title: 'Value at the quarter’s end, as filed, in US dollars', render: (r) => <span className="white">{fmtBig(r.value, 2)}</span>, sort: (r) => r.value },
    { key: 'w', label: '% Port', num: true, title: 'Share of the 13F portfolio’s value at the quarter’s end', render: (r) => fmtNum(weight(r), 2), sort: (r) => r.value },
    { key: 'ch', label: 'Change', title: 'Shares against the quarter before', render: changeCell, sort: (r) => (Number.isFinite(r.diffPct) ? r.diffPct : r.change === 'new' ? Infinity : -Infinity) },
    { key: 'd', label: 'Chg Shares', num: true, hideM: true, render: (r) => (Number.isFinite(r.diff) && r.diff !== 0 ? <span className={r.diff > 0 ? 'up' : 'dn'}>{r.diff > 0 ? '+' : ''}{fmtNum(r.diff, 0)}</span> : ''), sort: (r) => r.diff },
    { key: 'p0', label: 'Qtr-End Px', num: true, hideW: true, title: 'The filed value divided by the shares', render: (r) => fmtNum(r.then, 2), sort: (r) => r.then },
    { key: 'p1', label: 'Last', num: true, title: 'Today’s price in US dollars', render: (r) => <span title={r.lastSource ? `From ${r.lastSource}` : undefined}>{fmtNum(r.last, 2)}</span>, sort: (r) => r.last },
    { key: 's', label: 'Since Qtr End', num: true, hideM: true, render: (r) => { const v = sinceEnd(r); return Number.isFinite(v) ? <span className={v >= 0 ? 'up' : 'dn'}>{fmtPct(v, 1)}</span> : ''; }, sort: sinceEnd },
    { key: 'vn', label: 'Value Today', num: true, hideN: true, title: 'Shares times today’s price; none for options and bonds', render: (r) => fmtBig(valueNow(r), 2), sort: valueNow },
  ];
  const soldColumns: Column<Row>[] = [
    { key: 't', label: 'Ticker', render: (r) => <TickerCell r={r} />, sort: (r) => r.hit?.ticker ?? '' },
    { key: 'n', label: 'Issuer (as filed)', render: (r) => <span title={`CUSIP ${r.cusip}`}>{r.issuer}{r.putCall ? <span className="amber"> {r.putCall.toUpperCase()}</span> : null}</span>, sort: (r) => r.issuer },
    { key: 'k', label: 'Kind', render: (r) => kindText(r) },
    { key: 'a', label: `Held ${prev ? fmtIso(prev.period) : ''}`, num: true, render: (r) => fmtNum(r.prevAmount, 0), sort: (r) => r.prevAmount },
    { key: 'v', label: 'Value Then (filed)', num: true, render: (r) => fmtBig(r.prevValue, 2), sort: (r) => r.prevValue },
  ];
  const leaves: HeatLeaf[] = rows.filter((r) => r.value > 0).map((r) => ({
    key: r.key,
    label: stockTicker(r) ?? r.issuer.split(' ')[0],
    pct: sinceEnd(r),
    weight: r.value,
    info: [
      `${r.issuer}${r.putCall ? ` (${r.putCall} options)` : ''}`,
      `${fmtBig(r.value, 2)} at ${fmtIso(cur!.period)} · ${fmtNum(weight(r), 2)}% of the portfolio`,
      ...(r.change ? [`${CHANGE_TEXT[r.change]}${Number.isFinite(r.diffPct) ? ` ${fmtPct(r.diffPct, 1)} in shares` : ''} since the quarter before`] : []),
      Number.isFinite(sinceEnd(r)) ? `Price ${fmtPct(sinceEnd(r), 1)} since the quarter’s end (${r.lastSource})` : 'No price change: no US price for it',
    ],
    onClick: stockTicker(r) ? () => openTicker(panel, stockTicker(r)!) : undefined,
  }));

  return (
    <div>
      <FnHeader
        code="HOLDINGS"
        title="13F Holdings"
        sec={s}
        tabs={[
          { n: 1, label: 'Holdings' },
          { n: 2, label: 'Map' },
          { n: 3, label: 'Sold Out' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `${(s?.ticker ?? `CIK${filerCik ?? ''}`).replace(/\W+/g, '_')}_13F_${cur?.period ?? ''}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <span className="cyan">{rep?.company ?? s?.name ?? (filerCik ? `CIK ${filerCik}` : '')}</span>
            {rep && (
              <label className="fld" title={`Quarters with a 13F among the filings the SEC lists first for the company (filed since ${fmtIso(rep.listedSince)})`}>
                Quarter
                <select className="sel-inp" aria-label="Quarter" value={period || cur?.period || ''} onChange={(e) => setPeriod(e.target.value)}>
                  {rep.quarters.map((q) => (
                    <option key={q.period} value={q.period}>
                      {quarterName(q.period)} ({fmtIso(q.period)})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        rep &&
        cur && (
          <>
            <div className="bbk-top">
              <KV
                items={[
                  ['Manager (as filed)', cur.manager],
                  ['Quarter Ended', fmtIso(cur.period)],
                  ['Filed', <a key="f" href={rep.links.index} target="_blank" rel="noreferrer">{report ? fmtIso(report.filing.filed) : ''}{amended.length ? `, amended ${amended.map((f) => fmtIso(f.filing.filed)).join(', ')}` : ''}</a>],
                  ['Holdings', `${fmtNum(rows.length, 0)}${lines !== rows.length ? ` (${fmtNum(lines, 0)} lines filed)` : ''}`],
                  ['Value (as filed)', `${fmtBig(total, 2)} USD`],
                ]}
              />
              <KV
                items={
                  prev
                    ? [
                        [`Previous Quarter (${quarterName(prev.period)})`, `${fmtBig(prev.total, 2)} USD`],
                        ['Change in Value', fmtPct(prev.total > 0 ? (total / prev.total - 1) * 100 : NaN, 1)],
                        ['New · Added · Reduced', `${counts.new} · ${counts.added} · ${counts.reduced}`],
                        ['Unchanged · Sold Out', `${counts.same} · ${sold.length}`],
                        ['Top 10 Holdings', `${fmtNum(total > 0 ? (top10 / total) * 100 : NaN, 1)}% of value`],
                      ]
                    : [
                        ['Previous Quarter', <span key="p" className="muted">no 13F for {quarterName(previousQuarterEnd(cur.period))}</span>],
                        ['Top 10 Holdings', `${fmtNum(total > 0 ? (top10 / total) * 100 : NaN, 1)}% of value`],
                      ]
                }
              />
              <KV
                items={[
                  ['Value at Today’s Prices', priced.length ? `${fmtBig(pricedNow, 2)} USD` : '--'],
                  ['Change since Quarter End', priced.length && pricedThen > 0 ? fmtPct((pricedNow / pricedThen - 1) * 100, 1) : '--'],
                  ['Holdings Priced', `${priced.length} of ${rows.length}${priced.length ? ` (${fmtNum(total > 0 ? (pricedThen / total) * 100 : NaN, 1)}% of value)` : ''}`],
                  ['Prices', yahooQuotes.length ? quotesTiming(yahooQuotes) : priced.length ? 'the app’s quotes' : figi.problem ? 'tickers not found' : 'loading…'],
                ]}
              />
            </div>
            {figi.problem && <div className="note amber" role="status">{figi.problem}</div>}
            {mismatch && (
              <div className="note amber" role="status">
                The filing states a total of {fmtBig(cur.filedTotal!, 2)} USD; its lines add up to {fmtBig(total, 2)} USD.{cur.unread ? ` ${cur.unread} lines could not be read.` : ''}
              </div>
            )}
            {cur.filings
              .filter((f) => f.repeated)
              .map((f) => (
                <div key={f.filing.accession} className="note amber" role="status">
                  The amendment filed {fmtIso(f.filing.filed)} is marked as adding holdings, but it repeats the whole report ({fmtNum(f.cover.entries, 0)} lines, {fmtBig(f.cover.total, 2)}): it is read as a restatement, so no holding is counted twice.
                </div>
              ))}
            {cur.confidentialOmitted && <div className="note amber" role="status">The manager left some holdings out of this filing under a request for confidential treatment; they appear in an amendment if the SEC denies it or it expires.</div>}
            {tab === 1 && (
              <>
                {history.length > 1 && (
                  <XYChart
                    height={130}
                    series={[{ label: 'Value as filed', color: '#5aa7ff', kind: 'bar', points: history.map((h) => ({ x: day(h.period), y: h.total!, label: quarterName(h.period) })) }]}
                    xTicks={history.map((h) => ({ v: day(h.period), label: quarterName(h.period) }))}
                    xFormat={(v) => quarterName(new Date(v).toISOString().slice(0, 10))}
                    yFormat={(v) => fmtBig(v, 0)}
                    yZero
                  />
                )}
                <DataTable rows={rows} columns={columns} rowKey={(r) => r.key} defaultSort={{ key: 'v', dir: -1 }} numbered className="zebra" empty="The filing lists no holdings." page={all ? undefined : { index: 0, size: PRICED }} />
                {rows.length > PRICED && (
                  <p className="pad-s muted">
                    {all ? `All ${fmtNum(rows.length, 0)} holdings` : `${PRICED} of ${fmtNum(rows.length, 0)} holdings, in the order chosen`}. Tickers and today’s prices are looked up for the {PRICED} largest.{' '}
                    <button type="button" className="btn" onClick={() => setAll((x) => !x)}>
                      {all ? `Show ${PRICED}` : `Show all ${fmtNum(rows.length, 0)}`}
                    </button>
                  </p>
                )}
              </>
            )}
            {tab === 2 && <HeatTreemap groups={[{ name: cur.manager || rep.company, subs: [{ name: '', leaves }] }]} scale={20} height={420} period={`since ${fmtIso(cur.period)}`} />}
            {tab === 3 &&
              (prev ? (
                <DataTable rows={sold} columns={soldColumns} rowKey={(r) => r.key} defaultSort={{ key: 'v', dir: -1 }} numbered className="zebra" empty={`Nothing held on ${fmtIso(prev.period)} was sold out by ${fmtIso(cur.period)}.`} />
              ) : (
                <div className="empty">There is no 13F for the quarter before {fmtIso(cur.period)} to compare with.</div>
              ))}
            <p className="pad-s muted">
              From {rep.company}&apos;s Form 13F filings on SEC EDGAR, as filed: the US-listed stocks, options and convertible bonds (Section 13(f) securities) over
              which it had investment discretion at the quarter&apos;s end, filed within 45 days. For a company that manages its own investments that is what it
              owns; a bank, broker or asset manager also reports the accounts of others it manages, so its list is not its own holdings. A 13F leaves out cash,
              short positions, options written, shares listed only outside the US and private holdings, and may leave out a position of fewer than 10,000 shares
              worth less than $200,000. Amendments are applied in the order filed: a restatement replaces the report, new holdings are added to it. Changes compare shares
              with the quarter before; a stock split between the two shows as a change. Tickers are OpenFIGI&apos;s for each CUSIP; today&apos;s prices are the
              app&apos;s quotes, or Yahoo Finance&apos;s, in US dollars. The quarter-end price is the filed value divided by the shares. The quarters offered are
              those among the filings the SEC lists first for the company, filed since {fmtIso(rep.listedSince)}.
            </p>
          </>
        )
      )}
    </div>
  );
}
