import { useEffect, useState } from 'react';
import type { SecCompany } from './sec';

/**
 * A company's related securities (RELS): every ticker the SEC lists under its CIK (its share classes, preferred shares
 * and other listed securities), and the listings of its share class in other countries from OpenFIGI (each country's
 * composite line, as OpenFIGI codes it).
 */

export interface FigiListing {
  /** OpenFIGI's exchange code for the country's composite line: US, GR, LN, SW... */
  exchCode: string;
  ticker: string;
  name: string;
  securityType: string;
  figi: string;
}

export interface FigiListingsAnswer {
  status: number;
  listings: FigiListing[];
  shareClassFIGI?: string;
  name?: string;
  /** OpenFIGI knows no US line for the ticker. */
  none?: boolean;
  gated?: string;
  error?: string;
  cached?: boolean;
}

/** The countries of the composite codes the app names; any other code is shown as OpenFIGI gives it. */
export const COMPOSITE_COUNTRY: Record<string, string> = {
  US: 'United States', CN: 'Canada', MM: 'Mexico', BZ: 'Brazil', AR: 'Argentina', CI: 'Chile', CB: 'Colombia', PE: 'Peru',
  LN: 'United Kingdom', GR: 'Germany', FP: 'France', NA: 'Netherlands', BB: 'Belgium', IM: 'Italy', SM: 'Spain', SW: 'Switzerland',
  AV: 'Austria', PL: 'Portugal', ID: 'Ireland', SS: 'Sweden', NO: 'Norway', DC: 'Denmark', FH: 'Finland', PW: 'Poland',
  JP: 'Japan', HK: 'Hong Kong', AU: 'Australia', SP: 'Singapore', KS: 'South Korea', TT: 'Taiwan', IN: 'India', IT: 'Israel', SJ: 'South Africa',
};

/** Every ticker the SEC lists under the company's CIK, its own first, then the others in the SEC's order. */
export function secSiblings(list: SecCompany[], cik: number, own: string): SecCompany[] {
  const mine = list.filter((c) => c.cik === cik);
  return [...mine.filter((c) => c.ticker === own), ...mine.filter((c) => c.ticker !== own)];
}

export function figiListingsAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.openfigiListings === 'function';
}

/** The share class's listings in other countries, for a US ticker; null while loading. */
export function useFigiListings(ticker: string | null): FigiListingsAnswer | null {
  const [state, setState] = useState<{ ticker: string | null; answer: FigiListingsAnswer | null }>({ ticker: null, answer: null });
  useEffect(() => {
    if (!ticker || !figiListingsAvailable()) return;
    let live = true;
    window
      .arminDesktop!.openfigiListings!(ticker)
      .then((answer) => live && setState({ ticker, answer }))
      .catch((err) => live && setState({ ticker, answer: { status: 0, listings: [], error: String((err as Error)?.message ?? err) } }));
    return () => {
      live = false;
    };
  }, [ticker]);
  return state.ticker === ticker ? state.answer : null;
}
