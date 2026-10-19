import { engine } from '../market';
import { resolveSecurity, searchSecurities } from '../registry';
import { lookupSecurity, normalizeTicker, searchOnline } from '../live/lookup';
import type { SecurityDef, YellowKey } from '../types';

/**
 * Finds the security a question is about: "when are the next earnings for NBIS", "did $APLD beat",
 * "news on bank of america", "ABI BB analysts". A ticker typed in capitals counts first, then any other word the
 * app knows as a ticker or name; a ticker or company name the app has not loaded yet is looked up online (desktop
 * app).
 */

/** Everyday English words: never a security, and no help in finding a screen. */
export const ENGLISH = new Set(
  `a about above after again against all am an and any are as at be been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your
  tell show give get find look see let lets please thanks thank ok okay hi hello hey yes yeah also much many want need know way use using`.split(/\s+/).filter(Boolean),
);

/** Words that are never a security in a question, however they are typed. */
const WORDS = new Set([
  ...ENGLISH,
  ...`next last latest recent previous upcoming new today tomorrow yesterday week month year quarter quarters annual quarterly date dates time day
  earnings earning report reports reported reporting result results eps revenue revenues sales profit profits income guidance call beat beats miss missed misses surprise expected expectations estimate estimates consensus forecast
  sec edgar filing filings file files filed form forms document documents proxy 10k 10q 8k 20f 6k
  analyst analysts rating ratings target targets price prices upgrade upgrades downgrade downgrades recommendation recommendations buy sell hold
  news headline headlines story stories article articles happening going moving move moved happened
  quote trading trade worth cost value valuation cap market markets stock stocks share shares company companies firm ticker symbol
  dividend dividends yield payout ex management ceo cfo chief executive executives officer officers board pay salary compensation run runs
  profile business description sector industry employees headquarters founded make makes sells
  ratio pe multiple beta margin margins key stats statistics fundamentals debt cash free flow growth
  chart graph plot open close high low volume best worst think opinion bullish bearish
  breaking movers gainers losers eco economic calendar releases data function functions screen screens command commands
  security securities instrument good bad big small biggest largest smallest top bottom right wrong sure ever still already`.split(/\s+/).filter(Boolean),
]);

/** Capitalised words that are abbreviations in a question, not tickers. */
const ABBREVIATIONS = new Set(['SEC', 'EPS', 'CEO', 'CFO', 'COO', 'CTO', 'IPO', 'ETF', 'USA', 'US', 'UK', 'EU', 'GDP', 'CPI', 'PPI', 'PCE', 'FOMC', 'ECB', 'BOE', 'BOJ', 'FED', 'YTD', 'QTD', 'MTD', 'PE', 'EV', 'EBITDA', 'FCF', 'ROE', 'ROA', 'TTM', 'LTM', 'FY', 'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'OK', 'I', 'A', 'AM', 'PM', 'UTC', 'EST', 'CET', 'API', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NEWS', 'HELP', 'PX', 'DES']);

const tokenize = (text: string) => text.match(/\$?[\p{L}\p{N}][\p{L}\p{N}&'.\-/]*/gu)?.map((w) => w.replace(/[.'’]+$/, '')) ?? [];
const isCaps = (w: string) => /^\$?[A-Z][A-Z0-9]*([./-][A-Z]{1,2})?$/.test(w) && /[A-Z]{2,}|^\$/.test(w);

export interface Candidate {
  word: string;
  /** Typed as a ticker: a cashtag or in capitals. */
  ticker: boolean;
}

/** The words of a question that may name a security, most likely first. */
export function candidates(text: string): Candidate[] {
  const words = tokenize(text);
  // A question typed all in capitals says nothing by its case.
  const shouting = words.length > 2 && words.every((w) => !/[a-z]/.test(w));
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (word: string, ticker: boolean) => {
    const key = word.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ word, ticker });
  };
  for (const w of words) if (w.startsWith('$') && w.length > 1) add(w.slice(1), true);
  if (!shouting) for (const w of words) if (isCaps(w) && !ABBREVIATIONS.has(w.replace(/^\$/, ''))) add(w.replace(/^\$/, ''), true);
  for (const w of words) {
    const bare = w.replace(/^\$/, '');
    if (bare.length < 2 && !/^[A-Z]$/.test(bare)) continue;
    if (WORDS.has(bare.toLowerCase()) || ABBREVIATIONS.has(bare.toUpperCase())) continue;
    add(bare, shouting && /^[A-Z0-9./-]{1,6}$/.test(bare));
  }
  return out;
}

