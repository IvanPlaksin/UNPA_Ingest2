/**
 * Rate Limiter Middleware (PH-002)
 *
 * Lightweight sliding-window rate limiter. No external dependency.
 * Uses in-memory Map with periodic cleanup. If Redis is available,
 * uses atomic INCR + EXPIRE for distributed limiting (multi-process).
 *
 * Usage:
 *   router.post('/path', rateLimit('aiChat'), handler);
 *
 * Returns 429 with Retry-After header when limit exceeded.
 *
 * @module middleware/rate-limiter
 */

'use strict';

const LOG_PREFIX = '[RateLimiter]';

// ──────────────────────────────────────────────────────────────────
// Configuration per tier
// ──────────────────────────────────────────────────────────────────

const TIERS = {
  // AI chat endpoints — expensive (LLM calls, ~$0.01-0.05 per call)
  aiChat: { points: 20, windowSec: 60, blockSec: 60 },

  // Pattern analysis — moderate (embedding + search)
  patternAnalysis: { points: 10, windowSec: 60, blockSec: 30 },

  // Pattern replacement — destructive mutations
  patternReplace: { points: 5, windowSec: 60, blockSec: 60 },

  // Workspace agent — expensive (LLM calls)
  workspaceAgent: { points: 30, windowSec: 60, blockSec: 30 },

  // General API — high limit
  general: { points: 200, windowSec: 60, blockSec: 10 }
};

// ──────────────────────────────────────────────────────────────────
// In-memory sliding window counter
// ──────────────────────────────────────────────────────────────────

const buckets = new Map(); // key → { count, resetAt }

// Periodic cleanup — remove expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 60000).unref();

function memoryConsume(key, tier) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    // New window
    buckets.set(key, { count: 1, resetAt: now + tier.windowSec * 1000 });
    return {
      allowed: true,
      remaining: tier.points - 1,
      resetMs: tier.windowSec * 1000
    };
  }

  if (bucket.count >= tier.points) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: bucket.resetAt - now
    };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: tier.points - bucket.count,
    resetMs: bucket.resetAt - now
  };
}

// ──────────────────────────────────────────────────────────────────
// Redis-backed counter (optional — graceful fallback to in-memory)
// ──────────────────────────────────────────────────────────────────

let _redis = null;
let _redisAvailable = null;

async function getRedis() {
  if (_redisAvailable === false) return null;
  if (_redis) return _redis;
  try {
    _redis = require('../services/redis.service');
    // Check connection
    await _redis.ping?.();
    _redisAvailable = true;
    return _redis;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

async function redisConsume(key, tier) {
  const redis = await getRedis();
  if (!redis) return null; // fallback to memory

  try {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, tier.windowSec);
    }
    const ttl = await redis.ttl(redisKey);

    if (count > tier.points) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: (ttl > 0 ? ttl : tier.blockSec) * 1000
      };
    }

    return {
      allowed: true,
      remaining: tier.points - count,
      resetMs: (ttl > 0 ? ttl : tier.windowSec) * 1000
    };
  } catch {
    return null; // fallback to memory
  }
}

// ──────────────────────────────────────────────────────────────────
// Middleware factory
// ──────────────────────────────────────────────────────────────────

/**
 * @param {string} tierName  Key in TIERS config
 * @returns {Function} Express middleware
 */
function rateLimit(tierName) {
  const tier = TIERS[tierName] || TIERS.general;

  return async (req, res, next) => {
    const userId = req.user?.id || req.headers['x-user-id'] || req.ip || 'anonymous';
    const key = `${tierName}:${userId}`;

    // Try Redis first, fallback to memory
    let result = await redisConsume(key, tier);
    if (!result) {
      result = memoryConsume(key, tier);
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': String(tier.points),
      'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
      'X-RateLimit-Reset': new Date(Date.now() + result.resetMs).toISOString()
    });

    if (!result.allowed) {
      const retryAfter = Math.ceil(result.resetMs / 1000);
      res.set('Retry-After', String(retryAfter));

      console.warn(`${LOG_PREFIX} Rate limit exceeded: ${key} (tier=${tierName})`);

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
          retryAfter
        }
      });
    }

    next();
  };
}

module.exports = { rateLimit, TIERS };
