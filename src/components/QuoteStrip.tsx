import { engine, useQuote } from '../data/market';
import { freshnessOf, sessionLabel } from '../data/freshness';
import type { Quote, SecurityDef } from '../data/types';
import { QuoteFreshness } from './Freshness';
import { fmtDay, fmtNum, fmtPct, fmtStamp, fmtTime, signClass } from '../core/format';
import { Flash } from './Flash';
import { DayChg } from './cells';
import { Sparkline } from './Sparkline';

/** The source time in the exchange's own zone, when the source names it and it differs from the display zone. */
function exchangeTime(q: Quote): string {
  if (!q.tz || !Number.isFinite(q.time) || q.src === 'CLOSE' || q.src === 'STALE') return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: q.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date(q.time));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const there = `${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
    return fmtTime(q.time, false) === `${get('hour')}:${get('minute')}` ? '' : ` (${there} at the exchange)`;
  } catch {
    return '';
  }
}

const SESSION: Record<string, string> = { pre: 'Pre-mkt', post: 'After hrs', overnight: 'Overnight' };

/** The quote's currency as the strip shows it: "$", "€", "£"; a code where there is no symbol; "%" for a rate. */
export function currencyMark(sec: SecurityDef): string {
  if (sec.minor) return sec.ccy;
  if (sec.cls === 'rate' || sec.quote === 'yield') return '%';
  try {
    const part = new Intl.NumberFormat('en-US', { style: 'currency', currency: sec.ccy, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? sec.ccy;
  } catch {
    return sec.ccy;
  }
}

/**
 * The quote strip's first line, which shares its row with the command line (TE01 03:11, TE04 04:55): the ticker in
 * white, the currency in grey, an arrow for the last tick, the last price and the day's change coloured by its sign,
 * today's line, then the bid and ask.
 */
export function QuoteLine1({ sec }: { sec: SecurityDef }) {
  const q = useQuote(sec.id);
  if (!q) return null;
  const y = sec.quote === 'yield';
  // A line with no source has no price, change or range to show: its name and the NO DATA mark only.
  if (q.src === 'NONE' && !Number.isFinite(q.last)) {
    return (
      <div className="qstrip qline-1">
        <span className="qs-ticker">{sec.ticker}</span>
        <span className="qs-ccy">{currencyMark(sec)}</span>
      </div>
    );
  }
  const intra = engine.intraday(sec.id);
  const today = intra ? Array.from(intra.c.subarray(0, intra.length)) : [];
  return (
    <div className="qstrip qline-1">
      <span className="qs-ticker">{sec.ticker}</span>
      <span className="qs-ccy">{currencyMark(sec)}</span>
      <span className={`qs-tick ${q.tick > 0 ? 'up' : q.tick < 0 ? 'dn' : ''}`} aria-hidden="true">{q.tick > 0 ? '↑' : q.tick < 0 ? '↓' : ''}</span>
      <Flash value={q.last} className={`px ${Number.isFinite(q.chg) && q.chgCheck !== 'unverified' ? signClass(q.chg) : ''}`}>
        {fmtNum(q.last, sec.dec)}
      </Flash>
      {y ? <DayChg q={q} bp unit="bp" /> : <DayChg q={q} dec={sec.dec} />}
      {today.length > 1 && (
        <span className="qs-spark hide-m" title={`Today's prices${q.provider ? ` (${q.provider})` : ''}`}>
          <Sparkline values={today} width={64} height={14} base={q.prevClose} />
        </span>
      )}
      {Number.isFinite(q.bid) && Number.isFinite(q.ask) && (
        <span className="qs-ba hide-m" title={`Bid and ask${q.bboSource ? ` from ${q.bboSource}` : q.provider ? ` (${q.provider})` : ''}`}>
          {fmtNum(q.bid, sec.dec)}/{fmtNum(q.ask, sec.dec)}
        </span>
      )}
    </div>
  );
}

/** Four small bars, as the strip's second line starts. */
function SignalBars() {
  return (
    <svg className="qs-bars" viewBox="0 0 12 10" width="12" height="10" aria-hidden="true">
      <rect x="0" y="7" width="2" height="3" />
      <rect x="3" y="5" width="2" height="5" />
      <rect x="6" y="3" width="2" height="7" />
      <rect x="9" y="0" width="2" height="10" />
    </svg>
  );
}

