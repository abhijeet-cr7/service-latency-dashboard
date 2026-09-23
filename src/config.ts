import { DEFAULT_BACKOFF, type BackoffOptions } from './utils/backoff';
import { readIntSetting } from './utils/helpers';

export interface AppConfig {
  /** WebSocket URL, or null to use the built-in simulator. */
  readonly streamUrl: string | null;
  readonly bufferSize: number;
  readonly flushIntervalMs: number;
  readonly backoff: BackoffOptions;
  /** If a live connection is silent this long, treat it as dead and reconnect. */
  readonly staleTimeoutMs: number;
  /** A connection must stay up this long before the backoff counter resets. */
  readonly stableAfterMs: number;
}

export const BUFFER_SIZE_OPTIONS = [1_000, 5_000, 10_000, 25_000] as const;
export const FLUSH_INTERVAL_OPTIONS = [100, 250, 500, 1_000] as const;

const env = import.meta.env;

export const config: AppConfig = {
  streamUrl: typeof env.VITE_STREAM_URL === 'string' && env.VITE_STREAM_URL.trim() !== ''
    ? env.VITE_STREAM_URL.trim()
    : null,
  bufferSize: readIntSetting(env.VITE_BUFFER_SIZE, 5_000, 100, 50_000),
  flushIntervalMs: readIntSetting(env.VITE_FLUSH_INTERVAL_MS, 250, 50, 2_000),
  backoff: DEFAULT_BACKOFF,
  staleTimeoutMs: 8_000,
  stableAfterMs: 5_000,
};

export interface TimeWindow {
  readonly label: string;
  /** null = the whole in-memory buffer */
  readonly ms: number | null;
}

export const TIME_WINDOWS: readonly TimeWindow[] = [
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: 'All', ms: null },
];

export const DEFAULT_WINDOW_MS = 60_000;
