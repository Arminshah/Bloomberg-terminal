// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { ECB_FIRST_DAY, ecbCross, parseEcbRates, type EcbRates } from '../data/live/ecb-fx';
import { official, officialAvailable } from '../data/live/official';
import { FX_MATRIX } from './FXMON';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * FXCA, currency conversion: an amount in one currency in another, at the current rate (each currency's live rate
 * against the US dollar, crossed) or at the ECB's reference rate of a past day (crossed through the euro), with the
 * amount in the other main currencies beside it.
 */

/** "FXCA 1000 EUR JPY", "FXCA EUR JPY" or a loaded pair (EURJPY Curncy): the amount and the two currencies. */
export function convertArgs(args: string | undefined, pair?: string): { amount: number; from: string; to: string } {
  const words = (args ?? '').toUpperCase().split(/[\s,]+/).filter(Boolean);
  const num = words.find((w) => /^\d+(\.\d+)?$/.test(w));
  const codes = words.filter((w) => FX_MATRIX.includes(w));
  const fromPair = /^([A-Z]{3})([A-Z]{3}) Curncy$/.exec(pair ?? '');
  const [from, to] = codes.length >= 2 ? codes : fromPair && FX_MATRIX.includes(fromPair[1]) && FX_MATRIX.includes(fromPair[2]) ? [fromPair[1], fromPair[2]] : [codes[0] ?? 'EUR', codes[0] === 'USD' ? 'EUR' : 'USD'];
  return { amount: num ? Number(num) : 1000, from, to };
}

/** Decimals for a rate: fewer as it grows. */
export const rateDec = (v: number) => (v >= 100 ? 2 : v >= 10 ? 3 : 5);

/** The quoted pair behind a currency's dollar value: EURUSD or USDJPY. */
const usdPair = (c: string) => [`${c}USD Curncy`, `USD${c} Curncy`].find((id) => engine.get(id));

/** Units of `to` per unit of `from` now, from each currency's dollar rate; NaN when either has none. */
export function rateNow(usdValue: (c: string) => number, from: string, to: string): number {
  return from === to ? 1 : usdValue(from) / usdValue(to);
}

