import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { terminal } from '../terminal/state';
import { lookupFn } from '../terminal/registry';
import { styledMnemonic } from '../terminal/legacy';
import { closeTab, MAX_TABS, moveTab, newTab, renameTab, switchTab, tabRoute, tabTitle, workspaceTabs, type WorkspaceTab } from '../terminal/tabs';
import type { TerminalState } from '../terminal/state';
import { securityLabel } from './PanelToolbar';

/**
 * A tab's label as the 2024 frames write it (TE01 03:11): the screen's mnemonic in bold, then the security by name
 * with its yellow key ("DES APPLE INC Equity") or the function's name ("TOP Top News"). A tab the user named keeps
 * its name after the mnemonic.
 */
function tabLabel(tab: WorkspaceTab, live: TerminalState | undefined): { mnemonic: string; title: string } {
  const r = tabRoute(tab, live);
  if (!r) return { mnemonic: '', title: tab.name ?? 'New Tab' };
  const mnemonic = styledMnemonic(r.fn, r.args).mnemonic;
  return { mnemonic, title: tab.name ?? (r.sec ? securityLabel(r.sec) : (lookupFn(r.fn)?.name ?? r.fn)) };
}

/**
 * The window's workspace tabs, as in a browser and as the 2024 frames draw them (TE01 03:11): a light strip that is the
 * window's title bar, square tabs of equal width, the active one dark and joined to the toolbar with its ×. Click a tab
 * to show it, × (on another tab, shown on hover) or a middle click closes it, + opens a new one, a double click
 * renames it and dragging reorders. Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+PageUp/PageDown and
 * Ctrl+1 to Ctrl+9 work as in a browser (see App).
 */
/** Whether the window's own buttons are drawn over the page (the desktop app without a title bar). */
function useWindowControls(): boolean {
  const overlay = typeof navigator !== 'undefined' ? (navigator as Navigator & { windowControlsOverlay?: EventTarget & { visible: boolean } }).windowControlsOverlay : undefined;
  const [visible, setVisible] = useState(!!overlay?.visible);
  useEffect(() => {
    if (!overlay) return;
    const update = () => setVisible(overlay.visible);
    overlay.addEventListener('geometrychange', update);
    return () => overlay.removeEventListener('geometrychange', update);
  }, [overlay]);
  return visible;
}

export function WorkspaceTabs() {
  const t = workspaceTabs.use((x) => x);
  const live = terminal.use((x) => x);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const controls = useWindowControls();
  const strip = useRef<HTMLElement>(null);

  // When the tabs are wider than the bar they scroll; the active one (a new tab, say) is scrolled into sight.
  useEffect(() => {
    strip.current?.querySelector('.wtab.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [t.active, t.tabs.length]);

  const commit = (id: string) => {
    renameTab(id, draft);
    setEditing(null);
  };
  const onEditKey = (e: ReactKeyboardEvent<HTMLInputElement>, id: string) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(id);
    if (e.key === 'Escape') setEditing(null);
  };

  // In the desktop app the bar is the window's title bar: it drags the window, and the window's own buttons are drawn
  // over its right end, where the tabs never go (.wtabs-controls is as wide as they are; 0 elsewhere). The + stays
  // outside the tabs' scrolling strip, so it is always in sight.
  return (
    <div className={`wtabs-bar${controls ? ' wco' : ''}`}>
    <nav ref={strip} className="wtabs" aria-label="Workspace tabs" role="tablist">
      {t.tabs.map((tab, i) => {
        const on = tab.id === t.active;
        const title = tabTitle(tab, on ? live : undefined);
        const label = tabLabel(tab, on ? live : undefined);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={`wtab${on ? ' on' : ''}${dragged === tab.id ? ' dragging' : ''}`}
            title={`${title}${tab.name ? '' : ' (double-click to rename)'}`}
            draggable={editing !== tab.id}
            onClick={() => switchTab(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
            onMouseDown={(e) => {
              // A middle click must not start the browser's autoscroll.
              if (e.button === 1) e.preventDefault();
            }}
            onDoubleClick={() => {
              setDraft(tab.name ?? title);
              setEditing(tab.id);
            }}
            onDragStart={(e) => {
              setDragged(tab.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', tab.id);
            }}
            onDragEnd={() => setDragged(null)}
            onDragOver={(e) => {
              if (dragged) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged) moveTab(dragged, i);
              setDragged(null);
            }}
          >
            {editing === tab.id ? (
              <input
                className="wtab-edit"
                aria-label="Tab name"
                autoFocus
                value={draft}
                maxLength={40}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => onEditKey(e, tab.id)}
                onBlur={() => commit(tab.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="wtab-title">{label.mnemonic ? <b className="wtab-mn">{label.mnemonic}</b> : null}{label.mnemonic ? ' ' : ''}{label.title}</span>
            )}
            <button
              type="button"
              className="wtab-x"
              aria-label={`Close ${title}`}
              title="Close tab (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </nav>
    <button type="button" className="wtab-new" aria-label="New tab" title={t.tabs.length >= MAX_TABS ? `At most ${MAX_TABS} tabs` : 'New tab (Ctrl+T)'} disabled={t.tabs.length >= MAX_TABS} onClick={() => newTab()}>
      +
    </button>
    <div className="wtabs-controls" aria-hidden="true" />
    </div>
  );
}
