// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState, type ReactNode } from 'react';
import { Chg, KV, SecLink, Section } from '../components/cells';
import { fmtIso, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { ecbRateOn } from '../data/live/ecb-fx';
import { officialAvailable } from '../data/live/official';
import { realSplits } from '../data/live/yahoo';
import { engine, useHistoryVersion, useTick } from '../data/market';
import { baseFxLevels, dailyLevels, majorCurrency } from '../data/portfolio-history';
import { resolveSecurity } from '../data/registry';
import { performance, replay, unrealised, type SecInfo, type Txn } from '../finance/ledger';
import { flash, usePanelId } from '../terminal/panel';
import { baseFx, isMargined, multiplier, priceCurrency } from '../terminal/portfolio';
import { addTxn, adoptTransactions, mismatches, needingRates, removeTxn, setRates, txnId, txnsOf } from '../terminal/transactions';
import { portfolio } from '../terminal/userdata';
import { PreTradeCheck, preTradeProblems } from './PreTrade';

/**
 * PORTFOLIO's Transactions tab: buys, sells and dividends with their dates, fees and exchange rates, matched first in,
 * first out (src/finance/ledger.ts). It lists them, the open lots, the realised P&L and the returns over the period.
 */

/** What the ledger needs of a security: the value of one price unit for one quantity unit, and its splits. */
export function ledgerInfo(id: string): SecInfo | undefined {
  const d = engine.get(id);
  if (!d) return undefined;
  return {
    unit: multiplier(d) * (d.minor ? 0.01 : 1),
    splits: (realSplits.get(id) ?? []).filter((s) => s.numerator > 0 && s.denominator > 0).map((s) => ({ day: s.day, ratio: s.numerator / s.denominator })),
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const ticker = (id: string) => engine.get(id)?.ticker ?? id;
const qtyText = (q: number) => fmtNum(q, Number.isInteger(Math.round(q * 1e6) / 1e6) ? 0 : 4);
const KIND = { buy: 'Buy', sell: 'Sell', dividend: 'Dividend' } as const;

/**
 * Where a holding and the transactions disagree, on both tabs: the two quantities and a button to set the holding
 * from the transactions.
 */
export function HoldingMismatch() {
  const panel = usePanelId();
  useHistoryVersion();
  const st = portfolio.use((s) => s);
  const list = mismatches(st, ledgerInfo);
  if (!list.length) return null;
  return (
    <div className="note amber" role="status" data-testid="holding-mismatch">
      {list.map((m) => (
        <div key={m.sec} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span>
            {ticker(m.sec)}: Holdings say {qtyText(m.holding)}, the transactions {qtyText(m.ledger)} (on today&apos;s share basis, after any split). A new transaction leaves this holding alone until they agree.
          </span>
          <button
            type="button"
            className="btn"
            aria-label={`Use the transactions for ${ticker(m.sec)}`}
            onClick={() => {
              portfolio.set((s) => adoptTransactions(s, m.sec, ledgerInfo));
              flash(panel, `${ticker(m.sec)}'s holding now follows its transactions.`, 'info');
            }}
          >
            Use the transactions
          </button>
        </div>
      ))}
    </div>
  );
}

/** A trade's rate into the base: typed, the same currency, today's market rate, or the ECB's of a past day. */
async function rateFor(ccy: string, base: string, date: string, typed: number): Promise<{ fx: number; note: string; warn?: string }> {
  if (typed > 0) return { fx: typed, note: 'entered' };
  if (ccy === base) return { fx: 1, note: 'same currency' };
  const now = today();
  if (date >= now) {
    const fx = baseFx(ccy, base);
    return fx > 0 ? { fx, note: `market rate when entered, ${now}` } : { fx: NaN, note: 'no rate', warn: `No ${ccy}/${base} rate yet.` };
  }
  if (!officialAvailable()) return { fx: NaN, note: 'no rate', warn: `No rate: the ECB's reference rates are read by the desktop app, so type the rate.` };
  const r = await ecbRateOn(date, ccy, base, now);
  if ('error' in r) return { fx: NaN, note: 'no rate', warn: `No rate: ${r.error}` };
  return { fx: r.rate, note: `ECB reference rate of ${r.asOf}` };
}

export function Transactions() {
  const panel = usePanelId();
  const tick = useTick(15);
  const historyVersion = useHistoryVersion();
  const st = portfolio.use((s) => s);
  const base = st.base ?? 'USD';
  const txns = useMemo(() => txnsOf(st), [st]);
  const [kind, setKind] = useState<Txn['kind']>('buy');
  const [sec, setSec] = useState('');
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState('');
  const [px, setPx] = useState('');
  const [fee, setFee] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ problems: string[]; commit: () => void } | null>(null);

  const record = async () => {
    if (busy) return;
    const d = resolveSecurity(sec);
    if (!d) return flash(panel, `Unknown security: ${sec}`, 'error');
    if (d.quote === 'yield') return flash(panel, 'A yield reference is not a priced instrument', 'error');
    if (isMargined(d)) return flash(panel, 'Futures stay on Holdings: transactions are for stocks, funds, bonds and other paid-for holdings', 'error');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return flash(panel, 'Enter the trade date', 'error');
    if (date > today()) return flash(panel, 'The trade date is in the future', 'error');
    const num = (s: string) => Number(s.replace(/,/g, '').trim());
    const q = kind === 'dividend' ? 0 : num(qty);
    if (kind !== 'dividend' && !(q > 0)) return flash(panel, 'Enter the quantity, more than zero', 'error');
    const p = num(px);
    if (!px.trim() || !(p > 0)) return flash(panel, kind === 'dividend' ? 'Enter the amount received' : 'Enter the price', 'error');
    const f = fee.trim() ? num(fee) : 0;
    if (!(f >= 0)) return flash(panel, 'The fee is a positive amount or blank', 'error');
    const typed = rate.trim() ? num(rate) : 0;
    if (rate.trim() && !(typed > 0)) return flash(panel, 'The exchange rate is a positive number or blank', 'error');
    const ccy = priceCurrency(d);
    setBusy(true);
    const r = await rateFor(ccy, base, date, typed);
    setBusy(false);
    const t: Txn = { id: txnId(), kind, sec: d.id, date, qty: q, price: p, fee: kind === 'dividend' ? 0 : f, fx: r.fx, fxNote: r.note, base };
    const res = addTxn(portfolio.get(), t, ledgerInfo);
    if (!res.ok) return flash(panel, res.error, 'error');
    const commit = () => {
      portfolio.set(res.change.portfolio);
      setPending(null);
      setSec('');
      setQty('');
      setPx('');
      setFee('');
      setRate('');
      const what = `${KIND[kind]} ${kind === 'dividend' ? `${fmtNum(p, 2)} ${ccy}` : `${qtyText(q)}`} ${d.ticker} on ${fmtIso(date)}`;
      const rateText = r.fx > 0 && ccy !== base ? ` Rate ${fmtNum(r.fx, 6)} ${base} per ${ccy} (${r.note}).` : r.warn ? ` ${r.warn}` : '';
      const holding = res.change.holding === 'updated' ? ' Holding updated.' : res.change.holding === 'kept' ? ' Holding left as it was: it differs from the transactions.' : '';
      flash(panel, `Recorded: ${what}.${rateText}${holding}`, r.warn ? 'error' : 'info');
    };
    // The portfolio's compliance rules, checked on the holdings the trade leaves: asked first when it adds an exception.
    const problems = preTradeProblems(portfolio.get(), res.change.portfolio);
    if (problems.length) return setPending({ problems, commit });
    commit();
  };

  const remove = (t: Txn) => {
    const res = removeTxn(portfolio.get(), t.id, ledgerInfo);
    if (!res.ok) return flash(panel, res.error, 'error');
    portfolio.set(res.change.portfolio);
    flash(panel, `Deleted: ${KIND[t.kind]} ${ticker(t.sec)} on ${fmtIso(t.date)}.${res.change.holding === 'updated' ? ' Holding updated.' : ''}`, 'info');
  };

  const missing = needingRates(st);
  const askAgain = async () => {
    if (busy) return;
    setBusy(true);
    const found = new Map<string, { fx: number; note: string }>();
    let failed = 0;
    for (const t of missing) {
      const d = engine.get(t.sec);
      if (!d) {
        failed++;
        continue;
      }
      const r = await rateFor(priceCurrency(d), base, t.date, 0);
      if (r.fx > 0) found.set(t.id, { fx: r.fx, note: r.note });
      else failed++;
    }
    setBusy(false);
    portfolio.set((s) => setRates(s, found));
    flash(panel, `${found.size} rate${found.size === 1 ? '' : 's'} found${failed ? `; ${failed} still missing` : ''}.`, failed ? 'error' : 'info');
  };

  // The ledger, its open lots at today's price and rate, and the returns over the period.
  const view = useMemo(() => {
    const state = replay(txns, ledgerInfo, base);
    const cutoff = Math.floor(engine.now() / DAY_MS) * DAY_MS;
    const fxNow = (id: string) => {
      const d = engine.get(id);
      return d ? baseFx(priceCurrency(d), base) : NaN;
    };
    const lots = state.lots.map((l) => {
      const s = ledgerInfo(l.sec)!;
      const last = engine.quote(l.sec)?.last ?? NaN;
      return { l, s, last, u: unrealised(l, s.unit, last, fxNow(l.sec)) };
    });
    const perf = performance({
      txns,
      base,
      info: ledgerInfo,
      closes: (id) => dailyLevels(engine.daily(id), cutoff),
      fx: (id) => {
        const d = engine.get(id);
        return d ? baseFxLevels(majorCurrency(d.ccy), base, cutoff) : [];
      },
      now: { at: engine.now(), price: (id) => engine.quote(id)?.last ?? NaN, fx: fxNow },
      cutoff,
    });
    const flows = { invested: 0, proceeds: 0, dividends: 0 };
    for (const t of txns) {
      const s = ledgerInfo(t.sec);
      const fx = t.base === base && t.fx > 0 ? t.fx : NaN;
      if (!s) continue;
      if (t.kind === 'buy') flows.invested += (t.qty * t.price * s.unit + t.fee) * fx;
      else if (t.kind === 'sell') flows.proceeds += (t.qty * t.price * s.unit - t.fee) * fx;
      else flows.dividends += t.price * fx;
    }
    const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
    return {
      state,
      lots,
      perf,
      flows,
      realised: { price: sum(state.realised.map((r) => r.price)), fx: sum(state.realised.map((r) => r.fx)), fees: sum(state.realised.map((r) => r.fees)), total: sum(state.realised.map((r) => r.total)) },
      open: { value: sum(lots.map((x) => x.l.qty * x.s.unit * x.last * fxNow(x.l.sec))), total: sum(lots.map((x) => x.u.total)) },
    };
  }, [txns, base, tick, historyVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const { state, lots, perf, flows } = view;
  const amount = (v: number) => (Number.isFinite(v) ? fmtNum(v, 2) : <span className="muted" title={`Needs every transaction's rate into ${base}`}>--</span>);
  const pnl = (v: number, title?: string) => (Number.isFinite(v) ? <Chg v={v} dec={2} /> : <span className="muted" title={title ?? `Needs every rate into ${base} and a current price`}>--</span>);
  const ret = (v: number, title: string) => (Number.isFinite(v) ? <Chg v={v * 100} pct /> : <span className="muted" title={title}>--</span>);
  const period = Number.isFinite(perf.from) ? `${fmtIso(new Date(perf.from).toISOString().slice(0, 10))} to today, ${Math.round(perf.days)} days` : '--';
  const shown = [...txns].reverse();
  const isDiv = kind === 'dividend';
  const formCcy = (() => {
    const d = resolveSecurity(sec);
    return d ? priceCurrency(d) : '';
  })();

  return (
    <>
      <HoldingMismatch />
      {missing.length > 0 && (
        <div className="note amber row" role="status" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span>
            {missing.length} transaction{missing.length === 1 ? ' has' : 's have'} no exchange rate into {base} (recorded for another portfolio currency, or none was found): the amounts in {base} that need {missing.length === 1 ? 'it' : 'them'} and the returns stay blank.
          </span>
          <button type="button" className="btn" onClick={() => void askAgain()} disabled={busy}>
            {busy ? 'Asking…' : officialAvailable() ? 'Ask the ECB again' : 'Find the rates again'}
          </button>
        </div>
      )}
      <div className="cols">
        <Section title={`Summary (${base})`}>
          <KV
            items={([
              ['Period', period],
              ['Invested (buys with fees)', amount(flows.invested)],
              ['Proceeds (sales less fees)', amount(flows.proceeds)],
              ['Dividends', amount(flows.dividends)],
              ['Fees', amount(state.fees)],
              ['Realised P&L', pnl(view.realised.total)],
              ['Realised: price move', pnl(view.realised.price)],
              ['Realised: currency', pnl(view.realised.fx)],
              ['Realised: fees', pnl(view.realised.fees)],
              ['Open lots at market', amount(view.open.value)],
              ['Unrealised P&L', pnl(view.open.total)],
              ['Time-weighted return', ret(perf.twr, perf.problems[0] ?? 'Needs every rate, a close for each holding and a current price')],
              ['Time-weighted, a year', ret(perf.twrAnnual, 'Shown for a period of a year or more')],
              ['Money-weighted return', ret(perf.mwrPeriod, perf.problems[0] ?? 'Needs money going in and coming out (or held at today’s value)')],
              ['Money-weighted, a year (XIRR)', ret(perf.mwr, 'Shown for a period of a year or more')],
              ['Closes left out', perf.omittedDates ? `${perf.omittedDates} (a holding had no close or rate that day)` : '0'],
            ] as [string, ReactNode][])}
          />
        </Section>
        <Section title="Record a transaction">
          {pending && <PreTradeCheck problems={pending.problems} onGo={pending.commit} onCancel={() => setPending(null)} />}
          <div className="pad row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select className="sel-inp" aria-label="Transaction type" value={kind} onChange={(e) => setKind(e.target.value as Txn['kind'])}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
            </select>
            <input className="inp" placeholder="Security (e.g. AAPL)" aria-label="Security" value={sec} onChange={(e) => setSec(e.target.value)} />
            <input className="inp" type="date" style={{ width: 140 }} aria-label="Trade date" title={isDiv ? 'The day the dividend was paid' : 'The trade date'} max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            {!isDiv && <input className="inp" style={{ width: 90 }} placeholder="Quantity" aria-label="Quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}
            <input
              className="inp"
              style={{ width: 110 }}
              placeholder={isDiv ? `Amount${formCcy ? ` (${formCcy})` : ''}` : 'Price'}
              aria-label={isDiv ? 'Amount received' : 'Price'}
              title={isDiv ? 'The total received, in the currency the security is priced in (pounds for a stock quoted in pence)' : 'The price a share, as quoted (pence for a stock quoted in pence)'}
              inputMode="decimal"
              value={px}
              onChange={(e) => setPx(e.target.value)}
            />
            {!isDiv && <input className="inp" style={{ width: 80 }} placeholder="Fee" aria-label="Fee" title="Fees and commission, in the currency the security is priced in (pounds, not pence)" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
            <input
              className="inp"
              style={{ width: 120 }}
              placeholder={formCcy && formCcy !== base ? `${base} per ${formCcy}` : 'Rate (optional)'}
              aria-label="Exchange rate"
              title={`Units of ${base} per unit of the security's currency on the trade date. Blank: the ECB's rate of a past day (desktop app), today's market rate for a trade of today.`}
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void record()}
            />
            <button type="button" className="btn primary" onClick={() => void record()} disabled={busy}>
              {busy ? 'Asking the ECB…' : 'Record'}
            </button>
          </div>
          <div className="note">
            Sales are matched to the oldest shares first. Trades before a split are counted on today&apos;s share basis. A security&apos;s holding on Holdings follows its transactions while the two agree. Cash on Holdings is not changed by
            transactions. Futures stay on Holdings. With no rate typed, a trade in another currency on a past day takes the ECB&apos;s reference rate of that day (or of the last day before it with rates; desktop app), and a trade of
            today the market rate. The ECB publishes its rates for information: the rate your bank or broker applied can differ.
          </div>
        </Section>
      </div>
      {state.problems.filter((p) => !p.includes('no exchange rate')).map((p) => (
        <div key={p} className="note amber">
          {p}
        </div>
      ))}

      <Section title="Transactions">
        <table className="tbl" data-testid="txn-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Security</th>
              <th className="num">Quantity</th>
              <th className="num">Price</th>
              <th className="num">Fee</th>
              <th className="num">Rate</th>
              <th className="num" title="Money paid (negative) or received, in the portfolio currency at the transaction's rate">Cash flow {base}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No transactions yet: choose buy, sell or dividend, the security, the date, the quantity and price, then Record.
                </td>
              </tr>
            )}
            {shown.map((t) => {
              const s = ledgerInfo(t.sec);
              const fx = t.base === base && t.fx > 0 ? t.fx : NaN;
              const money = !s ? NaN : t.kind === 'dividend' ? t.price * fx : t.kind === 'buy' ? -(t.qty * t.price * s.unit + t.fee) * fx : (t.qty * t.price * s.unit - t.fee) * fx;
              return (
                <tr key={t.id}>
                  <td>{fmtIso(t.date)}</td>
                  <td>{KIND[t.kind]}</td>
                  <td>
                    <SecLink id={t.sec}>{ticker(t.sec)}</SecLink>
                  </td>
                  <td className="num">{t.kind === 'dividend' ? '' : qtyText(t.qty)}</td>
                  <td className="num">{fmtNum(t.price, 2)}</td>
                  <td className="num">{t.kind === 'dividend' ? '' : fmtNum(t.fee, 2)}</td>
                  <td className="num" title={t.base === base ? t.fxNote : `Recorded for ${t.base}: no rate into ${base}`}>
                    {Number.isFinite(fx) ? fmtNum(fx, 6) : <span className="muted">--</span>}
                  </td>
                  <td className="num">{Number.isFinite(money) ? <Chg v={money} dec={2} /> : <span className="muted">--</span>}</td>
                  <td>
                    <button type="button" className="act" aria-label={`Delete ${KIND[t.kind].toLowerCase()} ${ticker(t.sec)} ${t.date}`} onClick={() => remove(t)}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title={`Open lots (${base})`}>
        <table className="tbl" data-testid="lots-table">
          <thead>
            <tr>
              <th>Security</th>
              <th>Bought</th>
              <th className="num">Quantity</th>
              <th className="num" title="Price paid a share on today's share basis, with the buy fee">Cost/share</th>
              <th className="num">Last</th>
              <th className="num">Price P&L</th>
              <th className="num">FX P&L</th>
              <th className="num">Fees</th>
              <th className="num">Unrealised</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No open lots.
                </td>
              </tr>
            )}
            {lots.map(({ l, s, last, u }) => (
              <tr key={`${l.txn}`}>
                <td>
                  <SecLink id={l.sec}>{ticker(l.sec)}</SecLink>
                </td>
                <td>{fmtIso(l.date)}</td>
                <td className="num">{qtyText(l.qty)}</td>
                <td className="num">{fmtNum(l.price + l.feePerUnit / s.unit, 2)}</td>
                <td className="num white">{fmtNum(last, 2)}</td>
                <td className="num">{pnl(u.price)}</td>
                <td className="num">{pnl(u.fx, 'No rate into the portfolio currency for this lot')}</td>
                <td className="num">{pnl(u.fees)}</td>
                <td className="num">{pnl(u.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Realised P&L (${base})`}>
        <table className="tbl" data-testid="realised-table">
          <thead>
            <tr>
              <th>Security</th>
              <th>Bought</th>
              <th>Sold</th>
              <th className="num">Quantity</th>
              <th className="num">Bought at</th>
              <th className="num">Sold at</th>
              <th className="num">Price</th>
              <th className="num">Currency</th>
              <th className="num">Fees</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {state.realised.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">
                  Nothing sold yet.
                </td>
              </tr>
            )}
            {state.realised.map((r, i) => (
              <tr key={i}>
                <td>
                  <SecLink id={r.sec}>{ticker(r.sec)}</SecLink>
                </td>
                <td>{fmtIso(r.bought)}</td>
                <td>{fmtIso(r.sold)}</td>
                <td className="num">{qtyText(r.qty)}</td>
                <td className="num">{fmtNum(r.buyPrice, 2)}</td>
                <td className="num">{fmtNum(r.sellPrice, 2)}</td>
                <td className="num">{pnl(r.price)}</td>
                <td className="num">{pnl(r.fx)}</td>
                <td className="num">{pnl(r.fees)}</td>
                <td className="num">{pnl(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="note">
        Returns: the time-weighted return chains each day&apos;s return over the closes where every holding has a price and a rate (a buy counts from the start of its day, a sale or dividend at its end; a day a holding lacks is left out,
        never filled in), then to today&apos;s value. The money-weighted return is the rate that discounts every buy, sale and dividend and today&apos;s value to zero (XIRR); both are given a year only over a year or more. Prices
        are split-adjusted closes without dividends, from the same history as CHART.
        {perf.historyFrom > perf.from + 7 * DAY_MS ? ' The price history starts after the first trade: the first period runs from the cost to the first close.' : ''}
      </div>
    </>
  );
}

/** The transactions as CSV rows, for PORTFOLIO's export on this tab. */
export function transactionRows(): (string | number | null | undefined)[][] {
  const st = portfolio.get();
  return [
    ['Date', 'Type', 'Security', 'Quantity', 'Price', 'Fee', `Rate (${st.base} per currency unit)`, 'Rate source', 'Rate into'],
    ...txnsOf(st).map((t) => [t.date, t.kind, t.sec, t.kind === 'dividend' ? '' : t.qty, t.price, t.kind === 'dividend' ? '' : t.fee, t.fx > 0 ? t.fx : '', t.fxNote, t.base]),
  ];
}
