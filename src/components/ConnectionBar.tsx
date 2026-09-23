import { memo } from 'react';
import { useNow } from '../hooks/useNow';
import type { ConnectionInfo, DisplayStatus } from '../types/stream';
import { formatNumber } from '../utils/helpers';

const LABELS: Record<DisplayStatus, string> = {
  connecting: 'Connecting',
  live: 'Live',
  paused: 'Paused',
  reconnecting: 'Reconnecting',
  error: 'Disconnected',
};

interface ConnectionBarProps {
  readonly status: DisplayStatus;
  readonly connection: ConnectionInfo;
  readonly pendingWhilePaused: number;
  readonly sourceLabel: string;
  readonly onRetry: () => void;
}

/** Visible connection indicator with a retry countdown and a manual retry action. */
export const ConnectionBar = memo(function ConnectionBar({
  status,
  connection,
  pendingWhilePaused,
  sourceLabel,
  onRetry,
}: ConnectionBarProps) {
  const canRetry = status === 'error' || status === 'reconnecting';

  return (
    <div className={`conn conn--${status}`} role="status" aria-live="polite">
      <span className="conn__pill">
        <span className="conn__dot" aria-hidden="true" />
        {LABELS[status]}
      </span>
      <span className="conn__detail">
        {status === 'paused' && (
          <>
            {formatNumber(pendingWhilePaused)} new event{pendingWhilePaused === 1 ? '' : 's'} held
            while paused
          </>
        )}
        {status === 'live' && <>Streaming from {sourceLabel}</>}
        {status === 'connecting' && <>Opening connection to {sourceLabel}…</>}
        {status === 'reconnecting' && (
          <>
            {connection.errorMessage}{' '}
            <RetryCountdown nextRetryAt={connection.nextRetryAt} attempt={connection.attempt} />
          </>
        )}
        {status === 'error' && connection.errorMessage}
      </span>
      {canRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Retry now
        </button>
      )}
    </div>
  );
});

/** Isolated so its 250ms tick re-renders only this text, not the whole bar. */
const RetryCountdown = memo(function RetryCountdown({
  nextRetryAt,
  attempt,
}: {
  nextRetryAt: number | null;
  attempt: number;
}) {
  const now = useNow(nextRetryAt !== null);
  if (nextRetryAt === null) return null;
  const seconds = Math.max(0, Math.ceil((nextRetryAt - now) / 1000));
  return (
    <span className="conn__countdown">
      (attempt {attempt}, retrying in {seconds}s)
    </span>
  );
});
