// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { back } from './state';

/**
 * A screen's own page that Back leaves before the screen itself, as EQS's results return to its criteria ("1 <GO> for
 * Results, <Back> to Return", TE04 03:01). The screen sets a handler while that page shows; Back runs it first.
 */
const handlers = new Map<number, () => void>();

export function setSubpageBack(panel: number, run: (() => void) | undefined): void {
  if (run) handlers.set(panel, run);
  else handlers.delete(panel);
}

/** Back in a panel: out of the screen's own page when it shows one, else to the screen before. */
export function panelBack(panel: number): void {
  const run = handlers.get(panel);
  if (run) {
    handlers.delete(panel);
    run();
    return;
  }
  back(panel);
}
