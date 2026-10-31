import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMenu, usePanelId } from '../terminal/panel';
import { currentRoute, terminal } from '../terminal/state';
import { leaveTabs, noteTab } from '../terminal/tab-history';
import type { SecurityDef } from '../data/types';
import type { MenuItem } from '../terminal/types';
import { primaryMnemonic } from '../terminal/legacy';
import { settings } from '../terminal/settings';
import { FavStar } from './FavStar';
import { PageIndicator } from './PageIndicator';
import { setTabPager } from '../terminal/paging';

export interface DropItem {
  label: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  /** Starts a new group, below a divider. */
  sep?: boolean;
}

export interface Action {
  n: number;
  label: string;
  onClick: () => void;
  on?: boolean;
  title?: string;
  /** The item opens these as a dropdown under it, as the terminal's "96) Actions ▾" (TE02 04:43); onClick is unused. */
  menu?: DropItem[];
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
  /** A row of inputs (amber fields, periodicity, currency) between the context line and the tabs. */
  controls?: ReactNode;
  /** The controls share the company line, as FA's do (TE04 04:55: "Volkswagen AG … Periodicity Annuals ▾ Cur …"). */
  inlineControls?: boolean;
  /**
   * The screen's tabs drawn as the 2024 frames draw DES's and FA's (TE01 03:11, TE04 04:55): unnumbered labels, the
   * active one light grey with black text, the others dark grey; their numbers still work with GO.
   */
  plainTabs?: boolean;
  /** Numbers before the tabs' labels: FA shows them (TE04 04:55), DES does not (TE01 03:11). */
  tabNumbers?: boolean;
  /**
   * A second row of numbered views under the tabs, on a light grey band with the chosen one in blue, as FA's "11) BBG
   * Adj Highlights" row (TE04 04:55).
   */
  subTabs?: Tab[];
  subTab?: number;
  onSubTab?: (n: number) => void;
  /** The tabs are the screen's pages: "Page 2/5" on the red bar counts them and PgDn / PgUp turn them (DES). */
  paged?: boolean;
  children?: ReactNode;
}

