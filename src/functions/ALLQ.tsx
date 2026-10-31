import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { SimBadge } from '../components/Source';
import { fmtDay, fmtInt, fmtNum, fmtTime } from '../core/format';
import { hashString, normal } from '../core/rng';
import { engine, useTick } from '../data/market';
import { fedinvest, fedInvestAvailable, loadFedInvest, treasuryIdByCusip, type FedDay, type FedRow } from '../data/live/fedinvest';
import { settlementDate, to32nds, yieldFromClean } from '../finance/bonds';
import type { SecurityDef } from '../data/types';
import { parseMspd, useFiscal } from '../data/live/fiscal';
import type { FnProps } from '../terminal/types';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';

/** One line of the montage: a source's bid and ask, or a single price (End of Day, the day before). */
export interface QuoteLine {
  pcs: string;
  firm: string;
  title?: string;
  bid: number;
  ask: number;
  /** Sizes in thousands; none gives "x" as the frame does for a line without them. */
  bsz?: number;
  asz?: number;
  /** The two lines above the dealers are amber (TE07 04:17). */
  lead?: boolean;
  time?: number;
}

/** A benchmark the spreads are measured against: the latest issue of each standard tenor. */
export interface Benchmark {
  id: string;
  tenor: number;
  maturity: string;
  bid: number;
  ask: number;
}

const TENORS = [2, 3, 5, 7, 10, 20, 30];

const YEAR_MS = 365.25 * 86_400_000;
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / YEAR_MS;

/**
 * The latest issue of each standard tenor. With issue dates (the Treasury's debt statement), a tenor's candidates are
 * the notes and bonds first issued for that term (maturity less first issue within about three months of it), and the
 * newest wins; a security on the price list but not yet on the statement was issued after it, so it counts as the
 * newest when its remaining life fits the tenor. Without them, the one maturing last within the tenor's years, which
 * can pick an older, longer issue that happens to mature that day.
 */
export function onTheRun<T extends { maturity: string }>(rows: T[], asOf: string, issueOf?: (r: T) => string | undefined): { tenor: number; row: T }[] {
  const [y, m, d] = asOf.split('-').map(Number);
  const out: { tenor: number; row: T }[] = [];
  for (const tenor of TENORS) {
    let best: T | undefined;
    let bestAt = '';
    for (const r of rows) {
      let at: string;
      if (issueOf) {
        const issue = issueOf(r);
        if (issue) {
          if (Math.abs(yearsBetween(issue, r.maturity) - tenor) > 0.25) continue;
          at = issue;
        } else {
          const left = yearsBetween(asOf, r.maturity);
          if (left > tenor + 0.05 || left < tenor - 0.5) continue;
          at = asOf;
        }
      } else {
        const limit = new Date(Date.UTC(y + tenor, m - 1, d + 15)).toISOString().slice(0, 10);
        if (r.maturity > limit) continue;
        at = r.maturity;
      }
      if (!best || at > bestAt || (at === bestAt && r.maturity > best.maturity)) {
        best = r;
        bestAt = at;
      }
    }
    if (best && !out.some((o) => o.row === best)) out.push({ tenor, row: best });
  }
  return out;
}

/** The benchmark nearest the bond's maturity, other than the bond itself. */
export function nearestBenchmark(benches: Benchmark[], self: string, maturity: string): Benchmark | undefined {
  const t = Date.parse(maturity);
  return benches.filter((b) => b.id !== self).sort((a, b) => Math.abs(Date.parse(a.maturity) - t) - Math.abs(Date.parse(b.maturity) - t))[0];
}

function termsOf(sec: SecurityDef) {
  return { coupon: sec.bond!.coupon, maturity: new Date(`${sec.bond!.maturity}T00:00:00Z`), freq: 2 as const };
}

/** ALLQ: every source's bid and ask for a bond, laid out as TE07 04:17. */
export function ALLQ(props: FnProps) {
  if (engine.realOnly) return <AllqTreasury {...props} />;
  return <AllqDemo {...props} />;
}

// ---------------------------------------------------------------- desktop

