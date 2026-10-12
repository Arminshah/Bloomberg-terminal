import { engine } from '../market';
import type { SecurityDef } from '../types';
import { desktopData, yahooSymbolFor } from './yahoo';
import { TREASURY_IDS, treasuryAvailable } from './ust';
import { OFFICIAL_YIELD_IDS } from './govyields';
import { officialAvailable } from './official';

/**
 * Which securities the desktop app has a real source for. Everything else is
 * left out of its lists: the desktop app shows real data or nothing.
 */
export function hasRealSource(d: SecurityDef): boolean {
  if (yahooSymbolFor(d)) return true;
  if (treasuryAvailable() && TREASURY_IDS.has(d.id)) return true;
  if (officialAvailable() && OFFICIAL_YIELD_IDS.has(d.id)) return true;
  return false;
}

/**
 * Turns the simulator off in the desktop app. Call before the first render.
 * The built-in company profiles (shares, revenue, beta, chief executive and
 * so on) were written by hand and can be out of date, so they are cleared:
 * every figure comes from the source when it answers.
 */
export function enableRealOnly() {
  if (!desktopData()) return;
  for (const d of engine.defs) {
    if (d.dynamic) continue; // looked up online: already from the source
    if (d.eq) {
      const eq = d.eq;
      eq.shares = eq.beta = eq.rev = eq.ni = eq.dps = eq.emp = eq.netDebt = eq.book = NaN;
      eq.ceo = undefined;
      eq.founded = undefined;
      eq.hq = '';
      eq.desc = '';
    }
    if (d.cry) d.cry.supply = NaN;
  }
  engine.setRealOnly(hasRealSource);
}
