// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { Fragment, useMemo } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Freshness } from '../components/Freshness';
import { Section } from '../components/cells';
import { Sparkline } from '../components/Sparkline';
import { XYChart } from '../components/chart/XYChart';
import { fmtNum, fmtTime } from '../core/format';
import { fredAvailable, fredData, periodLabel, previousPeriod, valueAt, type Obs } from '../data/live/fred';
import { FRED_NOTICE, FRED_TERMS_URL, MACRO_SERIES, type MacroSeries } from '../data/macroseries';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * MACRO: the US economy at a glance from the FRED API: policy rate and
 * Treasury yields, inflation, the labour market, growth, money and credit,
 * financial conditions and recession signals. Each figure is the latest an
 * agency has published, with its period and the change on the one before;
 * nothing is forecast. MACRO CPI (or JOBS, GDP, RATES, CREDIT, RECESSION)
 * picks out those lines and charts them.
 */

const DAY = 86_400_000;

export interface Reading {
  value: number;
  /** The observation's date (start of its period). */
  date: string;
  prev: number | null;
}

/** The latest published value of a line, transformed as the line says, and the one before. */
export function latestReading(m: MacroSeries, obs: Obs | undefined): Reading | null {
  if (!obs?.length) return null;
  const scale = m.scale ?? 1;
  if (m.freq === 'd') {
    // Daily rates: the latest observation and the one before (a missing day, a holiday, has no row).
    const last = obs[obs.length - 1];
    const before = obs.length > 1 ? obs[obs.length - 2] : undefined;
    return { value: last[1] * scale, date: last[0], prev: before ? before[1] * scale : null };
  }
  // The latest period with a value for this calculation (a year-on-year change needs the year before too).
  for (let i = obs.length - 1; i >= 0 && i >= obs.length - 3; i--) {
    const p = obs[i][0];
    const v = valueAt(obs, p, m.calc, m.freq, scale);
    if (v == null) continue;
    return { value: v, date: p, prev: valueAt(obs, previousPeriod(p, m.freq), m.calc, m.freq, scale) };
  }
  return null;
}

/** The line's values over the last `years`, transformed, oldest first. Daily series are thinned to one point a week. */
export function history(m: MacroSeries, obs: Obs | undefined, years = 3, now = Date.now()): [string, number][] {
  if (!obs?.length) return [];
  const from = new Date(now - years * 365.25 * DAY).toISOString().slice(0, 10);
  const out: [string, number][] = [];
  if (m.freq === 'd') {
    let lastWeek = '';
    for (const [d, v] of obs) {
      if (d < from) continue;
      const week = new Date(Math.floor(Date.parse(d) / (7 * DAY)) * 7 * DAY).toISOString().slice(0, 10);
      if (week === lastWeek) out[out.length - 1] = [d, v * (m.scale ?? 1)];
      else out.push([d, v * (m.scale ?? 1)]);
      lastWeek = week;
    }
    return out;
  }
  for (const [d] of obs) {
    if (d < from) continue;
    const v = valueAt(obs, d, m.calc, m.freq, m.scale ?? 1);
    if (v != null) out.push([d, v]);
  }
  return out;
}

function periodText(m: MacroSeries, date: string): string {
  return m.freq === 'd' ? date : periodLabel(date, m.freq);
}

function fmtValue(m: MacroSeries, v: number): string {
  const unit = m.unit === '%' ? '%' : m.unit === 'k' ? 'k' : '';
  return `${fmtNum(v, m.dec)}${unit}`;
}

const GROUPS = [...new Set(MACRO_SERIES.map((m) => m.group))];

