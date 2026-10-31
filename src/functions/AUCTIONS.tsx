import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable, type Column } from '../components/DataTable';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum } from '../core/format';
import { newYorkDate } from '../data/eco';
import { auctionName, share, useAuctions, type Auction, type AuctionKind } from '../data/live/auctions';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const TABS: { n: number; label: string; kind?: AuctionKind }[] = [
  { n: 1, label: 'Notes & Bonds', kind: 'coupon' },
  { n: 2, label: 'Bills', kind: 'bill' },
  { n: 3, label: 'TIPS', kind: 'tips' },
  { n: 4, label: 'FRNs', kind: 'frn' },
  { n: 5, label: 'Upcoming' },
];

/** What a kind's result is: a yield for notes and bonds (a real yield for TIPS), a discount rate for bills, a margin for FRNs. */
const HIGH: Record<AuctionKind, string> = { coupon: 'High Yld', bill: 'High Rate', tips: 'High Real Yld', frn: 'High Margin' };

const day = (iso: string) => (iso ? fmtDay(Date.parse(`${iso}T00:00:00Z`)) : '');
const billions = (v: number) => fmtNum(v / 1e9, 1);

/** Announced and not yet held (New York date): the Upcoming tab. A past auction whose result the source lacks stays with its kind, its result blank. */
export const isUpcoming = (a: Auction, today: string) => a.upcoming && a.auction >= today;

