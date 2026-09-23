import type { LiveEvent } from '../types/event';
import { LiveStore } from './liveStore';

let now = 1_000_000;
const clock = () => now;
const ev = (id: string | number): LiveEvent => ({
  id: String(id),
  ts: now,
  source: 'api',
  severity: 'info',
  status: 'ok',
  latencyMs: 1,
  message: '',
});

function makeStore(capacity = 100) {
  const store = new LiveStore({ capacity, flushIntervalMs: 250, now: clock });
  const listener = vi.fn();
  store.subscribe(listener);
  return { store, listener };
}

beforeEach(() => {
  now = 1_000_000;
});

describe('LiveStore', () => {
  it('batches any number of ingests into a single notification per flush', () => {
    const { store, listener } = makeStore(10_000);
    for (let i = 0; i < 5_000; i += 1) store.ingest(ev(i));
    expect(listener).not.toHaveBeenCalled();
    now += 250;
    store.flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().events).toHaveLength(5_000);
    expect(store.getSnapshot().stats.received).toBe(5_000);
  });

  it('keeps memory bounded and counts evictions', () => {
    const { store } = makeStore(100);
    for (let i = 0; i < 1_000; i += 1) store.ingest(ev(i));
    store.flush();
    const s = store.getSnapshot();
    expect(s.events).toHaveLength(100);
    expect(s.events[0]?.id).toBe('900');
    expect(s.stats.evicted).toBe(900);
  });

  it('does not notify when nothing changed', () => {
    const { store, listener } = makeStore();
    store.ingest(ev(1));
    store.flush();
    listener.mockClear();
    store.flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it('preserves slice identity so selectors skip unchanged widgets', () => {
    const { store } = makeStore();
    store.ingest(ev(1));
    store.flush();
    const before = store.getSnapshot();
    store.setConnection({ status: 'reconnecting', attempt: 1, nextRetryAt: 5, errorMessage: 'x' });
    const after = store.getSnapshot();
    expect(after.events).toBe(before.events);
    expect(after.stats).toBe(before.stats);
    expect(after.connection).not.toBe(before.connection);
  });

  it('freezes the visible snapshot while paused and catches up on resume', () => {
    const { store } = makeStore();
    store.ingest(ev(1));
    store.flush();
    store.pause();
    const frozen = store.getSnapshot();

    now += 10_000;
    store.ingest(ev(2));
    store.ingest(ev(3));
    store.flush();
    const paused = store.getSnapshot();
    expect(paused.events).toBe(frozen.events);
    expect(paused.asOf).toBe(frozen.asOf);
    expect(paused.pendingWhilePaused).toBe(2);

    store.resume();
    const resumed = store.getSnapshot();
    expect(resumed.paused).toBe(false);
    expect(resumed.events.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(resumed.pendingWhilePaused).toBe(0);
  });

  it('rejects replayed/duplicate ids, but accepts an id again once it has been evicted', () => {
    const { store } = makeStore(2);
    store.ingest(ev('a'));
    store.ingest(ev('a'));
    store.flush();
    expect(store.getSnapshot().events).toHaveLength(1);
    expect(store.getSnapshot().stats.duplicates).toBe(1);

    store.ingest(ev('b'));
    store.ingest(ev('c')); // evicts 'a'
    store.ingest(ev('a'));
    store.flush();
    expect(store.getSnapshot().events.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('resizes the buffer at runtime', () => {
    const { store } = makeStore(100);
    for (let i = 0; i < 50; i += 1) store.ingest(ev(i));
    store.setCapacity(10);
    expect(store.getSnapshot().events).toHaveLength(10);
    expect(store.getSnapshot().capacity).toBe(10);
  });

  it('computes a sliding-window message rate', () => {
    const { store } = makeStore(10_000);
    store.flush();
    for (let t = 0; t < 4; t += 1) {
      for (let i = 0; i < 100; i += 1) store.ingest(ev(`${t}-${i}`));
      now += 1000;
      store.flush();
    }
    expect(store.getSnapshot().stats.ratePerSec).toBe(100);
  });
});
