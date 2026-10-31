import { useMemo, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { LatestNews } from '../components/LatestNews';
import { krakenOwns, krakenPairFor } from '../data/live/kraken';
import { COINGECKO_ATTRIBUTION, coinGecko } from '../data/live/coingecko';
import { Sparkline } from '../components/Sparkline';
import { Chg, KV, LivePx, SecLink, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { fmtBig, fmtDay, fmtInt, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { closeAt, marketCapUsd, periodChange, periodStart, rangeStats } from '../data/analytics';
import type { Series } from '../data/series';
import { centralBanks, COUNTRY_NAMES } from '../data/eco';
import { CURRENCY_INFO } from '../data/universe';
import { analytics as bondAnalytics, settlementDate } from '../finance/bonds';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps, MenuItem } from '../terminal/types';
import { CLASS_LABEL } from '../data/registry';
import { useFundamentals } from '../data/live/yfund';
import { contractSymbols, FUTURES_EXCHANGE, useYahooQuotes } from '../data/live/yquotes';
import { cryptoReference, yahooQuotes } from '../data/live/yahoo';
import { DAY_MS } from '../data/calendar';
import { NoBondNotice, sourceLabel } from '../components/Source';
import { realFutureContract } from '../data/realfut';
import { yieldMethod } from '../data/live/govyields';
import { EQUITY_DES_TABS, EquityDES } from './DESEquity';
import { usYieldMethod } from '../data/live/ust';

function RelatedMenu({ sec, fns }: { sec: SecurityDef; fns: [string, string][] }) {
  const panel = usePanelId();
  const items: MenuItem[] = useMemo(
    () => fns.map(([code, label], i) => ({ n: 21 + i, label, run: () => execute(panel, `${sec.id} ${code}`) })),
    [fns, panel, sec.id],
  );
  useMenu('des-related', items);
  return (
    <Section title="Related functions" right="Type the number and press Enter">
      <div className="pad-s" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px 12px' }}>
        {fns.map(([code, label], i) => (
          <button key={code} type="button" className="act" style={{ textAlign: 'left' }} onClick={() => execute(panel, `${sec.id} ${code}`)}>
            <b>{21 + i})</b> <span className="amber">{code}</span> {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function PriceChartMini({ sec, bars = 252 }: { sec: SecurityDef; bars?: number }) {
  useTick(10);
  const s = engine.daily(sec.id);
  const from = Math.max(0, s.length - bars);
  const vals = s.c.subarray(from, s.length);
  return (
    <div className="pad-s">
      <Sparkline values={vals} width={600} height={110} fluid />
    </div>
  );
}

function Range52({ sec }: { sec: SecurityDef }) {
  const rs = rangeStats(sec.id);
  const q = engine.quote(sec.id)!;
  const pos = (q.last - rs.lo52) / (rs.hi52 - rs.lo52 || 1);
  return (
    <div className="pad-s">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="dn">L {fmtNum(rs.lo52, sec.dec)}</span>
        <span className="muted">52-week range</span>
        <span className="up">H {fmtNum(rs.hi52, sec.dec)}</span>
      </div>
      <div className="bar-track" style={{ marginTop: 4, background: 'linear-gradient(90deg, #4a1515, #1f1f1f 50%, #11401f)' }}>
        <div style={{ position: 'absolute', left: `calc(${Math.min(100, Math.max(0, pos * 100))}% - 1px)`, top: -3, bottom: -3, width: 3, background: 'var(--amber)' }} />
      </div>
    </div>
  );
}

function Returns({ id }: { id: string }) {
  const y = engine.get(id)?.quote === 'yield';
  // Once the price history is in, a period it does not reach back to is left out (Kraken's daily record covers about
  // two years, a recent listing less), not shown as "--".
  const loaded = engine.daily(id).length > 0;
  const hs = (['1D', '5D', '1M', '3M', 'YTD', '1Y', '5Y'] as const).filter((h) => h === '1D' || !loaded || Number.isFinite(periodChange(id, h)));
  return (
    <table className="tbl">
      <thead>
        <tr>
          {hs.map((h) => (
            <th key={h} className="num">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {hs.map((h) => (
            <td key={h} className="num">
              <Chg v={periodChange(id, h)} pct={!y} bp={y} dec={y ? 1 : 1} />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/**
 * DES's period table for an index: its level at the start of the year and a year before the latest close, with the change
 * since each in percent and in points, then its 52-week high and low with their dates.
 */
export function indexPeriodRows(s: Series, last: number, hi52: number, hi52t: number, lo52: number, lo52t: number): { label: string; level: number; pct: number; net: number; date?: number }[] {
  const from = (level: number) => ({ level, pct: (last / level - 1) * 100, net: last - level });
  return [
    { label: 'Year to Date', ...from(s.length ? closeAt(s, periodStart(s, 'YTD')) : NaN) },
    { label: '52 Week Ago', ...from(s.length ? closeAt(s, periodStart(s, '1Y')) : NaN) },
    { label: '52 Week High', level: hi52, pct: NaN, net: NaN, date: hi52t },
    { label: '52 Week Low', level: lo52, pct: NaN, net: NaN, date: lo52t },
  ];
}

function IndexPeriods({ sec }: { sec: SecurityDef }) {
  const rs = rangeStats(sec.id);
  const last = engine.quote(sec.id)?.last ?? NaN;
  const rows = indexPeriodRows(engine.daily(sec.id), last, rs.hi52, rs.hi52t, rs.lo52, rs.lo52t);
  return (
    <table className="tbl des-periods">
      <thead>
        <tr>
          <th>Period</th>
          <th className="num">Level</th>
          <th className="num">% Change</th>
          <th className="num">Net Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="amber">{r.label}</td>
            <td className="num white">
              {fmtNum(r.level, 2)}
              {r.date !== undefined && Number.isFinite(r.date) ? <span className="muted"> ({fmtDay(r.date)})</span> : null}
            </td>
            <td className="num">{r.date === undefined ? <Chg v={r.pct} dec={2} /> : null}</td>
            <td className="num">{r.date === undefined ? <Chg v={r.net} dec={2} /> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IndexDES({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const panel = usePanelId();
  const rs = rangeStats(sec.id);
  const members = engine.securities.filter((d) => d.cls === 'equity' && (sec.country === 'US' ? d.country === 'US' : d.country === sec.country));
  return (
    <>
      <div className="cols">
        <Section title="Index">
          <p className="prose">{sec.about}</p>
          <KV
            items={[
              ['Country', COUNTRY_NAMES[sec.country] ?? sec.country],
              ['Currency', sec.ccy],
              ['Last', <LivePx key="l" id={sec.id} />],
              ['52W high', `${fmtNum(rs.hi52, 2)}  ${fmtDay(rs.hi52t)}`],
              ['52W low', `${fmtNum(rs.lo52, 2)}  ${fmtDay(rs.lo52t)}`],
              ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
            ]}
          />
          <IndexPeriods sec={sec} />
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        <Section title="1-year price">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      {members.length > 0 && sec.ticker !== 'VIX' && (
        <Section
          // Not the index's members: every equity of the index's country in the app's own list. MEMBERS has the members.
          title={`${COUNTRY_NAMES[sec.country] ?? sec.country} equities in the app's list`}
          right={
            <>
              {members.length} securities ·{' '}
              <button type="button" className="act" onClick={() => execute(panel, `${sec.id} MEMBERS`)}>
                The index&apos;s members (MEMBERS)
              </button>
            </>
          }
        >
          <DataTable
            rows={members}
            rowKey={(d) => d.id}
            columns={[
              { key: 't', label: 'Ticker', render: (d) => <SecLink id={d.id}>{d.ticker}</SecLink> },
              { key: 'n', label: 'Name', render: (d) => d.name },
              { key: 'l', label: 'Last', num: true, render: (d) => <LivePx id={d.id} /> },
              { key: 'c', label: '%Chg', num: true, render: (d) => <Chg v={engine.quote(d.id)!.pct} pct />, sort: (d) => engine.quote(d.id)!.pct },
              { key: 'm', label: 'Mkt cap USD', num: true, render: (d) => fmtBig(marketCapUsd(d.id)), sort: (d) => marketCapUsd(d.id) },
            ]}
            defaultSort={{ key: 'm', dir: -1 }}
          />
        </Section>
      )}
      <RelatedMenu sec={sec} fns={[['CHART', 'Price graph'], ['INTRADAY', 'Intraday'], ['HISTORY', 'Price table'], ['RETURNS', 'Comparative returns'], ['OPTIONS', 'Options'], ['BETA', 'Beta']]} />
    </>
  );
}

function FxDES({ sec }: { sec: SecurityDef }) {
  useTick(2);
  const q = engine.quote(sec.id)!;
  const rs = rangeStats(sec.id);
  const base = sec.fx?.base ?? 'USD';
  const quote = sec.fx?.quote ?? 'USD';
  const cbs = centralBanks();
  const rateFor = (c: string) => {
    const info = CURRENCY_INFO.get(c);
    const country = c === 'USD' ? 'US' : c === 'EUR' ? 'EZ' : info?.country;
    return cbs.find((b) => b.country === country)?.rate;
  };
  const rb = rateFor(base);
  const rq = rateFor(quote);
  const fwd = (months: number) => {
    if (rb == null || rq == null) return NaN;
    const t = months / 12;
    return q.last * ((1 + (rq / 100) * t) / (1 + (rb / 100) * t));
  };
  const pip = sec.dec >= 4 ? 10 ** sec.dec : sec.dec === 3 ? 100 : 1;
  if (sec.ticker === 'DXY') {
    return (
      <div className="cols">
        <Section title="Dollar index">
          <p className="prose">{sec.about}</p>
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        <Section title="1-year">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
    );
  }
  return (
    <>
      <div className="cols">
        <Section title="Currency pair">
          <KV
            items={[
              ['Base currency', `${base} — ${base === 'USD' ? 'US Dollar' : (CURRENCY_INFO.get(base)?.name ?? base)}`],
              ['Quote currency', `${quote} — ${quote === 'USD' ? 'US Dollar' : (CURRENCY_INFO.get(quote)?.name ?? quote)}`],
              ['Convention', `${quote} per 1 ${base}`],
              ['Spot', <LivePx key="l" id={sec.id} />],
              ['Day range', `${fmtNum(q.low, sec.dec)} - ${fmtNum(q.high, sec.dec)}`],
              ['52W range', `${fmtNum(rs.lo52, sec.dec)} - ${fmtNum(rs.hi52, sec.dec)}`],
              ['Realised vol 30D / 90D', `${fmtNum(rs.vol30, 2)}% / ${fmtNum(rs.vol90, 2)}%`],
            ]}
          />
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        <Section title={engine.realOnly ? 'Policy rates' : 'Policy rates and forwards'} right={engine.realOnly ? "Central banks' own data" : 'Covered interest parity'}>
          <KV
            items={[
              [`${base} policy rate`, rb != null ? `${fmtNum(rb, 2)}%` : '--'],
              [`${quote} policy rate`, rq != null ? `${fmtNum(rq, 2)}%` : '--'],
            ]}
          />
          {engine.realOnly ? (
            <p className="pad-s muted">Forward points are quoted by dealers and have no free source, so none are shown.</p>
          ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Tenor</th>
                <th className="num">Outright</th>
                <th className="num">Fwd points</th>
              </tr>
            </thead>
            <tbody>
              {[1, 3, 6, 12].map((m) => (
                <tr key={m}>
                  <td className="amber">{m === 12 ? '1Y' : `${m}M`}</td>
                  <td className="num">{fmtNum(fwd(m), sec.dec)}</td>
                  <td className="num">
                    <Chg v={(fwd(m) - q.last) * pip} dec={1} plain />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </Section>
        <Section title="1-year">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['CHART', 'Price graph'], ['INTRADAY', 'Intraday'], ['HISTORY', 'Price table'], ['DEPTH', 'Order book']]} />
    </>
  );
}

function CommodityDES({ sec }: { sec: SecurityDef }) {
  useTick(3);
  const c = sec.cmd!;
  const q = engine.quote(sec.id)!;
  const rs = rangeStats(sec.id);
  // Simulated futures strip: carry by group, contango for most, backwardation for oil when prices are high.
  const carry: Record<string, number> = { Energy: q.last > 80 ? -0.012 : 0.006, 'Precious Metals': 0.0035, 'Base Metals': 0.002, Grains: 0.012, Softs: 0.006, Livestock: -0.004 };
  const k = carry[c.group] ?? 0.004;
  const months = c.months === 'All months' ? 1 : 2;
  return (
    <>
      <div className="cols">
        <Section title="Contract">
          <KV
            items={[
              ['Description', sec.name],
              ['Exchange', c.exch],
              ['Contract size', c.size],
              ['Quoted in', c.unit],
              ['Listed months', c.months],
              ['Group', c.group],
              ['Last', <LivePx key="l" id={sec.id} />],
              ['52W range', `${fmtNum(rs.lo52, sec.dec)} - ${fmtNum(rs.hi52, sec.dec)}`],
              ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
            ]}
          />
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        {engine.realOnly ? (
          <RealStrip sec={sec} />
        ) : (
        <Section title="Futures strip (simulated)" right={k < 0 ? 'Backwardation' : 'Contango'}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Contract</th>
                <th className="num">Price</th>
                <th className="num">Spread to 1st</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, i) => {
                const px = q.last * (1 + k * i * months);
                return (
                  <tr key={i}>
                    <td className="amber">{sec.ticker.replace('1', String(i + 1))} Comdty</td>
                    <td className="num">{fmtNum(px, sec.dec)}</td>
                    <td className="num">
                      <Chg v={px - q.last} dec={sec.dec} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
        )}
        <Section title="1-year">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['CHART', 'Price graph'], ['INTRADAY', 'Intraday'], ['HISTORY', 'Price table'], ['TRADES', 'Time and sales'], ['COMMODITIES', 'Commodity monitor']]} />
    </>
  );
}

/** The listed contract months with their own prices, expiries and open interest (desktop app). */
function RealStrip({ sec }: { sec: SecurityDef }) {
  const root = (sec.yahoo ?? '').replace(/=F$/, '');
  const exch = FUTURES_EXCHANGE[root];
  const contracts = useMemo(() => (exch ? contractSymbols(root, exch, sec.cmd!.months, 12) : []), [root, exch, sec.cmd]);
  const quotes = useYahooQuotes(contracts.map((c) => c.symbol));
  const now = engine.now();
  const rows = contracts
    .map((c) => ({ ...c, q: quotes.get(c.symbol) }))
    .filter((r) => r.q && Number(r.q.regularMarketPrice) > 0 && Date.parse(String(r.q.expireIsoDate ?? '')) >= now - DAY_MS)
    .slice(0, 8);
  const first = Number(rows[0]?.q?.regularMarketPrice);
  const last = Number(rows[rows.length - 1]?.q?.regularMarketPrice);
  const shape = rows.length > 1 ? (last > first ? 'Contango' : last < first ? 'Backwardation' : 'Flat') : '';
  return (
    <Section title="Futures strip" right={shape}>
      {!exch ? (
        <p className="pad-s muted">No contract months listed for this future.</p>
      ) : rows.length === 0 ? (
        <p className="pad-s muted">Loading contract months…</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Contract</th>
              <th className="num">Price</th>
              <th className="num">Chg</th>
              <th className="num">Spread to 1st</th>
              <th className="num hide-m">Expiry</th>
              <th className="num hide-m">Open int</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const px = Number(r.q.regularMarketPrice);
              return (
                <tr key={r.symbol}>
                  <td className="amber" title={r.symbol}>
                    {root} {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][r.month]} {String(r.year).slice(2)}
                  </td>
                  <td className="num">{fmtNum(px, sec.dec)}</td>
                  <td className="num">
                    <Chg v={Number(r.q.regularMarketChange)} dec={sec.dec} />
                  </td>
                  <td className="num">
                    <Chg v={px - first} dec={sec.dec} />
                  </td>
                  <td className="num hide-m">{fmtDay(Date.parse(String(r.q.expireIsoDate)))}</td>
                  <td className="num hide-m">{fmtInt(Number(r.q.openInterest))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function RateDES({ sec }: { sec: SecurityDef }) {
  useTick(3);
  const rs = rangeStats(sec.id);
  const curve = engine.securities.filter((d) => d.curve === sec.curve && d.cls === 'rate').sort((a, b) => a.tenor! - b.tenor!);
  const cb = centralBanks().find((b) => b.country === (sec.country === 'DE' || sec.country === 'FR' || sec.country === 'IT' || sec.country === 'ES' ? 'EZ' : sec.country));
  const method = sec.country === 'US' ? usYieldMethod(sec) : yieldMethod(sec.id);
  return (
    <>
      <div className="cols">
        <Section title="Generic government yield">
          <KV
            items={[
              ['Description', sec.name],
              ['Country', COUNTRY_NAMES[sec.country] ?? sec.country],
              ['Tenor', `${sec.tenor! < 1 ? `${Math.round(sec.tenor! * 12)} months` : `${sec.tenor} years`}`],
              ...(engine.realOnly && method ? ([['Source', method]] as [string, string][]) : []),
              ['Yield', <LivePx key="l" id={sec.id} />],
              ['52W range', `${fmtNum(rs.lo52, 3)} - ${fmtNum(rs.hi52, 3)}`],
              ['Policy rate', cb ? `${fmtNum(cb.rate, 2)}% (${cb.bank})` : '--'],
              ['Spread to policy', cb ? `${fmtNum((engine.quote(sec.id)!.last - cb.rate) * 100, 1)} bp` : '--'],
              ['Yield vol 30D', `${fmtNum(rs.vol30, 1)} bp/yr`],
            ]}
          />
          <Returns id={sec.id} />
        </Section>
        <Section title="Curve points" right="CURVE for the curve chart">
          <table className="tbl">
            <tbody>
              {curve.map((d) => (
                <tr key={d.id} className={d.id === sec.id ? 'sel' : ''}>
                  <td>
                    <SecLink id={d.id}>{d.ticker}</SecLink>
                  </td>
                  <td className="num">
                    <LivePx id={d.id} />
                  </td>
                  <td className="num">
                    <Chg v={engine.quote(d.id)!.chg} bp />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="1-year">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['CHART', 'Yield graph'], ['INTRADAY', 'Intraday'], ['HISTORY', 'History']]} />
    </>
  );
}

function CryptoDES({ sec }: { sec: SecurityDef }) {
  useTick(2);
  const rs = rangeStats(sec.id);
  const q = engine.quote(sec.id)!;
  const s = engine.daily(sec.id);
  let ath = 0;
  let athT = 0;
  for (let i = 0; i < s.length; i++)
    if (s.h[i] > ath) {
      ath = s.h[i];
      athT = s.t[i];
    }
  const cr = sec.cry!;
  const kraken = engine.realOnly && krakenOwns(sec.id);
  const gecko = coinGecko.use((c) => c.coins[sec.id]);
  // Yahoo's quote of the coin (CoinMarketCap's figures), also when Kraken gives the price.
  const yq = yahooQuotes.get(sec.id) ?? cryptoReference.get(sec.id);
  return (
    <>
      <div className="cols">
        <Section title="Digital asset">
          <KV
            items={[
              ['Asset', sec.name.split(' / ')[0]],
              ['Quote currency', 'USD'],
              ['Price', <LivePx key="l" id={sec.id} />],
              [
                'Circulating supply',
                engine.realOnly
                  ? gecko?.supply
                    ? `${fmtBig(gecko.supply)} (CoinGecko)`
                    : Number(yq?.circulatingSupply) > 0
                      ? `${fmtBig(Number(yq!.circulatingSupply))} (Yahoo, CoinMarketCap)`
                      : '--'
                  : fmtBig(cr.supply),
              ],
              [
                'Market value',
                engine.realOnly
                  ? gecko?.marketCap
                    ? `${fmtBig(gecko.marketCap)} (CoinGecko, aggregated)`
                    : Number(yq?.marketCap) > 0
                      ? `${fmtBig(Number(yq!.marketCap))} (Yahoo, CoinMarketCap)`
                      : '--'
                  : fmtBig(q.last * cr.supply),
              ],
              ['Launched', String(cr.launched)],
              [kraken ? 'Day range (UTC day)' : '24h range', `${fmtNum(q.low, sec.dec)} - ${fmtNum(q.high, sec.dec)}`],
              [s.length ? `High since ${fmtDay(s.t[0])}` : 'High', `${fmtNum(ath, sec.dec)}  ${fmtDay(athT)}`],
              ['Drawdown from high', fmtPct((q.last / ath - 1) * 100, 1)],
              ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
              ['Source', kraken ? `Kraken exchange, ${krakenPairFor(sec.id)!.base}/USD (one exchange's market)` : engine.realOnly ? 'Yahoo Finance (CoinMarketCap prices)' : engine.isLive(sec.id) ? `Coinbase ${cr.coinbase}` : 'Simulated'],
            ]}
          />
          {gecko ? <div className="note">Supply and market value: {COINGECKO_ATTRIBUTION}, aggregated across the exchanges it tracks.</div> : null}
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        <Section title="1-year">
          <PriceChartMini sec={sec} bars={365} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['CHART', 'Price graph'], ['INTRADAY', 'Intraday'], ['HISTORY', 'Price table'], ['TRADES', 'Time and sales'], ['DEPTH', 'Order book'], ['CRYPTO', 'Crypto monitor']]} />
    </>
  );
}

function BondDES({ sec }: { sec: SecurityDef }) {
  useTick(3);
  const b = sec.bond!;
  const q = engine.quote(sec.id)!;
  const by = engine.bondYields(sec.id)!;
  const terms = { coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: 2 };
  const settle = settlementDate(new Date(engine.now()));
  const a = bondAnalytics(terms, settle, by.last);
  const issuer = b.issuer ? engine.get(b.issuer) : undefined;
  const govt = sec.yk === 'Govt';
  const bench = b.legs.map((l) => engine.get(l.id)!.ticker).join(' / ');
  const others = issuer ? engine.securities.filter((d) => d.bond?.issuer === b.issuer && d.id !== sec.id) : [];
  return (
    <>
      <div className="cols">
        <Section title="Security">
          <KV
            items={[
              ['Issuer', issuer ? issuer.name : 'United States Treasury'],
              ['Type', govt ? `${sec.tenor}-Year ${sec.tenor! >= 20 ? 'Bond' : 'Note'} (on-the-run)` : 'Fixed-rate bullet, senior notes'],
              ['Seniority', b.seniority ?? 'Govt'],
              ['Rating (composite)', b.rating ?? 'AA+'],
              ['Coupon', `${fmtNum(b.coupon, 3)}% semi-annual`],
              ['Maturity', fmtDay(terms.maturity.getTime(), true)],
              ['Issue date', fmtDay(Date.parse(`${b.issue}T00:00:00Z`), true)],
              ['Amount outstanding', b.amount ? `USD ${fmtInt(b.amount)}MM` : 'n/a'],
              ['Day count', 'ACT/ACT'],
              ['Settlement', `T+1 (${fmtDay(settle.getTime())})`],
            ]}
          />
        </Section>
        <Section title="Pricing">
          <KV
            items={[
              ['Bid / Ask', `${fmtNum(q.bid, 3)} / ${fmtNum(q.ask, 3)}`],
              ['Price', fmtNum(q.last, govt ? 4 : 3)],
              ['Yield', `${fmtNum(by.last, 3)}%`],
              ['Yield change', `${fmtNum((by.last - by.prev) * 100, 1)} bp`],
              ['Benchmark', govt ? 'Generic yield' : `Interpolated UST (${bench})`],
              ['Spread to benchmark', `${fmtNum(by.spread, 1)} bp`],
              ['Accrued', fmtNum(a.accrued, 4)],
              ['Mod. duration', fmtNum(a.modified, 3)],
              ['Convexity', fmtNum(a.convexity, 3)],
              ['DV01 / 1MM', fmtNum(a.dv01 * 10000, 2)],
            ]}
          />
        </Section>
      </div>
      <Section title="Price history">
        <PriceChartMini sec={sec} />
      </Section>
      {others.length > 0 && (
        <Section title={`Other ${issuer!.ticker.split(' ')[0]} bonds`} right="DEBTPROFILE for the full debt distribution">
          <DataTable
            rows={others}
            rowKey={(d) => d.id}
            columns={[
              { key: 't', label: 'Security', render: (d) => <SecLink id={d.id} fn="BONDCALC">{d.ticker}</SecLink> },
              { key: 'p', label: 'Price', num: true, render: (d) => <LivePx id={d.id} /> },
              { key: 'y', label: 'Yield', num: true, render: (d) => fmtNum(engine.bondYields(d.id)!.last, 3) },
              { key: 's', label: 'Spread bp', num: true, render: (d) => fmtNum(engine.bondYields(d.id)!.spread, 0) },
              { key: 'a', label: 'Amt $MM', num: true, render: (d) => fmtInt(d.bond!.amount ?? 0) },
            ]}
          />
        </Section>
      )}
      <RelatedMenu
        sec={sec}
        fns={
          govt
            ? [['BONDCALC', 'Yield analysis'], ['CHART', 'Price graph'], ['HISTORY', 'Price table'], ['DEALERQUOTES', 'All quotes'], ['MONEYMARKET', 'Treasury monitor'], ['CURVE', 'Yield curves']]
            : [['BONDCALC', 'Yield analysis'], ['CHART', 'Price graph'], ['DEALERQUOTES', 'All quotes'], ['DEBTPROFILE', 'Debt distribution'], ['BONDSEARCH', 'Bond search'], ['HISTORY', 'Price table']]
        }
      />
    </>
  );
}

/** Deterministic open interest for a generic future (simulated). */
function openInterest(sec: SecurityDef): number {
  let h = 0;
  for (const ch of sec.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Math.round((sec.adv ?? 0) * (1.3 + (h % 100) / 100));
}

function FutureDES({ sec }: { sec: SecurityDef }) {
  useTick(2);
  const f = sec.fut!;
  const q = engine.quote(sec.id)!;
  const und = engine.get(f.underlying)!;
  const uq = engine.quote(und.id)!;
  const model = engine.futureContract(sec.id)!;
  const notional = q.last * f.multiplier;
  const rs = rangeStats(sec.id);
  // Desktop app: the contract Yahoo actually quotes, its open interest, and fair value from real inputs.
  const c = engine.realOnly ? realFutureContract(sec) : { ...model, oi: openInterest(sec) };
  return (
    <>
      <div className="cols">
        <Section title="Contract">
          <KV
            items={[
              ['Underlying', <SecLink key="u" id={und.id}>{`${und.ticker} Index · ${und.name}`}</SecLink>],
              ['Exchange', f.exch],
              ['Front contract', c.code],
              ['Last trade date', fmtDay(c.expiry * 86_400_000, true)],
              ['Days to expiry', String(c.days)],
              ['Contract size', `${fmtInt(f.multiplier)} ${sec.ccy} x index`],
              ['Tick size / value', `${fmtNum(f.tick, f.tick < 1 ? 2 : 0)} / ${sec.ccy} ${fmtNum(f.tick * f.multiplier, 2)}`],
              ['Contract value', `${sec.ccy} ${fmtInt(notional)}`],
              ['Settlement', 'Cash, final settlement on expiry'],
            ]}
          />
        </Section>
        <Section title="Fair value">
          <KV
            items={[
              ['Last', <LivePx key="l" id={sec.id} />],
              ['Index', <LivePx key="i" id={und.id} />],
              ['Basis (fut - index)', fmtNum(q.last - uq.last, 2)],
              [engine.realOnly ? 'Fair value (model)' : 'Fair value', fmtNum(c.fair, 2)],
              ['Fair carry', fmtNum(c.carry, 2)],
              ['Financing rate', `${fmtNum(c.rate, 3)}%`],
              ['Dividend yield', `${fmtNum(c.q * 100, 2)}%`],
              ['Volume', fmtInt(q.volume)],
              [engine.realOnly ? 'Open interest' : 'Open interest (sim)', fmtInt(c.oi)],
              ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
            ]}
          />
        </Section>
      </div>
      <Section title="1-year price">
        <PriceChartMini sec={sec} />
      </Section>
      <RelatedMenu sec={sec} fns={[['CHART', 'Price graph'], ['INTRADAY', 'Intraday'], ['TRADES', 'Time and sales'], ['DEPTH', 'Market depth'], ['INDEXFUTURES', 'World index futures'], ['HISTORY', 'Price table']]} />
    </>
  );
}

export function DES({ sec }: FnProps) {
  const s = sec!;
  const [tab, setTab] = useState(1);
  const { status } = useFundamentals(s.cls === 'equity' ? s : undefined);
  const tabs = s.cls === 'equity' ? EQUITY_DES_TABS : undefined;
  let body: ReactNode;
  switch (s.cls) {
    case 'equity':
      body = <EquityDES sec={s} tab={tab} />;
      break;
    case 'index':
      body = <IndexDES sec={s} />;
      break;
    case 'fx':
      body = <FxDES sec={s} />;
      break;
    case 'commodity':
      body = <CommodityDES sec={s} />;
      break;
    case 'rate':
      body = <RateDES sec={s} />;
      break;
    case 'crypto':
      body = <CryptoDES sec={s} />;
      break;
    case 'bond':
      // The bond's yield, spread and risk figures would come from a model on hand-written terms: none on real data.
      body = engine.realOnly ? <NoBondNotice /> : <BondDES sec={s} />;
      break;
    case 'future':
      body = <FutureDES sec={s} />;
      break;
  }
  return (
    <div className="fixed-page">
      <FnHeader
        code="PROFILE"
        title={`Security Description: ${CLASS_LABEL[s.cls]}`}
        sec={s}
        sub={
          s.cls === 'equity' ? (
            <>
              {CLASS_LABEL[s.cls]} · {sourceLabel(status, 'company data generated from the profile; real data needs the desktop app')}
            </>
          ) : (
            CLASS_LABEL[s.cls]
          )
        }
        tabs={tabs}
        tab={tab}
        onTab={setTab}
        plainTabs
        paged={!!tabs}
      />
      {body}
      {/* The company's six latest stories under its profile (and under every other security's description). */}
      {engine.realOnly && (s.cls !== 'equity' || tab === 1) ? <LatestNews sec={s} /> : null}
    </div>
  );
}
