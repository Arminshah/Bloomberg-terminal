import { isMarketCode, parseListing } from '../data/listings';
import { resolveSecurity, UNCOVERED_KEYS, YELLOW_KEYS } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { argsWith } from './legacy';

export type Parsed =
  | { kind: 'empty' }
  | { kind: 'menu'; n: number }
  | { kind: 'help'; topic: string }
  | { kind: 'route'; fn?: string; sec?: SecurityDef; args?: string }
  /**
   * `lookup` names a ticker that may be found online (not built in). `final`: the text names a security of a kind
   * the app has no source for (a bond typed with its yellow key), so it is not searched as a company name either.
   */
  | { kind: 'error'; message: string; lookup?: string; final?: boolean };

export interface FnLookup {
  (code: string): { code: string; needsSec?: boolean; topics?: boolean } | undefined;
}

/** Ticker shapes worth looking up online: APLD, BRK/B, BRK.B; European listings are ABI BB or ABI.BR. */
const TICKER = /^[A-Z][A-Z0-9]{0,5}([./-][A-Z]{1,2})?$/;
const lookupable = (t: string) => TICKER.test(t) || !!parseListing(t);

/** A generic Treasury ("CT10 Govt", the current 10-year): the app's yield line for that maturity, if it has one. */
export function genericTreasuryYield(secText: string): { id: string; years: number } | undefined {
  const m = /^CT(\d{1,2})$/i.exec(secText.trim());
  const id = m ? resolveSecurity(`USGG${Number(m[1])}YR`, 'Index')?.id : undefined;
  return id ? { id, years: Number(m![1]) } : undefined;
}

