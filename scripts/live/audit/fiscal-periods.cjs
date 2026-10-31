// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
'use strict';

const DAY = 86_400_000;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// The app's source join treats a 52/53-week year ending in the first week of
// a month as the preceding fiscal-end month. Retain that convention without
// substituting a nearby company's fact or changing the actual's exact date.
function fiscalMonth(end) {
  return new Date(Date.parse(end) - (Number(end.slice(8, 10)) <= 7 ? 8 * DAY : 0)).toISOString().slice(0, 7);
}

/**
 * A calendar-labelled earnings row can carry an exact statement period. The
 * corroboration uses that stated period, never an assumed nearby SEC quarter.
 * Currency is retained for an exact unit lookup in filedQuarterEps.
 */
function filedEpsContext(quarter) {
  const actual = quarter?.gaapActual;
  if (!actual || actual.basis !== 'gaap' || !Number.isFinite(actual.value) || !/^[A-Z]{3}$/.test(actual.currency ?? '')) return null;
  if (!validDate(quarter.periodEnd)) return null;
  const end = actual.periodEnd === undefined ? quarter.periodEnd : actual.periodEnd;
  if (!validDate(end) || fiscalMonth(end) !== fiscalMonth(quarter.periodEnd) || Math.abs(Date.parse(end) - Date.parse(quarter.periodEnd)) > 20 * DAY) return null;
  return { periodEnd: end, currency: actual.currency, value: actual.value };
}

module.exports = { filedEpsContext };
