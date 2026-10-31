// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { RealBadge } from '../components/Source';
import { fmtDay, fmtNum, fmtTime } from '../core/format';
import { beaAvailable, GDP_LINES, INCOME_LINES, parseBeaTable, periodLabel, useBea, type BeaKind, type BeaPart } from '../data/live/bea';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * NIPA, US national accounts from the Bureau of Economic Analysis: what drove real GDP growth in each of the last
 * quarters (Table 1.1.2, contributions in percentage points) and personal income, spending and saving by month
 * (Table 2.6). Desktop app with the owner's BEA_API_KEY; every figure is BEA's, with its revision date.
 */

const received = (p: BeaPart | undefined) => (p?.at ? ` · received ${fmtDay(p.at)} ${fmtTime(p.at, false)}${p.cached ? ' (kept)' : ''}${p.stale ? ' · STALE: the latest request failed' : ''}` : '');
const revisedOn = (iso: string) => (iso ? `, last revised ${fmtDay(Date.parse(`${iso}T00:00:00Z`))}` : '');

function BeaTableView({ kind, lines, columns, testId, format, note }: { kind: BeaKind; lines: { line: number; depth: number }[]; columns: number; testId: string; format: (line: number, v: number) => string; note: (revised: string) => string }) {
  const part = useBea(kind);
  if (!part || part.state === 'loading') return <div className="empty">Loading BEA&apos;s table…</div>;
  if (part.state !== 'ok' || !part.text) return <div className="empty amber">{part.message ?? 'No answer from BEA.'}</div>;
  const t = parseBeaTable(part.text);
  if ('error' in t) return <div className="empty amber">{t.error}</div>;
  const periods = t.periods.slice(-columns);
  const rows = lines.map((l) => ({ ...l, data: t.lines.find((x) => x.line === l.line) })).filter((r) => r.data);
  return (
    <>
      <table className="tbl" data-testid={testId}>
        <thead>
          <tr>
            <th>{t.title.replace(/^Table [\d.]+\.\s*/, '').replace(/\s*\[.*$/, '')}</th>
            {periods.map((p) => (
              <th key={p} className="num">
                {periodLabel(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line}>
              <td className={r.depth === 0 ? 'white' : ''} style={{ paddingLeft: 6 + r.depth * 12 }}>
                {r.data!.label.replace(/^(?:Equals|Less): /, '')}
              </td>
              {periods.map((p) => {
                const v = r.data!.values.get(p) ?? NaN;
                return (
                  <td key={p} className={`num ${r.depth === 0 ? 'white' : ''}`}>
                    {Number.isFinite(v) ? format(r.line, v) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        {note(t.revised)}
        {received(part)}
      </div>
    </>
  );
}

export function NIPA(_: FnProps) {
  const panel = usePanelId();
  const header = <FnHeader code="NIPA" title="US National Accounts" sub={beaAvailable() ? <><RealBadge /> BEA: GDP growth by contribution, personal income and saving</> : "BEA's tables are read by the desktop app"} />;
  if (!beaAvailable()) {
    return (
      <div>
        {header}
        <div className="empty">The national accounts are the Bureau of Economic Analysis&apos;s, read by the desktop app with your BEA_API_KEY on PROVIDERS. The browser demo has none, and none are generated.</div>
      </div>
    );
  }
  return (
    <div>
      {header}
      <Section title="Real GDP growth and what drove it" right="BEA Table 1.1.2, quarterly">
        <BeaTableView
          kind="gdp-contributions"
          lines={GDP_LINES}
          columns={6}
          testId="bea-gdp"
          format={(_, v) => fmtNum(v, 2)}
          note={(revised) => `The first line is real GDP's percent change at an annual rate; the others are each part's contribution to it, in percentage points (imports subtract). Seasonally adjusted. Source: BEA, NIPA Table 1.1.2${revisedOn(revised)}. BEA publishes a quarter's first estimate about a month after it ends and revises it in the next two months.`}
        />
      </Section>
      <Section title="Personal income, spending and saving" right="BEA Table 2.6, monthly">
        <BeaTableView
          kind="personal-income"
          lines={INCOME_LINES}
          columns={6}
          testId="bea-income"
          format={(line, v) => (line === 35 ? `${fmtNum(v, 1)}%` : fmtNum(v / 1000, 1))}
          note={(revised) => `Billions of dollars at seasonally adjusted annual rates (BEA's millions over a thousand); the saving rate is personal saving as a percentage of disposable income. Source: BEA, NIPA Table 2.6${revisedOn(revised)}.`}
        />
      </Section>
      <div className="note">
        <button type="button" className="act" onClick={() => execute(panel, 'MACRO GDP')}>MACRO</button> GDP growth and the PCE price indexes from FRED, with first releases ·{' '}
        <button type="button" className="act" onClick={() => execute(panel, 'ECO')}>ECO</button> the release calendar
      </div>
    </div>
  );
}
