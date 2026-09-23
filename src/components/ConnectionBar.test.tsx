import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConnectionInfo } from '../types/stream';
import { ConnectionBar } from './ConnectionBar';

const info = (p: Partial<ConnectionInfo> = {}): ConnectionInfo => ({
  status: 'live',
  attempt: 0,
  nextRetryAt: null,
  errorMessage: null,
  ...p,
});

describe('ConnectionBar', () => {
  it.each([
    ['connecting', 'Connecting'],
    ['live', 'Live'],
    ['paused', 'Paused'],
    ['reconnecting', 'Reconnecting'],
    ['error', 'Disconnected'],
  ] as const)('shows an explicit label for %s', (status, label) => {
    render(
      <ConnectionBar
        status={status}
        connection={info()}
        pendingWhilePaused={0}
        sourceLabel="feed"
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('shows the retry countdown and a working Retry button while reconnecting', async () => {
    const onRetry = vi.fn();
    render(
      <ConnectionBar
        status="reconnecting"
        connection={info({
          status: 'reconnecting',
          attempt: 2,
          nextRetryAt: Date.now() + 3000,
          errorMessage: 'Connection lost. Reconnecting…',
        })}
        pendingWhilePaused={0}
        sourceLabel="feed"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/attempt 2, retrying in 3s/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry now/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('reports how many events arrived while paused', () => {
    render(
      <ConnectionBar
        status="paused"
        connection={info()}
        pendingWhilePaused={1234}
        sourceLabel="feed"
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/1,234 new events/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
