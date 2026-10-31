import { resolveSecurity, YELLOW_KEYS } from '../data/registry';
import { lookupFn } from './registry';

/**
 * Whether a command line holds plain words to search for rather than a command (TE01 02:05, TE04 02:53): a question,
 * or two words or more that do not start or end with a function and hold no market sector (two words must not both
 * name securities). A number, a single word and a command keep their own meaning.
 */
export function plainWords(text: string): boolean {
  const t = text.replace(/<\s*GO\s*>/gi, ' ').trim();
  if (!t || /^\d/.test(t)) return false;
  const words = t.split(/\s+/);
  // One word stays a command: "DES?" asks for DES's help.
  if (words.length < 2) return false;
  if (t.endsWith('?')) return true;
  // A function first or last ("GP QZZX 1D", "ZZZZ CHART"), as the command grammar puts it, or a market sector anywhere
  // ("IBM US EQUITY DES") makes it a command; a word such as "in" between others stays a word.
  if (lookupFn(words[0]) || lookupFn(words[words.length - 1]) || words.some((w) => !!YELLOW_KEYS[w.toUpperCase()])) return false;
  return words.length >= 3 || words.every((w) => !resolveSecurity(w));
}
