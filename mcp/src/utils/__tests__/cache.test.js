import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleCache } from '../cache';

describe('SimpleCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SimpleCache({ ttl: 1000, maxSize: 5 });
  });

  describe('basic operations', () => {
    it('stores and retrieves values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('returns null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('deletes values', () => {
      cache.set('key', 'value');
      cache.delete('key');
      expect(cache.get('key')).toBeNull();
    });

    it('checks existence with has()', () => {
      cache.set('exists', 'yes');
      expect(cache.has('exists')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('clears all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('reports correct size', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.size()).toBe(2);
    });

    it('overwrites existing key', () => {
      cache.set('key', 'old');
      cache.set('key', 'new');
      expect(cache.get('key')).toBe('new');
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('expires entries after TTL', () => {
      cache = new SimpleCache({ ttl: 100 });
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');

      vi.advanceTimersByTime(150);
      expect(cache.get('key')).toBeNull();
    });

    it('respects custom TTL per entry', () => {
      cache.set('short', 'value', 50);
      cache.set('long', 'value', 500);

      vi.advanceTimersByTime(100);

      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value');
    });

    it('has() returns false for expired entries', () => {
      cache = new SimpleCache({ ttl: 50 });
      cache.set('key', 'value');

      vi.advanceTimersByTime(100);
      expect(cache.has('key')).toBe(false);
    });
  });

  describe('max size pruning', () => {
    it('prunes oldest entries when at capacity', () => {
      cache = new SimpleCache({ ttl: 10000, maxSize: 3 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4);

      expect(cache.size()).toBeLessThanOrEqual(3);
      expect(cache.get('d')).toBe(4);
    });
  });
});
