import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSSEStream } from '../useSSEStream';

describe('useSSEStream', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useSSEStream());

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.stream).toBe('function');
    expect(typeof result.current.abort).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  it('sets isStreaming to true when stream starts', async () => {
    global.fetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useSSEStream());

    act(() => {
      result.current.stream('/api/test', { query: 'test' });
    });

    expect(result.current.isStreaming).toBe(true);
  });

  it('clears error when clearError called', () => {
    const { result } = renderHook(() => useSSEStream());

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });

  it('aborts stream and resets state', () => {
    global.fetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useSSEStream());

    act(() => {
      result.current.stream('/api/test', {});
    });

    act(() => {
      result.current.abort();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
  });

  it('cleans up on unmount', () => {
    global.fetch.mockImplementation(() => new Promise(() => {}));

    const { result, unmount } = renderHook(() => useSSEStream());

    act(() => {
      result.current.stream('/api/test', {});
    });

    // Should not throw on unmount
    unmount();
  });

  it('accepts custom options', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSSEStream({
      maxRetries: 5,
      timeout: 60000,
      onEvent
    }));

    expect(result.current.isStreaming).toBe(false);
  });
});
