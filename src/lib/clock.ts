/**
 * Injectable clock seam — every "now", expiry, retention, and timestamp
 * decision routes through `now()` so tests can freeze time.
 */

let _now: () => number = () => Date.now();

/** Current wall-clock time in epoch ms (overridable in tests). */
export function now(): number {
  return _now();
}

/** Override the clock (tests). Pass a function that returns epoch ms. */
export function setNow(fn: () => number): void {
  _now = fn;
}

/** Restore the real wall clock. */
export function resetNow(): void {
  _now = () => Date.now();
}
