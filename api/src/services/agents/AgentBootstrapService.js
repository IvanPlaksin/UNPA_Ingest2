/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AgentBootstrapService
 *
 * Loads AI assistant context from Knowledge Graph at session start.
 * - Fetches AgentProfile + KnowledgeSections from Memgraph
 * - Assembles system context for Claude API
 * - Caches sessions in-memory for reuse
 * - Falls back to hardcoded context if Memgraph is unavailable
 * ═══════════════════════════════════════════════════════════════════════════
 */

const memgraphService = require('../memgraph.service');
const { agentLearningService } = require('./AgentLearningService');

// Lazy-load Codex loader to avoid circular dependency
let _codexLoader = null;
function getCodexLoader() {
  if (!_codexLoader) {
    try {
      _codexLoader = require('../codex/codex-loader.service');
    } catch (e) {
      console.warn('[AgentBootstrap] Codex loader not available:', e.message);
    }
  }
  return _codexLoader;
}

// ────────────────────────────────────────────────────────────────────────────
// FALLBACK CONTEXT (used when Memgraph is unavailable)
// ────────────────────────────────────────────────────────────────────────────

const FALLBACK_CONTEXT = {
  agentProfile: {
    id: 'agent-gxe-assistant-v1',
    name: 'GXE AI Assistant',
    model: 'claude-sonnet-4-6',
    temperature: 0.3,
    status: 'active',
  },
  knowledgeSections: [
    {
      id: 'ks-fallback',
      title: 'Fallback Context',
      priority: 0,
      content: `You are the GXE AI Assistant. You help users build executable graphs using 42 registered executors across 7 domains: common (workflow.start, workflow.end, workflow.condition, ai.generate, vector.search, graph.create_node, graph.query), workflow (workflow.wait_input, workflow.set_variable, workflow.validate, graph.query_profile, workflow.spawn_graph), notification (notification.send), subgraph (subgraph.segment_graph, subgraph.extract_subgraph, subgraph.consolidate_subgraph), sql-extraction (sql.connect, sql.query, sql.schema_scan, sql.procedure_list, sql.ast_parse, sql.gxe_translate, sql.domain_persist, sql.cross_domain_link), ingestion (ingestion.parse_document, ingestion.sanitize, ingestion.detect_language, ingestion.chunk_text, ingestion.extract_entities, ingestion.extract_relations, ingestion.classify_content, ingestion.write_graph, ingestion.write_vector, ingestion.consolidate_subgraph), rag (rag.expand_query, rag.vector_search, rag.graph_search, rag.hybrid_search, rag.assemble_context, rag.rerank, rag.generate_response, rag.summarize). Every graph must have exactly one workflow.start and at least one workflow.end. All condition nodes must have both true and false branches.`,
    },
  ],
  systemContext: null, // assembled lazily
};

// ────────────────────────────────────────────────────────────────────────────
// SESSION CACHE
// ────────────────────────────────────────────────────────────────────────────

const sessionCache = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ────────────────────────────────────────────────────────────────────────────
// SERVICE
// ────────────────────────────────────────────────────────────────────────────

class AgentBootstrapService {
  /**
   * Bootstrap agent context from Knowledge Graph.
   * @param {string} agentId - Agent profile ID (default: 'agent-gxe-assistant-v1')
   * @returns {Promise<{agentProfile: Object, knowledgeSections: Array, systemContext: string}>}
   */
  async bootstrap(agentId = 'agent-gxe-assistant-v1') {
    try {
      const cypher = `
        MATCH (a:AgentProfile {id: $agentId})
        OPTIONAL MATCH (a)-[:HAS_KNOWLEDGE {active: true}]->(k:KnowledgeSection)
        RETURN a.id AS agentId, a.name AS agentName, a.model AS model,
               a.temperature AS temperature, a.status AS status,
               k.id AS sectionId, k.title AS sectionTitle,
               k.priority AS sectionPriority, k.content AS sectionContent
        ORDER BY k.priority ASC
      `;

      const rows = await memgraphService.runQuery(cypher, { agentId });

      if (!rows || rows.length === 0) {
        console.warn(`[AgentBootstrap] Agent "${agentId}" not found in KG, using fallback`);
        return this._buildFallback();
      }

      // Build profile from first row
      const first = rows[0];
      const agentProfile = {
        id: first.agentId,
        name: first.agentName,
        model: first.model,
        temperature: first.temperature,
        status: first.status,
      };

      // Build knowledge sections (filter out null rows from OPTIONAL MATCH)
      const knowledgeSections = rows
        .filter(r => r.sectionId != null)
        .map(r => ({
          id: r.sectionId,
          title: r.sectionTitle,
          priority: r.sectionPriority,
          content: r.sectionContent,
        }));

      let systemContext = this.assembleSystemContext(agentProfile, knowledgeSections);

      // Append past lessons learned (error KB)
      try {
        const lessonsBlock = await agentLearningService.formatLessonsForContext();
        if (lessonsBlock) {
          systemContext += lessonsBlock;
        }
      } catch (err) {
        console.warn(`[AgentBootstrap] Failed to load lessons: ${err.message}`);
      }

      // Append Codex: minimal bootstrap prompt (lazy loading approach)
      // Instead of loading ALL rules, inject compact instructions + bootstrap rules.
      // Agents search for relevant rules on-demand via codex_search_rules tool.
      let codexRuleCount = 0;
      try {
        const codexLoader = getCodexLoader();
        if (codexLoader) {
          const minimalResult = await codexLoader.getMinimalPrompt();
          if (minimalResult && minimalResult.prompt) {
            systemContext += '\n\n' + minimalResult.prompt;
            codexRuleCount = minimalResult.rulesCount || 0;
            console.log(`[AgentBootstrap] Codex minimal prompt: ~${minimalResult.tokenEstimate} tokens, ${codexRuleCount} bootstrap rules`);
          }
        }
      } catch (err) {
        console.warn(`[AgentBootstrap] Failed to load Codex bootstrap: ${err.message}`);
      }

      // Append AOPEG executor catalog so agent knows available tools
      let executorCount = 0;
      try {
        const aopeg = require('../../core/aopeg/index.js');
        if (!aopeg.isAOPEGInitialized()) {
          await aopeg.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
        }
        const registry = aopeg.pluginRegistry;
        if (registry) {
          const executors = registry.getAllExecutors();
          executorCount = executors.length;
          if (executorCount > 0) {
            const byDomain = {};
            for (const e of executors) {
              const d = e.domain || 'general';
              if (!byDomain[d]) byDomain[d] = [];
              byDomain[d].push(e);
            }
            let catalog = '\n\n<executor_catalog>\n';
            catalog += `Available AOPEG executors (${executorCount} total). Use these exact type IDs when building GXE graphs.\n\n`;
            for (const [domain, execs] of Object.entries(byDomain)) {
              catalog += `## ${domain}\n`;
              for (const e of execs) {
                catalog += `- **${e.type}**: ${e.description || e.displayName || 'No description'}\n`;
              }
              catalog += '\n';
            }
            catalog += '</executor_catalog>';
            systemContext += catalog;
          }
        }
      } catch (err) {
        console.warn(`[AgentBootstrap] Failed to load executor catalog: ${err.message}`);
      }

      const lessonCount = await agentLearningService.getLessonCount().catch(() => 0);
      console.log(`[AgentBootstrap] Loaded agent "${agentProfile.name}" with ${knowledgeSections.length} knowledge sections, ${lessonCount} lessons, ${codexRuleCount} codex rules, ${executorCount} executors`);

      return { agentProfile, knowledgeSections, systemContext };
    } catch (err) {
      console.warn(`[AgentBootstrap] KG load failed: ${err.message}, using fallback`);
      return this._buildFallback();
    }
  }

