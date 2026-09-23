/**
 * Measurable render budget under load.
 *
 * Streams N messages through the real client → store → React path and counts
 * React commits per widget with <Profiler>. The claim under test: renders scale
 * with the flush interval, not with the message rate, and widgets that don't
 * depend on data never re-render.
 */
import { act, render } from '@testing-library/react';
import { Profiler, useEffect, useState, type ProfilerOnRenderCallback } from 'react';
import { EventsList } from '../components/EventsList';
import type { LiveEvent } from '../types/event';
import { parseFrame } from '../utils/validate';
import { LiveConnectionBar } from '../containers/LiveConnectionBar';
import { LiveControls } from '../containers/LiveControls';
import { LivePanels } from '../containers/LivePanels';
import { useEventFilters } from '../hooks/useEventFilters';
import { LiveStreamProvider } from '../hooks/LiveStreamProvider';
import type { StreamSource } from '../services/streamSource';
import { createFakeTransportFactory, frame } from './fakeTransport';
import { testConfig } from './renderDashboard';

vi.mock('../components/LiveChart', () => ({ LiveChart: () => null }));

function Harness({ onRender }: { onRender: ProfilerOnRenderCallback }) {
  const filtersApi = useEventFilters();
  return (
    <>
      <Profiler id="connection" onRender={onRender}>
        <LiveConnectionBar />
      </Profiler>
      <Profiler id="controls" onRender={onRender}>
        <LiveControls filtersApi={filtersApi} />
      </Profiler>
      <Profiler id="panels" onRender={onRender}>
        <LivePanels filters={filtersApi.filters} />
      </Profiler>
    </>
  );
}

function runLoad(messages: number, durationMs: number, flushIntervalMs: number) {
  const counts: Record<string, number> = {};
  const onRender: ProfilerOnRenderCallback = (id) => {
    counts[id] = (counts[id] ?? 0) + 1;
  };
  const fake = createFakeTransportFactory();
  const source: StreamSource = { kind: 'websocket', factory: fake.factory, simulator: null };
  render(
    <LiveStreamProvider config={{ ...testConfig, flushIntervalMs }} source={source}>
      <Harness onRender={onRender} />
    </LiveStreamProvider>,
  );
  act(() => fake.last.open());
  const baseline = { ...counts };

  const TICK = 10; // a burst of frames every 10ms, like a busy socket
  const perTick = Math.ceil(messages / (durationMs / TICK));
  const started = performance.now();
  for (let t = 0; t < durationMs; t += TICK) {
    act(() => {
      for (let i = 0; i < perTick; i += 1) fake.last.emit(frame({ latencyMs: (i % 200) + 1 }));
      vi.advanceTimersByTime(TICK);
    });
  }
  const elapsed = performance.now() - started;
  const delta = (id: string) => (counts[id] ?? 0) - (baseline[id] ?? 0);
  return {
    connection: delta('connection'),
    controls: delta('controls'),
    panels: delta('panels'),
    elapsedMs: Math.round(elapsed),
  };
}

// Fake the timers the app uses, but keep performance.now() real for wall-clock timing.
beforeEach(() =>
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }),
);
afterEach(() => vi.useRealTimers());

describe('render budget under load', () => {
  it('5,000 msgs over 1s at a 250ms flush → ~4 data commits, 0 re-renders elsewhere', () => {
    const r = runLoad(5_000, 1_000, 250);
    expect(r.panels).toBeLessThanOrEqual(5);
    expect(r.panels).toBeGreaterThanOrEqual(3);
    expect(r.connection).toBe(0);
    expect(r.controls).toBe(0);
    if (process.env.PERF_REPORT) {
      process.stdout.write(`\n[perf] 5k msgs/1s @250ms flush: ${JSON.stringify(r)}\n`);
    }
  });

  it('commit count tracks the flush interval, not the message volume', () => {
    const low = runLoad(500, 1_000, 250);
    const high = runLoad(20_000, 1_000, 250);
    expect(high.panels).toBe(low.panels);

    const fastFlush = runLoad(5_000, 1_000, 100);
    expect(fastFlush.panels).toBeGreaterThanOrEqual(9);
    expect(fastFlush.panels).toBeLessThanOrEqual(11);
    if (process.env.PERF_REPORT) {
      process.stdout.write(
        `[perf] 500 msgs: ${JSON.stringify(low)}\n[perf] 20k msgs: ${JSON.stringify(high)}\n[perf] 5k msgs @100ms: ${JSON.stringify(fastFlush)}\n`,
      );
    }
  });
});

/**
 * "Before" baseline: the obvious implementation, with setState on every message and an
 * unbounded-then-sliced array. In a browser each socket message is its own task,
 * so React cannot batch them; one act() per message reproduces that.
 */
type Emit = (e: LiveEvent) => void;
function NaiveFeed({ register }: { register: (emit: Emit) => void }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  useEffect(() => register((e) => setEvents((prev) => [...prev, e].slice(-5_000))), [register]);
  return <EventsList events={events} />;
}

describe('baseline comparison', () => {
  it('naive setState-per-message commits once per message; the batched store does not', () => {
    const N = 2_000;
    let naiveCommits = 0;
    let emit: Emit = () => undefined;
    render(
      <Profiler id="naive" onRender={() => (naiveCommits += 1)}>
        <NaiveFeed register={(fn) => (emit = fn)} />
      </Profiler>,
    );
    const baseline = naiveCommits;
    const started = performance.now();
    for (let i = 0; i < N; i += 1) {
      const parsed = parseFrame(frame());
      if (parsed.ok) act(() => emit(parsed.event));
    }
    const naiveMs = Math.round(performance.now() - started);
    const naive = naiveCommits - baseline;

    const batched = runLoad(N, 1_000, 250);
    expect(naive).toBe(N);
    expect(batched.panels).toBeLessThan(naive / 100);
    if (process.env.PERF_REPORT) {
      process.stdout.write(
        `[perf] baseline naive: ${N} msgs → ${naive} commits in ${naiveMs}ms | batched: ${batched.panels} commits in ${batched.elapsedMs}ms\n`,
      );
    }
  });
});
