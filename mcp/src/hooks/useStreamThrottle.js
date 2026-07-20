import { useRef, useCallback, useEffect } from 'react';

/**
 * useStreamThrottle — coalesce high-frequency streaming state updates.
 *
 * SSE / ReadableStream chat handlers typically call setState on *every* token,
 * which forces React to re-render (and re-parse markdown for) the whole message
 * list per token — an O(n²) blow-up over a long response that shows up in the
 * console as `[Violation] 'message' handler took <N>ms` (React's scheduler
 * flushing a heavy commit via its MessageChannel).
 *
 * This hook records the *latest* pending flush and runs it at most once per
 * `delayMs`, collapsing many token updates into a few renders. Because only the
 * last scheduled callback survives per window, callers MUST accumulate content
 * in their own ref/var and flush the ABSOLUTE value (not an incremental append),
 * otherwise intermediate tokens are lost.
 *
 *   const { schedule, flushNow } = useStreamThrottle(80);
 *   // on each chunk:
 *   acc += token;
 *   schedule(() => setMessages(prev => prev.map(m => m.id === id ? { ...m, content: acc } : m)));
 *   // on stream end / terminal event, before the authoritative final setState:
 *   flushNow();
 *
 * @param {number} delayMs  Max time between flushes (default 80ms ≈ 12 fps).
 */
export function useStreamThrottle(delayMs = 80) {
  const timerRef = useRef(null);
  const pendingRef = useRef(null);

  const schedule = useCallback((fn) => {
    pendingRef.current = fn;
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const f = pendingRef.current;
      pendingRef.current = null;
      if (f) f();
    }, delayMs);
  }, [delayMs]);

  const flushNow = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const f = pendingRef.current;
    pendingRef.current = null;
    if (f) f();
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  return { schedule, flushNow };
}

export default useStreamThrottle;
