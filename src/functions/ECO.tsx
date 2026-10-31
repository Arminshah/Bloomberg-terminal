// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { Credits } from '../components/Credits';
import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, LivePx, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { fmtDateTime, fmtDay, fmtMonthDayNum, fmtNum, fmtTime, WEEKDAYS, zonedParts } from '../core/format';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { engine, useInterval } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { centralBanks, COUNTRY_NAMES, ecoEvents, newYorkDate, policyCalendarEvents, type EcoEvent } from '../data/eco';
import { periodChange } from '../data/analytics';
import type { FnProps } from '../terminal/types';
import { FRED_NOTICE, FRED_TERMS_URL } from '../data/macroseries';
import { RealBadge, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';
import { policyRates } from '../data/live/policy';
import { currentPolicyTarget, policyDecisionLabel, policyMeetingState } from '../data/policy-state';
import type { DatasetHealth } from '../data/live/provenance';
import { ecoNumber, nasdaqEcoAvailable, useNasdaqEco } from '../data/live/nasdaq-eco';
import { COMPUTED_GROWTH, COUNTRY_STATS, EUROSTAT_MEMBERS, figurePeriod, figureStatus, fredData, fredSeriesHealth, US_EVENTS, valueAt, type Calc, type Freq, type Obs } from '../data/live/fred';

const COUNTRIES = ['US', 'EZ', 'DE', 'GB', 'JP', 'CN', 'CA', 'AU'];
/** The desktop app's calendar: US releases from FRED and the central banks with their own data. */
const REAL_COUNTRIES = ['US', 'EZ', 'GB', 'CA', 'AU', 'CH', 'BR'];

/** Monday of the current week; on weekends, the coming week. */
function weekStart(ms: number): number {
  const d = new Date(ms);
  const wd = d.getUTCDay();
  if (wd === 6 || wd === 0) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (wd === 6 ? 2 : 1));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (wd - 1));
}

