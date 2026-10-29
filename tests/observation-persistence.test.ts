import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/core/store';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('observation archive persistence failures', () => {
  it('retains session data and reports storage failure instead of claiming the journal was saved', () => {
    vi.useFakeTimers();
    const onPersist = vi.fn();
    const storage = { getItem: () => null, setItem: vi.fn<(...args: string[]) => void>(() => { throw new Error('quota exceeded'); }) };
    vi.stubGlobal('localStorage', storage);
    const store = createStore({ observations: [1] }, 'journal-test', 1, { onPersist });
    store.set({ observations: [1, 2] });
    expect(onPersist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(151);
    expect(store.get().observations).toEqual([1, 2]);
    expect(onPersist).toHaveBeenLastCalledWith(false);
    storage.setItem.mockImplementation(() => {});
    store.set({ observations: [1, 2, 3] });
    vi.advanceTimersByTime(151);
    expect(onPersist).toHaveBeenLastCalledWith(true);
    expect(storage.setItem).toHaveBeenLastCalledWith('armin:journal-test', JSON.stringify({ v: 1, s: { observations: [1, 2, 3] } }));
  });
});
