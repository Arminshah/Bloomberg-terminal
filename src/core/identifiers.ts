/**
 * Security identifier check digits: CUSIP's (the ABA's modulus 10 "double add double") and ISIN's (ISO 6166, Luhn on
 * the code with its letters as numbers). A US issuer's ISIN is "US", its CUSIP and the check digit.
 */

const value = (ch: string): number => {
  if (/\d/.test(ch)) return Number(ch);
  if (/[A-Z]/.test(ch)) return ch.charCodeAt(0) - 55;
  return { '*': 36, '@': 37, '#': 38 }[ch] ?? NaN;
};

/** The ninth character of a CUSIP from its first eight. */
export function cusipCheckDigit(base: string): string {
  if (!/^[0-9A-Z*@#]{8}$/.test(base)) return '';
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const v = value(base[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 10) + (v % 10);
  }
  return String((10 - (sum % 10)) % 10);
}

export const cusipValid = (cusip: string): boolean => /^[0-9A-Z*@#]{8}\d$/.test(cusip) && cusipCheckDigit(cusip.slice(0, 8)) === cusip[8];

/** The twelfth character of an ISIN from its first eleven. */
export function isinCheckDigit(base: string): string {
  if (!/^[A-Z]{2}[0-9A-Z]{9}$/.test(base)) return '';
  const digits = [...base].map((ch) => String(value(ch))).join('');
  let sum = 0;
  // From the right: the rightmost digit is doubled, as the check digit will follow it.
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export const isinValid = (isin: string): boolean => /^[A-Z]{2}[0-9A-Z]{9}\d$/.test(isin) && isinCheckDigit(isin.slice(0, 11)) === isin[11];

/** A US issuer's ISIN from its CUSIP, or '' when the CUSIP is not a valid one. */
export const usIsin = (cusip: string): string => (cusipValid(cusip) ? `US${cusip}${isinCheckDigit(`US${cusip}`)}` : '');

/** The 50 states and DC as the SEC writes a state of incorporation; other codes are countries (L2 Ireland, E9 Cayman). */
export const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

/** A SEDOL: six characters (no vowels) and a check digit, weights 1, 3, 1, 7, 3, 9. */
export function sedolValid(sedol: string): boolean {
  if (!/^[0-9BCDFGHJKLMNPQRSTVWXYZ]{6}\d$/.test(sedol)) return false;
  const weights = [1, 3, 1, 7, 3, 9];
  const sum = weights.reduce((a, w, i) => a + w * value(sedol[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(sedol[6]);
}
