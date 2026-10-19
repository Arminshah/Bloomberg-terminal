import { engine } from '../market';
import type { SecurityDef } from '../types';
import {
  analystReply,
  dividendReply,
  ecoReply,
  filingsReply,
  managementReply,
  marketReply,
  moversReply,
  newsReply,
  newsSearchReply,
  nextEarningsReply,
  profileReply,
  quoteReply,
  resultsReply,
  statsReply,
  type Reply,
} from './answers';
import { ENGLISH, findLoaded, findSecurity, type Found } from './find';

/**
 * The help desk's built-in assistant: it works out what a question asks (an earnings date, whether a company beat,
 * its SEC filings, the analysts' view, news, a price...) and which security it is about, and answers from the app's
 * sources. A question that names no security is taken to be about the one asked about last.
 */

export type Intent =
  | 'greeting'
  | 'thanks'
  | 'help'
  | 'howto'
  | 'results'
  | 'filings'
  | 'earnings'
  | 'analysts'
  | 'dividend'
  | 'management'
  | 'stats'
  | 'profile'
  | 'news'
  | 'eco'
  | 'movers'
  | 'market'
  | 'price';

const RULES: [Intent, RegExp][] = [
  ['greeting', /^\s*(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b[\s!.,?]*(there)?[\s!.?]*$/i],
  ['thanks', /^\s*(thanks|thank you|thx|ty|cheers|great|perfect|ok|okay|cool)\b[\s!.,]*(a lot|so much|very much)?[\s!.]*$/i],
  ['help', /^\s*(help|\?|commands)\s*$|\bwhat (can|do) (you|i) (do|ask)\b|\bwhat are you\b/i],
  ['howto', /\bhow (do|can|should) (i|you|we)\b|\bhow to\b|\bwhere (can|do) i\b|\bwhich (function|screen|command)\b|\bis there a (function|screen|command)\b/i],
  ['results', /\b(beat|beats|beating|miss|missed|misses|surprised?|surprises|exceed(ed|s)?|fell short|better than expected|worse than expected|top(ped)? (the )?(estimates?|expectations?|consensus))\b|\bhow (did|were|was)\b.*\b(earnings|results|quarter|report)\b|\b(last|latest|recent|previous|most recent) (earnings|results|quarter(ly)? (results|report)|report)\b/i],
  ['filings', /\b(sec|edgar|filings?|filed|files|10-?k|10-?q|8-?k|20-?f|6-?k|40-?f|proxy|def ?14a|form (3|4|5|144)|13[dg]|s-1|s-3|prospectus)\b/i],
  ['news', /\b(news|headlines?|stories|story|articles?|press releases?|what('s| is) (going on|happening|new)|why (is|are|did|has|was)\b.*\b(up|down|fall(ing|en)?|fell|ris(e|ing|en)|rose|drop(ping|ped)?|jump(ing|ed)?|sink(ing)?|sank|soar(ing|ed)?|crash(ing|ed)?|mov(e|ing|ed)|rall(y|ying|ied)|tank(ing|ed)?|plung(e|ing|ed)|surg(e|ing|ed)))\b|\bbreaking\b/i],
  ['earnings', /\b(earnings?|reports?|reporting|results|eps)\b/i],
  ['analysts', /\b(analysts?|consensus|price targets?|target price|targets?|ratings?|rated|upgrades?|upgraded|downgrades?|downgraded|recommendations?|buy or sell|should i (buy|sell)|overweight|underweight|outperform)\b/i],
  ['dividend', /\b(dividends?|payout|ex-?div(idend)?|ex[- ]date|distributions?)\b/i],
  ['management', /\b(ceo|cfo|coo|cto|chair(man|woman|person)?|management|executives?|officers?|who (runs|leads|is in charge of)|founders?)\b/i],
  ['stats', /\b(p\/?e|pe ratio|valuation|valued|multiples?|ev\/?ebitda|market (cap|value)|marketcap|mcap|price to (book|sales)|margins?|growth|beta|cheap|expensive|overvalued|undervalued|fundamentals|key stats)\b/i],
  ['profile', /\bwhat (does|do) .+ do\b|\b(about|business|profile|description|describe|sector|industry|employees|headquarter(s|ed)?|based|founded)\b/i],
  ['eco', /\b(eco(nomic)? (calendar|data|releases?)|economic|releases|payrolls|nfp|cpi|ppi|pce|fomc meeting|gdp|inflation data|data this week)\b|^\s*eco\s*$/i],
  ['movers', /\b(movers|gainers|losers|biggest (gains?|falls?|losers?|gainers?|movers?)|top (gainers|losers)|best performing|worst performing)\b/i],
  ['market', /\b(how('s| is| are) (the )?(market|markets|stocks)|the markets?\b(?! (cap|value))|stocks today|indices|wall street)\b/i],
  ['price', /\b(price|quote|trading|trades|px|worth|how much|cost|level|doing|up|down)\b/i],
];

export function intentOf(text: string): Intent | null {
  for (const [intent, re] of RULES) if (re.test(text)) return intent;
  return null;
}

/** Intents that need a security; the others answer about the market or the app. */
const NEEDS_SECURITY = new Set<Intent>(['results', 'filings', 'earnings', 'analysts', 'dividend', 'management', 'stats', 'profile', 'price']);

const EXAMPLES = [
  'when does NVDA report next?',
  'did AAPL beat its earnings?',
  'SEC filings for TSLA',
  'analyst consensus for MSFT',
  'news on AMD',
  'who is the CEO of NFLX?',
  'how do I set an alert?',
];

/** The last security each conversation asked about, for "and when do they report?". */
const context = new Map<string, string>();

function firstSentence(text: string): string {
  const m = /^(.{20,200}?[.;:])(\s|$)/.exec(text);
  return m ? m[1].replace(/[;:]$/, '.') : text.slice(0, 200);
}

/** The screens a question asks for, by their names, descriptions and codes. */
export async function functionsReply(text: string, def?: SecurityDef): Promise<Reply | null> {
  const { FUNCTIONS, exampleCommand } = await import('../../terminal/registry');
  const words = (text.toLowerCase().match(/[a-z0-9&]+/g) ?? []).filter((w) => w.length > 2 && !ENGLISH.has(w));
  if (!words.length) return null;
  const scored = FUNCTIONS.map((fn) => {
    const name = fn.name.toLowerCase();
    const desc = fn.desc.toLowerCase();
    const codes = [fn.code, ...(fn.aliases ?? [])].map((c) => c.toLowerCase());
    let score = 0;
    for (const w of words) {
      const stem = w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, '') : w;
      const at = new RegExp(`\\b${stem.replace(/[^a-z0-9]/g, '')}`);
      if (codes.includes(w)) score += 5;
      else if (at.test(name)) score += 3;
      else if (at.test(desc)) score += 1;
    }
    return { fn, score };
  })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!scored.length) return null;
  return {
    text: scored.map(({ fn }) => `${fn.name} (${fn.code}): ${firstSentence(fn.desc)}`).join('\n'),
    commands: scored.map(({ fn }) => ({ label: fn.name, command: exampleCommand(fn, def) })),
  };
}

const unknown = (): Reply => ({
  text: `I couldn't tell what you're asking. I answer questions about a security or the market from the app's sources, for example:\n${EXAMPLES.map((e) => `• ${e}`).join('\n')}`,
});

async function about(intent: Intent, def: SecurityDef, text: string): Promise<Reply> {
  switch (intent) {
    case 'results':
      return resultsReply(def);
    case 'filings':
      return filingsReply(def, text);
    case 'earnings':
      return nextEarningsReply(def);
    case 'analysts':
      return analystReply(def);
    case 'dividend':
      return def.eq ? dividendReply(def) : quoteReply(def);
    case 'management':
      return managementReply(def);
    case 'stats':
      return statsReply(def);
    case 'profile':
      return profileReply(def);
    case 'news':
      return newsReply(def);
    default:
      return quoteReply(def);
  }
}

/** The words a news question searches for once the question's own words are taken out: "news FOMC" → "FOMC". */
function searchWords(text: string): string {
  return text
    .replace(/\b(news|headlines?|stories|story|articles?|latest|recent|breaking|any|on|about|for|regarding|the|what('s| is)|is there|are there|give me|show me|tell me|please)\b/gi, ' ')
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Answers one message in a conversation (`room` keeps the security asked about last). */
export async function localReply(text: string, room = 'helpdesk'): Promise<Reply> {
  const t = text.trim();
  if (!t) return { text: '' };
  const intent = intentOf(t);
  if (intent === 'greeting') return { text: `Hi. Ask me about any stock or the market, for example:\n${EXAMPLES.slice(0, 4).map((e) => `• ${e}`).join('\n')}` };
  if (intent === 'thanks') return { text: 'You\'re welcome.' };
  if (intent === 'help') return { text: `I answer from the app's sources: prices, earnings dates and results, SEC filings, analyst ratings and targets, news, company profiles, executives, dividends, valuation, the economic calendar and the day's movers. I can also point you to the right screen. Try:\n${EXAMPLES.map((e) => `• ${e}`).join('\n')}` };
  if (intent === 'eco') return ecoReply();
  if (intent === 'movers') return moversReply();
  if (intent === 'market') return marketReply();

  const remembered = context.get(room);
  if (intent === 'howto') return (await functionsReply(t, findLoaded(t) ?? (remembered ? engine.get(remembered) : undefined))) ?? unknown();
  const found: Found = await findSecurity(t);
  const def = found.def ?? (remembered ? engine.get(remembered) : undefined);
  if (found.def) context.set(room, found.def.id);

  if (intent === 'news') {
    if (found.def) return newsReply(found.def);
    const words = searchWords(t);
    if (words && !/^(it|them|they|this|that|the company|the stock)$/i.test(words) && words.length >= 2) return newsSearchReply(words);
    return newsReply(def);
  }
  if (!intent) {
    if (found.def) return /^\s*(what|who)('s| is| are)\b/i.test(t) && found.def.eq ? profileReply(found.def) : quoteReply(found.def);
    if (found.tried) return { text: `I couldn't find ${found.tried}: ${found.problem}.` };
    return (await functionsReply(t, def)) ?? unknown();
  }
  if (NEEDS_SECURITY.has(intent)) {
    if (!def) {
      if (found.tried) return { text: `I couldn't find ${found.tried}: ${found.problem}.` };
      return { text: 'Which security? Name it by ticker or company name, for example "when does NVDA report next?".' };
    }
    return about(intent, def, t);
  }
  return unknown();
}
