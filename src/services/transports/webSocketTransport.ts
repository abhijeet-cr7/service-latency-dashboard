import type { Transport, TransportHandlers } from '../../types/stream';

/**
 * Validates the endpoint before any socket is opened:
 * - only ws:/wss:, and ws: only in development (production requires TLS)
 * - no embedded credentials (`wss://user:pass@host`)
 * Throws on violation. The stream client turns that into a generic error state.
 */
export function assertSafeSocketUrl(rawUrl: string, allowInsecure: boolean): URL {
  const url = new URL(rawUrl);
  const secure = url.protocol === 'wss:';
  const insecureAllowed = url.protocol === 'ws:' && allowInsecure;
  if (!secure && !insecureAllowed) throw new Error('Insecure or unsupported stream protocol');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in the URL');
  return url;
}

/** Thin adapter from the browser WebSocket API to the Transport interface. */
export function createWebSocketTransportFactory(rawUrl: string): () => Transport {
  const url = assertSafeSocketUrl(rawUrl, import.meta.env.DEV);

  return () => {
    let socket: WebSocket | null = null;

    return {
      connect(handlers: TransportHandlers) {
        socket = new WebSocket(url);
        socket.onopen = () => handlers.onOpen();
        // Only text frames are accepted. Anything else is passed through and
        // rejected by validation as the wrong type.
        socket.onmessage = (ev: MessageEvent<unknown>) => handlers.onMessage(ev.data);
        socket.onclose = () => handlers.onClose();
        // `error` is always followed by `close`. The browser gives no useful
        // detail, so reconnection is driven entirely from onclose.
        socket.onerror = () => undefined;
      },
      send(data: string) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(data);
      },
      close() {
        if (!socket) return;
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close(1000, 'client closing');
        }
        socket = null;
      },
    };
  };
}
