import { afterEach, describe, expect, it, vi } from 'vitest';
import pkg from '../package.json';
import { APP_VERSION, compareVersions, releaseNote, RELEASES, releaseSummary } from '../src/data/releases';
import { lookupFn } from '../src/terminal/registry';

describe('release notes in the app (WHATSNEW)', () => {
  it('carries this version\'s notes, newest first', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(releaseNote()?.text).toContain(`# Armin Terminal ${APP_VERSION}`);
    expect(RELEASES[0].version).toBe(RELEASES.map((r) => r.version).sort((a, b) => compareVersions(b, a))[0]);
    for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBeGreaterThan(0);
    expect(RELEASES.some((r) => r.version === '2.15.0')).toBe(true);
    expect(RELEASES.some((r) => r.version === '2.14.0')).toBe(false);
    expect(releaseSummary(releaseNote()!)).toMatch(/^This release/);
  });

  it('never shows another product\'s name', () => {
    for (const r of RELEASES) expect(r.text, r.version).not.toMatch(/bloomberg/i);
  });

  it('orders versions by number, not as text', () => {
    expect(compareVersions('2.10.0', '2.9.1')).toBeGreaterThan(0);
    expect(compareVersions('2.24.0', '2.24.0')).toBe(0);
    expect(compareVersions('2.3.1', '2.23.0')).toBeLessThan(0);
  });

  it('opens with WHATSNEW and its aliases', () => {
    for (const code of ['WHATSNEW', 'VERSION', 'RELEASENOTES', 'CHANGELOG']) expect(lookupFn(code)?.code, code).toBe('WHATSNEW');
  });
});

describe('the notice after an update', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const storage = (seen?: string) => {
    const m = new Map<string, string>(seen ? [['armin:seen-version', JSON.stringify(seen)]] : []);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: () => null, length: 0, map: m };
  };

  it('shows once after an update, and not on a first start or the same version', async () => {
    for (const [seen, shown] of [['2.0.0', true], [undefined, false], [pkg.version, false]] as const) {
      vi.resetModules();
      const ls = storage(seen);
      vi.stubGlobal('localStorage', ls);
      const { toasts } = await import('../src/terminal/toasts');
      const { announceUpdate } = await import('../src/terminal/whatsnew');
      announceUpdate();
      expect(toasts.get().some((t) => t.command === 'WHATSNEW'), String(seen)).toBe(shown);
      expect(ls.map.get('armin:seen-version')).toBe(JSON.stringify(pkg.version));
      announceUpdate();
      expect(toasts.get().filter((t) => t.command === 'WHATSNEW').length).toBe(shown ? 1 : 0);
    }
  });
});