/** AUCTIONS (AUCR): the Treasury's auctions with their results, by kind, and those announced. */
export function AUCTIONS(_: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const { state, auctions, problems } = useAuctions();
  const t = TABS.find((x) => x.n === tab) ?? TABS[0];
  const today = newYorkDate(Date.now());
  const rows = t.kind
    ? auctions.filter((a) => a.kind === t.kind && !isUpcoming(a, today))
    : auctions.filter((a) => isUpcoming(a, today)).sort((a, b) => a.auction.localeCompare(b.auction) || a.term.localeCompare(b.term));
  const oldest = auctions.reduce((m, a) => (a.source === 'Fiscal Data' && (!m || a.auction < m) ? a.auction : m), '');
  const kind = t.kind ?? 'coupon';
  const results: Column<Auction>[] = [
    { key: 'date', label: 'Auction', render: (a) => <span className="amber">{day(a.auction)}</span>, sort: (a) => a.auction },
    { key: 'sec', label: 'Security', render: (a) => auctionName(a), sort: (a) => auctionName(a) },
    { key: 'cusip', label: 'CUSIP', render: (a) => a.cusip, sort: (a) => a.cusip },
    ...(kind === 'bill' ? [] : [{ key: 'cpn', label: kind === 'frn' ? 'Spread' : 'Coupon', num: true, render: (a: Auction) => fmtNum(a.coupon, 3), sort: (a: Auction) => a.coupon }]),
    { key: 'high', label: HIGH[kind], num: true, render: (a) => <span className="white">{fmtNum(a.high, 3)}</span>, sort: (a) => a.high },
    ...(kind === 'bill' ? [{ key: 'inv', label: 'Inv Rate', num: true, render: (a: Auction) => fmtNum(a.investmentRate, 3), sort: (a: Auction) => a.investmentRate }] : []),
    { key: 'px', label: 'Price', num: true, render: (a) => fmtNum(a.price, 6), sort: (a) => a.price },
    { key: 'alloc', label: 'Alloc at High %', num: true, render: (a) => fmtNum(a.allottedAtHigh, 2), sort: (a) => a.allottedAtHigh },
    { key: 'btc', label: 'Bid/Cover', num: true, render: (a) => fmtNum(a.bidToCover, 2), sort: (a) => a.bidToCover },
    { key: 'pd', label: 'Dealers %', num: true, render: (a) => fmtNum(share(a.dealers, a), 1), sort: (a) => share(a.dealers, a) },
    { key: 'dir', label: 'Direct %', num: true, render: (a) => fmtNum(share(a.direct, a), 1), sort: (a) => share(a.direct, a) },
    { key: 'ind', label: 'Indirect %', num: true, render: (a) => fmtNum(share(a.indirect, a), 1), sort: (a) => share(a.indirect, a) },
    { key: 'amt', label: 'Offered $bn', num: true, render: (a) => billions(a.offering), sort: (a) => a.offering },
    { key: 'iss', label: 'Issue', render: (a) => day(a.issue), sort: (a) => a.issue },
    { key: 'mat', label: 'Maturity', render: (a) => day(a.maturity), sort: (a) => a.maturity },
    { key: 'pdf', label: 'Results', render: (a) => (a.resultsUrl ? <a href={a.resultsUrl} target="_blank" rel="noreferrer noopener">PDF</a> : '') },
  ];
  const upcoming: Column<Auction>[] = [
    { key: 'date', label: 'Auction', render: (a) => <span className="amber">{day(a.auction)}</span>, sort: (a) => a.auction },
    { key: 'sec', label: 'Security', render: (a) => auctionName(a), sort: (a) => auctionName(a) },
    { key: 'cusip', label: 'CUSIP', render: (a) => a.cusip, sort: (a) => a.cusip },
    { key: 'ann', label: 'Announcement', render: (a) => day(a.announced), sort: (a) => a.announced },
    { key: 'amt', label: 'Offered $bn', num: true, render: (a) => billions(a.offering), sort: (a) => a.offering },
    { key: 'iss', label: 'Issue', render: (a) => day(a.issue), sort: (a) => a.issue },
    { key: 'mat', label: 'Maturity', render: (a) => day(a.maturity), sort: (a) => a.maturity },
  ];
  const csv = () => [
    ['Source', "U.S. Department of the Treasury: Fiscal Data's Treasury Securities Auctions Data and TreasuryDirect's securities service"],
    ['Auction date', 'Security', 'CUSIP', 'Kind', 'Coupon or spread %', 'High yield, rate or margin %', 'Investment rate %', 'Price', 'Allotted at high %', 'Bid to cover', 'Primary dealers accepted', 'Direct accepted', 'Indirect accepted', 'Competitive accepted', 'Total accepted', 'Offering', 'Announced', 'Issue', 'Maturity', 'Source'],
    ...rows.map((a) => [a.auction, auctionName(a), a.cusip, a.kind, a.coupon, a.high, a.investmentRate, a.price, a.allottedAtHigh, a.bidToCover, a.dealers, a.direct, a.indirect, a.competitive, a.total, a.offering, a.announced, a.issue, a.maturity, a.source]),
  ];
  return (
    <div>
      <FnHeader code="AUCTIONS" title="Treasury Auction Results" sub="U.S. Treasury · bills, notes, bonds, TIPS and FRNs"
        tabs={TABS.map((x) => ({ n: x.n, label: x.label }))} tab={tab} onTab={setTab}
        actions={rows.length ? exportActions(panel, 'treasury-auctions.csv', csv) : []} />
      {state === 'none' ? (
        <div className="empty">The Treasury&apos;s auctions are read from Fiscal Data and TreasuryDirect in the desktop app. The browser demo has none, and none is generated.</div>
      ) : state === 'loading' ? (
        <div className="empty">Reading the Treasury&apos;s auctions…</div>
      ) : state === 'error' ? (
        <div className="empty amber" role="status">{problems.join(' ')}</div>
      ) : (
        <div className="pad-s" data-testid="auctions">
          {problems.length ? <p className="amber" role="status">{problems.join(' ')}</p> : null}
          <DataTable rows={rows} rowKey={(a) => `${a.auction}:${a.cusip}:${a.term}`} columns={t.kind ? results : upcoming} empty={t.kind ? 'No auctions of this kind in the period.' : 'No auction announced and not yet held.'} />
        </div>
      )}
      <p className="pad-s muted">
        The Treasury&apos;s own results{oldest ? `, back to ${day(oldest)}` : ''}: Fiscal Data&apos;s auction records, which follow an auction by a week or two, and
        TreasuryDirect&apos;s for the last 30 days, posted minutes after each auction closes. High: the highest accepted yield for notes and bonds (a real yield for
        TIPS), the highest discount rate for bills with its investment (bond-equivalent) rate, the highest discount margin for FRNs. Dealers, Direct and Indirect:
        each group&apos;s share of the competitive award. A held auction without a result is one neither source has published yet. Upcoming: the auctions on the
        Treasury&apos;s schedule not yet held; the offering amount and maturity stay blank until the auction is announced. Source: U.S. Department of the Treasury (Fiscal Data, TreasuryDirect).
      </p>
    </div>
  );
}