/** The yellow clock before the time of the last price. */
function ClockIcon() {
  return (
    <svg className="qs-clock" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="11" height="11" rx="2" />
      <path d="M6 2.6V6l2.3 1.5" fill="none" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const amberLabel = (text: string) => <span className="lbl">{text}</span>;

/**
 * The quote strip's second line (TE01 03:11, TE04 04:55): signal bars and a clock, then At (the time of the last
 * price, "d" when the source delays it), Vol, O, H, L, Val and Prev in amber with white values. The app's own
 * provenance follows at the right: the pre- or after-market price, who supplies the line, the source and receipt
 * times, and the freshness and session badges.
 */
export function QuoteLine2({ sec }: { sec: SecurityDef }) {
  const q = useQuote(sec.id);
  if (!q) return null;
  const f = freshnessOf(q, sec, Date.now());
  const session = sessionLabel(q.session);
  if (q.src === 'NONE' && !Number.isFinite(q.last)) {
    return (
      <div className="qstrip qline-2">
        <span className="src">
          <QuoteFreshness id={sec.id} />
        </span>
      </div>
    );
  }
  const at = q.src === 'EOD' || q.dayOnly ? fmtDay(q.time) : q.src === 'CLOSE' || q.src === 'STALE' ? fmtStamp(q.time) : fmtTime(q.time, false);
  const delayed = f?.label === 'DELAYED';
  return (
    <div className="qstrip qline-2">
      <span className="qs-icons" title={`${f ? `${f.label}: ${f.why}` : 'No freshness known'}${session ? ` · market ${session.toLowerCase()}` : ''}`}>
        <SignalBars />
        <ClockIcon />
      </span>
      <span
        title={
          q.src === 'EOD'
            ? 'Date of the latest published value'
            : q.dayOnly
              ? 'Price from the latest daily bar; the time of the last trade comes with the first quote'
              : `When the market set the latest price (source time${exchangeTime(q)})${q.fetched && q.src !== 'SIM' ? `; received ${fmtTime(q.fetched)}` : ''}`
        }
      >
        {amberLabel('At')}
        {at}
        {delayed && <span className="qs-d" title={f?.why}> d</span>}
      </span>
      {q.volume > 0 && (
        <span>
          {amberLabel(q.volumeUnit ? `Vol ${q.volumeUnit}` : 'Vol')}
          {fmtNum(q.volume, 0)}
        </span>
      )}
      <span>
        {amberLabel('O')}
        {fmtNum(q.open, sec.dec)}
      </span>
      <span>
        {amberLabel('H')}
        {fmtNum(q.high, sec.dec)}
      </span>
      <span>
        {amberLabel('L')}
        {fmtNum(q.low, sec.dec)}
      </span>
      <span className="hide-m" title="The value traded in the session: none of the app's sources supplies it, so it is left blank">
        {amberLabel('Val')}
        <span className="muted">--</span>
      </span>
      <span className="hide-m">
        {amberLabel('Prev')}
        {fmtNum(q.prevClose, sec.dec)}
      </span>
      {q.extended && Number.isFinite(q.last) && (
        <span className="hide-m" title={`${SESSION[q.extended.session]} price at ${fmtTime(q.extended.time)}`}>
          {amberLabel(SESSION[q.extended.session])}
          {fmtNum(q.extended.price, sec.dec)} <span className={signClass(q.extended.price - q.last)}>{fmtPct((q.extended.price / q.last - 1) * 100)}</span>
        </span>
      )}
      {q.provider && (
        <span className={`muted${/IEX/i.test(q.provider) ? '' : ' hide-m'}`} title={/yahoo/i.test(q.provider) ? 'Yahoo Finance, for personal use: it does not guarantee timeliness or accuracy' : /IEX/i.test(q.provider) ? 'IEX exchange only: not a consolidated US market price, volume or bid/offer' : 'Who supplies this line'}>
          {q.provider}
        </span>
      )}
      <span className="src">
        <QuoteFreshness id={sec.id} />
      </span>
    </div>
  );
}
