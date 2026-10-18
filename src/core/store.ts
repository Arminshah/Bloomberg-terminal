import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
  use<S>(selector: (s: T) => S): S;
}

/** Reads from localStorage defensively; storage may be unavailable. */
export function loadJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: state stays in memory */
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const PREFIX = 'armin:';

/**
 * Desktop windows after the first open with ?w=N. Each window keeps its own
 * panel layout; everything else (watchlists, portfolio, orders, settings) is
 * shared and kept in sync across windows.
 */
export const WINDOW_ID: number = (() => {
  try {
    const w = Number(new URLSearchParams(globalThis.location?.search ?? '').get('w'));
    return Number.isInteger(w) && w > 1 ? w : 1;
  } catch {
    return 1;
  }
})();

/** One-time move of data saved under the app's previous name. */
(function migrate() {
  try {
    const old = 'amber:';
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(old)) keys.push(k);
    }
    for (const k of keys) {
      const next = PREFIX + k.slice(old.length);
      if (localStorage.getItem(next) == null) localStorage.setItem(next, localStorage.getItem(k) ?? '');
      localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
})();

/**
 * Minimal external store. With `persist`, state is mirrored to localStorage
 * (debounced) and restored on load, merged over `initial` for forward
 * compatibility when fields are added.
 */
export function createStore<T extends object>(initial: T, persist?: string, version = 1, opts: { perWindow?: boolean } = {}): Store<T> {
  const key = persist ? `${PREFIX}${persist}${opts.perWindow && WINDOW_ID > 1 ? `:w${WINDOW_ID}` : ''}` : '';
  const restore = (saved: { v: number; s: T } | undefined): T | undefined => {
    if (saved && saved.v === version && saved.s && typeof saved.s === 'object') {
      return Array.isArray(initial) ? (saved.s as T) : { ...initial, ...saved.s };
    }
    return undefined;
  };
  let state = (key && restore(loadJson<{ v: number; s: T }>(key))) || initial;
  const listeners = new Set<() => void>();
  if (key && typeof window !== 'undefined') {
    // Another window saved this store: adopt its state without saving it back.
    window.addEventListener('storage', (e) => {
      if (e.key !== key || !e.newValue) return;
      try {
        const next = restore(JSON.parse(e.newValue) as { v: number; s: T });
        if (!next) return;
        state = next;
        for (const fn of listeners) fn();
      } catch {
        /* ignore malformed data */
      }
    });
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    saveJson(key, { v: version, s: state });
  };
  // A reload/close can happen before the debounced write. Persist the last visible state.
  if (key && typeof window !== 'undefined') window.addEventListener('pagehide', flush);
  const store: Store<T> = {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      if (key) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 150);
      }
      for (const fn of listeners) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    use<S>(selector: (s: T) => S): S {
      return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state));
    },
  };
  return store;
}

export function clearPersisted() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
