// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState, type ReactNode } from 'react';
import { engine } from '../data/market';
import { lookupSecurity } from '../data/live/lookup';
import { usePanelId } from '../terminal/panel';
import { openSecurity } from './cells';

/**
 * A market value that opens the company's market cap history (MARKETCAP) when clicked. `symbol` (a US ticker) lets a
 * company the app has not loaded yet be looked up first (calendars and movers list the whole market).
 */
export function CapLink({ id, symbol, children }: { id?: string; symbol?: string; children: ReactNode }) {
  const panel = usePanelId();
  const [busy, setBusy] = useState(false);
  const def = id ? engine.get(id) : undefined;
  if (def ? def.cls !== 'equity' : !symbol) return <>{children}</>;
  return (
    <button
      type="button"
      className={`cap-link${busy ? ' busy' : ''}`}
      title="Market cap history (MARKETCAP): click to open, shift-click for the next panel"
      onClick={(e) => {
        e.stopPropagation();
        if (def) return openSecurity(panel, def.id, e, 'MARKETCAP');
        const shift = e.shiftKey;
        setBusy(true);
        void lookupSecurity(symbol!, false).then((r) => {
          setBusy(false);
          if (r.ok) openSecurity(panel, r.def.id, { shiftKey: shift } as unknown as Parameters<typeof openSecurity>[2], 'MARKETCAP');
        });
      }}
    >
      {children}
    </button>
  );
}
