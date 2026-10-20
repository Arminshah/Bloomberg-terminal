import { useMemo, type ReactNode } from 'react';
import { AnalystSummary, lineValue, MissingNotes, useAnalystSnapshot, useNextQuarterEstimate } from '../components/AnalystSummary';
import { Chg, HBar, KV, LiveChg, LivePx, SecLink, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { Sparkline } from '../components/Sparkline';
import { fmtBig, fmtDay, fmtEarnDate, fmtInt, fmtMln, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { marketCapUsd, periodChange, rangeStats } from '../data/analytics';
import { dividendGrowth, dividends, earningsHistory, financials, holders, keyStats, nextEarnings, peers, reportCcy, revenueMix } from '../data/fundamentals';
import { desktopData } from '../data/live/yahoo';
import { fundVersion, getRealFund, useFundamentalsFor, type RealFund } from '../data/live/yfund';
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { loadInsiders, summarize } from '../data/live/insiders';
import { usePeers } from '../data/live/peers';
import { engine, useTick } from '../data/market';
import { equityRatios } from '../data/ratios';
import type { SecurityDef } from '../data/types';
import { COUNTRY_NAMES } from '../data/eco';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { useMenu, usePanelId } from '../terminal/panel';
import { settings } from '../terminal/settings';
import type { MenuItem } from '../terminal/types';

/** The equity DES pages, in the terminal's order. */
export const EQUITY_DES_TABS = [
  { n: 1, label: 'Profile' },
  { n: 2, label: 'Issue Info' },
  { n: 3, label: 'Ratios' },
  { n: 4, label: 'Revenue & EPS' },
  { n: 5, label: 'Industry Info' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "GP" or "CHART", as the mnemonic setting shows function names. */
function useFnName(): (code: string) => string {
  const mnemonics = settings.use((s) => s.mnemonics);
  return (code) => (mnemonics ? primaryMnemonic(code) : code);
}

/**
 * A DES box: a grey heading with its number and the function it opens, "11) Price Chart (GP)", as the terminal's
 * description page shows them. The number typed with GO opens the function, as a click on the heading does.
 */
function Box({ n, title, fn, sec, right, children }: { n?: number; title: string; fn?: string; sec: SecurityDef; right?: ReactNode; children: ReactNode }) {
  const panel = usePanelId();
  const name = useFnName();
  const head = (
    <>
      {n != null && <b className="des-n">{n})</b>} {title}
      {fn && <span className="des-fn"> ({name(fn)})</span>}
    </>
  );
  return (
    <section className="des-box">
      <div className="sect-h">
        {fn ? (
          <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} ${fn}`)} title={`${n != null ? `${n} <GO> or click: ` : ''}${fn}`}>
            {head}
          </button>
        ) : (
          <span>{head}</span>
        )}
        {right && <span className="right">{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** P/E, or NM (not meaningful) on a trailing loss, as the terminal writes it. */
export function peText(pe: number, eps: number): ReactNode {
  if (Number.isFinite(pe) && pe > 0) return fmtNum(pe, 2);
  return Number.isFinite(eps) && eps <= 0 ? <span title="Not meaningful: trailing 12-month EPS is a loss">NM</span> : '--';
}

/** Two figures in one cell, as "Px/Chg 1D" and "Shrs Out/Float" read on the terminal. */
function pair(a: ReactNode, b: ReactNode): ReactNode {
  return (
    <span>
      {a}
      <span className="muted">/</span>
      {b}
    </span>
  );
}

/** Float and short interest from Yahoo's key statistics; `sharesOut` in millions. */
export function floatItems(real: RealFund, sharesOut: number): [string, string][] {
  const f = real.float;
  const pctOut = f.float > 0 && sharesOut > 0 ? (f.float / (sharesOut * 1e6)) * 100 : NaN;
  const change = f.short > 0 && f.shortPrior > 0 ? (f.short / f.shortPrior - 1) * 100 : NaN;
  return [
    ['Float', `${fmtBig(f.float)}${Number.isFinite(pctOut) ? ` (${fmtNum(pctOut, 1)}% of shares out)` : ''}`],
    ['Short interest', fmtBig(f.short)],
    [`Short interest, % of float${f.shortPctFloatCalculated ? ' (calculated)' : ''}`, fmtPct(f.shortPctFloat, 2, false)],
    ['Days to cover', fmtNum(f.daysToCover, 2)],
    ['Short interest as of', fmtDay(f.asOf)],
    ['Change vs prior month', Number.isFinite(change) ? `${fmtPct(change, 1)} (${fmtBig(f.shortPrior)} on ${fmtDay(f.priorAsOf)})` : '--'],
  ];
}

function FloatNote({ real }: { real: RealFund }) {
  if (real.filledFrom?.includes('Nasdaq') && Number.isFinite(real.float.short) && !Number.isFinite(real.float.float)) return <div className="note">Short interest and days to cover from {real.filledFrom.includes('FINRA') ? 'FINRA' : 'Nasdaq'} (the count on the settlement date shown); Yahoo&apos;s key statistics, which give the float, did not answer this time.</div>;
  if (real.statsFrom === 'Finnhub') return <div className="note">Float and short interest come from Yahoo&apos;s key statistics, which Yahoo refused this time; Finnhub&apos;s profile does not give them.</div>;
  return <div className="note">Float and short interest from Yahoo Finance&apos;s key statistics; the short interest is the exchanges&apos; count on the settlement date shown, and days to cover is Yahoo&apos;s own ratio to average daily volume.{real.float.shortPctFloatCalculated ? ' The calculated short float percentage is shares short divided by the latest available float; the float date may differ from the short-interest settlement date.' : ''}</div>;
}

/** The statements' figures beside the market value, in the statements' currency (millions). */
function marketValueRep(sec: SecurityDef): number {
  const ks = keyStats(sec);
  const fx = ks.ccy === ks.tradeCcy ? 1 : engine.usdValue(ks.tradeCcy) / engine.usdValue(ks.ccy);
  return ks.mcap * fx;
}

// ---------------------------------------------------------------- 1) Profile

function ProfilePage({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const panel = usePanelId();
  const name = useFnName();
  const eq = sec.eq!;
  const q = engine.quote(sec.id);
  const ks = keyStats(sec);
  const rs = rangeStats(sec.id);
  const ne = nextEarnings(sec);
  const real = getRealFund(sec.id);
  const ccy = reportCcy(sec);
  const analysts = useAnalystSnapshot(sec);
  const estimate = useNextQuarterEstimate(sec);
  const today = engine.today * DAY_MS;
  const divs = dividends(sec);
  const lastDiv = divs.find((d) => d.ex <= today && Number.isFinite(d.amount));
  const nextDiv = divs.filter((d) => d.ex > today).sort((a, b) => a.ex - b.ex)[0];
  const daily = engine.daily(sec.id);
  const growth5 = dividendGrowth(divs.filter((d) => d.ex <= today), today, daily.length ? daily.t[0] : NaN);
  const ytd = periodChange(sec.id, 'YTD');
  const ytdAbs = q && Number.isFinite(ytd) ? q.last - q.last / (1 + ytd / 100) : NaN;
  // Without Yahoo's officer list, the officers who filed Form 4s with the SEC in the past year, chief executive first.
  const fundStatus = fundVersion.use((x) => x.status[sec.id]);
  const needInsiders = engine.realOnly && fundStatus === 'ok' && !real?.officers.length && !eq.ceo && secAvailable() && !!secTicker(sec);
  const insiders = useSecLoad(needInsiders ? `insiders:${sec.id}` : null, () => loadInsiders(sec));
  const filers = useMemo(() => {
    if (!insiders.result?.ok) return [];
    const rank = (t: string) => (/chief executive|\bceo\b/i.test(t) ? 0 : /chief financial|\bcfo\b/i.test(t) ? 1 : /president|chief operating|\bcoo\b/i.test(t) ? 2 : /chief|general counsel/i.test(t) ? 3 : 4);
    return summarize(insiders.result.data.trades).people
      .filter((p) => p.owner.officer)
      .sort((a, b) => rank(a.owner.title) - rank(b.owner.title))
      .map((p) => ({ name: p.owner.name, title: p.owner.title || 'Officer' }));
  }, [insiders.result]);
  const officers = real?.officers.length ? real.officers.slice(0, 3) : eq.ceo ? [{ name: eq.ceo, title: 'Chief Executive Officer' }] : filers.slice(0, 3);
  const f = real?.float;
  const mix = real ? [] : revenueMix(sec);
  const hs = holders(sec).filter((x) => x.type !== 'Fund').slice(0, 3);
  // Headings and named lines take their numbers in reading order, then the related functions from 41.
  const items: MenuItem[] = useMemo(() => {
    const go = (fn: string) => () => execute(panel, `${sec.id} ${fn}`);
    const list: MenuItem[] = [
      { n: 11, label: 'Price Chart', run: go('CHART') },
      { n: 12, label: 'Earnings', run: go('EARNINGS') },
      { n: 13, label: 'Dividend', run: go('DIVIDENDS') },
      { n: 14, label: 'Analyst Ratings', run: go('ANALYSTS') },
      { n: 15, label: 'Management', run: go('MANAGEMENT') },
      { n: 19, label: '12M Price Return', run: go('TOTALRETURN') },
      { n: 20, label: 'Beta', run: go('BETA') },
      { n: 21, label: 'Ownership', run: go('HOLDERS') },
    ];
    officers.forEach((_, i) => list.push({ n: 16 + i, label: 'Management', run: go('MANAGEMENT') }));
    return list;
  }, [panel, sec.id, officers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useMenu('des-boxes', items);
  return (
    <>
      <div className="des-head">
        <span className="des-name">{sec.name.toUpperCase()}</span>
        <span className="des-class">
          {eq.industry}
          {eq.sector && eq.sector !== eq.industry ? <span className="muted"> · {eq.sector}</span> : null}
        </span>
      </div>
      <p className="des-desc">{eq.desc || (engine.realOnly ? 'Loading the company profile…' : '')}</p>
      <div className="des-grid">
        <div className="des-col">
          <Box n={11} title="Price Chart" fn="CHART" sec={sec} right="1Y">
            <div className="pad-s">
              <Sparkline values={daily.c.subarray(Math.max(0, daily.length - 252), daily.length)} width={600} height={104} fluid mountain />
            </div>
          </Box>
          <KV
            items={[
              [`Px/Chg 1D (${sec.ccy})`, pair(<LivePx key="p" id={sec.id} />, <LiveChg key="c" id={sec.id} />)],
              [`52 Wk H (${fmtDay(rs.hi52t)})`, fmtNum(rs.hi52, sec.dec)],
              [`52 Wk L (${fmtDay(rs.lo52t)})`, fmtNum(rs.lo52, sec.dec)],
              ['YTD Change/%', pair(<Chg key="a" v={ytdAbs} dec={sec.dec} />, <Chg key="p" v={ytd} pct />)],
              [`Mkt Cap (${ks.tradeCcy})`, fmtMln(ks.mcap)],
              ...(ks.tradeCcy === 'USD' ? [] : [['Mkt Cap (USD)', fmtBig(marketCapUsd(sec.id))] as [string, string]]),
              ['Shrs Out/Float', pair(fmtMln(eq.shares), f ? fmtBig(f.float) : '--')],
              ['SI/% of Float', pair(f ? fmtBig(f.short) : '--', f ? <span title={f.shortPctFloatCalculated ? 'Calculated: reported shares short / latest available float. Float date may differ from the short-interest settlement date.' : 'Yahoo reported short interest as a percentage of float'}>{fmtPct(f.shortPctFloat, 2, false)}{f.shortPctFloatCalculated ? '*' : ''}</span> : '--')],
              ['Days to Cover', f ? fmtNum(f.daysToCover, 2) : '--'],
            ]}
          />
        </div>
        <div className="des-col">
          <Box n={12} title="Earnings" fn="EARNINGS" sec={sec}>
            <KV
              items={[
                ['Next report', ne ? fmtEarnDate(ne) : '--'],
                ['P/E', peText(ks.pe, ks.epsLtm)],
                [`T12M EPS (${ccy})`, `${fmtNum(ks.epsLtm, 2)}${financials(sec).ltm?.epsComputed ? ' (computed)' : ''}`],
                ['Est EPS, next quarter', lineValue(estimate)],
                ['ROE', fmtPct(ks.roe, 1, false)],
                ['Net margin', fmtPct(ks.netMargin, 1, false)],
              ]}
            />
            <MissingNotes lines={[estimate]} />
          </Box>
          <Box n={13} title="Dividend" fn="DIVIDENDS" sec={sec}>
            {!lastDiv && !nextDiv && !(ks.divYld > 0) && (eq.dps === 0 || engine.realOnly) ? (
              // A company that pays none says so once, instead of a line of dashes per figure.
              <KV
                items={[
                  ['12M Yield', Number.isFinite(ks.divYld) ? fmtPct(ks.divYld, 2, false) : '0.00%'],
                  ['Dividend', daily.length ? 'None paid in the price history' : 'None paid'],
                ]}
              />
            ) : (
              <KV
                items={[
                  ['12M Yield', fmtPct(ks.divYld, 2, false)],
                  ['Payout ratio', fmtPct(ks.payout, 1, false)],
                  ['5Y Growth (annual rate)', fmtPct(growth5, 1)],
                  [lastDiv ? `Cash ${fmtDay(lastDiv.ex)}` : 'Last cash', lastDiv ? fmtNum(lastDiv.amount, 4) : eq.dps === 0 ? 'None' : '--'],
                  ['Next ex-date', nextDiv ? `${fmtDay(nextDiv.ex)} (${nextDiv.type === 'Projected' ? 'proj.' : nextDiv.type === 'Expected' ? 'expected' : 'decl.'})` : 'None announced'],
                ]}
              />
            )}
          </Box>
          <Box n={14} title="Analyst Ratings" fn="ANALYSTS" sec={sec}>
            <AnalystSummary sec={sec} snap={analysts} />
          </Box>
        </div>
        <div className="des-col">
          <Box title="Corporate Info" sec={sec}>
            <KV
              items={[
                ['Headquarters', eq.hq || '--'],
                ['Employees', eq.emp > 0 ? fmtInt(eq.emp) : '--'],
                ['Fiscal year end', MONTHS[eq.fye - 1] ?? '--'],
                ['Primary exchange', sec.exch ?? '--'],
                ['Country', COUNTRY_NAMES[sec.country] ?? sec.country],
                // No source gives the founding year in the desktop app, so the line is left out there.
                ...(eq.founded || !engine.realOnly ? [['Founded', eq.founded ? String(eq.founded) : '--'] as [string, string]] : []),
              ]}
            />
          </Box>
          <Box n={15} title="Management" fn="MANAGEMENT" sec={sec}>
            {officers.length === 0 ? (
              <p className="pad-s muted">{!engine.realOnly ? '--' : fundStatus === 'loading' || insiders.loading ? 'Loading the officers…' : 'No officer list from the sources for this company.'}</p>
            ) : (
              <ol className="des-people">
                {officers.map((o, i) => (
                  <li key={o.name}>
                    <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} MANAGEMENT`)}>
                      <b className="des-n">{16 + i})</b> <span className="white">{o.name}</span>
                    </button>
                    <div className="muted des-title">{o.title}</div>
                  </li>
                ))}
              </ol>
            )}
          </Box>
          <dl className="kv des-links">
            <dt>
              <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} TOTALRETURN`)}>
                <b className="des-n">19)</b> 12M Px Return ({name('TOTALRETURN')})
              </button>
            </dt>
            <dd>
              <Chg v={periodChange(sec.id, '1Y')} pct />
            </dd>
            <dt>
              <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} BETA`)}>
                <b className="des-n">20)</b> Beta ({name('BETA')})
              </button>
            </dt>
            <dd title="The source's beta, 5 years of monthly returns; BETA works it out against the local index">{fmtNum(eq.beta, 2)}</dd>
          </dl>
          <Box n={21} title="Ownership" fn="HOLDERS" sec={sec}>
            {real ? (
              <KV
                items={[
                  ['Insiders', fmtPct(real.breakdown?.insiders, 2, false)],
                  ['Institutions', fmtPct(real.breakdown?.institutions, 2, false)],
                  ['Institutional holders', fmtInt(real.breakdown?.count)],
                ]}
              />
            ) : engine.realOnly ? (
              <p className="pad-s muted">{fundVersion.get().status[sec.id] === 'error' ? 'No ownership data from Yahoo Finance for this company.' : 'Loading ownership from Yahoo Finance…'}</p>
            ) : (
              <KV items={hs.map((h) => [h.name, `${fmtNum(h.pct, 2)}%`] as [string, string])} />
            )}
          </Box>
          {mix.length > 0 && (
            <Section title="Revenue by region" right={<span className="badge sim">DEMO DATA</span>}>
              <table className="tbl">
                <tbody>
                  {mix.map((m) => (
                    <tr key={m.region}>
                      <td style={{ width: 70 }}>{m.region}</td>
                      <td>
                        <HBar value={m.pct} max={100} color="var(--amber)" />
                      </td>
                      <td className="num" style={{ width: 56 }}>
                        {fmtNum(m.pct, 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>
      </div>
      <RelatedRow
        sec={sec}
        fns={['FINANCIALS', 'COMPANYNEWS', 'QUOTE', 'HISTORY', 'INTRADAY', 'OPTIONS', 'PEERS', 'EVENTS', 'FILINGS']}
      />
    </>
  );
}

/** The other everyday functions for the security, numbered from 41 as one line. */
function RelatedRow({ sec, fns }: { sec: SecurityDef; fns: string[] }) {
  const panel = usePanelId();
  const name = useFnName();
  const items: MenuItem[] = useMemo(() => fns.map((code, i) => ({ n: 41 + i, label: code, run: () => execute(panel, `${sec.id} ${code}`) })), [fns, panel, sec.id]);
  useMenu('des-related', items);
  return (
    <div className="des-related">
      <span className="muted">Related functions</span>
      {fns.map((code, i) => (
        <button key={code} type="button" className="des-link" onClick={() => execute(panel, `${sec.id} ${code}`)}>
          <b className="des-n">{41 + i})</b> {name(code)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 2) Issue Info

function IssueInfoPage({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const eq = sec.eq!;
  const ks = keyStats(sec);
  const rs = rangeStats(sec.id);
  const real = getRealFund(sec.id);
  // Fund filings overlap with their managers' 13F positions, so the summary counts managers only.
  const h = holders(sec).filter((x) => x.type !== 'Fund').slice(0, 10);
  const inst = h.reduce((s, x) => s + x.pct, 0);
  return (
    <>
      <div className="cols">
        <Section title="Issue Data">
          <KV
            items={[
              ['Ticker', `${sec.ticker} ${sec.id.split(' ').slice(1, -1).join(' ')}`.trim()],
              ['Security type', 'Common stock'],
              ['Primary exchange', sec.exch ?? '--'],
              ['Trading currency', sec.ccy],
              ['Reporting currency', ks.ccy],
              ['Country', COUNTRY_NAMES[sec.country] ?? sec.country],
            ]}
          />
        </Section>
        <Section title="Shares and Trading">
          <KV
            items={[
              ['Shares out', fmtMln(eq.shares)],
              [`Mkt cap (${ks.tradeCcy})`, fmtMln(ks.mcap)],
              ['Avg volume 30D', fmtBig(rs.avgVol30)],
              ['Volatility 30D / 260D', `${fmtNum(rs.vol30, 1)}% / ${fmtNum(rs.vol260, 1)}%`],
              ['Beta (source, 5Y monthly)', fmtNum(eq.beta, 2)],
            ]}
          />
        </Section>
        {real && (
          <Section title="Float and Short Interest">
            <KV items={floatItems(real, eq.shares)} />
            <FloatNote real={real} />
          </Section>
        )}
      </div>
      <Section title="Top institutional holders" right={`Top 10 hold ${fmtNum(inst, 1)}%`}>
        <DataTable
          rows={h}
          rowKey={(r) => r.name}
          numbered
          columns={[
            { key: 'n', label: 'Holder', render: (r) => r.name },
            { key: 'p', label: '% Out', num: true, render: (r) => fmtNum(r.pct, 2) },
            { key: 's', label: 'Position', num: true, render: (r) => fmtBig(r.shares) },
            { key: 'c', label: 'Change', num: true, render: (r) => <Chg v={r.change / 1e6} dec={2} /> },
          ]}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 3) Ratios

function RatiosPage({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const panel = usePanelId();
  const name = useFnName();
  const f = financials(sec);
  const ks = keyStats(sec);
  const ccy = reportCcy(sec);
  const latest = f.annual[f.annual.length - 1];
  const prior = f.annual[f.annual.length - 2];
  const r = equityRatios(f.ltm, latest, prior, marketValueRep(sec));
  const n2 = (v: number) => fmtNum(v, 2);
  const p1 = (v: number) => fmtPct(v, 1, false);
  const g1 = (v: number) => fmtPct(v, 1);
  if (!f.annual.length) return <div className="empty">{engine.realOnly ? 'Loading the statements from Yahoo Finance…' : 'No statements for this company.'}</div>;
  return (
    <>
      <div className="des-fy">
        <KV
          items={[
            ['Fiscal year end', latest ? fmtDay(latest.end) : '--'],
            ['Trailing 12 months to', fmtDay(f.ltm.end)],
            ['Currency', `${ccy} millions, per share in ${ccy}`],
          ]}
        />
        <span className="des-fy-links">
          {(['Income statement', 'Balance sheet', 'Cash flow'] as const).map((label) => (
            <button key={label} type="button" className="des-link" onClick={() => execute(panel, `${sec.id} FINANCIALS`)}>
              {label} ({name('FINANCIALS')})
            </button>
          ))}
        </span>
      </div>
      <div className="cols">
        <Section title="Issue Data">
          <KV items={[['Last Px', <LivePx key="l" id={sec.id} />], ['P/E', n2(ks.pe)], ['12M Dvd Yld', p1(ks.divYld)], ['P/B', n2(ks.pb)], ['P/S', n2(ks.ps)], ['EV/T12M EBITDA', n2(ks.evEbitda)], [`Mkt Cap (${ks.tradeCcy})`, fmtMln(ks.mcap)], [`EV (${ks.ccy})`, fmtMln(ks.ev)]]} />
        </Section>
        <Section title="Per Share Data">
          <KV items={[['EPS T12M', n2(f.ltm.eps)], ['DPS', n2(f.ltm.dps)], ['Bk Val Per Sh', n2(r.bookPerShare)], ['Rev Per Sh', n2(r.revPerShare)], ['Cash Per Sh', n2(r.cashPerShare)], ['FCF Per Sh', n2(r.fcfPerShare)], ['Diluted Shares', fmtMln(f.ltm.shares)]]} />
        </Section>
        <Section title="Cash Flow Analysis">
          <KV items={[['P/CF', n2(r.pcf)], ['P/FCF', n2(r.pfcf)], ['CF/NI', n2(r.cfToNi)], ['Dvd Payout', p1(ks.payout)], ['CFO/Sales', p1(r.cfoToSales)], ['Capex/Sales', p1(r.capexToSales)]]} />
        </Section>
        <Section title="Growth Potential">
          <KV items={[['Rev 1Y Gr', g1(r.revGrowth)], ['EPS 1Y Gr', g1(r.epsGrowth)], ['Bk Val 1Y Gr', g1(r.bookGrowth)], ['Assets 1Y Gr', g1(r.assetGrowth)], ['R&D/Sales', p1(r.rndToSales)], ['Retention Rate', p1(r.retention)]]} />
        </Section>
        <Section title="Profitability">
          <KV items={[['EBITDA', fmtMln(f.ltm.ebitda)], ['EBIT', fmtMln(f.ltm.opInc)], ['Gross Mrgn', p1(r.grossMargin)], ['Oper Mrgn', p1(r.opMargin)], ['Pretax Mrgn', p1(r.pretaxMargin)], ['Net Mrgn', p1(r.netMargin)], ['ROA', p1(r.roa)], ['ROE', p1(r.roe)], ['Asset Turnover', n2(r.assetTurnover)]]} />
        </Section>
        <Section title="Structure">
          <KV items={[['Current Ratio', n2(r.currentRatio)], ['Quick Ratio', n2(r.quickRatio)], ['Debt/Assets', p1(r.debtToAssets)], ['Debt/Equity', p1(r.debtToEquity)], ['EBIT/Interest', n2(r.interestCover)], ['Inv Turnover', n2(r.invTurnover)], ['A/R Turnover', n2(r.recvTurnover)]]} />
        </Section>
      </div>
      <div className="note">
        Worked out from the reported statements: the trailing twelve months, growth from the last two fiscal years, prices against the current market value. P/E, yield, P/B, P/S and EV/EBITDA are the figures PROFILE shows.
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 4) Revenue & EPS

function RevenueEpsPage({ sec }: { sec: SecurityDef }) {
  const f = financials(sec);
  const ccy = reportCcy(sec);
  const years = f.annual.slice(-6);
  const quarters = f.quarterly.slice(-8);
  const hist = earningsHistory(sec).filter((x) => x.actual != null || x.revAct != null).slice(-8).reverse();
  const next = nextEarnings(sec);
  const estimate = useNextQuarterEstimate(sec);
  const maxRev = Math.max(...years.map((y) => y.rev).filter(Number.isFinite), 1);
  if (!years.length) return <div className="empty">{engine.realOnly ? 'Loading the statements from Yahoo Finance…' : 'No statements for this company.'}</div>;
  const table = (cols: typeof years, title: string) => (
    <Section title={title} right={`${ccy} millions; EPS in ${ccy}`}>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.label} className="num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="amber">Revenue</td>
              {cols.map((c) => (
                <td key={c.label} className="num white">
                  {fmtNum(c.rev, 0)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="amber">Growth</td>
              {cols.map((c, i) => (
                <td key={c.label} className="num">
                  {i > 0 ? <Chg v={cols[i - 1].rev > 0 ? (c.rev / cols[i - 1].rev - 1) * 100 : NaN} pct dec={1} /> : '--'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="amber">Diluted EPS</td>
              {cols.map((c) => (
                <td key={c.label} className="num white">
                  {fmtNum(c.eps, 2)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="amber">Net income</td>
              {cols.map((c) => (
                <td key={c.label} className="num">
                  {fmtNum(c.ni, 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
  return (
    <>
      <div className="cols">
        <Section title="Revenue by fiscal year" right="reported">
          <table className="tbl">
            <tbody>
              {years.map((y) => (
                <tr key={y.label}>
                  <td style={{ width: 70 }} className="amber">
                    {y.label}
                  </td>
                  <td>
                    <HBar value={y.rev} max={maxRev} color="var(--amber)" />
                  </td>
                  <td className="num" style={{ width: 90 }}>
                    {fmtMln(y.rev)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Next report">
          <KV items={[['Date', next ? fmtEarnDate(next) : '--'], [estimate.label, lineValue(estimate)]]} />
          <MissingNotes lines={[estimate]} />
        </Section>
      </div>
      {table(years, 'Annual')}
      {quarters.length > 0 && quarters !== years && table(quarters, 'Quarterly')}
      {hist.length > 0 && (
        <Section title="Reported earnings" right="EARNINGS for the history">
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Date</th>
                <th className="num">Diluted EPS</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((x) => (
                <tr key={`${x.period}:${x.date}`}>
                  <td className="amber">{x.period}</td>
                  <td>{fmtEarnDate(x, false)}</td>
                  <td className="num white">{x.actual != null ? fmtNum(x.actual, 2) : '--'}</td>
                  <td className="num">{x.revAct != null ? fmtMln(x.revAct) : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 5) Industry Info

function IndustryPage({ sec }: { sec: SecurityDef }) {
  const tick = useTick(5);
  const eq = sec.eq!;
  // The same companies PEERS compares: found online in the desktop app, the built-in list's industry otherwise.
  const found = usePeers(desktopData() ? sec : undefined);
  const ids = found?.ids.join(',') ?? '';
  const group = useMemo(
    () => (desktopData() ? [sec, ...(found?.ids ?? []).map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d && d.id !== sec.id)] : [sec, ...peers(sec, 12)]),
    [sec, ids], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { loaded } = useFundamentalsFor(group);
  const rows = useMemo(
    () => group.map((d) => ({ d, mcap: marketCapUsd(d.id), pe: keyStats(d).pe, ytd: periodChange(d.id, 'YTD'), same: d.eq?.industry === eq.industry })),
    [group, tick, loaded], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <>
      <Section title="Classification">
        <KV items={[['Sector', eq.sector || '--'], ['Industry', eq.industry || '--'], ['Primary exchange', sec.exch ?? '--']]} />
      </Section>
      <Section title="Companies in the industry" right={desktopData() ? (found ? `${group.length - 1} peers found online; PEERS compares them` : 'Finding peers…') : 'the built-in list; PEERS compares them'}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.d.id}
          columns={[
            { key: 't', label: 'Ticker', render: (r) => <SecLink id={r.d.id}>{r.d.id.replace(/ Equity$/, '')}</SecLink> },
            { key: 'n', label: 'Name', render: (r) => (r.d.id === sec.id ? <span className="amber">{r.d.name}</span> : r.d.name) },
            { key: 'i', label: 'Industry', render: (r) => <span className={r.same ? '' : 'muted'}>{r.d.eq?.industry ?? '--'}</span> },
            { key: 'l', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
            { key: 'm', label: 'Mkt cap USD', num: true, render: (r) => fmtBig(r.mcap), sort: (r) => r.mcap },
            { key: 'p', label: 'P/E', num: true, render: (r) => fmtNum(r.pe, 1), sort: (r) => r.pe },
            { key: 'y', label: '%YTD', num: true, render: (r) => <Chg v={r.ytd} pct />, sort: (r) => r.ytd },
          ]}
          defaultSort={{ key: 'm', dir: -1 }}
        />
      </Section>
    </>
  );
}

export function EquityDES({ sec, tab }: { sec: SecurityDef; tab: number }) {
  switch (tab) {
    case 2:
      return <IssueInfoPage sec={sec} />;
    case 3:
      return <RatiosPage sec={sec} />;
    case 4:
      return <RevenueEpsPage sec={sec} />;
    case 5:
      return <IndustryPage sec={sec} />;
    default:
      return <ProfilePage sec={sec} />;
  }
}
