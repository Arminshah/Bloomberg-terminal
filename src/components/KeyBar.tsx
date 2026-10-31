import { execute } from '../terminal/exec';
import { back, PANEL_COUNT, panelCount, setActive, terminal } from '../terminal/state';
import { showPanelHelp, showPanelMenu } from '../terminal/actions';
import { clearPanelInput, FKEY_TEXT, focusPanelInput, pagePanel, recallPanelCommand, submitPanel, typeInto } from './CommandLine';

interface Key {
  label: string;
  sub: string;
  color: 'yellow' | 'green' | 'red' | 'gray' | 'blue';
  run: (panel: number) => void;
  title: string;
  mobile?: boolean;
  /** A market sector key: the word it types, the same as its function key on the keyboard (FKEY_TEXT). */
  types?: string;
}

/** A yellow market sector key: clicking it types what its function key types. */
const sector = (label: string, fkey: string, title: string, mobile = false): Key => ({
  label,
  sub: fkey,
  color: 'yellow',
  types: FKEY_TEXT[fkey],
  run: (p) => typeInto(p, FKEY_TEXT[fkey]),
  title,
  ...(mobile ? { mobile } : {}),
});

export const KEYS: Key[] = [
  { label: 'HELP', sub: 'F1', color: 'green', run: showPanelHelp, title: 'Help page for the current function (F1); press twice for Live Help, the help desk' },
  { label: 'MENU', sub: 'ALT+END', color: 'green', run: showPanelMenu, title: 'Related functions menu (Alt+End)', mobile: true },
  { label: 'BACK', sub: 'END', color: 'green', run: (p) => back(p), title: 'Previous screen (End, Alt+←, or Backspace on an empty line)' },
  sector('GOVT', 'F2', 'Government bonds market sector (F2)'),
  sector('CORP', 'F3', 'Corporate bonds market sector (F3)'),
  sector('MTGE', 'F4', 'Mortgage securities market sector (F4)'),
  sector('M-MKT', 'F5', 'Money market sector (F5)'),
  sector('MUNI', 'F6', 'Municipal bonds market sector (F6)'),
  sector('PFD', 'F7', 'Preferred securities market sector (F7)'),
  sector('EQUITY', 'F8', 'Stocks market sector (F8)', true),
  sector('CMDTY', 'F9', 'Commodities market sector (F9)'),
  sector('INDEX', 'F10', 'Indices market sector (F10)', true),
  sector('CRNCY', 'F11', 'Currencies market sector (F11)', true),
  sector('PORT', 'F12', 'Portfolio key (F12): types CLIENT, the portfolio sector word; CLIENT <GO> opens PORTFOLIO'),
  { label: 'NEWS', sub: 'TOP', color: 'gray', run: (p) => execute(p, 'TOP'), title: 'Top market news (TOP)' },
  { label: 'HISTORY', sub: 'CTRL+↑', color: 'gray', run: (p) => recallPanelCommand(p), title: 'Recall a previous command (Ctrl+↑)' },
  {
    label: 'PANEL',
    sub: 'CTRL+TAB',
    color: 'blue',
    run: () => {
      const s = terminal.get();
      const n = Math.min(PANEL_COUNT, window.innerWidth <= 760 ? Math.max(panelCount(s), 4) : panelCount(s));
      const next = (s.active + 1) % n;
      setActive(next);
      focusPanelInput(next);
    },
    title: 'Next panel (Ctrl+Tab); direct selection with Alt+1..6',
    mobile: true,
  },
];

export function KeyBar() {
  const active = terminal.use((s) => s.active);
  return (
    <div className="keybar" role="toolbar" aria-label="Function keys">
      <div className="keybar-scroll">
      {KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          className={`key ${k.color}${k.mobile ? '' : ' hide-m'}`}
          title={k.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => k.run(active)}
        >
          {k.label}
          <small>{k.sub}</small>
        </button>
      ))}
      <span className="gap" />
      <button type="button" className="key gray hide-m" title="Page back (PgUp); a number typed first moves that many pages" onMouseDown={(e) => e.preventDefault()} onClick={() => pagePanel(active, -1)}>
        PG BK
        <small>PGUP</small>
      </button>
      <button type="button" className="key gray hide-m" title="Page forward (PgDn); a number typed first moves that many pages" onMouseDown={(e) => e.preventDefault()} onClick={() => pagePanel(active, 1)}>
        PG FWD
        <small>PGDN</small>
      </button>
      </div>
      <button type="button" className="key red" title="Clear the command line (Esc)" onMouseDown={(e) => e.preventDefault()} onClick={() => clearPanelInput(active)}>
        CANCEL
        <small>ESC</small>
      </button>
      <button type="button" className="key green" title="Run the command line (Enter)" onMouseDown={(e) => e.preventDefault()} onClick={() => submitPanel(active)} style={{ minWidth: 72 }}>
        GO
        <small>ENTER</small>
      </button>
    </div>
  );
}
