// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fmtEarnDate } from '../core/format';
import { nextEarningsDisagreement, type EarningsEvent } from '../data/fundamentals';
import { useNasdaq } from '../data/live/nasdaq-company';
import type { SecurityDef } from '../data/types';

/**
 * The next report date as the screens show it, or "Sources disagree" (with both dates on hover) where Yahoo Finance
 * and Nasdaq confirm different days. Asks Nasdaq's date for a US stock, so the two can be compared.
 */
export function NextEarnings({ sec, ne, withTiming = true, prefix }: { sec: SecurityDef; ne: EarningsEvent | undefined; withTiming?: boolean; prefix?: React.ReactNode }) {
  useNasdaq(sec.eq ? sec : undefined, ['earnings-date']);
  const disagree = nextEarningsDisagreement(sec, ne);
  if (disagree)
    return (
      <span className="amber" title={disagree} data-testid="earnings-disagree">
        Sources disagree
      </span>
    );
  if (!ne) return <>--</>;
  return (
    <>
      {prefix}
      {fmtEarnDate(ne, withTiming)}
    </>
  );
}
