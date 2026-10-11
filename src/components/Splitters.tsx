import { useRef } from 'react';
import { setSplit, splitFor, terminal } from '../terminal/state';

/** Drag handles between panels; double-click restores equal sizes. */
export function Splitters() {
  const st = terminal.use((s) => s);
  const split = splitFor(st);
  const host = useRef<HTMLDivElement>(null);
  const layout = st.layout;

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
        style={{ top: `${acc * 100}%`, ...(layout === '3' ? { left: `${split.cols[0] * 100}%` } : {}) }}
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
