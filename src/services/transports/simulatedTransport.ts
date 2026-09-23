import type { Severity, ServiceStatus } from '../../types/event';
import type { Transport, TransportHandlers } from '../../types/stream';

/**
 * A simulated socket that behaves like an unreliable real one:
 * - emits raw JSON strings (so they go through the same parse/validate path)
 * - a configurable message rate, including burst rates for load testing
 * - ~2% malformed frames and occasional hostile text (XSS payloads)
 * - random connection drops and failed connects, plus manual drop/stall
 *
 * Timestamps and values are generated live. There is no hardcoded dataset.
 */
export interface SimulatorControls {
  getRate(): number;
  setRate(eventsPerSecond: number): void;
  /** Close the current connection as if the network dropped. */
  dropConnection(): void;
  /** Keep the connection open but stop sending (exercises the stale watchdog). */
  stall(): void;
}

export interface SimulatorOptions {
  readonly initialRate?: number;
  /** Mean seconds between random drops. 0 disables them. */
  readonly meanSecondsBetweenDrops?: number;
  /** Probability that a connect attempt fails. */
  readonly connectFailureRate?: number;
  readonly malformedRate?: number;
}

const SOURCES = [
  'api-gateway',
  'auth-service',
  'payments',
  'search',
  'notifications',
  'inventory',
] as const;

const MESSAGES: Record<Severity, readonly string[]> = {
  info: ['Request completed', 'Cache refreshed', 'Health check passed', 'Config reloaded'],
  warning: ['Latency above SLO', 'Retrying upstream call', 'Queue depth rising', 'Slow query'],
  error: ['Upstream timeout', 'Connection refused', 'HTTP 503 from dependency', 'Write failed'],
  critical: ['Circuit breaker open', 'Error budget exhausted', 'Node unreachable'],
};

/** Hostile strings. The UI must show them as inert text. */
const HOSTILE = [
  '<img src=x onerror=alert(1)>',
  '<script>alert("xss")</script>',
  'javascript:alert(document.cookie)',
  '"><svg onload=alert(1)>',
  'Normal text‮gnp.exe',
];

const TICK_MS = 50;
const MAX_CATCH_UP_MS = 2_000;

export function createSimulator(options: SimulatorOptions = {}): {
  factory: () => Transport;
  controls: SimulatorControls;
} {
  let rate = options.initialRate ?? 25;
  const meanDropS = options.meanSecondsBetweenDrops ?? 90;
  const connectFailureRate = options.connectFailureRate ?? 0.1;
  const malformedRate = options.malformedRate ?? 0.02;

  let active: { drop(): void; stall(): void } | null = null;
  let seq = 0;
  const session = Math.random().toString(36).slice(2, 8);

  // Per-source latency random walk, so the chart shows plausible trends.
  const baseline = new Map<string, number>(SOURCES.map((s) => [s, 40 + Math.random() * 60]));

  function makeEvent(now: number): string {
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)] as string;
    const prev = baseline.get(source) ?? 60;
    const next = Math.min(900, Math.max(5, prev + (Math.random() - 0.5) * 12));
    baseline.set(source, next);

    const spike = Math.random() < 0.03 ? 2 + Math.random() * 6 : 1;
    const latencyMs = next * spike;
    const r = Math.random();
    const severity: Severity =
      latencyMs > 500 && r < 0.5 ? 'critical' : latencyMs > 250 || r < 0.04 ? 'error' : r < 0.14 ? 'warning' : 'info';
    const status: ServiceStatus =
      severity === 'critical' ? 'down' : severity === 'error' || latencyMs > 200 ? 'degraded' : 'ok';
    const pool = MESSAGES[severity];
    const message =
      Math.random() < 0.01
        ? HOSTILE[Math.floor(Math.random() * HOSTILE.length)]
        : pool[Math.floor(Math.random() * pool.length)];

    seq += 1;
    return JSON.stringify({
      id: `${session}-${seq}`,
      ts: now,
      source,
      severity,
      status,
      latencyMs,
      message,
    });
  }

  function makeMalformed(now: number): unknown {
    const variants: unknown[] = [
      '{"id": "broken", ',
      JSON.stringify({ id: 'x', ts: now, source: 'api', severity: 'PANIC', status: 'ok', latencyMs: 1 }),
      JSON.stringify({ id: 'y', ts: 'yesterday', latencyMs: 'fast' }),
      JSON.stringify({ __proto__: { polluted: true }, id: 'z', ts: now }),
      'x'.repeat(10_000),
      42,
      JSON.stringify([1, 2, 3]),
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  const factory = (): Transport => {
    let handlers: TransportHandlers | null = null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | null = null;
    let carry = 0;
    let lastTick = 0;
    let stalled = false;

    const cleanup = () => {
      timers.forEach(clearTimeout);
      timers = [];
      if (interval) clearInterval(interval);
      interval = null;
    };

    const drop = () => {
      const h = handlers;
      cleanup();
      handlers = null;
      h?.onClose();
    };

    const transport: Transport = {
      connect(h) {
        handlers = h;
        stalled = false;
        const handle = { drop, stall: () => (stalled = true) };
        active = handle;

        // Simulated handshake latency, which can fail.
        timers.push(
          setTimeout(() => {
            if (Math.random() < connectFailureRate) {
              drop();
              return;
            }
            handlers?.onOpen();
            lastTick = Date.now();
            interval = setInterval(() => {
              const now = Date.now();
              // Emit by elapsed wall time, not tick count: browsers throttle timers in
              // background tabs, and a real socket keeps delivering. Cap the catch-up at
              // MAX_CATCH_UP_MS so the backlog stays bounded.
              const elapsed = Math.min(now - lastTick, MAX_CATCH_UP_MS);
              lastTick = now;
              if (!handlers || stalled) return;
              carry += (rate * elapsed) / 1000;
              const n = Math.floor(carry);
              carry -= n;
              for (let i = 0; i < n && handlers; i += 1) {
                handlers.onMessage(Math.random() < malformedRate ? makeMalformed(now) : makeEvent(now));
              }
              // Poisson-ish random drop.
              if (meanDropS > 0 && Math.random() < elapsed / 1000 / meanDropS) drop();
            }, TICK_MS);
          }, 250 + Math.random() * 500),
        );
      },
      send() {
        // The simulator ignores client frames (e.g. auth).
      },
      close() {
        cleanup();
        handlers = null;
        if (active?.drop === drop) active = null;
      },
    };
    return transport;
  };

  const controls: SimulatorControls = {
    getRate: () => rate,
    setRate: (r) => {
      rate = Math.max(0, Math.min(20_000, r));
    },
    dropConnection: () => active?.drop(),
    stall: () => active?.stall(),
  };

  return { factory, controls };
}
