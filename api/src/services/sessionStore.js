// api/src/services/sessionStore.js
// Shared session storage для Pipeline Lab

let redisService = null;
let useRedis = false;

// Попытка подключения к Redis
try {
  redisService = require('./redis.service');
  useRedis = true;
  console.log('[SessionStore] ✓ Redis service connected for session storage');
} catch (e) {
  console.log('[SessionStore] ✗ Redis not available, using in-memory session storage');
}

// In-memory fallback хранилище сессий (shared между контроллерами)
const memorySessionStore = new Map();

// Redis key prefix для Pipeline Lab сессий
const REDIS_PREFIX = 'pipeline:session:';
const SESSION_TTL = 3600; // 1 час в секундах

// Configuration for memory management
const MAX_SESSIONS = 1000; // Maximum sessions in memory
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let cleanupInterval = null;

/**
 * Получить сессию из хранилища (Redis или memory)
 */
async function getSession(sessionId) {
  console.log(`[SessionStore] getSession: ${sessionId}`);
  console.log(`[SessionStore] memorySessionStore has ${memorySessionStore.size} sessions`);
  console.log(`[SessionStore] memorySessionStore keys: ${Array.from(memorySessionStore.keys()).join(', ')}`);

  if (useRedis && redisService) {
    try {
      const session = await redisService.get(`${REDIS_PREFIX}${sessionId}`);
      if (session) {
        console.log(`[SessionStore] Found in Redis, status: ${session.status}`);
        return session;
      }
    } catch (e) {
      console.error('[SessionStore] Redis get error:', e.message);
    }
  }

  const memSession = memorySessionStore.get(sessionId);
  if (memSession) {
    console.log(`[SessionStore] Found in memory, status: ${memSession.status}`);
  } else {
    console.log(`[SessionStore] Session not found`);
  }
  return memSession || null;
}

/**
 * Evict oldest sessions if we exceed the limit
 * @private
 */
function evictOldestSessions() {
  if (memorySessionStore.size < MAX_SESSIONS) return;

  // Sort by createdAt and remove oldest 10%
  const sessions = Array.from(memorySessionStore.entries())
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));

  const toRemove = Math.ceil(sessions.length * 0.1);
  for (let i = 0; i < toRemove; i++) {
    memorySessionStore.delete(sessions[i][0]);
  }
  console.log(`[SessionStore] Evicted ${toRemove} oldest sessions (limit: ${MAX_SESSIONS})`);
}

/**
 * Сохранить сессию в хранилище (Redis или memory)
 */
async function saveSession(sessionId, sessionData) {
  console.log(`[SessionStore] saveSession: ${sessionId}, status: ${sessionData.status}`);

  // Check memory limit before adding
  evictOldestSessions();

  // Всегда сохраняем в memory для быстрого доступа во время обработки
  memorySessionStore.set(sessionId, sessionData);

  if (useRedis && redisService) {
    try {
      await redisService.set(`${REDIS_PREFIX}${sessionId}`, sessionData, SESSION_TTL);
    } catch (e) {
      console.error('[SessionStore] Redis set error:', e.message);
    }
  }
}

/**
 * Удалить сессию из хранилища
 */
async function deleteSession(sessionId) {
  memorySessionStore.delete(sessionId);

  if (useRedis && redisService) {
    try {
      await redisService.del(`${REDIS_PREFIX}${sessionId}`);
    } catch (e) {
      console.error('[SessionStore] Redis del error:', e.message);
    }
  }
}

/**
 * Cleanup expired sessions from memory
 * @private
 */
function cleanupExpiredSessions() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let removed = 0;
  for (const [id, session] of memorySessionStore.entries()) {
    if (session.createdAt < oneHourAgo) {
      memorySessionStore.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[SessionStore] Cleaned up ${removed} expired sessions`);
  }
}

/**
 * Start the cleanup interval (call once at app startup)
 */
function startCleanup() {
  if (cleanupInterval) {
    console.log('[SessionStore] Cleanup already running');
    return;
  }
  cleanupInterval = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
  console.log('[SessionStore] Started session cleanup interval');
}

/**
 * Stop the cleanup interval (call at app shutdown)
 */
function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[SessionStore] Stopped session cleanup interval');
  }
}

// Auto-start cleanup (but now it's manageable)
startCleanup();

function isUsingRedis() {
  return useRedis;
}

module.exports = {
  getSession,
  saveSession,
  deleteSession,
  memorySessionStore,
  useRedis: isUsingRedis,
  startCleanup,
  stopCleanup,
  // Expose for testing
  MAX_SESSIONS
};
