import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useMenu } from '../terminal/panel';
import type { SecurityDef } from '../data/types';
import type { MenuItem } from '../terminal/types';

export interface Action {
  n: number;
  label: string;
  onClick: () => void;
  on?: boolean;
  title?: string;
}

export interface Tab {
  n: number;
  label: string;
}

interface Props {
  code: string;
  title: string;
  sec?: SecurityDef;
  sub?: ReactNode;
  actions?: Action[];
  tabs?: Tab[];
  tab?: number;
  onTab?: (n: number) => void;
  right?: ReactNode;
  children?: ReactNode;
}

/** Function title strip: mnemonic, security, title, numbered actions and tabs. */
export function FnHeader({ code, title, sec, sub, actions = [], tabs, tab, onTab, right, children }: Props) {
  const items: MenuItem[] = useMemo(
    () => [
      ...(tabs ?? []).map((t) => ({ n: t.n, label: t.label, run: () => onTab?.(t.n) })),
      ...actions.map((a) => ({ n: a.n, label: a.label, run: a.onClick })),
    ],
    [tabs, actions, onTab],
  );
  useMenu(`hdr:${code}`, items);
  return (
    <header className="fnh">
      <div className="fnh-row">
        <span className="fnh-code">{code}</span>
        {sec && <span className="fnh-sec">{sec.id}</span>}
        <span className="fnh-title">{title}</span>
        {sub && <span className="fnh-sub hide-m">{sub}</span>}
        <span className="fnh-actions">
          {right}
          {actions.map((a) => (
            <button key={a.n} type="button" className={`act${a.on ? ' on' : ''}`} onClick={a.onClick} title={a.title ?? `Type ${a.n} and press Enter`}>
              <b>{a.n})</b> {a.label}
            </button>
          ))}
        </span>
      </div>
      {tabs && (
        <nav className="tabs" aria-label={`${code} views`}>
          {tabs.map((t) => (
            <button key={t.n} type="button" className={`tab${t.n === tab ? ' on' : ''}`} onClick={() => onTab?.(t.n)}>
              <b>{t.n})</b> {t.label}
            </button>
          ))}
        </nav>
      )}
      {children}
    </header>
  );
}
