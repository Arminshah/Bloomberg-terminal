import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { XYChart } from '../components/chart/XYChart';
import { Chg, KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtDay, fmtInt, fmtNum, MONTHS, WEEKDAYS } from '../core/format';
import { engine, useTick } from '../data/market';
import { DAY_MS, addMonths, dayNum, isBusinessDay } from '../data/calendar';
import { centralBanks, COUNTRY_NAMES } from '../data/eco';
import { curveMembers } from '../data/curves';
import { rangeStats } from '../data/analytics';
import { resolveSecurity } from '../data/registry';
import { bootstrap, depoRate, fxForward, pipSize, swapRate } from '../data/rates';
import type { SecurityDef } from '../data/types';
import { blackScholes, type OptType } from '../finance/options';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

function pairFor(sec: SecurityDef | undefined, args: string | undefined): SecurityDef {
  if (sec?.fx && sec.cls === 'fx') return sec;
  const r = args ? resolveSecurity(args, 'Curncy') ?? resolveSecurity(args) : undefined;
  return r?.fx ? r : engine.get('EURUSD Curncy')!;
}

/** Spot date: T+2 business days (T+1 for USD-CAD). */
function spotDay(pair: SecurityDef, today = engine.today): number {
  const n = pair.fx!.base === 'CAD' || pair.fx!.quote === 'CAD' ? 1 : 2;
  let d = today;
  for (let k = 0; k < n; ) {
    d++;
    if (isBusinessDay(d)) k++;
  }
  return d;
}

function rollBiz(day: number): number {
  let d = day;
  while (!isBusinessDay(d)) d++;
  return d;
}

const TENORS: { label: string; days?: number; months?: number }[] = [
  { label: '1W', days: 7 }, { label: '2W', days: 14 }, { label: '1M', months: 1 }, { label: '2M', months: 2 }, { label: '3M', months: 3 },
  { label: '6M', months: 6 }, { label: '9M', months: 9 }, { label: '1Y', months: 12 }, { label: '18M', months: 18 }, { label: '2Y', months: 24 },
  { label: '3Y', months: 36 }, { label: '5Y', months: 60 },
];

function valueDay(spot: number, t: { days?: number; months?: number }): number {
  if (t.days) return rollBiz(spot + t.days);
  return rollBiz(dayNum(addMonths(new Date(spot * DAY_MS), t.months!).getTime()));
}

// ------------------------------------------------------------------- FRD

