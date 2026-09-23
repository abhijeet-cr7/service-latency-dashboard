import { ConnectionBar } from '../components/ConnectionBar';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import type { DisplayStatus } from '../types/stream';

/** Subscribes only to connection/pause slices. Data flushes never re-render it. */
export function LiveConnectionBar() {
  const { controls, sourceKind } = useLiveStreamContext();
  const connection = useLiveSelector((s) => s.connection);
  const paused = useLiveSelector((s) => s.paused);
  const pending = useLiveSelector((s) => s.pendingWhilePaused);

  // `paused` is shown only over a healthy connection. A drop while paused must stay visible.
  const status: DisplayStatus = paused && connection.status === 'live' ? 'paused' : connection.status;

  return (
    <ConnectionBar
      status={status}
      connection={connection}
      pendingWhilePaused={pending}
      sourceLabel={sourceKind === 'simulator' ? 'the simulated feed' : 'the live feed'}
      onRetry={controls.retry}
    />
  );
}
