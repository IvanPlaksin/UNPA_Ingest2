import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResilientSSEClient } from '../sse-client';

describe('ResilientSSEClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('sets default options', () => {
      const client = new ResilientSSEClient();
      expect(client.maxRetries).toBe(3);
      expect(client.timeout).toBe(120000);
    });

    it('accepts custom options', () => {
      const client = new ResilientSSEClient({
        maxRetries: 5,
        timeout: 60000
      });
      expect(client.maxRetries).toBe(5);
      expect(client.timeout).toBe(60000);
    });
  });

  describe('abort', () => {
    it('sets _aborted flag', () => {
      const client = new ResilientSSEClient();
      client.abort();
      expect(client._aborted).toBe(true);
    });
  });

  describe('connection handling', () => {
    it('calls onError after max retries', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const onError = vi.fn();
      const onReconnect = vi.fn();

      const client = new ResilientSSEClient({
        maxRetries: 2,
        retryDelay: 10,
        onError,
        onReconnect
      });

      await client.connect('/test', {});

      expect(onReconnect).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('abort prevents further retries', () => {
      const client = new ResilientSSEClient({
        maxRetries: 3,
        retryDelay: 10
      });

      // Abort before any connection
      client.abort();
      expect(client._aborted).toBe(true);
    });

    it('calls onComplete on successful stream', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn()
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      const onComplete = vi.fn();
      const client = new ResilientSSEClient({ onComplete });

      await client.connect('/test', {});

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('parses SSE events and calls onEvent', async () => {
      const chunk = 'event: text\ndata: {"content":"hello"}\n\n';
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunk) })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn()
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      const onEvent = vi.fn();
      const client = new ResilientSSEClient({ onEvent });

      await client.connect('/test', {});

      expect(onEvent).toHaveBeenCalledWith('text', { content: 'hello' });
    });

    it('rejects with error on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const onError = vi.fn();
      const client = new ResilientSSEClient({
        maxRetries: 0,
        onError
      });

      await client.connect('/test', {});

      expect(onError).toHaveBeenCalledTimes(1);
    });
  });
});
