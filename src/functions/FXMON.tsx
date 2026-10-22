import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { cryptoReference, yahooQuotes } from '../data/live/yahoo';
import { QuoteFreshness } from '../components/Freshness';
import { krakenHandedBack, krakenOwns } from '../data/live/kraken';
import { COINGECKO_ATTRIBUTION, coinGecko } from '../data/live/coingecko';
import { Flash } from '../components/Flash';
import { Sparkline } from '../components/Sparkline';
import { Chg, DayChg, HBar, LivePx, SecLink, openSecurity } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, fmtStamp, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { horizonStart, periodChange, type Horizon } from '../data/analytics';
import { CURRENCY_INFO } from '../data/universe';
import { useGroupedRows, useMenu, useNumberedRows, usePanelId } from '../terminal/panel';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';

/** FXMATRIX's currencies, in the order of its rows and columns. */
export const FX_MATRIX = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CNH', 'HKD', 'SGD'];

function rateDec(v: number): number {
  if (v >= 100) return 2;
  if (v >= 10) return 3;
  return 4;
}

/** The quoted pair behind a currency's dollar value: EURUSD or USDJPY. */
function usdPair(c: string): string | undefined {
  return [`${c}USD Curncy`, `USD${c} Curncy`].find((id) => engine.get(id));
}

