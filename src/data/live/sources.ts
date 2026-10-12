import { engine } from '../market';
import type { SecurityDef } from '../types';
import { desktopData, yahooSymbolFor } from './yahoo';
import { TREASURY_IDS, treasuryAvailable } from './ust';

/**
 * Which securities the desktop app has a real source for. Everything else is
 * left out of its lists: the desktop app shows real data or nothing.
 */
export function hasRealSource(d: SecurityDef): boolean {
  if (yahooSymbolFor(d)) return true;
  if (treasuryAvailable() && TREASURY_IDS.has(d.id)) return true;
  return false;
}

/** Turns the simulator off in the desktop app. Call before the first render. */
export function enableRealOnly() {
  if (desktopData()) engine.setRealOnly(hasRealSource);
}
