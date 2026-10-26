import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

// Codes checked against the provider's own published chapter lists (docs/bloomberg-parity.md, evidence pack v3).
describe('Mnemonics from the official chapter lists', () => {
  it('opens LAYOUTS under LLP, the Launchpad code, as under LPAD', () => {
    expect(parseCommand('LLP', lookupFn)).toEqual({ kind: 'route', fn: 'LAYOUTS' });
    expect(parseCommand('LPAD', lookupFn)).toEqual({ kind: 'route', fn: 'LAYOUTS' });
  });
});