/** Function title strip: mnemonic, security, title, numbered actions and tabs. */
export function FnHeader({ code, mnemonic: shown, title, sec, sub, actions = [], tabs, tab, onTab, right, controls, inlineControls, plainTabs, tabNumbers = true, subTabs, subTab, onSubTab, paged, children }: Props) {
  const mnemonic = shown ?? primaryMnemonic(code);
  const showMnemonic = settings.use((s) => s.mnemonics) && mnemonic !== code;
  // The open dropdown and where it hangs: under its item, drawn fixed so the red bar's clipping does not cut it.
  const [drop, setDrop] = useState<{ n: number; x: number; y: number } | null>(null);
  const actionRefs = useRef(new Map<number, HTMLButtonElement>());
  const openDrop = useCallback((n: number) => {
    const r = actionRefs.current.get(n)?.getBoundingClientRect();
    setDrop((d) => (d?.n === n || !r ? null : { n, x: r.left, y: r.bottom }));
  }, []);
  const closeDrop = useCallback(() => setDrop(null), []);
  const items: MenuItem[] = useMemo(
    () => [
      ...(tabs ?? []).map((t) => ({ n: t.n, label: t.label, run: () => onTab?.(t.n) })),
      ...(subTabs ?? []).map((t) => ({ n: t.n, label: t.label, run: () => onSubTab?.(t.n) })),
      ...actions.map((a) => ({ n: a.n, label: a.label, run: a.menu ? () => openDrop(a.n) : a.onClick })),
    ],
    [tabs, subTabs, actions, onTab, onSubTab, openDrop],
  );
  useMenu(`hdr:${code}`, items);
  // The tab shown joins the panel's history, so the mouse's back button steps back through tabs as a browser's
  // steps back through pages.
  const panel = usePanelId();
  const route = terminal.use((s) => currentRoute(s, panel));
  const fresh = useRef(true);
  useEffect(() => {
    if (!tabs?.length || tab == null || !onTab) return;
    noteTab(panel, route, tab, onTab, fresh.current);
    fresh.current = false;
  }, [panel, route, tab, onTab, tabs]);
  useEffect(() => () => leaveTabs(panel, route), [panel, route]);
  // Tabs as pages: PgDn / PgUp turn them (paging.ts), and the red bar counts them.
  const pages = paged && tabs?.length && tab != null && onTab ? tabs.length : 0;
  const pageNo = pages ? tabs!.findIndex((t) => t.n === tab) + 1 : 0;
  useEffect(() => {
    if (!pages || !onTab || !tabs) return;
    setTabPager(panel, { page: pageNo, pages, go: (p) => onTab(tabs[p - 1].n) });
    return () => setTabPager(panel, undefined);
  }, [panel, pages, pageNo, onTab, tabs]);
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
  // The red bar reads as the terminal's: the loaded security in its amber field at the left, the numbered actions
  // beside it, and the page count, title and mnemonic at the right. With mnemonics shown, the descriptive function
  // name stays available to screen readers only; with them switched off it is shown in the mnemonic's place.
  return (
    <header className="fnh" ref={ref}>
      <div className="fnh-row">
        {sec && <span className="fnh-sec" title={sec.name}>{sec.id}</span>}
        <span className="fnh-actions">
          {right}
          {actions.map((a) => (
            <button
              key={a.n}
              ref={(el) => { if (el) actionRefs.current.set(a.n, el); else actionRefs.current.delete(a.n); }}
              type="button"
              className={`act${a.on || drop?.n === a.n ? ' on' : ''}${a.menu ? ' has-drop' : ''}`}
              onClick={a.menu ? () => openDrop(a.n) : a.onClick}
              title={a.title ?? `Type ${a.n} and press Enter`}
              aria-haspopup={a.menu ? 'menu' : undefined}
              aria-expanded={a.menu ? drop?.n === a.n : undefined}
            >
              <b>{a.n})</b> {a.label}
              {a.menu ? <span className="act-caret" aria-hidden="true">▾</span> : null}
            </button>
          ))}
        </span>
        <span className="fnh-caption">
          {pages ? <span className="fnh-page" data-testid="page-indicator">Page {pageNo}/{pages}</span> : <PageIndicator />}
          <svg className="fnh-launch" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.5 3.5v7h7V7.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 1.5h4.5V6M10.5 1.5 5 7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span className="fnh-title" title={showMnemonic ? `${mnemonic} <GO> opens ${title}` : undefined}>{title}</span>
          {/* The mnemonic shows in the panel's toolbar and command line, not on the red bar; here it is named for
              screen readers. */}
          {showMnemonic && <span className="fnh-mnemonic sr-only">{mnemonic} &lt;GO&gt;</span>}
          <span className="fnh-code sr-only">{code}</span>
        </span>
      </div>
      {(sec || sub) && <div className="fnh-context">
        {sec && <span className="fnh-name">{sec.name}</span>}
        {sec && <FavStar id={sec.id} />}
        {sub && <span className="fnh-sub">{sub}</span>}
        {inlineControls ? controls : null}
      </div>}
      {inlineControls && (sec || sub) ? null : controls}
      {tabs && (
        <nav className={`tabs${plainTabs ? ' tabs-plain' : ''}`} aria-label={`${code} views`}>
          {tabs.map((t) => (
            <button key={t.n} type="button" className={`tab${t.n === tab ? ' on' : ''}`} aria-current={t.n === tab ? 'page' : undefined} onClick={() => onTab?.(t.n)} title={tabNumbers ? undefined : `${t.n} <GO>`}>
              {tabNumbers ? <b>{t.n})</b> : null} {t.label}
            </button>
          ))}
        </nav>
      )}
      {subTabs?.length ? (
        <nav className="subtabs" aria-label={`${code} sub-views`}>
          {subTabs.map((t) => (
            <button key={t.n} type="button" className={`subtab${t.n === subTab ? ' on' : ''}`} aria-current={t.n === subTab ? 'page' : undefined} onClick={() => onSubTab?.(t.n)}>
              <b>{t.n})</b> {t.label}
            </button>
          ))}
        </nav>
      ) : null}
      {children}
      {drop ? <RedDrop at={drop} items={actions.find((a) => a.n === drop.n)?.menu ?? []} onClose={closeDrop} /> : null}
    </header>
  );
}

/**
 * A red bar item's dropdown (TE02 04:43): dark red, white unnumbered entries in groups split by thin dark lines. A click
 * outside, Escape or a pick closes it.
 */
function RedDrop({ at, items, onClose }: { at: { x: number; y: number }; items: DropItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.act.has-drop')) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="red-drop" role="menu" style={{ left: at.x, top: at.y }} data-testid="red-drop">
      {items.map((it, i) => (
        <button
          key={`${i}:${it.label}`}
          type="button"
          role="menuitem"
          className={`red-drop-item${it.sep && i > 0 ? ' sep' : ''}`}
          disabled={it.disabled}
          title={it.title}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
