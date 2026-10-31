// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * Numbered rows, as terminal monitors and news lists show them: "12) S&P 500 INDEX", where typing 12 and GO
 * does what clicking the row does. 96 to 99 belong to the function bar's actions (Table, Compare, Copy,
 * Export), so lists number around them.
 */
const RESERVED = new Set([96, 97, 98, 99]);

/** The numbers of `count` rows starting at `first`, skipping 96 to 99 and stopping at three digits. */
export function rowNumbers(first: number, count: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(1, Math.floor(first)); out.length < count && n <= 999; n++) if (!RESERVED.has(n)) out.push(n);
  return out;
}

/**
 * The first row number that clears a screen's own numbered tabs and actions: the next ten after the highest
 * one below 96 (tabs 1 to 4 give 11, regions 11 to 14 give 21), or 1 when the screen has none.
 */
export function firstRowNumber(used: number[]): number {
  const top = Math.max(0, ...used.filter((n) => n < 96));
  return top === 0 ? 1 : Math.floor(top / 10) * 10 + 11;
}

/**
 * Row numbers for a monitor in groups, as WEI and GLCO number them: each group starts on its own ten (11) for the
 * Americas, 21) for EMEA, 31) for Asia), or on the next ten after a group longer than nine rows. The numbers stay
 * with their rows when another group is collapsed. Groups are given by their row counts.
 */
export function groupedRowNumbers(sizes: number[], first = 11): number[][] {
  const out: number[][] = [];
  let start = first;
  for (const size of sizes) {
    const nums = rowNumbers(start, size);
    out.push(nums);
    const last = nums.length ? nums[nums.length - 1] : start - 1;
    start = Math.max(start + 10, Math.floor(last / 10) * 10 + 11);
  }
  return out;
}
