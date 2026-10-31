// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fmtDay } from '../core/format';
import type { Dividend, StockSplit } from './fundamentals';
import type { Filing } from './live/sec';

/** CACS's action groups, as its filter boxes name them. */
export type ActionGroup = 'Dividends' | 'Splits' | 'M & A' | 'IPO / ADDL' | 'Listings' | 'Meetings';
export const ACTION_GROUPS: ActionGroup[] = ['Dividends', 'Splits', 'M & A', 'IPO / ADDL', 'Listings', 'Meetings'];

export interface CorpAction {
  group: ActionGroup;
  /** As the terminal's Action Type column words it: Cash Dividend, Stock Split, Corp Meeting... */
  type: string;
  /** When it takes effect (ex-date, split date, filing date for filed events), epoch ms. */
  effective: number;
  /** When it was announced (declaration, filing), epoch ms; NaN when not known. */
  announced: number;
  summary: string;
  /** The filing behind it, on SEC EDGAR. */
  link?: string;
  estimate?: boolean;
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fmtAmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '--');

/** The filing's page on EDGAR. */
export function filingUrl(cik: number, f: Filing): string {
  const acc = f.accession.replace(/-/g, '');
  return f.doc ? `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${f.doc}` : `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/`;
}

/**
 * A company's corporate actions: cash dividends and splits from its dividend record, and the events its SEC
 * filings announce (acquisitions completed, merger and tender offer documents, offerings registered, listing
 * changes, shareholder meetings). Newest first by effective date.
 */
export function corporateActions(input: { ccy: string; dividends: Dividend[]; splits: StockSplit[]; filings?: Filing[]; cik?: number }): CorpAction[] {
  const out: CorpAction[] = [];
  for (const d of input.dividends) {
    if (!Number.isFinite(d.ex)) continue;
    const estimate = d.type === 'Projected' || d.type === 'Expected';
    const special = /special|extra/i.test(d.type);
    const pay = Number.isFinite(d.pay) ? ` · Payable ${fmtDay(d.pay)}` : '';
    out.push({
      group: 'Dividends',
      type: special ? 'Special Cash Dividend' : 'Cash Dividend',
      effective: d.ex,
      announced: Number.isFinite(d.declared) ? d.declared : NaN,
      summary: `${special ? 'Special' : 'Regular'} Cash ${input.ccy} ${fmtAmt(d.amount)}${d.freq ? ` · ${d.freq}` : ''}${pay}${estimate ? ' - Estimate' : ''}`,
      estimate,
    });
  }
  for (const x of input.splits) {
    out.push({ group: 'Splits', type: x.numerator >= x.denominator ? 'Stock Split' : 'Reverse Split', effective: x.date, announced: NaN, summary: `Split ${x.numerator}:${x.denominator}` });
  }
  for (const f of input.filings ?? []) {
    const form = f.form.toUpperCase().trim();
    const t = day(f.filed);
    if (!Number.isFinite(t)) continue;
    const link = input.cik ? filingUrl(input.cik, f) : undefined;
    const add = (group: ActionGroup, type: string, summary: string) => out.push({ group, type, effective: t, announced: t, summary, link });
    const items = f.items ?? [];
    if (/^8-K/.test(form)) {
      if (items.includes('2.01')) add('M & A', 'Acquisition/Disposition', 'Completion of acquisition or disposition of assets (8-K item 2.01)');
      if (items.includes('5.01')) add('M & A', 'Change in Control', 'Changes in control of the registrant (8-K item 5.01)');
      if (items.includes('3.01')) add('Listings', 'Listing Change', 'Delisting notice or transfer of listing (8-K item 3.01)');
      if (items.includes('3.03')) add('Listings', 'Holder Rights Change', 'Material modification to rights of security holders (8-K item 3.03)');
      if (items.includes('5.07')) add('Meetings', 'Corp Meeting', 'Results of the shareholder vote (8-K item 5.07)');
      continue;
    }
    if (/^(DEF 14A|DEFM14A|DEF 14C)$/.test(form)) add('Meetings', 'Corp Meeting', form === 'DEFM14A' ? 'Type: Special Shareholder (merger proxy)' : 'Type: Annual Shareholder (proxy statement)');
    else if (/^(425|S-4|F-4|SC TO-T|SC TO-I|SC 14D9)(\/A)?$/.test(form)) add('M & A', form.startsWith('SC TO') || form === 'SC 14D9' ? 'Tender Offer' : 'Merger', `${form} filed: ${form === '425' ? 'merger communication' : form.startsWith('SC TO') ? 'tender offer statement' : form === 'SC 14D9' ? 'response to a tender offer' : 'registration for a merger or exchange'}`);
    else if (/^(S-1|F-1)$/.test(form)) add('IPO / ADDL', 'Initial Offering', `${form} registration statement`);
    else if (/^(S-3|S-3ASR|F-3|F-3ASR)$/.test(form)) add('IPO / ADDL', 'Shelf Registration', `${form}: securities registered for later offerings`);
    else if (/^424B[1-5]$/.test(form)) add('IPO / ADDL', 'Additional Offering', `Prospectus (${form}) for an offering`);
    else if (/^(25|25-NSE)$/.test(form)) add('Listings', 'Delisting', `${form}: notification of removal from listing`);
    else if (/^(10-12B|10-12G)$/.test(form)) add('Listings', 'New Listing', `${form}: registration of a class of securities (spin-off or listing)`);
  }
  return out.sort((a, b) => b.effective - a.effective);
}
