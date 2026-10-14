import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtDay, fmtInt, fmtNum, fmtTime } from '../core/format';
import { hashString, normal } from '../core/rng';
import { engine, useTick } from '../data/market';
import { resolveSecurity } from '../data/registry';
import type { SecurityDef } from '../data/types';
import { analytics, settlementDate, yieldFromClean } from '../finance/bonds';
import { usePanelId } from '../terminal/panel';
import { openSecurity } from '../components/cells';
import { NoBondData, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';
import type { FnProps } from '../terminal/types';

const RATING_ORDER = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-'];

function bonds(): SecurityDef[] {
  return engine.securities.filter((d) => d.cls === 'bond');
}

const years = (d: SecurityDef) => (Date.parse(`${d.bond!.maturity}T00:00:00Z`) - engine.now()) / (365.25 * 86_400_000);

function issuerOf(d: SecurityDef): string {
  return d.bond!.issuer ? engine.get(d.bond!.issuer)!.name : 'United States Treasury';
}

function issuerRoot(d: SecurityDef): string {
  return d.yk === 'Govt' ? 'T' : d.ticker.split(' ')[0];
}

/** Parses "AAPL CORP", "T GOVT" or "IBM" into an issuer root and sector. */
function parseIssuer(args: string | undefined, sec?: SecurityDef): { root: string; yk: 'Corp' | 'Govt' | 'All' } {
  if (sec?.cls === 'bond') return { root: issuerRoot(sec), yk: sec.yk === 'Govt' ? 'Govt' : 'Corp' };
  if (sec?.cls === 'equity') return { root: sec.ticker.split(' ')[0], yk: 'Corp' };
  const t = (args ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  let yk: 'Corp' | 'Govt' | 'All' = 'All';
  if (t.length && (t[t.length - 1] === 'CORP' || t[t.length - 1] === 'GOVT')) yk = t.pop() === 'CORP' ? 'Corp' : 'Govt';
  let root = t.join(' ');
  if (yk === 'Govt' && ['T', 'US', 'UST', 'TSY'].includes(root)) root = 'T';
  return { root, yk };
}

function matchesIssuer(d: SecurityDef, root: string): boolean {
  if (!root) return true;
  if (d.yk === 'Govt') return ['T', 'US', 'UST', 'TREASURY'].includes(root) || 'UNITED STATES TREASURY'.includes(root);
  const r = issuerRoot(d);
  return r === root || issuerOf(d).toUpperCase().includes(root);
}

interface Row {
  d: SecurityDef;
  y: number;
  spread: number;
  dur: number;
  yrs: number;
}

function rowsFor(list: SecurityDef[]): Row[] {
  const settle = settlementDate(new Date(engine.now()));
  return list.map((d) => {
    const by = engine.bondYields(d.id)!;
    const b = d.bond!;
    const a = analytics({ coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: 2 }, settle, by.last);
    return { d, y: by.last, spread: by.spread, dur: a.modified, yrs: years(d) };
  });
}

/** SRCH: fixed income search with issuer, sector, rating, maturity and coupon filters. */
export function SRCH(props: FnProps) {
  if (engine.realOnly) return <NoBondData code="BONDSEARCH" title="Fixed Income Search" />;
  return <SRCHSim {...props} />;
}

function SRCHSim({ route, sec }: FnProps) {
  useTick(3);
  const init = parseIssuer(route.args, sec);
  const [issuer, setIssuer] = useState(init.root);
  const [tab, setTab] = useState(init.yk === 'Corp' ? 2 : init.yk === 'Govt' ? 3 : 1);
  const [minRating, setMinRating] = useState('BB-');
  const [matFrom, setMatFrom] = useState('');
  const [matTo, setMatTo] = useState('');
  const [cpnMin, setCpnMin] = useState('');
  const yk = tab === 2 ? 'Corp' : tab === 3 ? 'Govt' : 'All';
  const list = bonds().filter((d) => {
    if (yk !== 'All' && d.yk !== yk) return false;
    if (!matchesIssuer(d, issuer.trim().toUpperCase())) return false;
    const r = RATING_ORDER.indexOf(d.bond!.rating ?? 'AA+');
    if (r > RATING_ORDER.indexOf(minRating)) return false;
    const yr = years(d);
    if (matFrom && yr < Number(matFrom)) return false;
    if (matTo && yr > Number(matTo)) return false;
    if (cpnMin && d.bond!.coupon < Number(cpnMin)) return false;
    return true;
  });
  const rows = rowsFor(list);
  return (
    <div>
      <FnHeader
        code="BONDSEARCH"
        title="Fixed Income Search"
        sub={
          <>
            {rows.length} securities match · <SimBadge /> bond prices{desktopData() ? ' modelled off the real Treasury curve plus an issuer spread' : ''}
          </>
        }
        tabs={[
          { n: 1, label: 'All' },
          { n: 2, label: 'Corporates' },
          { n: 3, label: 'Treasuries' },
        ]}
        tab={tab}
        onTab={setTab}
      />
      <div className="chart-tools">
        <label className="fld">
          Issuer
          <input className="inp" style={{ width: 110 }} value={issuer} placeholder="Ticker or name" onChange={(e) => setIssuer(e.target.value.toUpperCase())} />
        </label>
        <label className="fld">
          Min rating
          <select className="inp" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
            {RATING_ORDER.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="fld">
          Maturity (yrs)
          <input className="inp" style={{ width: 48 }} value={matFrom} placeholder="from" inputMode="decimal" onChange={(e) => setMatFrom(e.target.value)} />
          <input className="inp" style={{ width: 48 }} value={matTo} placeholder="to" inputMode="decimal" onChange={(e) => setMatTo(e.target.value)} />
        </label>
        <label className="fld">
          Min coupon
          <input className="inp" style={{ width: 52 }} value={cpnMin} inputMode="decimal" onChange={(e) => setCpnMin(e.target.value)} />
        </label>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.d.id}
        numbered
        defaultSort={{ key: 'm', dir: 1 }}
        empty="No bonds match. Clear a filter or try another issuer (AAPL, JPM, T)."
        columns={[
          { key: 't', label: 'Security', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink>, sort: (r) => r.d.ticker },
          { key: 'i', label: 'Issuer', hideM: true, render: (r) => <span className="ellipsis" style={{ maxWidth: 200, display: 'inline-block' }}>{issuerOf(r.d)}</span>, sort: (r) => issuerOf(r.d) },
          { key: 'c', label: 'Cpn', num: true, render: (r) => fmtNum(r.d.bond!.coupon, 3), sort: (r) => r.d.bond!.coupon },
          { key: 'm', label: 'Maturity', render: (r) => fmtDay(Date.parse(`${r.d.bond!.maturity}T00:00:00Z`)), sort: (r) => r.yrs },
          { key: 'r', label: 'Rtg', render: (r) => r.d.bond!.rating ?? '', sort: (r) => RATING_ORDER.indexOf(r.d.bond!.rating ?? 'AA+') },
          { key: 'a', label: 'Amt $MM', num: true, hideM: true, render: (r) => fmtInt(r.d.bond!.amount ?? 0), sort: (r) => r.d.bond!.amount ?? 0 },
          { key: 'p', label: 'Price', num: true, render: (r) => <LivePx id={r.d.id} />, sort: (r) => engine.quote(r.d.id)!.last },
          { key: 'y', label: 'Yield', num: true, render: (r) => fmtNum(r.y, 3), sort: (r) => r.y },
          { key: 's', label: 'Sprd bp', num: true, render: (r) => fmtNum(r.spread, 0), sort: (r) => r.spread },
          { key: 'd', label: 'Mod dur', num: true, hideM: true, render: (r) => fmtNum(r.dur, 2), sort: (r) => r.dur },
        ]}
      />
    </div>
  );
}

/** DDIS: an issuer's debt distribution by maturity. */
export function DDIS(props: FnProps) {
  if (engine.realOnly) return <NoBondData code="DEBTPROFILE" title="Debt Distribution" />;
  return <DDISSim {...props} />;
}

function DDISSim({ route, sec }: FnProps) {
  useTick(5);
  const panel = usePanelId();
  const { root } = parseIssuer(route.args, sec);
  const target = root || 'AAPL';
  const list = bonds().filter((d) => matchesIssuer(d, target) && (target === 'T' ? d.yk === 'Govt' : d.yk === 'Corp'));
  const rows = rowsFor(list).sort((a, b) => a.yrs - b.yrs);
  const eq = target !== 'T' ? resolveSecurity(target, 'Equity') : undefined;
  const total = rows.reduce((s, r) => s + (r.d.bond!.amount ?? 0), 0);
  const wCpn = rows.reduce((s, r) => s + r.d.bond!.coupon * (r.d.bond!.amount ?? 0), 0) / (total || 1);
  const wYrs = rows.reduce((s, r) => s + r.yrs * (r.d.bond!.amount ?? 0), 0) / (total || 1);
  const wSprd = rows.reduce((s, r) => s + r.spread * (r.d.bond!.amount ?? 0), 0) / (total || 1);
  // Bucket amounts by maturity year.
  const byYear = new Map<number, number>();
  for (const r of rows) {
    const y = Number(r.d.bond!.maturity.slice(0, 4));
    byYear.set(y, (byYear.get(y) ?? 0) + (r.d.bond!.amount ?? 0));
  }
  const yearsList = [...byYear.keys()].sort((a, b) => a - b);
  const maxAmt = Math.max(1, ...byYear.values());
  if (rows.length === 0) {
    return (
      <div>
        <FnHeader code="DEBTPROFILE" title="Debt Distribution" />
        <p className="pad">
          No bonds for <span className="yellow">{target}</span> in the Armin universe. Issuers covered: {[...new Set(bonds().filter((d) => d.yk === 'Corp').map(issuerRoot))].join(', ')} and US Treasuries (T).
        </p>
      </div>
    );
  }
  return (
    <div>
      <FnHeader code="DEBTPROFILE" title="Debt Distribution" sec={eq} sub={`${rows[0] ? issuerOf(rows[0].d) : target} · bonds in the Armin universe`} />
      <div className="cols">
        <Section title="Summary">
          <KV
            items={[
              ['Issuer', rows[0] ? issuerOf(rows[0].d) : target],
              ['Bonds', String(rows.length)],
              ['Amount outstanding', `USD ${fmtInt(total)}MM`],
              ['Weighted avg coupon', `${fmtNum(wCpn, 3)}%`],
              ['Weighted avg life', `${fmtNum(wYrs, 1)} years`],
              ['Weighted avg spread', `${fmtNum(wSprd, 0)} bp`],
              ['Composite rating', rows[0].d.bond!.rating ?? 'AA+'],
            ]}
          />
          {eq && (
            <div className="pad row">
              <button type="button" className="btn" onClick={() => openSecurity(panel, eq.id, undefined, 'PROFILE')}>
                Equity profile
              </button>
              <button type="button" className="btn" onClick={() => openSecurity(panel, eq.id, undefined, 'MENU')}>
                Equity menu
              </button>
            </div>
          )}
        </Section>
        <Section title="Maturity profile (USD MM)">
          <div className="ddis-bars" role="img" aria-label="Amount outstanding by maturity year">
            {yearsList.map((y) => (
              <div key={y} className="ddis-col" title={`${y}: ${fmtInt(byYear.get(y)!)}MM`}>
                <span className="ddis-amt">{fmtInt(byYear.get(y)!)}</span>
                <span className="ddis-bar" style={{ height: `${(byYear.get(y)! / maxAmt) * 100}%` }} />
                <span className="ddis-yr">{String(y).slice(2)}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.d.id}
        columns={[
          { key: 't', label: 'Security', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink> },
          { key: 'sn', label: 'Seniority', hideM: true, render: (r) => r.d.bond!.seniority ?? '' },
          { key: 'a', label: 'Amt $MM', num: true, render: (r) => fmtInt(r.d.bond!.amount ?? 0), sort: (r) => r.d.bond!.amount ?? 0 },
          { key: 'pct', label: '% of total', num: true, hideM: true, render: (r) => fmtNum(((r.d.bond!.amount ?? 0) / total) * 100, 1), sort: (r) => r.d.bond!.amount ?? 0 },
          { key: 'p', label: 'Price', num: true, render: (r) => <LivePx id={r.d.id} /> },
          { key: 'y', label: 'Yield', num: true, render: (r) => fmtNum(r.y, 3), sort: (r) => r.y },
          { key: 's', label: 'Sprd bp', num: true, render: (r) => fmtNum(r.spread, 0), sort: (r) => r.spread },
        ]}
      />
    </div>
  );
}

const DEALERS = ['NGAT', 'HRBR', 'BLWT', 'KSTR', 'MRDN', 'SMMT', 'ATLS', 'CRST'];
const DEALER_NAMES: Record<string, string> = {
  NGAT: 'Northgate Securities', HRBR: 'Harbor Capital Markets', BLWT: 'Bluewater Fixed Income', KSTR: 'Kestrel Capital',
  MRDN: 'Meridian Credit', SMMT: 'Summit Dealer Services', ATLS: 'Atlas Markets', CRST: 'Crestline Partners',
};

/** ALLQ: dealer quote montage for a bond (simulated dealers). */
export function ALLQ(props: FnProps) {
  if (engine.realOnly) return <NoBondData code="DEALERQUOTES" title="All Quotes" />;
  return <ALLQSim {...props} />;
}

function ALLQSim({ sec }: FnProps) {
  useTick(2);
  const s = sec!;
  const q = engine.quote(s.id)!;
  const b = s.bond!;
  const terms = { coupon: b.coupon, maturity: new Date(`${b.maturity}T00:00:00Z`), freq: 2 };
  const settle = settlementDate(new Date(engine.now()));
  const govt = s.yk === 'Govt';
  const half = govt ? 1 / 256 : 0.0625;
  const minute = Math.floor(engine.now() / 60_000);
  const seed = hashString(s.id);
  const quotes = useMemo(() => {
    return DEALERS.map((dl, i) => {
      const k = hashString(dl);
      // Each dealer re-quotes every few minutes around the composite.
      const epoch = Math.floor((minute + (k % 7)) / (3 + (k % 4)));
      // Skew stays inside the minimum half-width, so no dealer's bid can cross another's offer.
      const skew = Math.max(-0.35, Math.min(0.35, normal(seed ^ k, epoch, 1) * 0.25)) * half;
      const width = half * (0.85 + Math.abs(normal(seed ^ k, epoch, 2)));
      const mid = q.last + skew;
      const bid = mid - width;
      const ask = mid + width;
      const sizeBase = govt ? 25 : 2;
      const bsz = Math.max(1, Math.round(sizeBase * Math.exp(0.6 * normal(seed ^ k, epoch, 3))));
      const asz = Math.max(1, Math.round(sizeBase * Math.exp(0.6 * normal(seed ^ k, epoch, 4))));
      const t = (epoch * (3 + (k % 4)) - (k % 7)) * 60_000 + (i * 7919) % 60_000;
      return { dl, bid, ask, bsz, asz, t: Math.min(t, engine.now()) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, s.id, Math.round(q.last / half)]);
  const bestBid = Math.max(...quotes.map((x) => x.bid));
  const bestAsk = Math.min(...quotes.map((x) => x.ask));
  const y = (px: number) => yieldFromClean(terms, settle, px);
  const dec = govt ? 4 : 3;
  return (
    <div>
      <FnHeader
        code="DEALERQUOTES"
        title="All Quotes"
        sec={s}
        sub={
          <>
            {s.name} · <SimBadge /> dealer montage: dealers and their quotes are generated
          </>
        }
      />
      <div className="cols">
        <Section title="Composite">
          <KV
            items={[
              ['Best bid / ask', `${fmtNum(bestBid, dec)} / ${fmtNum(bestAsk, dec)}`],
              ['Best bid / ask yield', `${fmtNum(y(bestBid), 3)} / ${fmtNum(y(bestAsk), 3)}`],
              ['Composite mid', fmtNum((bestBid + bestAsk) / 2, dec)],
              ['Last', <LivePx key="l" id={s.id} />],
              ['Contributors', String(quotes.length)],
            ]}
          />
        </Section>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Dealer</th>
            <th className="hide-m">Name</th>
            <th className="num">Bid</th>
            <th className="num">Ask</th>
            <th className="num">Bid yld</th>
            <th className="num">Ask yld</th>
            <th className="num">Bid sz MM</th>
            <th className="num">Ask sz MM</th>
            <th className="num hide-m">Time</th>
          </tr>
        </thead>
        <tbody>
          {quotes
            .sort((a, z) => z.bid - a.bid)
            .map((x) => (
              <tr key={x.dl}>
                <td className="amber b">{x.dl}</td>
                <td className="hide-m">{DEALER_NAMES[x.dl]}</td>
                <td className={`num ${x.bid === bestBid ? 'up b' : 'white'}`}>{fmtNum(x.bid, dec)}</td>
                <td className={`num ${x.ask === bestAsk ? 'dn b' : 'white'}`}>{fmtNum(x.ask, dec)}</td>
                <td className="num">{fmtNum(y(x.bid), 3)}</td>
                <td className="num">{fmtNum(y(x.ask), 3)}</td>
                <td className="num">{fmtInt(x.bsz)}</td>
                <td className="num">{fmtInt(x.asz)}</td>
                <td className="num hide-m">{fmtTime(x.t, false)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="pad-s muted">Best bid in green, best offer in red. Dealers are fictional and quotes are simulated around the composite price.</p>
    </div>
  );
}
