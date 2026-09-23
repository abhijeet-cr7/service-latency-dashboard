import type { AppConfig } from '../config';
import type { TransportFactory } from '../types/stream';
import { createSimulator, type SimulatorControls } from './transports/simulatedTransport';
import { createWebSocketTransportFactory } from './transports/webSocketTransport';

export interface StreamSource {
  readonly kind: 'websocket' | 'simulator';
  readonly factory: TransportFactory;
  /** Present only for the simulator (demo / load-test controls). */
  readonly simulator: SimulatorControls | null;
}

/** Picks the transport from config: a real WebSocket if a URL is set, else the simulator. */
export function createStreamSource(config: AppConfig): StreamSource {
  if (config.streamUrl) {
    let factory: TransportFactory;
    try {
      factory = createWebSocketTransportFactory(config.streamUrl);
    } catch {
      // Defer the failure to the client, which maps it to a generic, non-leaky error state.
      factory = () => {
        throw new Error('invalid stream endpoint');
      };
    }
    return { kind: 'websocket', factory, simulator: null };
  }
  const { factory, controls } = createSimulator();
  return { kind: 'simulator', factory, simulator: controls };
}
