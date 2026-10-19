import { fmtBig, fmtBp, fmtMln, fmtNum, fmtPct } from '../../core/format';
import { waitFor } from '../../core/store';
import { DAY_MS } from '../calendar';
import { marketCap, periodChange } from '../analytics';
import { ecoEvents } from '../eco';
import { freshnessOf } from '../freshness';
import { dividends, earningsHistory, earningsReaction, keyStats, nextEarnings, reportCcy, reportSessionDay, type EarningsEvent, type EarningsReaction } from '../fundamentals';
import { engine } from '../market';
import { news } from '../news';
import { CLASS_LABEL } from '../registry';
import { analystsAvailable, analystSymbol, requestAnalysts, type AnalystPart, type RatingAction, type RatingTally, type TargetConsensus } from '../live/analysts';
import { ratingsLine, targetLine } from '../live/analyst-snapshot';
import { growth, growthSeries, loadConsensus, surprisePct, type Expectation } from '../live/consensus';
import { BREAKING_SOURCES, loadNews, MARKET_SOURCES, marketNews, mergeStories, newsAvailable, officialStories, refreshBreaking, SEARCHABLE, storiesFor, type MarketStory } from '../live/marketnews';
import { refreshSecuritiesNews, securityNews, type NewsReach } from '../live/secnews';
import { EIGHT_K_ITEMS, filingLinks, formGroup, loadFiler, resolveFiler, secAvailable, secTicker, type Filing } from '../live/sec';
import { fundVersion, getRealFund, requestFundamentals } from '../live/yfund';
import type { SecurityDef } from '../types';

/**
 * The help desk's answers, from the same sources the screens read: each says where its figures come from and offers
 * the screen that shows more. The built-in assistant answers with them directly; Claude, when switched on, calls
 * them as tools.
 */

export interface Reply {
  text: string;
  /** Screens that show more, as terminal commands ("APLD US Equity FILINGS"). */
  commands?: { label: string; command: string }[];
  links?: { label: string; url: string }[];
}

const cmd = (def: SecurityDef | undefined, fn: string, label: string) => ({ label, command: def ? `${def.id} ${fn}` : fn });
const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);
const name = (def: SecurityDef) => `${def.name} (${def.ticker.split(' ')[0]})`;

