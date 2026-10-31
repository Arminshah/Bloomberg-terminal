import type { FinPeriod } from './fundamentals';

/** One figure of the grid: reported, or an analysts' estimate where nothing is reported yet. */
export interface GridCell {
  value: number;
  estimate: boolean;
}

export type GridRow = 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export const GRID_ROWS: GridRow[] = ['FY', 'Q1', 'Q2', 'Q3', 'Q4'];

/** The fiscal year a period ending on `end` belongs to, for a fiscal year that ends in month `fye` (1 to 12). */
export function fiscalYearOf(end: number, fye: number): number {
  const d = new Date(end);
  const m = d.getUTCMonth() + 1;
  // A 52- or 53-week year can end a few days into the next month: within a week counts as the month before.
  const shifted = d.getUTCDate() <= 7 ? (m === 1 ? 12 : m - 1) : m;
  const y = d.getUTCDate() <= 7 && m === 1 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  return shifted <= fye ? y : y + 1;
}

/** Which quarter of its fiscal year (1 to 4) a quarter ending on `end` is, for a fiscal year ending in month `fye`. */
export function fiscalQuarterOf(end: number, fye: number): number {
  const d = new Date(end);
  const m = d.getUTCMonth() + 1;
  const shifted = d.getUTCDate() <= 7 ? (m === 1 ? 12 : m - 1) : m;
  return Math.floor(((shifted - fye - 1 + 24) % 12) / 3) + 1;
}

/**
 * A figure by fiscal year and quarter, as DES's Revenue & EPS page lays it out (TE01 02:31): the last `span` fiscal
 * years as columns, FY and Q1 to Q4 as rows. Reported figures come from the statements; a fiscal year with nothing
 * reported takes the analysts' estimate for it, marked as an estimate. Years run up to the latest with any figure.
 */
export function fiscalGrid(
  annual: FinPeriod[],
  quarterly: FinPeriod[],
  fye: number,
  pick: (p: FinPeriod) => number,
  estimates: { year: number; value: number }[] = [],
  span = 6,
): { years: number[]; cells: Record<GridRow, (GridCell | null)[]> } {
  const fy = new Map<number, GridCell>();
  const q = new Map<string, GridCell>();
  for (const p of annual) {
    const v = pick(p);
    if (Number.isFinite(v)) fy.set(fiscalYearOf(p.end, fye), { value: v, estimate: false });
  }
  for (const p of quarterly) {
    const v = pick(p);
    if (Number.isFinite(v)) q.set(`${fiscalYearOf(p.end, fye)}Q${fiscalQuarterOf(p.end, fye)}`, { value: v, estimate: false });
  }
  for (const e of estimates) if (Number.isFinite(e.value) && !fy.has(e.year)) fy.set(e.year, { value: e.value, estimate: true });
  const known = [...fy.keys(), ...[...q.keys()].map((k) => Number(k.slice(0, 4)))];
  if (!known.length) return { years: [], cells: { FY: [], Q1: [], Q2: [], Q3: [], Q4: [] } };
  const last = Math.max(...known);
  const years = Array.from({ length: span }, (_, i) => last - span + 1 + i);
  const cells = { FY: [], Q1: [], Q2: [], Q3: [], Q4: [] } as Record<GridRow, (GridCell | null)[]>;
  for (const y of years) {
    cells.FY.push(fy.get(y) ?? null);
    for (const n of [1, 2, 3, 4] as const) cells[`Q${n}`].push(q.get(`${y}Q${n}`) ?? null);
  }
  return { years, cells };
}

/** Revenue in millions as the page writes it: "131.8B" from a billion up, else "512.3M". */
export function revenueText(millions: number): string {
  if (!Number.isFinite(millions)) return '';
  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return Math.abs(millions) >= 1000 ? `${fmt(millions / 1000)}B` : `${fmt(millions)}M`;
}

/** EPS as the page writes it: three decimals without the leading zero below one (".541"), else two ("2.33"). */
export function epsText(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (Math.abs(v) < 1) return `${v < 0 ? '-' : ''}${Math.abs(v).toFixed(3).slice(1)}`;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
