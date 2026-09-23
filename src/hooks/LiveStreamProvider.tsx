import type { ReactNode } from 'react';
import type { AppConfig } from '../config';
import type { StreamSource } from '../services/streamSource';
import { LiveStreamContext, useLiveStream } from './useLiveStream';

interface LiveStreamProviderProps {
  readonly config: AppConfig;
  /** Inject a transport (tests, storybook). Defaults to the one selected by config. */
  readonly source?: StreamSource;
  readonly children: ReactNode;
}

export function LiveStreamProvider({ config, source, children }: LiveStreamProviderProps) {
  const handle = useLiveStream(config, source);
  return <LiveStreamContext.Provider value={handle}>{children}</LiveStreamContext.Provider>;
}
