/**
 * useSSEStream (PH-003)
 *
 * React hook wrapping ResilientSSEClient for SSE streaming with
 * reconnection, timeout, and state management.
 *
 * Usage:
 *   const { stream, abort, isStreaming, isReconnecting, error, clearError } = useSSEStream({
 *     maxRetries: 3,
 *     timeout: 120000,
 *     onEvent: (eventName, data) => { ... }
 *   });
 *
 *   await stream('/api/v1/path', { body: 'fields' });
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ResilientSSEClient } from '../utils/sse-client';

export function useSSEStream(options = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectInfo, setReconnectInfo] = useState(null);
  const [error, setError] = useState(null);

  const clientRef = useRef(null);
  const onEventRef = useRef(options.onEvent);
  const onCompleteRef = useRef(options.onComplete);

  // Keep callbacks fresh without re-creating stream()
  useEffect(() => {
    onEventRef.current = options.onEvent;
    onCompleteRef.current = options.onComplete;
  }, [options.onEvent, options.onComplete]);

  const stream = useCallback(async (url, body, headers = {}) => {
    setIsStreaming(true);
    setError(null);
    setIsReconnecting(false);
    setReconnectInfo(null);

    const client = new ResilientSSEClient({
      maxRetries: options.maxRetries ?? 3,
      timeout: options.timeout ?? 120000,

      onEvent: (eventName, data) => {
        onEventRef.current?.(eventName, data);
      },

      onReconnect: (attempt, delayMs) => {
        setIsReconnecting(true);
        setReconnectInfo({ attempt, maxRetries: options.maxRetries ?? 3, delayMs });
      },

      onError: (err) => {
        setError(err.message || 'Connection failed');
        setIsStreaming(false);
        setIsReconnecting(false);
      },

      onTimeout: () => {
        setError('Request timed out. Try a simpler query.');
        setIsStreaming(false);
      },

      onComplete: () => {
        setIsStreaming(false);
        setIsReconnecting(false);
        setReconnectInfo(null);
        onCompleteRef.current?.();
      }
    });

    clientRef.current = client;
    await client.connect(url, body, headers);
  }, [options.maxRetries, options.timeout]);

  const abort = useCallback(() => {
    clientRef.current?.abort();
    setIsStreaming(false);
    setIsReconnecting(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clientRef.current?.abort();
  }, []);

  return {
    stream,
    abort,
    isStreaming,
    isReconnecting,
    reconnectInfo,
    error,
    clearError
  };
}

export default useSSEStream;
