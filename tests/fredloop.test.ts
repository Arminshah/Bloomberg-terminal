import { afterEach, describe, expect, it, vi } from 'vitest';

// startFred talks to the desktop bridge; these tests stand in for it and count the requests.
type Answer = { status: number; text: string; missing?: string; refused?: string; throttled?: boolean };

function bridge(fred: () => Answer) {
  const calls = { fred: 0, official: 0 };
  (globalThis as { window?: unknown }).window = {
    arminDesktop: {
      fred: async () => {
        calls.fred++;
        return fred();
      },
      official: async () => {
        calls.official++;
        return { status: 200, text: '' };
      },
    },
  };
  return calls;
}

async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe('FRED refresh loop', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    delete (globalThis as { window?: unknown }).window;
  });

  it('does not keep asking while the key is missing', async () => {
    vi.useFakeTimers();
    const calls = bridge(() => ({ status: 0, text: '', missing: 'FRED_API_KEY' }));
    const { startFred, fredData } = await import('../src/data/live/fred');
    const stop = startFred();
    await settle();
    expect(fredData.get().needsKey).toBe(true);
    const official = calls.official;
    // The old loop asked again after 2 minutes, statistics offices included.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(calls.official).toBe(official);
    stop();
  });

  it('stops after the first refusal and does not retry every 2 minutes', async () => {
    vi.useFakeTimers();
    const calls = bridge(() => ({ status: 400, text: '', refused: 'Bad Request. The value for variable api_key is not registered.' }));
    const { startFred, fredData } = await import('../src/data/live/fred');
    const stop = startFred();
    await settle();
    // One series request and one release-dates request, then nothing more.
    expect(calls.fred).toBe(2);
    expect(fredData.get().keyRefused).toContain('not registered');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(calls.fred).toBe(2);
    stop();
  });

  it('retries after 2 minutes when FRED is throttling', async () => {
    vi.useFakeTimers();
    const calls = bridge(() => ({ status: 429, text: '', throttled: true }));
    const { startFred } = await import('../src/data/live/fred');
    const stop = startFred();
    await settle();
    expect(calls.fred).toBe(2);
    await vi.advanceTimersByTimeAsync(121_000);
    expect(calls.fred).toBe(4);
    stop();
  });
});
