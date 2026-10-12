import { useMemo, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Sparkline } from '../components/Sparkline';
import { Chg, HBar, KV, LivePx, SecLink, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { fmtBig, fmtDay, fmtEarnDate, fmtInt, fmtMln, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { marketCapUsd, periodChange, rangeStats } from '../data/analytics';
import { consensus, dividends, earningsHistory, estimates, financials, holders, keyStats, nextEarnings, reportCcy, revenueMix } from '../data/fundamentals';
import { centralBanks, COUNTRY_NAMES } from '../data/eco';
import { CURRENCY_INFO } from '../data/universe';
import { analytics as bondAnalytics, settlementDate } from '../finance/bonds';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps, MenuItem } from '../terminal/types';
import { CLASS_LABEL } from '../data/registry';
import { getRealFund, useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

function RelatedMenu({ sec, fns }: { sec: SecurityDef; fns: [string, string][] }) {
  const panel = usePanelId();
  const items: MenuItem[] = useMemo(
    () => fns.map(([code, label], i) => ({ n: 21 + i, label, run: () => execute(panel, `${sec.id} ${code}`) })),
    [fns, panel, sec.id],
  );
  useMenu('des-related', items);
  return (
    <Section title="Related functions" right="Type the number and <GO>">
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
  const hs = ['1D', '5D', '1M', '3M', 'YTD', '1Y', '5Y'] as const;
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

function EquityProfile({ sec }: { sec: SecurityDef }) {
  useTick(5);
  const eq = sec.eq!;
  const ks = keyStats(sec);
  const rs = rangeStats(sec.id);
  const ne = nextEarnings(sec);
  const c = consensus(sec);
  const nextDiv = dividends(sec).filter((d) => d.ex >= engine.today * 86_400_000).pop();
  const real = getRealFund(sec.id);
  const mix = real ? [] : revenueMix(sec);
  const ccy = reportCcy(sec);
  return (
    <>
      <div className="cols">
        <Section title="Company">
          <p className="prose">{eq.desc}</p>
          <KV
            items={[
              ['Sector', eq.sector],
              ['Industry', eq.industry],
              ['Headquarters', eq.hq],
              ['Chief executive', eq.ceo ?? '--'],
              ['Founded', eq.founded ? String(eq.founded) : '--'],
              ['Employees', eq.emp > 0 ? fmtInt(eq.emp) : '--'],
              ['Fiscal year end', ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][eq.fye - 1]],
              ['Primary exchange', sec.exch ?? '--'],
            ]}
          />
        </Section>
        <Section title="Price" right={sec.ccy}>
          <Range52 sec={sec} />
          <KV
            items={[
              ['Last', <LivePx key="l" id={sec.id} />],
              ['52W high', `${fmtNum(rs.hi52, sec.dec)}  ${fmtDay(rs.hi52t)}`],
              ['52W low', `${fmtNum(rs.lo52, sec.dec)}  ${fmtDay(rs.lo52t)}`],
              ['Market cap', `${fmtMln(ks.mcap)} ${ccy}`],
              ['Mkt cap (USD)', fmtBig(marketCapUsd(sec.id))],
              ['Enterprise value', Number.isFinite(ks.ev) ? `${fmtMln(ks.ev)} ${ccy}` : 'n/m (financial)'],
              ['Shares out', fmtMln(eq.shares)],
              ['Avg volume 30D', fmtBig(rs.avgVol30)],
              ['Beta vs local index', fmtNum(eq.beta, 2)],
              ['Volatility 30D / 260D', `${fmtNum(rs.vol30, 1)}% / ${fmtNum(rs.vol260, 1)}%`],
            ]}
          />
          <Returns id={sec.id} />
        </Section>
        <Section title="Valuation and earnings">
          <KV
            items={[
              ['P/E (LTM)', fmtNum(ks.pe, 1)],
              ['P/E (BF FY1)', fmtNum(ks.fpe, 1)],
              ['Price / book', fmtNum(ks.pb, 2)],
              ['Price / sales', fmtNum(ks.ps, 2)],
              ['EV / EBITDA', fmtNum(ks.evEbitda, 1)],
              ['Dividend yield', fmtPct(ks.divYld, 2, false)],
              ['Payout ratio', fmtPct(ks.payout, 1, false)],
              ['Next ex-dividend', nextDiv ? `${fmtDay(nextDiv.ex)} (${nextDiv.type === 'Projected' ? 'proj.' : 'decl.'})` : sec.eq!.dps > 0 ? '--' : 'None'],
              ['EPS LTM', `${fmtNum(ks.epsLtm, 2)} ${ccy}`],
              ['EPS est. FY1 / FY2', `${fmtNum(ks.epsFy1, 2)} / ${fmtNum(ks.epsFy2, 2)}`],
              ['Next earnings', ne ? fmtEarnDate(ne) : '--'],
              ['ROE', fmtPct(ks.roe, 1, false)],
              ['Net margin', fmtPct(ks.netMargin, 1, false)],
            ]}
          />
          <div className="pad-s">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="amber">Analyst rating</span>
              <span className="white">
                {fmtNum(c.score, 2)} / 5 · target {fmtNum(c.avg, sec.dec)} · {c.n} analysts
              </span>
            </div>
            <div style={{ display: 'flex', height: 12, marginTop: 4 }}>
              <div style={{ flex: c.buy, background: 'var(--up)' }} title={`Buy ${c.buy}`} />
              <div style={{ flex: c.hold, background: '#c9a227' }} title={`Hold ${c.hold}`} />
              <div style={{ flex: c.sell || 0.0001, background: 'var(--dn)' }} title={`Sell ${c.sell}`} />
            </div>
            <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 'var(--fs-s)' }}>
              <span>Buy {c.buy}</span>
              <span>Hold {c.hold}</span>
              <span>Sell {c.sell}</span>
            </div>
          </div>
        </Section>
      </div>
      <div className="cols">
        <Section title="1-year price" right="GP for the full chart">
          <PriceChartMini sec={sec} />
        </Section>
        {real ? (
          <Section title="Ownership" right="HDS for holders">
            <KV
              items={[
                ['Insiders', fmtPct(real.breakdown?.insiders, 2, false)],
                ['Institutions', fmtPct(real.breakdown?.institutions, 2, false)],
                ['Institutions, % of float', fmtPct(real.breakdown?.institutionsFloat, 2, false)],
                ['Institutional holders', fmtInt(real.breakdown?.count)],
                ['Largest holder', real.holders[0] ? `${real.holders[0].name} (${fmtNum(real.holders[0].pct, 2)}%)` : '--'],
              ]}
            />
          </Section>
        ) : (
        <Section title="Revenue by region" right={<span className="badge sim">SIMULATED</span>}>
          <table className="tbl">
            <tbody>
              {mix.map((m) => (
                <tr key={m.region}>
                  <td style={{ width: 90 }}>{m.region}</td>
                  <td>
                    <HBar value={m.pct} max={100} color="var(--amber)" />
                  </td>
                  <td className="num" style={{ width: 60 }}>
                    {fmtNum(m.pct, 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        )}
      </div>
      <RelatedMenu
        sec={sec}
        fns={[
          ['GP', 'Price graph'], ['GIP', 'Intraday'], ['FA', 'Financials'], ['ANR', 'Analysts'], ['EE', 'Earnings'], ['DVD', 'Dividends'],
          ['HDS', 'Holders'], ['RV', 'Relative value'], ['CN', 'Company news'], ['OMON', 'Options'], ['BQ', 'Quote'], ['HP', 'Price table'],
        ]}
      />
    </>
  );
}

function EquityFinSummary({ sec }: { sec: SecurityDef }) {
  const f = financials(sec);
  const rows: [string, (p: ReturnType<typeof financials>['ltm']) => number, number?][] = [
    ['Revenue', (p) => p.rev], ['Gross profit', (p) => p.gp], ['Operating income', (p) => p.opInc], ['EBITDA', (p) => p.ebitda],
    ['Net income', (p) => p.ni], ['Diluted EPS', (p) => p.eps, 2], ['Free cash flow', (p) => p.fcf], ['Total debt', (p) => p.debt],
    ['Shareholders equity', (p) => p.equity],
  ];
  const cols = [...f.annual.slice(-4), f.ltm];
  return (
    <Section title={`Financial summary (${reportCcy(sec)} millions)`} right="FA for full statements">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.label} className="num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, dec]) => (
              <tr key={label}>
                <td className="amber">{label}</td>
                {cols.map((c) => (
                  <td key={c.label} className="num">
                    {fmtNum(get(c), dec ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function EquityEstimates({ sec }: { sec: SecurityDef }) {
  const e = estimates(sec);
  const hist = earningsHistory(sec).filter((x) => x.actual != null).slice(-4);
  return (
    <div className="cols">
      <Section title="Consensus estimates">
        <table className="tbl">
          <thead>
            <tr>
              <th>Period</th>
              <th className="num">EPS</th>
              <th className="num">High</th>
              <th className="num">Low</th>
              <th className="num">Revenue</th>
              <th className="num">Growth</th>
              <th className="num"># Est</th>
            </tr>
          </thead>
          <tbody>
            {[e.nq, e.fy1, e.fy2].map((x) => (
              <tr key={x.label}>
                <td className="amber">{x.label}</td>
                <td className="num white">{fmtNum(x.eps, 2)}</td>
                <td className="num">{fmtNum(x.epsHi, 2)}</td>
                <td className="num">{fmtNum(x.epsLo, 2)}</td>
                <td className="num">{fmtMln(x.rev)}</td>
                <td className="num">
                  <Chg v={x.growth} pct dec={1} />
                </td>
                <td className="num">{fmtInt(x.analysts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Recent surprises" right="EE for history">
        <table className="tbl">
          <thead>
            <tr>
              <th>Period</th>
              <th>Date</th>
              <th className="num">Est</th>
              <th className="num">Actual</th>
              <th className="num">Surprise</th>
            </tr>
          </thead>
          <tbody>
            {hist.map((x) => (
              <tr key={`${x.period}:${x.date}`}>
                <td className="amber">{x.period}</td>
                <td>{fmtEarnDate(x, false)}</td>
                <td className="num">{fmtNum(x.estimate, 2)}</td>
                <td className="num white">{fmtNum(x.actual, 2)}</td>
                <td className="num">
                  {x.surprise != null ? <Chg v={x.surprise} pct dec={1} /> : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function EquityOwnership({ sec }: { sec: SecurityDef }) {
  // Fund filings overlap with their managers' 13F positions, so the summary counts managers only.
  const h = holders(sec).filter((x) => x.type !== 'Fund').slice(0, 10);
  const inst = h.reduce((s, x) => s + x.pct, 0);
  return (
    <Section title="Top institutional holders" right={`Top 10 hold ${fmtNum(inst, 1)}%`}>
      <DataTable
        rows={h}
        rowKey={(r) => r.name}
        numbered
        columns={[
          { key: 'n', label: 'Holder', render: (r) => r.name },
          { key: 'p', label: '% Out', num: true, render: (r) => fmtNum(r.pct, 2) },
          { key: 's', label: 'Position', num: true, render: (r) => fmtBig(r.shares) },
          { key: 'c', label: 'Change', num: true, render: (r) => <Chg v={r.change / 1e6} dec={2} /> },
        ]}
      />
    </Section>
  );
}

function IndexDES({ sec }: { sec: SecurityDef }) {
  useTick(5);
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
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        <Section title="1-year price">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      {members.length > 0 && sec.ticker !== 'VIX' && (
        <Section title="Members in the Armin universe" right={`${members.length} securities`}>
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
      <RelatedMenu sec={sec} fns={[['GP', 'Price graph'], ['GIP', 'Intraday'], ['HP', 'Price table'], ['COMP', 'Comparative returns'], ['OMON', 'Options'], ['BETA', 'Beta']]} />
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
        <Section title="Policy rates and forwards" right="Covered interest parity">
          <KV
            items={[
              [`${base} policy rate`, rb != null ? `${fmtNum(rb, 2)}%` : '--'],
              [`${quote} policy rate`, rq != null ? `${fmtNum(rq, 2)}%` : '--'],
            ]}
          />
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
        </Section>
        <Section title="1-year">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['GP', 'Price graph'], ['GIP', 'Intraday'], ['HP', 'Price table'], ['DEPTH', 'Order book']]} />
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
        <Section title="1-year">
          <PriceChartMini sec={sec} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['GP', 'Price graph'], ['GIP', 'Intraday'], ['HP', 'Price table'], ['TAS', 'Time and sales'], ['GLCO', 'Commodity monitor']]} />
    </>
  );
}

function RateDES({ sec }: { sec: SecurityDef }) {
  useTick(3);
  const rs = rangeStats(sec.id);
  const curve = engine.securities.filter((d) => d.curve === sec.curve && d.cls === 'rate').sort((a, b) => a.tenor! - b.tenor!);
  const cb = centralBanks().find((b) => b.country === (sec.country === 'DE' || sec.country === 'FR' || sec.country === 'IT' || sec.country === 'ES' ? 'EZ' : sec.country));
  return (
    <>
      <div className="cols">
        <Section title="Generic government yield">
          <KV
            items={[
              ['Description', sec.name],
              ['Country', COUNTRY_NAMES[sec.country] ?? sec.country],
              ['Tenor', `${sec.tenor! < 1 ? `${Math.round(sec.tenor! * 12)} months` : `${sec.tenor} years`}`],
              ['Yield', <LivePx key="l" id={sec.id} />],
              ['52W range', `${fmtNum(rs.lo52, 3)} - ${fmtNum(rs.hi52, 3)}`],
              ['Policy rate', cb ? `${fmtNum(cb.rate, 2)}% (${cb.bank})` : '--'],
              ['Spread to policy', cb ? `${fmtNum((engine.quote(sec.id)!.last - cb.rate) * 100, 1)} bp` : '--'],
              ['Yield vol 30D', `${fmtNum(rs.vol30, 1)} bp/yr`],
            ]}
          />
          <Returns id={sec.id} />
        </Section>
        <Section title="Curve points" right="GC for the curve chart">
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
      <RelatedMenu sec={sec} fns={[['GP', 'Yield graph'], ['GIP', 'Intraday'], ['HP', 'History']]} />
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
  return (
    <>
      <div className="cols">
        <Section title="Digital asset">
          <KV
            items={[
              ['Asset', sec.name.split(' / ')[0]],
              ['Quote currency', 'USD'],
              ['Price', <LivePx key="l" id={sec.id} />],
              ['Circulating supply', fmtBig(cr.supply)],
              ['Market value', fmtBig(q.last * cr.supply)],
              ['Launched', String(cr.launched)],
              ['24h range', `${fmtNum(q.low, sec.dec)} - ${fmtNum(q.high, sec.dec)}`],
              ['High (10Y window)', `${fmtNum(ath, sec.dec)}  ${fmtDay(athT)}`],
              ['Drawdown from high', fmtPct((q.last / ath - 1) * 100, 1)],
              ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
              ['Live feed', engine.isLive(sec.id) ? `Coinbase ${cr.coinbase}` : 'Simulated'],
            ]}
          />
          <Range52 sec={sec} />
          <Returns id={sec.id} />
        </Section>
        <Section title="1-year">
          <PriceChartMini sec={sec} bars={365} />
        </Section>
      </div>
      <RelatedMenu sec={sec} fns={[['GP', 'Price graph'], ['GIP', 'Intraday'], ['HP', 'Price table'], ['TAS', 'Time and sales'], ['DEPTH', 'Order book'], ['CRYP', 'Crypto monitor']]} />
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
        <Section title={`Other ${issuer!.ticker.split(' ')[0]} bonds`} right="DDIS for the full debt distribution">
          <DataTable
            rows={others}
            rowKey={(d) => d.id}
            columns={[
              { key: 't', label: 'Security', render: (d) => <SecLink id={d.id} fn="YAS">{d.ticker}</SecLink> },
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
            ? [['YAS', 'Yield analysis'], ['GP', 'Price graph'], ['HP', 'Price table'], ['ALLQ', 'All quotes'], ['BTMM', 'Treasury monitor'], ['GC', 'Yield curves']]
            : [['YAS', 'Yield analysis'], ['GP', 'Price graph'], ['ALLQ', 'All quotes'], ['DDIS', 'Debt distribution'], ['SRCH', 'Bond search'], ['HP', 'Price table']]
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
  const c = engine.futureContract(sec.id)!;
  const notional = q.last * f.multiplier;
  const rs = rangeStats(sec.id);
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
              ['Fair value', fmtNum(c.fair, 2)],
              ['Fair carry', fmtNum(c.carry, 2)],
              ['Financing rate', `${fmtNum(c.rate, 3)}%`],
              ['Dividend yield', `${fmtNum(c.q * 100, 2)}%`],
              ['Volume', fmtInt(q.volume)],
              ['Open interest (sim)', fmtInt(openInterest(sec))],
              ['Realised vol 30D', `${fmtNum(rs.vol30, 1)}%`],
            ]}
          />
        </Section>
      </div>
      <Section title="1-year price">
        <PriceChartMini sec={sec} />
      </Section>
      <RelatedMenu sec={sec} fns={[['GP', 'Price graph'], ['GIP', 'Intraday'], ['TAS', 'Time and sales'], ['DEPTH', 'Market depth'], ['WEIF', 'World index futures'], ['HP', 'Price table']]} />
    </>
  );
}

export function DES({ sec }: FnProps) {
  const s = sec!;
  const [tab, setTab] = useState(1);
  const { status } = useFundamentals(s.cls === 'equity' ? s : undefined);
  const tabs = s.cls === 'equity' ? [{ n: 1, label: 'Profile' }, { n: 2, label: 'Financials' }, { n: 3, label: 'Estimates' }, { n: 4, label: 'Ownership' }] : undefined;
  let body: ReactNode;
  switch (s.cls) {
    case 'equity':
      body = tab === 1 ? <EquityProfile sec={s} /> : tab === 2 ? <EquityFinSummary sec={s} /> : tab === 3 ? <EquityEstimates sec={s} /> : <EquityOwnership sec={s} />;
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
      body = <BondDES sec={s} />;
      break;
    case 'future':
      body = <FutureDES sec={s} />;
      break;
  }
  return (
    <div>
      <FnHeader
        code="DES"
        title="Description"
        sec={s}
        sub={
          s.cls === 'equity' ? (
            <>
              {s.name} · {CLASS_LABEL[s.cls]} · {sourceLabel(status, 'company data generated from the profile; real data needs the desktop app')}
            </>
          ) : (
            `${s.name} · ${CLASS_LABEL[s.cls]}`
          )
        }
        tabs={tabs}
        tab={tab}
        onTab={setTab}
      />
      <QuoteStrip sec={s} />
      {body}
    </div>
  );
}
