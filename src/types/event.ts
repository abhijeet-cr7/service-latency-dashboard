/** Severity of a single monitoring event. */
export const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Health of the service that emitted the event. */
export const SERVICE_STATUSES = ['ok', 'degraded', 'down'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/**
 * A validated, normalised event. Only values of this type reach React.
 * Everything arriving over the wire is `unknown` until `parseEvent` accepts it.
 */
export interface LiveEvent {
  readonly id: string;
  /** Epoch milliseconds. */
  readonly ts: number;
  readonly source: string;
  readonly severity: Severity;
  readonly status: ServiceStatus;
  /** Response latency in ms: the metric plotted on the live chart. */
  readonly latencyMs: number;
  /** Free text from the stream. Untrusted, and always rendered as text. */
  readonly message: string;
}
