/**
 * Singleton WebSocket connection shared across all components.
 * Reconnects automatically on close.
 */
import { useEffect, useRef } from 'react';

const WS_URL = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';
  return base.replace(/^http/, 'ws') + '/ws';
})();

let _ws = null;
let _reconnectTimer = null;
const _listeners = new Set();

function ensureConnected() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
    return _ws;
  }
  _ws = new WebSocket(WS_URL);
  _ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      _listeners.forEach(fn => fn(data));
    } catch { /* ignore non-JSON */ }
  };
  _ws.onerror = () => {};
  _ws.onclose = () => {
    _ws = null;
    if (_listeners.size > 0) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = setTimeout(ensureConnected, 3000);
    }
  };
  return _ws;
}

/**
 * Register a listener that receives every WS message object.
 * The listener is stable across renders via ref.
 */
export function useWebSocketListener(handler) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    ensureConnected();
    const listener = (data) => ref.current(data);
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
      if (_listeners.size === 0) {
        clearTimeout(_reconnectTimer);
      }
    };
  }, []);
}
