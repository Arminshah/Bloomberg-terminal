import { useEffect, useRef, useState } from 'react';
import { createStore } from '../core/store';
import { askHelpDesk, HELP_EXAMPLES } from '../functions/IB';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { currentRoute, terminal } from '../terminal/state';
import { Dialog } from './Dialog';

/** The panel whose Live Help window is open, if any. */
export const liveHelp = createStore<{ panel: number | null }>({ panel: null });

/**
 * The yellow "?▾" menu at the right of a panel's toolbar (TE01 04:45): a dark panel over the dimmed screen, the first
 * row on yellow ("See What's New in DES"), then amber items: Help Page, Live Help and Recent Enhancements. They open
 * the app's own help, help desk and release notes.
 */
export function HelpMenu({ panel, onClose }: { panel: number; onClose: () => void }) {
  const route = terminal.use((s) => currentRoute(s, panel));
  const mn = primaryMnemonic(route.fn);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.ptb-help')) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <>
      <div className="hmenu-dim" aria-hidden="true" />
      <div className="hmenu" role="menu" aria-label="Help" ref={box}>
        <button type="button" role="menuitem" className="hmenu-item hot" onClick={run(() => execute(panel, `WHATSNEW ${route.fn}`))}>See What&apos;s New in {mn}</button>
        <button type="button" role="menuitem" className="hmenu-item" onClick={run(() => execute(panel, `HELP ${route.fn}`))}>Help Page</button>
        <button type="button" role="menuitem" className="hmenu-item" onClick={run(() => liveHelp.set({ panel }))}>Live Help</button>
        <button type="button" role="menuitem" className="hmenu-item" onClick={run(() => execute(panel, 'WHATSNEW'))}>Recent Enhancements</button>
      </div>
    </>
  );
}

/**
 * The Live Help window, laid out as TE03 09:07 shows it: a badge and the desk's name, a greeting, a large amber box
 * for the question, Start Chat, and questions to start from. The app's help desk answers (MESSAGES).
 */
export function LiveHelp() {
  const panel = liveHelp.use((s) => s.panel);
  const [text, setText] = useState('');
  if (panel === null) return null;
  const close = () => {
    setText('');
    liveHelp.set({ panel: null });
  };
  const start = () => {
    const q = text.trim();
    if (!q) return;
    close();
    void askHelpDesk(panel, q);
  };
  return (
    <Dialog title="Live Help" testId="live-help" onClose={close} buttons={[]}>
      <div className="lh-head">
        <span className="lh-badge" aria-hidden="true">?</span>
        <div>
          <div className="lh-desk">ARMIN HELP DESK</div>
          <div className="lh-greet">Ask about any function, security or figure in the app, and the help desk will answer.</div>
        </div>
      </div>
      <textarea
        className="lh-box"
        aria-label="Question for the help desk"
        placeholder="Type a question, with the function and security it is about…"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            start();
          }
        }}
      />
      <div className="lh-start">
        <button type="button" className="dlg-btn" disabled={!text.trim()} onClick={start}>
          <span aria-hidden="true">&gt;</span> Start Chat
        </button>
      </div>
      <div className="lh-faq-h">Or start with one of these:</div>
      <ul className="lh-faq">
        {HELP_EXAMPLES.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => setText(q)}>{q}</button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
