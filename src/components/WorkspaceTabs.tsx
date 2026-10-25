import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { terminal } from '../terminal/state';
import { closeTab, MAX_TABS, moveTab, newTab, renameTab, switchTab, tabTitle, workspaceTabs } from '../terminal/tabs';

/**
 * The window's workspace tabs, as in a browser: click a tab to show it, × or a middle click closes it, + opens a new
 * one, a double click renames it and dragging reorders. Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+PageUp/PageDown and
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
  // over its right end, where the tabs never go (.wtabs-controls is as wide as they are; 0 elsewhere).
  return (
    <div className={`wtabs-bar${controls ? ' wco' : ''}`}>
    <nav className="wtabs" aria-label="Workspace tabs" role="tablist">
      {t.tabs.map((tab, i) => {
        const on = tab.id === t.active;
        const title = tabTitle(tab, on ? live : undefined);
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
              <span className="wtab-title">{title}</span>
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
      <button type="button" className="wtab-new" aria-label="New tab" title={t.tabs.length >= MAX_TABS ? `At most ${MAX_TABS} tabs` : 'New tab (Ctrl+T)'} disabled={t.tabs.length >= MAX_TABS} onClick={() => newTab()}>
        +
      </button>
    </nav>
    <div className="wtabs-controls" aria-hidden="true" />
    </div>
  );
}
