import { engine } from '../market';
import type { SecurityDef } from '../types';
import { desktopData, yahooSymbolFor } from './yahoo';
import { TREASURY_IDS, treasuryAvailable } from './ust';
import { OFFICIAL_YIELD_IDS } from './govyields';
import { krakenOwns } from './kraken';
import { officialAvailable } from './official';
import { iexOwns } from './iex-engine';
import { fedinvestOwns } from './fedinvest';

/**
 * Which securities the desktop app has a real source for. Everything else is
 * left out of its lists: the desktop app shows real data or nothing.
 */
export function hasRealSource(d: SecurityDef): boolean {
  if (iexOwns(d.id)) return true;
  if (krakenOwns(d.id)) return true;
  if (fedinvestOwns(d.id)) return true;
  if (yahooSymbolFor(d)) return true;
  if (treasuryAvailable() && TREASURY_IDS.has(d.id)) return true;
  if (officialAvailable() && OFFICIAL_YIELD_IDS.has(d.id)) return true;
  return false;
}

/**
 * Turns the simulator off in the desktop app. Call after the saved lookups are
 * restored and before the first render. Company profiles are cleared, so every
 * figure comes from the source when it answers in this session: the built-in
 * ones were written by hand, and a stock looked up online kept the figures of
 * the day it was looked up (from older versions, with defaults in the gaps).
 */
export function enableRealOnly() {
  if (!desktopData()) return;
  for (const d of engine.defs) {
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
