// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { MarketEngine } from './engine';
import type { Quote, SecurityDef } from './types';

/** The one market for the whole app. */
export const engine = new MarketEngine();

export function useQuote(id: string | undefined): Quote | undefined {
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => (id ? engine.quote(id) : undefined),
  );
}

/** Re-renders on every engine tick (or every `every` ticks). */
export function useTick(every = 1): number {
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => Math.floor(engine.tickCount / every),
  );
}

/** Re-renders when histories are rebuilt (day rollover, live anchors). */
export function useHistoryVersion(): number {
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => engine.version,
  );
}

/** Re-renders every `ms` regardless of ticks (clocks, countdowns). */
export function useInterval(ms: number): number {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(bump, ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

export function sec(id: string | undefined): SecurityDef | undefined {
  return id ? engine.get(id) : undefined;
}
