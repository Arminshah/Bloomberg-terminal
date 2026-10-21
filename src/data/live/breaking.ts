/**
 * Whether a company's story is breaking news: fresh, about the company itself, and reporting an event that moves its
 * shares. A headline that only mentions the company among others, asks a question, ranks stocks, previews a report
 * or gives an opinion is not, however recent.
 */

/** A breaking story was published within this long. */
export const BREAKING_MS = 2 * 3_600_000;

/** Events that move a stock, as headlines write them. */
const MATERIAL: RegExp[] = [
  // Results and guidance.
  /\b(reports?|reported|posts?|posted|delivers?)\b.{0,60}\b(results|earnings|revenue|sales|profit|loss|quarter)\b/i,
  /\b(q[1-4]|first[- ]quarter|second[- ]quarter|third[- ]quarter|fourth[- ]quarter|quarterly|annual)\b.{0,60}\b(results|earnings|revenue|sales|profit|loss)\b.{0,40}\b(beats?|miss(es|ed)?|tops?|topped|falls?|fell|rises?|rose|jumps?|surges?|soars?|drops?|declines?|grows?|grew|doubles?|records?)\b/i,
  /\b(beats?|beat|miss(es|ed)?|tops?|topped|surpass(es|ed)?|exceeds?|exceeded|falls? short of|lags?)\b.{0,40}\b(estimates|expectations|forecasts?|consensus|views?)\b/i,
  /\b(raises?|raised|lifts?|lifted|boosts?|boosted|cuts?|lowers?|lowered|slashes?|slashed|withdraws?|withdrew|suspends?|reaffirms?|reiterates?|hikes?|hiked)\b.{0,40}\b(guidance|outlook|forecast|full-year|dividend|payout|targets?)\b/i,
  // Analysts' actions.
  /\b(upgrades?|upgraded|downgrades?|downgraded|initiates?|initiated|starts? coverage|resumes? coverage)\b/i,
  /\bprice target\b.{0,30}\b(raised|lifted|boosted|cut|lowered|slashed|to \$)/i,
  /\b(raises?|lifts?|boosts?|cuts?|lowers?|slashes?)\b.{0,40}\bprice target\b/i,
  // Deals, contracts, approvals.
  /\b(acquires?|acquired|acquisition|merger|merges?|buyout|takeover|tender offer|to (acquire|buy|merge|sell))\b/i,
  /\b(signs?|signed|inks?|inked|wins?|won|awarded|secures?|secured|lands?|landed|announces?|unveils?|strikes?|struck|enters?|expands?)\b.{0,60}\b(deal|contract|agreement|lease|order|pact|partnership|tie-up|joint venture)\b/i,
  /\b(partners?|teams? up|joins? forces)\b.{0,30}\bto (develop|build|deploy|supply|launch|provide|create)\b/i,
  /\bto (develop|build|deploy)\b.{0,40}\b(data cent(er|re)s?|plant|factory|facility|campus|mw|gw)\b/i,
  /\b(fda|ema|regulators?|antitrust|ftc)\b.{0,40}\b(approv\w*|clear\w*|reject\w*|block\w*|grants?)\b|\b(approves?|approved|approval|clears?|cleared)\b.{0,40}\b(drug|therapy|treatment|device|vaccine|deal|merger)\b/i,
  // Capital and shares.
  /\b(stock offering|share offering|public offering|secondary offering|private placement|convertible (notes|bonds|senior notes)|notes offering|prices? .{0,20}offering|stock split|reverse split|buyback|repurchase)\b/i,
  // People, legal, distress, operations.
  /\b(ceo|cfo|coo|chief executive|chief financial|chairman|founder|president)\b.{0,40}\b(resigns?|resigned|steps? down|stepped down|departs?|exits?|ousted|fired|retires?|to retire|named|appointed|appoints?|replaced)\b/i,
  /\b(resigns?|resigned|steps? down|stepped down|ousted)\b/i,
  /\b(lawsuit|sues|sued|class action|probe|investigation|subpoena|indicted|charged|charges|settles?|settlement|fined|penalty)\b/i,
  /\b(bankruptcy|chapter 11|defaults?|delist(ed|ing)?|trading halt|halted|going concern|short seller|short report)\b/i,
  /\b(layoffs?|lays off|job cuts|cuts? \d[\d,]* jobs|restructuring|plant closure)\b/i,
  /\b(recall|recalls|data breach|cyberattack|hack(ed)?|outage|explosion|strike)\b/i,
  // A large move in the shares.
  /\b(shares?|stock)\b.{0,40}\b(soars?|soared|surges?|surged|jumps?|jumped|plunges?|plunged|tumbles?|tumbled|sinks?|sank|slumps?|slumped|skyrockets?|craters?|cratered|spikes?|spiked|crash(es|ed)?|rall(y|ies|ied)|climbs?|climbed|rockets?|nosedives?)\b/i,
  /\b(soars?|soared|surges?|surged|plunges?|plunged|tumbles?|tumbled|skyrockets?|craters?|cratered|nosedives?)\b/i,
];

