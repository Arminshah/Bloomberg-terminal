import { resolveSecurity, UNCOVERED_KEYS, YELLOW_KEYS } from '../data/registry';
import type { SecurityDef } from '../data/types';

export type Parsed =
  | { kind: 'empty' }
  | { kind: 'menu'; n: number }
  | { kind: 'help'; topic: string }
  | { kind: 'route'; fn?: string; sec?: SecurityDef; args?: string }
  | { kind: 'error'; message: string };

export interface FnLookup {
  (code: string): { code: string } | undefined;
}

/** Strips keyboard-style tokens: "<EQUITY>", "<GO>". */
function clean(input: string): string {
  return input
    .replace(/<\s*GO\s*>/gi, ' ')
    .replace(/<\s*([A-Z-]+)\s*>/gi, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses Bloomberg-style command lines:
 *   AAPL US <EQUITY> GP <GO>    security + yellow key + function
 *   AAPL GP                     ticker shorthand + function
 *   GP                          function on the loaded security
 *   N TECH / HELP GP            function with arguments
 *   3 <GO>                      numbered menu item
 *   GP?                         help on a function
 *   EQUITY <GO>                 market sector menu for a yellow key
 *   IBM <CORP> <GO>             an issuer's bonds (SRCH)
 */
export function parseCommand(input: string, lookup: FnLookup): Parsed {
  const s = clean(input);
  if (!s) return { kind: 'empty' };
  if (/^\d{1,3}$/.test(s)) return { kind: 'menu', n: Number(s) };
  if (s.endsWith('?')) return { kind: 'help', topic: s.slice(0, -1).trim().toUpperCase() };

  const raw = s.split(' ');
  const tokens = raw.map((t) => t.toUpperCase());

  // A yellow key on its own opens that market sector's menu; CLIENT opens the portfolio.
  if (tokens.length === 1 && YELLOW_KEYS[tokens[0]]) {
    const yk = YELLOW_KEYS[tokens[0]];
    if (yk === 'Client') return lookup('PORT') ? { kind: 'route', fn: 'PORT' } : { kind: 'error', message: 'PORT is not available' };
    return { kind: 'route', fn: 'MENU', args: yk.toUpperCase() };
  }

  const ykAt = tokens.findIndex((t, i) => i > 0 && YELLOW_KEYS[t]);
  if (ykAt > 0) {
    const yk = YELLOW_KEYS[tokens[ykAt]];
    const secText = raw.slice(0, ykAt).join(' ');
    if (UNCOVERED_KEYS.has(yk)) {
      return { kind: 'error', message: `${yk} securities are not covered. Armin Terminal covers Govt, Corp, Equity, Cmdty, Index and Curncy.` };
    }
    const rest0 = tokens.slice(ykAt + 1);
    // "IBM <CORP>" or "T <GOVT>" without a coupon names an issuer: list its bonds.
    if ((yk === 'Corp' || yk === 'Govt') && !/\d/.test(secText)) {
      const issuer = `${secText.toUpperCase()} ${yk.toUpperCase()}`;
      if (rest0.length === 0) return { kind: 'route', fn: 'SRCH', args: issuer };
      const fn = lookup(rest0[0]);
      if (!fn) return { kind: 'error', message: `Unknown function: ${rest0[0]}` };
      return { kind: 'route', fn: fn.code, args: issuer };
    }
    const sec = resolveSecurity(secText, yk);
    if (!sec) return { kind: 'error', message: `Unknown security: ${secText.toUpperCase()} ${yk}` };
    const rest = tokens.slice(ykAt + 1);
    if (rest.length === 0) return { kind: 'route', sec };
    const fn = lookup(rest[0]);
    if (!fn) return { kind: 'error', message: `Unknown function: ${rest[0]}` };
    return { kind: 'route', sec, fn: fn.code, args: rest.slice(1).join(' ') || undefined };
  }

  const head = lookup(tokens[0]);
  if (head) {
    const rest = raw.slice(1).join(' ');
    if (!rest) return { kind: 'route', fn: head.code };
    const sec = resolveSecurity(rest);
    if (sec) return { kind: 'route', fn: head.code, sec };
    return { kind: 'route', fn: head.code, args: rest.toUpperCase() };
  }

  // Longest prefix that names a security, then an optional function.
  for (let j = tokens.length; j >= 1; j--) {
    const sec = resolveSecurity(raw.slice(0, j).join(' '));
    if (!sec) continue;
    const rest = tokens.slice(j);
    if (rest.length === 0) return { kind: 'route', sec };
    const fn = lookup(rest[0]);
    if (!fn) return { kind: 'error', message: `Unknown function: ${rest[0]}` };
    return { kind: 'route', sec, fn: fn.code, args: rest.slice(1).join(' ') || undefined };
  }

  return { kind: 'error', message: `Unknown command: ${s.toUpperCase()}. Type HELP for functions.` };
}