function fmtVal(e: EcoEvent, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '';
  return `${fmtNum(v, e.dec)}${e.unit === '%' ? '%' : e.unit}`;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function ECO(_: FnProps) {
  useInterval(1000);
  const now = engine.now();
  const [week, setWeek] = useState(2);
  const real = engine.realOnly;
  policyRates.use((r) => r);
  const countries = real ? REAL_COUNTRIES : COUNTRIES;
  const [ctry, setCtry] = useState<string[]>(countries);
  fredData.use((x) => x.loaded);
  fredData.use((x) => x.health);
  const needsKey = fredData.use((x) => x.needsKey);
  const keyRefused = fredData.use((x) => x.keyRefused);
  const [minRel, setMinRel] = useState(1);
  const today = newYorkDate(now);
  const start = weekStart(now) + (week - 2) * 7 * DAY_MS;
  const all = ecoEvents(start, start + 7 * DAY_MS, now);
  const events = all.filter((e) => ctry.includes(e.country) && e.relevance >= minRel);
  const next = ecoEvents(now - DAY_MS, now + 14 * DAY_MS, now).find((e) => e.relevance >= 3 && (e.date ? e.date > today || (e.date === today && e.actual == null) : e.time > now));
  // The desktop app's calendar comes from Nasdaq's (every country, times, consensus); FRED's when Nasdaq has nothing.
  const nq = useNasdaqEco(start, 7, now);
  if (real && desktopData() && nasdaqEcoAvailable() && (nq.any || nq.loading)) {
    return <NasdaqEcoCalendar week={week} setWeek={setWeek} nq={nq} now={now} minRel={minRel} setMinRel={setMinRel} />;
  }
  // As on the terminal's agenda, each line carries its own date; days alternate in shade instead of heading groups.
  let lastDay = '';
  let band = 0;
  return (
    <div>
      <FnHeader
        code="RELEASES"
        title="Economic Calendar"
        sub={
          <>
            Times in your display time zone ·{' '}
            {real ? (
              <>
                <RealBadge /> selected US releases ({US_EVENTS.length} indicators from {new Set(US_EVENTS.map((e) => e.rid)).size} reports): scheduled dates and published values from the FRED API (it gives no times of day) · central bank decisions from the banks' own data · consensus forecasts are not public
              </>
            ) : all.some((e) => e.real) ? (
              <>
                <RealBadge /> Fed, ECB, BoE and BoC decisions · <SimBadge /> other releases, marked DEMO
              </>
            ) : (
              <>
                <SimBadge /> release dates, consensus and actuals
              </>
            )}
          </>
        }
        tabs={[
          { n: 1, label: 'Last week' },
          { n: 2, label: 'This week' },
          { n: 3, label: 'Next week' },
        ]}
        tab={week}
        onTab={setWeek}
      />
      <div className="chart-tools">
        {countries.map((c) => (
          <button key={c} type="button" className={`chip-btn${ctry.includes(c) ? ' on' : ''}`} style={ctry.includes(c) ? { background: 'var(--amber)' } : undefined} onClick={() => setCtry(ctry.includes(c) ? ctry.filter((x) => x !== c) : [...ctry, c])}>
            {c}
          </button>
        ))}
        <span className="seg" role="group" aria-label="Relevance">
          {[1, 2, 3].map((r) => (
            <button key={r} type="button" className={minRel === r ? 'on' : ''} onClick={() => setMinRel(r)}>
              {'●'.repeat(r)}+
            </button>
          ))}
        </span>
        {next && (
          <span>
            <span className="amber">Next key release</span> {next.country} {next.name}{' '}
            {next.date ? (
              <span className="white b">{next.date === today ? 'today' : `on ${WEEKDAYS[new Date(`${next.date}T12:00:00Z`).getUTCDay()]} ${fmtMonthDayNum(Number(next.date.slice(5, 7)), Number(next.date.slice(8, 10)))}`}</span>
            ) : (
              <>
                in <span className="white b">{countdown(next.time - now)}</span>
              </>
            )}
          </span>
        )}
      </div>
      <table className="tbl eco">
        <thead>
          <tr>
            <th>Date Time</th>
            <th title="Country">C</th>
            <th>Event</th>
            <th>Period</th>
            {real ? null : <th className="num" title="Survey: the median forecast">Surv(M)</th>}
            <th className="num" title={real ? 'The published value for the period, including any revisions since' : undefined}>
              Actual
            </th>
            <th className="num" title={real ? 'The previous period as currently published' : undefined}>
              Prior
            </th>
            {real ? null : <th className="num hide-m">Revised</th>}
            <th className="hide-m" title="Relevance">R</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={real ? 7 : 9} className="empty">
                {real && keyRefused
                  ? `The FRED API key was not accepted: ${keyRefused} Check the key in PROVIDERS.`
                  : real && needsKey
                    ? 'US releases need your free FRED API key (from fredaccount.stlouisfed.org): add it in PROVIDERS.'
                    : real && !fredData.get().loaded
                      ? 'Loading the release calendar from FRED…'
                      : 'No events for the selected filters.'}
              </td>
            </tr>
          )}
          {events.map((e) => {
            // A date-only event belongs to its own date, whatever the display time zone.
            const p = e.date ? { y: Number(e.date.slice(0, 4)), mo: Number(e.date.slice(5, 7)), d: Number(e.date.slice(8, 10)) } : zonedParts(e.time);
            const dayKey = `${p.y}-${p.mo}-${p.d}`;
            if (dayKey !== lastDay) band++;
            lastDay = dayKey;
            const md = fmtMonthDayNum(p.mo, p.d);
            const diff = e.actual != null && e.survey != null ? e.actual - e.survey : 0;
            const released = e.policyStatus ? e.policyStatus === 'confirmed' : e.date ? e.actual != null || e.date < today : real ? e.time <= now : e.actual != null;
            const dueToday = !released && e.date === today;
            const soon = !e.date && !released && e.time - now < 3600_000 && e.time > now;
            return (
              <tr key={e.id} data-policy-status={e.policyStatus} data-policy-date={e.policyStatus ? e.policyDecision?.date ?? e.id.split(':').at(-1) : undefined} data-policy-outcome={e.policyDecision?.action} className={`${band % 2 ? 'eco-band' : ''}${released ? '' : ' eco-ahead'}`}>
                <td className={soon ? 'yellow b' : undefined} title={e.date ? e.kind === 'rate' ? 'The policy statement gives no exact publication time' : 'FRED gives the release date, not the time' : `${WEEKDAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]} ${md}${e.timeFrom ? `; time from the ${e.timeFrom}` : ''}`}>
                  <span className="eco-date">{md}</span> {e.date ? '--:--' : fmtTime(e.time, false)}
                </td>
                <td className="amber">{e.country}</td>
                <td className={e.relevance >= 3 ? 'white b' : ''}>
                  {e.name}
                  {e.policyDecision && <> · <a href={e.policyDecision.sourceUrl} target="_blank" rel="noreferrer noopener">{policyDecisionLabel(e.policyDecision)}</a></>}
                  {e.health && <span className="muted" title={`${e.health.checkedAt ? `Last successful check ${fmtDateTime(e.health.checkedAt)}. ` : 'No successful check recorded. '}${e.health.error ?? ''}`}>{e.health.state === 'error' ? ' · retained; latest check failed' : e.health.state === 'cached' ? ' · cached' : ''}</span>}
                  {e.real || !all.some((x) => x.real) ? null : <span className="muted"> DEMO</span>}
                </td>
                <td className="muted">{e.period}</td>
                {real ? null : <td className="num">{fmtVal(e, e.survey)}</td>}
                <td className={`num b ${diff > 0 ? 'up' : diff < 0 ? 'dn' : 'white'}`}>
                  {e.policyStatus === 'statement-unavailable' ? <span className="muted" title="This bank's published statement decisions are not automatically archived here">statement not archived</span> : e.policyStatus === 'awaiting-publication' ? <span className="amber" title="The scheduled release time has passed, but no official statement has been archived">awaiting statement</span> : released ? (
                    e.actual != null ? (
                      fmtVal(e, e.actual)
                    ) : (
                      <span className="muted" title={e.kind === 'rate' ? 'No source-confirmed policy outcome is available' : 'Released; the value has not reached the source yet'}>
                        pending
                      </span>
                    )
                  ) : dueToday ? (
                    <span className="yellow" title="Scheduled for today; the value shows once the source has it">
                      due today
                    </span>
                  ) : soon ? (
                    <span className="yellow">{countdown(e.time - now)}</span>
                  ) : (
                    ''
                  )}
                </td>
                <td className="num">{fmtVal(e, e.prior)}</td>
                {real ? null : <td className="num hide-m muted">{fmtVal(e, e.revised)}</td>}
                <td className="hide-m amber" title={`Relevance ${e.relevance}/3`}>
                  {'●'.repeat(e.relevance)}
                  <span className="faint">{'●'.repeat(3 - e.relevance)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {real ? <FredNotice /> : null}
    </div>
  );
}

const ECO_COUNTRIES = ['US', 'EZ', 'DE', 'FR', 'IT', 'GB', 'JP', 'CN', 'CA', 'AU', 'CH'];

/** ECO on Nasdaq's calendar: every country's releases with the time, the consensus, the actual and the prior value. */
function NasdaqEcoCalendar({ week, setWeek, nq, now, minRel, setMinRel }: { week: number; setWeek: (n: number) => void; nq: ReturnType<typeof useNasdaqEco>; now: number; minRel: number; setMinRel: (n: number) => void }) {
  const [ctry, setCtry] = useState<string[]>(ECO_COUNTRIES);
  const [others, setOthers] = useState(false);
  const start = weekStart(now) + (week - 2) * 7 * DAY_MS;
  const merged = policyCalendarEvents(nq.events, start, start + 7 * DAY_MS, now);
  const events = merged.filter((e) => (ctry.includes(e.country) || (others && !ECO_COUNTRIES.includes(e.country))) && e.relevance >= minRel);
  const next = merged.find((e) => e.relevance >= 3 && e.time > now && (ctry.includes(e.country) || others));
  let lastDay = '';
  let band = 0;
  return (
    <div>
      <FnHeader
        code="RELEASES"
        title="Economic Calendar"
        sub={<>Times in your display time zone · <RealBadge /> Nasdaq calendar · Fed outcomes from official statements</>}
        tabs={[
          { n: 1, label: 'Last week' },
          { n: 2, label: 'This week' },
          { n: 3, label: 'Next week' },
        ]}
        tab={week}
        onTab={setWeek}
      />
      <div className="chart-tools">
        {ECO_COUNTRIES.map((c) => (
          <button key={c} type="button" className={`chip-btn${ctry.includes(c) ? ' on' : ''}`} style={ctry.includes(c) ? { background: 'var(--amber)' } : undefined} onClick={() => setCtry(ctry.includes(c) ? ctry.filter((x) => x !== c) : [...ctry, c])}>
            {c}
          </button>
        ))}
        <button type="button" className={`chip-btn${others ? ' on' : ''}`} style={others ? { background: 'var(--amber)' } : undefined} onClick={() => setOthers(!others)} title="Every other country Nasdaq lists">
          Other
        </button>
        <span className="seg" role="group" aria-label="Relevance">
          {[1, 2, 3].map((r) => (
            <button key={r} type="button" className={minRel === r ? 'on' : ''} onClick={() => setMinRel(r)}>
              {'●'.repeat(r)}+
            </button>
          ))}
        </span>
        {next && (
          <span>
            <span className="amber">Next key release</span> {next.country} {next.name} in <span className="white b">{countdown(next.time - now)}</span>
          </span>
        )}
        {nq.loading ? <span className="amber">loading…</span> : null}
      </div>
      <table className="tbl eco">
        <thead>
          <tr>
            <th>Date Time</th>
            <th title="Country">C</th>
            <th>Event</th>
            <th className="num" title="Survey: the consensus forecast">Surv(M)</th>
            <th className="num">Actual</th>
            <th className="num">Prior</th>
            <th className="hide-m" title="Relevance, from the kind of release">R</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">{nq.loading ? "Loading Nasdaq's economic calendar…" : 'No events for the selected filters.'}</td>
            </tr>
          )}
          {events.map((e) => {
            const p = e.date ? { y: Number(e.date.slice(0, 4)), mo: Number(e.date.slice(5, 7)), d: Number(e.date.slice(8, 10)) } : zonedParts(e.time);
            const dayKey = `${p.y}-${p.mo}-${p.d}`;
            if (dayKey !== lastDay) band++;
            lastDay = dayKey;
            const a = ecoNumber(e.actual);
            const c = ecoNumber(e.consensus);
            const diff = Number.isFinite(a) && Number.isFinite(c) ? a - c : 0;
            const ahead = e.policyStatus ? e.policyStatus !== 'confirmed' : e.time > now && !e.actual;
            const soon = ahead && e.time - now < 3600_000;
            return (
              <tr key={e.id} data-policy-status={e.policyStatus} data-policy-date={e.policyStatus ? e.policyDecision?.date ?? newYorkDate(e.time) : undefined} data-policy-outcome={e.policyDecision?.action} className={`${band % 2 ? 'eco-band' : ''}${ahead ? ' eco-ahead' : ''}`} title={e.description || undefined}>
                <td className={soon ? 'yellow b' : undefined}>
                  <span className="eco-date">{fmtMonthDayNum(p.mo, p.d)}</span> {e.date ? 'time not provided' : fmtTime(e.time, false)}
                </td>
                <td className="amber" title={e.countryName}>{e.country}</td>
                <td className={e.relevance >= 3 ? 'white b' : ''}>{e.name}{e.policyDecision && <> · <a href={e.policyDecision.sourceUrl} target="_blank" rel="noreferrer noopener">{policyDecisionLabel(e.policyDecision)}</a></>}</td>
                <td className="num" title={e.reportedConsensus ? `Nasdaq reports ${e.reportedConsensus}; target-bound definition not verified` : undefined}>{e.consensus}</td>
                <td className={`num b ${diff > 0 ? 'up' : diff < 0 ? 'dn' : 'white'}`} title={e.reportedActual ? `Nasdaq reports ${e.reportedActual}; official statement controls the announced upper bound` : undefined}>{e.policyStatus === 'awaiting-publication' ? <span className="amber">awaiting statement</span> : e.actual || (soon && e.time > now ? <span className="yellow">{countdown(e.time - now)}</span> : '')}</td>
                <td className="num" title={e.reportedPrevious ? `Nasdaq reports ${e.reportedPrevious}; official upper-bound evidence controls this comparison` : undefined}>{e.previous}</td>
                <td className="hide-m amber" title={`Relevance ${e.relevance}/3`}>
                  {'●'.repeat(e.relevance)}
                  <span className="faint">{'●'.repeat(3 - e.relevance)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pad-s muted">
        Nasdaq supplies the release calendar and its reported figures. Fed rows use the shared official statement record, including unchanged/0 bp and emergency decisions. Their actual is the announced upper bound; a delayed statement remains awaiting publication. Vendor policy figures remain in the cell details, and unverified target-bound forecasts are excluded from the surprise comparison. Relevance is the app&apos;s reading of the release type.
      </p>
    </div>
  );
}

/** Market lines for countries only the desktop app's ECST lists. */
const EXTRA_MARKETS: Record<string, { y10?: string; idx?: string; ccy?: string }> = {
  NL: { idx: 'AEX Index', ccy: 'EURUSD Curncy' },
  BE: { idx: 'BEL20 Index', ccy: 'EURUSD Curncy' },
};

const STATS: Record<string, { gdp: number; cpi: number; un: number; y10?: string; idx?: string; ccy?: string }> = {
  US: { gdp: 1.8, cpi: 3.3, un: 4.4, y10: 'USGG10YR Index', idx: 'SPX Index', ccy: 'DXY Curncy' },
  EZ: { gdp: 0.9, cpi: 2.4, un: 6.3, y10: 'GDBR10 Index', idx: 'SX5E Index', ccy: 'EURUSD Curncy' },
  DE: { gdp: 0.4, cpi: 2.5, un: 3.7, y10: 'GDBR10 Index', idx: 'DAX Index', ccy: 'EURUSD Curncy' },
  FR: { gdp: 0.8, cpi: 1.6, un: 7.6, y10: 'GFRN10 Index', idx: 'CAC Index', ccy: 'EURUSD Curncy' },
  IT: { gdp: 0.6, cpi: 1.7, un: 6.1, y10: 'GBTPGR10 Index', idx: 'FTSEMIB Index', ccy: 'EURUSD Curncy' },
  ES: { gdp: 2.4, cpi: 2.9, un: 10.4, y10: 'GSPG10YR Index', idx: 'IBEX Index', ccy: 'EURUSD Curncy' },
  GB: { gdp: 1.0, cpi: 3.6, un: 5.1, y10: 'GUKG10 Index', idx: 'UKX Index', ccy: 'GBPUSD Curncy' },
  CH: { gdp: 1.0, cpi: 0.4, un: 2.9, y10: 'GSWISS10 Index', idx: 'SMI Index', ccy: 'USDCHF Curncy' },
  JP: { gdp: 0.7, cpi: 2.7, un: 2.5, y10: 'GJGB10 Index', idx: 'NKY Index', ccy: 'USDJPY Curncy' },
  CN: { gdp: 4.7, cpi: 0.6, un: 5.2, y10: 'GCNY10YR Index', idx: 'SHCOMP Index', ccy: 'USDCNH Curncy' },
  IN: { gdp: 6.7, cpi: 3.2, un: 5.1, y10: 'GIND10YR Index', idx: 'SENSEX Index', ccy: 'USDINR Curncy' },
  KR: { gdp: 1.6, cpi: 2.2, un: 2.8, idx: 'KOSPI Index', ccy: 'USDKRW Curncy' },
  AU: { gdp: 1.9, cpi: 3.1, un: 4.4, y10: 'GACGB10 Index', idx: 'AS51 Index', ccy: 'AUDUSD Curncy' },
  CA: { gdp: 1.3, cpi: 2.6, un: 6.8, y10: 'GCAN10YR Index', idx: 'SPTSX Index', ccy: 'USDCAD Curncy' },
  BR: { gdp: 2.0, cpi: 4.9, un: 6.0, y10: 'GEBR10Y Index', idx: 'IBOV Index', ccy: 'USDBRL Curncy' },
  MX: { gdp: 0.8, cpi: 3.9, un: 2.7, y10: 'GMXN10YR Index', idx: 'MEXBOL Index', ccy: 'USDMXN Curncy' },
};

export function ECST(props: FnProps) {
  if (engine.realOnly) return <ECSTReal />;
  return <ECSTSim {...props} />;
}

/** A statistic from FRED with the period it refers to. */
function stat(key: [string, Freq, Calc?] | undefined, calc: Calc, series: Record<string, Obs>): { v: number; period: string; health?: DatasetHealth } | null {
  if (!key) return null;
  const [id, freq] = key;
  calc = key[2] ?? calc;
  const obs = series[id];
  if (!obs?.length) return null;
  const p = obs[obs.length - 1][0];
  const v = valueAt(obs, p, calc, freq);
  const status = figureStatus(id, p);
  return v == null ? null : { v, period: `${figurePeriod(id, p, freq)}${status ? ` (${status})` : ''}`, health: fredSeriesHealth(id) };
}

function StatCell({ s, dec = 1, mark }: { s: { v: number; period: string; health?: DatasetHealth } | null; dec?: number; mark?: boolean }) {
  if (!s) return <span className="faint">--</span>;
  return (
    <span title={`${s.period}${mark ? ', worked out from the real GDP level a year earlier' : ''}${s.health?.checkedAt ? `; last successful check ${fmtDateTime(s.health.checkedAt)}` : ''}${s.health?.error ? `; latest check failed: ${s.health.error}` : ''}`}>
      {fmtNum(s.v, dec)}
      {mark ? '*' : ''} <span className="muted">{s.period}</span>
      {s.health?.state === 'error' ? <span className="amber"> · retained</span> : s.health?.state === 'cached' ? <span className="muted"> · cached</span> : null}
    </span>
  );
}

/**
 * ECST on real data: growth, inflation and unemployment from FRED (the
 * agencies' published figures, growth rates worked out from the published
 * levels), policy rates from the central banks, markets from the live feeds.
 */
function ECSTReal() {
  useInterval(2000);
  const panel = usePanelId();
  const series = fredData.use((x) => x.series);
  fredData.use((x) => x.health);
  const rates = policyRates.use((x) => x);
  const needsKey = fredData.use((x) => x.needsKey);
  const keyRefused = fredData.use((x) => x.keyRefused);
  const cbs = centralBanks();
  const policy = (c: string) => cbs.find((b) => b.country === (EUROSTAT_MEMBERS.includes(c) ? 'EZ' : c))?.rate;
  const market = (id?: string) => (id && engine.hasSource(id) ? id : undefined);
  // The Fed sets a target range: shown whole, with the real rate worked out from its upper limit.
  const fedLow = currentPolicyTarget(rates, 'FED', rates.fedUpper, engine.now()).lower ?? NaN;
  const rows = Object.entries(COUNTRY_STATS).map(([c, k]) => {
    const cpi = stat(k.cpi, 'yoy', series);
    const rate = policy(c);
    return {
      c,
      gdp: stat(k.gdp, 'yoy', series),
      cpi,
      un: stat(k.un, 'level', series),
      rate,
      real: rate != null && cpi ? rate - cpi.v : NaN,
      y10: market((STATS[c] ?? EXTRA_MARKETS[c])?.y10),
      idx: market((STATS[c] ?? EXTRA_MARKETS[c])?.idx),
      ccy: market((STATS[c] ?? EXTRA_MARKETS[c])?.ccy),
    };
  });
  // What stays blank without FRED: "US GDP", "JP GDP, CPI, unemployment".
  const blank = rows
    .map((r) => [r.c, [!r.gdp && 'GDP', !r.cpi && 'CPI', !r.un && 'unemployment'].filter(Boolean).join(', ')] as const)
    .filter(([, f]) => f)
    .map(([c, f]) => `${c} ${f}`);
  return (
    <div>
      <FnHeader
        code="ECONSTATS"
        title="World Economic Statistics"
        sub={
          <>
            <RealBadge /> latest published figures with their periods: BEA and BLS, Japan's Cabinet Office, the IMF and the OECD (via FRED), Eurostat, the ONS, Statistics Canada, the ABS · policy rates from the central banks
          </>
        }
      />
      {needsKey || keyRefused ? (
        <div className="note amber">
          {keyRefused ? `FRED did not accept the API key (${keyRefused}), so` : 'FRED needs your free API key (from fredaccount.stlouisfed.org), so until it is added'} the figures only FRED serves show "--"
          {blank.length ? ` (${blank.join(', ')})` : ''}. The rest come from the statistics offices themselves{series.CPIAUCNS?.length || series.UNRATE?.length ? ', US inflation and unemployment from the BLS' : ''}.{' '}
          <button type="button" className="btn" onClick={() => execute(panel, 'PROVIDERS')}>
            Open the provider screen
          </button>
        </div>
      ) : !Object.keys(series).length ? (
        <div className="empty">Loading statistics from FRED…</div>
      ) : null}
      <DataTable
        rows={rows}
        rowKey={(r) => r.c}
        columns={[
          { key: 'c', label: 'Country', render: (r) => <span className="amber">{COUNTRY_NAMES[r.c]}</span>, sort: (r) => COUNTRY_NAMES[r.c] },
          { key: 'g', label: 'Real GDP YoY %', num: true, render: (r) => <StatCell s={r.gdp} mark={COMPUTED_GROWTH.has(r.c)} />, sort: (r) => r.gdp?.v ?? NaN },
          { key: 'i', label: 'CPI YoY %', num: true, render: (r) => <StatCell s={r.cpi} />, sort: (r) => r.cpi?.v ?? NaN },
          { key: 'u', label: 'Unemp %', num: true, render: (r) => <StatCell s={r.un} />, sort: (r) => r.un?.v ?? NaN },
          {
            key: 'r',
            label: 'Policy %',
            num: true,
            render: (r) => (r.rate == null ? '--' : r.c === 'US' && Number.isFinite(fedLow) ? <span title="Federal funds target range">{`${fmtNum(fedLow, 2)}-${fmtNum(r.rate, 2)}`}</span> : fmtNum(r.rate, 2)),
            sort: (r) => r.rate ?? NaN,
          },
          { key: 'real', label: 'Real rate', num: true, render: (r) => (Number.isFinite(r.real) ? <Chg v={r.real} dec={2} /> : '--'), sort: (r) => r.real, hideM: true },
          { key: 'y', label: '10Y yld', num: true, render: (r) => (r.y10 ? <LivePx id={r.y10} /> : '--') },
          { key: 'idx', label: 'Equity YTD', num: true, render: (r) => (r.idx ? <Chg v={periodChange(r.idx, 'YTD')} pct dec={1} /> : '--'), sort: (r) => (r.idx ? periodChange(r.idx, 'YTD') : NaN) },
          { key: 'fx', label: 'FX YTD', num: true, render: (r) => (r.ccy ? <Chg v={periodChange(r.ccy, 'YTD')} pct dec={1} /> : '--'), hideM: true },
        ]}
      />
      <Section title="Central banks">
        <DataTable
          rows={cbs}
          rowKey={(b) => b.code}
          columns={[
            { key: 'b', label: 'Bank', render: (b) => b.bank },
            { key: 'r', label: 'Rate', num: true, render: (b) => `${fmtNum(b.rate, 2)}%` },
            {
              key: 'n',
              label: 'Next meeting',
              render: (b) => {
                const calendar = policyMeetingState(b.code, b.meetings, rates.decisions ?? [], engine.now());
                return calendar.next ? fmtDay(Date.parse(`${calendar.next.date}T00:00:00Z`)) : <span className="muted" title={`Calendar coverage through ${calendar.horizon ?? 'unknown'}`}>Calendar exhausted</span>;
              },
            },
          ]}
        />
      </Section>
      <div className="note">
        Growth is real GDP against the same quarter a year earlier and inflation the 12-month rate, as each statistics office publishes them: BEA and BLS for the US, Eurostat for the euro area and its members (HICP), the ONS for the UK. US inflation is worked out from the published CPI index the way the BLS does. UK unemployment is the ONS Labour Force Survey rate, an average over the three months shown. Canada's unemployment and inflation are Statistics Canada's (inflation adapted from its CPI index, the way StatCan works it out), Australia's the ABS's. For Japan, Canada and Australia, growth is worked out from real GDP levels (marked *): the Cabinet Office's for Japan and the IMF's International Financial Statistics for Canada and Australia, via FRED. Japan's unemployment is the OECD harmonised rate, which comes about a month after the Statistics Bureau publishes its own, and Japan's inflation is not connected yet. The US policy rate is the Fed's target range; the real rate uses its upper limit. FX YTD is the pair as quoted (e.g. USDJPY up = weaker yen).
      </div>
      <Credits ids={['ons', 'eurostat', 'statcan', 'abs', 'nyfed', 'ecb', 'boe', 'boc', 'rba', 'treasury', 'bundesbank', 'mof', 'bde']} />
      <FredNotice />
    </div>
  );
}

function ECSTSim(_: FnProps) {
  useInterval(2000);
  const cbs = centralBanks();
  const policy = (c: string) => cbs.find((b) => b.country === (EUROSTAT_MEMBERS.includes(c) ? 'EZ' : c))?.rate;
  const rows = Object.entries(STATS).map(([c, s]) => ({ c, ...s, rate: policy(c) }));
  return (
    <div>
      <FnHeader
        code="ECONSTATS"
        title="World Economic Statistics"
        sub={
          <>
            <SimBadge /> GDP, inflation and jobless figures are reference settings{desktopData() ? ' · market levels and the Fed, ECB, BoE and BoC rates are real' : ''}
          </>
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.c}
        columns={[
          { key: 'c', label: 'Country', render: (r) => <span className="amber">{COUNTRY_NAMES[r.c]}</span>, sort: (r) => COUNTRY_NAMES[r.c] },
          { key: 'g', label: 'GDP YoY %', num: true, render: (r) => fmtNum(r.gdp, 1), sort: (r) => r.gdp },
          { key: 'i', label: 'CPI YoY %', num: true, render: (r) => fmtNum(r.cpi, 1), sort: (r) => r.cpi },
          { key: 'u', label: 'Unemp %', num: true, render: (r) => fmtNum(r.un, 1), sort: (r) => r.un },
          { key: 'r', label: 'Policy %', num: true, render: (r) => (r.rate != null ? fmtNum(r.rate, 2) : '--'), sort: (r) => r.rate ?? NaN },
          { key: 'real', label: 'Real rate', num: true, render: (r) => (r.rate != null ? <Chg v={r.rate - r.cpi} dec={2} /> : '--'), sort: (r) => (r.rate ?? NaN) - r.cpi, hideM: true },
          { key: 'y', label: '10Y yld', num: true, render: (r) => (r.y10 ? <LivePx id={r.y10} /> : '--') },
          { key: 'idx', label: 'Equity YTD', num: true, render: (r) => (r.idx ? <Chg v={periodChange(r.idx, 'YTD')} pct dec={1} /> : '--'), sort: (r) => (r.idx ? periodChange(r.idx, 'YTD') : NaN) },
          { key: 'fx', label: 'FX YTD', num: true, render: (r) => (r.ccy ? <Chg v={periodChange(r.ccy, 'YTD')} pct dec={1} /> : '--'), hideM: true },
        ]}
      />
      <Section title="Central banks">
        <DataTable
          rows={cbs}
          rowKey={(b) => b.code}
          columns={[
            { key: 'b', label: 'Bank', render: (b) => b.bank },
            { key: 'r', label: 'Rate', num: true, render: (b) => `${fmtNum(b.rate, 2)}%` },
            { key: 'n', label: 'Next meeting', render: (b) => b.meetings.find((m) => Date.parse(`${m}T23:59:00Z`) > engine.now()) ?? 'n/a' },
          ]}
        />
      </Section>
      <div className="note">FX YTD is the pair as quoted (e.g. USDJPY up = weaker yen).</div>
    </div>
  );
}

/** The notice FRED's API terms ask every application to show where its data appears. */
export function FredNotice() {
  return (
    <div className="note">
      {FRED_NOTICE}{' '}
      <a href={FRED_TERMS_URL} target="_blank" rel="noreferrer noopener" className="blue">
        FRED API terms of use
      </a>
      .
    </div>
  );
}
