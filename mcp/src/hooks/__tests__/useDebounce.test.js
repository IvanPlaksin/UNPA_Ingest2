import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebounce, useDebouncedCallback, useThrottledCallback } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'updated' });
    expect(result.current).toBe('initial');

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('updated');
  });

  it('resets timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'c' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'd' });
    act(() => vi.advanceTimersByTime(300));

    expect(result.current).toBe('d');
  });

  it('uses custom delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'start' } }
    );

    rerender({ value: 'end' });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('start');

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('end');
  });
});

describe('useDebouncedCallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces callback execution', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('arg1');
      result.current('arg2');
      result.current('arg3');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('arg3');
  });

  it('cleans up timer on unmount', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => result.current('test'));
    unmount();
    act(() => vi.advanceTimersByTime(300));

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useThrottledCallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('executes immediately on first call', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 300));

    act(() => result.current('first'));

    expect(callback).toHaveBeenCalledWith('first');
  });

  it('throttles subsequent calls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 300));

    act(() => {
      result.current('first');
      result.current('second');
    });

    // First call executes immediately, second is queued
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');

    act(() => vi.advanceTimersByTime(300));

    // Trailing call fires
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('allows calls after throttle window', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 100));

    act(() => result.current('a'));
    act(() => vi.advanceTimersByTime(150));
    act(() => result.current('b'));

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
