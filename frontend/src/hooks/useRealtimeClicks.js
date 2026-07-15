import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// Socket.io attaches to the bare HTTP server, not under /api - derive the
// origin from VITE_API_URL by stripping the /api suffix.
const SOCKET_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api$/, '');

export function useRealtimeClicks(token, handlers) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers; // always call the latest handlers without re-connecting

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_ORIGIN, { auth: { token }, reconnectionDelay: 2000 });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    // Real-time updates are a nice-to-have layered on top of the dashboard -
    // a connection failure (e.g. the provider doesn't support Redis pub/sub)
    // should never surface as a user-facing error, just silently stay
    // disconnected. The dashboard's manual refresh always still works.
    socket.on('connect_error', () => setConnected(false));

    socket.on('link:click', ({ shortCode, clickCount }) => {
      handlersRef.current?.onClick?.(shortCode, clickCount);
    });
    // These two mean the SAME account deleted a link somewhere else - another
    // tab, another device - and this dashboard should reflect it immediately
    // too, without a manual refresh.
    socket.on('link:deleted', ({ shortCode }) => {
      handlersRef.current?.onDeleted?.(shortCode);
    });
    socket.on('link:permanentlyDeleted', ({ shortCode }) => {
      handlersRef.current?.onPermanentlyDeleted?.(shortCode);
    });
    // Fires once background title/category/AI-summary enrichment finishes -
    // see url.service.js. Without this, those fields only ever appeared
    // after a manual page reload.
    socket.on('link:enriched', (payload) => {
      handlersRef.current?.onEnriched?.(payload);
    });

    return () => socket.disconnect();
  }, [token]);

  return { connected };
}
