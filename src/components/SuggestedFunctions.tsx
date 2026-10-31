// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { execute } from '../terminal/exec';
import { primaryMnemonic } from '../terminal/legacy';
import { lookupFn } from '../terminal/registry';
import { settings } from '../terminal/settings';

/**
 * The panel's footer on screens the 2024 frames show one on (TE01 01:53, TE08 06:12, the EEG short): "Suggested
 * Functions" in amber in its own cell, then two related functions, each a bold white mnemonic and the app's own name
 * for it in grey, the second at the right edge. A click runs it with the panel's security.
 */
export function SuggestedFunctions({ panel, codes }: { panel: number; codes: readonly string[] }) {
  const mnemonics = settings.use((s) => s.mnemonics);
  const defs = codes.map((code) => lookupFn(code)).filter((d) => !!d);
  if (!defs.length) return null;
  return (
    <footer className="sugg-fns" aria-label="Suggested functions">
      <span className="sugg-lbl">Suggested Functions</span>
      {defs.map((d, i) => (
        <button key={d.code} type="button" className={`sugg-fn${i === defs.length - 1 && defs.length > 1 ? ' end' : ''}`} title={d.desc} onClick={() => execute(panel, d.code)}>
          <b>{mnemonics ? primaryMnemonic(d.code) : d.code}</b>
          <span>{d.name}</span>
        </button>
      ))}
    </footer>
  );
}
