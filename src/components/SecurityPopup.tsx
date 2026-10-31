// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../core/store';
import { engine } from '../data/market';
import type { AssetClass } from '../data/types';
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { lookupFn } from '../terminal/registry';
import { settings } from '../terminal/settings';
import { Dialog } from './Dialog';

/** The security a right-click asked about, and the panel it was in. */
export const securityPopup = createStore<{ at: { panel: number; id: string } | null }>({ at: null });

/** The fifth line after description, prices and the two charts, by asset class. */
const FIFTH: Partial<Record<AssetClass, string>> = {
  equity: 'FINANCIALS',
  index: 'MEMBERS',
  fx: 'FXFORWARD',
  bond: 'BONDCALC',
  commodity: 'COMMODITIES',
  future: 'INDEXFUTURES',
  crypto: 'CRYPTO',
  rate: 'CURVE',
};

/** The five functions offered for a security, in the order TE03 05:59 lists them: DES, HP, GIP, GP, then one of its own. */
export function popupFunctions(cls: AssetClass): string[] {
  return ['PROFILE', 'HISTORY', 'INTRADAY', 'CHART', FIFTH[cls]]
    .filter((code): code is string => !!code)
    .filter((code) => {
      const f = lookupFn(code);
      return !!f && (!f.classes || f.classes.includes(cls));
    })
    .slice(0, 5);
}

/**
 * The small "Related Functions" window a right-click on a security opens (TE03 05:59): the security in white, its name
 * in cyan, five numbered functions (white mnemonic, amber title), "6) More Related Functions...", and Close. A number
 * key runs its line.
 */
export function SecurityPopup() {
  const at = securityPopup.use((s) => s.at);
  const mnemonics = settings.use((s) => s.mnemonics);
  const sec = at ? engine.get(at.id) : undefined;
  const codes = sec ? popupFunctions(sec.cls) : [];
  const close = () => securityPopup.set({ at: null });
  const run = (cmd: string) => {
    if (!at) return;
    close();
    execute(at.panel, cmd);
  };
  const runLine = (n: number) => {
    if (!sec) return;
    if (n >= 1 && n <= codes.length) run(`${sec.id} ${codes[n - 1]}`);
    else if (n === codes.length + 1) run(`${sec.id} MENU`);
  };
  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        runLine(Number(e.key));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  if (!at || !sec) return null;
  return (
    <Dialog title="Related Functions" testId="security-popup" onClose={close} buttons={[{ label: 'Close', onClick: close, primary: true }]} closeX={false}>
      <div className="secpop-id">{sec.id}</div>
      <div className="secpop-name">{sec.name}</div>
      <div className="secpop-list">
        {codes.map((code, i) => (
          <button key={code} type="button" className="secpop-row" onClick={() => runLine(i + 1)}>
            <span className="secpop-n">{i + 1})</span>
            <span className="secpop-mn">{mnemonics ? primaryMnemonic(code) : code}</span>
            <span className="secpop-t">{lookupFn(code)?.name}</span>
          </button>
        ))}
        <button type="button" className="secpop-row secpop-more" onClick={() => runLine(codes.length + 1)}>
          <span className="secpop-n">{codes.length + 1})</span>
          <span className="secpop-t">More Related Functions...</span>
        </button>
      </div>
    </Dialog>
  );
}
