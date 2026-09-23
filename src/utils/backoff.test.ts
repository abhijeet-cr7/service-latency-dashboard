import { backoffDelay } from './backoff';

const opts = { baseMs: 500, maxMs: 15_000 };

describe('backoffDelay', () => {
  it('grows exponentially (upper bound with random = 1)', () => {
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, opts, () => 1))).toEqual([500, 1000, 2000, 4000]);
  });

  it('is capped at maxMs', () => {
    expect(backoffDelay(20, opts, () => 1)).toBe(15_000);
  });

  it('applies jitter but never goes below base/2 (no tight loops)', () => {
    expect(backoffDelay(5, opts, () => 0)).toBe(250);
    const d = backoffDelay(3, opts, () => 0.5);
    expect(d).toBe(2000);
  });
});
