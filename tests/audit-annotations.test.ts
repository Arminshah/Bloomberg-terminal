/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { formatAnnotations, MAX_OUTPUT_BYTES } = require('../scripts/live/audit/annotate.cjs');
const summary = { assurance: 'incomplete', exitCode: 1, pass: 20, fail: 1, flagged: 1, blocked: 1, incomplete: 1, skip: 2 };

describe('public audit diagnostics', () => {
  it('includes assurance, counts and numeric failure evidence before other unresolved rows', () => {
    const output = formatAnnotations({ summary, rows: [
      { status: 'BLOCKED', area: 'policy', item: 'FED', field: 'statement', kind: 'network-policy', detail: 'reference refused' },
      { status: 'PASS', area: 'quote', item: 'AAPL', field: 'close' },
      { status: 'FAIL', area: 'quote', item: 'WMT', field: 'Volume', app: 14270000, ref: 14460000, allowed: 144600, refName: 'Independent daily bar', detail: 'same session' },
      { status: 'FLAGGED', area: 'earnings', item: 'APLD', field: 'EPS', detail: 'comparable sources disagree', candidates: [{ source: 'A', value: -0.1 }] },
      { status: 'INCOMPLETE', area: 'supply-chain', item: 'NVDA', field: 'coverage', detail: 'bounded extraction' },
    ] }, {});
    expect(output).toContain('::error::Data audit: assurance=incomplete; exit=1; PASS=20; FAIL=1; FLAGGED=1; BLOCKED=1; INCOMPLETE=1; SKIP=2');
    expect(output).toContain('%0AFAIL | area=quote | item=WMT | field=Volume | app=14270000 | ref=14460000 | allowed=144600 | source=Independent daily bar | detail=same session');
    expect(output.indexOf('%0AFAIL')).toBeLessThan(output.indexOf('%0AFLAGGED'));
    expect(output).toContain('network-policy; reference refused');
    expect(output).toContain('bounded extraction');
    expect(output).toContain('4 unresolved rows shown; 0 unresolved rows omitted');
    expect(output).not.toContain('field=close');
  });

  it('redacts credentials, prevents multiline command injection and reports bounded omissions', () => {
    const secret = 'SyntheticAnnotationSecret123';
    const detail = `https://example.invalid/?apikey=${secret}\r\n::notice::injected %0A Bearer otherSecret123 ${secret}`;
    const rows = Array.from({ length: 2000 }, (_, i) => ({ status: i === 0 ? 'FAIL' : 'BLOCKED', area: 'test', item: `${i}`, field: 'provider text', app: 1, ref: 2, allowed: 0, detail: detail.repeat(8), Authorization: secret }));
    const output = formatAnnotations({ summary, rows }, { FINNHUB_API_KEY: secret });
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(output).not.toContain(secret);
    expect(output).not.toContain('otherSecret123');
    expect(output).not.toContain('\r');
    expect(output).not.toContain('\n::notice::injected');
    expect(output).toContain('%0D%0A::notice::injected %250A');
    expect(output).toContain('app=1 | ref=2 | allowed=0');
    expect(output).toMatch(/[1-9]\d* unresolved rows omitted by the 48 KiB annotation limit/);
    expect(output.trim().split('\n')).toHaveLength(1);
    expect(output).toMatch(/^::error::/);
  });

  it('packs more than ten failures into one annotation without losing their evidence', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ status: 'FAIL', area: 'financials', item: `COMPANY${i}`, field: 'Income', app: i, ref: i + 1, allowed: 0, refName: 'Filed report' }));
    const output = formatAnnotations({ summary: { ...summary, fail: rows.length }, rows }, {});
    expect(output.trim().split('\n')).toHaveLength(1);
    expect(output.match(/%0AFAIL \|/g)).toHaveLength(15);
    expect(output).toContain('item=COMPANY14 | field=Income | app=14 | ref=15 | allowed=0 | source=Filed report');
    expect(output).toContain('15 unresolved rows shown; 0 unresolved rows omitted');
  });
});
