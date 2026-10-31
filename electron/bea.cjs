// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// The Bureau of Economic Analysis (BEA) for NIPA: two national accounts tables from its API with the owner's UserID
// (BEA_API_KEY). The URLs are built here from fixed tables; main.cjs adds the key. BEA repeats the UserID in its
// answer (BEAAPI.Request), so that part is removed before the answer leaves the main process.

const API = 'https://apps.bea.gov/api/data/';

/** NIPA tables: Table 1.1.2, contributions to the percent change in real GDP (quarterly), and Table 2.6, personal
 * income and its disposition (monthly). */
const TABLES = {
  'gdp-contributions': { table: 'T10102', frequency: 'Q', years: 3 },
  'personal-income': { table: 'T20600', frequency: 'M', years: 2 },
};

/** The request for one table: its URL without the key, and how long an answer is kept. Null for anything else. */
function beaRequest(kind, now = Date.now()) {
  const t = TABLES[kind];
  if (!t) return null;
  const year = new Date(now).getUTCFullYear();
  const years = Array.from({ length: t.years }, (_, i) => year - t.years + 1 + i).join(',');
  return { url: `${API}?method=GetData&DataSetName=NIPA&TableName=${t.table}&Frequency=${t.frequency}&Year=${years}&ResultFormat=JSON`, ttl: 6 * 3_600_000 };
}

function withKey(url, key) {
  return `${url}&UserID=${encodeURIComponent(key)}`;
}

/**
 * BEA's answer without its echo of the request (which holds the UserID). An answer that is not BEA's JSON is
 * returned empty: it could carry the key in a way this function cannot see.
 */
function withoutRequest(text) {
  try {
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object' || !d.BEAAPI) return '';
    delete d.BEAAPI.Request;
    return JSON.stringify(d);
  } catch {
    return '';
  }
}

module.exports = { beaRequest, withKey, withoutRequest, TABLES };
