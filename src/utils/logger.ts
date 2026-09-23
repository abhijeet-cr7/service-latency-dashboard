/**
 * The only module allowed to touch `console` (enforced by ESLint).
 * It accepts a fixed event name plus optional *numeric/enum* context, never
 * raw payloads, URLs or tokens, so nothing sensitive can be logged by accident.
 * It is silent in production builds and in tests.
 */
type LogContext = Readonly<Record<string, number | boolean | string | null>>;

const enabled = import.meta.env.DEV && import.meta.env.MODE !== 'test';

export const logger = {
  info(event: string, context?: LogContext): void {
    if (enabled) console.info(`[live] ${event}`, context ?? '');
  },
  warn(event: string, context?: LogContext): void {
    if (enabled) console.warn(`[live] ${event}`, context ?? '');
  },
};
