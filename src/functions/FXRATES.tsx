import { Credits } from '../components/Credits';
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect, CalcSource } from '../components/CalcInputs';
import { XYChart } from '../components/chart/XYChart';
import { Chg, KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtDay, fmtInt, fmtNum, MONTHS, WEEKDAYS, zonedParts } from '../core/format';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { EXCHANGES, fmtCountdown, localDate, marketDay, sessionAt, type Exchange } from '../data/exchanges';
import { centralBanks, COUNTRY_NAMES, newYorkDate } from '../data/eco';
import { curveMembers } from '../data/curves';
import { rangeStats } from '../data/analytics';
import { resolveSecurity } from '../data/registry';
import { depoRate, policyRate } from '../data/rates';
import { levelOn, policyRates } from '../data/live/policy';
import type { SecurityDef } from '../data/types';
import { blackScholes, type OptType } from '../finance/options';
import { inputNumber } from '../finance/contracts';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

function pairFor(sec: SecurityDef | undefined, args: string | undefined): SecurityDef {
  if (sec?.fx && sec.cls === 'fx') return sec;
  const r = args ? resolveSecurity(args, 'Curncy') ?? resolveSecurity(args) : undefined;
  return r?.fx ? r : engine.get('EURUSD Curncy')!;
}

export { ForwardCalc as FRD } from './ForwardCalc';

// ------------------------------------------------------------------ OVML

const EXPIRIES: [string, number][] = [['1W', 7], ['2W', 14], ['1M', 30], ['2M', 61], ['3M', 91], ['6M', 182], ['9M', 273], ['1Y', 365], ['2Y', 730]];

/** The published rate the desktop app holds flat for each currency (rates.ts, policy.ts). */
const RATE_NAME: Record<string, string> = {
  USD: 'effective fed funds, NY Fed',
  EUR: 'ECB deposit facility',
  GBP: 'Bank Rate, BoE',
  CAD: 'BoC target',
  AUD: 'RBA cash rate target',
  CHF: 'SNB policy rate',
  BRL: 'Selic target, BCB',
};

