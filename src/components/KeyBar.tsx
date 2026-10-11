import { execute } from '../terminal/exec';
import { back, PANEL_COUNT, LAYOUT_PANELS, setActive, terminal } from '../terminal/state';
import { clearPanelInput, focusPanelInput, submitPanel, typeInto } from './CommandLine';

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
  { label: 'GOVT', sub: 'F2', color: 'yellow', run: (p) => typeInto(p, 'GOVT'), title: 'Government securities yellow key (F2)' },
  { label: 'EQUITY', sub: 'F8', color: 'yellow', run: (p) => typeInto(p, 'EQUITY'), title: 'Equity yellow key (F8)', mobile: true },
  { label: 'CMDTY', sub: 'F9', color: 'yellow', run: (p) => typeInto(p, 'CMDTY'), title: 'Commodity yellow key (F9)' },
  { label: 'INDEX', sub: 'F10', color: 'yellow', run: (p) => typeInto(p, 'INDEX'), title: 'Index yellow key (F10)', mobile: true },
  { label: 'CRNCY', sub: 'F11', color: 'yellow', run: (p) => typeInto(p, 'CRNCY'), title: 'Currency yellow key (F11)', mobile: true },
  { label: 'NEWS', sub: 'TOP', color: 'gray', run: (p) => execute(p, 'TOP'), title: 'Top news' },
  { label: 'MSG', sub: 'IB', color: 'gray', run: (p) => execute(p, 'IB'), title: 'Instant messages' },
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
