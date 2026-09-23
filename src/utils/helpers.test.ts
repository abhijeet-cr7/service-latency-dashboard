import type { LiveEvent } from '../types/event';
import { bucketSeries, computeKpis, filterEvents, lowerBoundByTs, readIntSetting } from './helpers';

const base: LiveEvent = {
  id: '0',
  ts: 0,
  source: 'api',
  severity: 'info',
  status: 'ok',
  latencyMs: 10,
  message: 'hello',
};
const ev = (i: number, p: Partial<LiveEvent> = {}): LiveEvent => ({ ...base, id: String(i), ts: i * 1000, ...p });

describe('filterEvents', () => {
  const events = [
    ev(1, { severity: 'error', source: 'payments' }),
    ev(2, { message: 'Cache refreshed' }),
    ev(3, { severity: 'critical' }),
    ev(4),
  ];
  const none = { severities: new Set<LiveEvent['severity']>(), windowMs: null, query: '' };

  it('returns the same array when no filter applies (no allocation)', () => {
    expect(filterEvents(events, none, 4000)).toBe(events);
  });

  it('applies the time window relative to asOf', () => {
    expect(filterEvents(events, { ...none, windowMs: 1500 }, 4000).map((e) => e.id)).toEqual(['3', '4']);
  });

  it('filters by severity set and case-insensitive query', () => {
    const sev = new Set<LiveEvent['severity']>(['error', 'critical']);
    expect(filterEvents(events, { ...none, severities: sev }, 4000).map((e) => e.id)).toEqual(['1', '3']);
    expect(filterEvents(events, { ...none, query: 'CACHE' }, 4000).map((e) => e.id)).toEqual(['2']);
    expect(filterEvents(events, { ...none, query: 'PAY' }, 4000).map((e) => e.id)).toEqual(['1']);
  });
});

describe('lowerBoundByTs', () => {
  it('binary-searches the first index at or after the target', () => {
    const events = [ev(1), ev(2), ev(3)];
    expect(lowerBoundByTs(events, 0)).toBe(0);
    expect(lowerBoundByTs(events, 2000)).toBe(1);
    expect(lowerBoundByTs(events, 2500)).toBe(2);
    expect(lowerBoundByTs(events, 9999)).toBe(3);
  });
});

describe('computeKpis', () => {
  it('handles an empty feed', () => {
    const k = computeKpis([]);
    expect(k).toMatchObject({ count: 0, avgLatencyMs: null, p95LatencyMs: null, errorRatePct: null });
  });

  it('derives averages, p95, error rate and latest status per source', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      ev(i, { latencyMs: i + 1, severity: i < 2 ? 'error' : 'info', source: i % 2 ? 'a' : 'b' }),
    );
    events.push(ev(21, { source: 'a', status: 'down' }));
    const k = computeKpis(events);
    expect(k.count).toBe(21);
    expect(k.p95LatencyMs).toBe(19); // nearest-rank p95 of 1..20 plus an extra 10
    expect(k.errorCount).toBe(2);
    expect(k.statusCounts).toEqual({ ok: 1, degraded: 0, down: 1 });
  });
});

describe('bucketSeries', () => {
  it('aggregates avg/max per bucket and leaves gaps as null', () => {
    const events = [ev(0, { latencyMs: 10 }), { ...ev(0, { latencyMs: 30 }), ts: 500 }, ev(2, { latencyMs: 5 })];
    const s = bucketSeries(events, 1000, 0, 2000);
    expect(s.x).toEqual([0, 1, 2]);
    expect(s.avg).toEqual([20, null, 5]);
    expect(s.max).toEqual([30, null, 5]);
  });
});

describe('readIntSetting', () => {
  it('falls back on junk and clamps into range', () => {
    expect(readIntSetting(undefined, 5, 1, 10)).toBe(5);
    expect(readIntSetting('abc', 5, 1, 10)).toBe(5);
    expect(readIntSetting('999', 5, 1, 10)).toBe(10);
    expect(readIntSetting('3.6', 5, 1, 10)).toBe(4);
  });
});