/** Headlines that are not news about an event: questions, rankings, previews, opinions, round-ups. */
const NOT_NEWS: RegExp[] = [
  /\?\s*$/,
  /\b(should you|is it time|time to buy|buy now|buy or sell|to buy (now|today)|stocks? to (buy|watch|own)|worth (buying|a look)|best stocks?|top stocks?|millionaire|retire(ment)? (rich|portfolio)|could (soar|double|triple|quadruple)|going to (soar|double|triple|quadruple)|set to (soar|double)|my top|i('m| am) buying|i would buy)\b/i,
  /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(reasons|things|stocks|ways|signs|analysts|wall street analysts|growth stocks|ai stocks)\b/i,
  /\b(here are|here's|here is|what to know|what to expect|what to watch|preview|ahead of|earnings preview|options traders|implied move|unusual options|technical analysis|chart of the day)\b/i,
  /\b(research calls|analyst calls|top wall street|week in review|weekly recap|recap|roundup|round-up|morning brief|market wrap|biggest (movers|moves)|stocks making|midday movers|premarket movers|stocks moving)\b/i,
  /\b(to (report|host|present|participate|attend|announce)|will (report|host|present)|conference call|earnings call (date|schedule)|webcast|investor day on|to release .{0,30}results)\b/i,
];

const SUFFIX = /\b(incorporated|inc|corp|corporation|co|company|companies|holdings?|group|ltd|limited|plc|n\.?v|s\.?a|ag|se|lp|llc|trust|the|class [a-c]|common stock|ordinary shares|ads)\b\.?/gi;

/** The words a headline uses for a company: its name without the legal form ("Applied Digital"), and its ticker. */
export function companyWords(name: string, ticker: string): { name: string; first: string; ticker: string } {
  const clean = name.replace(/[,.()]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  // A distinctive first word stands for the company (Netflix, Nvidia); a common one (Applied, American, First) does not.
  const first = words[0] && words[0].length >= 4 && !GENERIC.has(words[0].toLowerCase()) ? words[0] : '';
  return { name: clean, first, ticker: ticker.split(/[ /]/)[0].toUpperCase() };
}

const GENERIC = new Set(['applied', 'american', 'first', 'general', 'united', 'national', 'international', 'global', 'digital', 'advanced', 'new', 'great', 'royal', 'southern', 'northern', 'western', 'eastern', 'central', 'pacific', 'atlantic', 'texas', 'bank', 'energy', 'capital', 'financial', 'health', 'medical', 'service', 'services', 'systems', 'technologies', 'technology', 'data', 'core', 'smart', 'super', 'micro', 'standard', 'public', 'home', 'west', 'east', 'north', 'south', 'world', 'universal', 'consolidated', 'allied', 'continental', 'liberty', 'premier', 'pioneer', 'summit', 'apex', 'alpha']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The headline is about the company: it names it (or its ticker) and is not a list of several companies. */
export function aboutCompany(title: string, words: ReturnType<typeof companyWords>): boolean {
  const named =
    (words.name.length >= 3 && new RegExp(`\\b${escape(words.name)}\\b`, 'i').test(title)) ||
    (!!words.first && new RegExp(`\\b${escape(words.first)}('s)?\\b`, 'i').test(title)) ||
    (words.ticker.length >= 2 && new RegExp(`(^|[^A-Za-z])\\$?${escape(words.ticker)}([^A-Za-z]|$)`).test(title));
  if (!named) return false;
  // A round-up names many companies: three commas or more in a headline.
  return (title.match(/,/g) ?? []).length < 3;
}

/** A headline that reports a stock-moving event, not a question, ranking, preview, opinion or round-up. */
export function isMaterialHeadline(title: string): boolean {
  const t = title.trim();
  return !NOT_NEWS.some((r) => r.test(t)) && (t.match(/,/g) ?? []).length < 3 && MATERIAL.some((r) => r.test(t));
}

/** Whether a market story is breaking: fresh and reporting a stock-moving event. */
export function isBreakingStory(story: { title: string; time: number }, now: number, within = BREAKING_MS): boolean {
  return now - story.time < within && story.time <= now + 5 * 60_000 && isMaterialHeadline(story.title);
}

/** Whether a story about a security is breaking: fresh, about the company, and reporting a stock-moving event. */
export function isBreaking(story: { title: string; time: number }, company: { name: string; ticker: string }, now: number): boolean {
  if (!(now - story.time < BREAKING_MS && story.time <= now + 5 * 60_000)) return false;
  const title = story.title.trim();
  if (NOT_NEWS.some((r) => r.test(title))) return false;
  if (!aboutCompany(title, companyWords(company.name, company.ticker))) return false;
  return MATERIAL.some((r) => r.test(title));
}
