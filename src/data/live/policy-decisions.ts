import { zonedParts, zonedToUtc } from '../../core/format';

/** A policy announcement, distinct from observations of the rate in force. */
export interface PolicyDecision {
  id: string;
  bank: string;
  date: string;
  announcedAt?: number;
  effectiveDate?: string;
  lower?: number;
  upper: number;
  changeBp?: number;
  action: 'hold' | 'hike' | 'cut' | 'unknown';
  status: 'confirmed';
  sourceUrl: string;
  implementationUrl?: string;
  retrievedAt: number;
  /** A publication date is not an exact publication time. */
  timeUnknown?: boolean;
}

export interface FedStatementLink {
  date: string;
  statementPath: string;
  implementationPath?: string;
}

const ORIGIN = 'https://www.federalreserve.gov';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_WORDS = `(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})`;
const RATE = '(?:\\d{1,2}(?:\\.\\d{1,5})?(?:\\s*[- ]\\s*[1-7]\\s*/\\s*[248])?|[1-7]\\s*/\\s*[248]|zero)';
const RANGE_ANCHOR = '(?:target\\s+range\\s+for\\s+(?:the\\s+)?federal\\s+funds\\s+rate|federal\\s+funds\\s+(?:target\\s+range|rate\\s+in\\s+a\\s+target\\s+range))';
const RANGE = new RegExp(`${RANGE_ANCHOR}([\\s\\S]{0,200}?)(?:at|to|of|between)\\s+(${RATE})\\s+(?:to|and|-)\\s+(${RATE})\\s*(?:percent\\b|%)`, 'gi');

