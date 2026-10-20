import { useEffect, useState } from 'react';
import { fieldDatePattern, fmtFieldDate, parseFieldDate } from '../terminal/daterange';

function DateField({ value, label, onCommit }: { value: number; label: string; onCommit: (ms: number) => void }) {
  const shown = fmtFieldDate(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);
  const commit = () => {
    if (text === shown) return;
    const ms = parseFieldDate(text);
    if (ms === undefined) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(ms);
  };
  return (
    <input
      className={`inp range-date${bad ? ' bad' : ''}`}
      aria-label={label}
      title={bad ? `Type a date as ${fieldDatePattern()}` : `${label}: type a date as ${fieldDatePattern()} and press Enter`}
      value={text}
      size={10}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          setText(shown);
          setBad(false);
        }
      }}
    />
  );
}

/**
 * The amber "start - end" range boxes of the terminal's GP and HP screens. They show the range in use and take a typed
 * date with Enter; a date that cannot be read is marked and not applied.
 */
export function DateRangeFields({ from, to, onChange, label = 'Range' }: { from: number; to: number; onChange: (from: number, to: number) => void; label?: string }) {
  return (
    <span className="range-fields">
      <span className="amber">{label}</span>
      <DateField value={from} label="Start date" onCommit={(ms) => onChange(Math.min(ms, to), Math.max(ms, to))} />
      <span className="muted">-</span>
      <DateField value={to} label="End date" onCommit={(ms) => onChange(Math.min(from, ms), Math.max(from, ms))} />
    </span>
  );
}
