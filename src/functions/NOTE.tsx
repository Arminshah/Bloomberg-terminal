// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SecLink } from '../components/cells';
import { fmtDate, fmtTime } from '../core/format';
import { engine } from '../data/market';
import { notes } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

const KEY_GENERAL = '__general__';

export function NOTE({ sec }: FnProps) {
  const key = sec?.id ?? KEY_GENERAL;
  const all = notes.use((n) => n);
  const [text, setText] = useState(all[key] ?? '');
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      if ((notes.get()[key] ?? '') === text) return;
      notes.set((n) => {
        const next = { ...n };
        if (text.trim()) next[key] = text;
        else delete next[key];
        return next;
      });
      setSaved(Date.now());
    }, 400);
    return () => clearTimeout(id);
  }, [text, key]);
  const others = Object.keys(all).filter((k) => k !== key);
  return (
    <div className="fn-fill">
      <FnHeader code="NOTES" title="Notes" sec={sec} sub={`${saved ? `Saved ${fmtDate(saved)} ${fmtTime(saved)} · stored` : 'Stored'} ${engine.realOnly ? 'on this computer' : 'in this browser'}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(160px, 240px)', flex: 1, minHeight: 0 }}>
        <textarea
          className="inp"
          aria-label={sec ? `Notes on ${sec.id}` : 'General notes'}
          style={{ resize: 'none', margin: 6, fontFamily: 'var(--sans)', fontSize: 'var(--fs-l)', lineHeight: 1.5, color: 'var(--text)' }}
          placeholder={sec ? `Thesis, levels and reminders for ${sec.ticker}…` : 'General notes. Load a security first (NOTES AAPL) to keep notes per security.'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <aside style={{ borderLeft: '1px solid var(--line)', overflow: 'auto' }}>
          <div className="sect-h">Other notes</div>
          {others.length === 0 && <div className="note">None yet.</div>}
          {others.map((k) => (
            <div key={k} className="pad-s">
              {k === KEY_GENERAL ? <span className="amber">General</span> : engine.get(k) ? <SecLink id={k} fn="NOTES">{k}</SecLink> : k}
              <div className="muted ellipsis">{all[k].slice(0, 60)}</div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
