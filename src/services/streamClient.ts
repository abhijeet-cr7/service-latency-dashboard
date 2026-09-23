import type { LiveEvent } from '../types/event';
import type { ConnectionInfo, Transport, TransportFactory } from '../types/stream';
import { backoffDelay, type BackoffOptions } from '../utils/backoff';
import { logger } from '../utils/logger';
import { parseFrame, type ParseResult } from '../utils/validate';

type MalformedReason = Extract<ParseResult, { ok: false }>['reason'];

export interface StreamClientOptions {
  readonly transportFactory: TransportFactory;
  readonly backoff: BackoffOptions;
  /** Silence on a live connection longer than this triggers a reconnect. */
  readonly staleTimeoutMs: number;
  /** Uptime needed before the failure counter resets (defeats flapping). */
  readonly stableAfterMs: number;
  /** Frames beyond this per second are dropped unparsed (flood protection). */
  readonly maxMessagesPerSecond?: number;
  readonly getAuthToken?: () => string | null;
  readonly onEvent: (event: LiveEvent) => void;
  readonly onMalformed: (reason: MalformedReason) => void;
  readonly onDropped: () => void;
  readonly onConnectionChange: (info: ConnectionInfo) => void;
  /** Injectable for tests. */
  readonly now?: () => number;
  readonly random?: () => number;
}

const MESSAGES = {
  lost: 'Connection lost. Reconnecting…',
  stale: 'The feed stopped responding. Reconnecting…',
  failed: 'Unable to reach the live feed. Check your connection and retry.',
  misconfigured: 'The live feed is misconfigured. Please contact support.',
} as const;

/**
 * Owns the connection lifecycle: connect → live → (drop) → reconnecting with
 * exponential backoff → … → error after `maxAttempts`. Decodes and validates
 * every frame before anything downstream sees it.
 *
 * Framework-agnostic (no React), so the logic is unit-tested with fake timers.
 */
export class StreamClient {
  private readonly opts: StreamClientOptions;
  private readonly now: () => number;
  private transport: Transport | null = null;
  /** Bumped on every (re)connect; callbacks from older transports are ignored. */
  private generation = 0;
  private running = false;
  private attempt = 0;
  private info: ConnectionInfo = {
    status: 'connecting',
    attempt: 0,
    nextRetryAt: null,
    errorMessage: null,
  };

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;

  // Fixed-window rate limiter state.
  private windowStart = 0;
  private windowCount = 0;

  constructor(options: StreamClientOptions) {
    this.opts = options;
    this.now = options.now ?? Date.now;
  }

  get connection(): ConnectionInfo {
    return this.info;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.teardownTransport();
  }

  /** Manual retry (the Retry button, or the browser coming back online). */
  retryNow(): void {
    if (!this.running) return;
    if (this.info.status === 'live' || this.info.status === 'connecting') return;
    if (this.info.status === 'error') this.attempt = 0;
    this.clearTimers();
    this.connect();
  }

  /** Force-drop the current connection (e.g. the browser went offline). */
  handleConnectionLost(): void {
    if (!this.running || this.info.status !== 'live') return;
    this.teardownTransport();
    this.scheduleReconnect(MESSAGES.lost);
  }

  private connect(): void {
    this.teardownTransport();
    const gen = ++this.generation;
    this.setInfo({ status: this.attempt === 0 ? 'connecting' : 'reconnecting', nextRetryAt: null });

    let transport: Transport;
    try {
      transport = this.opts.transportFactory();
    } catch {
      // e.g. an invalid/insecure URL. Retrying cannot fix config, so fail fast.
      logger.warn('transport.create_failed');
      this.setInfo({ status: 'error', nextRetryAt: null, errorMessage: MESSAGES.misconfigured });
      return;
    }
    this.transport = transport;

    transport.connect({
      onOpen: () => {
        if (gen !== this.generation) return;
        this.onOpen(transport);
      },
      onMessage: (raw) => {
        if (gen !== this.generation) return;
        this.onFrame(raw);
      },
      onClose: () => {
        if (gen !== this.generation || !this.running) return;
        this.teardownTransport();
        this.scheduleReconnect(MESSAGES.lost);
      },
    });
  }

  private onOpen(transport: Transport): void {
    const token = this.opts.getAuthToken?.();
    if (token) {
      // Token goes in-band after open, never in the URL, and is never logged.
      transport.send(JSON.stringify({ type: 'auth', token }));
    }
    this.lastFrameAt = this.now();
    this.setInfo({ status: 'live', attempt: this.attempt, nextRetryAt: null, errorMessage: null });
    logger.info('stream.live', { attempt: this.attempt });

    // Only a connection that stays up resets the backoff. A flapping link keeps
    // backing off instead of reconnecting in a tight loop.
    this.stableTimer = setTimeout(() => {
      this.attempt = 0;
      this.setInfo({ attempt: 0 });
    }, this.opts.stableAfterMs);

    const checkEvery = Math.max(250, Math.floor(this.opts.staleTimeoutMs / 4));
    this.watchdogTimer = setInterval(() => {
      if (this.now() - this.lastFrameAt > this.opts.staleTimeoutMs) {
        logger.warn('stream.stale');
        this.teardownTransport();
        this.scheduleReconnect(MESSAGES.stale);
      }
    }, checkEvery);
  }

  private onFrame(raw: unknown): void {
    const t = this.now();
    this.lastFrameAt = t;

    const limit = this.opts.maxMessagesPerSecond;
    if (limit !== undefined) {
      if (t - this.windowStart >= 1000) {
        this.windowStart = t;
        this.windowCount = 0;
      }
      this.windowCount += 1;
      if (this.windowCount > limit) {
        this.opts.onDropped();
        return;
      }
    }

    const result = parseFrame(raw, t);
    if (result.ok) this.opts.onEvent(result.event);
    else this.opts.onMalformed(result.reason);
  }

  private scheduleReconnect(message: string): void {
    this.clearTimers();
    if (!this.running) return;

    this.attempt += 1;
    const { maxAttempts } = this.opts.backoff;
    if (this.attempt > maxAttempts) {
      logger.warn('stream.gave_up', { attempts: maxAttempts });
      this.setInfo({
        status: 'error',
        attempt: this.attempt - 1,
        nextRetryAt: null,
        errorMessage: MESSAGES.failed,
      });
      return;
    }

    const delay = backoffDelay(this.attempt - 1, this.opts.backoff, this.opts.random);
    logger.info('stream.reconnect_scheduled', { attempt: this.attempt, delayMs: delay });
    this.setInfo({
      status: 'reconnecting',
      attempt: this.attempt,
      nextRetryAt: this.now() + delay,
      errorMessage: message,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private teardownTransport(): void {
    if (this.stableTimer) clearTimeout(this.stableTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.stableTimer = null;
    this.watchdogTimer = null;
    if (this.transport) {
      this.generation += 1; // invalidate any in-flight callbacks
      const t = this.transport;
      this.transport = null;
      t.close();
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setInfo(patch: Partial<ConnectionInfo>): void {
    const next = { ...this.info, ...patch };
    if (
      next.status === this.info.status &&
      next.attempt === this.info.attempt &&
      next.nextRetryAt === this.info.nextRetryAt &&
      next.errorMessage === this.info.errorMessage
    ) {
      return;
    }
    this.info = next;
    this.opts.onConnectionChange(next);
  }
}