export function FXCA({ route, sec }: FnProps) {
  const panel = usePanelId();
  useTick(1);
  const start = convertArgs(route.args, sec?.id);
  const [amountText, setAmountText] = useState(String(start.amount));
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [date, setDate] = useState('');
  const [ecb, setEcb] = useState<{ date: string; rates: EcbRates | null; error?: string } | null>(null);
  const amount = Number(amountText.replace(/,/g, ''));
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (!date) return;
    let live = true;
    if (date < ECB_FIRST_DAY || date > today) {
      setEcb({ date, rates: null, error: "The ECB's reference rates run from 4 January 1999 to today." });
      return;
    }
    if (!officialAvailable()) {
      setEcb({ date, rates: null, error: "The ECB's reference rates are read by the desktop app." });
      return;
    }
    setEcb({ date, rates: null });
    void official('ecbFx', date).then(
      (csv) => live && setEcb({ date, rates: parseEcbRates(csv), error: parseEcbRates(csv) ? undefined : 'The ECB did not answer; try again.' }),
      () => live && setEcb({ date, rates: null, error: 'The ECB did not answer; try again.' }),
    );
    return () => {
      live = false;
    };
  }, [date, today]);

  // The rate for any pair, now or on the day chosen, with the day it is of; or why there is none.
  const rateOf = (a: string, b: string): { rate: number; asOf?: string } | { error: string } | null => {
    if (!date) {
      if (!engine.realOnly) return { error: 'Conversion uses real rates in the desktop app. The browser demo has none, and none are generated.' };
      const r = rateNow((c) => engine.usdValue(c), a, b);
      return Number.isFinite(r) ? { rate: r } : { error: `No rate yet for ${[a, b].filter((c) => !Number.isFinite(engine.usdValue(c))).join(' and ')}.` };
    }
    if (!ecb || ecb.date !== date || (!ecb.rates && !ecb.error)) return null;
    if (!ecb.rates) return { error: ecb.error ?? 'The ECB did not answer.' };
    if (a === b) return { rate: 1, asOf: date };
    const r = ecbCross(ecb.rates, date, a, b);
    if (!r) return { error: `The ECB has no reference rates in the ten days to ${date}.` };
    if ('missing' in r) return { error: `The ECB publishes no reference rate for ${r.missing}.` };
    return r;
  };
  const main = rateOf(from, to);
  const ok = main && 'rate' in main ? main : null;
  const pairs = [from, to].map(usdPair).filter((id): id is string => !!id);
  const quotes = pairs.map((id) => engine.quote(id)).filter((q) => !!q);
  const providers = [...new Set(quotes.map((q) => q!.provider).filter(Boolean))];
  const oldest = Math.min(...quotes.map((q) => q!.time).filter(Number.isFinite));
  const others = FX_MATRIX.filter((c) => c !== from).map((c) => ({ c, r: rateOf(from, c) }));
  const csv = () => [['Amount', 'From', 'To', 'Rate', 'Converted', 'Rate of'], ...others.map(({ c, r }) => [amount, from, c, r && 'rate' in r ? r.rate : '', r && 'rate' in r ? amount * r.rate : '', date ? (r && 'rate' in r ? r.asOf ?? '' : '') : 'now'])];
  const sel = (label: string, value: string, set: (v: string) => void) => (
    <label className="fld">
      {label}
      <select className="sel-inp" aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
        {FX_MATRIX.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </label>
  );
  return (
    <div>
      <FnHeader
        code="CONVERT"
        title="Currency Conversion"
        sub={<><RealBadge /> {date ? "The ECB's reference rates, crossed through the euro" : 'Live rates against the US dollar, crossed'}</>}
        actions={exportActions(panel, `FXCA_${from}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <input className="inp" aria-label="Amount" value={amountText} onChange={(e) => setAmountText(e.target.value)} style={{ width: 120 }} />
            {sel('From', from, setFrom)}
            <button type="button" className="btn" aria-label="Swap" onClick={() => { setFrom(to); setTo(from); }}>⇄</button>
            {sel('To', to, setTo)}
            <label className="fld">
              Rate of
              <input className="inp" type="date" aria-label="Rate of" value={date} min={ECB_FIRST_DAY} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            {date && (
              <button type="button" className="btn" onClick={() => setDate('')}>
                Now
              </button>
            )}
          </div>
        }
      />
      {!Number.isFinite(amount) ? (
        <div className="empty">Type an amount.</div>
      ) : !main ? (
        <div className="empty">Reading the ECB&apos;s reference rates…</div>
      ) : 'error' in main ? (
        <div className="empty">{main.error}</div>
      ) : (
        <>
          <div className="fxca-result pad-s">
            <div className="fxca-big">
              <span className="white">{fmtNum(amount, 2)} {from}</span> = <span className="amber">{fmtNum(amount * ok!.rate, 2)} {to}</span>
            </div>
            <div className="muted">
              1 {from} = {fmtNum(ok!.rate, rateDec(ok!.rate))} {to} · 1 {to} = {fmtNum(1 / ok!.rate, rateDec(1 / ok!.rate))} {from}
            </div>
            <div className="muted" aria-label="Rate source">
              {date
                ? `The ECB's reference rate of ${fmtDay(Date.parse(`${ok!.asOf}T12:00:00Z`))}${ok!.asOf !== date ? ` (the last day with rates on or before ${fmtDay(Date.parse(`${date}T12:00:00Z`))})` : ''}: for information, not a rate to deal at.`
                : `From ${providers.join(', ') || 'the source'}, ${pairs.map((id) => engine.get(id)!.ticker).join(' and ')}${Number.isFinite(oldest) ? `, the older as of ${fmtStamp(oldest)}` : ''}.`}
            </div>
          </div>
          <table className="tbl" aria-label="In other currencies">
            <thead>
              <tr>
                <th>{fmtNum(amount, 2)} {from} in</th>
                <th className="num">Amount</th>
                <th className="num">Rate</th>
              </tr>
            </thead>
            <tbody>
              {others.map(({ c, r }) => (
                <tr key={c} className={c === to ? 'sel' : undefined}>
                  <td className="amber">{c}</td>
                  <td className="num white">{r && 'rate' in r ? fmtNum(amount * r.rate, 2) : ''}</td>
                  <td className="num" title={r && 'error' in r ? r.error : undefined}>{r && 'rate' in r ? fmtNum(r.rate, rateDec(r.rate)) : <span className="muted">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            {date
              ? "The ECB sets its reference rates around 14:10 CET each business day and publishes them for information; a bank or broker's rate can differ. A weekend or holiday takes the last day before it with rates. The ECB publishes CNY, not the offshore CNH."
              : 'Every rate is worked out from each currency\'s rate against the US dollar, as on FXMATRIX. Pick a date for the ECB\'s reference rate of a past day.'}
          </div>
        </>
      )}
    </div>
  );
}
