// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useCallback, useState } from 'react';

/** A row's number, "12)", ahead of its first cell; typing it and GO opens the row. */
export function RowNo({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  return (
    <span className="row-no" title={`Type ${n} and press GO`}>
      {n})
    </span>
  );
}

/** A monitor's numbered group heading, "1) Americas": typing its number or clicking it hides or shows its rows. */
export function GroupRow({ n, name, span, open, onToggle }: { n: number; name: string; span: number; open: boolean; onToggle: () => void }) {
  return (
    <tr className="group click" aria-expanded={open} onClick={onToggle} title={`${open ? 'Hide' : 'Show'} ${name}: click, or type ${n} and press GO`}>
      <td colSpan={span}>
        <span className="group-toggle" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {n}) {name}
      </td>
    </tr>
  );
}

/** Which groups of a monitor are collapsed, for this screen only. */
export function useCollapsed(): [string[], (name: string) => void] {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const toggle = useCallback((name: string) => setCollapsed((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name])), []);
  return [collapsed, toggle];
}
