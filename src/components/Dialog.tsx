import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogButton {
  label: string;
  onClick: () => void;
  /** The button Enter presses and the one outlined in blue; it has the focus when the dialog opens. */
  primary?: boolean;
}

/**
 * A dialog as the 2024 frames draw one (TE01 05:11): a light grey title bar with a dark title and "×", a dark body, the
 * buttons at the bottom right with the default one outlined in blue, and the screen behind dimmed. Escape and "×"
 * close it as `onClose` says.
 */
export function Dialog({ title, onClose, buttons, children, testId }: { title: string; onClose: () => void; buttons: DialogButton[]; children: ReactNode; testId?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('.dlg-btn.primary')?.focus();
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={box}
        className="dlg"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="dlg-title">
          <span>{title}</span>
          <button type="button" className="dlg-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="dlg-body">{children}</div>
        <div className="dlg-buttons">
          {buttons.map((b) => (
            <button key={b.label} type="button" className={`dlg-btn${b.primary ? ' primary' : ''}`} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
