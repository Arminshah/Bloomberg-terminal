// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/* eslint-disable @typescript-eslint/no-explicit-any */
/** A block of a message to or from Claude, as the Messages API gives it. */
export type Block = { type: string; [k: string]: any };

/** What the main process answers for the help desk's Claude mode: Claude's next message, or why there is none. */
export interface AssistantAnswer {
  content?: Block[];
  stopReason?: string;
  model?: string;
  gated?: string;
  missing?: string;
  refused?: string;
  budget?: boolean;
  error?: string;
}
