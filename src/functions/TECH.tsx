// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { FnHeader } from '../components/FnHeader';
import { RowNo } from '../components/Numbered';
import { engine } from '../data/market';
import { execute } from '../terminal/exec';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/** The studies CHART draws, each with the word that adds it and what it computes (src/finance/indicators.ts). */
export const TECH_STUDIES: { word: string; name: string; settings: string; what: string }[] = [
  { word: 'SMA20', name: 'Simple moving average', settings: '20 closes', what: 'The average of the last 20 closes, drawn over the price.' },
  { word: 'SMA50', name: 'Simple moving average', settings: '50 closes', what: 'The average of the last 50 closes.' },
  { word: 'SMA200', name: 'Simple moving average', settings: '200 closes', what: 'The average of the last 200 closes: the long trend.' },
  { word: 'EMA20', name: 'Exponential moving average', settings: '20 closes', what: 'Each new close weighs 2/21 of the average, so recent prices count more than in the simple average.' },
  { word: 'BOLL', name: 'Bollinger bands', settings: '20 closes, 2 deviations', what: 'The 20-close simple average, with bands two standard deviations of those closes above and below it.' },
  { word: 'RSI', name: 'Relative strength index', settings: '14 closes', what: "Wilder's index of average gains against average losses, from 0 to 100, in a pane below the price; 70 and 30 are marked." },
  { word: 'MACD', name: 'Moving average convergence divergence', settings: '12, 26, 9', what: 'The 12-close exponential average less the 26-close one, a 9-close exponential average of it as the signal line, and their difference as bars.' },
  { word: 'VOL', name: 'Volume', settings: 'each bar', what: 'Shares or contracts traded in each bar, in a pane below the price, coloured by whether the bar closed above or below its open.' },
];

/**
 * TECH: the technical studies charts can draw, as the terminal lists them (V06), with what each computes. A study
 * opens the loaded security's chart with it added; without one, the S&P 500's.
 */
export function TECH({ sec }: FnProps) {
  const panel = usePanelId();
  const target = sec ?? engine.get('SPX Index');
  const open = (word: string) => target && execute(panel, `${target.id} CHART ${word}`);
  const nums = useNumberedRows('tech-studies', TECH_STUDIES, 1, (st) => open(st.word), (st) => `${st.name} (${st.settings})`);
  return (
    <div>
      <FnHeader code="STUDIES" title="Technical Studies" sec={sec} sub={target ? `A study opens the chart of ${target.id} with it` : undefined} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Study</th>
            <th>Settings</th>
            <th className="hide-m">What it computes</th>
            <th>Command</th>
          </tr>
        </thead>
        <tbody>
          {TECH_STUDIES.map((st, i) => (
            <tr key={st.word} className="click" onClick={() => open(st.word)}>
              <td className="amber">
                <RowNo n={nums[i]} />
                {st.name}
              </td>
              <td>{st.settings}</td>
              <td className="muted hide-m" style={{ whiteSpace: 'normal' }}>{st.what}</td>
              <td className="yellow">{target ? `${target.ticker} GP ${st.word}` : `GP ${st.word}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">Studies are computed by the app from the chart&apos;s closes and volumes; the chart&apos;s own buttons add and remove them too.</div>
    </div>
  );
}
