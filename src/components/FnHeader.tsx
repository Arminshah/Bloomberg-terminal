import type { ReactNode } from 'react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useMenu } from '../terminal/panel';
import type { SecurityDef } from '../data/types';
import type { MenuItem } from '../terminal/types';
import { primaryMnemonic } from '../terminal/legacy';
import { settings } from '../terminal/settings';
import { FavStar } from './FavStar';
import { PageIndicator } from './PageIndicator';

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
  /** The mnemonic shown when it is not the function's usual one: GPC for a candlestick CHART. */
  mnemonic?: string;
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
export function FnHeader({ code, mnemonic: shown, title, sec, sub, actions = [], tabs, tab, onTab, right, children }: Props) {
  const mnemonic = shown ?? primaryMnemonic(code);
  const showMnemonic = settings.use((s) => s.mnemonics) && mnemonic !== code;
  const items: MenuItem[] = useMemo(
    () => [
      ...(tabs ?? []).map((t) => ({ n: t.n, label: t.label, run: () => onTab?.(t.n) })),
      ...actions.map((a) => ({ n: a.n, label: a.label, run: a.onClick })),
    ],
    [tabs, actions, onTab],
  );
  useMenu(`hdr:${code}`, items);
  const ref = useRef<HTMLElement>(null);
  // A screen that scrolls as a whole keeps this header pinned at the top; its height lets the table headings pin
  // just below it, so every page keeps its column names.
  useLayoutEffect(() => {
    const header = ref.current;
    const body = header?.parentElement?.parentElement;
    if (!header || !body?.classList.contains('panel-body') || typeof ResizeObserver === 'undefined') return;
    const publish = () => body.style.setProperty('--fnh-h', `${header.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => {
      observer.disconnect();
      body.style.removeProperty('--fnh-h');
    };
  }, []);
  return (
    <header className="fnh" ref={ref}>
      <div className="fnh-row">
        <span className="fnh-actions">
          {right}
          {actions.map((a) => (
            <button key={a.n} type="button" className={`act${a.on ? ' on' : ''}`} onClick={a.onClick} title={a.title ?? `Type ${a.n} and press Enter`}>
              <b>{a.n})</b> {a.label}
            </button>
          ))}
        </span>
        <span className="fnh-caption">
          <PageIndicator />
          {showMnemonic && <span className="fnh-mnemonic" title={`${mnemonic} <GO> opens ${code}`}>{mnemonic}<small> &lt;GO&gt;</small></span>}
          <span className="fnh-code">{code}</span>
          <span className="fnh-title">{title}</span>
        </span>
      </div>
      {(sec || sub) && <div className="fnh-context">
        {sec && <span className="fnh-sec">{sec.id}</span>}
        {sec && <FavStar id={sec.id} />}
        {sub && <span className="fnh-sub">{sub}</span>}
      </div>}
      {tabs && (
        <nav className="tabs" aria-label={`${code} views`}>
          {tabs.map((t) => (
            <button key={t.n} type="button" className={`tab${t.n === tab ? ' on' : ''}`} aria-current={t.n === tab ? 'page' : undefined} onClick={() => onTab?.(t.n)}>
              <b>{t.n})</b> {t.label}
            </button>
          ))}
        </nav>
      )}
      {children}
    </header>
  );
}
