import { resolveSecurity, UNCOVERED_KEYS, YELLOW_KEYS } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { renamedCode } from './legacy';

export type Parsed =
  | { kind: 'empty' }
  | { kind: 'menu'; n: number }
  | { kind: 'help'; topic: string }
  | { kind: 'route'; fn?: string; sec?: SecurityDef; args?: string }
  /** `lookup` names a ticker that may be found online (not built in). */
  | { kind: 'error'; message: string; lookup?: string };

export interface FnLookup {
  (code: string): { code: string; needsSec?: boolean } | undefined;
}

/** Ticker shapes worth looking up online: APLD, BRK/B, BRK.B. */
const TICKER = /^[A-Z][A-Z0-9]{0,5}([./-][A-Z]{1,2})?$/;

/** Strips keyboard-style tokens ("<EQUITY>", "<GO>") and cashtags ("$APLD"). */
function clean(input: string): string {
  return input
    .replace(/(^|\s)\$(?=[A-Za-z])/g, '$1')
    .replace(/<\s*GO\s*>/gi, ' ')
    .replace(/<\s*([A-Z-]+)\s*>/gi, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Unknown function: DES (now PROFILE)": the old codes were renamed. */
function unknownFunction(code: string): string {
  const now = renamedCode(code);
  return now ? `${code} was renamed ${now}` : `Unknown function: ${code}`;
}

/**
 * Parses command lines. The function can come first or last:
 *   CHART NVDA 1D               function, security, arguments
 *   QUOTE CT10 GOVT             a market sector word belongs to the security
 *   AAPL CHART                  security, then function
 *   AAPL US EQUITY CHART        security with its exchange and sector
 *   CHART                       function on the loaded security
 *   NEWS CRYPTO / HELP CHART    function with arguments
 *   3                           numbered menu item
 *   CHART?                      help on a function
 *   EQUITY                      market sector menu
 *   IBM CORP                    an issuer's bonds (BONDSEARCH)
 */
export function parseCommand(input: string, lookup: FnLookup): Parsed {
  const s = clean(input);
  if (!s) return { kind: 'empty' };
  if (/^\d{1,3}$/.test(s)) return { kind: 'menu', n: Number(s) };
  if (s.endsWith('?')) return { kind: 'help', topic: s.slice(0, -1).trim().toUpperCase() };

  const raw = s.split(' ');
  const tokens = raw.map((t) => t.toUpperCase());

  // A market sector word on its own opens that sector's menu; CLIENT opens the portfolio.
  if (tokens.length === 1 && YELLOW_KEYS[tokens[0]]) {
    const yk = YELLOW_KEYS[tokens[0]];
    if (yk === 'Client') return lookup('PORTFOLIO') ? { kind: 'route', fn: 'PORTFOLIO' } : { kind: 'error', message: 'PORTFOLIO is not available' };
    return { kind: 'route', fn: 'MENU', args: yk.toUpperCase() };
  }

  // A function word first, then the security: "BONDCALC CT10 GOVT", "DEBTPROFILE JPM CORP".
  const lead = tokens.length > 1 ? lookup(tokens[0]) : undefined;
  const from = lead ? 1 : 0;
  const ykAt = tokens.findIndex((t, i) => i > from && YELLOW_KEYS[t]);
  if (ykAt > from) {
    const yk = YELLOW_KEYS[tokens[ykAt]];
    const secText = raw.slice(from, ykAt).join(' ');
    if (UNCOVERED_KEYS.has(yk)) {
      return { kind: 'error', message: `${yk} securities are not covered. Armin Terminal covers Govt, Corp, Equity, Cmdty, Index and Curncy.` };
    }
    const after = tokens.slice(ykAt + 1);
    // "IBM CORP" or "T GOVT" without a coupon names an issuer: list its bonds.
    if ((yk === 'Corp' || yk === 'Govt') && !/\d/.test(secText)) {
      const issuer = `${secText.toUpperCase()} ${yk.toUpperCase()}`;
      if (lead) return { kind: 'route', fn: lead.code, args: issuer };
      if (after.length === 0) return { kind: 'route', fn: 'BONDSEARCH', args: issuer };
      const fn = lookup(after[0]);
      if (!fn) return { kind: 'error', message: unknownFunction(after[0]) };
      return { kind: 'route', fn: fn.code, args: issuer };
    }
    const sec = resolveSecurity(secText, yk);
    if (!sec) {
      const root = secText.toUpperCase().replace(/\s+US$/, '');
      return { kind: 'error', message: `Unknown security: ${secText.toUpperCase()} ${yk}`, lookup: yk === 'Equity' && TICKER.test(root) ? root : undefined };
    }
    if (lead) return { kind: 'route', sec, fn: lead.code, args: after.join(' ') || undefined };
    if (after.length === 0) return { kind: 'route', sec };
    const fn = lookup(after[0]);
    if (!fn) return { kind: 'error', message: unknownFunction(after[0]) };
    return { kind: 'route', sec, fn: fn.code, args: after.slice(1).join(' ') || undefined };
  }

  const head = lookup(tokens[0]);
  if (head) {
    const rest = raw.slice(1);
    if (!rest.length) return { kind: 'route', fn: head.code };
    // The longest run of words after the function that names a security; the words after it are arguments.
    for (let j = rest.length; j >= 1; j--) {
      const sec = resolveSecurity(rest.slice(0, j).join(' '));
      if (!sec) continue;
      const args = rest.slice(j).join(' ').toUpperCase();
      return { kind: 'route', fn: head.code, sec, ...(args ? { args } : {}) };
    }
    // A function that needs a security, followed by a ticker that is not built in: look it up online.
    if (head.needsSec) {
      const t = tokens[1] === '$' ? tokens[2] : tokens[1];
      if (TICKER.test(t)) return { kind: 'error', message: `Unknown security: ${t}`, lookup: t };
    }
    return { kind: 'route', fn: head.code, args: rest.join(' ').toUpperCase() };
  }

  // Longest prefix that names a security, then an optional function.
  for (let j = tokens.length; j >= 1; j--) {
    const sec = resolveSecurity(raw.slice(0, j).join(' '));
    if (!sec) continue;
    const rest = tokens.slice(j);
    if (rest.length === 0) return { kind: 'route', sec };
    const fn = lookup(rest[0]);
    if (!fn) return { kind: 'error', message: unknownFunction(rest[0]) };
    return { kind: 'route', sec, fn: fn.code, args: rest.slice(1).join(' ') || undefined };
  }

  // An old code on its own, or first: say what it is called now.
  const renamed = renamedCode(tokens[0]);
  if (renamed && lookup(renamed)) return { kind: 'error', message: `${tokens[0]} was renamed ${renamed}: type ${[renamed, ...raw.slice(1)].join(' ').toUpperCase()}` };

  // "APLD", "APLD PROFILE", "APLD US", "APLD US CHART": a ticker that is not built in.
  const rest = tokens[1] === 'US' ? tokens.slice(2) : tokens.slice(1);
  const lookupTicker = TICKER.test(tokens[0]) && (rest.length === 0 || !!lookup(rest[0])) ? tokens[0] : undefined;
  return { kind: 'error', message: `Unknown command: ${s.toUpperCase()}. Type HELP for functions.`, lookup: lookupTicker };
}