/** OVML: FX option valuation (Garman-Kohlhagen). */
export function OVML({ sec, route }: FnProps) {
  useTick(2);
  const panel = usePanelId();
  const pair = pairFor(sec, route.args);
  const { base, quote } = pair.fx!;
  const sourceSpot = engine.quote(pair.id)!.last;
  const [spotText, setSpotText] = useState('');
  const spot = spotText.trim() ? inputNumber(spotText) : sourceSpot;
  const [type, setType] = useState<OptType>('C');
  const [exp, setExp] = useState(4);
  const [strikeText, setStrikeText] = useState('');
  const [volText, setVolText] = useState('');
  const [notionalText, setNotionalText] = useState('1000000');
  const [quoteRate, setQuoteRate] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [pointText, setPointText] = useState(quote === 'JPY' ? '0.01' : '0.0001');
  const days = EXPIRIES[exp][1];
  const T = days / 365;
  // On real data the rates are the central banks' published rates held flat (effective fed funds
  // for USD) and the default vol is 90-day realised: no modelled curve or vol premium.
  const real = engine.realOnly;
  const flatRate = (ccy: string) => (ccy === 'USD' ? (policyRates.get().effr?.last ?? NaN) : policyRate(ccy));
  const rd = (quoteRate.trim() ? inputNumber(quoteRate) : real ? flatRate(quote) : depoRate(quote, T)) / 100;
  const rf = (baseRate.trim() ? inputNumber(baseRate) : real ? flatRate(base) : depoRate(base, T)) / 100;
  const fwd = spot * Math.exp((rd - rf) * T);
  const rs = rangeStats(pair.id);
  const defVol = real ? rs.vol90 / 100 : Math.max(0.03, ((Number.isFinite(rs.vol90) ? rs.vol90 : pair.vol * 100) / 100) * 1.05 * (1 + 0.08 * Math.exp(-T * 4)));
  const K = strikeText.trim() ? Number(strikeText) : Number(fwd.toFixed(pair.dec));
  const vol = volText.trim() ? Number(volText) / 100 : defVol;
  const notional = inputNumber(notionalText);
  const point = inputNumber(pointText);
  const g = blackScholes(type, spot, K, T, rd, rf, vol);
  const pips = g.price / point;
  const premQuote = g.price * notional;
  const premPctBase = (g.price / spot) * 100;
  const be = type === 'C' ? K + g.price : K - g.price;
  const payoff = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let k = -40; k <= 40; k++) {
      const s = spot * Math.exp((k / 40) * Math.max(0.03, vol * Math.sqrt(T) * 2.5));
      const intrinsic = type === 'C' ? Math.max(s - K, 0) : Math.max(K - s, 0);
      pts.push({ x: s, y: (intrinsic - g.price) * notional });
    }
    return pts;
  }, [spot, K, type, g.price, notional, vol, T]);
  const pairs = engine.securities.filter((d) => d.cls === 'fx' && d.fx);
  const noRate = [quote, base].filter((_, i) => !Number.isFinite(i === 0 ? rd : rf));
  const error = !Number.isFinite(spot) || spot <= 0 ? 'Enter a positive spot or wait for a source price.'
    : !Number.isFinite(K) || K <= 0 ? 'Enter a positive strike.'
    : !Number.isFinite(vol) || vol < 0 ? 'Enter a nonnegative volatility or wait for realised volatility.'
    : !Number.isFinite(rd) || !Number.isFinite(rf) ? 'Enter finite rates for both currencies.'
    : !Number.isFinite(notional) || notional <= 0 ? 'Enter a positive base-currency notional.'
    : ![g.price, premQuote, pips, premPctBase, be].every(Number.isFinite) ? 'These inputs exceed the calculator’s numerical range.' : '';
  return (
    <div>
      <FnHeader code="FXOPTION" title="FX Option Valuation" sec={pair} sub={`Vanilla European · Garman-Kohlhagen theoretical value · notional in ${base}`} />
      <CalcSource>Source spot and reference inputs or your overrides. Flat continuous rates and volatility; calculated European option value, without dealer quotes.</CalcSource>
      {real && noRate.length > 0 && (
        <div className="note amber">
          No usable rate for {noRate.join(' or ')}. Enter continuous rate overrides to calculate the forward and option.
        </div>
      )}
      <div className="chart-tools">
        <CalcInput label="Spot override" value={spotText} onChange={setSpotText} placeholder={fmtNum(sourceSpot, pair.dec)} />
        <CalcInput label={`${base} rate override %`} value={baseRate} onChange={setBaseRate} placeholder="Source" />
        <CalcInput label={`${quote} rate override %`} value={quoteRate} onChange={setQuoteRate} placeholder="Source" />
        <CalcSelect label="Point size" value={pointText} onChange={setPointText}>{['0.0001', '0.01', '1'].map((p) => <option key={p}>{p}</option>)}</CalcSelect>
        <select className="inp" aria-label="Currency pair" value={pair.id} onChange={(e) => execute(panel, `${e.target.value} FXOPTION`)}>
          {pairs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.ticker}
            </option>
          ))}
        </select>
        <select className="inp" aria-label="Call or put" value={type} onChange={(e) => setType(e.target.value as OptType)}>
          <option value="C">{base} Call / {quote} Put</option>
          <option value="P">{base} Put / {quote} Call</option>
        </select>
        <select className="inp" aria-label="Expiry" value={exp} onChange={(e) => setExp(Number(e.target.value))}>
          {EXPIRIES.map(([l], i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
        <label className="fld">
          Strike
          <input className="inp" aria-label="Strike" style={{ width: 84 }} placeholder={Number.isFinite(fwd) ? fwd.toFixed(pair.dec) : ''} inputMode="decimal" value={strikeText} onChange={(e) => setStrikeText(e.target.value)} />
        </label>
        <label className="fld">
          Vol %
          <input className="inp" aria-label="Volatility override" style={{ width: 56 }} placeholder={Number.isFinite(defVol) ? (defVol * 100).toFixed(2) : ''} inputMode="decimal" value={volText} onChange={(e) => setVolText(e.target.value)} />
        </label>
        <label className="fld">
          Notional
          <input className="inp" aria-label="Notional" style={{ width: 100 }} inputMode="decimal" value={notionalText} onChange={(e) => setNotionalText(e.target.value)} />
        </label>
      </div>
      {error ? <div className="pad amber" role="status">{error}</div> : <><div className="cols">
        <Section title="Market data">
          <KV
            items={[
              ['Source spot', <LivePx key="s" id={pair.id} />],
              ['Spot used', `${fmtNum(spot, pair.dec)}${spotText.trim() ? ' (your input)' : ''}`],
              ['Forward', fmtNum(fwd, pair.dec + 1)],
              ['Strike', `${fmtNum(K, pair.dec)}${strikeText.trim() ? '' : ' (rounded forward)'}`],
              ['Expiry', `${EXPIRIES[exp][0]} · ${fmtDay((engine.today + days) * DAY_MS)}`],
              ['Volatility', `${fmtNum(vol * 100, 2)}%${volText.trim() ? '' : real ? ' (90D realised)' : ' (realised + premium)'}`],
              [`${quote} rate${quoteRate.trim() ? ' (your input)' : real ? ` (${RATE_NAME[quote] ?? 'none published'}, flat)` : ''}`, `${fmtNum(rd * 100, 3)}%`],
              [`${base} rate${baseRate.trim() ? ' (your input)' : real ? ` (${RATE_NAME[base] ?? 'none published'}, flat)` : ''}`, `${fmtNum(rf * 100, 3)}%`],
            ]}
          />
        </Section>
        <Section title="Results">
          <KV
            items={[
              [`Premium (${quote} points, unit ${pointText})`, fmtNum(pips, 1)],
              [`Premium (% ${base})`, `${fmtNum(premPctBase, 4)}%`],
              [`Premium (${quote})`, <span key="p" data-testid="fx-option-value">{fmtNum(premQuote, 2)}</span>],
              ['Delta (spot)', `${fmtNum(g.delta * 100, 2)}%`],
              [`Delta hedge (${base})`, fmtInt(-g.delta * notional)],
              ['Gamma (per 1% spot)', `${fmtNum(g.gamma * spot * 0.01 * 100, 3)}%`],
              [`Vega (${quote} per vol)`, fmtNum(g.vega * notional, 0)],
              [`Theta (${quote} per day)`, fmtNum(g.theta * notional, 0)],
              ['Breakeven at expiry', fmtNum(be, pair.dec)],
            ]}
          />
        </Section>
      </div>
      <Section title={`P&L at expiry (${quote})`}>
        <XYChart
          series={[{ label: 'P&L', color: '#ffb547', points: payoff.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) }]}
          height={220}
          xFormat={(v) => fmtNum(v, pair.dec)}
          yFormat={(v) => fmtNum(v, 0)}
          refLines={[{ y: 0, color: '#444' }, { x: spot, color: '#5aa7ff', label: 'Spot' }, { x: K, color: '#d77bff', label: 'Strike' }]}
        />
      </Section>
      </>}
      {real && (
        <div className="note">
          Expiry uses calendar days without FX settlement adjustments. Source policy rates are used as flat continuous model approximations; enter appropriate continuous term rates. Volatility defaults to realised, not implied. Confirm point size and other contract inputs. The expiry P&L deducts the upfront premium without financing.
        </div>
      )}
    </div>
  );
}

