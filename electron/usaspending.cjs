// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// USAspending.gov for the main process (SPLC): the federal contracts a company holds, the subcontracts prime
// contractors gave it, and the subcontracts let under its own largest contracts. The U.S. Treasury's public API needs
// no key; its data is the federal government's own (DATA Act and FFATA subaward reports), free to use.
//
// The page names what it wants (a kind and a company name, recipient IDs or contract numbers); the request is built
// here from fixed shapes, and only the fields SPLC shows go back.

const API = 'https://api.usaspending.gov/api/v2';
const DAY = 86_400_000;
/** Contracts: definitive contracts, purchase orders, delivery and BPA call orders (not grants or loans). */
const CONTRACTS = ['A', 'B', 'C', 'D'];
/** A company name as the page may search it. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9 .,&'-]{2,79}$/;
/** A recipient's Unique Entity ID in SAM.gov. */
const UEI = /^[A-Z0-9]{12}$/;
/** A contract number (PIID): "N0001917C0001", "W9128Z26FA001", "47QFCA24F0009". */
const PIID = /^[A-Z0-9][A-Z0-9-]{3,49}$/;
/** A recipient's USAspending ID: a hash and its level ("d5ab5f51-db3a-a26f-96a1-1b24c3e2802c-C"). */
const RECIPIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[PCR]$/;

const day = (t) => new Date(t).toISOString().slice(0, 10);
const period = (now, years) => [{ start_date: day(now - years * 365 * DAY), end_date: day(now) }];

/** Comma-separated values that all fit `re`, at most `max`; null otherwise. */
function list(arg, re, max) {
  const xs = arg.split(',').map((s) => s.trim()).filter(Boolean);
  return xs.length && xs.length <= max && xs.every((x) => re.test(x)) ? [...new Set(xs)] : null;
}

const SUB_FIELDS = ['Sub-Award ID', 'Sub-Awardee Name', 'Sub-Recipient UEI', 'Sub-Award Amount', 'Sub-Award Date', 'Prime Recipient Name', 'Prime Award Recipient UEI', 'Prime Award ID', 'Awarding Agency', 'Sub-Award Description', 'prime_award_generated_internal_id'];

/**
 * The request for a kind, null when it is not one the app makes:
 * - 'recipients': the recipients whose name holds the words (parents and their units), by contract amount;
 * - 'children': the units under a parent recipient (its UEI);
 * - 'awards': the prime contracts of these recipients (UEIs) with activity in the last two years, largest first;
 * - 'subawards': the subcontracts these recipients received in the last two years, largest first;
 * - 'subs': the subcontracts let under these contracts (PIIDs) in the last five years, largest first;
 * - 'profile': one recipient's own record (its USAspending ID), with the parent USAspending files it under.
 */
function usaspendingRequest(kind, arg, now = Date.now()) {
  if (typeof arg !== 'string') return null;
  const text = arg.trim();
  if (kind === 'recipients' && NAME.test(text)) {
    return { method: 'POST', url: `${API}/recipient/`, body: { keyword: text, award_type: 'contracts', limit: 50, page: 1, sort: 'amount', order: 'desc' } };
  }
  if (kind === 'children' && UEI.test(text)) return { method: 'GET', url: `${API}/recipient/children/${text}/` };
  if (kind === 'profile' && RECIPIENT_ID.test(text)) return { method: 'GET', url: `${API}/recipient/${text}/` };
  const ueis = kind === 'awards' || kind === 'subawards' ? list(text, UEI, 25) : null;
  if (kind === 'awards' && ueis) {
    return {
      method: 'POST',
      url: `${API}/search/spending_by_award/`,
      body: {
        filters: { recipient_search_text: ueis, award_type_codes: CONTRACTS, time_period: period(now, 2) },
        fields: ['Award ID', 'Recipient Name', 'Recipient UEI', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Funding Agency', 'Funding Sub Agency', 'Start Date', 'End Date', 'Description'],
        limit: 100, page: 1, sort: 'Award Amount', order: 'desc',
      },
    };
  }
  if (kind === 'subawards' && ueis) {
    return {
      method: 'POST',
      url: `${API}/search/spending_by_award/`,
      body: { subawards: true, filters: { recipient_search_text: ueis, award_type_codes: CONTRACTS, time_period: period(now, 2) }, fields: SUB_FIELDS, limit: 100, page: 1, sort: 'Sub-Award Amount', order: 'desc' },
    };
  }
  const piids = kind === 'subs' ? list(text, PIID, 12) : null;
  if (piids) {
    return {
      method: 'POST',
      url: `${API}/search/spending_by_award/`,
      body: { subawards: true, filters: { award_ids: piids, award_type_codes: CONTRACTS, time_period: period(now, 5) }, fields: SUB_FIELDS, limit: 100, page: 1, sort: 'Sub-Award Amount', order: 'desc' },
    };
  }
  return null;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 240) : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : NaN);
const iso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const uei = (v) => (typeof v === 'string' && UEI.test(v.trim()) ? v.trim() : undefined);

/** The rows SPLC reads for a kind; null when the answer is not USAspending's. */
function parseUsaspending(kind, text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (kind === 'children') {
    if (!Array.isArray(json)) return null;
    return json.map((r) => ({ id: str(r?.recipient_id), name: str(r?.name), uei: uei(r?.uei), amount: num(r?.amount) })).filter((r) => r.name && r.uei);
  }
  if (kind === 'profile') {
    if (!json || typeof json !== 'object' || Array.isArray(json) || !str(json.name)) return null;
    return [{ name: str(json.name), uei: uei(json.uei), parentName: str(json.parent_name), parentUei: uei(json.parent_uei) }];
  }
  const rows = json?.results;
  if (!Array.isArray(rows)) return null;
  if (kind === 'recipients') {
    return rows.map((r) => ({ id: str(r?.id), name: str(r?.name), uei: uei(r?.uei), level: str(r?.recipient_level), amount: num(r?.amount) })).filter((r) => r.id && r.name && r.uei);
  }
  if (kind === 'awards') {
    return rows.map((r) => ({
      id: str(r.generated_internal_id), award: str(r['Award ID']), recipient: str(r['Recipient Name']), uei: uei(r['Recipient UEI']), amount: num(r['Award Amount']),
      agency: str(r['Awarding Agency']), subAgency: str(r['Awarding Sub Agency']), fundingAgency: str(r['Funding Agency']), fundingSubAgency: str(r['Funding Sub Agency']), start: iso(r['Start Date']), end: iso(r['End Date']), description: str(r.Description),
    })).filter((r) => r.id && r.recipient && Number.isFinite(r.amount));
  }
  return rows.map((r) => ({
    id: str(r['Sub-Award ID']), award: str(r['Prime Award ID']), awardId: str(r.prime_award_generated_internal_id), recipient: str(r['Sub-Awardee Name']), uei: uei(r['Sub-Recipient UEI']),
    prime: str(r['Prime Recipient Name']), primeUei: uei(r['Prime Award Recipient UEI']), amount: num(r['Sub-Award Amount']), date: iso(r['Sub-Award Date']), agency: str(r['Awarding Agency']), description: str(r['Sub-Award Description']),
  })).filter((r) => r.recipient && r.prime && Number.isFinite(r.amount));
}

module.exports = { API, usaspendingRequest, parseUsaspending };
