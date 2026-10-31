// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * A layout of your own: rows top to bottom, each with its tiles left to right, every row and tile sized as you drag
 * its dividers. The workspace draws it as one grid: each tile edge in any row is a column line, and a tile spans the
 * columns between its own edges, so every row keeps its own widths.
 */

export interface RowsLayout {
  /** Each row's share of the height, and its tiles' shares of the row's width; each set sums to 1. */
  rows: { h: number; tiles: number[] }[];
}

/** The most rows, the most tiles in a row, and the most tiles in all (the workspace's panels). */
export const MAX_ROWS = 4;
export const MAX_TILES_PER_ROW = 4;
export const MAX_TILES = 6;
/** The smallest share a row or tile keeps when a divider is dragged. */
export const MIN_SHARE = 0.12;

const even = (n: number) => Array.from({ length: n }, () => 1 / n);

/** Rows of equal height with `counts[i]` equal tiles each. */
export function rowsOf(counts: number[]): RowsLayout {
  return { rows: counts.map((n) => ({ h: 1 / counts.length, tiles: even(n) })) };
}

export function tileCount(r: RowsLayout): number {
  return r.rows.reduce((a, row) => a + row.tiles.length, 0);
}

/** Whether a set of tile counts per row is one the workspace can show. */
export function fits(counts: number[]): boolean {
  return counts.length >= 1 && counts.length <= MAX_ROWS && counts.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_TILES_PER_ROW) && counts.reduce((a, b) => a + b, 0) <= MAX_TILES;
}

const shares = (v: unknown, n: number): number[] | null => {
  if (!Array.isArray(v) || v.length !== n || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) return null;
  const sum = v.reduce((a: number, b: number) => a + b, 0);
  return v.map((x: number) => x / sum);
};

/** A saved or stored layout as the workspace can show it, its shares summing to 1; undefined when it is damaged. */
export function normalizeRows(v: unknown): RowsLayout | undefined {
  const rows = (v as RowsLayout | undefined)?.rows;
  if (!Array.isArray(rows) || !fits(rows.map((r) => (Array.isArray(r?.tiles) ? r.tiles.length : 0)))) return undefined;
  const h = shares(rows.map((r) => r?.h), rows.length);
  const tiles = rows.map((r) => shares(r.tiles, r.tiles.length));
  if (!h || tiles.some((t) => !t)) return undefined;
  return { rows: rows.map((_, i) => ({ h: h[i], tiles: tiles[i]! })) };
}

export interface RowsGrid {
  /** Column widths and row heights, as fractions. */
  columns: number[];
  heights: number[];
  /** Each tile's place, in order: its row and the column lines (1-based) it spans. */
  places: { row: number; from: number; to: number }[];
}

/** The single grid that draws a layout: the column lines are the tile edges of every row. */
export function rowsGrid(r: RowsLayout): RowsGrid {
  const key = (x: number) => Math.round(x * 1e6);
  const edges = new Map<number, number>([[0, 0], [key(1), 1]]);
  const rowEdges = r.rows.map((row) => {
    let acc = 0;
    return [0, ...row.tiles.map((t) => (acc += t))].map((x, i, a) => (i === a.length - 1 ? 1 : x));
  });
  for (const es of rowEdges) for (const e of es) edges.set(key(e), e);
  const lines = [...edges.entries()].sort((a, b) => a[0] - b[0]);
  const lineOf = (x: number) => lines.findIndex(([k]) => k === key(x)) + 1;
  const columns = lines.slice(1).map(([, x], i) => x - lines[i][1]);
  const places = rowEdges.flatMap((es, row) => es.slice(0, -1).map((e, i) => ({ row: row + 1, from: lineOf(e), to: lineOf(es[i + 1]) })));
  return { columns, heights: r.rows.map((row) => row.h), places };
}

/** Moves the edge after one of a set of shares to `at` (the share of the whole from the set's start), keeping both sides at least MIN_SHARE. */
function moveEdge(set: number[], index: number, at: number): number[] {
  const before = set.slice(0, index).reduce((a, b) => a + b, 0);
  const pair = set[index] + set[index + 1];
  const a = Math.min(pair - MIN_SHARE, Math.max(MIN_SHARE, at - before));
  const next = set.slice();
  next[index] = a;
  next[index + 1] = pair - a;
  return next;
}

/** The layout with the divider below row `index` moved to `at` (0 at the top, 1 at the bottom). */
export function resizeRow(r: RowsLayout, index: number, at: number): RowsLayout {
  if (index < 0 || index >= r.rows.length - 1) return r;
  const h = moveEdge(r.rows.map((x) => x.h), index, at);
  return { rows: r.rows.map((row, i) => ({ ...row, h: h[i] })) };
}

/** The layout with the divider after tile `index` of row `row` moved to `at` (0 at the left, 1 at the right). */
export function resizeTile(r: RowsLayout, row: number, index: number, at: number): RowsLayout {
  const target = r.rows[row];
  if (!target || index < 0 || index >= target.tiles.length - 1) return r;
  return { rows: r.rows.map((x, i) => (i === row ? { ...x, tiles: moveEdge(x.tiles, index, at) } : x)) };
}

/** Equal sizes again, the same rows and tiles. */
export function evenRows(r: RowsLayout): RowsLayout {
  return rowsOf(r.rows.map((x) => x.tiles.length));
}
