import type { ReactNode } from 'react';

export function CalcInput({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'date'; placeholder?: string;
}) {
  return <label className="fld">{label}<input className="inp" aria-label={label} type={type} inputMode={type === 'date' ? undefined : 'decimal'} value={value}
    placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ width: type === 'date' ? 140 : 112 }} /></label>;
}

export function CalcSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="fld">{label}<select className="inp" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></label>;
}

export function CalcSource({ children }: { children: ReactNode }) {
  return <div className="pad-s muted"><span className="badge">CALCULATED</span> {children}</div>;
}
