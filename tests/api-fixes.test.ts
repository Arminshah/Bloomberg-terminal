import { describe, expect, it, vi } from 'vitest';
import * as providers from '../electron/providers.cjs';

describe('one answer for every window (CoinGecko\'s monthly allowance)', () => {
  it('fetches once for callers at the same time and serves the fresh answer after', async () => {
    let t = 0;
    const now = () => t;
    const fetcher = vi.fn(async () => ({ status: 200, text: 'x' }));
    const keep = (r: { status: number; text: string }) => r.status === 200 && !!r.text;
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => providers.shared('t-cg', 'key1', 1000, fetcher, keep, now)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([a, b, c].every((x) => x.text === 'x')).toBe(true);
    t = 999;
    await providers.shared('t-cg', 'key1', 1000, fetcher, keep, now);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 1000;
    await providers.shared('t-cg', 'key1', 1000, fetcher, keep, now);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('asks again with another key, and does not keep a failure', async () => {
    const now = () => 0;
    const keep = (r: { status: number }) => r.status === 200;
    const ok = vi.fn(async () => ({ status: 200 }));
    await providers.shared('t-cg2', 'key1', 1000, ok, keep, now);
    await providers.shared('t-cg2', 'key2', 1000, ok, keep, now);
    expect(ok).toHaveBeenCalledTimes(2);
    const fail = vi.fn(async () => ({ status: 429 }));
    await providers.shared('t-cg3', 'k', 1000, fail, keep, now);
    await providers.shared('t-cg3', 'k', 1000, fail, keep, now);
    expect(fail).toHaveBeenCalledTimes(2);
    const boom = vi.fn(async () => { throw new Error('network'); });
    await expect(providers.shared('t-cg4', 'k', 1000, boom, keep, now)).rejects.toThrow('network');
    await expect(providers.shared('t-cg4', 'k', 1000, boom, keep, now)).rejects.toThrow('network');
    expect(boom).toHaveBeenCalledTimes(2);
  });
});