/** The desktop app: a Treasury's prices from FedInvest; dealer quotes have no free source. */
function AllqTreasury({ sec }: FnProps) {
  const s = sec!;
  const st = fedinvest.use((x) => x);
  useEffect(() => {
    if (fedInvestAvailable() && st.state === 'off') void loadFedInvest();
  }, [st.state]);
  // The debt statement's issue dates tell the latest issue of each tenor from older ones maturing the same day.
  const { mspd } = useFiscal();
  const issues = useMemo(() => {
    const debt = mspd?.state === 'ok' && mspd.text ? parseMspd(mspd.text) : null;
    return debt && !('error' in debt) ? new Map(debt.securities.map((x) => [x.cusip, x.issue])) : undefined;
  }, [mspd]);
  const cusip = s.alias?.find((a) => treasuryIdByCusip(a) === s.id);
  const row = cusip ? st.latest?.rows.get(cusip) : undefined;
  if (!row || !st.latest) {
    return (
      <AllqLayout
        sec={s}
        lines={[]}
        benches={[]}
        settle={new Date(engine.now())}
        status={st.state === 'loading' ? "Loading the Treasury's prices from FedInvest…" : st.state === 'error' ? `FedInvest unavailable: ${st.error}` : 'ALLQ in the desktop app shows US Treasuries from FedInvest; dealer quotes for other bonds have no free source.'}
        empty
      />
    );
  }
  const prev = st.prev?.rows.get(row.cusip);
  const settle = settlementDate(new Date(`${st.latest.date}T00:00:00Z`));
  const lines: QuoteLine[] = [
    { pcs: 'TSY', firm: 'FedInvest Sell / Buy', title: `TreasuryDirect FedInvest, prices of ${fmtDay(Date.parse(st.latest.date))}: Sell as the bid, Buy as the ask`, bid: row.sell, ask: row.buy, lead: true },
  ];
  if (Number.isFinite(row.eod)) lines.push({ pcs: '', firm: 'End of Day', title: "FedInvest's end-of-day price", bid: row.eod, ask: NaN, lead: true });
  if (prev && st.prev) lines.push({ pcs: '', firm: `Previous Day (${fmtDay(Date.parse(st.prev.date))})`, title: `FedInvest, prices of ${fmtDay(Date.parse(st.prev.date))}`, bid: prev.sell, ask: prev.buy, lead: true });
  const benches = fedBenchmarks(st.latest, issues);
  return <AllqLayout sec={s} lines={lines} benches={benches} settle={settle} status={`FedInvest prices of ${fmtDay(Date.parse(st.latest.date))}`} note="Dealer quotes have no free source: the lines are the Treasury's own FedInvest prices." />;
}

function fedBenchmarks(day: FedDay, issues?: Map<string, string>): Benchmark[] {
  const rows = [...day.rows.values()].filter((r: FedRow) => (r.type === 'Notes' || r.type === 'Bonds') && Number.isFinite(r.sell));
  return onTheRun(rows, day.date, issues ? (r) => issues.get(r.cusip) || undefined : undefined)
    .map(({ tenor, row }) => ({ id: treasuryIdByCusip(row.cusip) ?? '', tenor, maturity: row.maturity, bid: row.sell, ask: row.buy }))
    .filter((b) => b.id);
}

// ---------------------------------------------------------------- demo

const DEALERS = ['NGAT', 'HRBR', 'BLWT', 'KSTR', 'MRDN', 'SMMT', 'ATLS', 'CRST'];
const DEALER_NAMES: Record<string, string> = {
  NGAT: 'Northgate Securities', HRBR: 'Harbor Capital Markets', BLWT: 'Bluewater Fixed Income', KSTR: 'Kestrel Capital',
  MRDN: 'Meridian Credit', SMMT: 'Summit Dealer Services', ATLS: 'Atlas Markets', CRST: 'Crestline Partners',
};