export function FXC(_: FnProps) {
  useTick(1);
  // Currencies without a real rate are left out of the matrix in the desktop app.
  const ccys = FX_MATRIX.filter((c) => !engine.realOnly || Number.isFinite(engine.usdValue(c)));
  const missing = engine.realOnly ? FX_MATRIX.filter((c) => !ccys.includes(c)) : [];
  const pairs = ccys.map(usdPair).filter((id): id is string => !!id);
  const times = pairs.map((id) => engine.quote(id)?.time ?? NaN).filter(Number.isFinite);
  const providers = [...new Set(pairs.map((id) => engine.quote(id)?.provider).filter(Boolean))];
  return (
    <div>
      <FnHeader code="FXMATRIX" title="Currency Cross Rates" sub="Units of the column currency per one unit of the row currency" />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              {ccys.map((c) => (
                <th key={c} className="num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ccys.map((row) => (
              <tr key={row}>
                <td className="amber b">{row}</td>
                {ccys.map((col) => {
                  if (row === col) return <td key={col} className="num faint fx-same" title="The same currency" />;
                  const v = engine.usdValue(row) / engine.usdValue(col);
                  return (
                    <td key={col} className="num white">
                      <Flash value={Number(v.toFixed(rateDec(v)))}>{fmtNum(v, rateDec(v))}</Flash>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        Every cross is worked out from each currency's rate against the US dollar ({pairs.map((id) => engine.get(id)!.ticker).join(', ')}), so crosses such as EURJPY are derived, not quoted, and triangular arbitrage is zero by construction.
        {engine.realOnly && times.length > 0 &&
          ` Rates from ${providers.join(', ') || 'the source'}, the oldest as of ${fmtStamp(Math.min(...times))}; QUOTE or WATCHLIST shows each rate's freshness.`}
        {missing.length > 0 && ` No rate yet for ${missing.join(', ')}.`}
      </div>
    </div>
  );
}

const RANK_H: { n: number; h: Horizon }[] = [
  { n: 1, h: '1D' },
  { n: 2, h: '5D' },
  { n: 3, h: '1M' },
  { n: 4, h: '3M' },
  { n: 5, h: 'YTD' },
  { n: 6, h: '1Y' },
];

/** Percent change of a currency's value against USD over a horizon. */
function ccyVsUsd(code: string, h: Horizon): { id: string | undefined; pct: number } {
  const direct = engine.get(`${code}USD Curncy`);
  const inverse = engine.get(`USD${code} Curncy`);
  if (direct) return { id: direct.id, pct: periodChange(direct.id, h) };
  if (inverse) {
    const p = periodChange(inverse.id, h);
    return { id: inverse.id, pct: (1 / (1 + p / 100) - 1) * 100 };
  }
  return { id: undefined, pct: NaN };
}

export function WCRS(_: FnProps) {
  useTick(3);
  const [tab, setTab] = useState(1);
  const h = RANK_H[tab - 1].h;
  const codes = ['EUR', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CNH', 'HKD', 'SGD', 'INR', 'KRW', 'MXN', 'BRL', 'ZAR', 'TRY'];
  const all = codes.map((c) => ({ c, ...ccyVsUsd(c, h) }));
  const rows = all.filter((r) => !engine.realOnly || (r.id && engine.hasSource(r.id) && Number.isFinite(r.pct))).sort((a, b) => b.pct - a.pct);
  const missing = all.filter((r) => !rows.includes(r)).map((r) => r.c);
  const max = Math.max(...rows.map((r) => Math.abs(r.pct)).filter(Number.isFinite), 0.01);
  return (
    <div>
      <FnHeader code="FXRANK" title="World Currency Ranker" sub="Performance against the US dollar" tabs={RANK_H.map((x) => ({ n: x.n, label: x.h }))} tab={tab} onTab={setTab} />
      <table className="tbl">
        <thead>
          <tr>
            <th className="num">Rank</th>
            <th>Currency</th>
            <th className="hide-m">Name</th>
            <th>Pair</th>
            <th className="num">Spot</th>
            <th className="num">% vs USD</th>
            <th style={{ width: '32%' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.c}>
              <td className="num amber">{i + 1})</td>
              <td className="b">{r.c}</td>
              <td className="hide-m muted">{CURRENCY_INFO.get(r.c)?.name}</td>
              <td>{r.id ? <SecLink id={r.id} fn="CHART">{engine.get(r.id)!.ticker}</SecLink> : '--'}</td>
              <td className="num">{r.id ? <LivePx id={r.id} /> : '--'}</td>
              <td className="num">
                <Chg v={r.pct} pct />
              </td>
              <td>
                <HBar value={r.pct} max={max} signed />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {engine.realOnly && (
        <div className="note">
          {h === '1D'
            ? "The day's change against each pair's previous close, once that close is confirmed for the right session."
            : `Change since the close on or before ${fmtDay(horizonStart(h))}, from the pair's daily closes.`}{' '}
          Spot rates from {[...new Set(rows.map((r) => (r.id ? engine.quote(r.id)?.provider : undefined)).filter(Boolean))].join(', ') || 'the source'}.
          {missing.length > 0 && ` No figure yet for ${missing.join(', ')}${h === '1D' ? ': its previous close is not confirmed yet, or no rate has arrived' : ': no rate or no daily history for the period'}.`}
        </div>
      )}
    </div>
  );
}

export function CRYP({ sec }: FnProps) {
  const panel = usePanelId();
  useTick(1);
  // CRYPTO BTC: the monitor with Bitcoin's quote on top and its row marked.
  const focus = sec?.cls === 'crypto' ? sec : undefined;
  const real = engine.realOnly;
  const cg = coinGecko.use((c) => c);
  const list = engine.securities.filter((d) => d.cls === 'crypto');
  // On real data the market value is CoinGecko's (aggregated across exchanges), or Yahoo's when it feeds the line;
  // nothing is worked out from a stored supply figure.
  const caps = list.map((d) => {
    if (!real) return engine.quote(d.id)!.last * d.cry!.supply;
    const gecko = cg.coins[d.id]?.marketCap;
    if (gecko > 0) return gecko;
    const mc = Number((yahooQuotes.get(d.id) ?? cryptoReference.get(d.id))?.marketCap);
    return mc > 0 ? mc : NaN;
  });
  // Market values from Yahoo (CoinMarketCap's figures) where CoinGecko has none.
  const fromYahoo = real && list.some((d) => !(cg.coins[d.id]?.marketCap > 0) && Number((yahooQuotes.get(d.id) ?? cryptoReference.get(d.id))?.marketCap) > 0);
  const allCaps = caps.every((c) => Number.isFinite(c));
  const total = caps.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const btc = list.findIndex((d) => d.id === 'XBTUSD Curncy');
  const anyKraken = real && list.some((d) => krakenOwns(d.id));
  // Kraken counts volume in coins: its dollar value at the last price is an estimate, marked as one.
  const usdVolume = (d: (typeof list)[number]) => {
    const q = engine.quote(d.id)!;
    return q.volumeUnit === 'USD' ? q.volume : q.volume * q.last;
  };
  const nums = useNumberedRows('cryp-rows', list, 1, (d) => openSecurity(panel, d.id, undefined, 'CHART'), (d) => d.name);
  return (
    <div>
      <FnHeader
        code="CRYPTO"
        title="Cryptocurrency Monitor"
        sub={allCaps ? `Total value ${fmtBig(total)} USD · BTC share ${btc >= 0 && total > 0 ? fmtNum((caps[btc] / total) * 100, 1) : '--'}% of listed assets` : anyKraken ? 'Kraken exchange prices, USD pairs' : undefined}
      />
      {focus && <QuoteStrip sec={focus} />}
      <table className="tbl">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Last</th>
            <th className="num">Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">High</th>
            <th className="num hide-m">Low</th>
            <th className="num hide-m" title={anyKraken ? 'Kraken volume for the UTC day times the last price: an estimate' : undefined}>
              {anyKraken ? 'Value traded ≈ USD' : real ? 'Volume USD 24h' : 'Volume USD'}
            </th>
            <th className="num" title={real ? `Market capitalisation, aggregated across exchanges: ${fromYahoo ? 'Yahoo Finance (CoinMarketCap)' : 'CoinGecko'}` : undefined}>
              Mkt value
            </th>
            <th className="num hide-m">7D %</th>
            <th className="num">30D %</th>
            <th className="num hide-m">YTD %</th>
            <th className="hide-m">Today</th>
            <th>Src</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d, i) => {
            const q = engine.quote(d.id)!;
            const intra = engine.intraday(d.id);
            const vol = usdVolume(d);
            return (
              <tr key={d.id} className={`click${focus?.id === d.id ? ' sel' : ''}`} onClick={(e) => openSecurity(panel, d.id, e, 'CHART')}>
                <td>
                  <RowNo n={nums[i]} />
                  <SecLink id={d.id} fn="CHART">
                    {d.ticker}
                  </SecLink>{' '}
                  <span className="muted hide-m">{d.name.split(' / ')[0]}</span>
                </td>
                <td className="num white">
                  <LivePx id={d.id} />
                </td>
                <td className="num">
                  <DayChg q={q} dec={d.dec} />
                </td>
                <td className="num">
                  <DayChg q={q} pct />
                </td>
                <td className="num hide-m">{fmtNum(q.high, d.dec)}</td>
                <td className="num hide-m">{fmtNum(q.low, d.dec)}</td>
                <td className="num hide-m">{Number.isFinite(vol) && vol > 0 ? `${q.volumeUnit === 'USD' ? '' : '≈'}${fmtBig(vol)}` : '--'}</td>
                <td className="num">{fmtBig(caps[i])}</td>
                <td className="num hide-m">
                  <Chg v={periodChange(d.id, '5D')} pct dec={1} />
                </td>
                <td className="num">
                  <Chg v={periodChange(d.id, '1M')} pct dec={1} />
                </td>
                <td className="num hide-m">
                  <Chg v={periodChange(d.id, 'YTD')} pct dec={1} />
                </td>
                <td className="hide-m">
                  <Sparkline values={intra.c.subarray(0, intra.length)} width={80} height={14} />
                </td>
                <td>
                  <QuoteFreshness id={d.id} session={false} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">
        {!real
          ? 'With network access the monitor streams real prices from Coinbase; otherwise it runs on the simulator.'
          : anyKraken
            ? 'Prices, ranges and changes are Kraken\'s own, for its USD pairs, over the UTC day: one exchange\'s market, not a market-wide price. The previous close is the close of Kraken\'s previous daily candle.'
            : `${krakenHandedBack() ? `Kraken did not answer (${krakenHandedBack()}), so for this session prices` : 'Prices'} come from Yahoo Finance, which gives CoinMarketCap's aggregated prices; volume is its 24-hour volume in US dollars.`}{' '}
        {real && (cg.status === 'ok' || Object.keys(cg.coins).length) ? (
          <>
            Market value from CoinGecko, aggregated across exchanges, as of {fmtTime(cg.at)}. {COINGECKO_ATTRIBUTION}.
          </>
        ) : real && fromYahoo ? (
          'Market value from Yahoo Finance (CoinMarketCap\'s figures, aggregated across exchanges).'
        ) : real && cg.status === 'needs-key' ? (
          'Market value needs a free CoinGecko Demo key (COINGECKO_API_KEY on PROVIDERS); nothing is estimated in its place.'
        ) : null}
      </div>
    </div>
  );
}

const GROUPS = ['Energy', 'Precious Metals', 'Base Metals', 'Grains', 'Softs', 'Livestock'];

/** Each generic contract's commodity, as the monitor names it. */
const GLCO_NAMES: Record<string, string> = {
  CL1: 'WTI Crude', CO1: 'Brent Crude', NG1: 'Natural Gas', HO1: 'Heating Oil', XB1: 'RBOB Gasoline',
  GC1: 'Gold', SI1: 'Silver', PL1: 'Platinum', PA1: 'Palladium', HG1: 'Copper',
  'W 1': 'Wheat', 'C 1': 'Corn', 'S 1': 'Soybeans', KC1: 'Coffee', SB1: 'Sugar No. 11', CC1: 'Cocoa', CT1: 'Cotton',
  LC1: 'Live Cattle', LH1: 'Lean Hogs', FC1: 'Feeder Cattle',
};
const glcoName = (d: SecurityDef) => GLCO_NAMES[d.ticker] ?? (d.alias?.[0] ? d.alias[0].charAt(0) + d.alias[0].slice(1).toLowerCase() : d.name);

export function GLCO(_: FnProps) {
  const panel = usePanelId();
  useTick(1);
  const now = engine.now();
  const [collapsed, toggle] = useCollapsed();
  // Each group numbers its contracts from its own ten, as the terminal's GLCO does; a collapsed group keeps them.
  const lists = GROUPS.map((g) => engine.securities.filter((d) => d.cls === 'commodity' && d.cmd!.group === g));
  const nums = useGroupedRows('glco-rows', lists, GROUPS.map((g) => !collapsed.includes(g)), (d) => openSecurity(panel, d.id, undefined, 'CHART'), (d) => d.name);
  useMenu('glco-groups', GROUPS.map((g, gi) => ({ n: gi + 1, label: g, run: () => toggle(g) })));
  return (
    <div>
      <FnHeader code="COMMODITIES" title="Global Commodities" sub="Generic front-month futures" />
      <table className="tbl">
        <thead>
          <tr>
            <th>Contract</th>
            <th className="hide-m">Name</th>
            <th className="num">Last</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">Time</th>
            <th className="num hide-m">High</th>
            <th className="num hide-m">Low</th>
            <th className="num">YTD %</th>
            <th className="num hide-m">1Y %</th>
            <th className="hide-m">Unit</th>
            <th className="hide-m">Intraday</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g, gi) => [
            <GroupRow key={g} n={gi + 1} name={g} span={12} open={!collapsed.includes(g)} onToggle={() => toggle(g)} />,
            ...(collapsed.includes(g) ? [] : lists[gi])
              .map((d, i) => {
                const n = nums[gi][i];
                const q = engine.quote(d.id)!;
                const intra = engine.intraday(d.id);
                return (
                  <tr key={d.id} className="click" onClick={(e) => openSecurity(panel, d.id, e, 'CHART')}>
                    <td>
                      <RowNo n={n} />
                      <SecLink id={d.id} fn="CHART">
                        {d.ticker}
                      </SecLink>
                    </td>
                    <td className="hide-m">{glcoName(d)}</td>
                    <td className="num white">
                      <LivePx id={d.id} />
                    </td>
                    <td className="num">
                      <DayChg q={q} dec={d.dec} />
                    </td>
                    <td className="num">
                      <DayChg q={q} pct />
                    </td>
                    {/* The source's last trade: a date instead of a time shows a line that has not traded today. */}
                    <td className="num muted hide-m">{fmtStamp(q.time, now)}</td>
                    <td className="num hide-m">{fmtNum(q.high, d.dec)}</td>
                    <td className="num hide-m">{fmtNum(q.low, d.dec)}</td>
                    <td className="num">
                      <Chg v={periodChange(d.id, 'YTD')} pct dec={1} />
                    </td>
                    <td className="num hide-m">
                      <Chg v={periodChange(d.id, '1Y')} pct dec={1} />
                    </td>
                    <td className="muted hide-m">{d.cmd!.unit}</td>
                    <td className="hide-m">
                      <Sparkline values={intra.c.subarray(0, intra.length)} width={80} height={14} />
                    </td>
                  </tr>
                );
              }),
          ])}
        </tbody>
      </table>
    </div>
  );
}
