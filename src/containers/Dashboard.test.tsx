import { act, screen, within } from '@testing-library/react';
import { frame } from '../test/fakeTransport';
import { renderWithStream } from '../test/renderDashboard';
import { Dashboard } from './Dashboard';

// uPlot needs a real canvas. Chart rendering is covered by manual/perf checks.
vi.mock('../components/LiveChart', () => ({
  LiveChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const connection = () => screen.getByRole('status', { name: /connection status/i });

describe('Dashboard (integration with a fake socket)', () => {
  it('shows loading, then live KPIs, chart and events', () => {
    const { fake } = renderWithStream(<Dashboard />);
    expect(screen.getByText(/connecting to the live feed/i)).toBeInTheDocument();

    act(() => fake.last.open());
    expect(screen.getByText(/waiting for the first events/i)).toBeInTheDocument();

    act(() => {
      for (let i = 0; i < 20; i += 1) fake.last.emit(frame({ message: `msg ${i}` }));
    });
    tick(250);

    expect(connection()).toHaveTextContent('Live');
    expect(screen.getByText('Events in view').parentElement).toHaveTextContent('20');
    expect(screen.getByRole('img', { name: /latency over time/i })).toBeInTheDocument();
    expect(screen.getByText('msg 19')).toBeInTheDocument();
  });

  it('survives malformed frames and counts them', () => {
    const { fake } = renderWithStream(<Dashboard />);
    act(() => {
      fake.last.open();
      fake.last.emit(frame());
      fake.last.emit('{garbage');
      fake.last.emit(frame({ latencyMs: 'fast' }));
      fake.last.emit(null);
    });
    tick(250);
    expect(screen.getByText('Rejected frames').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Events in view').parentElement).toHaveTextContent('1');
  });

  it('pause freezes the view; resume catches up', async () => {
    const { fake } = renderWithStream(<Dashboard />);
    act(() => {
      fake.last.open();
      fake.last.emit(frame());
    });
    tick(250);

    act(() => screen.getByRole('button', { name: /pause/i }).click());
    expect(connection()).toHaveTextContent('Paused');

    act(() => {
      for (let i = 0; i < 5; i += 1) fake.last.emit(frame());
    });
    tick(250);
    expect(screen.getByText('Events in view').parentElement).toHaveTextContent('1');
    expect(connection()).toHaveTextContent('5 new events');

    act(() => screen.getByRole('button', { name: /resume/i }).click());
    expect(screen.getByText('Events in view').parentElement).toHaveTextContent('6');
  });

  it('severity filter keeps KPIs, chart and list consistent', () => {
    const { fake } = renderWithStream(<Dashboard />);
    act(() => {
      fake.last.open();
      fake.last.emit(frame({ severity: 'error', message: 'boom' }));
      fake.last.emit(frame({ severity: 'info', message: 'fine' }));
    });
    tick(250);

    act(() => screen.getByRole('button', { name: 'critical' }).click());
    tick(0);
    expect(screen.getByText(/no events match/i)).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'critical' }).click());
    act(() => screen.getByRole('button', { name: 'error' }).click());
    tick(0);
    const list = screen.getByRole('list', { name: /recent events/i });
    expect(within(list).getByText('boom')).toBeInTheDocument();
    expect(within(list).queryByText('fine')).toBeNull();
    expect(screen.getByText('Error rate').parentElement).toHaveTextContent('100%');
  });

  it('shows a reconnecting state, then a clear error with Retry after repeated failures', () => {
    const { fake } = renderWithStream(<Dashboard />);
    act(() => fake.last.drop());
    expect(connection()).toHaveTextContent('Reconnecting');

    act(() => fake.last.drop());
    tick(10_000);
    act(() => fake.last.drop());
    tick(10_000);
    act(() => fake.last.drop());

    expect(connection()).toHaveTextContent('Disconnected');
    const retry = screen.getByRole('button', { name: /retry connection/i });
    const before = fake.instances.length;
    act(() => retry.click());
    expect(fake.instances.length).toBe(before + 1);
  });
});