/** Strips keyboard-style tokens ("<EQUITY>", "<GO>") and cashtags ("$APLD"). */
function clean(input: string): string {
  return input
    .replace(/(^|\s)\$(?=[A-Za-z])/g, '$1')
    .replace(/<\s*GO\s*>/gi, ' ')
    .replace(/<\s*([A-Z-]+)\s*>/gi, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unknownFunction(code: string): string {
  return `Unknown function: ${code}`;
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
  if (s.endsWith('?')) {
    const topic = s.slice(0, -1).trim().toUpperCase();
    return { kind: 'help', topic: lookup(topic)?.code ?? topic };
  }

  const raw = s.split(' ');
  const tokens = raw.map((t) => t.toUpperCase());

  // A market sector word on its own opens that sector's menu; CLIENT opens the portfolio.
  if (tokens.length === 1 && YELLOW_KEYS[tokens[0]]) {
    const yk = YELLOW_KEYS[tokens[0]];
    if (yk === 'Client') return lookup('PORTFOLIO') ? { kind: 'route', fn: 'PORTFOLIO' } : { kind: 'error', message: 'PORTFOLIO is not available' };
    return { kind: 'route', fn: 'MENU', args: yk.toUpperCase() };
  }

  // A function word first, then the security: "BONDCALC CT10 GOVT", "DEBTPROFILE JPM CORP".
  const sectorAt = tokens.findIndex((t, i) => i > 0 && YELLOW_KEYS[t]);
  const prefix = raw.slice(0, sectorAt).join(' ');
  // An explicit sector identifies a security even when its ticker is also a
  // function alias (N, W, GC). Keep that interpretation after online lookup.
  const securityFirst = sectorAt > 0 && (
    !!resolveSecurity(prefix, YELLOW_KEYS[tokens[sectorAt]]) || lookupable(prefix.toUpperCase().replace(/\s+US$/, ''))
  );
  const lead = tokens.length > 1 && !securityFirst ? lookup(tokens[0]) : undefined;
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
      if (!fn) return { kind: 'error', message: unknownFunction(after[0]), final: true };
      return { kind: 'route', fn: fn.code, args: issuer };
    }
    const sec = resolveSecurity(secText, yk);
    if (!sec) {
      const typed = `${secText.toUpperCase()} ${yk}`;
      const treasury = yk === 'Govt' ? genericTreasuryYield(secText) : undefined;
      if (treasury) {
        return { kind: 'error', message: `${typed}: Treasury prices are not available from the app's free sources. The ${treasury.years}-year yield is: ${treasury.id}`, final: true };
      }
      // "CLA Comdty", the active contract: the app follows the front contract (CL1), which is the active one except
      // around a roll; it names it rather than open it in its place.
      const active = yk === 'Comdty' ? /^([A-Z]{1,3})A$/.exec(secText.trim().toUpperCase()) : null;
      const front = active ? resolveSecurity(`${active[1]}1`, 'Comdty') : undefined;
      if (front) return { kind: 'error', message: `${typed}: the app has no active-contract line. The front contract is: ${front.id}`, final: true };
      const root = secText.toUpperCase().replace(/\s+US$/, '');
      if (yk !== 'Equity') return { kind: 'error', message: `Unknown security: ${typed}`, final: true };
      return { kind: 'error', message: `Unknown security: ${typed}`, lookup: lookupable(root) ? root : undefined };
    }
    if (lead) return { kind: 'route', sec, fn: lead.code, args: argsWith(tokens[0], after.join(' ')) };
    if (after.length === 0) return { kind: 'route', sec };
    const fn = lookup(after[0]);
    if (!fn) return { kind: 'error', message: unknownFunction(after[0]), ...(yk !== 'Equity' ? { final: true } : {}) };
    return { kind: 'route', sec, fn: fn.code, args: argsWith(after[0], after.slice(1).join(' ')) };
  }

  const head = lookup(tokens[0]);
  if (head) {
    const rest = raw.slice(1);
    const preset = argsWith(tokens[0]);
    if (!rest.length) return { kind: 'route', fn: head.code, ...(preset ? { args: preset } : {}) };
    // A help topic is a function first, even if an identically named ticker
    // has been loaded (HELP N, HELP W or HELP GP).
    if (head.code === 'HELP' && rest.length === 1) {
      const topic = lookup(tokens[1]);
      if (topic) return { kind: 'route', fn: 'HELP', args: topic.code };
    }
    // The longest run of words after the function that names a security; the words after it are arguments.
    for (let j = rest.length; j >= 1; j--) {
      const sec = resolveSecurity(rest.slice(0, j).join(' '));
      if (!sec) continue;
      if (head.topics && sec.cls !== 'equity') break;
      const args = argsWith(tokens[0], rest.slice(j).join(' ').toUpperCase());
      return { kind: 'route', fn: head.code, sec, ...(args ? { args } : {}) };
    }
    // A function that needs a security, followed by a ticker that is not built in: look it up online.
    // "COMPANYNEWS ABI BB" names a European listing with its market code.
    if (head.needsSec) {
      const at = tokens[1] === '$' ? 2 : 1;
      const t = tokens[at];
      const listed = tokens[at + 1] && isMarketCode(tokens[at + 1]) ? `${t} ${tokens[at + 1]}` : undefined;
      if (listed && parseListing(listed)) return { kind: 'error', message: `Unknown security: ${listed}`, lookup: listed };
      if (TICKER.test(t)) return { kind: 'error', message: `Unknown security: ${t}`, lookup: t };
    }
    return { kind: 'route', fn: head.code, args: argsWith(tokens[0], rest.join(' ').toUpperCase()) };
  }

  // Longest prefix that names a security, then an optional function.
  for (let j = tokens.length; j >= 1; j--) {
    const sec = resolveSecurity(raw.slice(0, j).join(' '));
    if (!sec) continue;
    const rest = tokens.slice(j);
    if (rest.length === 0) return { kind: 'route', sec };
    const fn = lookup(rest[0]);
    if (!fn) return { kind: 'error', message: unknownFunction(rest[0]) };
    return { kind: 'route', sec, fn: fn.code, args: argsWith(rest[0], rest.slice(1).join(' ')) };
  }

  // "APLD", "APLD PROFILE", "APLD US", "APLD US CHART", "ABI BB CHART": a ticker that is not built in.
  const listed = tokens[1] && isMarketCode(tokens[1]) && parseListing(`${tokens[0]} ${tokens[1]}`) ? `${tokens[0]} ${tokens[1]}` : undefined;
  const rest = tokens[1] === 'US' || listed ? tokens.slice(2) : tokens.slice(1);
  const name = listed ?? tokens[0];
  const lookupTicker = (listed || TICKER.test(tokens[0])) && (rest.length === 0 || !!lookup(rest[0])) ? name : undefined;
  return { kind: 'error', message: `Unknown command: ${s.toUpperCase()}. Type HELP for functions.`, lookup: lookupTicker };
}