export function MACRO({ route }: FnProps) {
  const panel = usePanelId();
  const fred = fredData.use((f) => f);
  const focus = route.args?.trim().toUpperCase() ?? '';
  const picked = useMemo(() => (focus ? MACRO_SERIES.filter((m) => m.keys.includes(focus) || m.id === focus) : []), [focus]);
  const header = (
    <FnHeader
      code="MACRO"
      title="Macro Dashboard"
      sub={
        <>
          United States · published figures from the FRED API ·{' '}
          {fred.at ? <Freshness label="REFERENCE" title={`Official statistics, published on each agency's schedule; values received ${fmtTime(fred.at)}`} /> : null}
          {focus && !picked.length ? ` · nothing matches "${focus}": try CPI, JOBS, GDP, RATES, CREDIT or RECESSION` : ''}
        </>
      }
    />
  );
  if (!fredAvailable()) {
    return (
      <div>
        {header}
        <div className="pad muted">The macro dashboard reads the FRED API from the desktop app, with your own free key; the browser build has no data source.</div>
      </div>
    );
  }
  if (fred.needsKey || fred.keyRefused) {
    return (
      <div>
        {header}
        <div className="pad">
          <p className="amber">{fred.keyRefused ? `FRED did not accept the API key: ${fred.keyRefused}` : 'FRED needs your API key: it is free from fredaccount.stlouisfed.org.'}</p>
          <button type="button" className="btn primary" onClick={() => execute(panel, 'PROVIDERS')}>
            Open the provider screen
          </button>
        </div>
      </div>
    );
  }
  const focusLine = picked[0];
  const focusHist = focusLine ? history(focusLine, fred.series[focusLine.id], 4) : [];
  return (
    <div>
      {header}
      {focusLine && (
        <Section title={`${focusLine.label} · ${focusLine.source}`} right={`${focusLine.freq === 'd' ? 'daily, weekly points' : focusLine.freq === 'w' ? 'weekly' : focusLine.freq === 'm' ? 'monthly' : 'quarterly'} · 4 years`}>
          {focusHist.length > 1 ? (
            <XYChart
              height={200}
              series={[{ label: focusLine.label, color: '#ff9e1b', points: focusHist.map(([d, v]) => ({ x: Date.parse(d), y: v, label: periodText(focusLine, d) })) }]}
              xFormat={(x) => new Date(x).toISOString().slice(0, 7)}
              yFormat={(v) => fmtNum(v, focusLine.dec)}
            />
          ) : (
            <div className="empty">No values from FRED yet.</div>
          )}
        </Section>
      )}
      <table className="tbl">
        <thead>
          <tr>
            <th>Indicator</th>
            <th className="num">Latest</th>
            <th>Period</th>
            <th className="num" title="Change on the period before">Change</th>
            <th className="hide-m">3 years</th>
            <th className="hide-m">Published by</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g) => (
            <Fragment key={g}>
              <tr className="group">
                <td colSpan={6}>{g}</td>
              </tr>
              {MACRO_SERIES.filter((m) => m.group === g).map((m) => {
                const obs = fred.series[m.id];
                const r = latestReading(m, obs);
                const hist = history(m, obs);
                // Rounded to the shown decimals first, so a change that rounds to nothing shows no sign.
                const chg = r && r.prev != null ? r.value - r.prev : NaN;
                const chgShown = Number.isFinite(chg) ? Math.round(chg * 10 ** m.dec) / 10 ** m.dec || 0 : NaN;
                return (
                  <tr key={m.id} className={`click${picked.includes(m) ? ' sel' : ''}`} onClick={() => execute(panel, `MACRO ${m.id}`)}>
                    <td title={m.id.includes(':') ? m.source : `FRED series ${m.id}`}>{m.label}</td>
                    <td className="num white">{r ? fmtValue(m, r.value) : '--'}</td>
                    <td className="muted">{r ? periodText(m, r.date) : ''}</td>
                    <td className={`num ${chgShown > 0 ? 'up' : chgShown < 0 ? 'dn' : ''}`}>{Number.isFinite(chgShown) ? `${chgShown > 0 ? '+' : ''}${fmtNum(chgShown, m.dec)}${m.unit === 'k' ? 'k' : ''}` : '--'}</td>
                    <td className="hide-m">{hist.length > 1 ? <Sparkline values={hist.map(([, v]) => v)} width={90} height={14} color="var(--amber)" /> : null}</td>
                    <td className="hide-m muted">
                      {m.source}
                      {m.copyrighted ? ' · copyrighted, personal use only' : ''}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      <Revisions />
      <div className="note">
        Each value is the latest the agency has published, as FRED republishes it; changes are on the period before. Spreads are in percentage points. Nothing here is a forecast. {FRED_NOTICE}{' '}
        <a href={FRED_TERMS_URL} target="_blank" rel="noreferrer noopener" className="blue">
          FRED API terms of use
        </a>
        .
      </div>
    </div>
  );
}

/** First published values against today's (ALFRED vintages): how much payrolls and GDP growth have been revised. */
function Revisions() {
  const fred = fredData.use((f) => f);
  const rows = (id: string, n: number) => {
    const first = fred.firstRelease[id] ?? [];
    const now = fred.series[id] ?? [];
    return first
      .slice(-n)
      .map(([date, value, published]) => ({ date, first: value, published, latest: now.find(([d]) => d === date)?.[1] }))
      .reverse();
  };
  const payrolls = rows('PAYEMS', 6);
  const gdp = rows('A191RL1Q225SBEA', 6);
  if (!payrolls.length && !gdp.length) return null;
  return (
    <div className="cols">
      <Section title="Payrolls level: first published and now" right="thousands of jobs">
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th>First published</th>
              <th className="num">First</th>
              <th className="num">Now</th>
              <th className="num">Revised by</th>
            </tr>
          </thead>
          <tbody>
            {payrolls.map((r) => (
              <tr key={r.date}>
                <td>{periodLabel(r.date, 'm')}</td>
                <td className="muted">{r.published}</td>
                <td className="num">{fmtNum(r.first, 0)}</td>
                <td className="num white">{r.latest != null ? fmtNum(r.latest, 0) : '--'}</td>
                <td className="num">{r.latest != null ? `${r.latest - r.first > 0 ? '+' : ''}${fmtNum(r.latest - r.first, 0)}` : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Real GDP growth: first published and now" right="% annualised">
        <table className="tbl">
          <thead>
            <tr>
              <th>Quarter</th>
              <th>First published</th>
              <th className="num">First</th>
              <th className="num">Now</th>
              <th className="num">Revised by</th>
            </tr>
          </thead>
          <tbody>
            {gdp.map((r) => (
              <tr key={r.date}>
                <td>{periodLabel(r.date, 'q')}</td>
                <td className="muted">{r.published}</td>
                <td className="num">{fmtNum(r.first, 1)}</td>
                <td className="num white">{r.latest != null ? fmtNum(r.latest, 1) : '--'}</td>
                <td className="num">{r.latest != null ? `${r.latest - r.first > 0 ? '+' : ''}${fmtNum(r.latest - r.first, 1)} pts` : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
