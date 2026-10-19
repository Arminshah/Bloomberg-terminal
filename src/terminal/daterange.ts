/**
 * Date fields as the terminal's amber range boxes take them (GP, HP): MM/DD/YYYY, MM/DD/YY, M/D/YY, YYYY-MM-DD or
 * YYYYMMDD. Dates are UTC midnights, the convention of daily bars.
 */

const DAY_MS = 86_400_000;

function utc(y: number, m: number, d: number): number | undefined {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return undefined;
  const t = Date.UTC(y, m - 1, d);
  // 02/31 rolls into March in Date.UTC; such a date was mistyped and is refused.
  const back = new Date(t);
  return back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t : undefined;
}

/** A typed date as UTC midnight, or undefined when it is not a date. Two-digit years are 2000 to 2099 up to 69. */
export function parseFieldDate(text: string): number | undefined {
  const s = text.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const yy = Number(m[3]);
    const y = m[3].length === 2 ? (yy <= 69 ? 2000 + yy : 1900 + yy) : yy;
    return utc(y, Number(m[1]), Number(m[2]));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  return undefined;
}

/** MM/DD/YYYY, the form the range fields show. */
export function fmtFieldDate(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/**
 * Bars from `from` to `to` (both inclusive, by bar time) in times sorted ascending: the count to show and how many
 * newer bars lie after the window. A window holding no bar returns a count of 0.
 */
export function windowBars(times: ArrayLike<number>, from: number, to: number): { count: number; after: number } {
  const n = times.length;
  let first = n;
  for (let i = 0; i < n; i++) if (times[i] >= from) { first = i; break; }
  let last = -1;
  for (let i = n - 1; i >= 0; i--) if (times[i] < to + DAY_MS) { last = i; break; }
  if (last < first) return { count: 0, after: Math.max(0, n - 1 - last) };
  return { count: last - first + 1, after: n - 1 - last };
}
