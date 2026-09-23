import type { Transport, TransportHandlers } from '../types/stream';

export interface FakeTransport extends Transport {
  handlers: TransportHandlers | null;
  readonly sent: string[];
  closed: boolean;
  open(): void;
  emit(raw: unknown): void;
  drop(): void;
}

/** A controllable in-memory socket for driving the stream client in tests. */
export function createFakeTransportFactory() {
  const instances: FakeTransport[] = [];
  const factory = (): Transport => {
    const t: FakeTransport = {
      handlers: null,
      sent: [],
      closed: false,
      connect(h) {
        t.handlers = h;
      },
      send(data) {
        t.sent.push(data);
      },
      close() {
        t.closed = true;
      },
      open: () => t.handlers?.onOpen(),
      emit: (raw) => t.handlers?.onMessage(raw),
      drop: () => t.handlers?.onClose(),
    };
    instances.push(t);
    return t;
  };
  return {
    factory,
    instances,
    get last(): FakeTransport {
      const t = instances[instances.length - 1];
      if (!t) throw new Error('no transport created yet');
      return t;
    },
  };
}

let seq = 0;

/** Builds a valid raw frame; override any field to make it invalid. */
export function frame(overrides: Record<string, unknown> = {}): string {
  seq += 1;
  return JSON.stringify({
    id: `evt-${seq}`,
    ts: Date.now(),
    source: 'api-gateway',
    severity: 'info',
    status: 'ok',
    latencyMs: 42,
    message: 'ok',
    ...overrides,
  });
}
