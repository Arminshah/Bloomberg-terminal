// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useRef } from 'react';
import { rowsOrDefault, setRows, setSplit, splitFor, terminal } from '../terminal/state';
import { evenRows, resizeRow, resizeTile, type RowsLayout } from '../terminal/rows-layout';
import type { FixedLayoutId } from '../terminal/types';

/** Drag handles between panels; double-click restores equal sizes. */
export function Splitters() {
  const isRows = terminal.use((s) => s.layout === 'rows');
  return isRows ? <RowSplitters /> : <GridSplitters />;
}

/**
 * A layout of your own: a handle between each two rows, and within each row a handle between each two of its tiles,
 * as tall as the row. Double-click restores equal sizes.
 */
function RowSplitters() {
  const stored = terminal.use((s) => s.rows);
  const rows = useMemo(() => rowsOrDefault(stored), [stored]);
  const host = useRef<HTMLDivElement>(null);
  const drag = (axis: 'x' | 'y', apply: (r: RowsLayout, at: number) => RowsLayout) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = host.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const at = axis === 'x' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      setRows(apply(rowsOrDefault(terminal.get().rows), at));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const even = () => setRows(evenRows(rowsOrDefault(terminal.get().rows)));
  const handles: React.ReactElement[] = [];
  let top = 0;
  rows.rows.forEach((row, r) => {
    let left = 0;
    row.tiles.slice(0, -1).forEach((w, t) => {
      left += w;
      handles.push(
        <div
          key={`t${r}.${t}`}
          className="splitter v"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize row ${r + 1}, tiles ${t + 1} and ${t + 2}`}
          style={{ left: `${left * 100}%`, top: `${top * 100}%`, bottom: 'auto', height: `${row.h * 100}%` }}
          onPointerDown={drag('x', (x, at) => resizeTile(x, r, t, at))}
          onDoubleClick={even}
        />,
      );
    });
    top += row.h;
    if (r < rows.rows.length - 1) {
      handles.push(
        <div
          key={`r${r}`}
          className="splitter h"
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize rows ${r + 1} and ${r + 2}`}
          style={{ top: `${top * 100}%` }}
          onPointerDown={drag('y', (x, at) => resizeRow(x, r, at))}
          onDoubleClick={even}
        />,
      );
    }
  });
  return (
    <div ref={host} className="splitters" aria-hidden={handles.length === 0}>
      {handles}
    </div>
  );
}

function GridSplitters() {
  const st = terminal.use((s) => s);
  const split = splitFor(st);
  const host = useRef<HTMLDivElement>(null);
  const layout = st.layout as FixedLayoutId;

  const drag = (axis: 'cols' | 'rows', index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = host.current?.parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const start = splitFor(terminal.get())[axis].slice();
    const total = start[index] + start[index + 1];
    const before = start.slice(0, index).reduce((a, b) => a + b, 0);
    const move = (ev: PointerEvent) => {
      const pos = axis === 'cols' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      const min = 0.12;
      const a = Math.min(total - min, Math.max(min, pos - before));
      const next = start.slice();
      next[index] = a;
      next[index + 1] = total - a;
      const cur = splitFor(terminal.get());
      setSplit(layout, axis === 'cols' ? { ...cur, cols: next } : { ...cur, rows: next });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = axis === 'cols' ? 'col-resize' : 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handles: React.ReactElement[] = [];
  let acc = 0;
  split.cols.slice(0, -1).forEach((c, i) => {
    acc += c;
    handles.push(
      <div
        key={`c${i}`}
        className="splitter v"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        style={{ left: `${acc * 100}%` }}
        onPointerDown={drag('cols', i)}
        onDoubleClick={() => setSplit(layout, undefined)}
      />,
    );
  });
  acc = 0;
  split.rows.slice(0, -1).forEach((r, i) => {
    acc += r;
    handles.push(
      <div
        key={`r${i}`}
        className="splitter h"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panels"
        style={{ top: `${acc * 100}%`, ...(layout === '3' ? { left: `${split.cols[0] * 100}%` } : layout === '5' ? { right: `${split.cols[2] * 100}%` } : {}) }}
        onPointerDown={drag('rows', i)}
        onDoubleClick={() => setSplit(layout, undefined)}
      />,
    );
  });
  return (
    <div ref={host} className="splitters" aria-hidden={handles.length === 0}>
      {handles}
    </div>
  );
}
