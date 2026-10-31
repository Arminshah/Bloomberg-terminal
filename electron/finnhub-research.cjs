// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// Finnhub's documented Recommendation Trends endpoint has no premium marker.
// Price-target and EPS endpoints do, so they are not a free-plan fallback.
function finnhubResearchRequest(kind, symbol) {
  if (kind !== 'ratings' || typeof symbol !== 'string' || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return null;
  return `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol.replace(/-/g, '.'))}`;
}
module.exports = { finnhubResearchRequest };