/** FRD: FX forward points and outrights by tenor. */
export function FRD({ sec, route }: FnProps) {
  useTick(2);
  const panel = usePanelId();
  const pair = pairFor(sec, route.args);
  const { base, quote } = pair.fx!;
  const q = engine.quote(pair.id)!;
  const spot = q.last;
  const pip = pipSize(spot);
  const sd = spotDay(pair);
  const halfSpread = (Number.isFinite(q.ask - q.bid) ? q.ask - q.bid : pip) / 2;
  const rows = TENORS.map((t) => {
    const vd = valueDay(sd, t);
    const days = vd - sd;
    const fwd = fxForward(spot, base, quote, days);
    const pts = (fwd - spot) / pip;
    const widen = 1 + days / 120;
    return { t, vd, days, fwd, pts, bid: pts - (halfSpread / pip) * widen * 0.5, ask: pts + (halfSpread / pip) * widen * 0.5, rb: depoRate(base, days / 365), rq: depoRate(quote, days / 365) };
  });
  const pairs = engine.securities.filter((d) => d.cls === 'fx' && d.fx).slice(0, 23);
  return (
    <div>
      <FnHeader code="FRD" title="Forward Rates" sec={pair} sub={`Spot ${fmtDay(sd * DAY_MS)} · points in ${pip === 1 ? 'units' : pip === 0.01 ? 'hundredths' : 'pips'} · covered interest parity`} />
      <div className="chart-tools">
        <span className="muted">Pair</span>
        <select className="inp" aria-label="Currency pair" value={pair.id} onChange={(e) => execute(panel, `${e.target.value} FRD`)}>
          {pairs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.ticker}
            </option>
          ))}
        </select>
        <span>
          <span className="lbl">Spot</span> <LivePx id={pair.id} />
        </span>
      </div>
      <div className="cols">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tenor</th>
              <th className="hide-m">Value date</th>
              <th className="num hide-m">Days</th>
              <th className="num">Bid pts</th>
              <th className="num">Ask pts</th>
              <th className="num">Outright</th>
              <th className="num hide-m">{base} depo</th>
              <th className="num hide-m">{quote} depo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="amber">SP</td>
              <td className="hide-m">{fmtDay(sd * DAY_MS)}</td>
              <td className="num hide-m">0</td>
              <td className="num">--</td>
              <td className="num">--</td>
              <td className="num white">{fmtNum(spot, pair.dec)}</td>
              <td className="num hide-m">--</td>
              <td className="num hide-m">--</td>
            </tr>
            {rows.map((r) => (
              <tr key={r.t.label}>
                <td className="amber">{r.t.label}</td>
                <td className="hide-m">{fmtDay(r.vd * DAY_MS)}</td>
                <td className="num hide-m">{r.days}</td>
                <td className="num">{fmtNum(r.bid, 2)}</td>
                <td className="num">{fmtNum(r.ask, 2)}</td>
                <td className="num white">{fmtNum(r.fwd, pair.dec + 1)}</td>
                <td className="num hide-m">{fmtNum(r.rb, 3)}</td>
                <td className="num hide-m">{fmtNum(r.rq, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Section title="Forward points curve">
          <XYChart
            series={[{ label: 'Mid points', color: '#ffb547', markers: true, points: rows.map((r) => ({ x: r.days, y: r.pts })) }]}
            height={260}
            xScale="sqrt"
            xTicks={rows.filter((_, i) => i % 2 === 0 || i === rows.length - 1).map((r) => ({ v: r.days, label: r.t.label }))}
            yFormat={(v) => fmtNum(v, 1)}
            refLines={[{ y: 0, color: '#444' }]}
          />
        </Section>
      </div>
      <p className="pad-s muted">Deposit rates are indicative: policy rates blended into government curves. Forward points are simulated from them, not dealer quotes.</p>
    </div>
  );
}

// ------------------------------------------------------------------ OVML

const EXPIRIES: [string, number][] = [['1W', 7], ['2W', 14], ['1M', 30], ['2M', 61], ['3M', 91], ['6M', 182], ['9M', 273], ['1Y', 365], ['2Y', 730]];

/** OVML: FX option valuation (Garman-Kohlhagen). */
export function OVML({ sec, route }: FnProps) {
  useTick(2);
  const panel = usePanelId();
  const pair = pairFor(sec, route.args);
  const { base, quote } = pair.fx!;
  const spot = engine.quote(pair.id)!.last;
  const [type, setType] = useState<OptType>('C');
  const [exp, setExp] = useState(4);
  const [strikeText, setStrikeText] = useState('');
  const [volText, setVolText] = useState('');
  const [notionalText, setNotionalText] = useState('1000000');
  const days = EXPIRIES[exp][1];
  const T = days / 365;
  const rd = depoRate(quote, T) / 100;
  const rf = depoRate(base, T) / 100;
  const fwd = spot * Math.exp((rd - rf) * T);
  const rs = rangeStats(pair.id);
  const defVol = Math.max(0.03, ((Number.isFinite(rs.vol90) ? rs.vol90 : pair.vol * 100) / 100) * 1.05 * (1 + 0.08 * Math.exp(-T * 4)));
  const K = strikeText.trim() ? Number(strikeText) : Number(fwd.toFixed(pair.dec));
  const vol = volText.trim() ? Number(volText) / 100 : defVol;
  const notional = Number(notionalText) || 0;
  const g = blackScholes(type, spot, K, T, rd, rf, vol);
  const pips = g.price / pipSize(spot);
  const premQuote = g.price * notional;
  const premPctBase = (g.price / spot) * 100;
  const be = type === 'C' ? K + g.price : K - g.price;
  const payoff = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let k = -40; k <= 40; k++) {
      const s = spot * (1 + (k / 40) * Math.max(0.03, vol * Math.sqrt(T) * 2.5));
      const intrinsic = type === 'C' ? Math.max(s - K, 0) : Math.max(K - s, 0);
      pts.push({ x: s, y: (intrinsic - g.price) * notional });
    }
    return pts;
  }, [spot, K, type, g.price, notional, vol, T]);
  const pairs = engine.securities.filter((d) => d.cls === 'fx' && d.fx);
  return (
    <div>
      <FnHeader code="OVML" title="FX Option Valuation" sec={pair} sub={`Vanilla European · Garman-Kohlhagen · notional in ${base}`} />
      <div className="chart-tools">
        <select className="inp" aria-label="Currency pair" value={pair.id} onChange={(e) => execute(panel, `${e.target.value} OVML`)}>
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
          <input className="inp" style={{ width: 84 }} placeholder={fwd.toFixed(pair.dec)} inputMode="decimal" value={strikeText} onChange={(e) => setStrikeText(e.target.value)} />
        </label>
        <label className="fld">
          Vol %
          <input className="inp" style={{ width: 56 }} placeholder={(defVol * 100).toFixed(2)} inputMode="decimal" value={volText} onChange={(e) => setVolText(e.target.value)} />
        </label>
        <label className="fld">
          Notional
          <input className="inp" style={{ width: 100 }} inputMode="decimal" value={notionalText} onChange={(e) => setNotionalText(e.target.value)} />
        </label>
      </div>
      <div className="cols">
        <Section title="Market data">
          <KV
            items={[
              ['Spot', <LivePx key="s" id={pair.id} />],
              ['Forward', fmtNum(fwd, pair.dec + 1)],
              ['Strike', `${fmtNum(K, pair.dec)}${strikeText.trim() ? '' : ' (ATMF)'}`],
              ['Expiry', `${EXPIRIES[exp][0]} · ${fmtDay((engine.today + days) * DAY_MS)}`],
              ['Volatility', `${fmtNum(vol * 100, 2)}%${volText.trim() ? '' : ' (realised + premium)'}`],
              [`${quote} rate`, `${fmtNum(rd * 100, 3)}%`],
              [`${base} rate`, `${fmtNum(rf * 100, 3)}%`],
            ]}
          />
        </Section>
        <Section title="Results">
          <KV
            items={[
              [`Premium (${quote} pips)`, fmtNum(pips, 1)],
              [`Premium (% ${base})`, `${fmtNum(premPctBase, 4)}%`],
              [`Premium (${quote})`, fmtNum(premQuote, 0)],
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
          series={[{ label: 'P&L', color: '#ffb547', points: payoff }]}
          height={220}
          xFormat={(v) => fmtNum(v, pair.dec)}
          yFormat={(v) => fmtNum(v, 0)}
          refLines={[{ y: 0, color: '#444' }, { x: spot, color: '#5aa7ff', label: 'Spot' }, { x: K, color: '#d77bff', label: 'Strike' }]}
        />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ SWPM

/** SWPM: USD SOFR interest rate swap valuation. */
export function SWPM(_: FnProps) {
  useTick(3);
  const [tenor, setTenor] = useState(5);
  const [notionalText, setNotionalText] = useState('10000000');
  const [fixedText, setFixedText] = useState('');
  const [payFixed, setPayFixed] = useState(true);
  const notional = Number(notionalText) || 0;
  const df = bootstrap(30);
  const annuity = df.slice(1, tenor + 1).reduce((a, b) => a + b, 0);
  const par = ((1 - df[tenor]) / annuity) * 100;
  const fixed = fixedText.trim() ? Number(fixedText) : par;
  // Value to the fixed payer: float leg minus fixed leg.
  const npvPayer = notional * ((par - fixed) / 100) * annuity;
  const npv = payFixed ? npvPayer : -npvPayer;
  const dv01 = notional * annuity * 0.0001 * (payFixed ? 1 : -1);
  const start = new Date(engine.today * DAY_MS);
  const flows = Array.from({ length: tenor }, (_, i) => {
    const k = i + 1;
    const fwd = (df[k - 1] / df[k] - 1) * 100;
    const fixedCf = (notional * fixed) / 100;
    const floatCf = (notional * fwd) / 100;
    const net = payFixed ? floatCf - fixedCf : fixedCf - floatCf;
    return { k, date: addMonths(start, 12 * k).getTime(), fwd, fixedCf, floatCf, df: df[k], pv: net * df[k] };
  });
  const curve = [1, 2, 3, 5, 7, 10, 15, 20, 30].map((t) => ({ x: t, y: swapRate(t) }));
  const fwdCurve = Array.from({ length: 30 }, (_, i) => ({ x: i + 1, y: (df[i] / df[i + 1] - 1) * 100 }));
  return (
    <div>
      <FnHeader code="SWPM" title="Swap Manager" sub="USD SOFR OIS · annual fixed vs compounded SOFR · curve bootstrapped from indicative par rates" />
      <div className="chart-tools">
        <label className="fld">
          Side
          <select className="inp" value={payFixed ? 'pay' : 'rec'} onChange={(e) => setPayFixed(e.target.value === 'pay')}>
            <option value="pay">Pay fixed</option>
            <option value="rec">Receive fixed</option>
          </select>
        </label>
        <label className="fld">
          Tenor
          <select className="inp" value={tenor} onChange={(e) => setTenor(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 7, 10, 12, 15, 20, 25, 30].map((t) => (
              <option key={t} value={t}>
                {t}Y
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          Notional USD
          <input className="inp" style={{ width: 110 }} inputMode="decimal" value={notionalText} onChange={(e) => setNotionalText(e.target.value)} />
        </label>
        <label className="fld">
          Fixed %
          <input className="inp" style={{ width: 70 }} placeholder={par.toFixed(4)} inputMode="decimal" value={fixedText} onChange={(e) => setFixedText(e.target.value)} />
        </label>
      </div>
      <div className="cols">
        <Section title="Valuation">
          <KV
            items={[
              ['Par swap rate', `${fmtNum(par, 4)}%`],
              ['Fixed rate', `${fmtNum(fixed, 4)}%`],
              ['Spread to par', `${fmtNum((fixed - par) * 100, 2)} bp`],
              ['NPV (USD)', <Chg key="n" v={npv} dec={0} />],
              ['DV01 (USD per bp)', fmtNum(dv01, 0)],
              ['Annuity (PV01 per unit)', fmtNum(annuity, 4)],
              ['Premium', `${fmtNum((npv / notional) * 100, 4)}% of notional`],
            ]}
          />
        </Section>
        <Section title="Par and 1Y forward curves">
          <XYChart
            series={[
              { label: 'Par swap', color: '#ffb547', markers: true, points: curve },
              { label: '1Y forward', color: '#5aa7ff', points: fwdCurve },
            ]}
            height={230}
            legend
            xScale="sqrt"
            xTicks={[1, 2, 5, 10, 20, 30].map((v) => ({ v, label: `${v}Y` }))}
            yFormat={(v) => fmtNum(v, 2)}
          />
        </Section>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Period</th>
            <th>Pay date</th>
            <th className="num">Fixed CF</th>
            <th className="num">Fwd SOFR %</th>
            <th className="num">Float CF</th>
            <th className="num hide-m">Discount</th>
            <th className="num">PV net</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f) => (
            <tr key={f.k}>
              <td className="amber">{f.k}</td>
              <td>{fmtDay(f.date)}</td>
              <td className="num">{fmtNum(payFixed ? -f.fixedCf : f.fixedCf, 0)}</td>
              <td className="num">{fmtNum(f.fwd, 4)}</td>
              <td className="num">{fmtNum(payFixed ? f.floatCf : -f.floatCf, 0)}</td>
              <td className="num hide-m">{fmtNum(f.df, 6)}</td>
              <td className="num white">{fmtNum(f.pv, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ CENB

/** CENB: central bank policy monitor. */
export function CENB(_: FnProps) {
  useTick(10);
  const panel = usePanelId();
  const now = engine.now();
  const banks = centralBanks();
  const twoYear = (country: string) => {
    const code = country === 'EZ' ? 'DE' : country;
    const m = curveMembers(code).find((d) => d.tenor === 2);
    return m ? m.id : undefined;
  };
  return (
    <div>
      <FnHeader code="CENB" title="Central Bank Monitor" sub="Policy rates, last move and next decision" actions={[{ n: 1, label: 'Rate path (WIRP)', onClick: () => execute(panel, 'WIRP') }, { n: 2, label: 'Central bank news', onClick: () => execute(panel, 'N CB') }]} />
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
                <td className="num white b">{fmtNum(b.rate, 2)}%</td>
                <td className="num">
                  <Chg v={b.lastMove * 100} dec={0} /> bp
                </td>
                <td className="hide-m">{fmtDay(Date.parse(`${b.last}T00:00:00Z`))}</td>
                <td>{next ? fmtDay(Date.parse(`${next}T00:00:00Z`)) : <span className="muted">Monthly fixing</span>}</td>
                <td className="num">{Number.isFinite(days) ? days : '--'}</td>
                <td className="num hide-m">{y2 ? <SecLink id={y2}>{fmtNum(yv, 3)}</SecLink> : '--'}</td>
                <td className="num hide-m">{Number.isFinite(yv) ? <Chg v={(yv - b.rate) * 100} dec={0} /> : '--'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pad-s muted">The Fed range is derived from the 3-month bill; other policy rates and dates are the terminal's reference settings. A 2-year yield below the policy rate means the market expects cuts.</p>
    </div>
  );
}

// ------------------------------------------------------------------- CDR

interface Holiday {
  date: string;
  name: string;
  early?: boolean;
}

const CALENDARS: { code: string; name: string; tz: string; hours: string; holidays: Holiday[] }[] = [
  {
    code: 'US',
    name: 'New York Stock Exchange',
    tz: 'America/New_York',
    hours: '09:30-16:00',
    holidays: [
      { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-01-19', name: 'Martin Luther King Jr. Day' }, { date: '2026-02-16', name: "Washington's Birthday" },
      { date: '2026-04-03', name: 'Good Friday' }, { date: '2026-05-25', name: 'Memorial Day' }, { date: '2026-06-19', name: 'Juneteenth' },
      { date: '2026-07-03', name: 'Independence Day (observed)' }, { date: '2026-09-07', name: 'Labor Day' }, { date: '2026-11-26', name: 'Thanksgiving Day' },
      { date: '2026-11-27', name: 'Day after Thanksgiving (13:00 close)', early: true }, { date: '2026-12-24', name: 'Christmas Eve (13:00 close)', early: true },
      { date: '2026-12-25', name: 'Christmas Day' },
      { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-01-18', name: 'Martin Luther King Jr. Day' }, { date: '2027-02-15', name: "Washington's Birthday" },
      { date: '2027-03-26', name: 'Good Friday' }, { date: '2027-05-31', name: 'Memorial Day' }, { date: '2027-06-18', name: 'Juneteenth (observed)' },
      { date: '2027-07-05', name: 'Independence Day (observed)' }, { date: '2027-09-06', name: 'Labor Day' }, { date: '2027-11-25', name: 'Thanksgiving Day' },
      { date: '2027-11-26', name: 'Day after Thanksgiving (13:00 close)', early: true }, { date: '2027-12-24', name: 'Christmas Day (observed)' },
    ],
  },
  {
    code: 'GB',
    name: 'London Stock Exchange',
    tz: 'Europe/London',
    hours: '08:00-16:30',
    holidays: [
      { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-04-03', name: 'Good Friday' }, { date: '2026-04-06', name: 'Easter Monday' },
      { date: '2026-05-04', name: 'Early May Bank Holiday' }, { date: '2026-05-25', name: 'Spring Bank Holiday' }, { date: '2026-08-31', name: 'Summer Bank Holiday' },
      { date: '2026-12-24', name: 'Christmas Eve (12:30 close)', early: true }, { date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-12-28', name: 'Boxing Day (substitute)' },
      { date: '2026-12-31', name: "New Year's Eve (12:30 close)", early: true },
      { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-03-26', name: 'Good Friday' }, { date: '2027-03-29', name: 'Easter Monday' },
      { date: '2027-05-03', name: 'Early May Bank Holiday' }, { date: '2027-05-31', name: 'Spring Bank Holiday' }, { date: '2027-08-30', name: 'Summer Bank Holiday' },
      { date: '2027-12-24', name: 'Christmas Eve (12:30 close)', early: true }, { date: '2027-12-27', name: 'Christmas Day (substitute)' }, { date: '2027-12-28', name: 'Boxing Day (substitute)' },
      { date: '2027-12-31', name: "New Year's Eve (12:30 close)", early: true },
    ],
  },
  {
    code: 'DE',
    name: 'Xetra (Deutsche Boerse)',
    tz: 'Europe/Berlin',
    hours: '09:00-17:30',
    holidays: [
      { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-04-03', name: 'Good Friday' }, { date: '2026-04-06', name: 'Easter Monday' },
      { date: '2026-05-01', name: 'Labour Day' }, { date: '2026-12-24', name: 'Christmas Eve' }, { date: '2026-12-25', name: 'Christmas Day' },
      { date: '2026-12-31', name: "New Year's Eve" },
      { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-03-26', name: 'Good Friday' }, { date: '2027-03-29', name: 'Easter Monday' },
      { date: '2027-12-24', name: 'Christmas Eve' }, { date: '2027-12-31', name: "New Year's Eve" },
    ],
  },
  {
    code: 'JP',
    name: 'Japan Exchange Group (Tokyo)',
    tz: 'Asia/Tokyo',
    hours: '09:00-15:30',
    holidays: [
      { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-01-02', name: 'Market holiday' }, { date: '2026-01-12', name: 'Coming of Age Day' },
      { date: '2026-02-11', name: 'National Foundation Day' }, { date: '2026-02-23', name: "Emperor's Birthday" }, { date: '2026-03-20', name: 'Vernal Equinox Day' },
      { date: '2026-04-29', name: 'Showa Day' }, { date: '2026-05-04', name: 'Greenery Day' }, { date: '2026-05-05', name: "Children's Day" },
      { date: '2026-05-06', name: 'Constitution Day (substitute)' }, { date: '2026-07-20', name: 'Marine Day' }, { date: '2026-08-11', name: 'Mountain Day' },
      { date: '2026-09-21', name: 'Respect for the Aged Day' }, { date: '2026-09-22', name: 'National Holiday' }, { date: '2026-09-23', name: 'Autumnal Equinox Day' },
      { date: '2026-10-12', name: 'Sports Day' }, { date: '2026-11-03', name: 'Culture Day' }, { date: '2026-11-23', name: 'Labour Thanksgiving Day' },
      { date: '2026-12-31', name: 'Market holiday' },
      { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-01-11', name: 'Coming of Age Day' }, { date: '2027-02-11', name: 'National Foundation Day' },
      { date: '2027-02-23', name: "Emperor's Birthday" }, { date: '2027-03-22', name: 'Vernal Equinox Day (substitute)' }, { date: '2027-04-29', name: 'Showa Day' },
      { date: '2027-05-03', name: 'Constitution Day' }, { date: '2027-05-04', name: 'Greenery Day' }, { date: '2027-05-05', name: "Children's Day" },
      { date: '2027-07-19', name: 'Marine Day' }, { date: '2027-08-11', name: 'Mountain Day' }, { date: '2027-09-20', name: 'Respect for the Aged Day' },
      { date: '2027-09-23', name: 'Autumnal Equinox Day' }, { date: '2027-10-11', name: 'Sports Day' }, { date: '2027-11-03', name: 'Culture Day' },
      { date: '2027-11-23', name: 'Labour Thanksgiving Day' }, { date: '2027-12-31', name: 'Market holiday' },
    ],
  },
];

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

/** CDR: exchange holiday calendars. */
export function CDR({ route }: FnProps) {
  const initial = Math.max(0, CALENDARS.findIndex((c) => c.code === route.args?.toUpperCase())) + 1;
  const [tab, setTab] = useState(initial);
  const cal = CALENDARS[tab - 1];
  const holidays = new Map(cal.holidays.map((h) => [h.date, h]));
  const todayIso = new Date(engine.today * DAY_MS).toISOString().slice(0, 10);
  const closedToday = !isBusinessDay(engine.today) || (holidays.has(todayIso) && !holidays.get(todayIso)!.early);
  let next = engine.today + 1;
  const iso = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10);
  while (!isBusinessDay(next) || (holidays.has(iso(next)) && !holidays.get(iso(next))!.early)) next++;
  const d0 = new Date(engine.today * DAY_MS);
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = d0.getUTCMonth() + i;
    return { year: d0.getUTCFullYear() + Math.floor(m / 12), month0: m % 12 };
  });
  const upcoming = cal.holidays.filter((h) => h.date >= todayIso).slice(0, 12);
  return (
    <div>
      <FnHeader code="CDR" title="Holiday Calendar" sub={`${cal.name} · ${cal.hours} local (${cal.tz})`} tabs={CALENDARS.map((c, i) => ({ n: i + 1, label: c.code }))} tab={tab} onTab={setTab} />
      <div className="cols">
        <Section title="Status">
          <KV
            items={[
              ['Exchange', cal.name],
              ['Today', closedToday ? <span key="c" className="dn">Closed</span> : holidays.get(todayIso)?.early ? <span key="e" className="amber">Early close</span> : <span key="o" className="up">Trading day</span>],
              ['Next trading day', fmtDay(next * DAY_MS, true)],
              ['Regular hours', `${cal.hours} ${cal.tz}`],
            ]}
          />
        </Section>
        <Section title="Upcoming holidays">
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
        </Section>
      </div>
      <div className="cdr-months">
        {months.map((m) => (
          <MonthGrid key={`${m.year}-${m.month0}`} year={m.year} month0={m.month0} holidays={holidays} today={todayIso} />
        ))}
      </div>
      <p className="pad-s muted">Red: exchange closed. Amber: early close. Grey: weekend.</p>
    </div>
  );
}
