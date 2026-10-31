import { FnHeader } from '../components/FnHeader';
import type { FnProps } from '../terminal/types';

interface Tip {
  title: string;
  text: string;
  keys: string[][];
  /** Where the keys work, when not everywhere. */
  where?: string;
}

/** The app's own tips, in the order a new user needs them. */
const TIPS: Tip[] = [
  { title: 'Run a function', text: 'Type a function, or a security and a function, and press GO (Enter). Plain words or a question search the app.', keys: [['Enter']] },
  { title: 'Open a new tab', text: 'Each tab keeps its own panels and history. Close the tab you are on, or bring back the last one you closed.', keys: [['Ctrl', 'T'], ['Ctrl', 'W'], ['Ctrl', 'Shift', 'T']] },
  { title: 'Adjust the zoom level', text: 'Make everything larger or smaller, also from ≡ Options at the right of the tabs.', keys: [['Ctrl', '−'], ['Ctrl', '=']], where: 'In the desktop app' },
  { title: 'Cycle through your windows', text: 'Move to the previous or the next of your windows.', keys: [['Ctrl', '['], ['Ctrl', ']']], where: 'In the desktop app' },
  { title: 'Open a new window', text: 'Open up to 16 windows, also from ≡ Options.', keys: [['Ctrl', 'N']], where: 'In the desktop app' },
  { title: 'Move between panels', text: 'Go to the next panel, or straight to panel 1 to 6.', keys: [['Ctrl', 'Tab'], ['Alt', '1…6']] },
  { title: 'Go back', text: 'Return to the screen before, on an empty command line.', keys: [['End'], ['Backspace']] },
  { title: 'Find related functions', text: 'Related Functions Menu on the toolbar lists what applies to the loaded security; the MENU key climbs to the sector and main menus.', keys: [['Alt', 'End']] },
  { title: 'Get help', text: 'Once for the function’s help page; twice for Live Help, the help desk.', keys: [['F1'], ['F1', 'F1']] },
];

/**
 * WELC, the page a new tab opens on (TE01 01:57, 02:27): tips laid out as the terminal's are, each a white title, an
 * amber line and its keys in grey caps. The tips are the app's own.
 */
export function WELC(_: FnProps) {
  return (
    <div className="fixed-page">
      <FnHeader code="WELCOME" title="New Tab" />
      <div className="welc">
        {TIPS.map((t) => (
          <section key={t.title} className="welc-tip">
            <div className="welc-text">
              <h3 className="welc-title">{t.title}</h3>
              <p className="welc-line">{t.text}</p>
              {t.where ? <p className="welc-where">{t.where}</p> : null}
            </div>
            <div className="welc-keys">
              {t.keys.map((combo) => (
                <div key={combo.join('+')} className="welc-combo">
                  {combo.map((k, i) => (
                    <kbd key={`${k}${i}`} className="welc-key">{k}</kbd>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
