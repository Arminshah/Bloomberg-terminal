import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/core/store';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('last-visible-state persistence', () => {
  it('restores the latest screen and link groups after closing before a pending autosave fires', () => {
    vi.useFakeTimers();
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const host = new EventTarget();
    vi.stubGlobal('window', host);
    const initial = { fn: 'CHART', security: 'AAPL', linkGroups: [0, 0] };
    const saved = { fn: 'PROFILE', security: 'EURUSD', linkGroups: [1, 1] };
    const workspace = createStore(initial, 'reload-workspace', 3);
    workspace.set({ fn: 'PROFILE', security: 'MSFT', linkGroups: [0, 0] });
    vi.advanceTimersByTime(150);
    workspace.set(saved);
    // No waiting for the debounce: an immediate reload must retain the new route and groups.
    expect(JSON.parse(data.get('armin:reload-workspace')!).s.security).toBe('MSFT');
    host.dispatchEvent(new Event('pagehide'));
    expect(createStore(initial, 'reload-workspace', 3).get()).toEqual(saved);
    expect(JSON.parse(data.get('armin:reload-workspace')!)).toEqual({ v: 3, s: saved });
    vi.runAllTimers();
    expect(JSON.parse(data.get('armin:reload-workspace')!).s).toEqual(saved);
  });
});
