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
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';
import { useFigiListings } from '../data/live/related';
import { loadInsiders, summarize } from '../data/live/insiders';
import { wantShares } from '../data/live/shares';
import { usePeers } from '../data/live/peers';
import { engine, useQuote, useTick } from '../data/market';
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
export function Box({ n, title, fn, sec, right, children }: { n?: number; title: string; fn?: string; sec: SecurityDef; right?: ReactNode; children: ReactNode }) {
  const panel = usePanelId();
  const name = useFnName();
  const head = (
    <>
      {n != null && <b className="des-n">{n})</b>} {title}
      {fn && <span className="des-fn"> | {name(fn)} »</span>}
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
  const analysts = useAnalystSnapshot(sec);
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
  const mix = real ? [] : revenueMix(sec);
  const hs = holders(sec).filter((x) => x.type !== 'Fund').slice(0, 3);
  // The boxes take the numbers the terminal's description page gives them; a number typed with GO opens the box.
  const items: MenuItem[] = useMemo(() => {
    const go = (fn: string) => () => execute(panel, `${sec.id} ${fn}`);
    const list: MenuItem[] = [
      { n: 8, label: 'Price Chart', run: go('CHART') },
      { n: 9, label: 'Estimates', run: go('EARNINGSSUMMARY') },
      { n: 10, label: 'Analyst Ratings', run: go('ANALYSTS') },
      { n: 12, label: 'Dividend', run: go('DIVIDENDS') },
      { n: 15, label: 'Management', run: go('MANAGEMENT') },
      { n: 19, label: '12M Total Return', run: go('TOTALRETURN') },
      { n: 20, label: 'Beta', run: go('BETA') },
      { n: 21, label: 'Ownership', run: go('HOLDERS') },
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
              [`Mkt Cap (${ks.tradeCcy})`, <MarketValue key="mc" sec={sec}><CapLink id={sec.id}>{inMillions(ks.mcap)}</CapLink></MarketValue>],
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
          <Box n={10} title="Analyst Ratings" fn="ANALYSTS" sec={sec}>
            <AnalystSummary sec={sec} snap={analysts} />
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
              <KV items={[['Empls', eq.emp > 0 ? fmtInt(eq.emp) : '--'], ['Fiscal Year End', MONTHS[eq.fye - 1] ?? '--'], ['Exchange', sec.exch ?? '--']]} />
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
          <dl className="kv des-links">
            <dt>
              <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} TOTALRETURN`)}>
                <b className="des-n">19)</b> 12M Tot Ret
              </button>
            </dt>
            <dd title="The price change with the dividends reinvested on their ex-dates, from the close a year before the latest session">
              <Chg v={totRet} pct />
            </dd>
            <dt>
              <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} BETA`)}>
                <b className="des-n">20)</b> {beta.label}
              </button>
            </dt>
            <dd title={beta.title}>
              {fmtNum(beta.value, 2)}
              {beta.worked ? '*' : ''}
            </dd>
          </dl>
          <Box n={21} title="Ownership" fn="HOLDERS" sec={sec}>
            {real && !Number.isFinite(real.breakdown?.institutions) && !Number.isFinite(real.breakdown?.insiders) && !Number.isFinite(real.breakdown?.count) ? (
              <p className="pad-s muted">No ownership breakdown from the sources for this company; HOLDERS lists the holders they give.</p>
            ) : real ? (
              <KV
                items={[
                  ['Institutions', fmtPct(real.breakdown?.institutions, 2, false)],
                  ['Insiders', fmtPct(real.breakdown?.insiders, 2, false)],
                  ['Inst. holders', fmtInt(real.breakdown?.count)],
                ]}
              />
            ) : engine.realOnly ? (
              <p className="pad-s muted">{fundVersion.get().status[sec.id] === 'error' ? 'No ownership data from the sources for this company.' : 'Loading ownership…'}</p>
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
    </>
  );
}

/** The index a stock's beta is quoted against on the page, by listing country. */
const BETA_INDEX: Record<string, string> = { US: 'SPX', GB: 'UKX', DE: 'DAX', FR: 'CAC', JP: 'NKY', HK: 'HSI', CA: 'SPTSX', BE: 'BEL20', NL: 'AEX', CH: 'SMI', AU: 'AS51' };

/**
 * PROFILE's beta line. The source's beta (Yahoo's or Finnhub's, five years of monthly returns) is against the S&P 500:
 * Apple's 1.07 at Yahoo on 31 October 2026 against 1.09 worked out on the S&P 500. For a stock listed elsewhere it is
 * not against the home index (GSK: 0.28 at Yahoo, 0.95 on the FTSE 100), so there the line gives the beta BETA works
 * out against the home index, two years of weekly returns, adjusted, and names no index when that cannot be worked out.
 */
export function betaLine(country: string, sourceBeta: number, worked: () => number, bench: string, realOnly: boolean): { label: string; value: number; worked: boolean; title: string } {
  const source = "The source's beta, 5 years of monthly returns";
  if (!realOnly || (country === 'US' && Number.isFinite(sourceBeta))) {
    return { label: `Beta vs ${BETA_INDEX[country] ?? 'index'}`, value: sourceBeta, worked: false, title: `${source}; BETA works it out against the local index` };
  }
  const w = worked();
  if (Number.isFinite(w)) {
    const why = Number.isFinite(sourceBeta) ? `the source's beta (${fmtNum(sourceBeta, 2)}) is not measured against this index` : 'the sources give no beta for this company';
    return { label: `Beta vs ${bench}`, value: w, worked: true, title: `Worked out from two years of weekly returns against the ${bench} (adjusted beta), as on BETA: ${why}` };
  }
  if (Number.isFinite(sourceBeta)) {
    return { label: 'Beta', value: sourceBeta, worked: false, title: `${source}; the source does not name the index, and for a stock outside the US it is not the home index` };
  }
  return { label: `Beta vs ${bench}`, value: NaN, worked: false, title: 'No beta: the sources give none and the price history is too short to work one out' };
}

/** "12/26": the fiscal year an estimate is for, by its year-end month. */
function fyLabel(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
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
              [`Mkt cap (${ks.tradeCcy})`, <CapLink key="mc" id={sec.id}>{fmtMln(ks.mcap)}</CapLink>],
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
          <KV items={[['Last Px', <LivePx key="l" id={sec.id} />], ['P/E', n2(ks.pe)], ['12M Dvd Yld', p1(ks.divYld)], ['P/B', n2(ks.pb)], ['P/S', n2(ks.ps)], ['EV/T12M EBITDA', n2(ks.evEbitda)], [`Mkt Cap (${ks.tradeCcy})`, <CapLink key="mc" id={sec.id}>{fmtMln(ks.mcap)}</CapLink>], [`EV (${ks.ccy})`, fmtMln(ks.ev)]]} />
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
      return <IndustryPage sec={sec} />;
    default:
      return <ProfilePage sec={sec} />;
  }
}
