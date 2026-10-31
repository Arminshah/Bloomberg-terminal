// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// The US Energy Information Administration (EIA) for NGAS, NATURALGAS and OILMARKET: its weekly natural gas storage
// report (a public JSON file, no key), and from its Open Data API (version 2, the owner's key) the weekly storage
// history, the weekly petroleum supply estimates and the monthly natural gas production and consumption. The URLs are
// built here from fixed routes and series; main.cjs adds the key. Nothing else can be asked for.

const API = 'https://api.eia.gov/v2';
const DAY_MS = 86_400_000;

/** The weekly storage report as EIA publishes it each Thursday at 10:30 New York time, with its own comparisons. */
const STORAGE_REPORT = 'https://ir.eia.gov/ngs/wngsr.json';

/** Working gas in underground storage, Lower 48 and its regions (billion cubic feet), weekly. */
const STORAGE_SERIES = [
  'NW2_EPG0_SWO_R48_BCF', // Lower 48
  'NW2_EPG0_SWO_R31_BCF', // East
  'NW2_EPG0_SWO_R32_BCF', // Midwest
  'NW2_EPG0_SWO_R33_BCF', // South Central
  'NW2_EPG0_SWO_R34_BCF', // Mountain
  'NW2_EPG0_SWO_R35_BCF', // Pacific
  'NW2_EPG0_SSO_R33_BCF', // South Central salt
  'NW2_EPG0_SNO_R33_BCF', // South Central nonsalt
];

/** Weekly petroleum supply estimates (the Weekly Petroleum Status Report's figures). */
const PETROLEUM_SERIES = [
  'WCESTUS1', // commercial crude oil stocks, excluding the SPR (thousand barrels)
  'WCSSTUS1', // crude oil in the Strategic Petroleum Reserve (thousand barrels)
  'W_EPC0_SAX_YCUOK_MBBL', // Cushing, Oklahoma crude oil stocks (thousand barrels)
  'WGTSTUS1', // total motor gasoline stocks (thousand barrels)
  'WDISTUS1', // distillate fuel oil stocks (thousand barrels)
  'WCRFPUS2', // field production of crude oil (thousand barrels a day)
  'WCRRIUS2', // refiner net input of crude oil (thousand barrels a day)
  'WPULEUS3', // refinery utilisation (percent of operable capacity)
  'WRPUPUS2', // product supplied of petroleum products (thousand barrels a day)
  'WGFUPUS2', // product supplied of finished motor gasoline (thousand barrels a day)
  'WDIUPUS2', // product supplied of distillate fuel oil (thousand barrels a day)
];

/** Monthly US natural gas supply and disposition (million cubic feet). */
const GAS_MONTHLY_SERIES = [
  'N9070US2', // dry natural gas production
  'N9140US2', // total consumption
];

const KINDS = new Set(['storage-report', 'storage-history', 'petroleum', 'gas-monthly']);

function isoDay(t) {
  return new Date(t).toISOString().slice(0, 10);
}

function dataUrl(route, frequency, series, start) {
  const facets = series.map((s) => `facets[series][]=${s}`).join('&');
  return `${API}/${route}/data/?frequency=${frequency}&data[0]=value&${facets}&start=${start}&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=5000`;
}

/**
 * The request for one EIA dataset: its URL (without the key), whether it needs the key, and how long an answer is
 * kept. Null for anything else.
 */
function eiaRequest(kind, now = Date.now()) {
  if (!KINDS.has(kind)) return null;
  if (kind === 'storage-report') return { url: STORAGE_REPORT, keyed: false, ttl: 30 * 60_000 };
  // Two years and a month of weeks: a year of change and the year before it.
  if (kind === 'storage-history') return { url: dataUrl('natural-gas/stor/wkly', 'weekly', STORAGE_SERIES, isoDay(now - 760 * DAY_MS)), keyed: true, ttl: 60 * 60_000 };
  // A year and five weeks: the same week a year earlier (364 days) is in it.
  if (kind === 'petroleum') return { url: dataUrl('petroleum/sum/sndw', 'weekly', PETROLEUM_SERIES, isoDay(now - 400 * DAY_MS)), keyed: true, ttl: 30 * 60_000 };
  return { url: dataUrl('natural-gas/sum/snd', 'monthly', GAS_MONTHLY_SERIES, isoDay(now - 3 * 366 * DAY_MS).slice(0, 7)), keyed: true, ttl: 6 * 3_600_000 };
}

/** The keyed URL: the API takes the key as the api_key parameter. */
function withKey(url, key) {
  return `${url}&api_key=${encodeURIComponent(key)}`;
}

module.exports = { eiaRequest, withKey, STORAGE_SERIES, PETROLEUM_SERIES, GAS_MONTHLY_SERIES, STORAGE_REPORT };
