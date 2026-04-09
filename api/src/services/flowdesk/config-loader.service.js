/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLOWDESK CONFIG LOADER SERVICE
 * Loads FlowDesk business configurations from KB (Memgraph) with Redis caching.
 * Replaces hardcoded values in executors with KB-driven, editable configs.
 *
 * Config types: SLAConfig, QueueMapping, KeywordRule, ServiceCategory,
 *               DomainCode, ConfidenceThreshold, ScopeRule
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CACHE_PREFIX = 'flowdesk:config:';
const DEFAULT_TTL = 300; // 5 minutes

// ── Hardcoded fallbacks (used when KB unavailable) ──

const FALLBACK_SLA = {
  critical: { responseHours: 1, resolutionHours: 4 },
  high: { responseHours: 4, resolutionHours: 24 },
  medium: { responseHours: 8, resolutionHours: 48 },
  low: { responseHours: 24, resolutionHours: 168 },
};

const FALLBACK_QUEUES = {
  'IT-HW': 'hardware-support', 'IT-SW': 'software-support',
  'IT-NET': 'network-ops', 'IT-SEC': 'security-team',
  'IT-ACC': 'access-mgmt', 'HR': 'hr-services',
  'FACILITIES': 'facilities-mgmt', 'GENERAL': 'general-support',
};

const FALLBACK_THRESHOLDS = {
  L1: { highThreshold: 0.95 },
  L2: { highThreshold: 0.80, mediumThreshold: 0.55 },
  L3: { highThreshold: 0.50 },
};

class FlowDeskConfigLoader {
  /**
   * @param {object} memgraphService
   * @param {object} [redisClient] - Optional Redis client for caching
   * @param {number} [cacheTtl=300] - Cache TTL in seconds
   */
  constructor(memgraphService, redisClient = null, cacheTtl = DEFAULT_TTL) {
    this._memgraph = memgraphService;
    this._redis = redisClient;
    this._ttl = cacheTtl;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLA CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  async getSLAConfig(priority = null) {
    const config = await this._loadCached('sla', async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (s:SLAConfig {namespace: 'CORE'})
        RETURN s.priority AS priority, s.responseHours AS responseHours,
               s.resolutionHours AS resolutionHours, s.escalationHours AS escalationHours,
               s.businessHoursOnly AS businessHoursOnly
      `);
      const map = {};
      for (const r of result.records || []) {
        const p = r.get('priority');
        map[p] = {
          responseHours: this._num(r.get('responseHours')),
          resolutionHours: this._num(r.get('resolutionHours')),
          escalationHours: this._num(r.get('escalationHours')),
          businessHoursOnly: r.get('businessHoursOnly') || false,
        };
      }
      return Object.keys(map).length > 0 ? map : FALLBACK_SLA;
    });
    return priority ? (config[priority] || FALLBACK_SLA[priority]) : config;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUEUE MAPPING
  // ══════════════════════════════════════════════════════════════════════════

  async getQueueMapping(queueCode = null) {
    const config = await this._loadCached('queues', async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (q:QueueMapping {namespace: 'CORE', isActive: true})
        RETURN q.queueCode AS queueCode, q.teamName AS teamName, q.description AS description
      `);
      const map = {};
      for (const r of result.records || []) {
        map[r.get('queueCode')] = r.get('teamName');
      }
      return Object.keys(map).length > 0 ? map : FALLBACK_QUEUES;
    });
    return queueCode ? (config[queueCode] || config['GENERAL'] || 'general-support') : config;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KEYWORD RULES
  // ══════════════════════════════════════════════════════════════════════════

