import type { LiveEvent, ServiceStatus, Severity } from '../types/event';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Parses a numeric env/config value, falling back and clamping into range. */
export function readIntSetting(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatNumber = (n: number): string => numberFormat.format(n);
export const formatCompact = (n: number): string => compactFormat.format(n);
export const formatTime = (ts: number): string => timeFormat.format(ts);
export const formatMs = (n: number): string => `${numberFormat.format(n)} ms`;

export interface EventFilters {
  /** Severities to include. Empty means all. */
  readonly severities: ReadonlySet<Severity>;
  /** Time window in ms relative to `asOf`. `null` = whole buffer. */
  readonly windowMs: number | null;
  /** Case-insensitive substring match on source/message. */
  readonly query: string;
}

/**
 * Applies filters in one pass. `events` is sorted oldest → newest, so the
 * time window cut-off is found with a binary search instead of a full scan.
 */
export function filterEvents(
  events: readonly LiveEvent[],
  filters: EventFilters,
  asOf: number,
): readonly LiveEvent[] {
  const start = filters.windowMs === null ? 0 : lowerBoundByTs(events, asOf - filters.windowMs);
  const q = filters.query.trim().toLowerCase();
  const anySeverity = filters.severities.size === 0;

  if (start === 0 && anySeverity && q === '') return events;

  const out: LiveEvent[] = [];
  for (let i = start; i < events.length; i += 1) {
    const e = events[i] as LiveEvent;
    if (!anySeverity && !filters.severities.has(e.severity)) continue;
    if (q !== '' && !e.source.toLowerCase().includes(q) && !e.message.toLowerCase().includes(q)) {
      continue;
    }
    out.push(e);
  }
  return out;
}

/** Index of the first event with ts >= target (events sorted by ts). */
export function lowerBoundByTs(events: readonly LiveEvent[], target: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid] as LiveEvent).ts < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface KpiSummary {
  readonly count: number;
  readonly avgLatencyMs: number | null;
  readonly p95LatencyMs: number | null;
  readonly errorCount: number;
  readonly errorRatePct: number | null;
  /** Latest known status per source, aggregated. */
  readonly statusCounts: Readonly<Record<ServiceStatus, number>>;
}

/** Derives KPI values from the (filtered) events in a single pass plus one sort. */
export function computeKpis(events: readonly LiveEvent[]): KpiSummary {
  const latestStatus = new Map<string, ServiceStatus>();
  const latencies = new Float64Array(events.length);
  let sum = 0;
  let errors = 0;

  events.forEach((e, i) => {
    latencies[i] = e.latencyMs;
    sum += e.latencyMs;
    if (e.severity === 'error' || e.severity === 'critical') errors += 1;
    latestStatus.set(e.source, e.status); // oldest → newest, so the last write wins
  });

  const statusCounts: Record<ServiceStatus, number> = { ok: 0, degraded: 0, down: 0 };
  latestStatus.forEach((s) => {
    statusCounts[s] += 1;
  });

  const count = events.length;
  let p95: number | null = null;
  if (count > 0) {
    latencies.sort();
    p95 = latencies[Math.min(count - 1, Math.ceil(count * 0.95) - 1)] ?? null;
  }

  return {
    count,
    avgLatencyMs: count > 0 ? sum / count : null,
    p95LatencyMs: p95,
    errorCount: errors,
    errorRatePct: count > 0 ? (errors / count) * 100 : null,
    statusCounts,
  };
}

const BUCKET_STEPS_MS = [1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000];
const MAX_CHART_POINTS = 300;

/** Picks a bucket size so the chart never draws more than ~300 points, whatever the window. */
export function pickBucketMs(spanMs: number): number {
  return BUCKET_STEPS_MS.find((b) => spanMs / b <= MAX_CHART_POINTS) ?? 60_000;
}

export interface SeriesData {
  /** Bucket start times, in seconds (uPlot's x unit). */
  readonly x: number[];
  readonly avg: (number | null)[];
  readonly max: (number | null)[];
}

/**
 * Buckets events into fixed intervals (avg + max latency per bucket). The chart
 * point count then depends on the time span, not on the message rate, so a
 * burst of 10k msgs/s draws as cheaply as 10 msgs/s.
 */
export function bucketSeries(
  events: readonly LiveEvent[],
  bucketMs: number,
  fromTs: number,
  toTs: number,
): SeriesData {
  const first = Math.floor(fromTs / bucketMs) * bucketMs;
  const n = Math.max(1, Math.floor((toTs - first) / bucketMs) + 1);
  const sums = new Float64Array(n);
  const counts = new Uint32Array(n);
  const maxes = new Float64Array(n);

  for (const e of events) {
    const idx = Math.floor((e.ts - first) / bucketMs);
    if (idx < 0 || idx >= n) continue;
    sums[idx] = (sums[idx] ?? 0) + e.latencyMs;
    counts[idx] = (counts[idx] ?? 0) + 1;
    if (e.latencyMs > (maxes[idx] ?? 0)) maxes[idx] = e.latencyMs;
  }

  const x: number[] = new Array<number>(n);
  const avg: (number | null)[] = new Array<number | null>(n);
  const max: (number | null)[] = new Array<number | null>(n);
  for (let i = 0; i < n; i += 1) {
    const c = counts[i] ?? 0;
    x[i] = (first + i * bucketMs) / 1000;
    avg[i] = c > 0 ? Math.round(((sums[i] ?? 0) / c) * 10) / 10 : null;
    max[i] = c > 0 ? (maxes[i] ?? 0) : null;
  }
  return { x, avg, max };
}

export interface ServiceStats {
  readonly source: string;
  readonly status: ServiceStatus;
  readonly count: number;
  readonly avgLatencyMs: number;
  readonly errorCount: number;
}

/** Per-service rollup for the Top List widget, sorted by average latency (worst first). */
export function computeServiceStats(events: readonly LiveEvent[]): ServiceStats[] {
  const acc = new Map<string, { status: ServiceStatus; count: number; sum: number; errors: number }>();
  for (const e of events) {
    const s = acc.get(e.source) ?? { status: e.status, count: 0, sum: 0, errors: 0 };
    s.status = e.status; // events are oldest → newest, so the last write is the current status
    s.count += 1;
    s.sum += e.latencyMs;
    if (e.severity === 'error' || e.severity === 'critical') s.errors += 1;
    acc.set(e.source, s);
  }
  return [...acc.entries()]
    .map(([source, s]) => ({
      source,
      status: s.status,
      count: s.count,
      avgLatencyMs: s.sum / s.count,
      errorCount: s.errors,
    }))
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);
}
