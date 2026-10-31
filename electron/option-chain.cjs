// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Read-only Alpaca indicative option snapshots. Never select paid OPRA implicitly,
// accept arbitrary URLs or call an account/order endpoint.
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

function optionChainRequest(arg) {
  if (!arg || typeof arg !== 'object' || Array.isArray(arg) ||
      Object.keys(arg).some((k) => !['symbol', 'expiry', 'pageToken'].includes(k)) ||
      typeof arg.symbol !== 'string' || !SYMBOL.test(arg.symbol)) return null;
  const url = new URL(`https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(arg.symbol)}`);
  url.searchParams.set('feed', 'indicative');
  url.searchParams.set('limit', '1000');
  if (arg.expiry !== undefined && arg.expiry !== '') {
    if (typeof arg.expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(arg.expiry)) return null;
    const date = new Date(`${arg.expiry}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== arg.expiry) return null;
    url.searchParams.set('expiration_date', arg.expiry);
  }
  if (arg.pageToken !== undefined) {
    // Opaque tokens are encoded as a query value, never interpolated into a URL.
    if (typeof arg.pageToken !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(arg.pageToken)) return null;
    url.searchParams.set('page_token', arg.pageToken);
  }
  return url.href;
}

function optionChainProblem(text) {
  let json;
  try { json = JSON.parse(text); } catch { return 'Alpaca returned invalid JSON for option snapshots.'; }
  if (!json || typeof json !== 'object' || Array.isArray(json) || !json.snapshots || typeof json.snapshots !== 'object' || Array.isArray(json.snapshots)) return 'Alpaca returned no option snapshot map.';
  const next = json.next_page_token;
  if (next !== undefined && next !== null && next !== '' && (typeof next !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(next))) return 'Alpaca returned an invalid option pagination token.';
  return null;
}

module.exports = { optionChainRequest, optionChainProblem };
