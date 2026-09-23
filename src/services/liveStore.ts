import type { LiveEvent } from '../types/event';
import type { ConnectionInfo, LiveSnapshot, StreamStats } from '../types/stream';
import { RingBuffer } from '../utils/ringBuffer';

export interface LiveStoreOptions {
  readonly capacity: number;
  readonly flushIntervalMs: number;
  readonly now?: () => number;
}

type Listener = () => void;

const RATE_WINDOW_MS = 5_000;
/** When idle, still commit this often so time windows keep sliding. */
const IDLE_COMMIT_MS = 1_000;

/**
 * External store that decouples the message rate from the render rate.
 *
 * - `ingest` is O(1): it writes into a bounded ring buffer and marks the store dirty.
 * - A timer flushes at most once per `flushIntervalMs`, producing one immutable
 *   snapshot, so 5,000 msgs/s still means about 4 React commits/s.
 * - Sub-objects (events, stats, connection) keep their identity when unchanged, so
 *   `useSyncExternalStore` selectors re-render only the widgets whose slice changed.
 * - While paused, events keep flowing into the (bounded) buffer but the visible
 *   snapshot is frozen. Resume shows the latest data immediately.
 */
export class LiveStore {
  private readonly buffer: RingBuffer<LiveEvent>;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();
  private flushIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  private received = 0;
  private malformed = 0;
  private evicted = 0;
  private dropped = 0;
  private duplicates = 0;
  /** Ids currently in the buffer; kept in sync with evictions so it stays bounded. */
  private readonly ids = new Set<string>();
  private pending = 0;
  private dirty = false;
  private lastCommitAt = 0;
  private rateSamples: { t: number; received: number }[] = [];

  private snapshot: LiveSnapshot;

  constructor({ capacity, flushIntervalMs, now = Date.now }: LiveStoreOptions) {
    this.buffer = new RingBuffer<LiveEvent>(capacity);
    this.flushIntervalMs = flushIntervalMs;
    this.now = now;
    this.snapshot = {
      events: [],
      stats: { received: 0, malformed: 0, evicted: 0, dropped: 0, duplicates: 0, ratePerSec: 0 },
      connection: { status: 'connecting', attempt: 0, nextRetryAt: null, errorMessage: null },
      paused: false,
      pendingWhilePaused: 0,
      asOf: now(),
      hasReceivedData: false,
      capacity,
      flushIntervalMs,
    };
  }

  // ---- useSyncExternalStore contract (arrow fns: stable identity) ----
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => this.snapshot;

  // ---- lifecycle ----
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /** Stops the flush timer. Subscribers stay registered, so StrictMode's remount is safe. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---- writes from the stream (hot path: keep O(1)) ----
  ingest(event: LiveEvent): void {
    if (this.ids.has(event.id)) {
      this.duplicates += 1;
      this.dirty = true;
      return;
    }
    this.ids.add(event.id);
    const evicted = this.buffer.push(event);
    if (evicted) {
      this.evicted += 1;
      this.ids.delete(evicted.id);
    }
    this.received += 1;
    if (this.snapshot.paused) this.pending = Math.min(this.pending + 1, this.buffer.capacity);
    this.dirty = true;
  }

  recordMalformed(): void {
    this.malformed += 1;
    this.dirty = true;
  }

  recordDropped(): void {
    this.dropped += 1;
    this.dirty = true;
  }

  /** Connection changes are rare and important, so they commit immediately. */
  setConnection(connection: ConnectionInfo): void {
    this.commit({ connection });
  }

  // ---- user controls ----
  pause(): void {
    if (this.snapshot.paused) return;
    this.pending = 0;
    this.commit({ paused: true, pendingWhilePaused: 0 });
  }

  resume(): void {
    if (!this.snapshot.paused) return;
    this.pending = 0;
    this.commit({ paused: false, pendingWhilePaused: 0 });
    this.dirty = true;
    this.flush();
  }

  setCapacity(capacity: number): void {
    if (capacity === this.buffer.capacity) return;
    this.buffer.resize(capacity).forEach((e) => this.ids.delete(e.id));
    this.dirty = true;
    this.commit({ capacity });
    this.flush();
  }

  setFlushInterval(ms: number): void {
    if (ms === this.flushIntervalMs) return;
    this.flushIntervalMs = ms;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.flush(), ms);
    }
    this.commit({ flushIntervalMs: ms });
  }

  /** Builds and publishes a snapshot if anything changed. Public for tests. */
  flush(): void {
    const t = this.now();
    const ratePerSec = this.sampleRate(t);
    const idleDue = t - this.lastCommitAt >= IDLE_COMMIT_MS;
    const prev = this.snapshot;

    if (prev.paused) {
      // Only the pending counter changes. Data views stay frozen.
      if (this.pending !== prev.pendingWhilePaused) this.commit({ pendingWhilePaused: this.pending });
      this.dirty = false;
      return;
    }

    const rateChanged = ratePerSec !== prev.stats.ratePerSec;
    if (!this.dirty && !rateChanged && !idleDue) return;

    const stats: StreamStats = {
      received: this.received,
      malformed: this.malformed,
      evicted: this.evicted,
      dropped: this.dropped,
      duplicates: this.duplicates,
      ratePerSec,
    };
    const statsChanged =
      rateChanged ||
      stats.received !== prev.stats.received ||
      stats.malformed !== prev.stats.malformed ||
      stats.dropped !== prev.stats.dropped ||
      stats.duplicates !== prev.stats.duplicates ||
      stats.evicted !== prev.stats.evicted;

    this.commit({
      events: this.dirty ? this.buffer.toArray() : prev.events,
      stats: statsChanged ? stats : prev.stats,
      asOf: t,
      hasReceivedData: prev.hasReceivedData || this.received > 0,
    });
    this.dirty = false;
  }

  private sampleRate(t: number): number {
    this.rateSamples.push({ t, received: this.received });
    while (this.rateSamples.length > 1 && t - (this.rateSamples[0]?.t ?? t) > RATE_WINDOW_MS) {
      this.rateSamples.shift();
    }
    const oldest = this.rateSamples[0];
    if (!oldest || t === oldest.t) return this.snapshot.stats.ratePerSec;
    const perSec = ((this.received - oldest.received) * 1000) / (t - oldest.t);
    return Math.round(perSec * 10) / 10;
  }

  private commit(patch: Partial<LiveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.lastCommitAt = this.now();
    this.listeners.forEach((l) => l());
  }
}
