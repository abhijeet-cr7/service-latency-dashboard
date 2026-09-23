import { ConnectionBanner, ConnectionBar } from '../components/ConnectionBar';
import { useLiveSelector, useLiveStreamContext } from '../hooks/useLiveStream';
import type { DisplayStatus } from '../types/stream';

/** Top-bar indicator. Subscribes only to connection/pause slices, so data flushes never re-render it. */
export function LiveConnectionBar() {
  const connection = useLiveSelector((s) => s.connection);
  const paused = useLiveSelector((s) => s.paused);
  const pending = useLiveSelector((s) => s.pendingWhilePaused);

  // `paused` is shown only over a healthy connection. A drop while paused must stay visible.
  const status: DisplayStatus = paused && connection.status === 'live' ? 'paused' : connection.status;
  return <ConnectionBar status={status} pendingWhilePaused={pending} />;
}

export function LiveConnectionBanner() {
  const { controls } = useLiveStreamContext();
  const connection = useLiveSelector((s) => s.connection);
  return <ConnectionBanner connection={connection} onRetry={controls.retry} />;
}
