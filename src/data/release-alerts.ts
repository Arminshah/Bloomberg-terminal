// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { createStore } from '../core/store';

/**
 * ECO's release alerts (the M column's bells): a release, by country and name, rings once its actual is out. The app
 * keeps them on this computer; the background watch fires each release once.
 */
export const releaseAlerts = createStore<{ keys: string[]; fired: Record<string, number> }>({ keys: [], fired: {} }, 'releasealerts', 1);

/** The alert's key: the same release on every date it comes out. */
export const releaseKey = (country: string, name: string): string => `${country}|${name}`;

export function hasReleaseAlert(country: string, name: string): boolean {
  return releaseAlerts.get().keys.includes(releaseKey(country, name));
}

/** Sets the bell or takes it off; true when it is now set. */
export function toggleReleaseAlert(country: string, name: string): boolean {
  const k = releaseKey(country, name);
  const on = !releaseAlerts.get().keys.includes(k);
  releaseAlerts.set((s) => ({ ...s, keys: on ? [...s.keys, k] : s.keys.filter((x) => x !== k) }));
  return on;
}

/**
 * The releases that should ring now: each alerted release whose actual is out within the last day and has not rung.
 * Marks them rung.
 */
export function dueReleaseAlerts<T extends { id: string; country: string; name: string; actual: string; time: number }>(rows: T[], now: number): T[] {
  const st = releaseAlerts.get();
  if (!st.keys.length) return [];
  const due = rows.filter((r) => r.actual && now - r.time < 86_400_000 && r.time <= now && st.keys.includes(releaseKey(r.country, r.name)) && !st.fired[r.id]);
  if (due.length) {
    // Rung releases older than a week are forgotten, so the record stays small.
    const keep = Object.fromEntries(Object.entries(st.fired).filter(([, t]) => now - t < 7 * 86_400_000));
    releaseAlerts.set((s) => ({ ...s, fired: { ...keep, ...Object.fromEntries(due.map((r) => [r.id, now])) } }));
  }
  return due;
}
