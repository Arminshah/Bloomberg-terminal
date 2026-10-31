// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * The Treasury's auctions (electron/fiscal.cjs; no key): Fiscal Data's latest 600 bill, note, bond, TIPS and FRN
 * auctions (about 16 months) with their results, and TreasuryDirect's securities service for the last 30 days' results
 * and the auctions announced but not yet held. Fiscal Data's results arrive a week or two after the auction;
 * TreasuryDirect posts them minutes after it closes, and its record replaces Fiscal Data's for the same auction. The
 * figures are the Treasury's own: the high yield (notes and bonds; a real yield for TIPS), the high discount rate and
 * investment rate (bills), the high discount margin (FRNs), the price, the share allotted at the high, the bid-to-cover
 * ratio, and the competitive awards to primary dealers, direct and indirect bidders.
 */
import { useEffect, useState } from 'react';
import type { KeyedAnswer } from './lookup';
import { fiscalProblem } from './fiscal';

export type AuctionKind = 'bill' | 'coupon' | 'tips' | 'frn';

export interface Auction {
  cusip: string;
  /** "Bill", "Note", "Bond" as the Treasury types it, and its term ("10-Year", "9-Year 10-Month" for a reopening). */
  type: string;
  term: string;
  kind: AuctionKind;
  reopening: boolean;
  cashManagement: boolean;
  announced: string;
  auction: string;
  issue: string;
  maturity: string;
  offering: number;
  coupon: number;
  /** The auction's result: the high yield, discount rate or discount margin, in percent, by kind. */
  high: number;
  /** A bill's investment rate (bond-equivalent), percent. */
  investmentRate: number;
  price: number;
  allottedAtHigh: number;
  bidToCover: number;
  competitive: number;
  dealers: number;
  direct: number;
  indirect: number;
  total: number;
  /** The Treasury's results announcement (PDF), when there is one. */
  resultsUrl?: string;
  /** No result yet: announced and not yet held, or held with the result not yet in the source. */
  upcoming: boolean;
  source: 'Fiscal Data' | 'TreasuryDirect';
}

const num = (v: unknown) => {
  const n = typeof v === 'string' && v.trim() !== '' && v !== 'null' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:]+)?$/.test(v) ? v.slice(0, 10) : '');
const resultsUrl = (auction: string, file: unknown) =>
  typeof file === 'string' && /^[\w.-]+\.pdf$/.test(file) ? { resultsUrl: `https://www.treasurydirect.gov/instit/annceresult/press/preanre/${auction.slice(0, 4)}/${file}` } : {};

/** Fiscal Data's answer as auctions, newest first. */
export function parseAuctions(text: string): Auction[] | { error: string } {
  let j: { data?: unknown };
  try { j = JSON.parse(text); } catch { return { error: 'Fiscal Data returned a page that is not JSON.' }; }
  if (!Array.isArray(j?.data)) return { error: 'Fiscal Data changed the auctions format.' };
  const out: Auction[] = [];
  for (const r of j.data as Record<string, unknown>[]) {
    const auction = iso(r.auction_date);
    const type = String(r.security_type ?? '');
    if (!auction || !/^(Bill|Note|Bond)$/.test(type)) continue;
    const kind: AuctionKind = type === 'Bill' ? 'bill' : r.inflation_index_security === 'Yes' ? 'tips' : r.floating_rate === 'Yes' ? 'frn' : 'coupon';
    const high = kind === 'bill' ? num(r.high_discnt_rate) : kind === 'frn' ? num(r.high_discnt_margin) : num(r.high_yield);
    out.push({
      cusip: String(r.cusip ?? ''), type, term: String(r.security_term ?? ''), kind,
      reopening: r.reopening === 'Yes', cashManagement: r.cash_management_bill_cmb === 'Yes',
      announced: iso(r.announcemt_date), auction, issue: iso(r.issue_date), maturity: iso(r.maturity_date),
      offering: num(r.offering_amt), coupon: kind === 'frn' ? num(r.spread) : num(r.int_rate), high, investmentRate: num(r.high_investment_rate), price: num(r.high_price),
      allottedAtHigh: num(r.allocation_pctage), bidToCover: num(r.bid_to_cover_ratio), competitive: num(r.comp_accepted),
      dealers: num(r.primary_dealer_accepted), direct: num(r.direct_bidder_accepted), indirect: num(r.indirect_bidder_accepted), total: num(r.total_accepted),
      ...resultsUrl(auction, r.pdf_filenm_comp_results),
      upcoming: !Number.isFinite(high) && !Number.isFinite(num(r.bid_to_cover_ratio)),
      source: 'Fiscal Data',
    });
  }
  return out.sort(newestFirst);
}

const newestFirst = (a: Auction, b: Auction) => b.auction.localeCompare(a.auction) || a.term.localeCompare(b.term);

/**
 * TreasuryDirect's answer (auctioned or upcoming) as auctions. Its type is Bill, Note, Bond, TIPS, FRN or CMB; the
 * competitive award is the competitive par awarded inside and outside the offering amount, the total the grand total
 * awarded (SOMA and FIMA included), as Fiscal Data reports them.
 */
