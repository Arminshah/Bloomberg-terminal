import { execute } from '../terminal/exec';
import { back, PANEL_COUNT, LAYOUT_PANELS, setActive, terminal } from '../terminal/state';
import { clearPanelInput, focusPanelInput, pagePanel, submitPanel, typeInto } from './CommandLine';

interface Key {
  label: string;
  sub: string;
  color: 'yellow' | 'green' | 'red' | 'gray';
  run: (panel: number) => void;
  title: string;
  mobile?: boolean;
}

const KEYS: Key[] = [
  { label: 'HELP', sub: 'F1', color: 'green', run: (p) => execute(p, 'HELP'), title: 'Function directory (F1)' },
  { label: 'MENU', sub: 'BACK', color: 'green', run: (p) => back(p), title: 'Previous screen (Backspace on empty line)', mobile: true },
  { label: 'GOVT', sub: 'F2', color: 'yellow', run: (p) => typeInto(p, 'GOVT'), title: 'Government bonds market sector (F2)' },
  { label: 'CORP', sub: 'F3', color: 'yellow', run: (p) => typeInto(p, 'CORP'), title: 'Corporate bonds market sector (F3)' },
  { label: 'EQUITY', sub: 'F8', color: 'yellow', run: (p) => typeInto(p, 'EQUITY'), title: 'Stocks market sector (F8)', mobile: true },
  { label: 'CMDTY', sub: 'F9', color: 'yellow', run: (p) => typeInto(p, 'CMDTY'), title: 'Commodities market sector (F9)' },
  { label: 'INDEX', sub: 'F10', color: 'yellow', run: (p) => typeInto(p, 'INDEX'), title: 'Indices market sector (F10)', mobile: true },
  { label: 'CRNCY', sub: 'F11', color: 'yellow', run: (p) => typeInto(p, 'CRNCY'), title: 'Currencies market sector (F11)', mobile: true },
  { label: 'CLIENT', sub: 'F12', color: 'yellow', run: (p) => execute(p, 'CLIENT'), title: 'Portfolio (F12)' },
  { label: 'NEWS', sub: 'HEADLINES', color: 'gray', run: (p) => execute(p, 'HEADLINES'), title: 'Official announcements (HEADLINES)' },
  { label: 'CHAT', sub: 'HELP DESK', color: 'gray', run: (p) => execute(p, 'MESSAGES'), title: 'Help desk messages (MESSAGES)' },
  {
    label: 'PANEL',
    sub: 'ALT+N',
    color: 'gray',
    run: () => {
      const s = terminal.get();
      const n = Math.min(PANEL_COUNT, LAYOUT_PANELS[s.layout]);
      const next = (s.active + 1) % n;
      setActive(next);
      focusPanelInput(next);
    },
    title: 'Next panel (Alt+1..6)',
    mobile: true,
  },
];

export function KeyBar() {
  const active = terminal.use((s) => s.active);
  return (
    <div className="keybar" role="toolbar" aria-label="Function keys">
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
      <button type="button" className="key gray hide-m" title="Page back (PgUp)" onMouseDown={(e) => e.preventDefault()} onClick={() => pagePanel(active, -1)}>
        PG BK
        <small>PGUP</small>
      </button>
      <button type="button" className="key gray hide-m" title="Page forward (PgDn)" onMouseDown={(e) => e.preventDefault()} onClick={() => pagePanel(active, 1)}>
        PG FWD
        <small>PGDN</small>
      </button>
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
