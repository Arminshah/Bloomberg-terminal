// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';

/**
 * The IMF's World Economic Outlook from its DataMapper API (desktop app, no key): each indicator's figures for every
 * economy and group by year, the IMF's projections included, with the economies' and groups' names and the edition.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Economy or group code -> year -> value. */
export type WeoValues = Record<string, Record<number, number>>;

export interface WeoIndicator {
  id: string;
  label: string;
  short: string;
  unit: string;
  dec: number;
}

export const WEO: WeoIndicator[] = [
  { id: 'NGDP_RPCH', label: 'Real GDP growth', short: 'GDP growth', unit: '% change', dec: 1 },
  { id: 'PCPIPCH', label: 'Inflation, average consumer prices', short: 'Inflation', unit: '% change', dec: 1 },
  { id: 'LUR', label: 'Unemployment rate', short: 'Unemployment', unit: '%', dec: 1 },
  { id: 'BCA_NGDPD', label: 'Current account balance', short: 'Current account', unit: '% of GDP', dec: 1 },
  { id: 'GGXCNL_NGDP', label: 'General government net lending/borrowing', short: 'Gov. balance', unit: '% of GDP', dec: 1 },
  { id: 'GGXWDG_NGDP', label: 'General government gross debt', short: 'Gov. debt', unit: '% of GDP', dec: 1 },
];

/** One indicator's answer: {values: {ID: {USA: {"2026": 2.3, ...}}}}. */
export function parseWeoValues(text: string, id: string): WeoValues | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const byCode = j?.values?.[id];
  if (!byCode || typeof byCode !== 'object') return j?.values && typeof j.values === 'object' ? {} : null;
  const out: WeoValues = {};
  for (const [code, years] of Object.entries(byCode as Record<string, Record<string, unknown>>)) {
    if (!/^[A-Z0-9-]{2,12}$/.test(code) || !years || typeof years !== 'object') continue;
    const row: Record<number, number> = {};
    for (const [y, v] of Object.entries(years)) {
      const year = Number(y);
      if (Number.isInteger(year) && typeof v === 'number' && Number.isFinite(v)) row[year] = v;
    }
    out[code] = row;
  }
  return out;
}

/** {countries: {USA: {label: "United States"}}} or {groups: {...}}: code -> name. */
export function parseWeoNames(text: string, key: 'countries' | 'groups'): Record<string, string> | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const list = j?.[key];
  if (!list || typeof list !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [code, v] of Object.entries(list as Record<string, any>)) {
    const label = typeof v?.label === 'string' ? v.label.trim() : '';
    if (label) out[code] = label;
  }
  return out;
}

/** The edition the indicators come from, as the IMF names it: "World Economic Outlook (October 2026)". */
export function parseWeoEdition(text: string): string {
  try {
    const src = JSON.parse(text)?.indicators?.NGDP_RPCH?.source;
    return typeof src === 'string' ? src.trim() : '';
  } catch {
    return '';
  }
}

type Part<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

export const weoData = createStore<{ v: number; values: Record<string, Part<WeoValues>>; countries?: Part<Record<string, string>>; groups?: Part<Record<string, string>>; edition: string }>({ v: 0, values: {}, edition: '' });

export function weoAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.imf === 'function';
}

const bump = (f: (s: ReturnType<typeof weoData.get>) => Partial<ReturnType<typeof weoData.get>>) => weoData.set((s) => ({ ...s, ...f(s), v: s.v + 1 }));
const asked = new Map<string, number>();

async function ask(kind: 'weo' | 'countries' | 'groups' | 'indicators', arg = ''): Promise<{ text: string } | { error: string }> {
  try {
    const res = await window.arminDesktop!.imf!(kind, arg);
    return res.text ? { text: res.text } : { error: res.error ? `The IMF did not answer: ${res.error}` : `The IMF answered HTTP ${res.status}.` };
  } catch (err) {
    return { error: `The IMF did not answer: ${String((err as Error)?.message ?? err)}` };
  }
}

const due = (key: string) => {
  if (Date.now() - (asked.get(key) ?? 0) < 6 * 3_600_000) return false;
  asked.set(key, Date.now());
  return true;
};

async function loadIndicator(id: string) {
  if (!due(`v:${id}`)) return;
  bump((s) => (s.values[id]?.state === 'ok' ? {} : { values: { ...s.values, [id]: { state: 'loading' } } }));
  const r = await ask('weo', id);
  const data = 'text' in r ? parseWeoValues(r.text, id) : null;
  if (!data) asked.delete(`v:${id}`);
  bump((s) => ({ values: { ...s.values, [id]: data ? { state: 'ok', data } : { state: 'error', message: 'error' in r ? r.error : 'The IMF answered in a format the app does not recognise.' } } }));
}

async function loadNames(key: 'countries' | 'groups') {
  if (!due(key)) return;
  const r = await ask(key);
  const data = 'text' in r ? parseWeoNames(r.text, key) : null;
  if (!data) asked.delete(key);
  bump(() => ({ [key]: data ? { state: 'ok', data } : { state: 'error', message: 'error' in r ? r.error : 'unrecognised answer' } }));
}

async function loadEdition() {
  if (!due('edition')) return;
  const r = await ask('indicators');
  if ('text' in r) bump(() => ({ edition: parseWeoEdition(r.text) }));
  else asked.delete('edition');
}

/** An indicator's figures with the names and the edition, loading them while a screen shows them. */
export function useWeo(id: string) {
  weoData.use((s) => s.v);
  useEffect(() => {
    if (!weoAvailable()) return;
    void loadIndicator(id);
    void loadNames('countries');
    void loadNames('groups');
    void loadEdition();
  }, [id]);
  const s = weoData.get();
  const names = { ...(s.countries?.state === 'ok' ? s.countries.data : {}), ...(s.groups?.state === 'ok' ? s.groups.data : {}) };
  return { part: s.values[id], names, edition: s.edition };
}
