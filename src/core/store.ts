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

const PREFIX = 'amber:';

/**
 * Minimal external store. With `persist`, state is mirrored to localStorage
 * (debounced) and restored on load, merged over `initial` for forward
 * compatibility when fields are added.
 */
export function createStore<T extends object>(initial: T, persist?: string, version = 1): Store<T> {
  const key = persist ? `${PREFIX}${persist}` : '';
  let state = initial;
  if (key) {
    const saved = loadJson<{ v: number; s: T }>(key);
    if (saved && saved.v === version && saved.s && typeof saved.s === 'object') {
      state = Array.isArray(initial) ? (saved.s as T) : { ...initial, ...saved.s };
    }
  }
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const store: Store<T> = {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      if (key) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => saveJson(key, { v: version, s: state }), 150);
      }
      for (const fn of listeners) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    use<S>(selector: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
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