/** The browser demo: fictional dealers quoting around the simulated price, said so. */
function AllqDemo({ sec }: FnProps) {
  useTick(2);
  const s = sec!;
  const q = engine.quote(s.id)!;
  const govt = s.yk === 'Govt';
  const half = govt ? 1 / 256 : 0.0625;
  const minute = Math.floor(engine.now() / 60_000);
  const seed = hashString(s.id);
  const dealers = useMemo(() => {
    return DEALERS.map((dl, i) => {
      const k = hashString(dl);
      // Each dealer re-quotes every few minutes around the composite.
      const epoch = Math.floor((minute + (k % 7)) / (3 + (k % 4)));
      // Skew stays inside the minimum half-width, so no dealer's bid can cross another's offer.
      const skew = Math.max(-0.35, Math.min(0.35, normal(seed ^ k, epoch, 1) * 0.25)) * half;
      const width = half * (0.85 + Math.abs(normal(seed ^ k, epoch, 2)));
      const mid = q.last + skew;
      const sizeBase = govt ? 25_000 : 2_000;
      const bsz = Math.max(1, Math.round((sizeBase * Math.exp(0.6 * normal(seed ^ k, epoch, 3))) / 100) * 100);
      const asz = Math.max(1, Math.round((sizeBase * Math.exp(0.6 * normal(seed ^ k, epoch, 4))) / 100) * 100);
      const t = (epoch * (3 + (k % 4)) - (k % 7)) * 60_000 + ((i * 7919) % 60_000);
      return { pcs: dl, firm: DEALER_NAMES[dl], bid: mid - width, ask: mid + width, bsz, asz, time: Math.min(t, engine.now()) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, s.id, Math.round(q.last / half)]);
  const bestBid = Math.max(...dealers.map((x) => x.bid));
  const bestAsk = Math.min(...dealers.map((x) => x.ask));
  const lines: QuoteLine[] = [
    { pcs: 'CMPS', firm: 'Composite', title: 'Best bid and best offer of the dealers below', bid: bestBid, ask: bestAsk, lead: true },
    { pcs: '', firm: 'Last', title: 'The simulated last price', bid: q.last, ask: NaN, lead: true },
    ...dealers,
  ];
  // The demo's Treasuries carry their tenor; each is its tenor's benchmark.
  const benches: Benchmark[] = engine.securities
    .filter((d) => d.cls === 'bond' && d.yk === 'Govt' && d.tenor && d.bond)
    .map((d) => {
      const px = engine.quote(d.id)?.last ?? NaN;
      return { id: d.id, tenor: d.tenor!, maturity: d.bond!.maturity, bid: px - 1 / 256, ask: px + 1 / 256 };
    })
    .sort((a, b) => a.tenor - b.tenor);
  return <AllqLayout sec={s} lines={lines} benches={benches} settle={settlementDate(new Date(engine.now()))} status={fmtTime(engine.now(), true)} demo />;
}

// ---------------------------------------------------------------- layout

function AllqLayout({ sec, lines, benches, settle, status, note, empty, demo }: { sec: SecurityDef; lines: QuoteLine[]; benches: Benchmark[]; settle: Date; status: string; note?: string; empty?: boolean; demo?: boolean }) {
  const panel = usePanelId();
  const [benchId, setBenchId] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [showYield, setShowYield] = useState(false);
  const govt = sec.yk === 'Govt';
  const px = (v: number) => (!Number.isFinite(v) ? '' : govt ? to32nds(v) : fmtNum(v, 3));
  const terms = sec.bond ? termsOf(sec) : null;
  const y = (v: number) => (terms ? yieldFromClean(terms, settle, v) : NaN);
  const auto = sec.bond ? nearestBenchmark(benches, sec.id, sec.bond.maturity) : undefined;
  const bench = benches.find((b) => b.id === benchId) ?? auto;
  const benchDef = bench ? engine.get(bench.id) : undefined;
  const by = (v: number) => (benchDef?.bond ? yieldFromClean(termsOf(benchDef), settle, v) : NaN);
  const benchBidY = bench ? by(bench.bid) : NaN;
  const benchAskY = bench ? by(bench.ask) : NaN;
  const second = (l: QuoteLine, side: 'bid' | 'ask') => {
    const v = side === 'bid' ? l.bid : l.ask;
    if (!Number.isFinite(v)) return NaN;
    const yy = y(v);
    return showYield ? yy : (yy - (side === 'bid' ? benchBidY : benchAskY)) * 100;
  };
  const fmtSecond = (v: number) => (!Number.isFinite(v) ? '' : showYield ? fmtNum(v, 3) : fmtNum(v, 1));
  const lead = lines.filter((l) => l.lead);
  let dealers = lines.filter((l) => !l.lead);
  const bestBid = Math.max(...dealers.map((l) => l.bid));
  const bestAsk = Math.min(...dealers.map((l) => l.ask));
  // Split Bid/Offer: the bids best first beside the offers best first, each side with its own dealer.
  const bids = [...dealers].sort((a, b) => b.bid - a.bid);
  const asks = [...dealers].sort((a, b) => a.ask - b.ask);
  dealers = bids;
  return (
    <div className="allq">
      <FnHeader
        code="DEALERQUOTES"
        title="All Quotes"
        sec={sec}
        actions={[
          { n: 9901, bare: true, label: 'Request Access', onClick: () => {}, menu: [{ label: 'No dealer is connected: dealer quotes have no free source', disabled: true, onClick: () => {} }] },
          {
            n: 9902,
            bare: true,
            label: 'Settings',
            onClick: () => {},
            menu: [
              { label: showYield ? 'Show Bid Spd / Ask Spd' : 'Show Bid Yld / Ask Yld', onClick: () => setShowYield((v) => !v) },
              { label: 'Yield and Spread Analysis (YAS)', sep: true, onClick: () => execute(panel, `${sec.id} YAS`) },
            ],
          },
        ]}
      />
      <div className="allq-status">
        <span className="allq-clock" data-testid="allq-status">‖ {status}</span>
        {demo ? <span className="allq-demo"><SimBadge /> dealers and their quotes are generated</span> : null}
        <label className="chk" title="Dealer axes have no free source"><input type="checkbox" disabled /> ALLX</label>
        <label className="chk" title="Dealer axes have no free source"><input type="checkbox" disabled /> Overlay Axe Size</label>
        <label className="chk"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Split Bid/Offer</label>
      </div>
      <div className="allq-bench">
        <span className="amber">{showYield ? 'Yields' : 'Spreads vs'}</span>
        <select className="sel-inp allq-bench-pick" aria-label="Benchmark" value={bench?.id ?? ''} onChange={(e) => setBenchId(e.target.value)} disabled={!benches.length}>
          {benches.length ? null : <option value="">No benchmark</option>}
          {benches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id} ({b.tenor}Y)
            </option>
          ))}
        </select>
        {bench ? (
          <>
            <span className="amber">@</span>
            <span className="allq-src">{demo ? 'DEMO' : 'FedInvest'}</span>
            <span className="white">{to32nds(bench.bid)} / {to32nds(bench.ask)}</span>
            <span className="white">{fmtNum(benchBidY, 3)} / {fmtNum(benchAskY, 3)}</span>
          </>
        ) : null}
      </div>
      <table className="tbl allq-tbl" data-testid="allq-table">
        <thead>
          <tr>
            <th>PCS</th>
            <th>Firm Name</th>
            <th className="num">Bid Px / Ask Px</th>
            <th className="num">{showYield ? 'Bid Yld / Ask Yld' : 'Bid Spd / Ask Spd'}</th>
            <th className="num">BSz(M) x ASz(M)</th>
            <th className="num hide-m">Time</th>
          </tr>
        </thead>
        <tbody>
          {lead.map((l, i) => (
            <tr key={`lead-${i}`} className="allq-lead" title={l.title}>
              <td className="amber">{l.pcs}</td>
              <td className="amber">{l.firm}</td>
              <td className="num amber">{Number.isFinite(l.ask) ? `${px(l.bid)} / ${px(l.ask)}` : px(l.bid)}</td>
              <td className="num amber">{Number.isFinite(l.ask) ? `${fmtSecond(second(l, 'bid'))} / ${fmtSecond(second(l, 'ask'))}` : fmtSecond(second(l, 'bid'))}</td>
              <td className="num amber">{l.bsz ? `${fmtInt(l.bsz)} x ${fmtInt(l.asz ?? 0)}` : 'x'}</td>
              <td className="num hide-m muted">{l.time ? fmtTime(l.time, false) : ''}</td>
            </tr>
          ))}
          {dealers.map((l, i) => {
            const a = split ? asks[i] : l;
            return (
              <tr key={`${l.pcs}-${i}`} data-testid="allq-dealer">
                <td className="white">{split ? `${l.pcs} / ${a.pcs}` : l.pcs}</td>
                <td className="white">{split ? `${l.firm} / ${a.firm}` : l.firm}</td>
                <td className="num">
                  <span className={l.bid === bestBid ? 'up' : 'amber'}>{px(l.bid)}</span>
                  <span className="amber"> / </span>
                  <span className={a.ask === bestAsk ? 'dn' : 'amber'}>{px(a.ask)}</span>
                </td>
                <td className="num white">
                  {fmtSecond(second(l, 'bid'))} / {fmtSecond(second(a, 'ask'))}
                </td>
                <td className="num amber">
                  {fmtInt(l.bsz ?? 0)} x {fmtInt(a.asz ?? 0)}
                </td>
                <td className="num hide-m muted">{l.time ? fmtTime(l.time, false) : ''}</td>
              </tr>
            );
          })}
          {!demo ? (
            <tr>
              <td colSpan={6} className="muted allq-none">
                {empty ? status : note}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="pad-s muted">
        {showYield ? 'Yields' : 'Spreads in basis points: the line’s yield less the benchmark’s on the same side'}, each from its price to settlement on {fmtDay(settle.getTime())}. {demo ? 'Best bid in green, best offer in red. The dealers are fictional and their quotes simulated around the composite price.' : 'Sizes are not published (x).'}
      </p>
    </div>
  );
}
