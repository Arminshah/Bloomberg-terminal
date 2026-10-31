// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { Credits } from '../components/Credits';
import { useState } from 'react';
import { createStore } from '../core/store';
import { Dialog } from '../components/Dialog';
import { DateRangeFields } from '../components/DateRange';
import { exportActions } from '../components/ExportActions';
import { news, type Story } from '../data/news';
import { countryStories } from '../data/world-bonds';
import { ECO_REGIONS, ECO_SUBTYPES, ECO_TYPES, fredChart, fromEco, fromNasdaq, inRegion, ofKind, type EcoRow, type EcoType } from '../data/eco-rows';
import { releaseAlerts, releaseKey, toggleReleaseAlert } from '../data/release-alerts';
import { FnHeader } from '../components/FnHeader';
import { Chg, LivePx, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { fmtDateTime, fmtDay, fmtMonthDayNum, fmtNum, fmtTime, zonedParts } from '../core/format';
import { execute } from '../terminal/exec';
import { flash, useMenu, usePanelId } from '../terminal/panel';
import { engine, useInterval } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { centralBanks, COUNTRY_NAMES, ecoEvents, newYorkDate, policyCalendarEvents } from '../data/eco';
import { periodChange } from '../data/analytics';
import type { FnProps } from '../terminal/types';
import { FRED_NOTICE, FRED_TERMS_URL } from '../data/macroseries';
import { RealBadge, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';
import { policyRates } from '../data/live/policy';
import { currentPolicyTarget, policyDecisionLabel, policyMeetingState } from '../data/policy-state';
import type { DatasetHealth } from '../data/live/provenance';
import { nasdaqEcoAvailable, useNasdaqEco } from '../data/live/nasdaq-eco';
import { COMPUTED_GROWTH, COUNTRY_STATS, EUROSTAT_MEMBERS, figurePeriod, figureStatus, fredData, fredSeriesHealth, US_EVENTS, valueAt, type Calc, type Freq, type Obs } from '../data/live/fred';

/** ECO's saved defaults (9 GO): the region and how many days the range runs from today, and the filter row. */
const ecoPrefs = createStore<{ region: string; days: number; filters: boolean; custom: { name: string; countries: string[] }[] }>({ region: 'US', days: 7, filters: false, custom: [] }, 'eco', 1);

/** Nasdaq is asked one day at a time: a range longer than this is cut, and the screen says so. */
const NASDAQ_MAX_DAYS = 31;

/** The countries the region field offers, in the order of the app's markets. */
const ECO_COUNTRY_LIST = ['US', 'CA', 'BR', 'MX', 'EZ', 'DE', 'FR', 'IT', 'ES', 'GB', 'CH', 'SE', 'NO', 'NL', 'BE', 'JP', 'CN', 'AU', 'NZ', 'IN', 'KR', 'HK', 'SG'];

const countryName = (c: string) => COUNTRY_NAMES[c] ?? c;

/** The region a field value names: a region's id, "custom:<name>" for a custom calendar, or a country's code. */
function regionSpec(region: string, custom: { name: string; countries: string[] }[]): string | string[] {
  if (region.startsWith('custom:')) return custom.find((c) => `custom:${c.name}` === region)?.countries ?? [];
  return region;
}

function regionLabel(region: string): string {
  if (region.startsWith('custom:')) return region.slice(7);
  return ECO_REGIONS.find((r) => r.id === region)?.name ?? countryName(region);
}

/** The day (UTC midnight) a row falls on in the display time zone; a date-only release keeps its own date. */
function rowDay(r: EcoRow): number {
  if (r.date) return Date.parse(`${r.date}T00:00:00Z`);
  const p = zonedParts(r.time);
  return Date.UTC(p.y, p.mo - 1, p.d);
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

/** R: four rising bars, lit from dark to light amber up to the release's level (the app's reading, see EcoRow). */
function Bars({ n }: { n: number }) {
  return (
    <span className="eco-bars" role="img" aria-label={`Relevance ${n} of 4`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? `on b${i}` : ''} style={{ height: `${3 + i * 2}px` }} />)}
    </span>
  );
}

/** M: the release's alert, an outline bell, green when set. */
function Bell({ on }: { on: boolean }) {
  return (
    <svg className={`eco-bell${on ? ' on' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1.4c-1.9 0-3.1 1.4-3.1 3.3v2.4L1.8 8.6h8.4L9.1 7.1V4.7C9.1 2.8 7.9 1.4 6 1.4z" />
      <path d="M4.7 9.6a1.4 1.4 0 0 0 2.6 0" />
    </svg>
  );
}

const cell = (v: string) => v || '--';

/**
 * ECO, Economic Calendars, as the Equities Workflow Brochure draws it (p.12, January 2025): 1) Calendars, 2) Alerts,
 * 3) Export and 4) Settings on the red bar; the region in its amber field with 6) Browse, the clock and the date range;
 * the kind and subtype of event and the Agenda view; the agenda numbered from 21) with Date Time, A, M, R, Event,
 * Period, Surv(M), Actual, Prior, Revised and C, the days banded; and the economics headlines under it (Quick Start
 * 2024, p.33). A row opens its release.
 */
export function ECO(_: FnProps) {
  useInterval(1000);
  const panel = usePanelId();
  const now = engine.now();
  const real = engine.realOnly;
  policyRates.use((r) => r);
  fredData.use((x) => x.loaded);
  fredData.use((x) => x.health);
  const needsKey = fredData.use((x) => x.needsKey);
  const keyRefused = fredData.use((x) => x.keyRefused);
  const prefs = ecoPrefs.use((s) => s);
  const bells = releaseAlerts.use((s) => s.keys);
  const stories = news.use((s) => s.stories);
  const today = (() => {
    const p = zonedParts(now);
    return Date.UTC(p.y, p.mo - 1, p.d);
  })();
  const [region, setRegion] = useState(prefs.region);
  const [range, setRange] = useState({ from: today, to: today + prefs.days * DAY_MS });
  const [type, setType] = useState<EcoType>('releases');
  const [sub, setSub] = useState('all');
  const [showFilters, setShowFilters] = useState(prefs.filters);
  const [minBars, setMinBars] = useState(0);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<EcoRow | null>(null);
  const [dialog, setDialog] = useState<'browse' | 'custom' | 'alerts' | null>(null);

  // Each source is asked a day either side, so a release late in the evening somewhere still lands on its day here.
  const fetchFrom = range.from - DAY_MS;
  const span = Math.round((range.to - range.from) / DAY_MS) + 1;
  const cut = span > NASDAQ_MAX_DAYS;
  const nq = useNasdaqEco(fetchFrom, Math.min(span, NASDAQ_MAX_DAYS) + 2, now);
  const onNasdaq = real && desktopData() && nasdaqEcoAvailable() && (nq.any || nq.loading);
  const fetchTo = range.to + 2 * DAY_MS;
  const nyToday = newYorkDate(now);
  const all: EcoRow[] = onNasdaq
    ? policyCalendarEvents(nq.events, fetchFrom, fetchTo, now).map((e) => fromNasdaq(e, now))
    : ecoEvents(fetchFrom, fetchTo, now).map((e) => {
        const ev = e.real && e.country === 'US' ? US_EVENTS.find((x) => e.id.startsWith(`US:${x.name}:`)) : undefined;
        return fromEco(e, now, nyToday, real, ev ? fredChart(ev.series, ev.calc) : undefined);
      });
  const spec = regionSpec(region, prefs.custom);
  const lastDay = cut ? range.from + (NASDAQ_MAX_DAYS - 1) * DAY_MS : range.to;
  const needle = text.trim().toLowerCase();
  const rows = all
    .filter((r) => {
      const d = rowDay(r);
      return d >= range.from && d <= (onNasdaq ? lastDay : range.to) && inRegion(r.country, spec) && ofKind(r, type, sub) && r.bars >= minBars && (!needle || r.name.toLowerCase().includes(needle));
    })
    .sort((a, b) => rowDay(a) - rowDay(b) || a.time - b.time);
  const next = all.find((r) => r.relevance >= 3 && !r.released && r.time > now && inRegion(r.country, spec));
  const headlines = econStories(stories, spec);

  const saveDefault = () => {
    ecoPrefs.set((s) => ({ ...s, region, days: Math.max(1, Math.round((range.to - range.from) / DAY_MS)), filters: showFilters }));
    flash(panel, `Saved as ECO's default: ${regionLabel(region)}, ${Math.round((range.to - range.from) / DAY_MS)} days from today`, 'info');
  };
  const csv = () => [
    ['Date', 'Time', 'Country', 'Event', 'Period', 'Surv(M)', 'Actual', 'Prior', 'Revised', 'Relevance (of 4, the app\'s reading)', 'Source'],
    ...rows.map((r) => [fmtDay(rowDay(r), true), r.date ? '' : fmtTime(r.time, false), r.country, r.name, r.period, r.survey, r.actual, r.prior, r.revised, r.bars, r.source]),
  ];
  const exp = exportActions(panel, 'economic-calendar.csv', csv);
  const first = 21;
  useMenu('eco', [
    { n: 6, label: 'Browse', run: () => setDialog('browse') },
    { n: 9, label: 'Save as Default', run: saveDefault },
    ...headlines.map((s, i) => ({ n: 11 + i, label: s.headline, run: () => readStory(panel, s) })),
    ...rows.map((r, i) => ({ n: first + i, label: r.name, run: () => setOpen(r) })),
  ]);

  const emptyText = onNasdaq
    ? nq.loading ? "Loading Nasdaq's economic calendar…" : 'No releases for these choices.'
    : real && keyRefused
      ? `The FRED API key was not accepted: ${keyRefused} Check the key in PROVIDERS.`
      : real && needsKey
        ? 'US releases need your free FRED API key (from fredaccount.stlouisfed.org): add it in PROVIDERS.'
        : real && !fredData.get().loaded
          ? 'Loading the release calendar from FRED…'
          : 'No releases for these choices.';
  const subtypes = ECO_SUBTYPES[type];
  let band = 0;
  let prevDay = NaN;
  return (
    <div className="eco-screen">
      <FnHeader
        code="RELEASES"
        title="Economic Calendars"
        actions={[
          {
            n: 1,
            label: 'Calendars',
            onClick: () => {},
            menu: [
              ...ECO_REGIONS.map((r) => ({ label: r.name, onClick: () => setRegion(r.id) })),
              ...prefs.custom.map((c, i) => ({ label: `${c.name} (custom)`, sep: i === 0, onClick: () => setRegion(`custom:${c.name}`) })),
              { label: 'Add New Custom Calendar…', sep: true, onClick: () => setDialog('custom') },
            ],
          },
          { n: 2, label: 'Alerts', onClick: () => setDialog('alerts'), title: 'The releases whose bells are set' },
          { n: 3, label: 'Export', onClick: () => {}, menu: exp.map((a) => ({ label: a.label === 'Copy' ? 'Copy to Clipboard' : 'Download as CSV', title: a.title, onClick: a.onClick })) },
          {
            n: 4,
            label: 'Settings',
            onClick: () => {},
            menu: [
              { label: showFilters ? 'Hide the Filter Row' : 'Show the Filter Row', onClick: () => setShowFilters((v) => !v) },
              { label: 'Save as Default (9 GO)', onClick: saveDefault },
              { label: 'Time Zone and Date Order (SETTINGS)', sep: true, onClick: () => execute(panel, 'SETTINGS') },
            ],
          },
        ]}
        controls={
          <div className="eco-ctl">
            <div className="eco-ctl-row">
              <select className="sel-inp eco-region" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
                <optgroup label="Regions">{ECO_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
                {prefs.custom.length ? <optgroup label="Custom calendars">{prefs.custom.map((c) => <option key={c.name} value={`custom:${c.name}`}>{c.name}</option>)}</optgroup> : null}
                <optgroup label="Countries">{ECO_COUNTRY_LIST.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</optgroup>
              </select>
              <button type="button" className="btn-grey" onClick={() => setDialog('browse')}><b>6)</b> Browse</button>
              <span className="white eco-clock" data-testid="eco-clock">{fmtTime(now, true)}</span>
              <span className="eco-range"><DateRangeFields from={range.from} to={range.to} label="" onChange={(from, to) => setRange({ from, to })} /></span>
            </div>
            <div className="eco-ctl-row">
              <select className="sel-inp" aria-label="Kind of event" value={type} onChange={(e) => { setType(e.target.value as EcoType); setSub('all'); }}>
                {ECO_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <select className="sel-inp" aria-label="Subtype" value={sub} onChange={(e) => setSub(e.target.value)}>
                {subtypes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <span className="amber eco-view">View</span>
              <label className="eco-radio amber"><input type="radio" checked readOnly /> Agenda</label>
              <label className="eco-radio amber" title="No frame shows the terminal's Weekly view, so the app has only the Agenda"><input type="radio" disabled /> Weekly</label>
              {next ? (
                <span className="eco-next muted" title="The app's own reading of what is next, by its relevance">
                  Next key release <span className="amber">{next.country} {next.name}</span> in <span className="white">{countdown(next.time - now)}</span>
                </span>
              ) : null}
            </div>
          </div>
        }
      />
      <table className="tbl eco" data-testid="eco-table">
        <thead>
          <tr>
            <th className="num">Date Time</th>
            <th className="eco-icon" title="Live audio or video of the release: no free source">A</th>
            <th className="eco-icon" title="Alert: set the bell to be told when the release is out">M</th>
            <th className="eco-icon" title="Relevance, the app's reading of the kind of release (no source gives it)">R</th>
            <th>Event</th>
            <th className="num">Period</th>
            <th className="num" title={onNasdaq ? "Nasdaq's consensus (its data partner's), not a median of a survey" : 'Survey: the median forecast'}>Surv(M)</th>
            <th className="num">Actual</th>
            <th className="num">Prior</th>
            <th className="num hide-m">Revised</th>
            <th title="Country">C</th>
          </tr>
          {showFilters ? (
            <tr className="eco-filters">
              <th />
              <th />
              <th />
              <th>
                <select className="sel-inp" aria-label="Lowest relevance" value={minBars} onChange={(e) => setMinBars(Number(e.target.value))}>
                  <option value={0}>All</option>
                  <option value={2}>2+</option>
                  <option value={3}>3+</option>
                  <option value={4}>4</option>
                </select>
              </th>
              <th><input className="inp" aria-label="Event filter" placeholder="Event" value={text} onChange={(e) => setText(e.target.value)} /></th>
              <th colSpan={6} />
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="empty">{emptyText}</td>
            </tr>
          ) : null}
          {rows.map((r, i) => {
            const day = rowDay(r);
            if (day !== prevDay) band++;
            prevDay = day;
            const p = r.date ? null : zonedParts(r.time);
            const md = fmtMonthDayNum(new Date(day).getUTCMonth() + 1, new Date(day).getUTCDate());
            const bell = bells.includes(releaseKey(r.country, r.name));
            const dueNote = !r.released ? (r.date ? (day === today ? 'Due today; the source gives no time' : 'The source gives the day, not the time') : r.time > now ? `Due in ${countdown(r.time - now)}` : 'Its time has passed; the value has not reached the source yet') : undefined;
            return (
              <tr
                key={r.id}
                className={`click${band % 2 ? '' : ' eco-band'}${day === today ? ' eco-today' : ''}`}
                onClick={() => setOpen(r)}
                title={r.description || undefined}
                data-policy-status={r.policyStatus}
                data-policy-date={r.policyStatus ? r.policyDecision?.date ?? r.date ?? newYorkDate(r.time) : undefined}
                data-policy-outcome={r.policyDecision?.action}
              >
                <td className="num amber eco-dt" title={r.timeFrom ? `Time from the ${r.timeFrom}` : undefined}>
                  <span className="rowno">{first + i})</span> {md}{p ? ` ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}` : ''}
                </td>
                <td className="eco-icon" />
                <td className="eco-icon">
                  <button type="button" className="eco-bell-btn" aria-label={bell ? `Clear the alert on ${r.name}` : `Alert me when ${r.name} is out`} aria-pressed={bell} title={bell ? 'Alert set: the app tells you when the actual is out' : 'Set an alert for when the actual is out'} onClick={(e) => { e.stopPropagation(); toggleReleaseAlert(r.country, r.name); }}>
                    <Bell on={bell} />
                  </button>
                </td>
                <td className="eco-icon" title={`Relevance ${r.bars} of 4: the app's reading of the kind of release`}><Bars n={r.bars} /></td>
                <td className="eco-ev">
                  {r.name}
                  {r.policyDecision ? <> · <a href={r.policyDecision.sourceUrl} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>{policyDecisionLabel(r.policyDecision)}</a></> : null}
                  {r.health && r.health.state !== 'current' ? <span className="muted" title={`${r.health.checkedAt ? `Last successful check ${fmtDateTime(r.health.checkedAt)}. ` : 'No successful check recorded. '}${r.health.error ?? ''}`}>{r.health.state === 'error' ? ' · retained; latest check failed' : r.health.state === 'cached' ? ' · cached' : ''}</span> : null}
                  {!r.real && all.some((x) => x.real) ? <span className="muted"> DEMO</span> : null}
                </td>
                <td className="num amber">{cell(r.period)}</td>
                <td className="num amber" title={r.notes?.survey}>{cell(r.survey)}</td>
                <td className="num white" title={r.notes?.actual ?? dueNote}>
                  {r.policyStatus === 'awaiting-publication' ? <span className="amber" title="The scheduled time has passed, but no official statement has been archived">awaiting statement</span> : r.policyStatus === 'statement-unavailable' ? <span className="muted" title="This bank's statements are not archived here">statement not archived</span> : cell(r.actual)}
                </td>
                <td className="num amber" title={r.notes?.prior}>{cell(r.prior)}</td>
                <td className="num amber hide-m">{cell(r.revised)}</td>
                <td className="amber" title={r.countryName}>{r.country}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cut && onNasdaq ? <p className="pad-s amber">Nasdaq is asked one day at a time, so the agenda stops at {fmtDay(lastDay, true)}: {NASDAQ_MAX_DAYS} days.</p> : null}
      <div className="eco-news" data-testid="eco-news">
        <div className="eco-news-h">Economics News and Analysis | <button type="button" className="link-btn" onClick={() => execute(panel, `NEWS ${Array.isArray(spec) || ECO_REGIONS.some((x) => x.id === spec) ? 'ECONOMY' : countryName(spec)}`)}>NEWS »</button></div>
        {headlines.length ? (
          <ol>
            {headlines.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => readStory(panel, s)} title={s.headline}>
                  <span className="rowno">{11 + i})</span>
                  <span className="eco-news-src">{s.source}</span>
                  <span className="amber eco-news-t">{storyStamp(s.time, now)}</span>
                  <span className="amber eco-news-hl">{s.headline}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="muted pad-s">No economics headline the app holds names {regionLabel(region)} yet; NEWS » searches all news.</div>
        )}
      </div>
      <p className="pad-s muted">
        {onNasdaq ? "Releases, times, consensus, actual and prior: Nasdaq's calendar, as its data partner publishes them (it gives no period or revision). Fed decisions: the Fed's own statements, their actual the announced upper bound. " : real ? `US releases: FRED's release dates and published values (${US_EVENTS.length} indicators; FRED gives no time of day); central bank decisions from the banks' own data; consensus forecasts are not public. ` : 'Release dates, consensus and actuals are generated for the demo. '}
        Times are in your display time zone. Relevance (R) is the app&apos;s reading of the kind of release, and the kinds and subtypes are sorted by name; the sources give neither. A: no source has live audio or video. Bells ring once, when the actual is out, while the app runs.
      </p>
      {real && !onNasdaq ? <FredNotice /> : null}
      {open ? <EcoRelease r={open} onClose={() => setOpen(null)} /> : null}
      {dialog === 'browse' ? <EcoBrowse onPick={(id) => { setRegion(id); setDialog(null); }} onClose={() => setDialog(null)} custom={prefs.custom} /> : null}
      {dialog === 'custom' ? <EcoCustom onSave={(c) => { ecoPrefs.set((s) => ({ ...s, custom: [...s.custom.filter((x) => x.name !== c.name), c] })); setRegion(`custom:${c.name}`); setDialog(null); }} onClose={() => setDialog(null)} /> : null}
      {dialog === 'alerts' ? <EcoAlerts onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

/** Stories that name a region's countries and read as economics, newest first. */
const ECON = /inflation|\bgdp\b|econom|jobs|payroll|unemploy|central bank|interest rate|rate (?:cut|hike|decision)|\bcpi\b|\bppi\b|\bpmi\b|retail sales|trade|tariff|recession|growth|wages|yields?\b|monetary|fiscal|budget|deficit/i;

function econStories(stories: Story[], spec: string | string[]): Story[] {
  const econ = stories.filter((s) => ECON.test(s.headline));
  const countries = Array.isArray(spec) ? spec : ECO_REGIONS.find((r) => r.id === spec) ? ECO_REGIONS.find((r) => r.id === spec)!.countries : [spec];
  const named = countries.length ? [...new Map(countries.flatMap((c) => countryStories(econ, c, 5)).map((s) => [s.id, s])).values()] : econ;
  return named.sort((a, b) => b.time - a.time).slice(0, 5);
}

function storyStamp(t: number, now: number): string {
  const p = zonedParts(t);
  const q = zonedParts(now);
  return p.y === q.y && p.mo === q.mo && p.d === q.d ? `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}` : fmtMonthDayNum(p.mo, p.d);
}

function readStory(panel: number, s: Story) {
  if (s.url) window.open(s.url, '_blank', 'noopener,noreferrer');
  else flash(panel, 'This story has no link to its publisher');
}

/** A release opened from the agenda: its figures and where they come from, its description, and its chart. */
function EcoRelease({ r, onClose }: { r: EcoRow; onClose: () => void }) {
  const panel = usePanelId();
  const go = (cmd: string) => {
    onClose();
    execute(panel, cmd);
  };
  return (
    <Dialog
      title={`${r.countryName} ${r.name}`}
      onClose={onClose}
      testId="eco-release"
      buttons={[
        ...(r.chart ? [{ label: 'Chart (ECONCHART)', onClick: () => go(`ECONCHART ${r.chart}`) }] : []),
        { label: 'News', onClick: () => go(`NEWS ${r.name}`) },
        { label: 'Close', onClick: onClose, primary: true },
      ]}
    >
      <table className="tbl eco-rel">
        <tbody>
          <tr><td className="amber">Release</td><td className="white">{r.date ? `${fmtDay(Date.parse(`${r.date}T00:00:00Z`), true)} (no time from the source)` : fmtDateTime(r.time)}</td></tr>
          <tr><td className="amber">Period</td><td>{cell(r.period)}</td></tr>
          <tr><td className="amber">Surv(M)</td><td>{cell(r.survey)}</td></tr>
          <tr><td className="amber">Actual</td><td className="white">{cell(r.actual)}</td></tr>
          <tr><td className="amber">Prior</td><td>{cell(r.prior)}</td></tr>
          <tr><td className="amber">Revised</td><td>{cell(r.revised)}</td></tr>
          <tr><td className="amber">Relevance</td><td>{r.bars} of 4 (the app&apos;s reading)</td></tr>
          <tr><td className="amber">Source</td><td>{r.source}</td></tr>
        </tbody>
      </table>
      {r.description ? <p className="pad-s">{r.description.replace(/<br\s*\/?>/gi, ' ').replace(/&lt;BR\/&gt;/gi, ' ')}</p> : null}
      {!r.chart ? <p className="pad-s muted">{r.real ? 'No history of this release is connected: its actuals and the survey are shown as published today.' : 'A demo release: its figures are generated.'}</p> : null}
    </Dialog>
  );
}

/** 6) Browse: the regions, the custom calendars and the countries, to pick one. */
function EcoBrowse({ onPick, onClose, custom }: { onPick: (id: string) => void; onClose: () => void; custom: { name: string; countries: string[] }[] }) {
  return (
    <Dialog title="Browse Regions" onClose={onClose} testId="eco-browse" buttons={[{ label: 'Close', onClick: onClose, primary: true }]}>
      <div className="eco-browse">
        <div>
          <div className="amber">Regions</div>
          {ECO_REGIONS.map((r) => <button key={r.id} type="button" className="link-btn" onClick={() => onPick(r.id)}>{r.name}</button>)}
          {custom.length ? <div className="amber">Custom calendars</div> : null}
          {custom.map((c) => <button key={c.name} type="button" className="link-btn" onClick={() => onPick(`custom:${c.name}`)}>{c.name}</button>)}
        </div>
        <div>
          <div className="amber">Countries</div>
          {ECO_COUNTRY_LIST.map((c) => <button key={c} type="button" className="link-btn" onClick={() => onPick(c)}>{countryName(c)}</button>)}
        </div>
      </div>
    </Dialog>
  );
}

/** 1) Calendars, Add New Custom Calendar (Scranton 2015, p.53): a name and the countries to include. */
function EcoCustom({ onSave, onClose }: { onSave: (c: { name: string; countries: string[] }) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const ok = name.trim() !== '' && picked.length > 0;
  return (
    <Dialog
      title="Add New Custom Calendar"
      onClose={onClose}
      testId="eco-custom"
      buttons={[
        { label: '1) Save', primary: true, onClick: () => { if (ok) onSave({ name: name.trim(), countries: picked }); } },
        { label: 'Close', onClick: onClose },
      ]}
    >
      <label className="eco-custom-name"><span className="amber">Calendar Name</span> <input className="inp" aria-label="Calendar Name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <p className="muted">Tick the countries to include.</p>
      <div className="eco-custom-list">
        {ECO_COUNTRY_LIST.map((c) => (
          <label key={c} className="chk"><input type="checkbox" checked={picked.includes(c)} onChange={() => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} /> {countryName(c)}</label>
        ))}
      </div>
    </Dialog>
  );
}

/** 2) Alerts: the releases whose bells are set, each with a way to clear it. */
function EcoAlerts({ onClose }: { onClose: () => void }) {
  const keys = releaseAlerts.use((s) => s.keys);
  return (
    <Dialog title="Release Alerts" onClose={onClose} testId="eco-alerts" buttons={[{ label: 'Close', onClick: onClose, primary: true }]}>
      {keys.length ? (
        <table className="tbl">
          <tbody>
            {keys.map((k) => {
              const [c, ...n] = k.split('|');
              return (
                <tr key={k}>
                  <td className="amber">{c}</td>
                  <td>{n.join('|')}</td>
                  <td><button type="button" className="link-btn" onClick={() => toggleReleaseAlert(c, n.join('|'))}>Clear</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted">No release alert is set: the bell on an agenda row sets one.</p>
      )}
    </Dialog>
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

/**
 * ECMX, Economic Matrix: the key figures of every country the app reads, side by side (GEW opens it too). It was the
 * app's ECST until ECST took the terminal's one-country layout.
 */
export function ECMX(props: FnProps) {
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
        code="ECONMATRIX"
        title="Economic Matrix"
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
        code="ECONMATRIX"
        title="Economic Matrix"
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
