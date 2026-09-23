import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AppConfig } from '../config';
import { LiveStreamProvider } from '../hooks/LiveStreamProvider';
import type { StreamSource } from '../services/streamSource';
import { createFakeTransportFactory } from './fakeTransport';

export const testConfig: AppConfig = {
  streamUrl: null,
  bufferSize: 5_000,
  flushIntervalMs: 250,
  backoff: { baseMs: 1000, maxMs: 8000, maxAttempts: 2 },
  staleTimeoutMs: 60_000,
  stableAfterMs: 5_000,
};

/** Renders UI inside a provider wired to a controllable fake socket. */
export function renderWithStream(ui: ReactNode, config: AppConfig = testConfig) {
  const fake = createFakeTransportFactory();
  const source: StreamSource = { kind: 'websocket', factory: fake.factory, simulator: null };
  const utils = render(
    <LiveStreamProvider config={config} source={source}>
      {ui}
    </LiveStreamProvider>,
  );
  return { ...utils, fake };
}
