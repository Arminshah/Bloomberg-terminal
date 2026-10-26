import { useEffect, useMemo, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { KV, Section } from '../components/cells';
import { DataTable, type Column } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtIso, fmtNum } from '../core/format';
import { createStore } from '../core/store';
import {
  ASSET_TYPES,
  annualLink,
  congressAvailable,
  daysToDisclose,
  DISCLOSURE_DAYS,
  fmpDocId,
  fmpTrade,
  houseTradesOf,
  latestAnnuals,
  memberFinder,
  mostOwned,
  OWNER_TEXT,
  readRate,
  rangeSum,
  recentFilings,
  TYPE_TEXT,
  useCongress,
  type AnnualReport,
  type CongressNeed,
  type HouseFiling,
  type Member,
  type Range,
  type TradeReport,
  type TradeRow,
} from '../data/live/congress';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { Ticker } from './EVTSMarket';

/** The owner has read the law's notice on these reports (5 U.S.C. § 13107(c)); nothing is asked for before. */
const consent = createStore<{ ok: boolean }>({ ok: false }, 'congress-consent', 1);

/** Periods by disclosure date: the latest reports, then up to a year. */
const WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: 'Latest week' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 182, label: '6 months' },
  { days: 365, label: '12 months' },
];
const periodName = (days: number) => WINDOWS.find((w) => w.days === days)?.label.toLowerCase() ?? `${days} days`;

/** What MOST TRADED ranks by. */
const RANKS = { members: 'Members trading', buys: 'Most bought', sells: 'Most sold', net: 'Net bought' } as const;
type Rank = keyof typeof RANKS;
/** What MOST OWNED counts: asset type codes of the annual reports. */
const KINDS: Record<string, { label: string; codes: string[] }> = {
  stocks: { label: 'Stocks', codes: ['ST'] },
  etfs: { label: 'ETFs', codes: ['EF'] },
  funds: { label: 'Mutual funds', codes: ['MF'] },
  all: { label: 'Stocks, ETFs and funds', codes: ['ST', 'EF', 'MF'] },
};

/** "1.00K–15.00K", "85.9M–412.4M", "over 1.00M" for a range without an upper end. */
function rangeText(r: { min: number | null; max: number | null }): string {
  if (r.min == null) return '--';
  if (r.max == null) return `over ${fmtBig(r.min, 2)}`;
  if (r.min === r.max) return fmtBig(r.min, 2);
  return `${fmtBig(r.min, 2)}–${fmtBig(r.max, 2)}`;
}

const isReport = <T,>(x: T | { error: string } | undefined): x is T => !!x && !('error' in (x as object));
const PARTY: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' };

function Party({ p }: { p: string }) {
  return <span className={`party party-${p || 'x'}`} title={PARTY[p] ?? 'Party not in the member lists'}>{p || '?'}</span>;
}

function Link({ href, children }: { href: string; children: string }) {
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span className="muted">{children}</span>;
}

interface MemberRow {
  m: Member;
  filing?: HouseFiling;
  report?: AnnualReport;
  state: 'read' | 'paper' | 'waiting' | 'none' | 'error';
  total: Range | null;
  trades: TradeRow[];
  bought: Range;
  sold: Range;
  last: string;
}

interface StockRow {
  ticker: string;
  name: string;
  members: Set<string>;
  buys: number;
  sells: number;
  bought: Range;
  sold: Range;
  last: string;
}

/** An annual report's total, kept per report: summing every member's assets on each redraw is wasted work. */
const totals = new WeakMap<AnnualReport, Range>();
function totalOf(report: AnnualReport): Range {
  let t = totals.get(report);
  if (!t) totals.set(report, (t = rangeSum(report.assets)));
  return t;
}

const isBuy = (t: TradeRow) => t.type === 'P';
const isSale = (t: TradeRow) => t.type.startsWith('S');

/**
 * CONGRESS, members' trades and holdings from their financial disclosures: representatives ranked by the assets in
 * their latest annual report, every trade disclosed in a period by either chamber, and the stocks traded most.
 * Opened on a stock, it lists that stock's trades.
 */
