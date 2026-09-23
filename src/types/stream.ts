import type { LiveEvent } from './event';

/** Connection lifecycle reported by the stream client. */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

/** What the UI shows. `paused` is a user choice layered over a live connection. */
export type DisplayStatus = ConnectionStatus | 'paused';

export interface ConnectionInfo {
  readonly status: ConnectionStatus;
  /** Consecutive failed attempts since the last stable connection. */
  readonly attempt: number;
  /** Epoch ms of the next scheduled reconnect, if one is pending. */
  readonly nextRetryAt: number | null;
  /** User-safe message. Never contains payloads, URLs or tokens. */
  readonly errorMessage: string | null;
}

/** Transport abstraction: WebSocket, simulator, or a fake in tests. */
export interface TransportHandlers {
  onOpen(): void;
  onMessage(raw: unknown): void;
  onClose(): void;
}

export interface Transport {
  connect(handlers: TransportHandlers): void;
  send(data: string): void;
  close(): void;
}

export type TransportFactory = () => Transport;

/** Monotonic counters for the whole session (not limited by the buffer). */
export interface StreamStats {
  readonly received: number;
  readonly malformed: number;
  /** Events evicted from the ring buffer because it was full. */
  readonly evicted: number;
  /** Frames dropped unparsed by the flood limiter. */
  readonly dropped: number;
  /** Events rejected because their id is already in the buffer (replays). */
  readonly duplicates: number;
  /** Events per second over the recent sliding window. */
  readonly ratePerSec: number;
}

/** Immutable snapshot committed to React at most once per flush interval. */
export interface LiveSnapshot {
  /** Buffered events, oldest → newest. Bounded by capacity. */
  readonly events: readonly LiveEvent[];
  readonly stats: StreamStats;
  readonly connection: ConnectionInfo;
  readonly paused: boolean;
  /** Events received while paused (not yet shown; only the newest `capacity` are kept). */
  readonly pendingWhilePaused: number;
  /** Clock used for time windows. Frozen while paused so views stay consistent. */
  readonly asOf: number;
  /** True once at least one flush has happened after the first event. */
  readonly hasReceivedData: boolean;
  /** Current buffer capacity and flush throttle (user-configurable). */
  readonly capacity: number;
  readonly flushIntervalMs: number;
}
