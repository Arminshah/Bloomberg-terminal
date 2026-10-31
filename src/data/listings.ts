// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * European exchanges the app can look stocks up on, through Yahoo Finance: Yahoo's exchange code, the
 * two-letter market code the app writes after a ticker (ABI BB), Yahoo's symbol suffix (ABI.BR), the
 * exchange's name and its country. Codes checked against Yahoo's chart answers on 18 October 2026.
 */
export interface Listing {
  code: string;
  suffix: string;
  exch: string;
  country: string;
}

export const EU_EXCHANGES: Record<string, Listing> = {
  BRU: { code: 'BB', suffix: 'BR', exch: 'EN Brussels', country: 'BE' },
  PAR: { code: 'FP', suffix: 'PA', exch: 'EN Paris', country: 'FR' },
  AMS: { code: 'NA', suffix: 'AS', exch: 'EN Amsterdam', country: 'NL' },
  LIS: { code: 'PL', suffix: 'LS', exch: 'EN Lisbon', country: 'PT' },
  ISE: { code: 'ID', suffix: 'IR', exch: 'EN Dublin', country: 'IE' },
  GER: { code: 'GY', suffix: 'DE', exch: 'Xetra', country: 'DE' },
  LSE: { code: 'LN', suffix: 'L', exch: 'London', country: 'GB' },
  MIL: { code: 'IM', suffix: 'MI', exch: 'Borsa Italiana', country: 'IT' },
  MCE: { code: 'SM', suffix: 'MC', exch: 'BME Madrid', country: 'ES' },
  EBS: { code: 'SW', suffix: 'SW', exch: 'SIX Swiss Ex', country: 'CH' },
  STO: { code: 'SS', suffix: 'ST', exch: 'Nasdaq Stockholm', country: 'SE' },
  CPH: { code: 'DC', suffix: 'CO', exch: 'Copenhagen', country: 'DK' },
  HEL: { code: 'FH', suffix: 'HE', exch: 'Nasdaq Helsinki', country: 'FI' },
  OSL: { code: 'NO', suffix: 'OL', exch: 'Oslo Bors', country: 'NO' },
  VIE: { code: 'AV', suffix: 'VI', exch: 'Vienna', country: 'AT' },
};

const BY_CODE = new Map(Object.values(EU_EXCHANGES).map((e) => [e.code, e]));
const BY_SUFFIX = new Map(Object.values(EU_EXCHANGES).map((e) => [e.suffix, e]));

/** Whether a word is one of the market codes (BB, FP, NA...). */
export const isMarketCode = (w: string) => BY_CODE.has(w.toUpperCase());

/**
 * A European listing typed as "ABI BB", "ABI BB Equity", "ABI.BR" or "VOLV/B SS": its root ticker (class
 * shares with a slash) and exchange; null for anything else, US class shares such as BRK.B included.
 */
export function parseListing(input: string): { root: string; listing: Listing } | null {
  const t = input.trim().toUpperCase().replace(/^\$/, '').replace(/\s+EQUITY$/, '').trim();
  let m = /^([A-Z0-9]{1,8}(?:[/-][A-Z])?)\s+([A-Z]{2})$/.exec(t);
  if (m && BY_CODE.has(m[2])) return { root: m[1].replace('-', '/'), listing: BY_CODE.get(m[2])! };
  m = /^([A-Z0-9]{1,8}(?:-[A-Z])?)\.([A-Z]{1,2})$/.exec(t);
  if (m && BY_SUFFIX.has(m[2])) return { root: m[1].replace('-', '/'), listing: BY_SUFFIX.get(m[2])! };
  return null;
}

/** Yahoo's symbol for a European listing: VOLV/B on Stockholm is VOLV-B.ST. */
export const yahooListingSymbol = (root: string, l: Listing) => `${root.replace('/', '-')}.${l.suffix}`;
