/**
 * Resilient SSE Client (PH-003)
 *
 * Wraps fetch + ReadableStream for POST-body SSE endpoints.
 * Features:
 *   - Automatic retry with exponential backoff (max 3 retries)
 *   - Request timeout (default 120s for AI endpoints)
 *   - Cleanup on abort/unmount
 *   - Callbacks: onEvent, onError, onReconnect, onTimeout
 *
 * Usage:
 *   const client = new ResilientSSEClient({
 *     maxRetries: 3,
 *     timeout: 120000,
 *     onEvent: (eventName, data) => { ... },
 *     onError: (err) => { ... },
 *     onReconnect: (attempt) => { ... },
 *     onTimeout: () => { ... }
 *   });
 *
 *   await client.connect('/api/v1/path', { body: 'fields' });
 *   // or: client.abort() to cancel
 */

export class ResilientSSEClient {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseRetryDelay = options.retryDelay ?? 1000;
    this.timeout = options.timeout ?? 120000;
    this.onEvent = options.onEvent || (() => {});
    this.onError = options.onError || (() => {});
    this.onReconnect = options.onReconnect || (() => {});
    this.onTimeout = options.onTimeout || (() => {});
    this.onComplete = options.onComplete || (() => {});

    this._controller = null;
    this._retryCount = 0;
    this._aborted = false;
  }

  /**
   * Connect to a POST-body SSE endpoint.
   * Resolves when the stream ends or is aborted.
   *
   * @param {string} url
   * @param {Object} body  JSON body for the POST request
   * @param {Object} [headers]
   */
  async connect(url, body, headers = {}) {
    this._aborted = false;
    this._retryCount = 0;
    return this._attempt(url, body, headers);
  }

  /**
   * Abort the current connection.
   */
  abort() {
    this._aborted = true;
    if (this._controller) {
      try { this._controller.abort(); } catch { /* ignore */ }
    }
  }

  // ──────────────────────────────────────────────────────────────

  async _attempt(url, body, headers) {
    if (this._aborted) return;

    this._controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (!this._aborted) {
        this._controller.abort();
        this.onTimeout();
      }
    }, this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...headers
        },
        body: JSON.stringify(body),
        signal: this._controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body (streaming not supported)');
      }

      // Successfully connected — reset retry count
      this._retryCount = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this._aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let eventName = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith(':')) continue; // heartbeat / comment
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr += line.slice(6);
          }

          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              this.onEvent(eventName, parsed);
            } catch {
              this.onEvent(eventName, { raw: dataStr });
            }
          }
        }
      }

      clearTimeout(timeoutId);
      this.onComplete();

    } catch (err) {
      clearTimeout(timeoutId);

      if (this._aborted || err.name === 'AbortError') {
        return; // intentional abort — don't retry
      }

      // Retry with exponential backoff
      if (this._retryCount < this.maxRetries) {
        this._retryCount++;
        const delay = this.baseRetryDelay * Math.pow(2, this._retryCount - 1);
        this.onReconnect(this._retryCount, delay);

        await new Promise(r => setTimeout(r, delay));
        if (!this._aborted) {
          return this._attempt(url, body, headers);
        }
      } else {
        this.onError(err);
      }
    }
  }
}

export default ResilientSSEClient;
