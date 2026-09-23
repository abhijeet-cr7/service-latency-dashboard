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
  readonly pendingWhilePaused: number;
}

/** Compact connection indicator for the top bar. */
export const ConnectionBar = memo(function ConnectionBar({
  status,
  pendingWhilePaused,
}: ConnectionBarProps) {
  return (
    <div
      className={`conn conn--${status}`}
      role="status"
      aria-live="polite"
      aria-label="Connection status"
    >
      <span className="conn__dot" aria-hidden="true" />
      <span className="conn__label">{LABELS[status]}</span>
      {status === 'paused' && (
        <span className="conn__detail">
          {formatNumber(pendingWhilePaused)} new event{pendingWhilePaused === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
});

interface ConnectionBannerProps {
  readonly connection: ConnectionInfo;
  readonly onRetry: () => void;
}

/** Full-width notice shown only while the feed is reconnecting or down. */
export const ConnectionBanner = memo(function ConnectionBanner({
  connection,
  onRetry,
}: ConnectionBannerProps) {
  const { status, errorMessage, nextRetryAt, attempt } = connection;
  if (status !== 'reconnecting' && status !== 'error') return null;
  return (
    <div className={`banner banner--${status}`}>
      <span className="banner__text">
        {errorMessage}{' '}
        {status === 'reconnecting' && <RetryCountdown nextRetryAt={nextRetryAt} attempt={attempt} />}
      </span>
      <button type="button" className="btn btn--sm" onClick={onRetry}>
        Retry now
      </button>
    </div>
  );
});

/** Isolated so its 250ms tick re-renders only this text. */
const RetryCountdown = memo(function RetryCountdown({
  nextRetryAt,
  attempt,
}: {
  nextRetryAt: number | null;
  attempt: number;
}) {
  const now = useNow(nextRetryAt !== null);
  if (nextRetryAt === null) return <span className="banner__meta">(attempt {attempt})</span>;
  const seconds = Math.max(0, Math.ceil((nextRetryAt - now) / 1000));
  return (
    <span className="banner__meta">
      (attempt {attempt}, retrying in {seconds}s)
    </span>
  );
});
