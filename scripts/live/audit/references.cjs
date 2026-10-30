'use strict';

/** A completed screen session needs the same dated reference, never the previous available bar. */
function referenceEnd(bars, shownDay, today) {
  return shownDay ? bars.findIndex((bar) => bar.day === shownDay) : bars.findLastIndex((bar) => bar.day < today);
}

/** Invalid reference prices cannot establish that the application's price is wrong. */
function invalidDailyBars(bars) {
  const seen = new Set();
  for (const bar of bars) {
    const day = String(bar.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || seen.has(day)) return `invalid or duplicate daily reference date: ${day}`;
    seen.add(day);
    if (['open', 'high', 'low', 'close'].some((field) => !Number.isFinite(bar[field]) || bar[field] <= 0) || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) return `inconsistent daily reference OHLC for ${day}`;
    if (!Number.isFinite(bar.volume) || bar.volume < 0 || (bar.splitFactor != null && (!Number.isFinite(bar.splitFactor) || bar.splitFactor <= 0))) return `invalid daily reference volume or split factor for ${day}`;
  }
  return undefined;
}

/** Keep the split basis at the displayed session; later corporate actions belong to a later basis. */
function splitFactorsAt(bars, end) {
  const factors = Array(bars.length).fill(NaN);
  let factor = 1;
  for (let i = end; i >= 0; i--) {
    factors[i] = factor;
    factor *= bars[i].splitFactor ?? 1;
  }
  return factors;
}

/** Space the audit's requests below a five-per-minute free-plan limit. */
function requestBudget({ intervalMs = 15_500, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let next = 0;
  let pending = Promise.resolve();
  return { wait() {
    const run = pending.then(async () => {
      const delay = Math.max(0, next - now());
      if (delay) await sleep(delay);
      next = now() + intervalMs;
    });
    pending = run.catch(() => undefined);
    return run;
  } };
}

module.exports = { referenceEnd, invalidDailyBars, splitFactorsAt, requestBudget };
