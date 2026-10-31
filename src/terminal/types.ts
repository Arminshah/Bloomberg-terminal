// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { ComponentType } from 'react';
import type { AssetClass, SecurityDef } from '../data/types';

export interface Route {
  fn: string;
  sec?: string;
  /** Free-form arguments typed after the mnemonic, e.g. "NEWS TECH". */
  args?: string;
}

/** The fixed arrangements of the layout picker. */
export type FixedLayoutId = '1' | '2' | '2v' | '3' | '4' | '5' | '6';
/** A fixed arrangement, or 'rows': a layout of your own, rows with their own tiles (rows-layout.ts). */
export type LayoutId = FixedLayoutId | 'rows';

export interface FnProps {
  route: Route;
  sec?: SecurityDef;
}

export type FnCategory =
  | 'Equity'
  | 'Charts'
  | 'News'
  | 'Markets'
  | 'FX & Crypto'
  | 'Rates & Credit'
  | 'Commodities'
  | 'Economics'
  | 'Derivatives'
  | 'Portfolio & Tools'
  | 'Communication'
  | 'System';

export interface FnDef {
  code: string;
  name: string;
  category: FnCategory;
  desc: string;
  /** Requires a loaded security. */
  needsSec?: boolean;
  /** Restricts to asset classes (when a security is loaded). */
  classes?: AssetClass[];
  aliases?: string[];
  component: ComponentType<FnProps>;
  /** Example command shown in HELP. */
  example?: string;
  /** Why the desktop app has no data for this screen, when it has none; menus mark it. */
  unavailable?: string;
  /** Words after the function are a topic unless they name a stock: "TOP Oil" is oil news, not the crude future. */
  topics?: boolean;
  /** White text on the row under the command line, as the 2024 frames show for a function's mode ("<Back> to Return"). */
  hint?: string;
  /** Two related functions for the panel's "Suggested Functions" footer, on screens the 2024 frames show one on. */
  suggested?: [string, string];
}

export interface MenuItem {
  n: number;
  label: string;
  run: () => void;
}
