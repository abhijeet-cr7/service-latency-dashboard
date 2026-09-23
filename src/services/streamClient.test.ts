import { createFakeTransportFactory, frame } from '../test/fakeTransport';
import type { ConnectionInfo } from '../types/stream';
import { StreamClient, type StreamClientOptions } from './streamClient';

function setup(overrides: Partial<StreamClientOptions> = {}) {
  const fake = createFakeTransportFactory();
  const events: string[] = [];
  const malformed: string[] = [];
  const statuses: ConnectionInfo[] = [];
  let dropped = 0;
  const client = new StreamClient({
    transportFactory: fake.factory,
    backoff: { baseMs: 1000, maxMs: 8000, maxAttempts: 3 },
    staleTimeoutMs: 4000,
    stableAfterMs: 5000,
    random: () => 1, // deterministic: delay = upper bound
    onEvent: (e) => events.push(e.id),
    onMalformed: (r) => malformed.push(r),
    onDropped: () => {
      dropped += 1;
    },
    onConnectionChange: (i) => statuses.push(i),
    ...overrides,
  });
  return { client, fake, events, malformed, statuses, dropped: () => dropped };
}

const lastStatus = (s: ConnectionInfo[]) => s[s.length - 1];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('StreamClient', () => {
  it('goes connecting → live and forwards only validated events', () => {
    const { client, fake, events, malformed, statuses } = setup();
    client.start();
    expect(client.connection.status).toBe('connecting');
    fake.last.open();
    expect(lastStatus(statuses)?.status).toBe('live');

    fake.last.emit(frame({ id: 'good' }));
    fake.last.emit('{not json');
    fake.last.emit(frame({ severity: 'PANIC' }));
    fake.last.emit(12345);
    expect(events).toEqual(['good']);
    expect(malformed).toEqual(['json', 'schema', 'type']);
  });

  it('reconnects with exponential backoff after a drop', () => {
    const { client, fake, statuses } = setup();
    client.start();
    fake.last.open();
    fake.last.drop();

    expect(lastStatus(statuses)).toMatchObject({ status: 'reconnecting', attempt: 1 });
    expect(lastStatus(statuses)?.errorMessage).toMatch(/connection lost/i);
    expect(fake.instances).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(fake.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fake.instances).toHaveLength(2); // 1st retry after 1000ms

    fake.last.drop(); // failed before open
    expect(lastStatus(statuses)).toMatchObject({ status: 'reconnecting', attempt: 2 });
    vi.advanceTimersByTime(2000);
    expect(fake.instances).toHaveLength(3); // 2nd retry after 2000ms
  });

  it('enters error after maxAttempts and recovers on manual retry', () => {
    const { client, fake, statuses } = setup();
    client.start();
    for (let i = 0; i < 4; i += 1) {
      fake.last.drop();
      vi.advanceTimersByTime(10_000);
    }
    expect(lastStatus(statuses)?.status).toBe('error');
    expect(lastStatus(statuses)?.errorMessage).not.toMatch(/http|ws:|token/i);
    const created = fake.instances.length;

    vi.advanceTimersByTime(60_000);
    expect(fake.instances).toHaveLength(created); // no silent retry loop

    client.retryNow();
    expect(fake.instances).toHaveLength(created + 1);
    expect(client.connection.status).toBe('connecting');
    fake.last.open();
    expect(client.connection.status).toBe('live');
  });

  it('detects a silent (stalled) connection and reconnects', () => {
    const { client, fake } = setup();
    client.start();
    fake.last.open();
    vi.advanceTimersByTime(3000);
    fake.last.emit(frame());
    vi.advanceTimersByTime(3000);
    expect(client.connection.status).toBe('live'); // traffic resets the watchdog
    vi.advanceTimersByTime(2500);
    expect(client.connection.status).toBe('reconnecting');
    expect(client.connection.errorMessage).toMatch(/stopped responding/i);
    expect(fake.instances[0]?.closed).toBe(true);
  });

  it('only resets the backoff after the connection has been stable (anti-flapping)', () => {
    const { client, fake } = setup();
    client.start();
    fake.last.drop();
    vi.advanceTimersByTime(1000);
    fake.last.open(); // briefly up...
    fake.last.drop(); // ...and down again
    expect(client.connection.attempt).toBe(2); // not reset to 1

    vi.advanceTimersByTime(2000);
    fake.last.open();
    vi.advanceTimersByTime(2500);
    fake.last.emit(frame()); // keep traffic flowing so the stale watchdog stays quiet
    vi.advanceTimersByTime(2500); // now stable for 5s
    expect(client.connection.attempt).toBe(0);
  });

  it('ignores callbacks from a superseded transport', () => {
    const { client, fake, events } = setup();
    client.start();
    const first = fake.last;
    first.open();
    first.drop();
    vi.advanceTimersByTime(1000);
    first.emit(frame({ id: 'late' }));
    first.drop();
    expect(events).toEqual([]);
    expect(fake.instances).toHaveLength(2);
  });

  it('sends the auth token in-band after open (never via URL)', () => {
    const { client, fake } = setup({ getAuthToken: () => 's3cret' });
    client.start();
    expect(fake.last.sent).toEqual([]);
    fake.last.open();
    expect(JSON.parse(fake.last.sent[0] ?? '{}')).toEqual({ type: 'auth', token: 's3cret' });
  });

  it('drops frames beyond the per-second flood limit without parsing', () => {
    const { client, fake, events, dropped } = setup({ maxMessagesPerSecond: 10 });
    client.start();
    fake.last.open();
    for (let i = 0; i < 25; i += 1) fake.last.emit(frame());
    expect(events).toHaveLength(10);
    expect(dropped()).toBe(15);
    vi.advanceTimersByTime(1000);
    fake.last.emit(frame());
    expect(events).toHaveLength(11);
  });

  it('fails fast with a generic message when the transport cannot be created', () => {
    const { client, statuses } = setup({
      transportFactory: () => {
        throw new Error('wss://secret-host/?token=abc is invalid');
      },
    });
    client.start();
    expect(lastStatus(statuses)?.status).toBe('error');
    expect(lastStatus(statuses)?.errorMessage).not.toMatch(/secret|token|wss/);
  });

  it('stop() closes the transport and cancels pending retries', () => {
    const { client, fake } = setup();
    client.start();
    fake.last.drop();
    client.stop();
    vi.advanceTimersByTime(60_000);
    expect(fake.instances).toHaveLength(1);
  });
});