/** "ABI BB", "VOD LN Equity", "EURUSD Curncy": a security written the terminal's way. */
function terminalForm(text: string): SecurityDef | undefined {
  const re = /\b([A-Z0-9]{1,8}(?:[./][A-Z]{1,2})?)\s+([A-Z]{2})(?:\s+(Equity|Index|Curncy|Comdty|Corp|Govt))?\b/gi;
  for (const m of text.matchAll(re)) {
    if (WORDS.has(m[1].toLowerCase()) || WORDS.has(m[2].toLowerCase())) continue;
    const hit = resolveSecurity(m[0]) ?? (m[3] ? undefined : engine.get(`${m[1].toUpperCase()} ${m[2].toUpperCase()} Equity`));
    if (hit) return hit;
  }
  for (const m of text.matchAll(/\b([A-Z0-9]{2,12}\d?)\s+(Index|Curncy|Comdty)\b/gi)) {
    const yk = (m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) as YellowKey;
    const hit = resolveSecurity(m[1], yk) ?? engine.get(`${m[1].toUpperCase()} ${yk}`);
    if (hit) return hit;
  }
  return undefined;
}

/** Two to four words in a row that start a security's name: "bank of america", "s&p 500", "anheuser busch". */
function byName(text: string): SecurityDef | undefined {
  const words = tokenize(text).map((w) => w.replace(/^\$/, ''));
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const part = words.slice(i, i + n);
      if (WORDS.has(part[0].toLowerCase()) || WORDS.has(part[n - 1].toLowerCase())) continue;
      const phrase = part.join(' ');
      if (phrase.length < 3) continue;
      // A name that starts with the words, or an alias equal to them (gold, bitcoin, euro).
      const hit = searchSecurities(phrase, 1)[0];
      if (hit && hit.score >= 54) return hit.def;
    }
  }
  return undefined;
}

/** The security a question names among those the app has loaded, without asking any source. */
export function findLoaded(text: string): SecurityDef | undefined {
  const typed = terminalForm(text);
  if (typed) return typed;
  for (const c of candidates(text)) {
    const hit = resolveSecurity(c.word);
    if (hit && (c.ticker || c.word.length >= 3 || hit.ticker.split(' ')[0] === c.word.toUpperCase())) return hit;
  }
  return byName(text);
}

const JOINERS = new Set(['of', 'and', '&', 'the', 'de', 'la']);

/** Runs of words that are not question words, longest first: the likely company names in a question. */
export function namePhrases(text: string): string[] {
  const runs: string[][] = [[]];
  for (const w of tokenize(text).map((x) => x.replace(/^\$/, ''))) {
    const run = runs[runs.length - 1];
    if (run.length && JOINERS.has(w.toLowerCase())) run.push(w);
    else if (WORDS.has(w.toLowerCase()) || ABBREVIATIONS.has(w) || /^\d+$/.test(w)) {
      if (run.length) runs.push([]);
    } else run.push(w);
  }
  return runs
    .map((r) => {
      while (r.length && JOINERS.has(r[r.length - 1].toLowerCase())) r.pop();
      return r.join(' ');
    })
    .filter((p) => p.length >= 3)
    .sort((a, b) => b.length - a.length);
}

/** The security found, or the ticker that was looked up without success and why. */
export interface Found {
  def?: SecurityDef;
  tried?: string;
  problem?: string;
}

/**
 * The security a question names: one the app has loaded, else the first word typed as a ticker looked up online
 * (any US stock, or a European listing, in the desktop app).
 */
export async function findSecurity(text: string): Promise<Found> {
  const loaded = findLoaded(text);
  if (loaded) return { def: loaded };
  let first: Found | undefined;
  for (const c of candidates(text).filter((x) => x.ticker && normalizeTicker(x.word)).slice(0, 2)) {
    const r = await lookupSecurity(c.word);
    if (r.ok) return { def: r.def };
    first ??= { tried: c.word.toUpperCase(), problem: r.reason };
  }
  // A company named in words: the online search's first stock whose name has the phrase's first word.
  for (const phrase of namePhrases(text).slice(0, 2)) {
    const hits = await searchOnline(phrase).catch(() => []);
    const lead = phrase.split(' ')[0].toLowerCase();
    const hit = hits.find((h) => h.name.toLowerCase().startsWith(lead)) ?? hits.find((h) => h.name.toLowerCase().split(/[\s,.()-]+/).includes(lead));
    if (!hit) continue;
    const r = await lookupSecurity(hit.symbol);
    if (r.ok) return { def: r.def };
  }
  return first ?? {};
}
