import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, SecLink } from '../components/cells';
import { fmtNum, fmtStamp } from '../core/format';
import { type Horizon } from '../data/analytics';
import { engine, useTick } from '../data/market';
import { CURRENCY_INFO } from '../data/universe';
import { crossPct, ratePerBase, rateDecimals, WCR_BASES, WCR_VIEWS } from '../data/world-fx';
import { flash, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { currencyBasket } from '../terminal/userdata';
import { ccyVsUsd } from './FXMON';

/**
 * WCR, World Currency Rates (the provider's 2020 Quick Start; Michigan's currencies guide: rates of the world's
 * currencies, with baskets of your choosing). Every currency the app carries against a base you choose, by region,
 * and a basket of your own, each with its change over the day, a month, the year to date and a year.
 */

const PERIODS: Horizon[] = ['1D', '1M', 'YTD', '1Y'];
const ALL_CODES = ['USD', ...[...CURRENCY_INFO.keys()]];
const nameOf = (c: string) => (c === 'USD' ? 'US Dollar' : CURRENCY_INFO.get(c)?.name ?? c);
const regionOf = (c: string) => (c === 'USD' ? 'Americas' : CURRENCY_INFO.get(c)?.region);

/** The pair line to chart for a currency against the base: a cross the app carries, else its dollar pair. */
function pairFor(c: string, base: string): string | undefined {
  for (const id of [`${base}${c} Curncy`, `${c}${base} Curncy`]) if (engine.get(id)) return id;
  return ccyVsUsd(c === 'USD' ? base : c, '1D').id;
}

export function WCR(_: FnProps) {
  const panel = usePanelId();
  const now = engine.now();
  useTick(3);
  const [view, setView] = useState(1);
  const basket = currencyBasket.use((s) => s);
  const base = WCR_BASES.includes(basket.base as (typeof WCR_BASES)[number]) ? basket.base : 'USD';
  const [adding, setAdding] = useState('');
  const v = WCR_VIEWS[view - 1];
  const codes = (v.label === 'My basket' ? basket.codes : ALL_CODES.filter((c) => !v.region || regionOf(c) === v.region)).filter((c) => c !== base);
  const usdBase = engine.usdValue(base);
  const rows = codes.map((c) => {
    const rate = ratePerBase(engine.usdValue(c), usdBase);
    const changes = PERIODS.map((h) => crossPct(c === 'USD' ? 0 : ccyVsUsd(c, h).pct, base === 'USD' ? 0 : ccyVsUsd(base, h).pct));
    const pair = pairFor(c, base);
    const q = pair ? engine.quote(pair) : undefined;
    return { c, rate, changes, pair, q };
  });
  const missing = rows.filter((r) => !Number.isFinite(r.rate)).map((r) => r.c);
  const providers = [...new Set(rows.map((r) => r.q?.provider).filter(Boolean))];
  const add = () => {
    const code = adding.trim().toUpperCase();
    if (!ALL_CODES.includes(code)) return flash(panel, `${code || 'That'} is not a currency the app carries`, 'error');
    if (basket.codes.includes(code)) return flash(panel, `${code} is in the basket already`, 'error');
    currencyBasket.set((s) => ({ ...s, codes: [...s.codes, code] }));
    setAdding('');
  };
  return (
    <div>
      <FnHeader
        code="CURRENCYRATES"
        title="World Currency Rates"
        sub={`Units of each currency for one ${base}, and its change against the ${base}`}
        tabs={WCR_VIEWS.map((x) => ({ n: x.n, label: x.label }))}
        tab={view}
        onTab={setView}
        controls={
          <div className="row" style={{ gap: 8 }}>
            <label className="fld">
              Base{' '}
              <select className="sel-inp" aria-label="Base currency" value={base} onChange={(e) => currencyBasket.set((s) => ({ ...s, base: e.target.value }))}>
                {WCR_BASES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            {v.label === 'My basket' && (
              <>
                <input className="inp" style={{ width: 90 }} placeholder="Currency" aria-label="Currency to add" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <button type="button" className="btn" onClick={add}>
                  Add
                </button>
              </>
            )}
          </div>
        }
      />
      <table className="tbl" data-testid="wcr-table">
        <thead>
          <tr>
            <th>Currency</th>
            <th className="hide-m">Name</th>
            <th className="num">Per {base}</th>
            <th className="num hide-m">{base} per unit</th>
            {PERIODS.map((h) => (
              <th key={h} className="num">
                {h === '1D' ? 'Day' : h} %
              </th>
            ))}
            <th className="hide-m">Pair</th>
            <th className="num hide-m">Time</th>
            {v.label === 'My basket' && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="empty">
                {v.label === 'My basket' ? 'Your basket is empty: type a currency code (EUR, JPY…) and Add.' : 'No currencies here.'}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.c}>
              <td className="b">{r.c}</td>
              <td className="hide-m muted">{nameOf(r.c)}</td>
              <td className="num white">{fmtNum(r.rate, rateDecimals(r.rate))}</td>
              <td className="num hide-m">{fmtNum(1 / r.rate, rateDecimals(1 / r.rate))}</td>
              {r.changes.map((p, i) => (
                <td key={PERIODS[i]} className="num">
                  <Chg v={p} pct />
                </td>
              ))}
              <td className="hide-m">{r.pair ? <SecLink id={r.pair} fn="CHART">{engine.get(r.pair)!.ticker}</SecLink> : '--'}</td>
              <td className="num muted hide-m">{r.q && Number.isFinite(r.q.time) ? fmtStamp(r.q.time, now) : '--'}</td>
              {v.label === 'My basket' && (
                <td>
                  <button type="button" className="act" aria-label={`Remove ${r.c} from the basket`} onClick={() => currencyBasket.set((s) => ({ ...s, codes: s.codes.filter((x) => x !== r.c) }))}>
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        Rates are worked out through the US dollar from each currency&apos;s dollar pair{providers.length ? ` (${providers.join(', ')})` : ''}: units of the currency for one {base}. A change is the currency&apos;s against the {base} (positive when it gained), from both
        currencies&apos; changes against the dollar over the same closes; the day&apos;s change needs each pair&apos;s previous close confirmed. Mid rates, not dealing rates.
        {missing.length > 0 && ` No rate yet for ${missing.join(', ')}.`}
      </div>
    </div>
  );
}
