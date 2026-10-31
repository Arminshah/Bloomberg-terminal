// Types for selftest.cjs, for the tests that import it.
export interface SelfTest {
  id: string;
  provider: string;
  label: string;
  credentials?: string[];
  setting?: string;
  cost?: string;
  agent?: boolean;
  keyless?: boolean;
  binary?: boolean;
  slot?: [number, number];
  request: (keys: string[], now: number) => { url: string; headers?: Record<string, string>; accept?: string; method?: string; body?: string };
  /** The answer's text, or its bytes for a `binary` test. */
  read: (answer: string | Uint8Array, now?: number) => string;
}
export const TESTS: SelfTest[];
export function reportLine(r: { label: string; state: string; status?: number; ms?: number; detail: string }): string;
export function reportText(run: { at: number; version: string; platform: string; results: { label: string; state: string; status?: number; ms?: number; detail: string }[] }): string;
