import { resolveSecurity } from '../data/registry';
import { lookupSource, searchOnline, type OnlineHit } from '../data/live/lookup';
import { lookupFn } from './registry';
import type { Suggestion } from './suggest';

/**
 * Finding a stock by its company's name: "applied digital", "Coca-Cola SPLC", "PROFILE nvidia". The command line
 * suggests the stocks the online search finds for the name, and a name typed and run opens the best of them.
 */

/** Lower case, accents folded, punctuation and legal forms dropped: "The Coca-Cola Company" → "coca cola". */
export function nameKey(name: string): string {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:the|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|nv|n v|sa|s a|s p a|ag|se|ab|asa|holdings?|group|class [abc])\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NameQuery {
  /** The company name typed. */
  name: string;
  /** A function typed after the name ("applied digital SPLC"). */
  fn?: string;
  /** A function typed before it ("SPLC applied digital"). */
  lead?: string;
}

/**
 * The name in a command, and the function typed before or after it; null when the command is something else (a
 * function alone, a security the app holds, a menu number, nothing with letters).
 */
export function nameQuery(text: string): NameQuery | null {
  const raw = text.replace(/<\s*GO\s*>/gi, ' ').replace(/[<>]/g, ' ').trim();
  if (!/[A-Za-z]{2}/.test(raw) || /^\d+$/.test(raw)) return null;
  const words = raw.split(/\s+/);
  let lead: string | undefined;
  let fn: string | undefined;
  // The function is kept as typed ("SPLC", not the function it stands for), so the command reads as the user wrote it.
  if (words.length > 1 && lookupFn(words[0])) lead = words[0].toUpperCase();
  else if (words.length > 1 && lookupFn(words[words.length - 1])) fn = words[words.length - 1].toUpperCase();
  const nameWords = lead ? words.slice(1) : fn ? words.slice(0, -1) : words;
  // "US", "EQUITY" and other market words are not part of a company's name.
  while (nameWords.length > 1 && /^(?:US|EQUITY|EQ)$/i.test(nameWords[nameWords.length - 1])) nameWords.pop();
  const name = nameWords.join(' ').trim();
  if (name.length < 2 || !/[A-Za-z]/.test(name)) return null;
  if (!lead && !fn && words.length === 1 && lookupFn(words[0])) return null;
  // A security the app holds, alone or before other words ("AAPL DESS" is a mistyped function, not a name).
  for (let j = words.length; j >= 1; j--) if (resolveSecurity(words.slice(0, j).join(' '))) return null;
  return { name, ...(fn ? { fn } : {}), ...(lead ? { lead } : {}) };
}

/**
 * The hit a name names best: one whose name is the name typed ("apple" is Apple Inc., not Apple Hospitality), else
 * one whose name starts with it, else one whose name has every word typed, else one whose ticker is the name; US
 * listings before others. Null when none fits.
 */
export function bestHit(name: string, hits: OnlineHit[]): OnlineHit | null {
  const q = nameKey(name);
  if (!q) return null;
  const words = q.split(' ');
  const us = (h: OnlineHit) => (/\s/.test(h.symbol) ? 1 : 0);
  const ranked = [...hits].sort((a, b) => us(a) - us(b));
  return (
    ranked.find((h) => nameKey(h.name) === q) ??
    ranked.find((h) => nameKey(h.name).startsWith(q)) ??
    ranked.find((h) => nameKey(h.name).replace(/\s/g, '').startsWith(q.replace(/\s/g, ''))) ??
    ranked.find((h) => words.every((w) => nameKey(h.name).split(' ').includes(w))) ??
    ranked.find((h) => h.symbol.replace(/[\s/.-]/g, '').toUpperCase() === name.replace(/[\s/.-]/g, '').toUpperCase()) ??
    null
  );
}

/** The command that opens a hit, with the function typed: "APLD US EQUITY SPLC", "SPLC KBC BB EQUITY". */
export function commandFor(hit: OnlineHit, q: Pick<NameQuery, 'fn' | 'lead'>): string {
  const sec = /\s/.test(hit.symbol) ? `${hit.symbol} EQUITY` : `${hit.symbol} US EQUITY`;
  return q.lead ? `${q.lead} ${sec}` : q.fn ? `${sec} ${q.fn}` : sec;
}

const cache = new Map<string, { at: number; hits: OnlineHit[] }>();

/** The online search's hits for a name, kept ten minutes. */
export async function searchName(name: string): Promise<OnlineHit[]> {
  const key = nameKey(name) || name.toLowerCase();
  const kept = cache.get(key);
  if (kept && Date.now() - kept.at < 600_000) return kept.hits;
  const hits = await searchOnline(name).catch(() => [] as OnlineHit[]);
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return hits;
}

/** Suggestions for a name typed in the command line: the stocks the online search finds, best first. */
export async function nameSuggestions(text: string): Promise<Suggestion[]> {
  if (!lookupSource()) return [];
  const q = nameQuery(text);
  if (!q || q.name.length < 2) return [];
  const hits = await searchName(q.name);
  const best = bestHit(q.name, hits);
  const ordered = best ? [best, ...hits.filter((h) => h !== best)] : hits;
  return ordered.slice(0, 8).map((h) => ({
    kind: 'sec' as const,
    key: `name:${h.symbol}`,
    primary: /\s/.test(h.symbol) ? `${h.symbol} Equity` : `${h.symbol} US Equity`,
    secondary: h.name,
    tag: q.fn ?? q.lead ?? 'Online',
    execute: commandFor(h, q),
  }));
}

/** The command a typed name stands for, found online; null when the name finds no stock. */
export async function commandForName(text: string): Promise<string | null> {
  if (!lookupSource()) return null;
  const q = nameQuery(text);
  if (!q) return null;
  const hit = bestHit(q.name, await searchName(q.name));
  return hit ? commandFor(hit, q) : null;
}
