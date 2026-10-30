import type { EquityInfo, SecurityDef } from '../types';

/** Evidence attached to the actual count used in price × shares, in millions. */
export interface ShareBasis {
  shares: number;
  source: string;
  method: 'current-market-cap-pair' | 'reported';
  /** When this answer was observed, not when a later screen used it. */
  observedAt: number;
  sourceTime?: number;
  marketCap?: number;
  /** Price in the line's quoted units (pence for a GBp line). */
  price?: number;
  /** Only when explicitly supplied by the source. */
  currency?: string;
  classMultiplier?: number;
}

const evidence = new WeakMap<EquityInfo, ShareBasis>();

export function setObservedShares(def: SecurityDef, basis: ShareBasis): void {
  if (!def.eq || !(basis.shares > 0) || !Number.isFinite(basis.shares)) return;
  def.eq.shares = basis.shares;
  evidence.set(def.eq, { ...basis });
}

/** Never attribute an untracked replacement count to an earlier observation. */
export function observedShareBasis(def: SecurityDef): ShareBasis | undefined {
  const basis = def.eq && evidence.get(def.eq);
  return basis && basis.shares === def.eq?.shares ? { ...basis } : undefined;
}
