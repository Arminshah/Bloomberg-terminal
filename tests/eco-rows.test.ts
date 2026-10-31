// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { describe, expect, it } from 'vitest';
import { ECO_REGIONS, ecoTypesOf, fredChart, fromEco, fromNasdaq, inRegion, ofKind, relevanceBars } from '../src/data/eco-rows';
import { dueReleaseAlerts, releaseAlerts, toggleReleaseAlert } from '../src/data/release-alerts';
import type { EcoEvent, PolicyCalendarEvent } from '../src/data/eco';

const now = Date.parse('2026-10-30T14:00:00Z');

describe("ECO's rows", () => {
  it("keeps Nasdaq's figures as published and leaves period and revision blank (it gives neither)", () => {
    const e: PolicyCalendarEvent = { id: 'n1', time: Date.parse('2026-10-30T12:30:00Z'), country: 'US', countryName: 'United States', name: 'Nonfarm Payrolls', actual: '119K', consensus: '50K', previous: '22K', description: 'Jobs added', relevance: 3 };
    const r = fromNasdaq(e, now);
    expect(r).toMatchObject({ survey: '50K', actual: '119K', prior: '22K', period: '', revised: '', bars: 4, released: true, real: true, chart: 'PAYEMS:CHG' });
    expect(fromNasdaq({ ...e, actual: '', time: now + 3_600_000 }, now).released).toBe(false);
  });

  it("carries the Fed's decision from its own statement, with Nasdaq's figures as notes", () => {
    const e: PolicyCalendarEvent = { id: 'f', time: now, country: 'US', countryName: 'United States', name: 'FOMC Rate Decision (Upper Bound)', actual: '4.00%', consensus: '', previous: '4.25%', description: '', relevance: 3, policyStatus: 'confirmed', reportedActual: '3.75-4.00%' };
    const r = fromNasdaq(e, now);
    expect(r.released).toBe(true);
    expect(r.notes?.actual).toContain('3.75-4.00%');
    expect(r.chart).toBeUndefined();
    expect(ecoTypesOf(r)).toEqual(['releases', 'banks']);
  });

  it("writes FRED's and the demo's numbers with their units, and no actual before the release", () => {
    const e: EcoEvent = { id: 'US:CPI MoM:2026-11-13', time: now, date: '2026-11-13', country: 'US', name: 'CPI MoM', period: 'Oct', survey: null, actual: 0.3, prior: 0.2, revised: null, unit: '%', dec: 1, relevance: 3, kind: 'inflation', real: true };
    const r = fromEco(e, now, '2026-10-30', true, fredChart('CPIAUCSL', 'mom'));
    expect(r).toMatchObject({ period: 'Oct', prior: '0.2%', survey: '', revised: '', released: true, chart: 'CPIAUCSL:PCH', bars: 4 });
    expect(r.time).toBe(Date.parse('2026-11-13T12:00:00Z'));
    const ahead = fromEco({ ...e, actual: null }, now, '2026-10-30', true);
    expect(ahead.released).toBe(false);
    expect(ahead.actual).toBe('');
  });

  it("reads R's four bars from the app's relevance: the headline releases four", () => {
    expect(relevanceBars('Nonfarm Payrolls', 3)).toBe(4);
    expect(relevanceBars('German CPI', 3)).toBe(4);
    expect(relevanceBars('Retail Sales', 3)).toBe(3);
    expect(relevanceBars('Housing Starts', 2)).toBe(2);
    expect(relevanceBars('MBA Purchase Index', 1)).toBe(1);
  });

  it('sorts events into kinds and subtypes by their names', () => {
    expect(ecoTypesOf({ name: 'German 10-Year Bund Auction' })).toEqual(['auctions']);
    expect(ecoTypesOf({ name: 'BOC Press Conference' })).toEqual(['banks']);
    expect(ecoTypesOf({ name: 'BoC Interest Rate Decision' })).toEqual(['releases', 'banks']);
    expect(ofKind({ name: 'French CPI' }, 'releases', 'prices')).toBe(true);
    expect(ofKind({ name: 'French CPI' }, 'releases', 'labor')).toBe(false);
    expect(ofKind({ name: 'German Unemployment Change' }, 'releases', 'labor')).toBe(true);
    expect(ofKind({ name: 'Crude Oil Inventories' }, 'releases', 'energy')).toBe(true);
    expect(ofKind({ name: "ECB's Lagarde Speaks" }, 'releases', 'all')).toBe(false);
    expect(ofKind({ name: "ECB's Lagarde Speaks" }, 'banks', 'talk')).toBe(true);
  });

  it('takes a region, a country or a custom calendar', () => {
    expect(inRegion('JP', 'WORLD')).toBe(true);
    expect(inRegion('JP', 'G7')).toBe(true);
    expect(inRegion('CN', 'G7')).toBe(false);
    expect(inRegion('DE', 'EMEA')).toBe(true);
    expect(inRegion('US', 'US')).toBe(true);
    expect(inRegion('CA', 'US')).toBe(false);
    expect(inRegion('CA', ['US', 'CA'])).toBe(true);
    expect(ECO_REGIONS.map((r) => r.id)).toEqual(['WORLD', 'G7', 'AMER', 'EMEA', 'APAC']);
  });
});

describe("ECO's release alerts", () => {
  it('rings an alerted release once, when its actual is out, and not one without an alert', () => {
    releaseAlerts.set({ keys: [], fired: {} });
    expect(toggleReleaseAlert('US', 'Nonfarm Payrolls')).toBe(true);
    const out = { id: 'a', country: 'US', name: 'Nonfarm Payrolls', actual: '119K', time: now - 60_000 };
    const other = { id: 'b', country: 'US', name: 'Jobless Claims', actual: '220K', time: now - 60_000 };
    const pending = { id: 'c', country: 'US', name: 'Nonfarm Payrolls', actual: '', time: now + 60_000 };
    expect(dueReleaseAlerts([out, other, pending], now).map((r) => r.id)).toEqual(['a']);
    expect(dueReleaseAlerts([out, other, pending], now + 60_000)).toEqual([]);
    expect(toggleReleaseAlert('US', 'Nonfarm Payrolls')).toBe(false);
    expect(releaseAlerts.get().keys).toEqual([]);
  });
});
