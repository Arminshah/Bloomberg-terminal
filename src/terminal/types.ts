import type { ComponentType } from 'react';
import type { AssetClass, SecurityDef } from '../data/types';

export interface Route {
  fn: string;
  sec?: string;
  /** Free-form arguments typed after the mnemonic, e.g. "NEWS TECH". */
  args?: string;
}

export type LayoutId = '1' | '2' | '2v' | '3' | '4' | '5' | '6';

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
}

export interface MenuItem {
  n: number;
  label: string;
  run: () => void;
}
