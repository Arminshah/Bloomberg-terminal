// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CapLink } from '../components/CapLink';
import { AnalystSummary, lineValue, MissingNotes, useAnalystSnapshot, useNextQuarterEstimate } from '../components/AnalystSummary';
import { analystsAvailable, analystSymbol, listedOutsideUs, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { Chg, HBar, KV, LiveChg, LivePx, SecLink, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { Sparkline } from '../components/Sparkline';
import { NextEarnings } from '../components/NextEarnings';
import { MarketValue } from '../components/MarketValue';
import { fmtBig, fmtDay, fmtEarnDate, fmtInt, fmtMln, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { indexAtOrBefore } from '../data/series';
import { localBeta, marketCapUsd, periodChange, periodStart, rangeStats } from '../data/analytics';
import { defaultBenchmark } from '../finance/beta';
import { dividends, earningsHistory, financials, holders, keyStats, nextEarnings, peers, priceInCurrency, reportCcy, revenueMix } from '../data/fundamentals';
import { desktopData, yahooSymbolFor } from '../data/live/yahoo';
import { fundVersion, getRealFund, useFundamentalsFor, type RealFund } from '../data/live/yfund';
import { loadFiler, resolveFiler, secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { useFundIdentifiers } from '../data/live/index-members';
import { US_STATES, usIsin } from '../core/identifiers';
import { useFigiListings } from '../data/live/related';
import { loadInsiders, summarize } from '../data/live/insiders';
import { wantShares } from '../data/live/shares';
import { usePeers } from '../data/live/peers';
import { engine, useQuote, useTick } from '../data/market';
import { epsText, fiscalGrid, fiscalQuarterOf, fiscalYearOf, GRID_ROWS, revenueText } from '../data/fiscal-grid';
import { useSegments, type SegmentState } from '../data/live/segments';
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
  { n: 5, label: 'ESG' },
  // The app's own, after the five the terminal shows (brochure 2025 p.13).
  { n: 6, label: 'Industry Info' },
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
export function Box({ n, title, fn, link, sec, right, children }: { n?: number; title: string; fn?: string; link?: string; sec: SecurityDef; right?: ReactNode; children: ReactNode }) {
  const panel = usePanelId();
  const name = useFnName();
  const head = (
    <>
      {n != null && <b className="des-n">{n})</b>} {title}
      {fn && <span className="des-fn"> | {link ?? name(fn)} »</span>}
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

/** A chief executive's title, not a former or interim one. */
/**
 * The head office line: the source's city and state or country, then the country code where the source has not
 * already named the country ("Cupertino, CA, US", but "London, United Kingdom" rather than "London, United Kingdom, GB").
 */
export function headOffice(hq: string, country: string): string {
  if (!hq) return '';
  if (!country || hq.endsWith(country) || (COUNTRY_NAMES[country] && hq.endsWith(COUNTRY_NAMES[country]))) return hq;
  return `${hq}, ${country}`;
}

/** A figure given in millions as DES writes market value and share counts: one decimal, a separator, "M" (41,934.9M). */
export function inMillions(v: number | undefined): string {
  return v !== undefined && Number.isFinite(v) ? `${fmtNum(v, 1)}M` : '--';
}

/** A market value given in millions, as DES writes it: in billions from a billion up ("2,400.3B"), else in millions. */
export function marketCapText(millions: number | undefined): string {
  if (millions === undefined || !Number.isFinite(millions)) return '--';
  return Math.abs(millions) >= 1000 ? `${fmtNum(millions / 1000, 1)}B` : inMillions(millions);
}

export const isChiefExecutive = (title: string) => /\b(?:CEO|Chief Executive)\b/i.test(title) && !/\b(?:former|retired|interim)\b/i.test(title);

/**
 * Total return over the past year in percent, the dividends reinvested on their ex-dates (as TOTALRETURN works it
 * out): from the close a year before the latest session, the session of the last price.
 */
export function totalReturn1Y(sec: SecurityDef): number {
  const s = engine.daily(sec.id);
  const n = s.length;
  if (!n || !Number.isFinite(s.c[n - 1])) return NaN;
  const from = periodStart(s, '1Y');
  if (s.t[0] > from) return NaN;
  const i0 = indexAtOrBefore(s, from);
  if (i0 < 0 || !(s.c[i0] > 0)) return NaN;
  const paid = dividends(sec).filter((d) => d.ex > s.t[i0] && d.ex <= s.t[n - 1] && Number.isFinite(d.amount));
  let tr = 1;
  for (let i = i0 + 1; i < n; i++) {
    let gross = s.c[i] / s.c[i - 1];
    for (const d of paid) if (d.ex > s.t[i - 1] && d.ex <= s.t[i]) gross += d.amount / s.c[i - 1];
    tr *= gross;
  }
  return (tr - 1) * 100;
}

/**
 * The current and next fiscal years' EPS estimates, for Est P/E and PEG. The current year is the first one whose
 * results are not yet in the statements: the report's capture of 31 January 2019 gives Est P/E for 12/18, a year that
 * had ended but was reported in February. Without the statements it is the first year ending from today; a year ended
 * more than a year ago never counts as current.
 */
export function fiscalEstimates(part: AnalystPart<Estimate[]> | undefined, lastReportedEnd = NaN, todayMs = engine.today * DAY_MS): { fy?: Estimate; next?: Estimate; from?: string } {
  // A fiscal year's estimate can be dated a few days after the statements' period end (52- and 53-week years).
  const from = Number.isFinite(lastReportedEnd) ? Math.max(lastReportedEnd + 20 * DAY_MS, todayMs - 366 * DAY_MS) : todayMs;
  const fromIso = new Date(from).toISOString().slice(0, 10);
  const years = (part?.state === 'ok' ? part.data ?? [] : []).filter((e) => e.date >= fromIso && Number.isFinite(e.epsAvg));
  return { fy: years[0], next: years[1], from: part?.source };
}

function ProfilePage({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const panel = usePanelId();
  const eq = sec.eq!;
  // Price-dependent rows must refresh on the same quote notification as LivePx.
  // The slower clock subscription alone does not react to a provider flush.
  const q = useQuote(sec.id);
  const ks = keyStats(sec);
  const rs = rangeStats(sec.id);
  const ne = nextEarnings(sec);
  const real = getRealFund(sec.id);
  // Its share count (behind the market value) is read before the other stocks'.
  useEffect(() => wantShares(sec.id), [sec.id]);
  const ccy = reportCcy(sec);
  const est = useAnalysts(analystsAvailable() && analystSymbol(sec) ? sec : undefined, ['estimates', 'consensus', 'ratings']);
  const estPart = est.estimates as AnalystPart<Estimate[]> | undefined;
  const annual = financials(sec).annual;
  const { fy, next } = fiscalEstimates(estPart, annual.length ? annual[annual.length - 1].end : NaN);
  // The price in the estimates' currency (a London price in pence against estimates in pounds or euros); research on
  // a listing outside the US must state its currency.
  const estCcy = fy?.epsCurrency ?? fy?.currency ?? estPart?.currency;
  const estPx = q && (estCcy || !listedOutsideUs(analystSymbol(sec))) ? priceInCurrency(sec, q.last, estCcy) : NaN;
  const estPe = fy && fy.epsAvg > 0 ? estPx / fy.epsAvg : NaN;
  const estUnit = estCcy && estCcy !== (sec.ccy === 'GBp' ? 'GBP' : sec.ccy) ? ` (${estCcy})` : '';
  const growth = fy && next && fy.epsAvg > 0 && next.epsAvg > 0 ? (next.epsAvg / fy.epsAvg - 1) * 100 : NaN;
  const estPeg = Number.isFinite(estPe) && growth > 0 ? estPe / growth : NaN;
  const today = engine.today * DAY_MS;
  const divs = dividends(sec);
  const lastDiv = divs.find((d) => d.ex <= today && Number.isFinite(d.amount));
  const nextDiv = divs.filter((d) => d.ex > today).sort((a, b) => a.ex - b.ex)[0];
  const daily = engine.daily(sec.id);
  // The US listing's FIGI beside the name, as the terminal's page shows it (OpenFIGI, desktop app, US stocks).
  const figiAnswer = useFigiListings(engine.realOnly && sec.country === 'US' ? secTicker(sec) : null);
  const figi = figiAnswer?.listings.find((l) => l.exchCode === 'US')?.figi;
  const ytd = periodChange(sec.id, 'YTD');
  const ytdAbs = q && Number.isFinite(ytd) ? q.last - q.last / (1 + ytd / 100) : NaN;
  const ytdBaseIndex = indexAtOrBefore(daily, periodStart(daily, 'YTD'));
  const returnsAudit = {
    schema: 1, domain: 'profile-returns', security: sec.id, ticker: yahooSymbolFor(sec) ?? sec.yahoo ?? sec.ticker.split(' ')[0], capturedAt: Date.now(),
    price: q?.last ?? null, priceTime: q?.time ?? null, provider: q?.provider ?? null, currency: sec.ccy,
    ytd, ytdAbsolute: ytdAbs, baseClose: ytdBaseIndex >= 0 ? daily.c[ytdBaseIndex] : null,
    baseTime: ytdBaseIndex >= 0 ? daily.t[ytdBaseIndex] : null, cutoff: periodStart(daily, 'YTD'), engineTick: engine.tickCount,
  };
  const totRet = totalReturn1Y(sec);
  const [more, setMore] = useState(false);
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
  // The chief executive first: the profile lists officers by pay, and a newly appointed one comes late (Apple's John
  // Ternus in October 2026, after the executive chair, the finance chief and the operating chief).
  const ranked = real?.officers.length ? [...real.officers].sort((a, b) => Number(isChiefExecutive(b.title)) - Number(isChiefExecutive(a.title))) : [];
  const officers = ranked.length ? ranked.slice(0, 3) : eq.ceo ? [{ name: eq.ceo, title: 'Chief Executive Officer' }] : filers.slice(0, 3);
  const f = real?.float;
  // Outside the US no short interest is published for the whole market: the rows say so instead of dashes.
  const noShortData = engine.realOnly && sec.country !== 'US' && !(f && (Number.isFinite(f.short) || Number.isFinite(f.daysToCover)));
  // The boxes take the numbers the terminal's description page gives them; a number typed with GO opens the box.
  const items: MenuItem[] = useMemo(() => {
    const go = (fn: string) => () => execute(panel, `${sec.id} ${fn}`);
    const list: MenuItem[] = [
      { n: 8, label: 'Price Chart', run: go('CHART') },
      { n: 9, label: 'Estimates', run: go('EARNINGSSUMMARY') },
      { n: 10, label: 'Analyst Ratings', run: go('ANALYSTS') },
      { n: 12, label: 'Dividend', run: go('DIVIDENDS') },
      { n: 15, label: 'Management', run: go('MANAGEMENT') },
    ];
    if (eq.web) list.push({ n: 14, label: 'Website', run: () => window.open(eq.web, '_blank', 'noopener') });
    officers.forEach((_, i) => list.push({ n: 16 + i, label: 'Management', run: go('MANAGEMENT') }));
    return list;
  }, [panel, sec.id, officers.length, eq.web]); // eslint-disable-line react-hooks/exhaustive-deps
  useMenu('des-boxes', items);
  const city = headOffice(eq.hq, sec.country ?? '');
  // Without the source's beta, the one BETA works out: two years of weekly returns against the local index.
  const beta = betaLine(sec.country ?? '', eq.beta, () => localBeta(sec.id), defaultBenchmark(sec, (x) => !!engine.get(x)).replace(/ Index$/, ''), engine.realOnly);
  return (
    <>
      <div className="des-head" data-audit-state={JSON.stringify(returnsAudit)}>
        <span className="des-name">{sec.name.toUpperCase()}</span>
        {figi && (
          <span className="des-figi" title="Financial Instrument Global Identifier of the US listing, from OpenFIGI">
            <span className="amber">FIGI</span> <span className="white">{figi}</span>
          </span>
        )}
      </div>
      <div className="des-head">
        <span className="des-class">
          <span className="amber">Classification</span> <span className="white">{eq.industry || eq.sector || '--'}</span>
        </span>
      </div>
      {eq.desc ? (
        <p className={`des-desc${more ? '' : ' clamp'}`}>
          {eq.desc}
          {!more && eq.desc.length > 240 ? null : null}
        </p>
      ) : (
        <p className="des-desc">{engine.realOnly ? 'Loading the company profile…' : ''}</p>
      )}
      {eq.desc && eq.desc.length > 240 && (
        <button type="button" className="des-more" onClick={() => setMore(!more)}>
          {more ? 'Less' : '… More'}
        </button>
      )}
      <div className="des-grid">
        <div className="des-col">
          <Box n={8} title="Price Chart" fn="CHART" sec={sec}>
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
              [`Mkt Cap (${ks.tradeCcy})`, <MarketValue key="mc" sec={sec}><CapLink id={sec.id}>{marketCapText(ks.mcap)}</CapLink></MarketValue>],
              ...(ks.tradeCcy === 'USD' ? [] : [['Mkt Cap (USD)', <MarketValue key="mcu" sec={sec} currency="USD"><CapLink id={sec.id}>{fmtBig(marketCapUsd(sec.id))}</CapLink></MarketValue>] as [string, ReactNode]]),
              ['Shrs Out/Float', <MarketValue key="so" sec={sec} measure="shares">{pair(inMillions(eq.shares), f && Number.isFinite(f.float) ? inMillions(f.float / 1e6) : '--')}</MarketValue>],
              ...(noShortData
                ? [['SI/Days to Cover', <span key="si" className="muted" title="Short interest is published for US listings (FINRA); exchanges elsewhere publish only large individual short positions, and the sources give none for this listing">US listings only</span>] as [string, ReactNode]]
                : [
                    ['SI/% of Float', pair(f && Number.isFinite(f.short) ? fmtBig(f.short) : '--', f && Number.isFinite(f.shortPctFloat) ? <span title={f.shortPctFloatCalculated ? 'Calculated: reported shares short / latest available float. Float date may differ from the short-interest settlement date.' : 'Short interest as a percentage of float, as the source reports it'}>{fmtPct(f.shortPctFloat, 2, false)}{f.shortPctFloatCalculated ? '*' : ''}</span> : '--')] as [string, ReactNode],
                    ['Days to Cover', f && Number.isFinite(f.daysToCover) ? fmtNum(f.daysToCover, 1) : '--'] as [string, ReactNode],
                  ]),
            ]}
          />
        </div>
        <div className="des-col">
          <Box n={9} title="Estimates" fn="EARNINGSSUMMARY" sec={sec}>
            <KV
              items={[
                // As the terminal writes it: the session, then (C) for a confirmed date or (E) for an expected one.
                ['Date', <NextEarnings key="d" sec={sec} ne={ne} withTiming={false} prefix={ne ? <>{ne.timing && ne.timing !== '--' ? `${ne.timing} ` : ''}<span className="muted">{ne.approx ? '(E) ' : '(C) '}</span></> : null} />],
                ['P/E', peText(ks.pe, ks.epsLtm)],
                [`Est P/E${fy ? ` ${fyLabel(fy.date)}` : ''}`, fy && Number.isFinite(fy.epsAvg) && fy.epsAvg <= 0 ? <span key="n" title="Not meaningful: the year's EPS estimate is a loss">NM</span> : fmtNum(estPe, 2)],
                [`T12M EPS (${ccy})`, `${fmtNum(ks.epsLtm, 2)}${financials(sec).ltm?.epsComputed ? ' (computed)' : ''}`],
                [`Est EPS${fy ? ` ${fyLabel(fy.date)}` : ''}${estUnit}`, fy ? fmtNum(fy.epsAvg, 2) : '--'],
                ['Est PEG', Number.isFinite(estPeg) ? fmtNum(estPeg, 2) : fy && Number.isFinite(fy.epsAvg) ? <span key="n" title="Not meaningful: needs a positive estimated P/E and EPS growth into the next fiscal year">NM</span> : '--'],
              ]}
            />
          </Box>
          <Box n={12} title="Dividend" fn="DIVIDENDS" sec={sec}>
            {!lastDiv && !nextDiv && !(ks.divYld > 0) && (eq.dps === 0 || engine.realOnly) ? (
              // A company that pays none says so once, instead of a line of dashes per figure.
              <KV items={[['Ind Gross Yield', Number.isFinite(ks.divYld) ? fmtPct(ks.divYld, 2, false) : '0.00%'], ['Dividend', daily.length ? 'None paid' : 'None paid']]} />
            ) : (
              <KV
                items={[
                  ['Ind Gross Yield', fmtPct(eq.dps > 0 && q?.last ? (eq.dps / q.last) * 100 : ks.divYld, 2, false)],
                  [lastDiv ? `Cash ${fmtDay(lastDiv.ex)}` : 'Last cash', lastDiv ? fmtNum(lastDiv.amount, 2) : '--'],
                  ...(nextDiv ? [[`Next ex ${fmtDay(nextDiv.ex)}`, Number.isFinite(nextDiv.amount) ? fmtNum(nextDiv.amount, 2) : nextDiv.type] as [string, string]] : []),
                ]}
              />
            )}
          </Box>
        </div>
        <div className="des-col">
          <Box n={13} title="Corporate Info" sec={sec}>
            <div className="des-corp">
              {eq.web && (
                <button type="button" className="des-link blue" onClick={() => window.open(eq.web, '_blank', 'noopener')}>
                  <b className="des-n">14)</b> {eq.web.replace(/^https?:\/\/(www\.)?/, 'www.').replace(/\/$/, '')}
                </button>
              )}
              <div className="amber">{city || (engine.realOnly ? '' : '--')}</div>
              <KV items={[['Empls', eq.emp > 0 ? fmtInt(eq.emp) : '--']]} />
            </div>
          </Box>
          <Box n={15} title="Management" fn="MANAGEMENT" sec={sec}>
            {officers.length === 0 ? (
              <p className="pad-s muted">{!engine.realOnly ? '--' : fundStatus === 'loading' || insiders.loading ? 'Loading the officers…' : 'No officer list from the sources for this company.'}</p>
            ) : (
              <ol className="des-people">
                {officers.map((o, i) => (
                  <li key={o.name}>
                    <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} MANAGEMENT`)}>
                      <b className="des-n">{16 + i})</b> <span className="amber">{o.name}</span>
                    </button>
                    <div className="muted des-title">{o.title}</div>
                  </li>
                ))}
              </ol>
            )}
          </Box>
          {/* No numbers on these two, even with values (brochure 2025 p.13, TE01 01:45): 18) runs on to 21). */}
          <dl className="kv des-links">
            <dt>
              <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} TOTALRETURN`)}>
                12M Tot Ret
              </button>
            </dt>
            <dd title="The price change with the dividends reinvested on their ex-dates, from the close a year before the latest session">
              <Chg v={totRet} pct />
            </dd>
            <dt>
              <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} BETA`)}>
                {beta.label}
              </button>
            </dt>
            <dd title={beta.title}>
              {fmtNum(beta.value, 2)}
              {beta.worked ? '*' : ''}
            </dd>
          </dl>
          <Box n={21} title="Depositary Receipts" sec={sec}>
            <KV items={[['Active Receipts', <span key="r" className="muted" title="Depositary receipts on the company's shares: none of the app's sources lists them">--</span>]]} />
          </Box>
        </div>
      </div>
    </>
  );
}

/** The index a stock's beta is quoted against on the page, by listing country. */
const BETA_INDEX: Record<string, string> = { US: 'SPX', GB: 'UKX', DE: 'DAX', FR: 'CAC', JP: 'NKY', HK: 'HSI', CA: 'SPTSX', BE: 'BEL20', NL: 'AEX', CH: 'SMI', AU: 'AS51' };

/**
 * PROFILE's beta line, as DES gives it: two years of weekly returns against the home index (the S&P 500 for a US stock,
 * the FTSE 100 for a London one), adjusted as 0.67 x raw + 0.33 x 1, the method BETA works out. Public DES captures show
 * the adjusted figure (a guide of March 2023: DES "Beta vs SPX 1.17" beside BETA's raw 1.258 and adjusted 1.172, 103
 * weekly points). The source's beta (Yahoo's or Finnhub's, five years of monthly returns, raw) is another method: it is
 * shown only when the history is too short to work out DES's, under a plain "Beta" that names no index.
 */
export function betaLine(country: string, sourceBeta: number, worked: () => number, bench: string, realOnly: boolean): { label: string; value: number; worked: boolean; title: string } {
  const source = "The source's beta, 5 years of monthly returns, a different method from DES's";
  if (!realOnly) {
    return { label: `Beta vs ${BETA_INDEX[country] ?? 'index'}`, value: sourceBeta, worked: false, title: `${source}; BETA works it out against the local index` };
  }
  const w = worked();
  if (Number.isFinite(w)) {
    return { label: `Beta vs ${bench}`, value: w, worked: true, title: `Two years of weekly returns against the ${bench}, adjusted (0.67 x raw + 0.33), as DES gives it and BETA works it out` };
  }
  if (Number.isFinite(sourceBeta)) {
    return { label: 'Beta', value: sourceBeta, worked: false, title: `${source}; the price history is too short to work out the two-year weekly beta` };
  }
  return { label: `Beta vs ${bench}`, value: NaN, worked: false, title: 'No beta: the sources give none and the price history is too short to work one out' };
}

/** "12/26": the fiscal year an estimate is for, by its year-end month. */
function fyLabel(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

// ---------------------------------------------------------------- 2) Issue Info

/** Market identifier codes (ISO 10383) of the exchanges the app's listings name, for Issue Information. */
const MIC: [RegExp, string][] = [
  [/^nasdaq(?! (stockholm|helsinki|copenhagen))/i, 'XNAS'], [/^nyse$/i, 'XNYS'], [/^nyse american/i, 'XASE'], [/^nyse arca/i, 'ARCX'],
  [/^london$/i, 'XLON'], [/^tokyo$/i, 'XTKS'], [/^six swiss/i, 'XSWX'], [/^en paris$/i, 'XPAR'], [/^en amsterdam$/i, 'XAMS'],
  [/^en brussels$/i, 'XBRU'], [/^en lisbon$/i, 'XLIS'], [/^xetra$/i, 'XETR'], [/^toronto$/i, 'XTSE'], [/^hong kong$/i, 'XHKG'],
  [/^asx$/i, 'XASX'], [/^nasdaq stockholm$/i, 'XSTO'], [/^nasdaq helsinki$/i, 'XHEL'], [/^oslo bors$/i, 'XOSL'], [/^vienna$/i, 'XWBO'],
];

export function marketIdentifier(exch: string | undefined): string {
  return MIC.find(([re]) => exch && re.test(exch))?.[1] ?? '--';
}

function IssueInfoPage({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const eq = sec.eq!;
  const real = getRealFund(sec.id);
  const b = real?.breakdown ?? null;
  const ticker = secTicker(sec);
  const us = sec.country === 'US';
  // The SEC's company record (state of incorporation) and the last six months of Form 4 filings, for a US filer.
  const filer = useSecLoad(engine.realOnly && us && ticker ? `submissions:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadFiler(c.data.cik, force);
  });
  const insiders = useSecLoad(engine.realOnly && us && ticker ? `insiders6:${sec.id}` : null, () => loadInsiders(sec, 6));
  const figiAnswer = useFigiListings(engine.realOnly && us ? ticker : null);
  const figi = figiAnswer?.listings.find((l) => l.exchCode === 'US')?.figi;
  // An S&P 500 member's CUSIP and SEDOL from State Street's SPY holdings; a company incorporated in a US state has the
  // ISIN "US", its CUSIP and a check digit (ISO 6166). Others' ISINs carry their home country and are not derived.
  const codes = useFundIdentifiers(engine.realOnly && us && ticker ? ticker.replace(/-/g, '.') : null);
  const incorporation = filer.result?.ok ? filer.result.data.stateOfIncorporation : undefined;
  const isin = codes && incorporation && US_STATES.has(incorporation) ? usIsin(codes.cusip) : '';
  const fromSpy = codes ? `From State Street's SPY holdings as of ${codes.asOf}` : '';
  // Fund filings overlap with their managers' 13F positions, so the list counts managers only.
  const top = holders(sec).filter((x) => x.type !== 'Fund').slice(0, 7);
  const asOf = top.reduce((m, x) => (Number.isFinite(x.filed) && x.filed > m ? x.filed : m), NaN);
  const none = (why: string) => <span className="muted" title={why}>--</span>;
  const noSource = none('No free source gives this figure');
  const net = insiders.result?.ok ? summarize(insiders.result.data.trades).all.netShares : NaN;
  return (
    <>
      <div className="cols">
        <Section title="Public Offerings">
          <div className="empty">Public offerings are not available.</div>
        </Section>
        <Section title="Inst Holdings">
          <KV
            items={[
              ['# of Inst. Owners', b && Number.isFinite(b.count) ? fmtInt(b.count) : noSource],
              ['Shares Owned', b && Number.isFinite(b.institutions) ? fmtMln((eq.shares * b.institutions) / 100) : noSource],
              ['Shares Out/Float', b ? `${fmtNum(b.institutions, 0)}%/${fmtNum(b.institutionsFloat, 1)}%` : noSource],
              ['# of Buyers/Sellers', noSource],
              ['Shares Bought', noSource],
            ]}
          />
        </Section>
      </div>
      <div className="cols">
        <Section title="Issue Information">
          <KV
            items={[
              ['Sec Type', 'Common Stock'],
              ['Fiscal Year End', MONTHS[eq.fye - 1] ?? '--'],
              ['Pri Exch', sec.exch ?? '--'],
              ['PAR', noSource],
              ['Pri MIC', marketIdentifier(sec.exch)],
              ['Incorp', filer.result?.ok && filer.result.data.stateOfIncorporation ? filer.result.data.stateOfIncorporation : us ? noSource : none('The state of incorporation comes from SEC filings, for US filers')],
              ['FIGI', figi ?? (us ? noSource : none('OpenFIGI is asked for US listings'))],
              ['ISIN', isin ? <span key="isin" title={`${fromSpy}: "US", the CUSIP ${codes!.cusip} and its check digit (ISO 6166), the company being incorporated in ${incorporation}`}>{isin}</span> : noSource],
              ['SEDOL1', codes?.sedol ? <span key="sedol" title={fromSpy}>{codes.sedol}</span> : noSource],
            ]}
          />
        </Section>
        <Section title="Insider Holdings">
          <KV
            items={[
              ['% Held by Insiders', b && Number.isFinite(b.insiders) ? `${fmtNum(b.insiders, 2)}%` : noSource],
              ['Net Change Last 6M', Number.isFinite(net) ? <span key="n" title="Shares bought less shares sold in the Form 4 filings of the last six months, options left out">{fmtInt(net)}</span> : us ? noSource : none('Form 4 filings are made with the SEC for US-listed companies')],
            ]}
          />
        </Section>
        <Section title="Top Holders" right={Number.isFinite(asOf) ? `as of ${fmtDay(asOf)}` : undefined}>
          {top.length ? (
            <KV items={top.map((h) => [<span key={h.name} className="amber ellipsis">{h.name}</span>, `${fmtNum(h.pct, 2)}%`])} />
          ) : (
            <div className="empty">No holder filings from the source.</div>
          )}
        </Section>
      </div>
      {real && (
        <Section title="Float and Short Interest">
          <KV items={floatItems(real, eq.shares)} />
          <FloatNote real={real} />
        </Section>
      )}
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
  const eq = sec.eq!;
  const latest = f.annual[f.annual.length - 1];
  const prior = f.annual[f.annual.length - 2];
  const lastQ = f.quarterly[f.quarterly.length - 1];
  const r = equityRatios(f.ltm, latest, prior, marketValueRep(sec));
  // Links 7) to 9): the statements on FA (Scranton manual p.28, 2016).
  const links: [number, string, string][] = [[7, 'Income Statements', 'IS'], [8, 'Balance Sheet', 'BS'], [9, 'Cash Flow', 'CF']];
  useMenu('des-ratios', useMemo(() => links.map(([n, label, page]) => ({ n, label, run: () => execute(panel, `${sec.id} FINANCIALS ${page}`) })), [panel, sec.id])); // eslint-disable-line react-hooks/exhaustive-deps
  const n1 = (v: number) => fmtNum(v, 1);
  const n2 = (v: number) => fmtNum(v, 2);
  const p1 = (v: number) => fmtPct(v, 1, false);
  const g1 = (v: number) => fmtPct(v, 1, false);
  const own = (v: string, what: string) => <span title={`The app's own measure: ${what}. The provider does not publish its definition.`}>{v}</span>;
  const mmYyyy = (ms: number) => (Number.isFinite(ms) ? `${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}/${new Date(ms).getUTCFullYear()}` : '--');
  const mmYy = (ms: number) => (Number.isFinite(ms) ? `${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}/${String(new Date(ms).getUTCFullYear()).slice(2)}` : '--');
  if (!f.annual.length) return <div className="empty">{engine.realOnly ? 'Loading the statements from Yahoo Finance…' : 'No statements for this company.'}</div>;
  const box = (title: string, items: [string, ReactNode][]) => (
    <Section title={title} right={<span className="des-chart-mark" aria-hidden="true">▤</span>}>
      <KV items={items} />
    </Section>
  );
  return (
    <>
      <div className="des-fy">
        <KV
          items={[
            ['Fiscal Year End', latest ? mmYyyy(latest.end) : '--'],
            ['Last Quarter End', lastQ ? `${mmYy(lastQ.end)} Q${fiscalQuarterOf(lastQ.end, eq.fye || 12)}` : '--'],
            ['Current/T12M', `(${ccy})`],
          ]}
        />
        <span className="des-fy-links">
          {links.map(([n, label, page]) => (
            <button key={n} type="button" className="des-link" onClick={() => execute(panel, `${sec.id} FINANCIALS ${page}`)}>
              <b className="des-n">{n})</b> <span className="amber">{label} ({name('FINANCIALS')} {page})</span>
            </button>
          ))}
        </span>
      </div>
      <div className="cols cols-3">
        {box('Issue Data', [
          ['Last Px', <span key="l">{ks.tradeCcy}/<LivePx id={sec.id} /></span>],
          ['P/E', n1(ks.pe)],
          ['Dvd Ind Yld', p1(ks.divYld)],
          ['P/B', n2(ks.pb)],
          ['P/S', n1(ks.ps)],
          ['Curr EV/T12M EBITDA', n1(ks.evEbitda)],
          ['Mkt Cap', <CapLink key="mc" id={sec.id}>{inMillions(ks.mcap)}</CapLink>],
          ['Curr EV', inMillions(ks.ev)],
        ])}
        {box('Per Share Data', [
          ['EPS T12M', n2(f.ltm.eps)],
          ['DPS', n2(f.ltm.dps)],
          ['Bk Val Per Sh', n2(r.bookPerShare)],
          ['Rev/Bas Sh', n2(r.revPerShare)],
          ['CPS', <span key="c" title="Cash from operations per share, trailing 12 months">{n2(r.cfoPerShare)}</span>],
          ['Curr Shares Out', eq.shares > 0 ? `${fmtNum(eq.shares / 1000, 1)}B` : '--'],
          ['FCF/Basic Sh', n2(r.fcfPerShare)],
        ])}
        {box('Cash Flow Analysis', [
          ['P/CF', n1(r.pcf)],
          ['Curr P/FCF', n1(r.pfcf)],
          ['CF/NI', n1(r.cfToNi)],
          ['Dvd P/O', p1(ks.payout)],
          ['Cash Gen/Cash Reqd', own(n1(r.cashGenToReqd), 'cash from operations over capital spending plus dividends paid')],
          ['Csh Dvd Cov', own(n1(r.cashDividendCover), 'cash from operations less capital spending, over dividends paid')],
          ['CFO/Sales', p1(r.cfoToSales)],
          ['Eff IR', own(p1(r.effectiveInterest), 'interest expense over total debt')],
        ])}
        {box('Growth Potential', [
          ['Dil EPS Frm Cont Op 1Y Gr', g1(r.epsGrowth)],
          ['Cap 1Y Gr', own(g1(r.capitalGrowth), 'growth of debt plus equity over the last fiscal year')],
          ['BPS 1Y Gr', g1(r.bookGrowth)],
          ['R&D To Sl', p1(r.rndToSales)],
          ['Retntn Rt', p1(r.retention)],
          ['Rev - 1 Yr Gr', g1(r.revGrowth)],
          ['Empl 1Y Gr', <span key="e" className="muted" title="Needs the number of employees a year ago: none of the app's sources gives it">--</span>],
          ['Ast 1Y Gr', g1(r.assetGrowth)],
        ])}
        {box('Profitability', [
          ['EBITDA', revenueText(f.ltm.ebitda)],
          ['EBIT', revenueText(f.ltm.opInc)],
          ['OPM', p1(r.opMargin)],
          ['Pretax Mrgn', p1(r.pretaxMargin)],
          ['ROA', p1(r.roa)],
          ['ROE', p1(r.roe)],
          ['ROC', own(p1(r.returnOnCapital), 'operating income after the effective tax rate, over debt plus equity')],
          ['Ast TO', n1(r.assetTurnover)],
        ])}
        {box('Structure', [
          ['Curr Ratio', n1(r.currentRatio)],
          ['Quick Ratio', n1(r.quickRatio)],
          ['Debt/Assets', p1(r.debtToAssets)],
          ['Debt/Com Eq', p1(r.debtToEquity)],
          ['A/R Trnovr', n1(r.recvTurnover)],
          ['Inv Turnover', n1(r.invTurnover)],
          ['GM', p1(r.grossMargin)],
          ['EBIT/Tot Int Exp', n1(r.interestCover)],
        ])}
      </div>
      <div className="note">
        Worked out from the reported statements: the trailing twelve months, growth from the last two fiscal years, prices against the current market value. P/E, yield, P/B, P/S and EV/EBITDA are the figures PROFILE shows. Rows marked on hover as the app&apos;s own use its definitions where the provider publishes none. The app&apos;s other measures: net margin {p1(r.netMargin)}, capital spending/sales {p1(r.capexToSales)}, cash per share {n2(r.cashPerShare)}.
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 4) Revenue & EPS

/** A line of yearly figures over the quarters' bars, reported in orange and estimated in grey (TE01 02:31). */
function FiscalChart({ years, cells }: ReturnType<typeof fiscalGrid>) {
  const fyVals = cells.FY.map((c) => (c ? c.value : NaN));
  const qVals = years.flatMap((_, i) => (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((r) => cells[r][i]));
  // The yearly line spans its own range, as the terminal's does; the bars stand on zero.
  const finite = fyVals.filter(Number.isFinite);
  const top = finite.length ? Math.max(...finite) : 1;
  const low = finite.length ? Math.min(...finite) : 0;
  const qTop = Math.max(...qVals.map((c) => (c ? c.value : NaN)).filter(Number.isFinite), 0);
  const qLow = Math.min(...qVals.map((c) => (c ? c.value : NaN)).filter(Number.isFinite), 0);
  const W = 300;
  const x = (i: number) => 14 + (i + 0.5) * ((W - 28) / years.length);
  const yLine = (v: number) => 50 - ((v - low) / (top - low || 1)) * 40;
  const slot = (W - 28) / (years.length * 4);
  const zero = 118 - ((0 - qLow) / (qTop - qLow || 1)) * 52;
  const pts = fyVals.map((v, i) => (Number.isFinite(v) ? [x(i), yLine(v)] : null)).filter((pt): pt is number[] => !!pt);
  return (
    <svg className="fisc-chart" viewBox={`0 0 ${W} 122`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="14" x2={W - 14} y1="56" y2="56" stroke="#333" />
      {pts.length > 1 && <polyline points={pts.map((pt) => pt.join(',')).join(' ')} fill="none" stroke="#d9d9d9" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
      {fyVals.map((v, i) => (Number.isFinite(v) ? <circle key={i} cx={x(i)} cy={yLine(v)} r="2.2" fill={cells.FY[i]?.estimate ? '#9a9a9a' : '#fe9f11'} /> : null))}
      {qVals.map((c, i) => {
        if (!c) return null;
        const h = ((Math.abs(c.value) - 0) / (qTop - qLow || 1)) * 52;
        return <rect key={i} x={14 + i * slot + slot * 0.15} width={slot * 0.7} y={c.value >= 0 ? zero - h : zero} height={Math.max(1, h)} fill={c.estimate ? '#b8b8b8' : '#fe9f11'} />;
      })}
    </svg>
  );
}

/** FY and Q1 to Q4 by fiscal year under the chart, reported in amber and estimated in white. */
function FiscalTable({ grid, ccy, text }: { grid: ReturnType<typeof fiscalGrid>; ccy: string; text: (v: number) => string }) {
  return (
    <table className="tbl fisc-tbl">
      <thead>
        <tr>
          <th>({ccy})</th>
          {grid.years.map((y) => <th key={y} className="num">{y}</th>)}
        </tr>
      </thead>
      <tbody>
        {GRID_ROWS.map((r) => (
          <tr key={r}>
            <td className="amber">{r}</td>
            {grid.cells[r].map((c, i) => <td key={i} className={`num ${c ? (c.estimate ? 'white' : 'amber') : ''}`} title={c?.estimate ? 'Analysts\' estimate' : undefined}>{c ? text(c.value) : ''}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A segment box (8) Geo Seg, 9) Prod Seg): the latest fiscal year's revenue by line with its growth, from the 10-K. */
function SegmentBox({ n, title, link, sec, state, breakdown, fye }: { n: number; title: string; link: string; sec: SecurityDef; state: SegmentState | undefined; breakdown: 'geography' | 'product'; fye: number }) {
  const table = state?.state === 'ok' ? state.report.tables.find((t) => t.breakdown === breakdown && t.metric === 'revenue') : undefined;
  const latest = table?.periods[0];
  const first = table?.periods.at(-1);
  const span = table ? table.periods.length - 1 : 0;
  const lines = table && latest ? table.lines.filter((l) => !l.parent && Number.isFinite(l.values[latest.end])).sort((a, b) => b.values[latest.end] - a.values[latest.end]).slice(0, 5) : [];
  const max = Math.max(...lines.map((l) => l.values[latest!.end]), 1);
  const year = latest ? fiscalYearOf(Date.parse(`${latest.end}T00:00:00Z`), fye) : undefined;
  const why = !engine.realOnly ? 'Segments come from the company\'s latest 10-K, read by the desktop app' : state?.state === 'none' || state?.state === 'error' ? state.message : 'Loading the segments from the latest 10-K…';
  return (
    <Box n={n} title={title} fn="FINANCIALS SEG" link={link} sec={sec}>
      {lines.length && latest ? (
        <table className="tbl seg-tbl">
          <thead>
            <tr>
              <th />
              <th className="num">{year} Rev</th>
              <th className="num" title={`Compound annual growth over the ${span} years the 10-K reports`}>{span}Yr Gr</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v = l.values[latest.end];
              const base = first ? l.values[first.end] : NaN;
              const g = span > 0 && base > 0 && v > 0 ? ((v / base) ** (1 / span) - 1) * 100 : NaN;
              return (
                <tr key={l.member}>
                  <td className="amber ellipsis" style={{ maxWidth: 200 }}>{l.label}</td>
                  <td className="num seg-bar" style={{ ['--w' as string]: `${(v / max) * 100}%` }}>{revenueText(v / 1e6)}</td>
                  <td className="num">{Number.isFinite(g) ? `${fmtNum(g, 2)}%` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="pad-s muted">{why}</p>
      )}
    </Box>
  );
}

function RevenueEpsPage({ sec }: { sec: SecurityDef }) {
  const analysts = useAnalystSnapshot(sec);
  const eqDef = sec.eq!;
  const est = useAnalysts(analystsAvailable() && analystSymbol(sec) ? sec : undefined, ['estimates']);
  const estList = (est.estimates as AnalystPart<Estimate[]> | undefined)?.state === 'ok' ? (est.estimates as AnalystPart<Estimate[]>).data ?? [] : [];
  const segments = useSegments(sec, engine.realOnly);
  const mix = getRealFund(sec.id) ? [] : revenueMix(sec);
  const f = financials(sec);
  const ccy = reportCcy(sec);
  const years = f.annual.slice(-6);
  const quarters = f.quarterly.slice(-8);
  const hist = earningsHistory(sec).filter((x) => x.actual != null || x.revAct != null).slice(-8).reverse();
  const next = nextEarnings(sec);
  const estimate = useNextQuarterEstimate(sec);
  const fye = eqDef.fye || 12;
  const estYears = (get: (e: Estimate) => number) => estList.map((e) => ({ year: fiscalYearOf(Date.parse(`${e.date}T00:00:00Z`), fye), value: get(e) }));
  const revGrid = fiscalGrid(f.annual, f.quarterly, fye, (p) => p.rev, estYears((e) => e.revenueAvg / 1e6));
  const epsGrid = fiscalGrid(f.annual, f.quarterly, fye, (p) => p.eps, estYears((e) => e.epsAvg));
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
      {/* The terminal's page 4 (TE01 02:31): revenue and EPS by fiscal year and quarter, then the segments. */}
      <div className="des-grid des-grid-2">
        <Box n={6} title="Comparable Revenue" fn="EARNINGSTREND" sec={sec}>
          <FiscalChart {...revGrid} />
          <FiscalTable grid={revGrid} ccy={ccy} text={revenueText} />
        </Box>
        <Box n={7} title="Comparable Earnings Per Share" fn="EARNINGSTREND" sec={sec}>
          <FiscalChart {...epsGrid} />
          <FiscalTable grid={epsGrid} ccy={ccy} text={epsText} />
        </Box>
      </div>
      <div className="fisc-legend">(Fiscal Period: <span className="amber">Reported</span>, <span className="white">Estimated</span>)</div>
      <div className="des-grid des-grid-2">
        <SegmentBox n={8} title="Geo Seg" link="FA GEO" sec={sec} state={segments} breakdown="geography" fye={fye} />
        <SegmentBox n={9} title="Prod Seg" link="FA PROD" sec={sec} state={segments} breakdown="product" fye={fye} />
      </div>
      <div className="cols">
        <Section title="Next report">
          <KV items={[['Date', <NextEarnings key="d" sec={sec} ne={next} />], [estimate.label, lineValue(estimate)]]} />
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
      {/* The app's own boxes, moved from the profile page so that page matches the terminal's (brochure 2025 p.13). */}
      <div className="cols">
        <Box n={10} title="Analyst Ratings" fn="ANALYSTS" sec={sec}>
          <AnalystSummary sec={sec} snap={analysts} />
        </Box>
        <div>
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
    </>
  );
}

// ---------------------------------------------------------------- 5) ESG

/**
 * The ESG tab (brochure 2025 p.13 names it; the 2022 article's picture shows its scores): ESG scores are the
 * provider's own or other agencies' licensed data, which the app has no source for, so the page says so.
 */
function EsgPage({ sec }: { sec: SecurityDef }) {
  const why = 'ESG scores are licensed data of the provider and of rating agencies; none of the app\'s sources gives them';
  return (
    <div className="cols">
      <Section title="ESG Scores">
        <KV items={['ESG Disclosure Score', 'Environmental', 'Social', 'Governance'].map((k) => [k, <span key={k} className="muted" title={why}>--</span>] as [string, ReactNode])} />
        <div className="note muted">{why}. The company publishes its own sustainability reports; FILINGS lists its filings{sec.country === 'US' ? ' with the SEC' : ''}.</div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- 6) Industry Info

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
    () => group.map((d) => {
      const k = keyStats(d);
      return { d, mcap: marketCapUsd(d.id), pe: k.pe, eps: k.epsLtm, ytd: periodChange(d.id, 'YTD'), same: d.eq?.industry === eq.industry };
    }),
    [group, tick, loaded], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <>
      <Section title="Classification">
        <KV items={[['Sector', eq.sector || '--'], ['Industry', eq.industry || '--'], ['Primary exchange', sec.exch ?? '--']]} />
      </Section>
      <Section
        title="Peers"
        right={desktopData() ? (found?.group ? `${group.length - 1} peers · ${found.group.sources.join(', ') || 'no source answered'} · PEERS compares them` : found?.state === 'error' ? found.message : 'Finding peers…') : 'the built-in list; PEERS compares them'}
      >
        <DataTable
          rows={rows}
          rowKey={(r) => r.d.id}
          columns={[
            { key: 't', label: 'Ticker', render: (r) => <SecLink id={r.d.id}>{r.d.id.replace(/ Equity$/, '')}</SecLink> },
            { key: 'n', label: 'Name', render: (r) => (r.d.id === sec.id ? <span className="amber">{r.d.name}</span> : r.d.name) },
            { key: 'i', label: 'Industry', render: (r) => <span className={r.same ? '' : 'muted'}>{r.d.eq?.industry ?? '--'}</span> },
            { key: 'l', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
            { key: 'm', label: 'Mkt cap USD', num: true, render: (r) => <CapLink id={r.d.id}>{fmtBig(r.mcap)}</CapLink>, sort: (r) => r.mcap },
            { key: 'p', label: 'P/E', num: true, render: (r) => (Number.isFinite(r.pe) ? fmtNum(r.pe, 1) : peText(r.pe, r.eps)), sort: (r) => r.pe },
            { key: 'y', label: '%YTD', num: true, render: (r) => (Number.isFinite(r.ytd) ? <Chg v={r.ytd} pct /> : ''), sort: (r) => r.ytd },
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
      return <EsgPage sec={sec} />;
    case 6:
      return <IndustryPage sec={sec} />;
    default:
      return <ProfilePage sec={sec} />;
  }
}
