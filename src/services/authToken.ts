/**
 * In-memory holder for a stream auth token.
 *
 * - Not persisted (no localStorage/sessionStorage/cookies readable by JS).
 * - Not placed in the socket URL (URLs end up in proxy logs and history).
 * - Sent as the first frame after the socket opens, and never logged.
 *
 * A real app would call `setStreamToken` after its login flow. No token is
 * bundled with the client, and the demo simulator needs none.
 */
let token: string | null = null;

export function setStreamToken(value: string | null): void {
  token = value && value.length > 0 ? value : null;
}

export function getStreamToken(): string | null {
  return token;
}