  /**
   * Assemble system context string from agent profile and knowledge sections.
   * @param {Object} profile - AgentProfile
   * @param {Array} sections - KnowledgeSections sorted by priority
   * @returns {string} - System prompt for Claude API
   */
  assembleSystemContext(profile, sections) {
    const parts = [];

    // Preamble with role
    parts.push(`# ${profile.name}\n`);
    parts.push(`Model: ${profile.model} | Temperature: ${profile.temperature}\n`);

    // Knowledge sections in priority order
    for (const section of sections) {
      parts.push(`\n## ${section.title}\n`);
      parts.push(section.content);
    }

    return parts.join('\n');
  }

  /**
   * Get or create a cached session.
   * @param {string} sessionId - Unique session identifier
   * @param {string} agentId - Agent profile ID
   * @returns {Promise<{agentProfile: Object, knowledgeSections: Array, systemContext: string}>}
   */
  async getOrCreateSession(sessionId, agentId = 'agent-gxe-assistant-v1') {
    const cached = sessionCache.get(sessionId);
    if (cached && (Date.now() - cached.timestamp) < SESSION_TTL_MS) {
      return cached.data;
    }

    const data = await this.bootstrap(agentId);

    sessionCache.set(sessionId, {
      data,
      timestamp: Date.now(),
    });

    // Cleanup old sessions
    this._cleanupExpiredSessions();

    return data;
  }

  /**
   * Invalidate a cached session.
   * @param {string} sessionId
   */
  invalidateSession(sessionId) {
    sessionCache.delete(sessionId);
  }

  /**
   * Get cache stats for monitoring.
   * @returns {Object}
   */
  getCacheStats() {
    return {
      activeSessions: sessionCache.size,
      ttlMs: SESSION_TTL_MS,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────

  /**
   * Resolve which Codex scopes to load based on agent ID.
   * Maps agent types to relevant rule scopes.
   */
  _resolveCodexScopes(agentId) {
    const scopeMap = {
      'agent-gxe-assistant': ['gxe', 'graph', 'assistant', 'execution'],
      'agent-extraction': ['extraction', 'sql', 'crud', 'namespace'],
      'agent-knowledge': ['crud', 'namespace', 'versioning'],
      'agent-flowdesk': ['flowdesk', 'approval', 'routing', 'status', 'migration'],
      'agent-rag': ['crud', 'namespace'],
    };

    // Match by prefix
    for (const [prefix, scopes] of Object.entries(scopeMap)) {
      if (agentId.startsWith(prefix)) return scopes;
    }

    // Default: load all rules
    return ['*'];
  }

  _buildFallback() {
    const fb = FALLBACK_CONTEXT;
    const systemContext = fb.systemContext || this.assembleSystemContext(fb.agentProfile, fb.knowledgeSections);
    return {
      agentProfile: { ...fb.agentProfile },
      knowledgeSections: [...fb.knowledgeSections],
      systemContext,
    };
  }

  _cleanupExpiredSessions() {
    const now = Date.now();
    for (const [key, entry] of sessionCache) {
      if (now - entry.timestamp > SESSION_TTL_MS) {
        sessionCache.delete(key);
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON + EXPORTS
// ────────────────────────────────────────────────────────────────────────────

const agentBootstrapService = new AgentBootstrapService();

module.exports = {
  AgentBootstrapService,
  agentBootstrapService,
};
