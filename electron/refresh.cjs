// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
// The top bar's REFRESH, as the main process sees it. The page says when the owner asked for fresh data; for a
// short while after that, an answer this process kept from before the click counts as expired, so the page's
// requests reach the sources again instead of being answered from memory. Pacing, pauses after failures and
// daily caps still apply to every request that goes out (electron/requests.cjs, electron/providers.cjs).
//
// A source with a daily or monthly allowance is not asked again just because of a click: its kept answer
// stays while it is younger than KEEP_MS, as it would without a refresh.

/** How long after a click kept answers from before it count as expired: long enough for the page's requests. */
const WINDOW_MS = 2 * 60_000;
/** A source with an allowance keeps an answer younger than this through a refresh. */
const KEEP_MS = 60 * 60_000;

/**
 * `capped(provider)`: whether a provider has a daily or monthly allowance the app keeps to.
 * `now`: injectable clock, for the tests.
 */
function createRefresh({ capped = () => false, now = Date.now } = {}) {
  let at = 0;
  return {
    /** Records a refresh; returns its time. */
    mark() {
      at = now();
      return at;
    },
    /** When the last refresh was asked for (0: never). */
    at: () => at,
    /** True when an answer kept since `keptAt` must be asked for again because of a recent refresh. */
    expired(provider, keptAt) {
      if (!at || !(keptAt < at) || now() - at > WINDOW_MS) return false;
      return !capped(provider) || now() - keptAt >= KEEP_MS;
    },
  };
}

module.exports = { createRefresh, WINDOW_MS, KEEP_MS };