export { SwapCalc as SWPM } from './SwapCalc';

// ------------------------------------------------------------------ CENB

/** CENB: central bank policy monitor. */
export function CENB(_: FnProps) {
  useTick(10);
  const panel = usePanelId();
  const now = engine.now();
  const banks = centralBanks();
  const fedLower = policyRates.get().fedLower;
  const fedLow = fedLower ? levelOn(fedLower, newYorkDate(now)) : NaN;
  const twoYear = (country: string) => {
    const code = country === 'EZ' ? 'DE' : country;
    const m = curveMembers(code).find((d) => d.tenor === 2);
    return m && engine.hasSource(m.id) ? m.id : undefined;
  };
  return (
    <div>
      <FnHeader code="CENTRALBANKS" title="Central Bank Monitor" sub="Policy rates, last move and next decision" actions={[{ n: 1, label: 'Rate path (RATEPROBS)', onClick: () => execute(panel, 'RATEPROBS') }, { n: 2, label: 'Central bank news', onClick: () => execute(panel, 'NEWS CB') }]} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Bank</th>
            <th className="hide-m">Country</th>
            <th className="num">Policy rate</th>
            <th className="num">Last move</th>
            <th className="hide-m">Last change</th>
            <th>Next decision</th>
            <th className="num">Days</th>
            <th className="num hide-m">2Y yield</th>
            <th className="num hide-m">2Y - policy</th>
          </tr>
        </thead>
        <tbody>
          {banks.map((b) => {
            const next = b.meetings.find((m) => Date.parse(`${m}T23:59:00Z`) > now);
            const days = next ? Math.ceil((Date.parse(`${next}T00:00:00Z`) - engine.today * DAY_MS) / DAY_MS) : NaN;
            const y2 = twoYear(b.country);
            const yv = y2 ? engine.quote(y2)!.last : NaN;
            return (
              <tr key={b.code}>
                <td>
                  <span className="amber b">{b.code}</span> <span className="hide-m">{b.bank}</span>
                </td>
                <td className="hide-m">{COUNTRY_NAMES[b.country] ?? b.country}</td>
                <td className="num white b">
                  {/* The Fed sets a target range; the rate used elsewhere in this row is its upper limit. */}
                  {b.code === 'FED' && Number.isFinite(fedLow) ? `${fmtNum(fedLow, 2)}-${fmtNum(b.rate, 2)}` : fmtNum(b.rate, 2)}%{b.real ? null : <span className="muted" title="Reference setting, not a live source"> SIM</span>}
                </td>
                <td className="num">
                  <Chg v={b.lastMove * 100} dec={0} /> bp
                </td>
                <td className="hide-m">{fmtDay(Date.parse(`${b.last}T00:00:00Z`))}</td>
                <td>{next ? fmtDay(Date.parse(`${next}T00:00:00Z`)) : <span className="muted">{b.code === 'PBOC' ? 'Monthly fixing' : 'Not yet in the app'}</span>}</td>
                <td className="num">{Number.isFinite(days) ? days : '--'}</td>
                <td className="num hide-m">
                  {y2 ? (
                    <SecLink id={y2}>
                      <LivePx id={y2} dec={3} />
                    </SecLink>
                  ) : (
                    '--'
                  )}
                </td>
                <td className="num hide-m">{Number.isFinite(yv) ? <Chg v={(yv - b.rate) * 100} dec={0} /> : '--'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pad-s muted">
        {engine.realOnly
          ? 'Policy rates and their last moves come from the central banks’ own data, as in force: a decided change shows once it takes effect. The Fed’s meeting dates come from the Board’s calendar page; the other banks’ are their published calendars, entered in the app. Banks without a free daily source are not listed. 2-year yields are end of day: the US Treasury par yield, and for the euro area the Bundesbank’s zero-coupon yield.'
          : banks.some((b) => b.real)
          ? 'Rates without SIM, and their last moves, come from the central banks’ own data. Rates marked SIM are reference settings with no free daily source and may be out of date.'
          : 'Policy rates are reference settings (the Fed range is derived from the 3-month bill) and may be out of date; the desktop app loads the Fed, ECB, Bank of England and Bank of Canada rates from the banks themselves.'}{' '}
        The Fed's 2-year spread is to the upper limit of its target range. A 2-year yield below the policy rate means the market expects cuts.
      </p>
      <Credits ids={['fedboard', 'nyfed', 'treasury', 'ecb', 'bundesbank', 'boe', 'boc', 'rba', 'snb', 'bcb']} />
    </div>
  );
}

// ------------------------------------------------------------------- CDR

interface Holiday {
  date: string;
  name: string;
  early?: boolean;
}

/** An exchange's holidays and early closes for a year and the next. */
const holidaysOf = (ex: Exchange, year: number): Holiday[] =>
  [...ex.days(year), ...ex.days(year + 1)].map((d) => ({ date: d.date, name: d.name, ...(d.close ? { early: true } : {}) }));

const hhmmIn = (ms: number, tz: string) => {
  const p = zonedParts(ms, tz);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
};

function MonthGrid({ year, month0, holidays, today }: { year: number; month0: number; holidays: Map<string, Holiday>; today: string }) {
  const first = new Date(Date.UTC(year, month0, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="cdr-month">
      <div className="cdr-title">
        {MONTHS[month0]} {year}
      </div>
      <div className="cdr-grid">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <span key={w} className="cdr-wd">
            {WEEKDAYS[w].slice(0, 2)}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />;
          const iso = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const h = holidays.get(iso);
          const weekend = i % 7 >= 5;
          const cls = h ? (h.early ? 'early' : 'hol') : weekend ? 'wkend' : '';
          return (
            <span key={i} className={`cdr-day ${cls}${iso === today ? ' today' : ''}`} title={h?.name}>
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** CDR: exchange holiday calendars, each judged by the exchange's own date and time. */
export function CDR({ route }: FnProps) {
  useTick(5);
  const now = Date.now();
  const initial = Math.max(0, EXCHANGES.findIndex((x) => x.id === route.args?.trim().toUpperCase())) + 1;
  const [tab, setTab] = useState(initial);
  const ex = EXCHANGES[tab - 1];
  const todayIso = localDate(ex, now);
  const year = Number(todayIso.slice(0, 4));
  const list = useMemo(() => holidaysOf(ex, year), [ex, year]);
  const holidays = new Map(list.map((h) => [h.date, h]));
  const today = marketDay(ex, todayIso);
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const s = sessionAt(ex, now);
  // The next session that starts after today, by the exchange's calendar.
  const nextIso = (() => {
    for (let k = 1; k < 21; k++) {
      const d = new Date(Date.parse(`${todayIso}T00:00:00Z`) + k * DAY_MS);
      const iso = d.toISOString().slice(0, 10);
      const wd = d.getUTCDay();
      const h = marketDay(ex, iso);
      if (wd !== 0 && wd !== 6 && !(h && !h.close)) return iso;
    }
    return undefined;
  })();
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = Number(todayIso.slice(5, 7)) - 1 + i;
    return { year: year + Math.floor(m / 12), month0: m % 12 };
  });
  const upcoming = list.filter((h) => h.date >= todayIso).slice(0, 12);
  const pastTable = ex.through !== undefined && months.some((m) => m.year > ex.through!);
  const todayText =
    weekday === 0 || weekday === 6 ? (
      <span className="muted">Weekend</span>
    ) : today && !today.close ? (
      <span className="dn">Closed: {today.name}</span>
    ) : today?.close ? (
      <span className="amber">Early close at {today.close}</span>
    ) : (
      <span className="up">Trading day</span>
    );
  const nowText = !Number.isFinite(s.at) ? (
    '--'
  ) : s.open ? (
    <span className="up">
      Open, closes {hhmmIn(s.at, ex.tz)} (in {fmtCountdown(s.at - now)})
    </span>
  ) : (
    <span>
      Closed, opens {fmtDay(Date.parse(`${localDate(ex, s.at)}T00:00:00Z`))} {hhmmIn(s.at, ex.tz)} (in {fmtCountdown(s.at - now)})
    </span>
  );
  return (
    <div>
      <FnHeader code="HOLIDAYS" title="Holiday Calendar" sub={`${ex.name} · ${ex.open}-${ex.close} local (${ex.tz})`} tabs={EXCHANGES.map((x, i) => ({ n: i + 1, label: x.id }))} tab={tab} onTab={setTab} />
      <div className="cols">
        <Section title="Status">
          <KV
            items={[
              ['Exchange', ex.name],
              [`Today (${fmtDay(Date.parse(`${todayIso}T00:00:00Z`))} local)`, todayText],
              ['Now', nowText],
              ['Next trading day', nextIso ? fmtDay(Date.parse(`${nextIso}T00:00:00Z`), true) : '--'],
              ['Regular hours', `${ex.open}-${ex.close} ${ex.tz}`],
            ]}
          />
        </Section>
        <Section title="Upcoming holidays">
          {upcoming.length ? (
            <table className="tbl">
              <tbody>
                {upcoming.map((h) => (
                  <tr key={h.date}>
                    <td className={h.early ? 'amber' : 'dn'}>{fmtDay(Date.parse(`${h.date}T00:00:00Z`), true)}</td>
                    <td>{WEEKDAYS[new Date(`${h.date}T00:00:00Z`).getUTCDay()]}</td>
                    <td className="white">{h.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No holidays known to the app after {ex.through}.</div>
          )}
        </Section>
      </div>
      <div className="cdr-months">
        {months.map((m) => (
          <MonthGrid key={`${m.year}-${m.month0}`} year={m.year} month0={m.month0} holidays={holidays} today={todayIso} />
        ))}
      </div>
      <p className="pad-s muted">
        Red: exchange closed. Amber: early close. Grey: weekend. {ex.source}.{pastTable ? ` The table ends with ${ex.through}: later holidays are not shown.` : ''} Closures nobody can schedule ahead, such as a day of mourning or an outage, are not known to the app.
      </p>
    </div>
  );
}
