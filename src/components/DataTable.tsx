import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: ReactNode;
  num?: boolean;
  width?: number | string;
  render: (row: T, i: number) => ReactNode;
  sort?: (row: T) => number | string;
  cls?: (row: T) => string;
  title?: string;
  /** Hidden on narrow screens. */
  hideM?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T, e: MouseEvent) => void;
  defaultSort?: { key: string; dir: 1 | -1 };
  groupBy?: (row: T) => string;
  selected?: string;
  className?: string;
  numbered?: boolean;
  empty?: ReactNode;
  footer?: ReactNode;
  /** Optional display page; sorting still covers the entire filtered row set. */
  page?: { index: number; size: number };
}

/** Sortable, groupable data table with sticky headers. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, defaultSort, groupBy, selected, className, numbered, empty, footer, page }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(defaultSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    const withIdx = rows.map((r, i) => ({ r, i, v: get(r) }));
    withIdx.sort((a, b) => {
      const av = a.v;
      const bv = b.v;
      const an = typeof av === 'number' && !Number.isFinite(av);
      const bn = typeof bv === 'number' && !Number.isFinite(bv);
      if (an !== bn) return an ? 1 : -1;
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return a.i - b.i;
    });
    if (groupBy) {
      // Keep group order stable while sorting inside each group.
      const order: string[] = [];
      const buckets = new Map<string, T[]>();
      for (const r of rows) {
        const g = groupBy(r);
        if (!buckets.has(g)) {
          buckets.set(g, []);
          order.push(g);
        }
      }
      for (const { r } of withIdx) buckets.get(groupBy(r))!.push(r);
      return order.flatMap((g) => buckets.get(g)!);
    }
    return withIdx.map((x) => x.r);
  }, [rows, sort, columns, groupBy]);

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    setSort((s) => (s && s.key === c.key ? (s.dir === -1 ? { key: c.key, dir: 1 } : null) : { key: c.key, dir: c.num ? -1 : 1 }));
  };

  let lastGroup: string | null = null;
  const span = columns.length + (numbered ? 1 : 0);
  const offset = page ? Math.max(0, page.index) * page.size : 0;
  const visible = page ? sorted.slice(offset, offset + page.size) : sorted;
  return (
    <table className={`tbl ${className ?? ''}`}>
      <thead>
        <tr>
          {numbered && <th scope="col" className="num">#</th>}
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={`${c.num ? 'num ' : ''}${c.sort ? 'sortable ' : ''}${c.hideM ? 'hide-m' : ''}`}
              style={c.width ? { width: c.width } : undefined}
              onClick={() => toggle(c)}
              tabIndex={c.sort ? 0 : undefined}
              onKeyDown={c.sort ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c); } } : undefined}
              title={c.title ?? (c.sort ? 'Sort' : undefined)}
              aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
            >
              {c.label}
              {sort?.key === c.key && <span className="sort">{sort.dir === 1 ? '▲' : '▼'}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={span} className="empty">
              {empty ?? 'No data'}
            </td>
          </tr>
        )}
        {visible.map((r, index) => {
          const i = offset + index;
          const key = rowKey(r, i);
          const g = groupBy?.(r);
          const header =
            g != null && g !== lastGroup ? (
              <tr key={`g:${g}`} className="group">
                <td colSpan={span}>{g}</td>
              </tr>
            ) : null;
          lastGroup = g ?? null;
          return [
            header,
            <tr
              key={key}
              className={`${onRowClick ? 'click ' : ''}${selected === key ? 'sel' : ''}`}
              onClick={onRowClick ? (e) => onRowClick(r, e) : undefined}
            >
              {numbered && <td className="idx num">{i + 1})</td>}
              {columns.map((c) => (
                <td key={c.key} className={`${c.num ? 'num ' : ''}${c.cls?.(r) ?? ''} ${c.hideM ? 'hide-m' : ''}`}>
                  {c.render(r, i)}
                </td>
              ))}
            </tr>,
          ];
        })}
      </tbody>
      {footer && <tfoot>{footer}</tfoot>}
    </table>
  );
}
