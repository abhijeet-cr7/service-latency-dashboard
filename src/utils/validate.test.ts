import { LIMITS, parseFrame, sanitizeText, toLiveEvent } from './validate';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const valid = {
  id: 'abc-1',
  ts: NOW - 1000,
  source: 'payments',
  severity: 'error',
  status: 'degraded',
  latencyMs: 123.456,
  message: 'Upstream timeout',
};

describe('toLiveEvent', () => {
  it('accepts and normalises a valid event', () => {
    expect(toLiveEvent(valid, NOW)).toEqual({ ...valid, latencyMs: 123.5 });
  });

  it('accepts ISO timestamps', () => {
    expect(toLiveEvent({ ...valid, ts: new Date(NOW).toISOString() }, NOW)?.ts).toBe(NOW);
  });

  it.each([
    ['non-object', 'hello'],
    ['array', [valid]],
    ['null', null],
    ['unknown severity', { ...valid, severity: 'PANIC' }],
    ['unknown status', { ...valid, status: 'on-fire' }],
    ['string latency', { ...valid, latencyMs: '12' }],
    ['negative latency', { ...valid, latencyMs: -1 }],
    ['NaN latency', { ...valid, latencyMs: Number.NaN }],
    ['huge latency', { ...valid, latencyMs: LIMITS.maxLatencyMs + 1 }],
    ['missing id', { ...valid, id: undefined }],
    ['id with markup', { ...valid, id: '<script>' }],
    ['over-long id', { ...valid, id: 'a'.repeat(LIMITS.maxIdLength + 1) }],
    ['source with markup', { ...valid, source: '<b>x</b>' }],
    ['future timestamp', { ...valid, ts: NOW + LIMITS.maxFutureSkewMs + 1 }],
    ['ancient timestamp', { ...valid, ts: NOW - LIMITS.maxAgeMs - 1 }],
    ['unparseable date', { ...valid, ts: 'yesterday' }],
  ])('rejects %s', (_label, input) => {
    expect(toLiveEvent(input, NOW)).toBeNull();
  });

  it('drops unknown fields (allow-list), including __proto__ keys', () => {
    const hostile = JSON.parse(`{"__proto__":{"polluted":true},"extra":1,${JSON.stringify(valid).slice(1)}`);
    const event = toLiveEvent(hostile, NOW);
    expect(event).not.toBeNull();
    expect(Object.keys(event ?? {})).toEqual([
      'id',
      'ts',
      'source',
      'severity',
      'status',
      'latencyMs',
      'message',
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps hostile markup as inert text (escaping is React’s job) but strips control/bidi chars', () => {
    const event = toLiveEvent({ ...valid, message: '<img src=x onerror=alert(1)>‮\u0000' }, NOW);
    expect(event?.message).toBe('<img src=x onerror=alert(1)>');
  });

  it('defaults a missing message to an empty string', () => {
    expect(toLiveEvent({ ...valid, message: 42 }, NOW)?.message).toBe('');
  });
});

describe('sanitizeText', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(sanitizeText('  a \n\t b  ', 10)).toBe('a b');
    expect(sanitizeText('abcdefghijkl', 5)).toBe('abcd…');
  });
});

describe('parseFrame', () => {
  it('parses a valid JSON frame', () => {
    const result = parseFrame(JSON.stringify(valid), NOW);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['type', 42],
    ['type', new ArrayBuffer(8)],
    ['size', 'x'.repeat(LIMITS.maxFrameBytes + 1)],
    ['json', '{"id": '],
    ['schema', JSON.stringify({ id: 'x' })],
  ])('rejects with reason %s', (reason, raw) => {
    expect(parseFrame(raw, NOW)).toEqual({ ok: false, reason });
  });
});
