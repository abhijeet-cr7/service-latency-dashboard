import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AppConfig } from '../config';
import { getStreamToken } from '../services/authToken';
import { LiveStore } from '../services/liveStore';
import { StreamClient } from '../services/streamClient';
import { createStreamSource, type StreamSource } from '../services/streamSource';
import type { SimulatorControls } from '../services/transports/simulatedTransport';
import type { LiveSnapshot } from '../types/stream';

export interface LiveStreamControls {
  pause(): void;
  resume(): void;
  retry(): void;
  setBufferSize(size: number): void;
  setFlushInterval(ms: number): void;
}

export interface LiveStreamHandle {
  readonly store: LiveStore;
  readonly controls: LiveStreamControls;
  readonly sourceKind: StreamSource['kind'];
  readonly simulator: SimulatorControls | null;
}

/** Frames above this per second are dropped before parsing (flood guard). */
const MAX_MESSAGES_PER_SECOND = 20_000;

/**
 * Wires the framework-agnostic StreamClient + LiveStore into React's lifecycle.
 *
 * The hook itself never re-renders on data: it returns a stable handle.
 * Components subscribe to just the slice they need through `useLiveSelector`,
 * so a fast-changing widget cannot re-render the rest of the page.
 */
export function useLiveStream(config: AppConfig): LiveStreamHandle {
  // Lazy init: created exactly once per mount, with stable identity.
  const [source] = useState(() => createStreamSource(config));
  const [store] = useState(
    () => new LiveStore({ capacity: config.bufferSize, flushIntervalMs: config.flushIntervalMs }),
  );
  const clientRef = useRef<StreamClient | null>(null);

  useEffect(() => {
    const client = new StreamClient({
      transportFactory: source.factory,
      backoff: config.backoff,
      staleTimeoutMs: config.staleTimeoutMs,
      stableAfterMs: config.stableAfterMs,
      maxMessagesPerSecond: MAX_MESSAGES_PER_SECOND,
      getAuthToken: getStreamToken,
      onEvent: (e) => store.ingest(e),
      onMalformed: () => store.recordMalformed(),
      onDropped: () => store.recordDropped(),
      onConnectionChange: (info) => store.setConnection(info),
    });
    clientRef.current = client;

    const handleOnline = () => client.retryNow();
    const handleOffline = () => client.handleConnectionLost();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    store.start();
    client.start();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      client.stop();
      store.stop();
      clientRef.current = null;
    };
  }, [source, store, clientRef, config]);

  const controls = useMemo<LiveStreamControls>(
    () => ({
      pause: () => store.pause(),
      resume: () => store.resume(),
      retry: () => clientRef.current?.retryNow(),
      setBufferSize: (size) => store.setCapacity(size),
      setFlushInterval: (ms) => store.setFlushInterval(ms),
    }),
    [store, clientRef],
  );

  return useMemo(
    () => ({ store, controls, sourceKind: source.kind, simulator: source.simulator }),
    [store, controls, source],
  );
}

export const LiveStreamContext = createContext<LiveStreamHandle | null>(null);

export function useLiveStreamContext(): LiveStreamHandle {
  const ctx = useContext(LiveStreamContext);
  if (!ctx) throw new Error('useLiveStreamContext must be used inside <LiveStreamProvider>');
  return ctx;
}

/**
 * Subscribes to one slice of the live snapshot. The component re-renders only
 * when the selected value changes by `Object.is`. Selectors should return
 * existing references (e.g. `s => s.events`), not freshly built objects.
 */
export function useLiveSelector<T>(selector: (snapshot: LiveSnapshot) => T): T {
  const { store } = useLiveStreamContext();
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()));
}
