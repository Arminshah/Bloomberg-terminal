/**
 * The layout of HP's price table as the terminal prints it: rows newest first, a blank line between weeks of daily
 * prices, and as many "Date / Last Price / Volume" blocks across the screen as fit, each page filled column by column.
 */

export type Slot<T> = { row: T } | { gap: true };

const DAY_MS = 86_400_000;

/** Rows (newest first) with a gap after each week when they are daily bars dated at UTC midnight. */
export function weekSlots<T extends { t: number }>(rows: T[], daily: boolean): Slot<T>[] {
  const out: Slot<T>[] = [];
  rows.forEach((row, i) => {
    out.push({ row });
    const next = rows[i + 1];
    if (!daily || !next) return;
    const day = new Date(row.t).getUTCDay();
    const before = new Date(next.t).getUTCDay();
    // Going back in time, the week changes when the weekday does not fall, or a whole week or more is skipped.
    if (before >= day || row.t - next.t >= 7 * DAY_MS) out.push({ gap: true });
  });
  return out;
}

/** How many blocks fit across and how many lines each holds, for a table area of this size. */
export function blockGeometry(width: number, height: number, rowHeight: number, blockWidth = 280, maxCols = 4): { cols: number; perCol: number } {
  const cols = Math.max(1, Math.min(maxCols, Math.floor(width / blockWidth)));
  const perCol = Math.max(8, Math.min(60, Math.floor(height / Math.max(1, rowHeight))));
  return { cols, perCol };
}

/**
 * Pages of blocks: each page holds `cols` columns of `perCol` lines, filled top to bottom then left to right. A
 * column does not start or end on a week's gap, so every block opens with a price.
 */
export function blockPages<T>(slots: Slot<T>[], cols: number, perCol: number): Slot<T>[][][] {
  const columns: Slot<T>[][] = [];
  let cur: Slot<T>[] = [];
  for (const s of slots) {
    if ('gap' in s && cur.length === 0) continue;
    cur.push(s);
    if (cur.length === perCol) {
      columns.push(cur);
      cur = [];
    }
  }
  if (cur.length) columns.push(cur);
  for (const c of columns) while (c.length && 'gap' in c[c.length - 1]) c.pop();
  const pages: Slot<T>[][][] = [];
  for (let i = 0; i < columns.length; i += cols) pages.push(columns.slice(i, i + cols));
  return pages;
}

/** Two-letter weekday of a UTC-dated bar, as the terminal prefixes daily dates: "Fr". */
export function weekday(t: number): string {
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(t).getUTCDay()];
}