function iso(year: number, month: number, day: number): string | undefined {
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const value = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return value === `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? value : undefined;
}

function wordDate(value: string): string | undefined {
  const found = new RegExp(`^${DATE_WORDS}$`, 'i').exec(value.trim());
  return found ? iso(Number(found[3]), MONTHS.findIndex((x) => x.toLowerCase() === found[1].toLowerCase()) + 1, Number(found[2])) : undefined;
}

function entities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac14: ' 1/4', frac12: ' 1/2', frac34: ' 3/4', ndash: '-', mdash: '-' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? whole;
    const n = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

function plain(html: string): string {
  return entities(html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/[¼½¾⅛⅜⅝⅞]/g, (x) => ({ '¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8' })[x]!)
    .replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
}

const titleText = (label: string) => plain(label.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1'));
const excludedPublication = (label: string) => /\bminutes\b|\blonger[-\s]+run\s+goals\b|\bmonetary\s+policy\s+strategy\b/i.test(titleText(label));

function publicationType(label: string) {
  const text = titleText(label).replace(/^Federal Reserve Board\s*[-|:]\s*/i, '').replace(/\s*[-|]\s*Federal Reserve Board$/i, '').trim();
  if (excludedPublication(text)) return 'other';
  if (/^(?:Federal Reserve(?: Board)?\s+(?:issues|releases)\s+(?:an?\s+)?)?(?:FOMC|Federal Open Market Committee)\s+statement\.?$/i.test(text)) return 'statement';
  if (/^(?:Federal Reserve(?: Board)?|Board of Governors of the Federal Reserve System|Press Release|News\s*(?:&|and)\s*Events|Monetary Policy|FOMC)$/i.test(text)) return 'generic';
  return 'unknown';
}

/** A policy range quoted by another publication does not make that publication a new decision. */
export function isFedStatementPublication(html: string): boolean {
  const clean = html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const labels: string[] = [];
  for (const meta of clean.matchAll(/<meta\b[^>]*>/gi)) {
    if (/\bname\s*=\s*["']DC\.title["']/i.test(meta[0])) labels.push(/\bcontent\s*=\s*["']([^"']*)["']/i.exec(meta[0])?.[1] ?? '');
  }
  labels.push(...[...clean.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => m[1]));
  const article = clean.replace(/<(aside|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  for (const heading of article.matchAll(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(heading[2])?.[1].split(/\s+/) ?? [];
    if (classes.includes('title') || classes.includes('article__title')) labels.push(heading[3]);
  }
  const types = labels.map(publicationType);
  return types.includes('statement') && types.every((type) => type === 'statement' || type === 'generic');
}

function canonicalPath(value: string): { date: string; path: string; implementation: boolean } | undefined {
  let url: URL;
  try { url = new URL(entities(value.trim()), ORIGIN); } catch { return undefined; }
  if (url.protocol !== 'https:' || !['www.federalreserve.gov', 'federalreserve.gov'].includes(url.hostname) || url.port || url.username || url.password) return undefined;
  const hit = /^\/newsevents\/pressreleases\/monetary(\d{4})(\d{2})(\d{2})a(1)?\.htm$/.exec(url.pathname);
  if (!hit) return undefined;
  const date = iso(Number(hit[1]), Number(hit[2]), Number(hit[3]));
  return date ? { date, path: url.pathname, implementation: !!hit[4] } : undefined;
}

/** Discover only published official statement URLs; never manufacture an outcome from a scheduled date. */
export function fedStatementLinks(html: string): FedStatementLink[] {
  const values: string[] = [];
  const clean = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const outside = clean.replace(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_all: string, _tag: string, block: string) => {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? '';
    if (!excludedPublication(title)) {
      values.push(...[...block.matchAll(/<link\b[^>]*>\s*(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?\s*<\/link>/gi)].map((m) => m[1]));
      values.push(...[...block.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]));
    }
    return ' ';
  });
  for (const anchor of outside.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(anchor[1])?.[1];
    if (href && !excludedPublication(anchor[2])) values.push(href);
  }
  const paths = values.map(canonicalPath).filter((x): x is NonNullable<typeof x> => !!x);
  const out = new Map<string, FedStatementLink>();
  for (const p of paths) {
    if (p.implementation) continue;
    const implementationPath = paths.find((x) => x.date === p.date && x.implementation)?.path;
    out.set(p.date, { date: p.date, statementPath: p.path, ...(implementationPath ? { implementationPath } : {}) });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function pageDate(html: string, text: string): string | undefined {
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].find((m) => /\bname\s*=\s*["']DC\.date["']/i.test(m[0]));
  const content = meta && /\bcontent\s*=\s*["'](\d{4})-(\d{2})-(\d{2})(?:[^"']*)["']/i.exec(meta[0]);
  if (content) return iso(Number(content[1]), Number(content[2]), Number(content[3]));
  const article = /<(?:p|time)\b[^>]*(?:class\s*=\s*["'][^"']*article__time[^"']*["']|datetime\s*=)[^>]*>([\s\S]*?)<\/(?:p|time)>/i.exec(html);
  const date = new RegExp(DATE_WORDS, 'i').exec(article ? plain(article[1]) : text.slice(0, 2400));
  return date ? wordDate(date[0]) : undefined;
}

function rate(value: string): number | undefined {
  const s = value.trim().toLowerCase().replace(/\s*\/\s*/g, '/');
  if (s === 'zero') return 0;
  const mixed = /^(\d{1,2})\s*[- ]\s*([1-7])\/([248])$/.exec(s);
  const fraction = /^([1-7])\/([248])$/.exec(s);
  const result = mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : fraction ? Number(fraction[1]) / Number(fraction[2]) : /^\d{1,2}(?:\.\d{1,5})?$/.test(s) ? Number(s) : NaN;
  return Number.isFinite(result) && result >= 0 && result <= 50 ? result : undefined;
}

interface Target { lower?: number; upper: number; at: number; end: number }

function target(text: string): Target | undefined {
  const targets: Target[] = [];
  for (const match of text.matchAll(new RegExp(RANGE.source, 'gi'))) {
    const lower = rate(match[2]);
    const upper = rate(match[3]);
    if (lower == null || upper == null || lower > upper) return undefined;
    targets.push({ lower, upper, at: match.index!, end: match.index! + match[0].length });
  }
  if (!targets.length) {
    // A legacy single target is a different instrument definition from a range. Keep lower absent.
    const single = new RegExp(`(?:target(?:\\s+for)?\\s+(?:the\\s+)?federal\\s+funds\\s+rate|federal\\s+funds\\s+rate\\s+target)\\s+(?:at|to|of)\\s+(${RATE})\\s*(?:percent\\b|%)`, 'gi');
    for (const match of text.matchAll(single)) {
      const upper = rate(match[1]);
      if (upper == null) return undefined;
      targets.push({ upper, at: match.index!, end: match.index! + match[0].length });
    }
  }
  if (!targets.length || targets.some((x) => x.lower !== targets[0].lower || x.upper !== targets[0].upper)) return undefined;
  return targets[0];
}

function releaseTime(text: string, date: string): number | undefined {
  const found = /(?:for\s+release\s+at|released?\s+at)\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*(EDT|EST|ET)?\b/i.exec(text);
  if (!found || Number(found[1]) < 1 || Number(found[1]) > 12 || Number(found[2] ?? 0) > 59) return undefined;
  const h = Number(found[1]) % 12 + (found[3].toLowerCase() === 'p' ? 12 : 0);
  const [y, mo, d] = date.split('-').map(Number);
  if (found[4]?.toUpperCase() === 'EDT') return Date.UTC(y, mo - 1, d, h + 4, Number(found[2] ?? 0));
  if (found[4]?.toUpperCase() === 'EST') return Date.UTC(y, mo - 1, d, h + 5, Number(found[2] ?? 0));
  return zonedToUtc(y, mo - 1, d, h, Number(found[2] ?? 0), 'America/New_York');
}

function action(text: string, t: Target): Pick<PolicyDecision, 'action' | 'changeBp'> {
  const before = text.slice(Math.max(0, t.at - 150), t.at);
  const verb = /\b(?:decided|voted|agreed)\s+to\s+(maintain|keep|leave|raise|increase|lower|reduce)\b([^.!?]{0,100})$/i.exec(before);
  if (!verb || /\b(?:if|unless|would|could|may)\b/i.test(verb[2])) return { action: 'unknown' };
  const value = verb[1].toLowerCase();
  if (['maintain', 'keep', 'leave'].includes(value)) return { action: 'hold', changeBp: 0 };
  const direction = ['raise', 'increase'].includes(value) ? 1 : -1;
  const around = text.slice(Math.max(0, t.at - 120), t.end);
  const bp = /\bby\s+(\d+(?:\.\d+)?)\s+basis\s+points?\b/i.exec(around);
  const pp = new RegExp(`\\bby\\s+(${RATE})\\s+percentage\\s+points?\\b`, 'i').exec(around);
  const magnitude = bp ? Number(bp[1]) : pp ? (rate(pp[1]) ?? NaN) * 100 : NaN;
  return { action: direction > 0 ? 'hike' : 'cut', ...(Number.isFinite(magnitude) ? { changeBp: direction * magnitude } : {}) };
}

/**
 * Parse an official statement. A calendar alone never confirms a decision. Missing publication/effective times stay
 * missing; a future announcement, conflicting date or ambiguous target fails closed. Implementation evidence is
 * attached only when its target agrees and its explicit Desk direction supplies the effective date.
 */
export function parseFedDecision(statementHtml: string, implementationHtml: string, sourceUrl: string, retrievedAt: number, now = retrievedAt): PolicyDecision | undefined {
  if (!statementHtml || statementHtml.length > 1_500_000 || !Number.isFinite(retrievedAt) || !Number.isFinite(now)) return undefined;
  const path = canonicalPath(sourceUrl);
  if (!path || path.implementation || !isFedStatementPublication(statementHtml)) return undefined;
  const text = plain(statementHtml);
  const published = pageDate(statementHtml, text);
  const p = zonedParts(now, 'America/New_York');
  const today = `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  if (published !== path.date || published > today) return undefined;
  const announcedAt = releaseTime(text, published);
  const retrieved = zonedParts(retrievedAt, 'America/New_York');
  const retrievedDate = `${retrieved.y}-${String(retrieved.mo).padStart(2, '0')}-${String(retrieved.d).padStart(2, '0')}`;
  if (published > retrievedDate || (announcedAt != null && (announcedAt > now || announcedAt > retrievedAt))) return undefined;
  const t = target(text);
  if (!t) return undefined;
  let effectiveDate: string | undefined;
  let implementationUrl: string | undefined;
  if (implementationHtml && implementationHtml.length <= 1_500_000) {
    const implementation = plain(implementationHtml);
    const itsTarget = target(implementation);
    const date = new RegExp(`effective\\s+${DATE_WORDS}[,:]?\\s+(?:the\\s+)?(?:Federal\\s+Open\\s+Market\\s+Committee|FOMC)\\s+(?:directs|has\\s+directed)\\s+(?:the\\s+)?(?:Open\\s+Market\\s+)?Desk\\b`, 'i').exec(implementation);
    if (pageDate(implementationHtml, implementation) === published && itsTarget && itsTarget.lower === t.lower && itsTarget.upper === t.upper && date) {
      effectiveDate = wordDate(`${date[1]} ${date[2]}, ${date[3]}`);
      if (effectiveDate && effectiveDate >= published) implementationUrl = `${ORIGIN}${path.path.replace(/a\.htm$/, 'a1.htm')}`;
      else effectiveDate = undefined;
    }
  }
  return {
    id: `FED:${published}`, bank: 'FED', date: published,
    ...(announcedAt != null ? { announcedAt } : { timeUnknown: true }),
    ...(effectiveDate ? { effectiveDate, implementationUrl } : {}),
    ...(t.lower != null ? { lower: t.lower } : {}), upper: t.upper,
    ...action(text, t), status: 'confirmed', sourceUrl: `${ORIGIN}${path.path}`, retrievedAt,
  };
}
