import type { ReactNode } from 'react';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';

/**
 * A module with no permitted data source. It says what the module would show,
 * why nothing is connected, and where to look instead, and it shows no values:
 * none are invented to fill the space.
 */
export function NotConnected({ what, why, needs, see }: { what: string; why: ReactNode; needs: string; see?: { label: string; command: string }[] }) {
  const panel = usePanelId();
  return (
    <div className="pad not-connected" role="status">
      <div className="amber b">Requires licensed data — not connected</div>
      <p>{what}</p>
      <p className="muted">{why}</p>
      <p className="muted">What would enable it: {needs}</p>
      {see?.length ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {see.map((s) => (
            <button key={s.command} type="button" className="btn" onClick={() => execute(panel, s.command)}>
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
