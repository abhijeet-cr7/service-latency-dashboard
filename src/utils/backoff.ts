export interface BackoffOptions {
  /** Delay before the first retry, in ms. */
  readonly baseMs: number;
  /** Upper bound for any single delay, in ms. */
  readonly maxMs: number;
  /** Give up and enter the `error` state after this many consecutive failures. */
  readonly maxAttempts: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 500,
  maxMs: 15_000,
  maxAttempts: 8,
};

/**
 * Exponential backoff with "full jitter": a random delay in
 * [0, min(max, base * 2^attempt)]. Jitter keeps many clients from reconnecting
 * in lockstep (thundering herd) after a server blip. A floor of base/2 keeps a
 * flapping connection from spinning in a tight loop.
 *
 * @param attempt zero-based failure count
 */
export function backoffDelay(
  attempt: number,
  { baseMs, maxMs }: Pick<BackoffOptions, 'baseMs' | 'maxMs'> = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.max(baseMs / 2, Math.round(random() * exp));
}