/** "Thu, Oct 30, 2026": the day a report or filing belongs to, in UTC unless the exchange's time zone is given. */
export function longDay(ms: number, tz?: string): string {
  const day = tz ? reportSessionDay(ms, tz) * DAY_MS : ms;
  return new Date(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (iso: string) => longDay(Date.parse(`${iso}T00:00:00Z`));

/** "3 min ago", "5 h ago", "2 days ago". */
export function ago(ms: number): string {
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 2 * DAY_MS) return `${Math.round(ms / 3_600_000)} h ago`;
  return `${Math.round(ms / DAY_MS)} days ago`;
}

/** Loads a company's fundamentals (Yahoo, else Finnhub) and resolves once they have arrived or failed. */
async function fundamentals(def: SecurityDef) {
  requestFundamentals(def, true);
  await waitFor(fundVersion, () => (fundVersion.get().status[def.id] === 'loading' ? undefined : true), 15_000);
  return getRealFund(def.id);
}

const notCompany = (def: SecurityDef, what: string): Reply => ({ text: `${def.name} is ${/^[aeiou]/i.test(CLASS_LABEL[def.cls]) ? 'an' : 'a'} ${CLASS_LABEL[def.cls].toLowerCase()}, not a company: ${what} apply to companies.` });

// ------------------------------------------------------------------ quotes

/** A security's last price and change against a confirmed previous close, with the source and how fresh it is. */
export function quoteLine(id: string): string {
  const d = engine.get(id);
  const q = engine.quote(id);
  if (!d || !q) return '';
  if (!Number.isFinite(q.last)) return `No price for ${d.ticker} from the source yet.`;
  const confirmed = Number.isFinite(q.chg) && q.chgCheck !== 'unverified';
  const f = freshnessOf(q, d, Date.now());
  const from = [q.provider, f?.label].filter(Boolean).join(', ');
  const tail = from ? ` · ${from}` : '';
  if (d.quote === 'yield') return `${d.ticker} ${fmtNum(q.last, 3)}%${confirmed ? ` (${fmtBp(q.chg)}bp)` : ''}${tail}`;
  return `${d.ticker} ${fmtNum(q.last, d.dec)}${confirmed ? ` ${fmtPct(q.pct)}` : ' (change not confirmed yet)'}${q.volume ? ` vol ${fmtBig(q.volume)}` : ''}${tail}`;
}

export function quoteReply(def: SecurityDef): Reply {
  const q = engine.quote(def.id);
  const parts = [quoteLine(def.id) || `No price for ${def.ticker} yet.`];
  if (q && ok(q.low) && ok(q.high) && q.high > 0 && def.quote !== 'yield') parts.push(`Day range ${fmtNum(q.low, def.dec)} to ${fmtNum(q.high, def.dec)}.`);
  const ytd = periodChange(def.id, 'YTD');
  if (ok(ytd)) parts.push(`Year to date ${fmtPct(ytd, 1)}.`);
  const mcap = def.eq ? marketCap(def.id) : NaN;
  if (ok(mcap) && mcap > 0) parts.push(`Market value ${fmtBig(mcap)} ${def.ccy === 'GBp' ? 'GBP' : def.ccy}.`);
  return { text: `${def.name}: ${parts.join(' ')}`, commands: [cmd(def, 'QUOTE', 'Quote'), cmd(def, 'CHART', 'Chart')] };
}

const MARKET_IDS = ['SPX Index', 'NDX Index', 'INDU Index', 'RTY Index', 'VIX Index', 'SX5E Index', 'UKX Index', 'NKY Index', 'USGG10YR Index', 'DXY Curncy', 'EURUSD Curncy', 'XAU Curncy', 'CL1 Comdty', 'XBTUSD Curncy'];

export function marketReply(): Reply {
  const lines = MARKET_IDS.filter((id) => engine.get(id)).map(quoteLine).filter(Boolean);
  return { text: lines.length ? `Markets now:\n${lines.join('\n')}` : 'No market prices have arrived yet.', commands: [cmd(undefined, 'MARKET', 'World indices'), cmd(undefined, 'MOVERS', 'Movers')] };
}

export function moversReply(): Reply {
  // Only changes against a confirmed previous close count.
  const eq = engine.securities
    .filter((d) => d.cls === 'equity')
    .map((d) => ({ d, p: periodChange(d.id, '1D') }))
    .filter((x) => Number.isFinite(x.p))
    .sort((a, b) => b.p - a.p);
  if (eq.length < 6) return { text: 'Not enough confirmed day changes yet; try MOVERS in a moment.', commands: [cmd(undefined, 'MOVERS', 'Movers')] };
  const list = (xs: typeof eq) => xs.map((x) => `${x.d.ticker} ${fmtPct(x.p, 1)}`).join(', ');
  return { text: `Biggest gains among the stocks loaded: ${list(eq.slice(0, 3))}. Biggest falls: ${list(eq.slice(-3).reverse())}.`, commands: [cmd(undefined, 'MOVERS', 'Movers')] };
}

export function ecoReply(): Reply {
  const now = engine.now();
  const next = ecoEvents(now, now + 7 * DAY_MS, now).filter((e) => e.relevance >= 3).slice(0, 5);
  // FRED gives US release dates without times; those say the date only.
  const when = (e: (typeof next)[number]) => (e.date ? `${isoDay(e.date)}, time not published by the source` : `${new Date(e.time).toUTCString().slice(0, 22)} UTC`);
  return {
    text: next.length ? `Key releases in the next seven days:\n${next.map((e) => `${e.country} ${e.name}: ${when(e)}`).join('\n')}` : 'No major releases in the next seven days.',
    commands: [cmd(undefined, 'RELEASES', 'Economic calendar')],
  };
}

// --------------------------------------------------------------- earnings

const TIMING: Record<string, string> = { 'Bef-mkt': 'before the open', 'Aft-mkt': 'after the close' };
const BASIS: Record<EarningsReaction['basis'], string> = {
  'before-open': 'report-day close against the previous close',
  'after-close': 'next session against the report-day close',
  unknown: 'report-day close against the previous close',
  'no-session': 'first session after against the last one before',
};

const tzOf = (def: SecurityDef) => engine.quote(def.id)?.tz ?? (def.country === 'US' ? 'America/New_York' : undefined);

function lastReported(def: SecurityDef): EarningsEvent | undefined {
  return [...earningsHistory(def)].reverse().find((e) => e.actual != null || e.revAct != null);
}

function reportedLine(def: SecurityDef, e: EarningsEvent, ccy: string): string {
  const figures = [ok(e.actual) ? `diluted EPS of ${fmtNum(e.actual, 2)} ${ccy}` : '', ok(e.revAct) ? `revenue of ${fmtMln(e.revAct)} ${ccy}` : ''].filter(Boolean).join(' and ');
  return `${def.ticker.split(' ')[0]}'s last report${e.period ? ` (${e.period})` : ''}${e.dateUnknown ? '' : `, published ${longDay(e.date, tzOf(def))}`}, gave ${figures} (Yahoo Finance, from the statements).`;
}

/** The share price's move on a report, from the daily closes; empty while the closes are not in the history. */
function reactionLine(def: SecurityDef, e: EarningsEvent): string {
  if (e.dateUnknown) return '';
  const q = engine.quote(def.id);
  const lastFinal = q?.src === 'CLOSE' || q?.src === 'EOD' ? engine.today : engine.today - 1;
  const r = earningsReaction(engine.daily(def.id), reportSessionDay(e.date, tzOf(def)), e.timing, lastFinal);
  return ok(r.pct) ? `The shares moved ${fmtPct(r.pct, 1)} on the report (${BASIS[r.basis]}).` : '';
}

const pctText = (pct: number) => `${fmtNum(Math.abs(pct), Math.abs(pct) < 9.95 ? 1 : 0)}%`;

/** "beat by 1.7%" / "missed by 2.3%" / "in line with"; empty without both figures. */
function beatText(e: Expectation): string {
  const pct = surprisePct(e);
  if (!ok(pct)) return '';
  return Math.abs(pct) < 0.05 ? 'in line' : pct > 0 ? `beat by ${pctText(pct)}` : `missed by ${pctText(pct)}`;
}

const estRange = (e: Expectation, fmt: (v: number) => string) =>
  `${fmt(e.est)}${e.ccy ? ` ${e.ccy}` : ''}${ok(e.low) && ok(e.high) && e.low !== e.high ? ` (${fmt(e.low)} to ${fmt(e.high)}${ok(e.analysts) ? `, ${e.analysts} analysts` : ''})` : ok(e.analysts) ? ` (${e.analysts} analysts)` : ''}`;

export async function nextEarningsReply(def: SecurityDef): Promise<Reply> {
  if (!def.eq) return notCompany(def, 'earnings reports');
  const [, c] = await Promise.all([fundamentals(def), loadConsensus(def)]);
  const lines: string[] = [];
  const next = nextEarnings(def);
  const q = c.next;
  if (next && !next.dateUnknown) {
    lines.push(`${name(def)} reports next on ${longDay(next.date, tzOf(def))}${TIMING[next.timing] ? `, ${TIMING[next.timing]}` : ''}${next.approx ? ". The date is the source's estimate; the company has not confirmed it" : ''} (Yahoo Finance).`);
  } else if (q?.date) {
    lines.push(`${name(def)} reports next on ${longDay(q.date, tzOf(def))}${q.dateEstimated ? " (the source's estimate)" : ''} (${q.eps.estFrom ?? q.rev.estFrom ?? 'Finnhub'}).`);
  }
  if (q && (ok(q.eps.est) || ok(q.rev.est))) {
    const parts = [ok(q.eps.est) ? `EPS of ${estRange(q.eps, (v) => fmtNum(v, 2))}` : '', ok(q.rev.est) ? `revenue of ${estRange(q.rev, (v) => fmtBig(v))}` : ''].filter(Boolean);
    const ago = ok(q.eps.est) && ok(q.yearAgoEps) && q.yearAgoEps > 0 ? ` That is ${q.eps.est >= q.yearAgoEps ? 'up' : 'down'} ${pctText((q.eps.est / q.yearAgoEps - 1) * 100)} on the year's EPS of ${fmtNum(q.yearAgoEps, 2)}.` : '';
    lines.push(`Analysts expect ${parts.join(' and ')} for the quarter${ISO_DAY.test(q.end) ? ` ending ${isoDay(q.end)}` : ''} (${q.eps.estFrom ?? q.rev.estFrom}).${ago}`);
  }
  if (!lines.length) {
    lines.push(engine.realOnly && !getRealFund(def.id) ? `The sources gave no data for ${def.ticker} yet, so no next report date.` : `No source lists ${def.ticker}'s next report date yet: companies usually announce it two to four weeks ahead.`);
    if (c.problems.length) lines.push(c.problems.join(' '));
  }
  const last = c.past.find((x) => ok(x.eps.actual));
  const v = last ? beatText(last.eps) : '';
  if (last && v) lines.push(`Last quarter (${last.label}): EPS ${fmtNum(last.eps.actual, 2)} against ${fmtNum(last.eps.est, 2)} expected (${v}).`);
  else {
    const rep = lastReported(def);
    if (rep) lines.push(reportedLine(def, rep, reportCcy(def)));
  }
  return { text: lines.join(' '), commands: [cmd(def, 'EARNINGS', 'Earnings'), cmd(def, 'EVENTS', 'Events')] };
}

export async function resultsReply(def: SecurityDef): Promise<Reply> {
  if (!def.eq) return notCompany(def, 'earnings reports');
  const [fund, c] = await Promise.all([fundamentals(def), loadConsensus(def)]);
  const lines: string[] = [];
  const q = c.past.find((x) => ok(x.eps.actual) || ok(x.rev.actual));
  if (q) {
    const head = `${q.label} (quarter ended ${isoDay(q.end)}${q.date ? `, reported ${longDay(q.date, tzOf(def))}` : ''})`;
    const ve = beatText(q.eps);
    const vr = beatText(q.rev);
    const verdict = ve.startsWith('beat') && (!vr || vr.startsWith('beat')) ? 'Yes, it beat' : ve.startsWith('missed') && (!vr || vr.startsWith('missed')) ? 'No, it missed' : ve || vr ? 'Mixed' : '';
    const epsLine = ok(q.eps.actual)
      ? `EPS ${fmtNum(q.eps.actual, 2)}${q.eps.ccy ? ` ${q.eps.ccy}` : ''}${ok(q.eps.est) ? ` against ${fmtNum(q.eps.est, 2)} expected, ${ve}` : ', no estimate from the sources'} (${[q.eps.estFrom, q.eps.actualFrom].filter((x, i, a) => x && a.indexOf(x) === i).join(' / ')})`
      : '';
    const revLine = ok(q.rev.actual) ? `revenue ${fmtBig(q.rev.actual)}${q.rev.ccy ? ` ${q.rev.ccy}` : ''}${ok(q.rev.est) ? ` against ${fmtBig(q.rev.est)} expected, ${vr}` : ', no revenue estimate from the sources'} (${q.rev.actualFrom})` : ok(q.rev.est) ? `revenue estimate ${fmtBig(q.rev.est)}${q.rev.ccy ? ` ${q.rev.ccy}` : ''}, reported figure not in the sources yet` : '';
    lines.push(`${name(def)}: ${verdict ? `${verdict}. ` : ''}${head}: ${[epsLine, revLine].filter(Boolean).join('; ')}.`);
    const series = growthSeries(c, fund?.quarterly ?? [], { eps: q.eps.actualFrom, rev: q.rev.actualFrom });
    const ge = growth(q.end, series.eps);
    const gr = growth(q.end, series.rev);
    const g = [
      ok(ge.yoy) ? `EPS ${ge.yoy >= 0 ? 'up' : 'down'} ${pctText(ge.yoy)} on the year` : '',
      ok(gr.yoy) ? `revenue ${gr.yoy >= 0 ? 'up' : 'down'} ${pctText(gr.yoy)} on the year` : '',
      ok(ge.qoq) ? `EPS ${ge.qoq >= 0 ? 'up' : 'down'} ${pctText(ge.qoq)} on the quarter` : '',
      ok(gr.qoq) ? `revenue ${gr.qoq >= 0 ? 'up' : 'down'} ${pctText(gr.qoq)} on the quarter` : '',
    ].filter(Boolean);
    if (g.length) lines.push(`${g.join(', ')}.`.replace(/^./, (x) => x.toUpperCase()));
    const before = c.past.filter((x) => x !== q && ok(x.eps.actual) && ok(x.eps.est)).slice(0, 3).map((x) => `${x.label} ${beatText(x.eps)}`);
    if (before.length) lines.push(`EPS before that: ${before.join(', ')}.`);
  } else {
    lines.push(c.problems.length ? `No source compares ${def.ticker}'s reports with the analysts' estimates: ${c.problems.join(' ')}` : `No source compares ${def.ticker}'s reports with the analysts' estimates.`);
    const rep = lastReported(def);
    if (rep) lines.push(reportedLine(def, rep, reportCcy(def)));
  }
  const rep = lastReported(def);
  const move = rep ? reactionLine(def, rep) : '';
  if (move) lines.push(move);
  return { text: lines.join(' '), commands: [cmd(def, 'EARNINGS', 'Earnings'), cmd(def, 'ANALYSTS', 'Analysts')] };
}

// ---------------------------------------------------------------- filings

interface FormFilter {
  label: string;
  test: (form: string) => boolean;
}

/** The kind of filing a question asks for: annual reports, quarterly reports, 8-Ks, proxies, insiders' forms, offerings. */
export function formFilter(text: string): FormFilter | undefined {
  const t = text.toLowerCase();
  if (/\b10-?k\b|\bannual report|\b20-?f\b|\b40-?f\b/.test(t)) return { label: 'annual reports (10-K, 20-F, 40-F)', test: (f) => /^(10-K|20-F|40-F)/.test(f) };
  if (/\b10-?q\b|\bquarterly report/.test(t)) return { label: 'quarterly reports (10-Q)', test: (f) => /^10-Q/.test(f) };
  if (/\b8-?k\b|\b6-?k\b|current report|press release/.test(t)) return { label: 'current reports (8-K, 6-K)', test: (f) => formGroup(f) === 'current' };
  if (/\bproxy\b|def ?14a/.test(t)) return { label: 'proxy statements', test: (f) => formGroup(f) === 'proxy' };
  if (/\binsider|\bform 4\b|\bform 144\b|\b13[dg]\b/.test(t)) return { label: 'ownership filings (Forms 3, 4, 5, 144, 13D, 13G)', test: (f) => formGroup(f) === 'ownership' };
  if (/\bs-1\b|\bs-3\b|\boffering|\bprospectus|\b424b/.test(t)) return { label: 'offering documents', test: (f) => formGroup(f) === 'offering' };
  return undefined;
}

function filingLine(f: Filing): string {
  const items = (f.items ?? []).filter((i) => i !== '9.01').map((i) => EIGHT_K_ITEMS[i] ?? `item ${i}`);
  const about = items.length ? items.join('; ') : f.desc && f.desc.toUpperCase() !== f.form.toUpperCase() ? f.desc : '';
  return `${f.filed} ${f.form}${f.report ? ` for ${f.report}` : ''}${about ? `: ${about}` : ''}`;
}

export async function filingsReply(def: SecurityDef, text = '', max = 8): Promise<Reply> {
  const more = [cmd(def, 'FILINGS', 'Filings')];
  if (!secAvailable()) return { text: 'SEC filings are read by the desktop app: the SEC does not accept requests from web pages.' };
  const ticker = secTicker(def);
  if (!ticker) return { text: `${def.ticker} is not a US listing. SEC EDGAR holds the filings of companies that file with the SEC (US companies and foreign companies with US-registered shares).` };
  const filer = await resolveFiler(ticker);
  if (!filer.ok) return { text: filer.message, commands: more };
  const sub = await loadFiler(filer.data.cik);
  if (!sub.ok) return { text: sub.message, commands: more };
  const filter = formFilter(text);
  const list = sub.data.filings.filter((f) => !filter || filter.test(f.form)).slice(0, max);
  if (!list.length) return { text: `${sub.data.name} has no ${filter?.label ?? 'filings'} among its recent filings on EDGAR.`, commands: more };
  return {
    text: `${sub.data.name}'s latest ${filter?.label ?? 'filings'} on SEC EDGAR (CIK ${sub.data.cik}):\n${list.map(filingLine).join('\n')}`,
    commands: more,
    links: list.map((f) => ({ label: `${f.form} ${f.filed}`, url: filingLinks(sub.data.cik, f).doc ?? filingLinks(sub.data.cik, f).index })),
  };
}

// ---------------------------------------------------------------- analysts

const ACTION: Record<string, string> = { upgrade: 'upgraded', downgrade: 'downgraded', maintain: 'kept', initialize: 'started at', reiterate: 'reiterated', init: 'started at' };

export async function analystReply(def: SecurityDef): Promise<Reply> {
  if (!def.eq) return notCompany(def, 'analyst ratings');
  const more = [cmd(def, 'ANALYSTS', 'Analysts'), cmd(def, 'EARNINGS', 'Estimates')];
  if (!analystsAvailable()) return { text: 'Analyst research is read by the desktop app, from FMP, Finnhub and Yahoo Finance.', commands: more };
  if (!analystSymbol(def)) return { text: `Analyst research here covers US-listed stocks; ${def.ticker} is not one.`, commands: more };
  const parts = await requestAnalysts(def, ['consensus', 'ratings', 'grades']);
  const last = engine.quote(def.id)?.last ?? NaN;
  const lines: string[] = [];
  const t = targetLine(parts.consensus as AnalystPart<TargetConsensus | null> | undefined, last, def.ccy);
  const c = (parts.consensus as AnalystPart<TargetConsensus | null> | undefined)?.data;
  if (t.source) lines.push(`Average price target ${t.value}${c && ok(c.low) && ok(c.high) ? `, range ${fmtNum(c.low, 2)} to ${fmtNum(c.high, 2)}` : ''} (${t.source}).`);
  else lines.push(`Price target: ${t.missing ?? t.value}`);
  const ratings = parts.ratings as AnalystPart<RatingTally | null> | undefined;
  const r = ratingsLine(ratings);
  const tally = ratings?.data;
  if (r.source && tally) {
    const total = tally.strongBuy + tally.buy + tally.hold + tally.sell + tally.strongSell;
    lines.push(`Of ${total} analysts, ${tally.strongBuy + tally.buy} rate it buy, ${tally.hold} hold and ${tally.sell + tally.strongSell} sell${tally.consensus ? ` (consensus: ${tally.consensus})` : ''} (${r.source}).`);
  } else lines.push(`Ratings: ${r.missing ?? r.value}`);
  const grades = ((parts.grades as AnalystPart<RatingAction[]> | undefined)?.data ?? []).slice(0, 3);
  if (grades.length) lines.push(`Latest changes: ${grades.map((g) => `${g.date} ${g.firm} ${ACTION[g.action] ?? g.action} ${g.from && g.action !== 'initialize' ? `${g.from} to ` : ''}${g.to}`).join('; ')}.`);
  return { text: `${name(def)}: ${lines.join(' ')}`, commands: more };
}

// -------------------------------------------------------------------- news

/** One security's news: the sources that answer in seconds, sparing Massive's and Marketaux's small allowances. */
const REACH: NewsReach = { massive: false, marketaux: false, google: 2 };
const FUTURE = 5 * 60_000;

function storyLines(stories: MarketStory[], max: number): { text: string; links: Reply['links'] } {
  const now = Date.now();
  const top = stories.filter((s) => s.time <= now + FUTURE).slice(0, max);
  return {
    text: top.map((s) => `• ${s.title} (${s.publisher}, ${ago(now - s.time)})`).join('\n'),
    links: top.filter((s) => /^https?:\/\//.test(s.url)).map((s) => ({ label: s.title.length > 60 ? `${s.title.slice(0, 57)}…` : s.title, url: s.url })),
  };
}

export async function newsReply(def?: SecurityDef, max = 6): Promise<Reply> {
  if (!newsAvailable()) {
    // The browser build has only the official announcements.
    const stories = news.get().stories.filter((s) => !def || s.tickers.includes(def.id)).slice(0, max);
    if (!stories.length) return { text: def ? `No recent announcement mentions ${def.ticker}; company news is read by the desktop app.` : 'No recent announcements.' };
    return { text: stories.map((s) => `• ${s.headline.replace(/^\*/, '')} (${s.source})`).join('\n'), commands: [cmd(undefined, 'HEADLINES', 'Announcements')] };
  }
  if (def) {
    refreshSecuritiesNews([def], REACH, 1);
    const settled = () => {
      const r = securityNews(def, REACH);
      return r.states.every(([, s]) => s && s.state !== 'loading') ? r : undefined;
    };
    const r = (await waitFor(marketNews, settled, 8000)) ?? securityNews(def, REACH);
    if (!r.stories.length) {
      const said = r.states.filter(([, s]) => s && s.state !== 'ok' && s.message).map(([n, s]) => `${n}: ${s!.message}`);
      return { text: `No recent stories about ${def.ticker} from the sources.${said.length ? ` ${said.join('; ')}.` : ''}`, commands: [cmd(def, 'COMPANYNEWS', 'Company news')] };
    }
    const s = storyLines(r.stories, max);
    return { text: `Latest on ${name(def)}:\n${s.text}`, links: s.links, commands: [cmd(def, 'COMPANYNEWS', 'Company news')] };
  }
  refreshBreaking();
  const read = () => (storiesFor(BREAKING_SOURCES).length >= max ? true : undefined);
  await waitFor(marketNews, read, 6000);
  const stories = mergeStories([storiesFor(BREAKING_SOURCES), officialStories(news.get().stories)]);
  if (!stories.length) return { text: 'No market stories have arrived yet.', commands: [cmd(undefined, 'BREAKING', 'Breaking news')] };
  const s = storyLines(stories, max);
  return { text: `Latest market news:\n${s.text}`, links: s.links, commands: [cmd(undefined, 'BREAKING', 'Breaking news'), cmd(undefined, 'MARKETNEWS', 'Market news')] };
}

/** Stories that mention some words: the market news and announcements the app holds, and Google News's search. */
export async function newsSearchReply(words: string, max = 6): Promise<Reply> {
  const asked = words.trim().replace(/\s+/g, ' ');
  const more = [cmd(undefined, `NEWS ${asked}`, `NEWS ${asked}`)];
  const arg = SEARCHABLE.test(asked) ? `US:en|${asked}` : '';
  const key = `google-news-search:${arg}`;
  if (arg && newsAvailable()) {
    void loadNews('google-news-search', arg, 10 * 60_000);
    await waitFor(marketNews, () => (marketNews.get().feeds[key] && marketNews.get().feeds[key]!.state !== 'loading' ? true : undefined), 8000);
  }
  const list = asked.toLowerCase().replace(/"/g, ' ').split(/\s+/).filter(Boolean);
  const official = officialStories(news.get().stories);
  const local = mergeStories([storiesFor(MARKET_SOURCES), official]).filter((s) => list.every((w) => `${s.title} ${s.summary ?? ''} ${s.tickers.join(' ')}`.toLowerCase().includes(w)));
  const stories = mergeStories([local, arg ? (marketNews.get().lists[key] ?? []) : []]);
  if (!stories.length) return { text: `No recent story mentions "${asked}".`, commands: more };
  const s = storyLines(stories, max);
  return { text: `Latest stories on "${asked}":\n${s.text}`, links: s.links, commands: more };
}

// ----------------------------------------------------------------- company

function firstSentences(text: string, max = 420): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

export async function profileReply(def: SecurityDef): Promise<Reply> {
  if (def.eq) await fundamentals(def);
  const d = engine.get(def.id) ?? def;
  const more = [cmd(d, 'PROFILE', 'Profile')];
  if (!d.eq) return { text: `${d.name} (${d.ticker}): ${d.about ?? `${CLASS_LABEL[d.cls]}, quoted in ${d.ccy}.`}`, commands: more };
  const e = d.eq;
  const facts = [
    e.sector && e.industry ? `Sector ${e.sector}, industry ${e.industry}.` : e.sector ? `Sector ${e.sector}.` : '',
    e.hq ? `Headquarters: ${e.hq}.` : '',
    e.ceo ? `CEO: ${e.ceo}.` : '',
    e.emp > 0 ? `${fmtNum(e.emp, 0)} employees.` : '',
    e.founded ? `Founded ${e.founded}.` : '',
  ].filter(Boolean);
  const mcap = marketCap(d.id);
  if (ok(mcap) && mcap > 0) facts.push(`Market value ${fmtBig(mcap)} ${d.ccy === 'GBp' ? 'GBP' : d.ccy}.`);
  return { text: `${name(d)}${e.desc ? `: ${firstSentences(e.desc)}` : ''}\n${facts.join(' ')}`, commands: [...more, cmd(d, 'MANAGEMENT', 'Management')] };
}

export async function managementReply(def: SecurityDef): Promise<Reply> {
  if (!def.eq) return notCompany(def, 'executives');
  const fund = await fundamentals(def);
  const more = [cmd(def, 'MANAGEMENT', 'Management')];
  const officers = fund?.officers ?? [];
  if (!officers.length) return { text: def.eq.ceo ? `${name(def)}'s CEO is ${def.eq.ceo}. The source lists no other officers.` : `The sources list no officers for ${def.ticker}.`, commands: more };
  const list = officers.slice(0, 8).map((o) => `${o.name}, ${o.title}${ok(o.age) ? ` (${o.age})` : ''}`);
  return { text: `${name(def)}'s officers, as Yahoo Finance lists them:\n${list.join('\n')}`, commands: more };
}

const FREQ: Record<string, string> = { Annual: 'once a year', 'Semi-Anl': 'twice a year', Quarter: 'quarterly', Monthly: 'monthly' };

export async function dividendReply(def: SecurityDef): Promise<Reply> {
  if (!def.eq) return notCompany(def, 'dividends');
  const fund = await fundamentals(def);
  const more = [cmd(def, 'DIVIDENDS', 'Dividends')];
  const past = dividends(def).filter((x) => ok(x.ex) && ok(x.amount)).sort((a, b) => b.ex - a.ex);
  const ccy = def.ccy;
  if (!past.length && !fund?.nextDividend) return { text: `${name(def)} has paid no dividend in the source's history.`, commands: more };
  const lines: string[] = [];
  if (past[0]) lines.push(`Last dividend ${fmtNum(past[0].amount, 4)} ${ccy}, ex-date ${longDay(past[0].ex)}${FREQ[past[0].freq] ? `; it pays ${FREQ[past[0].freq]}` : ''}.`);
  const nd = fund?.nextDividend;
  if (nd && nd.ex > Date.now()) lines.push(`Next ex-date ${longDay(nd.ex)}${ok(nd.pay) && nd.pay > 0 ? `, payable ${longDay(nd.pay)}` : ''}.`);
  const y = def.eq ? keyStats(def).divYld : NaN;
  if (ok(y) && y > 0) lines.push(`Dividend yield ${fmtNum(y, 2)}%.`);
  return { text: `${name(def)}: ${lines.join(' ')}`, commands: more };
}

export async function statsReply(def: SecurityDef): Promise<Reply> {
  if (!def.eq) return quoteReply(def);
  await fundamentals(def);
  const s = keyStats(def);
  const x = (label: string, v: number, unit = '', dec = 1) => (ok(v) ? `${label} ${fmtNum(v, dec)}${unit}` : '');
  const parts = [
    ok(s.mcap) && s.mcap > 0 ? `Market value ${fmtMln(s.mcap)} ${s.tradeCcy}` : '',
    x('P/E', s.pe),
    x('EV/EBITDA', s.evEbitda),
    x('price/book', s.pb),
    x('price/sales', s.ps),
    x('EPS (last 12 months)', s.epsLtm, ` ${s.ccy}`, 2),
    x('revenue growth', s.revGrowth, '%'),
    x('net margin', s.netMargin, '%'),
    x('dividend yield', s.divYld, '%', 2),
    x('beta', s.beta, '', 2),
  ].filter(Boolean);
  return { text: parts.length ? `${name(def)}: ${parts.join(', ')}.` : `No statements for ${def.ticker} from the sources yet.`, commands: [cmd(def, 'FINANCIALS', 'Financials'), cmd(def, 'PROFILE', 'Profile')] };
}
