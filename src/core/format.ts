const nf = new Map<string, Intl.NumberFormat>();

function formatter(min: number, max: number, grouping = true): Intl.NumberFormat {
  const key = `${min}:${max}:${grouping}`;
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping });
    nf.set(key, f);
  }
  return f;
}

export const DASH = '--';

export function fmtNum(v: number | undefined | null, dec = 2, grouping = true): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const out = formatter(dec, dec, grouping).format(v);
  return out === '-0' || /^-0\.0*$/.test(out) ? out.slice(1) : out;
}

export function fmtSigned(v: number | undefined | null, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const s = fmtNum(Math.abs(v), dec);
  if (Number(s.replace(/,/g, '')) === 0) return s;
  return (v > 0 ? '+' : '-') + s;
}

export function fmtPct(v: number | undefined | null, dec = 2, sign = true): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return (sign ? fmtSigned(v, dec) : fmtNum(v, dec)) + '%';
}

/** Compact magnitude: 1.23T, 456.70B, 12.30M, 45.60K. Input in units. */
export function fmtBig(v: number | undefined | null, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e12) return `${sign}${fmtNum(a / 1e12, dec)}T`;
  if (a >= 1e9) return `${sign}${fmtNum(a / 1e9, dec)}B`;
  if (a >= 1e6) return `${sign}${fmtNum(a / 1e6, dec)}M`;
  if (a >= 1e4) return `${sign}${fmtNum(a / 1e3, dec)}K`;
  return `${sign}${fmtNum(a, a >= 100 || Number.isInteger(a) ? 0 : dec)}`;
}

/** Input in millions. */
export function fmtMln(v: number | undefined | null, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return fmtBig(v * 1e6, dec);
}

export function fmtInt(v: number | undefined | null): string {
  return fmtNum(v, 0);
}

/** Yield change in basis points. */
export function fmtBp(changeInPct: number | undefined | null, dec = 1): string {
  if (changeInPct == null || !Number.isFinite(changeInPct)) return DASH;
  return fmtSigned(changeInPct * 100, dec);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export type TzMode = 'local' | string;

let tzMode: TzMode = 'local';
export function setTimeZone(tz: TzMode) {
  tzMode = tz;
  partsCache.clear();
}
export function getTimeZone(): TzMode {
  return tzMode;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    partsCache.set(tz, f);
  }
  return f;
}

interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number }

export function zonedParts(ms: number, tz: TzMode = tzMode): Parts {
  if (tz === 'local') {
    const d = new Date(ms);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
  }
  const p: Record<string, string> = {};
  for (const x of partsFmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** Converts a wall-clock time in `tz` to epoch ms. */
export function zonedToUtc(y: number, m0: number, d: number, hh: number, mm: number, tz: string): number {
  let guess = Date.UTC(y, m0, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, tz);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    guess -= asUtc - Date.UTC(y, m0, d, hh, mm);
  }
  return guess;
}

/** MM/DD/YY in the display time zone. */
export function fmtDate(ms: number, tz: TzMode = tzMode): string {
  if (!Number.isFinite(ms)) return DASH;
  const p = zonedParts(ms, tz);
  return `${pad(p.mo)}/${pad(p.d)}/${String(p.y).slice(2)}`;
}

/** MM/DD/YYYY for UTC-dated bars (daily history). */
export function fmtDay(ms: number, long = false): string {
  if (!Number.isFinite(ms)) return DASH;
  const d = new Date(ms);
  const y = long ? String(d.getUTCFullYear()) : String(d.getUTCFullYear()).slice(2);
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${y}`;
}

/** Earnings report date. "~" marks a date estimated from the quarter end; an unknown time of day is left out. */
export function fmtEarnDate(e: { date: number; approx?: boolean; timing?: string }, withTiming = true): string {
  const time = withTiming && e.timing && e.timing !== '--' ? ` ${e.timing}` : '';
  return `${e.approx ? '~' : ''}${fmtDay(e.date)}${time}`;
}

export function fmtTime(ms: number, seconds = true, tz: TzMode = tzMode): string {
  if (!Number.isFinite(ms)) return DASH;
  const p = zonedParts(ms, tz);
  return seconds ? `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}` : `${pad(p.h)}:${pad(p.mi)}`;
}

/** Time if today, else date (the way monitors show last-update stamps). */
export function fmtStamp(ms: number, now = Date.now()): string {
  if (!Number.isFinite(ms)) return DASH;
  const a = zonedParts(ms);
  const b = zonedParts(now);
  return a.y === b.y && a.mo === b.mo && a.d === b.d ? fmtTime(ms, false) : fmtDate(ms);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Oct 9" style, UTC-dated. */
export function fmtMonthDay(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Price with the security's decimals; yields keep 3 dp. */
export function fmtPrice(v: number | undefined | null, dec: number): string {
  return fmtNum(v, dec);
}

export function signClass(v: number | undefined | null): '' | 'up' | 'dn' {
  if (v == null || !Number.isFinite(v) || v === 0) return '';
  return v > 0 ? 'up' : 'dn';
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
