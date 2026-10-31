// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// The Federal Reserve Bank of Philadelphia's Survey of Professional Forecasters (no key): the survey's page, which
// links each quarter's release, and a quarter's release page with the median forecasts as the Bank tabulates them.
// Two kinds of page only; nothing else on the site can be asked for. robots.txt allows them (31 October 2026).

const BASE = 'https://www.philadelphiafed.org/surveys-and-data/real-time-data-research';
const HOUR = 3_600_000;

/** 'index': the survey's page (its links name the latest release). 'survey': one quarter's release page. */
function philFedRequest(kind, quarter, year) {
  if (kind === 'index') return { url: `${BASE}/survey-of-professional-forecasters`, ttl: 6 * HOUR };
  if (kind === 'survey' && /^[1-4]$/.test(String(quarter)) && /^20\d\d$/.test(String(year))) return { url: `${BASE}/spf-q${quarter}-${year}`, ttl: 24 * HOUR };
  return null;
}

/** A page that is not the Bank's HTML (an error page, a block) is not an answer to keep. */
function philFedProblem(text) {
  return /<html/i.test(text) && /Survey of Professional Forecasters/i.test(text) ? null : 'The Philadelphia Fed did not send the survey page.';
}

module.exports = { philFedRequest, philFedProblem };
