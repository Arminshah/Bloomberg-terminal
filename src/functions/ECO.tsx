import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, LivePx, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { fmtNum, fmtTime, WEEKDAYS, zonedParts } from '../core/format';
import { engine, useInterval } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { centralBanks, COUNTRY_NAMES, ecoEvents, newYorkDate, type EcoEvent } from '../data/eco';
import { periodChange } from '../data/analytics';
import type { FnProps } from '../terminal/types';
import { RealBadge, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';
import { COMPUTED_GROWTH, COUNTRY_STATS, figurePeriod, figureStatus, fredData, valueAt, type Calc, type Freq, type Obs } from '../data/live/fred';

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
  const countries = real ? REAL_COUNTRIES : COUNTRIES;
  const [ctry, setCtry] = useState<string[]>(countries);
  fredData.use((x) => x.loaded);
  const needsKey = fredData.use((x) => x.needsKey);
  const [minRel, setMinRel] = useState(1);
  const today = newYorkDate(now);
  const start = weekStart(now) + (week - 2) * 7 * DAY_MS;
  const all = useMemo(() => ecoEvents(start, start + 7 * DAY_MS, now), [start, Math.floor(now / 30_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = all.filter((e) => ctry.includes(e.country) && e.relevance >= minRel);
  const next = ecoEvents(now - DAY_MS, now + 14 * DAY_MS, now).find((e) => e.relevance >= 3 && (e.date ? e.date > today || (e.date === today && e.actual == null) : e.time > now));
  let lastDay = '';
  return (
    <div>
      <FnHeader
        code="ECO"
        title="Economic Calendar"
        sub={
          <>
            Times in your display time zone ·{' '}
            {real ? (
              <>
                <RealBadge /> US releases: scheduled dates and published values from the FRED API (it gives no times of day) · central bank decisions from the banks' own data · consensus forecasts are not public
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
              <span className="white b">{next.date === today ? 'today' : `on ${WEEKDAYS[new Date(`${next.date}T12:00:00Z`).getUTCDay()]} ${next.date.slice(5, 7)}/${next.date.slice(8, 10)}`}</span>
            ) : (
              <>
                in <span className="white b">{countdown(next.time - now)}</span>
              </>
            )}
          </span>
        )}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Time</th>
            <th>Ctry</th>
            <th>Event</th>
            <th>Period</th>
            {real ? null : <th className="num">Survey</th>}
            <th className="num" title={real ? 'The published value for the period, including any revisions since' : undefined}>
              Actual
            </th>
            <th className="num" title={real ? 'The previous period as currently published' : undefined}>
              Prior
            </th>
            {real ? null : <th className="num hide-m">Revised</th>}
            <th className="hide-m">Relevance</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={real ? 7 : 9} className="empty">
                {real && needsKey ? 'US releases need your free FRED API key: add it in PROV (fredaccount.stlouisfed.org issues one in a minute).' : real && !fredData.get().loaded ? 'Loading the release calendar from FRED…' : 'No events for the selected filters.'}
              </td>
            </tr>
          )}
          {events.map((e, i) => {
            // A date-only event belongs to its own date, whatever the display time zone.
            const p = e.date ? { y: Number(e.date.slice(0, 4)), mo: Number(e.date.slice(5, 7)), d: Number(e.date.slice(8, 10)) } : zonedParts(e.time);
            const dayKey = `${p.y}-${p.mo}-${p.d}`;
            const head = dayKey !== lastDay;
            lastDay = dayKey;
            const diff = e.actual != null && e.survey != null ? e.actual - e.survey : 0;
            const released = e.date ? e.actual != null || e.date < today : real ? e.time <= now : e.actual != null;
            const dueToday = !released && e.date === today;
            const soon = !e.date && !released && e.time - now < 3600_000 && e.time > now;
            return [
              head ? (
                <tr key={`h${i}`} className="group">
                  <td colSpan={real ? 7 : 9}>
                    {WEEKDAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]} {String(p.mo).padStart(2, '0')}/{String(p.d).padStart(2, '0')}/{String(p.y).slice(2)}
                  </td>
                </tr>
              ) : null,
              <tr key={e.id} style={!released && e.time < now + 7 * DAY_MS ? undefined : { opacity: 0.92 }}>
                <td className={soon ? 'yellow b' : 'muted'} title={e.date ? 'FRED gives the release date, not the time' : undefined}>
                  {e.date ? '--' : fmtTime(e.time, false)}
                </td>
                <td className="amber">{e.country}</td>
                <td className={e.relevance >= 3 ? 'white b' : ''}>
                  {e.name}
                  {e.real || !all.some((x) => x.real) ? null : <span className="muted"> DEMO</span>}
                </td>
                <td className="muted">{e.period}</td>
                {real ? null : <td className="num">{fmtVal(e, e.survey)}</td>}
                <td className={`num b ${diff > 0 ? 'up' : diff < 0 ? 'dn' : 'white'}`}>
                  {released ? (
                    e.actual != null ? (
                      fmtVal(e, e.actual)
                    ) : (
                      <span className="muted" title="Released; the value has not reached the source yet">
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
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Market lines for countries only the desktop app's ECST lists. */
const EXTRA_MARKETS: Record<string, { y10?: string; idx?: string; ccy?: string }> = {
  NL: { idx: 'AEX Index', ccy: 'EURUSD Curncy' },
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
function stat(key: [string, Freq, Calc?] | undefined, calc: Calc, series: Record<string, Obs>): { v: number; period: string } | null {
  if (!key) return null;
  const [id, freq] = key;
  calc = key[2] ?? calc;
  const obs = series[id];
  if (!obs?.length) return null;
  const p = obs[obs.length - 1][0];
  const v = valueAt(obs, p, calc, freq);
  const status = figureStatus(id, p);
  return v == null ? null : { v, period: `${figurePeriod(id, p, freq)}${status ? ` (${status})` : ''}` };
}

function StatCell({ s, dec = 1, mark }: { s: { v: number; period: string } | null; dec?: number; mark?: boolean }) {
  if (!s) return <span className="faint">--</span>;
  return (
    <span title={mark ? `${s.period}, worked out from OECD real GDP levels` : s.period}>
      {fmtNum(s.v, dec)}
      {mark ? '*' : ''} <span className="muted">{s.period}</span>
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
  const series = fredData.use((x) => x.series);
  const cbs = centralBanks();
  const policy = (c: string) => cbs.find((b) => b.country === (['DE', 'FR', 'IT', 'ES', 'NL'].includes(c) ? 'EZ' : c))?.rate;
  const market = (id?: string) => (id && engine.hasSource(id) ? id : undefined);
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
  return (
    <div>
      <FnHeader
        code="ECST"
        title="World Economic Statistics"
        sub={
          <>
            <RealBadge /> latest published figures with their periods: BEA and BLS (via FRED), Eurostat, the ONS and the OECD · policy rates from the central banks
          </>
        }
      />
      {!Object.keys(series).length ? <div className="empty">Loading statistics from FRED…</div> : null}
      <DataTable
        rows={rows}
        rowKey={(r) => r.c}
        columns={[
          { key: 'c', label: 'Country', render: (r) => <span className="amber">{COUNTRY_NAMES[r.c]}</span>, sort: (r) => COUNTRY_NAMES[r.c] },
          { key: 'g', label: 'Real GDP YoY %', num: true, render: (r) => <StatCell s={r.gdp} mark={COMPUTED_GROWTH.has(r.c)} />, sort: (r) => r.gdp?.v ?? NaN },
          { key: 'i', label: 'CPI YoY %', num: true, render: (r) => <StatCell s={r.cpi} />, sort: (r) => r.cpi?.v ?? NaN },
          { key: 'u', label: 'Unemp %', num: true, render: (r) => <StatCell s={r.un} />, sort: (r) => r.un?.v ?? NaN },
          { key: 'r', label: 'Policy %', num: true, render: (r) => (r.rate != null ? fmtNum(r.rate, 2) : '--'), sort: (r) => r.rate ?? NaN },
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
            { key: 'n', label: 'Next meeting', render: (b) => b.meetings.find((m) => Date.parse(`${m}T23:59:00Z`) > engine.now()) ?? 'n/a' },
          ]}
        />
      </Section>
      <div className="note">
        Growth is real GDP against the same quarter a year earlier and inflation the 12-month rate, as each statistics office publishes them: BEA and BLS for the US, Eurostat for the euro area and its members (HICP), the ONS for the UK. US inflation is worked out from the published CPI index the way the BLS does. UK unemployment is the ONS Labour Force Survey rate, an average over the three months shown. For Japan, Canada and Australia growth is worked out from OECD real GDP levels (marked *), unemployment is the OECD harmonised rate, and inflation has no current free series and is left out. FX YTD is the pair as quoted (e.g. USDJPY up = weaker yen).
      </div>
    </div>
  );
}

function ECSTSim(_: FnProps) {
  useInterval(2000);
  const cbs = centralBanks();
  const policy = (c: string) => cbs.find((b) => b.country === (['DE', 'FR', 'IT', 'ES', 'NL'].includes(c) ? 'EZ' : c))?.rate;
  const rows = Object.entries(STATS).map(([c, s]) => ({ c, ...s, rate: policy(c) }));
  return (
    <div>
      <FnHeader
        code="ECST"
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
