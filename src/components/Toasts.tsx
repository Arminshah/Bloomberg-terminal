import { fmtTime } from '../core/format';
import { execute } from '../terminal/exec';
import { terminal } from '../terminal/state';
import { dismiss, toasts } from '../terminal/toasts';

export function Toasts() {
  const list = toasts.use((t) => t);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          role="status"
          onClick={() => {
            if (t.command) execute(terminal.get().active, t.command);
            dismiss(t.id);
          }}
        >
          <div className="tt">
            <span>{t.title}</span>
            <span className="time">{fmtTime(t.at)}</span>
          </div>
          <div className="tb">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
