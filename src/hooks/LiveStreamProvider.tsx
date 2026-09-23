import type { ReactNode } from 'react';
import type { AppConfig } from '../config';
import { LiveStreamContext, useLiveStream } from './useLiveStream';

export function LiveStreamProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  const handle = useLiveStream(config);
  return <LiveStreamContext.Provider value={handle}>{children}</LiveStreamContext.Provider>;
}
