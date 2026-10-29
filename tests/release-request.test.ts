/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { releaseRequest } = require('../scripts/release-request.cjs');

describe('explicit branch release requests', () => {
  const branch = 'claude/market-events-v2.16.0-id814n';
  const request = { schema: 1, tag: 'v2.29.0', branch };
  it('accepts only a version-matched request for the pushed development branch', () => {
    expect(releaseRequest(request, '2.29.0', `refs/heads/${branch}`)).toBe('v2.29.0');
    expect(() => releaseRequest(request, '2.28.0', `refs/heads/${branch}`)).toThrow(/version/);
    expect(() => releaseRequest(request, '2.29.0', 'refs/heads/main')).toThrow(/branch/);
    expect(() => releaseRequest(request, '2.29.0', 'refs/tags/v2.29.0')).toThrow(/branch/);
  });
  it('rejects malformed schemas and tag/output injection', () => {
    for (const tag of ['latest', 'v2.29.0\ntag=evil', 'v2.29.0;exit 0']) expect(() => releaseRequest({ ...request, tag }, '2.29.0', `refs/heads/${branch}`)).toThrow();
    expect(() => releaseRequest({ ...request, schema: 2 }, '2.29.0', `refs/heads/${branch}`)).toThrow();
    expect(() => releaseRequest({ ...request, branch: '../main' }, '2.29.0', 'refs/heads/../main')).toThrow();
  });
});
