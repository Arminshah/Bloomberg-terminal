import { execute } from '../terminal/exec';
import { back, PANEL_COUNT, LAYOUT_PANELS, setActive, terminal } from '../terminal/state';
import { showPanelHelp, showPanelMenu } from '../terminal/actions';
import { clearPanelInput, focusPanelInput, pagePanel, recallPanelCommand, submitPanel, typeInto } from './CommandLine';

interface Key {
  label: string;
  sub: string;
  color: 'yellow' | 'green' | 'red' | 'gray' | 'blue';
  run: (panel: number) => void;
  title: string;
  mobile?: boolean;
}

const KEYS: Key[] = [
  { label: 'HELP', sub: 'F1', color: 'green', run: showPanelHelp, title: 'Current function help (F1); press twice for the local assistant' },
  { label: 'MENU', sub: 'ALT+END', color: 'green', run: showPanelMenu, title: 'Related functions menu (Alt+End)', mobile: true },
  { label: 'BACK', sub: 'ALT+←', color: 'green', run: (p) => back(p), title: 'Previous screen (Backspace on empty line)' },
  { label: 'GOVT', sub: 'F2', color: 'yellow', run: (p) => typeInto(p, 'GOVT'), title: 'Government bonds market sector (F2)' },
  { label: 'CORP', sub: 'F3', color: 'yellow', run: (p) => typeInto(p, 'CORP'), title: 'Corporate bonds market sector (F3)' },
  { label: 'MTGE', sub: 'F4', color: 'yellow', run: (p) => typeInto(p, 'MTGE'), title: 'Mortgage securities market sector (F4)' },
  { label: 'M-MKT', sub: 'F5', color: 'yellow', run: (p) => typeInto(p, 'M-MKT'), title: 'Money market sector (F5)' },
  { label: 'MUNI', sub: 'F6', color: 'yellow', run: (p) => typeInto(p, 'MUNI'), title: 'Municipal bonds market sector (F6)' },
  { label: 'PFD', sub: 'F7', color: 'yellow', run: (p) => typeInto(p, 'PFD'), title: 'Preferred securities market sector (F7)' },
  { label: 'EQUITY', sub: 'F8', color: 'yellow', run: (p) => typeInto(p, 'EQUITY'), title: 'Stocks market sector (F8)', mobile: true },
  { label: 'CMDTY', sub: 'F9', color: 'yellow', run: (p) => typeInto(p, 'CMDTY'), title: 'Commodities market sector (F9)' },
  { label: 'INDEX', sub: 'F10', color: 'yellow', run: (p) => typeInto(p, 'INDEX'), title: 'Indices market sector (F10)', mobile: true },
  { label: 'CRNCY', sub: 'F11', color: 'yellow', run: (p) => typeInto(p, 'CRNCY'), title: 'Currencies market sector (F11)', mobile: true },
  { label: 'PORT', sub: 'F12', color: 'yellow', run: (p) => execute(p, 'CLIENT'), title: 'Portfolio (F12)' },
  { label: 'NEWS', sub: 'TOP', color: 'gray', run: (p) => execute(p, 'TOP'), title: 'Top market news (TOP)' },
  { label: 'HISTORY', sub: 'CTRL+↑', color: 'gray', run: (p) => recallPanelCommand(p), title: 'Recall a previous command (Ctrl+↑)' },
  {
    label: 'PANEL',
    sub: 'CTRL+TAB',
    color: 'blue',
    run: () => {
      const s = terminal.get();
      const n = Math.min(PANEL_COUNT, window.innerWidth <= 760 ? Math.max(LAYOUT_PANELS[s.layout], 4) : LAYOUT_PANELS[s.layout]);
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
