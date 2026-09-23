import {
  SERVICE_STATUSES,
  SEVERITIES,
  type LiveEvent,
  type ServiceStatus,
  type Severity,
} from '../types/event';

/** Hard limits applied to untrusted input before any other processing. */
export const LIMITS = {
  /** Raw frames larger than this are rejected before JSON.parse. */
  maxFrameBytes: 4096,
  maxIdLength: 64,
  maxSourceLength: 48,
  maxMessageLength: 280,
  maxLatencyMs: 600_000,
  /** Accept timestamps at most this far in the future (clock skew). */
  maxFutureSkewMs: 60_000,
  /** Reject events older than this. */
  maxAgeMs: 24 * 60 * 60 * 1000,
} as const;

// C0/C1 control characters and bidi overrides (except ordinary whitespace, which
// is collapsed). Bidi overrides let an attacker visually reorder text ("Trojan Source").
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;
const WHITESPACE_RUN = /\s+/g;
const ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const SOURCE_PATTERN = /^[A-Za-z0-9_.\- ]+$/;

/**
 * Normalises untrusted text for display: strips control/bidi characters,
 * collapses whitespace and truncates. It is NOT HTML escaping. React escapes
 * text children, and this text is never passed to innerHTML.
 */
export function sanitizeText(value: string, maxLength: number): string {
  const cleaned = value.replace(UNSAFE_CHARS, '').replace(WHITESPACE_RUN, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function toTimestamp(value: unknown, now: number): number | null {
  const ts = typeof value === 'string' ? Date.parse(value) : value;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  if (ts > now + LIMITS.maxFutureSkewMs || ts < now - LIMITS.maxAgeMs) return null;
  return ts;
}

/**
 * Validates and shapes an already-parsed object into a LiveEvent.
 * Allow-list approach: only known fields are copied; everything else is dropped
 * (this also neutralises `__proto__`/prototype-pollution style keys).
 */
export function toLiveEvent(input: unknown, now: number = Date.now()): LiveEvent | null {
  if (!isRecord(input)) return null;
  const { id, ts, source, severity, status, latencyMs, message } = input;

  if (typeof id !== 'string' || id.length === 0 || id.length > LIMITS.maxIdLength) return null;
  if (!ID_PATTERN.test(id)) return null;

  const timestamp = toTimestamp(ts, now);
  if (timestamp === null) return null;

  if (typeof source !== 'string') return null;
  const cleanSource = sanitizeText(source, LIMITS.maxSourceLength);
  if (cleanSource.length === 0 || !SOURCE_PATTERN.test(cleanSource)) return null;

  if (!isOneOf<Severity>(SEVERITIES, severity)) return null;
  if (!isOneOf<ServiceStatus>(SERVICE_STATUSES, status)) return null;

  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) return null;
  if (latencyMs < 0 || latencyMs > LIMITS.maxLatencyMs) return null;

  const cleanMessage = typeof message === 'string' ? sanitizeText(message, LIMITS.maxMessageLength) : '';

  return {
    id,
    ts: timestamp,
    source: cleanSource,
    severity,
    status,
    latencyMs: Math.round(latencyMs * 10) / 10,
    message: cleanMessage,
  };
}

/** Result of decoding one raw frame from the transport. */
export type ParseResult =
  | { readonly ok: true; readonly event: LiveEvent }
  | { readonly ok: false; readonly reason: 'type' | 'size' | 'json' | 'schema' };

/**
 * Decodes one raw transport frame. The size check runs before JSON.parse so an
 * oversized frame cannot cost parse time or memory.
 */
export function parseFrame(raw: unknown, now: number = Date.now()): ParseResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'type' };
  // UTF-16 length is a cheap upper bound proxy for bytes; good enough for a guard.
  if (raw.length > LIMITS.maxFrameBytes) return { ok: false, reason: 'size' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }

  const event = toLiveEvent(parsed, now);
  return event ? { ok: true, event } : { ok: false, reason: 'schema' };
}
