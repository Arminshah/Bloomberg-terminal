import { describe, expect, it } from 'vitest';
import bojLoan from './fixtures/central-banks/boj-basic-loan-rate.json?raw';
import bojCall from './fixtures/central-banks/boj-call-rate.json?raw';
import ecbDfr from './fixtures/central-banks/ecb-dfr.csv?raw';
import ecbEstr from './fixtures/central-banks/ecb-estr.csv?raw';
import boeRate from './fixtures/central-banks/boe-bank-rate.csv?raw';
import boeSonia from './fixtures/central-banks/boe-sonia.csv?raw';
import { meetingsOf } from '../src/data/eco';
import { parseBoeCsv, parseBojJson, parseEcbCsv, toChanges } from '../src/data/live/policy';
import { lastMove } from '../src/functions/CBPORTAL';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

// The banks' own series as published (tests/fixtures/central-banks, fetched on 27 October 2026).
describe("the central banks' own series", () => {
  it("reads the Bank of Japan's Time-Series Data Search answers, leaving out days without a figure", () => {
    const loan = toChanges(parseBojJson(bojLoan))!;
    expect(loan.changes).toEqual([['2026-09-01', 1.25], ['2026-09-24', 1.5]]);
    const call = toChanges(parseBojJson(bojCall))!;
    // October's figures to the 23rd; the days after carry no value yet and are left out.
    expect(call.asOf).toBe('2026-10-23');
    expect(call.last).toBe(1.227);
    expect(parseBojJson('{"STATUS":400,"MESSAGE":"error"}')).toEqual([]);
    expect(parseBojJson('not json')).toEqual([]);
  });

  it('reads €STR from the ECB and Bank Rate and SONIA from the Bank of England', () => {
    expect(toChanges(parseEcbCsv(ecbEstr))).toMatchObject({ last: 2.442, asOf: '2026-10-23' });
    expect(toChanges(parseEcbCsv(ecbDfr))!.changes).toEqual([['2026-09-10', 2.25], ['2026-09-16', 2.5]]);
    expect(toChanges(parseBoeCsv(boeRate))!.changes).toEqual([['2025-12-10', 4], ['2025-12-18', 3.75]]);
    expect(toChanges(parseBoeCsv(boeSonia))).toMatchObject({ last: 3.7338, asOf: '2026-10-23' });
  });
});

describe('the last move and its separate calendar comparison', () => {
  it('does not promote a nearby scheduled meeting to a confirmed decision', () => {
    expect(lastMove(toChanges(parseEcbCsv(ecbDfr)), meetingsOf('ECB'))).toEqual({ since: '2026-09-16', level: 2.5, move: 0.25, scheduledCandidate: '2026-09-10' });
    const boj = lastMove(toChanges(parseBojJson(bojLoan)), meetingsOf('BOJ'))!;
    expect(boj).toMatchObject({ since: '2026-09-24', move: 0.25, scheduledCandidate: '2026-09-18' });
    expect(boj.meeting).toBeUndefined();
  });

  it('does not call a move older than the calendar unscheduled', () => {
    // Bank Rate's cut of 18 December 2025 comes before the calendar the app holds (from February 2026).
    const m = lastMove(toChanges(parseBoeCsv(boeRate)), meetingsOf('BOE'))!;
    expect(m).toEqual({ since: '2025-12-18', level: 3.75, move: -0.25 });
    // Calendar coverage alone cannot establish that a change came from an emergency decision.
    expect(lastMove({ changes: [['2026-01-01', 4], ['2026-08-20', 3.5]], last: 3.5, asOf: '2026-10-01' }, meetingsOf('BOE'))).toEqual({ since: '2026-08-20', level: 3.5, move: -0.5 });
  });

  it("keeps each bank's published decision days", () => {
    expect(meetingsOf('ECB')).toContain('2026-10-29');
    expect(meetingsOf('BOE')).toContain('2026-11-05');
    expect(meetingsOf('BOJ')).toContain('2026-10-30');
  });

  it('opens the portals under ECB, BOE and BOJ', () => {
    expect(parseCommand('ECB', lookupFn)).toEqual({ kind: 'route', fn: 'ECBPORTAL' });
    expect(parseCommand('BOE', lookupFn)).toEqual({ kind: 'route', fn: 'BOEPORTAL' });
    expect(parseCommand('BOJ', lookupFn)).toEqual({ kind: 'route', fn: 'BOJPORTAL' });
  });
});
