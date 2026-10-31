// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/** The history coverage offered by the explicitly selected IEX snapshot source. */
export function IexHistoryNotice({ intraday = false }: { intraday?: boolean }) {
  return <div className="note">{intraday
    ? 'IEX only: price observations collected since this app opened. Trades between observations and their volume are unknown.'
    : 'IEX only for the previous and latest sessions, and for the last price. Earlier days are consolidated daily bars from Yahoo Finance.'}</div>;
}