export function parseTreasuryDirect(text: string): Auction[] | { error: string } {
  let rows: unknown;
  try { rows = JSON.parse(text); } catch { return { error: 'TreasuryDirect returned a page that is not JSON.' }; }
  if (!Array.isArray(rows)) return { error: 'TreasuryDirect changed its securities format.' };
  const out: Auction[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const auction = iso(r?.competitiveAuctionCloseDate);
    const type = String(r?.securityType ?? '');
    if (!auction || !/^(Bill|Note|Bond)$/.test(type)) continue;
    const kind: AuctionKind = type === 'Bill' ? 'bill' : r.type === 'TIPS' || r.inflationProtected === 'Yes' ? 'tips' : r.type === 'FRN' || r.floatingRate === 'Yes' ? 'frn' : 'coupon';
    const high = kind === 'bill' ? num(r.highRate) : kind === 'frn' ? num(r.highDiscountMargin) : num(r.highYield);
    const allotted = kind === 'bill' ? r.allottedAtHighRatePercentage : kind === 'frn' ? r.allottedAtHighDiscountMarginPercentage : r.allottedAtHighYieldPercentage;
    const inside = num(r.subtotalCompetitiveParAwardedInsideOfOfferingAmount);
    const outside = num(r.subtotalCompetitiveParAwardedOutsideOfOfferingAmount);
    out.push({
      cusip: String(r.cusip ?? ''), type, term: String(r.securityTerm ?? ''), kind,
      reopening: r.reopening === 'Yes', cashManagement: r.cashManagementBill === 'Yes' || r.type === 'CMB',
      announced: iso(r.announcementDate), auction, issue: iso(r.issueDate), maturity: iso(r.maturityDate),
      offering: num(r.offeringAmount), coupon: kind === 'frn' ? num(r.spread) : num(r.interestRate), high, investmentRate: num(r.investmentRate), price: num(r.highPrice),
      allottedAtHigh: num(allotted), bidToCover: num(r.bidToCoverRatio), competitive: Number.isFinite(inside) ? inside + (Number.isFinite(outside) ? outside : 0) : NaN,
      dealers: num(r.primaryDealersCompetitiveParAwarded), direct: num(r.directBiddersCompetitiveParAwarded), indirect: num(r.indirectBiddersCompetitiveParAwarded),
      total: num(r.grandTotalParAwarded),
      ...resultsUrl(auction, r.treasuryAuctionResultsPressReleaseFileName),
      upcoming: !Number.isFinite(high) && !Number.isFinite(num(r.bidToCoverRatio)),
      source: 'TreasuryDirect',
    });
  }
  return out.sort(newestFirst);
}

/** Fiscal Data's history with TreasuryDirect's records over it: one row per security and auction day, newest first. */
export function mergeAuctions(...lists: Auction[][]): Auction[] {
  const byKey = new Map<string, Auction>();
  for (const list of lists) {
    for (const a of list) {
      const key = `${a.cusip}:${a.auction}`;
      const had = byKey.get(key);
      // A later list wins, unless it has no result where the earlier one has.
      if (!had || !a.upcoming || had.upcoming) byKey.set(key, a);
    }
  }
  return [...byKey.values()].sort(newestFirst);
}

/** A bidder group's share of the competitive award, percent. */
export const share = (part: number, a: Auction) => (a.competitive > 0 && Number.isFinite(part) ? (part / a.competitive) * 100 : NaN);

/** "10-Year Note", "26-Week Bill", "5-Year TIPS", "2-Year FRN", with "(reopening)" and "CMB" where they apply. */
export function auctionName(a: Auction): string {
  const what = a.kind === 'tips' ? 'TIPS' : a.kind === 'frn' ? 'FRN' : a.cashManagement ? 'CMB' : a.type;
  return `${a.term} ${what}${a.reopening ? ' (reopening)' : ''}`;
}

function treasuryDirectProblem(res: KeyedAnswer): string {
  if (res.status === 429 || res.throttled) return 'TreasuryDirect asked the app to wait (rate limit).';
  if (!res.status) return res.error ? `TreasuryDirect: ${res.error.slice(0, 100)}` : 'TreasuryDirect did not answer (network or service).';
  return `TreasuryDirect answered HTTP ${res.status}.`;
}

type AuctionsState = { state: 'loading' | 'ok' | 'error' | 'none'; auctions: Auction[]; problems: string[] };

/** The three answers together: the screen shows whatever came through and names what did not. */
export function auctionsFrom(history: KeyedAnswer | undefined, recent: KeyedAnswer | undefined, upcoming: KeyedAnswer | undefined): AuctionsState {
  const problems: string[] = [];
  const read = (res: KeyedAnswer | undefined, parse: typeof parseAuctions, problem: (r: KeyedAnswer) => string, what: string): Auction[] => {
    const parsed = res?.text ? parse(res.text) : { error: res ? problem(res) : `${what} did not answer.` };
    if ('error' in parsed) problems.push(`${what}: ${parsed.error}`);
    return 'error' in parsed ? [] : parsed;
  };
  const h = read(history, parseAuctions, fiscalProblem, 'Fiscal Data (history)');
  const r = read(recent, parseTreasuryDirect, treasuryDirectProblem, 'TreasuryDirect (last 30 days)');
  const u = read(upcoming, parseTreasuryDirect, treasuryDirectProblem, 'TreasuryDirect (announced auctions)');
  const auctions = mergeAuctions(h, r, u);
  return { state: auctions.length ? 'ok' : 'error', auctions, problems };
}

export function useAuctions(): AuctionsState {
  const [state, setState] = useState<AuctionsState>({ state: 'loading', auctions: [], problems: [] });
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.arminDesktop : undefined;
    if (!api?.fiscal) {
      setState({ state: 'none', auctions: [], problems: [] });
      return;
    }
    let stopped = false;
    const ask = (kind: 'auctions' | 'auctions-recent' | 'auctions-upcoming') => api.fiscal!(kind).catch(() => undefined);
    void Promise.all([ask('auctions'), ask('auctions-recent'), ask('auctions-upcoming')]).then(([h, r, u]) => {
      if (!stopped) setState(auctionsFrom(h, r, u));
    });
    return () => {
      stopped = true;
    };
  }, []);
  return state;
}