  async getKeywordRules(language = 'en') {
    return this._loadCached(`keywords:${language}`, async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (k:KeywordRule {namespace: 'CORE', language: $language, isActive: true})
        RETURN k.pattern AS pattern, k.category AS category, k.priority AS priority
        ORDER BY k.priority DESC
      `, { language });
      return (result.records || []).map(r => ({
        pattern: r.get('pattern'),
        category: r.get('category'),
        priority: this._num(r.get('priority')),
      }));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERVICE CATEGORIES
  // ══════════════════════════════════════════════════════════════════════════

  async getServiceCategories(level = null) {
    const all = await this._loadCached('categories', async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (c:ServiceCategory {namespace: 'CORE', isActive: true})
        RETURN c.code AS code, c.name AS name, c.parentCode AS parentCode,
               c.level AS level, c.slaHours AS slaHours, c.requiresApproval AS requiresApproval
        ORDER BY c.code
      `);
      return (result.records || []).map(r => ({
        code: r.get('code'),
        name: r.get('name'),
        parentCode: r.get('parentCode') || null,
        level: this._num(r.get('level')),
        slaHours: this._num(r.get('slaHours')),
        requiresApproval: r.get('requiresApproval') || false,
      }));
    });
    return level ? all.filter(c => c.level === level) : all;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOMAIN CODES
  // ══════════════════════════════════════════════════════════════════════════

  async getDomainCodes() {
    return this._loadCached('domains', async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (d:DomainCode {namespace: 'CORE', isActive: true})
        RETURN d.code AS code, d.name AS name, d.color AS color
        ORDER BY d.code
      `);
      return (result.records || []).map(r => ({
        code: r.get('code'),
        name: r.get('name'),
        color: r.get('color'),
      }));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIDENCE THRESHOLDS
  // ══════════════════════════════════════════════════════════════════════════

  async getConfidenceThresholds(level = null) {
    const config = await this._loadCached('thresholds', async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (t:ConfidenceThreshold {namespace: 'CORE'})
        RETURN t.classifierLevel AS level, t.highThreshold AS high,
               t.mediumThreshold AS medium, t.lowThreshold AS low
      `);
      const map = {};
      for (const r of result.records || []) {
        const lv = r.get('level');
        map[lv] = {
          highThreshold: this._num(r.get('high')),
          mediumThreshold: this._numOrNull(r.get('medium')),
          lowThreshold: this._numOrNull(r.get('low')),
        };
      }
      return Object.keys(map).length > 0 ? map : FALLBACK_THRESHOLDS;
    });
    return level ? (config[level] || FALLBACK_THRESHOLDS[level]) : config;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCOPE RULES
  // ══════════════════════════════════════════════════════════════════════════

  async getScopeRules() {
    return this._loadCached('scopes', async () => {
      const result = await this._memgraph.executeQuery(`
        MATCH (s:ScopeRule {namespace: 'CORE'})
        RETURN s.scopeType AS scopeType, s.priority AS priority,
               s.matchField AS matchField, s.description AS description
        ORDER BY s.priority ASC
      `);
      return (result.records || []).map(r => ({
        scopeType: r.get('scopeType'),
        priority: this._num(r.get('priority')),
        matchField: r.get('matchField'),
        description: r.get('description'),
      }));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Invalidate cache for a config type (or all).
   * @param {string} [type='all'] - 'sla' | 'queues' | 'keywords:en' | 'categories' | 'domains' | 'thresholds' | 'scopes' | 'all'
   */
  async invalidateCache(type = 'all') {
    if (!this._redis) return;
    try {
      if (type === 'all') {
        const keys = await this._redis.keys(`${CACHE_PREFIX}*`);
        if (keys.length > 0) await this._redis.del(...keys);
      } else {
        await this._redis.del(`${CACHE_PREFIX}${type}`);
      }
    } catch { /* non-critical */ }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ══════════════════════════════════════════════════════════════════════════

  async _loadCached(key, loader) {
    const cacheKey = `${CACHE_PREFIX}${key}`;

    // Try cache
    if (this._redis) {
      try {
        const cached = await this._redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch { /* cache miss */ }
    }

    // Load from KB
    let data;
    try {
      data = await loader();
    } catch (e) {
      console.warn(`[FlowDeskConfigLoader] KB load failed for ${key}: ${e.message}`);
      return this._getFallback(key);
    }

    // Store in cache
    if (this._redis && data) {
      try {
        await this._redis.set(cacheKey, JSON.stringify(data));
        await this._redis.expire(cacheKey, this._ttl);
      } catch { /* non-critical */ }
    }

    return data;
  }

  _getFallback(key) {
    if (key === 'sla') return FALLBACK_SLA;
    if (key === 'queues') return FALLBACK_QUEUES;
    if (key === 'thresholds') return FALLBACK_THRESHOLDS;
    return [];
  }

  _num(val) {
    if (val === null || val === undefined) return 0;
    return typeof val === 'number' ? val : (val?.toNumber?.() ?? (Number(val) || 0));
  }

  _numOrNull(val) {
    if (val === null || val === undefined || val === -1) return null;
    return typeof val === 'number' ? (val === -1 ? null : val) : (val?.toNumber?.() ?? null);
  }
}

// Singleton
let _instance = null;
function getFlowDeskConfigLoader() {
  if (!_instance) {
    const memgraphService = require('../memgraph.service');
    let redis = null;
    try { redis = require('../redis.service'); } catch {}
    _instance = new FlowDeskConfigLoader(memgraphService, redis);
  }
  return _instance;
}

module.exports = { FlowDeskConfigLoader, getFlowDeskConfigLoader };
