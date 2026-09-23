import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConnectionInfo } from '../types/stream';
import { ConnectionBanner, ConnectionBar } from './ConnectionBar';

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
    render(<ConnectionBar status={status} pendingWhilePaused={0} />);
    expect(screen.getByRole('status', { name: /connection status/i })).toHaveTextContent(label);
  });

  it('reports how many events arrived while paused', () => {
    render(<ConnectionBar status="paused" pendingWhilePaused={1234} />);
    expect(screen.getByRole('status')).toHaveTextContent(/1,234 new events/);
  });
});

describe('ConnectionBanner', () => {
  it('renders nothing while the connection is healthy', () => {
    const { container } = render(<ConnectionBanner connection={info()} onRetry={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the message, retry countdown and a working Retry button while reconnecting', async () => {
    const onRetry = vi.fn();
    render(
      <ConnectionBanner
        connection={info({
          status: 'reconnecting',
          attempt: 2,
          nextRetryAt: Date.now() + 3000,
          errorMessage: 'Connection lost. Reconnecting…',
        })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
    expect(screen.getByText(/attempt 2, retrying in 3s/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry now/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the generic error message when the feed is down', () => {
    render(
      <ConnectionBanner
        connection={info({ status: 'error', errorMessage: 'Unable to reach the live feed.' })}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByText(/unable to reach the live feed/i)).toBeInTheDocument();
  });
});
