// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { createContext, useContext, useEffect, useRef } from 'react';
import type { MenuItem, Route } from './types';
import { navigate } from './state';
import { createStore } from '../core/store';
import type { SecurityDef } from '../data/types';
import { groupedRowNumbers, rowNumbers } from './numbering';

export const PanelContext = createContext(0);

export function usePanelId(): number {
  return useContext(PanelContext);
}

/** Numbered menu items per panel ("3 <GO>"). */
export const panelMenus = new Map<number, Map<string, MenuItem[]>>();

/** Registers numbered items for the current panel while mounted. */
export function useMenu(owner: string, items: MenuItem[]) {
  const panel = usePanelId();
  const ref = useRef(items);
  ref.current = items;
  useEffect(() => {
    let byOwner = panelMenus.get(panel);
    if (!byOwner) panelMenus.set(panel, (byOwner = new Map()));
    // Wrap so the latest closures run.
    byOwner.set(
      owner,
      ref.current.map((it, i) => ({ ...it, run: () => ref.current[i]?.run() })),
    );
    return () => {
      panelMenus.get(panel)?.delete(owner);
    };
  }, [panel, owner, items.length, items.map((i) => i.n).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Numbers a list's rows from `first` (skipping 96 to 99) and registers them, so `n <GO>` opens row n as a click
 * on it would. Returns each row's number, in the order given; rows past 999 have none.
 */
export function useNumberedRows<T>(owner: string, rows: T[], first: number, open: (row: T) => void, label: (row: T) => string): number[] {
  const nums = rowNumbers(first, rows.length);
  useMenu(owner, nums.map((n, i) => ({ n, label: label(rows[i]), run: () => open(rows[i]) })));
  return nums;
}

/** The owner whose numbers win while it is registered: the Related Functions Menu laid over a screen. */
export const OVERLAY_MENU = 'related-menu';

export function menuItem(panel: number, n: number): MenuItem | undefined {
  const byOwner = panelMenus.get(panel);
  if (!byOwner) return undefined;
  const over = byOwner.get(OVERLAY_MENU);
  if (over?.length) return over.find((i) => i.n === n);
  for (const items of byOwner.values()) {
    const hit = items.find((i) => i.n === n);
    if (hit) return hit;
  }
  return undefined;
}

export interface PanelMessage {
  text: string;
  kind: 'error' | 'info';
  at: number;
}

export const panelMessages = createStore<Record<number, PanelMessage | undefined>>({});

export function flash(panel: number, text: string, kind: 'error' | 'info' = 'info') {
  panelMessages.set((m) => ({ ...m, [panel]: { text, kind, at: Date.now() } }));
}

export function clearFlash(panel: number) {
  if (panelMessages.get()[panel]) panelMessages.set((m) => ({ ...m, [panel]: undefined }));
}

/** Opens a route in this panel (or another one). */
export function useOpen() {
  const panel = usePanelId();
  return (route: Route, target = panel) => navigate(target, route);
}

/** Default function when a security is clicked in a list. */
export function defaultFnFor(def: SecurityDef): string {
  return def.cls === 'equity' ? 'PROFILE' : def.cls === 'bond' ? 'BONDCALC' : 'CHART';
}

/**
 * Numbers a grouped monitor's rows by `groupedRowNumbers` and registers the rows of the groups shown, so `n <GO>`
 * opens row n as a click on it would. Returns each group's numbers, in the order given.
 */
export function useGroupedRows<T>(owner: string, groups: T[][], shown: boolean[], open: (row: T) => void, label: (row: T) => string): number[][] {
  const nums = groupedRowNumbers(groups.map((g) => g.length));
  const items: MenuItem[] = [];
  groups.forEach((g, gi) => {
    if (shown[gi]) g.forEach((row, i) => items.push({ n: nums[gi][i], label: label(row), run: () => open(row) }));
  });
  useMenu(owner, items);
  return nums;
}