export function CONGRESS({ sec }: FnProps) {
  const panel = usePanelId();
  const ok = consent.use((s) => s.ok);
  const stockTicker = sec?.cls === 'equity' ? /^(\S+) US$/.exec(sec.ticker)?.[1] ?? '' : '';
  const [tab, setTab] = useState(stockTicker ? 2 : 1);
  const [days, setDays] = useState(90);
  const [chamber, setChamber] = useState<'all' | 'House' | 'Senate'>('all');
  const [party, setParty] = useState('all');
  const [query, setQuery] = useState(stockTicker);
  const [picked, setPicked] = useState('');
  // The member last opened, marked in the list on the way back.
  const [seen, setSeen] = useState('');
  const [rank, setRank] = useState<Rank>('members');
  const [kind, setKind] = useState('stocks');
  const [ownedTicker, setOwnedTicker] = useState('');
  const [assets, setAssets] = useState<'listed' | 'all'>(stockTicker ? 'all' : 'listed');
  const available = congressAvailable();
  const need: CongressNeed = tab === 1 ? 'both' : tab === 4 ? 'annual' : 'ptr';
  const st = useCongress(days, need, ok && available);
  const house = useMemo(() => st.members?.house ?? [], [st.members]);
  const everyone = useMemo(() => [...(st.members?.house ?? []), ...(st.members?.senate ?? [])], [st.members]);
  const find = useMemo(() => memberFinder(house), [house]);

  // Trades: the House's reports read here, FMP's for the Senate and for House reports filed on paper.
  const ptrFilings = useMemo(() => recentFilings(st.index, 'P', days), [st.index, days]);
  const read = useMemo(() => ptrFilings.filter((f) => isReport<TradeReport>(st.ptr[f.docId])), [ptrFilings, st.ptr]);
  const paper = read.filter((f) => (st.ptr[f.docId] as TradeReport).scanned);
  const failed = ptrFilings.filter((f) => st.ptr[f.docId] && !isReport<TradeReport>(st.ptr[f.docId]));
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const trades = useMemo(() => {
    const textRead = new Set(read.filter((f) => !(st.ptr[f.docId] as TradeReport).scanned).map((f) => f.docId));
    const own = read.flatMap((f) => ((st.ptr[f.docId] as TradeReport).scanned ? [] : houseTradesOf(f, st.ptr[f.docId] as TradeReport, find)));
    const fmpRows = [...(st.fmp.senate?.rows ?? []), ...(st.fmp.house?.rows ?? [])]
      .filter((r) => r.disclosureDate >= from && !(r.chamber === 'house' && textRead.has(fmpDocId(r.link ?? ''))))
      .map((r, i) => fmpTrade(r, i, everyone));
    return [...own, ...fmpRows].sort((a, b) => b.filed.localeCompare(a.filed) || b.date.localeCompare(a.date));
  }, [read, st.ptr, st.fmp, from, find, everyone]);
  const q = query.trim().toUpperCase();
  const shown = trades.filter(
    (t) =>
      (assets === 'all' || !!t.ticker) &&
      (chamber === 'all' || t.chamber === chamber) &&
      (party === 'all' || t.party === party) &&
      (!q || t.ticker === q.replace('.', '/') || t.member.toUpperCase().includes(q) || t.asset.toUpperCase().includes(q)),
  );

  // Members: each representative's latest annual report, and their trades in the period.
  const annuals = useMemo(() => (st.members ? latestAnnuals(Object.values(st.index).flat(), house) : new Map<Member, HouseFiling>()), [st.index, st.members, house]);
  const memberRows: MemberRow[] = useMemo(() => {
    const byMember = new Map<string, TradeRow[]>();
    for (const t of trades) {
      if (t.chamber !== 'House' || !t.bioguide) continue;
      const list = byMember.get(t.bioguide);
      if (list) list.push(t);
      else byMember.set(t.bioguide, [t]);
    }
    return house.map((m) => {
        const filing = annuals.get(m);
        const got = filing ? st.annual[filing.docId] : undefined;
        const report = isReport<AnnualReport>(got) && !got.scanned ? got : undefined;
        const state: MemberRow['state'] = !filing ? 'none' : !got ? 'waiting' : !isReport<AnnualReport>(got) ? 'error' : got.scanned ? 'paper' : 'read';
        const mine = (m.bioguide && byMember.get(m.bioguide)) || [];
        return {
          m,
          filing,
          report,
          state,
          total: report ? totalOf(report) : null,
          trades: mine,
          bought: rangeSum(mine.filter(isBuy)),
          sold: rangeSum(mine.filter(isSale)),
          last: mine.reduce((a, t) => (t.date > a ? t.date : a), ''),
        };
      });
  }, [house, annuals, st.annual, trades]);
  const membersShown = memberRows.filter((r) => (party === 'all' || r.m.party === party) && (!q || r.m.name.toUpperCase().includes(q) || r.m.stateDst.includes(q)));
  const annualCount = memberRows.filter((r) => r.filing).length;
  const annualRead = memberRows.filter((r) => r.state === 'read').length;
  const annualPaper = memberRows.filter((r) => r.state === 'paper').length;

  // Stocks: trades with a ticker, by ticker.
  // Worked out only on the tab that shows them: each redraw while reports arrive would redo them otherwise.
  const stocks: StockRow[] = useMemo(() => {
    if (tab !== 3) return [];
    const by = new Map<string, StockRow & { list: TradeRow[] }>();
    for (const t of trades) {
      if (!t.ticker || (chamber !== 'all' && t.chamber !== chamber) || (party !== 'all' && t.party !== party)) continue;
      const s = by.get(t.ticker) ?? { ticker: t.ticker, name: t.asset, members: new Set<string>(), buys: 0, sells: 0, bought: rangeSum([]), sold: rangeSum([]), last: '', list: [] };
      s.members.add(t.member);
      s.list.push(t);
      if (isBuy(t)) s.buys++;
      if (isSale(t)) s.sells++;
      if (t.date > s.last) s.last = t.date;
      by.set(t.ticker, s);
    }
    return [...by.values()].map((s) => ({ ...s, bought: rangeSum(s.list.filter(isBuy)), sold: rangeSum(s.list.filter(isSale)) }));
  }, [tab, trades, chamber, party]);
  const stocksShown = stocks.filter((s) => (!q || s.ticker === q.replace('.', '/') || s.name.toUpperCase().includes(q)) && (rank === 'buys' ? s.buys > 0 : rank === 'sells' ? s.sells > 0 : rank === 'net' ? s.buys !== s.sells : true));

  // Most owned: the securities in the most representatives' latest annual reports.
  const owned = useMemo(
    () => (tab === 4 ? mostOwned(memberRows.filter((r) => r.report && (party === 'all' || r.m.party === party)).map((r) => ({ member: r.m, report: r.report! })), KINDS[kind].codes) : { owned: [], withoutTicker: 0 }),
    [tab, memberRows, party, kind],
  );
  const ownedShown = owned.owned.filter((o) => !q || o.ticker === q.replace('.', '/') || o.name.toUpperCase().includes(q));
  const ownedSel = owned.owned.find((o) => o.ticker === ownedTicker);
  const reportYears = [...new Set(memberRows.filter((r) => r.report).map((r) => r.filing!.year))].sort();

  const sel = memberRows.find((r) => r.m.bioguide === picked);
  // A member opens in place of the list, at its top; back in the list, the member just seen is in sight.
  const top = useRef<HTMLDivElement>(null);
  const openMember = (bioguide: string) => {
    setPicked(bioguide);
    setSeen(bioguide);
    setTab(1);
  };
  const closeMember = () => setPicked('');
  useEffect(() => {
    const el = picked ? top.current : top.current?.querySelector('tr.sel');
    el?.scrollIntoView?.({ block: picked ? 'start' : 'center' });
  }, [picked]);
  const senate = st.fmp.senate;
  // The Senate's trades are FMP's latest lists as the app kept them: none before the first one.
  const senateFrom = senate?.since ?? '';
  const senateShort = chamber !== 'House' && (tab === 2 || tab === 3) && !!senateFrom && senateFrom > from;

  const tradeColumns: Column<TradeRow>[] = [
    { key: 'f', label: 'Disclosed', render: (t) => fmtIso(t.filed), sort: (t) => t.filed },
    { key: 'd', label: 'Traded', render: (t) => fmtIso(t.date), sort: (t) => t.date },
    {
      key: 'm',
      label: 'Member',
      render: (t) =>
        t.chamber === 'House' && t.bioguide ? (
          <button type="button" className="link-btn" title="Open the member's holdings and trades" onClick={(e) => { e.stopPropagation(); openMember(t.bioguide); }}>
            {t.member}
          </button>
        ) : (
          <span className="white">{t.member}</span>
        ),
      sort: (t) => t.member,
    },
    { key: 'p', label: 'Party', render: (t) => <Party p={t.party} />, sort: (t) => t.party },
    { key: 'c', label: 'Seat', hideN: true, render: (t) => <span title={t.chamber}>{t.chamber === 'Senate' ? `Sen. ${t.seat}` : t.seat}</span>, sort: (t) => t.seat },
    { key: 'o', label: 'Owner', hideM: true, render: (t) => OWNER_TEXT[t.owner] ?? t.owner, sort: (t) => t.owner },
    { key: 't', label: 'Ticker', render: (t) => (t.ticker ? <Ticker symbol={t.ticker} /> : ''), sort: (t) => t.ticker },
    { key: 'a', label: 'Asset', render: (t) => <span title={[t.assetType, t.account, t.description].filter(Boolean).join(' · ')}>{t.asset}{t.code === 'OP' ? <span className="amber"> OPT</span> : null}</span>, sort: (t) => t.asset },
    { key: 'y', label: 'Type', render: (t) => <span className={isBuy(t) ? 'up' : isSale(t) ? 'dn' : ''}>{TYPE_TEXT[t.type] ?? t.type}</span>, sort: (t) => t.type },
    { key: 'v', label: 'Amount', num: true, title: 'As disclosed: a range', render: (t) => rangeText(t), sort: (t) => t.min ?? -1 },
    { key: 'l', label: 'Days', num: true, hideM: true, title: `Days from the trade to its disclosure; over ${DISCLOSURE_DAYS} is past the STOCK Act's limit`, render: (t) => { const d = daysToDisclose(t); return Number.isFinite(d) ? <span className={d > DISCLOSURE_DAYS ? 'dn' : ''}>{d}</span> : ''; }, sort: daysToDisclose },
    { key: 's', label: 'Filing', hideN: true, render: (t) => <Link href={t.link}>{t.source === 'FMP' ? 'FMP ›' : 'PDF ›'}</Link>, sort: (t) => t.source },
  ];
  const memberColumns: Column<MemberRow>[] = [
    { key: 'm', label: 'Member', render: (r) => <span className="white">{r.m.name}</span>, sort: (r) => r.m.last },
    { key: 'p', label: 'Party', render: (r) => <Party p={r.m.party} />, sort: (r) => r.m.party },
    { key: 's', label: 'Seat', render: (r) => r.m.stateDst, sort: (r) => r.m.stateDst },
    {
      key: 'a',
      label: 'Assets Reported',
      num: true,
      title: 'The sum of the value ranges in the latest annual report (Schedule A): the lowest and highest totals they allow. Liabilities are not subtracted.',
      render: (r) =>
        r.total ? (
          <span className="white" title={r.total.unknown ? `${r.total.unknown} asset values undetermined` : undefined}>{rangeText(r.total)}{r.total.unknown ? <span className="muted"> +?</span> : null}</span>
        ) : r.state === 'paper' ? (
          <Link href={r.filing ? annualLink(r.filing) : ''}>paper ›</Link>
        ) : r.state === 'waiting' ? (
          <span className="muted">…</span>
        ) : r.state === 'none' ? (
          <span className="muted" title="No annual report of the last two years in the House Clerk's lists (a new member files a candidate report first)">none</span>
        ) : (
          <span className="muted">not read</span>
        ),
      sort: (r) => (r.total ? r.total.min : -1),
    },
    {
      key: 'y',
      label: 'Report For',
      num: true,
      hideN: true,
      title: 'The calendar year the latest annual report covers; its assets are valued at the end of that year. Reports are filed the year after (due 15 May, later with an extension), so those for this year come next year.',
      render: (r) => (r.filing ? <Link href={annualLink(r.filing)}>{String(r.filing.year)}</Link> : ''),
      sort: (r) => r.filing?.year ?? 0,
    },
    { key: 'r', label: 'Filed', hideN: true, title: 'The day the House Clerk received the annual report', render: (r) => fmtIso(r.filing?.filed), sort: (r) => r.filing?.filed ?? '' },
    { key: 'n', label: 'Assets', num: true, hideM: true, render: (r) => (r.report ? fmtNum(r.report.assets.length, 0) : ''), sort: (r) => r.report?.assets.length ?? -1 },
    { key: 't', label: 'Trades', num: true, title: `Trades disclosed in the period (${periodName(days)})`, render: (r) => (r.trades.length ? fmtNum(r.trades.length, 0) : ''), sort: (r) => r.trades.length },
    { key: 'b', label: 'Bought', num: true, hideN: true, render: (r) => (r.bought.count ? <span className="up">{rangeText(r.bought)}</span> : ''), sort: (r) => r.bought.min },
    { key: 'd', label: 'Sold', num: true, hideN: true, render: (r) => (r.sold.count ? <span className="dn">{rangeText(r.sold)}</span> : ''), sort: (r) => r.sold.min },
    { key: 'l', label: 'Last Trade', hideM: true, render: (r) => fmtIso(r.last || undefined), sort: (r) => r.last },
  ];
  const stockColumns: Column<StockRow>[] = [
    { key: 't', label: 'Ticker', render: (s) => <Ticker symbol={s.ticker} />, sort: (s) => s.ticker },
    { key: 'n', label: 'Asset', render: (s) => s.name, sort: (s) => s.name },
    { key: 'm', label: 'Members', num: true, render: (s) => fmtNum(s.members.size, 0), sort: (s) => s.members.size },
    { key: 'b', label: 'Purchases', num: true, render: (s) => (s.buys ? <span className="up">{s.buys}</span> : ''), sort: (s) => s.buys },
    { key: 's', label: 'Sales', num: true, render: (s) => (s.sells ? <span className="dn">{s.sells}</span> : ''), sort: (s) => s.sells },
    { key: 'bv', label: 'Bought', num: true, hideN: true, render: (s) => (s.buys ? rangeText(s.bought) : ''), sort: (s) => s.bought.min },
    { key: 'sv', label: 'Sold', num: true, hideN: true, render: (s) => (s.sells ? rangeText(s.sold) : ''), sort: (s) => s.sold.min },
    { key: 'nt', label: 'Net', num: true, title: 'Purchases less sales, in number of trades', render: (s) => <span className={s.buys > s.sells ? 'up' : s.buys < s.sells ? 'dn' : ''}>{s.buys - s.sells > 0 ? '+' : ''}{s.buys - s.sells}</span>, sort: (s) => s.buys - s.sells },
    { key: 'l', label: 'Last Trade', render: (s) => fmtIso(s.last || undefined), sort: (s) => s.last },
  ];
  const rankSort: Record<Rank, { key: string; dir: 1 | -1 }> = { members: { key: 'm', dir: -1 }, buys: { key: 'b', dir: -1 }, sells: { key: 's', dir: -1 }, net: { key: 'nt', dir: -1 } };
  const ownedColumns: Column<(typeof owned.owned)[number]>[] = [
    { key: 't', label: 'Ticker', render: (o) => <Ticker symbol={o.ticker} />, sort: (o) => o.ticker },
    { key: 'n', label: 'Asset', render: (o) => o.name, sort: (o) => o.name },
    { key: 'h', label: 'Members', num: true, title: 'Representatives whose latest annual report lists it', render: (o) => <span className="white">{o.holders.length}</span>, sort: (o) => o.holders.length },
    { key: 'p', label: 'D · R', num: true, hideN: true, render: (o) => `${o.holders.filter((h) => h.member.party === 'D').length} · ${o.holders.filter((h) => h.member.party === 'R').length}`, sort: (o) => o.holders.filter((h) => h.member.party === 'D').length },
    { key: 'v', label: 'Value Held', num: true, title: 'The holders’ value ranges added up, at the end of the year each report covers', render: (o) => rangeText(o.total), sort: (o) => o.total.min },
    { key: 'b', label: 'Largest Holder', hideM: true, render: (o) => (o.holders[0] ? `${o.holders[0].member.name} (${rangeText(o.holders[0].range)})` : ''), sort: (o) => o.holders[0]?.range.min ?? 0 },
  ];

  const csv = (): (string | number)[][] => {
    if (tab === 1) return [['Member', 'Party', 'Seat', 'Assets Reported Low (USD)', 'Assets Reported High (USD)', 'Undetermined Values', 'Report For', 'Filed', 'Assets', 'Trades in Period'], ...membersShown.map((r) => [r.m.name, r.m.party, r.m.stateDst, r.total?.min ?? '', r.total ? (r.total.max ?? 'open') : '', r.total?.unknown ?? '', r.filing?.year ?? '', r.filing?.filed ?? '', r.report?.assets.length ?? '', r.trades.length])];
    if (tab === 3) return [['Ticker', 'Asset', 'Members', 'Purchases', 'Sales', 'Net', 'Bought Low (USD)', 'Bought High (USD)', 'Sold Low (USD)', 'Sold High (USD)', 'Last Trade'], ...stocksShown.map((x) => [x.ticker, x.name, x.members.size, x.buys, x.sells, x.buys - x.sells, x.bought.min, x.bought.max ?? 'open', x.sold.min, x.sold.max ?? 'open', x.last])];
    if (tab === 4) return [['Ticker', 'Asset', 'Members', 'Democrats', 'Republicans', 'Value Low (USD)', 'Value High (USD)', 'Largest Holder'], ...ownedShown.map((o) => [o.ticker, o.name, o.holders.length, o.holders.filter((h) => h.member.party === 'D').length, o.holders.filter((h) => h.member.party === 'R').length, o.total.min, o.total.max ?? 'open', o.holders[0]?.member.name ?? ''])];
    return [['Disclosed', 'Traded', 'Member', 'Party', 'Chamber', 'Seat', 'Owner', 'Ticker', 'Asset', 'Account', 'Type', 'Amount', 'Low (USD)', 'High (USD)', 'Days to Disclose', 'Source', 'Filing'], ...shown.map((t) => [t.filed, t.date, t.member, t.party, t.chamber, t.seat, OWNER_TEXT[t.owner] ?? t.owner, t.ticker, t.asset, t.account ?? '', TYPE_TEXT[t.type] ?? t.type, t.amount, t.min ?? '', t.max ?? '', daysToDisclose(t), t.source, t.link])];
  };

  // Reading progress: the period's trade reports, and on Members and Most Owned the annual reports too.
  const ptrDone = read.length + failed.length;
  const annualFailed = memberRows.filter((r) => r.state === 'error').length;
  const annualDone = annualRead + annualPaper + annualFailed;
  const indexLoaded = Object.keys(st.index).length > 0;
  const rate = readRate();
  const queued = st.waiting.ptr + st.waiting.annual;
  const eta = queued && rate > 0 ? queued / rate : NaN;
  const etaText = Number.isFinite(eta) ? (eta < 60 ? 'less than a minute left' : `about ${Math.ceil(eta / 60)} min left`) : 'starting';
  const reading: { label: string; done: number; total: number }[] = [
    ...(tab !== 4 && ptrDone < ptrFilings.length ? [{ label: `trade reports of the ${periodName(days)}`, done: ptrDone, total: ptrFilings.length }] : []),
    ...((tab === 1 || tab === 4) && annualCount && annualDone < annualCount ? [{ label: 'annual reports', done: annualDone, total: annualCount }] : []),
  ];

  const body = !available ? (
    <div className="empty">Congress&apos;s disclosures are read by the desktop app: the House Clerk&apos;s reports are PDFs read in its main process.</div>
  ) : !ok ? (
    <Section title="Before reading the disclosures">
      <p className="pad-s">
        Members of Congress disclose their trades and holdings under the Ethics in Government Act. The law (5 U.S.C. § 13107(c)) makes it unlawful to obtain or use
        these reports for any unlawful purpose; for any commercial purpose, other than by news and communications media for dissemination to the general public; to
        determine or establish the credit rating of any individual; or to solicit money for any political, charitable or other purpose. This screen is for your
        own private use.
      </p>
      <p className="pad-s">
        <button type="button" className="btn primary" onClick={() => consent.set({ ok: true })}>
          I understand: read the disclosures
        </button>
      </p>
    </Section>
  ) : (
    <>
      <div className="cg-summary">
        <span>
          <span className="white">{fmtNum(shown.length, 0)}</span> trades disclosed in the {periodName(days)}
          {shown.length !== trades.length ? <span className="muted"> (of {fmtNum(trades.length, 0)}, filtered)</span> : null}
        </span>
        <span>
          <span className="up">{fmtNum(shown.filter(isBuy).length, 0)}</span> purchases · <span className="dn">{fmtNum(shown.filter(isSale).length, 0)}</span> sales
        </span>
        <span>
          <span className="white">{fmtNum(new Set(shown.map((t) => t.bioguide || t.member)).size, 0)}</span> members trading
        </span>
        <span className="muted">
          Senate:{' '}
          {senate?.problem ? (
            <span className="amber">{senate.problem}</span>
          ) : (
            `FMP's latest, kept since ${fmtIso(senate?.since ?? undefined)} (${fmtNum(trades.filter((t) => t.chamber === 'Senate').length, 0)} in the period)`
          )}
        </span>
      </div>
      {!indexLoaded ? (
        <div className="cg-progress" role="status">
          Loading the House Clerk&apos;s list of filings…
        </div>
      ) : reading.length ? (
        reading.map((r) => (
          <div key={r.label} className="cg-progress" role="status">
            <span className="cg-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((100 * r.done) / Math.max(1, r.total))}%` }} />
            </span>
            <span>
              Reading the House&apos;s {r.label}: <span className="white">{fmtNum(r.done, 0)}</span> of {fmtNum(r.total, 0)} · {etaText} · results appear as they are read
            </span>
          </div>
        ))
      ) : (
        <div className="cg-progress muted" role="status">
          {fmtNum(read.length, 0)} House trade reports of the {periodName(days)} read
          {paper.length ? `; ${paper.length} filed on paper are scans, linked only` : ''}
          {failed.length ? `; ${failed.length} could not be read` : ''}
          {(tab === 1 || tab === 4) && annualCount ? `. Annual reports: ${fmtNum(annualRead, 0)} read, ${fmtNum(annualPaper, 0)} on paper` : ''}.
        </div>
      )}
      {st.problems.map((p) => (
        <div key={p} className="note amber" role="status">
          {p}
        </div>
      ))}
      {(senate?.gaps ?? []).filter((g) => g.to >= from).map((g) => (
        <div key={`${g.from}${g.to}`} className="note amber" role="status">
          Senate trades disclosed between {fmtIso(g.from)} and {fmtIso(g.to)} may be missing: FMP&apos;s free list holds the latest 25, and more than that were disclosed before the app asked again.
        </div>
      ))}
      {tab === 1 && (
        <div ref={top}>
          {sel ? (
            <>
              <div className="pad-s">
                <button type="button" className="btn" onClick={closeMember}>
                  ‹ All members
                </button>
              </div>
              <MemberDetail row={sel} tradeColumns={tradeColumns} />
            </>
          ) : (
            <DataTable rows={membersShown} columns={memberColumns} rowKey={(r) => r.m.bioguide || r.m.stateDst} defaultSort={{ key: 'a', dir: -1 }} numbered className="zebra" onRowClick={(r) => r.m.bioguide && openMember(r.m.bioguide)} selected={seen} empty={st.members ? 'No member matches.' : 'Reading the member lists…'} page={{ index: 0, size: 100 }} />
          )}
        </div>
      )}
      {tab === 2 && <DataTable rows={shown} columns={tradeColumns} rowKey={(t) => t.key} defaultSort={{ key: 'f', dir: -1 }} numbered className="zebra" empty={trades.length ? 'No trade matches.' : 'Reading the reports…'} page={{ index: 0, size: 100 }} />}
      {senateShort && (
        <div className="note amber" role="status">
          The Senate&apos;s trades start on {fmtIso(senateFrom)}, when the app first kept FMP&apos;s list: the {periodName(days)} before that have none for the Senate. The list grows every six hours while the app runs.
        </div>
      )}
      {tab === 3 && (
        <DataTable
          key={rank}
          rows={stocksShown}
          columns={stockColumns}
          rowKey={(s) => s.ticker}
          defaultSort={rankSort[rank]}
          numbered
          className="zebra"
          onRowClick={(s) => {
            setQuery(s.ticker);
            setTab(2);
          }}
          empty="No trade with a ticker in the period."
        />
      )}
      {tab === 4 &&
        (chamber === 'Senate' ? (
          <div className="empty">Senators&apos; holdings are in their annual reports on the Senate&apos;s disclosure site, which refuses automated reading, and FMP&apos;s free plan does not include them. Most Owned covers the House.</div>
        ) : (
          <>
            <p className="pad-s muted">
              {KINDS[kind].label} in representatives&apos; latest annual reports ({reportYears.length ? `for ${reportYears.join(' and ')}` : 'reading…'}), {fmtNum(memberRows.filter((r) => r.report).length, 0)} reports read; value at the end of the year each report covers.
              {owned.withoutTicker ? ` ${fmtNum(owned.withoutTicker, 0)} holdings named without a ticker are left out.` : ''}
            </p>
            <DataTable rows={ownedShown} columns={ownedColumns} rowKey={(o) => o.ticker} defaultSort={{ key: 'h', dir: -1 }} numbered className="zebra" onRowClick={(o) => setOwnedTicker(o.ticker === ownedTicker ? '' : o.ticker)} selected={ownedTicker} empty="No holding read yet." page={{ index: 0, size: 300 }} />
            {ownedSel && (
              <Section title={`${ownedSel.ticker}: ${ownedSel.holders.length} holders`}>
                <DataTable
                  rows={ownedSel.holders}
                  columns={[
                    { key: 'm', label: 'Member', render: (h) => <span className="white">{h.member.name}</span>, sort: (h) => h.member.last },
                    { key: 'p', label: 'Party', render: (h) => <Party p={h.member.party} />, sort: (h) => h.member.party },
                    { key: 's', label: 'Seat', render: (h) => h.member.stateDst, sort: (h) => h.member.stateDst },
                    { key: 'v', label: 'Value', num: true, render: (h) => rangeText(h.range), sort: (h) => h.range.min },
                  ]}
                  rowKey={(h) => h.member.bioguide}
                  defaultSort={{ key: 'v', dir: -1 }}
                  className="zebra"
                />
              </Section>
            )}
          </>
        ))}
      <p className="pad-s muted">
        From the members&apos; own disclosures. Representatives: the House Clerk&apos;s index and each report as filed electronically, read here; reports filed on paper
        are scans and are linked only (FMP lists some of their trades). Senators: the Senate&apos;s disclosure site refuses automated reading, so their trades are FMP&apos;s
        list of the latest 25, kept by the app since it first asked. Amounts are disclosed as ranges and totals are ranges too. Assets are the values of the latest
        annual report&apos;s Schedule A at the end of the year it covers, liabilities not subtracted; an open range (&quot;over&quot;) has no upper end. A year&apos;s
        annual reports are filed the year after, by 15 May or later with an extension, so this year&apos;s holdings are reported next year. Click a member for
        their holdings and trades. Most Owned counts the
        representatives whose latest annual report lists a security; senators&apos; annual reports cannot be read. The STOCK Act asks
        for a trade to be disclosed within {DISCLOSURE_DAYS} days. Party and seat from the House Clerk&apos;s and the Senate&apos;s member lists. For private use only (5
        U.S.C. § 13107(c)).
      </p>
    </>
  );

  return (
    <div>
      <FnHeader
        code="CONGRESS"
        title="Congress Trading"
        sec={sec}
        tabs={[
          { n: 1, label: 'Members' },
          { n: 2, label: 'Trades' },
          { n: 3, label: 'Most Traded' },
          { n: 4, label: 'Most Owned' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `congress_${['members', 'trades', 'most_traded', 'most_owned'][tab - 1]}.csv`, csv)}
        controls={
          ok && available ? (
            <div className="chart-tools">
              <label className="fld">
                Period
                <select className="sel-inp" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {WINDOWS.map((w) => (
                    <option key={w.days} value={w.days}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              {(tab === 1 || tab === 2) && (
                <label className="fld">
                  Assets
                  <select className="sel-inp" aria-label="Assets" value={assets} onChange={(e) => setAssets(e.target.value as typeof assets)}>
                    <option value="listed">With a ticker</option>
                    <option value="all">Everything</option>
                  </select>
                </label>
              )}
              {tab === 3 && (
                <label className="fld">
                  Rank
                  <select className="sel-inp" aria-label="Rank" value={rank} onChange={(e) => setRank(e.target.value as Rank)}>
                    {Object.entries(RANKS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {tab === 4 && (
                <label className="fld">
                  Holdings
                  <select className="sel-inp" aria-label="Holdings" value={kind} onChange={(e) => setKind(e.target.value)}>
                    {Object.entries(KINDS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="fld">
                Chamber
                <select className="sel-inp" aria-label="Chamber" value={chamber} onChange={(e) => setChamber(e.target.value as typeof chamber)}>
                  <option value="all">Both</option>
                  <option value="House">House</option>
                  <option value="Senate">Senate</option>
                </select>
              </label>
              <label className="fld">
                Party
                <select className="sel-inp" aria-label="Party" value={party} onChange={(e) => setParty(e.target.value)}>
                  <option value="all">All</option>
                  <option value="D">Democrats</option>
                  <option value="R">Republicans</option>
                  <option value="I">Independents</option>
                </select>
              </label>
              <input className="inp" style={{ width: 170 }} placeholder="Ticker, member or asset" aria-label="Filter" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          ) : undefined
        }
      />
      {body}
    </div>
  );
}

function MemberDetail({ row, tradeColumns }: { row: MemberRow; tradeColumns: Column<TradeRow>[] }) {
  const assets = row.report?.assets ?? [];
  const assetColumns: Column<(typeof assets)[number]>[] = [
    { key: 'a', label: 'Asset', render: (a) => <span title={[a.account, a.description, a.location].filter(Boolean).join(' · ')}>{a.name}</span>, sort: (a) => a.name },
    { key: 't', label: 'Ticker', render: (a) => (a.ticker && ['ST', 'OP', 'EF', 'MF', 'RE'].includes(a.code) ? <Ticker symbol={a.ticker} /> : a.ticker), sort: (a) => a.ticker },
    { key: 'k', label: 'Type', render: (a) => ASSET_TYPES[a.code] ?? a.code, sort: (a) => a.code },
    { key: 'o', label: 'Owner', render: (a) => OWNER_TEXT[a.owner] ?? a.owner, sort: (a) => a.owner },
    { key: 'v', label: 'Value', num: true, render: (a) => (a.min == null ? <span className="muted">{a.value || '--'}</span> : rangeText(a)), sort: (a) => a.min ?? -1 },
  ];
  return (
    <Section title={`${row.m.name} (${row.m.party}-${row.m.stateDst})`}>
      <KV
        items={[
          ['Annual report', row.filing ? <a key="r" href={annualLink(row.filing)} target="_blank" rel="noreferrer">{`${row.filing.year}, filed ${fmtIso(row.filing.filed)}${row.filing.type === 'A' ? ' (amendment)' : ''}`}</a> : 'none in the last two years'],
          ['Assets reported', row.total ? `${rangeText(row.total)} in ${row.total.count} assets${row.total.unknown ? `, ${row.total.unknown} undetermined` : ''}` : '--'],
          ['Trades in the period', fmtNum(row.trades.length, 0)],
        ]}
      />
      {assets.length > 0 && <DataTable rows={assets} columns={assetColumns} rowKey={(_a, i) => String(i)} defaultSort={{ key: 'v', dir: -1 }} className="zebra" page={{ index: 0, size: 200 }} />}
      {row.trades.length > 0 && <DataTable rows={row.trades} columns={tradeColumns} rowKey={(t) => t.key} defaultSort={{ key: 'f', dir: -1 }} className="zebra" />}
    </Section>
  );
}
