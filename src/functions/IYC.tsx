// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { FnHeader } from '../components/FnHeader';
import { RowNo } from '../components/Numbered';
import { CURVES } from '../data/curves';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/** The app's yield curve screens, each country's curve first. */
export const IYC_ITEMS: { label: string; what: string; command: string }[] = [
  ...CURVES.map((c) => ({ label: `${c.name} curve`, what: 'Today against one week, one month and one year ago', command: `CURVE ${c.code}` })),
  { label: 'World bond markets', what: 'Government yields by country and tenor, spreads and curve slope', command: 'BONDS' },
  { label: 'World bond movers', what: 'Government yields ranked by their move', command: 'BONDMOVERS' },
  { label: 'Treasury and money markets', what: 'Fed funds, bills and the short end', command: 'MONEYMARKET' },
  { label: 'Rate probabilities', what: 'Fed meeting outcomes priced in by futures', command: 'RATEPROBS' },
  { label: 'World bond futures', what: 'Government bond futures', command: 'BONDFUTURES' },
  { label: 'Central bank monitor', what: 'Policy rates against 2-year yields', command: 'CENTRALBANKS' },
  { label: 'Swap manager', what: 'Fixed against floating swaps on a curve you enter', command: 'SWAPCALC' },
];

/**
 * IYC: a menu of the yield curve screens, as the terminal's IYC is (V04): each country's curve now and in the past,
 * then the bond monitors and calculators that use them.
 */
export function IYC(_: FnProps) {
  const panel = usePanelId();
  const nums = useNumberedRows('iyc-items', IYC_ITEMS, 1, (it) => execute(panel, it.command), (it) => it.label);
  return (
    <div>
      <FnHeader code="CURVEMENU" title="Yield Curve Analysis" sub="The app's yield curve screens" />
      <table className="tbl">
        <tbody>
          {IYC_ITEMS.map((it, i) => (
            <tr key={it.command} className="click" onClick={() => execute(panel, it.command)}>
              <td className="amber">
                <RowNo n={nums[i]} />
                {it.label}
              </td>
              <td className="muted">{it.what}</td>
              <td className="yellow">{it.command}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
