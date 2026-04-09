/**
 * Codex Loader Service
 *
 * Loads Codex rules for agent system prompts.
 * Replaces static markdown loading with dynamic graph traversal.
 *
 * Design principles:
 * - Selective loading based on agent context
 * - Cached compilation for performance
 * - Formatted output ready for system prompt injection
 */

const codexService = require('./codex.service');
const blackCodexService = require('./blackcodex.service');

// Lazy-load metrics to avoid circular deps at startup
let _metrics = null;
function getMetrics() {
  if (!_metrics) {
    try { _metrics = require('../observability/metrics.service'); } catch { _metrics = null; }
  }
  return _metrics;
}

class CodexLoaderService {
  constructor() {
    this._cache = new Map();
    this._cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  // ============================================================
  // CACHE MANAGEMENT
  // ============================================================

  _getCacheKey(scope, options = {}) {
    return `${scope}:${JSON.stringify(options)}`;
  }

  _getFromCache(key) {
    const cached = this._cache.get(key);
    if (!cached) {
      getMetrics()?.recordCacheResult(false);
      return null;
    }
    if (Date.now() - cached.timestamp > this._cacheTTL) {
      this._cache.delete(key);
      getMetrics()?.recordCacheResult(false);
      return null;
    }
    getMetrics()?.recordCacheResult(true);
    return cached.data;
  }

  _setCache(key, data) {
    this._cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this._cache.clear();
  }

  // ============================================================
  // SCOPE-BASED LOADING
  // ============================================================

  /**
   * Load Codex rules for a specific scope
   *
   * @param {string[]} scopes - e.g. ['crud', 'namespace', 'extraction', 'gxe']
   * @param {object} options
   * @param {boolean} options.includePrinciples - Include M3 principles (default: true)
   * @param {boolean} options.includeAntiPatterns - Include BlackCodex warnings (default: true)
   * @param {string} options.format - 'prompt' | 'json' | 'markdown' (default: 'prompt')
   */
  async loadForScope(scopes, options = {}) {
    const {
      includePrinciples = true,
      includeAntiPatterns = true,
      format = 'prompt'
    } = options;

    // Record search metrics
    const scopeStr = Array.isArray(scopes) ? scopes.join(',') : String(scopes);
    getMetrics()?.recordCodexSearch(scopeStr, null);

    const cacheKey = this._getCacheKey(scopeStr, options);
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    let principles = [];
    if (includePrinciples) {
      principles = await codexService.getPrinciples();
      principles = principles.map(p => p.properties || p);
    }

    // Load rules matching scopes
    const allRules = await codexService.getByType('CodexRule', { status: 'ACTIVE' });
    const isWildcard = scopes.includes('*');
    const relevantRules = allRules.filter(rule => {
      if (isWildcard) return true;
      const r = rule.properties || rule;
      let ruleScopes = r.scope;
      if (typeof ruleScopes === 'string') {
        try { ruleScopes = JSON.parse(ruleScopes); } catch { ruleScopes = []; }
      }
      if (!Array.isArray(ruleScopes)) return false;
      return scopes.some(s =>
        ruleScopes.some(rs => rs.toLowerCase().includes(s.toLowerCase()))
      );
    }).map(r => r.properties || r);

    // Load patterns
    const allPatterns = await codexService.getByType('CodexPattern', { status: 'ACTIVE' });
    const relevantPatterns = allPatterns.filter(pattern => {
      if (isWildcard) return true;
      const p = pattern.properties || pattern;
      let patternScopes = p.scope;
      if (typeof patternScopes === 'string') {
        try { patternScopes = JSON.parse(patternScopes); } catch { patternScopes = []; }
      }
      if (!Array.isArray(patternScopes)) return false;
      return scopes.some(s =>
        patternScopes.some(ps => ps.toLowerCase().includes(s.toLowerCase()))
      );
    }).map(p => p.properties || p);

    // Load anti-patterns
    let antiPatterns = [];
    if (includeAntiPatterns) {
      const allAntiPatterns = await blackCodexService.getByType('AntiPattern');
      antiPatterns = allAntiPatterns.filter(ap => {
        if (isWildcard) return true;
        const a = ap.properties || ap;
        let tags = a.tags;
        if (typeof tags === 'string') {
          try { tags = JSON.parse(tags); } catch { tags = []; }
        }
        if (!Array.isArray(tags)) return false;
        return scopes.some(s => tags.some(t => t.toLowerCase().includes(s.toLowerCase())));
      }).map(a => a.properties || a);
    }

    const result = {
      principles,
      rules: relevantRules,
      patterns: relevantPatterns,
      antiPatterns,
      metadata: {
        scopes,
        loadedAt: new Date().toISOString(),
        counts: {
          principles: principles.length,
          rules: relevantRules.length,
          patterns: relevantPatterns.length,
          antiPatterns: antiPatterns.length
        }
      }
    };

    let formatted;
    switch (format) {
      case 'prompt':
        formatted = this._formatForPrompt(result);
        break;
      case 'markdown':
        formatted = this._formatAsMarkdown(result);
        break;
      case 'json':
      default:
        formatted = result;
    }

    this._setCache(cacheKey, formatted);
    return formatted;
  }

  // ============================================================
  // AGENT-SPECIFIC LOADERS
  // ============================================================

  async loadForGxeAssistant() {
    return this.loadForScope(['gxe', 'assistant', 'graph'], {
      includePrinciples: true,
      includeAntiPatterns: true,
      format: 'prompt'
    });
  }

  async loadForExtractionAgent() {
    return this.loadForScope(['extraction', 'sql', 'crud'], {
      includePrinciples: true,
      includeAntiPatterns: true,
      format: 'prompt'
    });
  }

  async loadForFlowDesk() {
    return this.loadForScope(['flowdesk', 'approval', 'routing', 'status', 'migration'], {
      includePrinciples: true,
      includeAntiPatterns: true,
      format: 'prompt'
    });
  }

  async loadForKnowledgeGraph() {
    return this.loadForScope(['crud', 'namespace', 'versioning'], {
      includePrinciples: true,
      includeAntiPatterns: true,
      format: 'prompt'
    });
  }

  async loadFull() {
    return this.loadForScope(['*'], {
      includePrinciples: true,
      includeAntiPatterns: true,
      format: 'json'
    });
  }

  // ============================================================
  // FORMATTING
  // ============================================================

  _formatForPrompt(data) {
    const lines = [];

    lines.push('<codex_rules>');
    lines.push('These are your Codex governance rules loaded from the project knowledge base (Memgraph, namespace CODEX).');
    lines.push(`You have ${data.rules.length} rules, ${data.principles.length} principles loaded for scopes: ${data.metadata?.scopes?.join(', ') || '*'}.`);
    lines.push('You MUST follow these rules when performing operations. You can reference rules by their CODEX-RULE-XXX ID.\n');

    if (data.principles.length > 0) {
      lines.push('## Core Principles');
      for (const p of data.principles) {
        lines.push(`- **${p.title}**: ${p.summary}`);
      }
      lines.push('');
    }

    if (data.rules.length > 0) {
      const mustRules = data.rules.filter(r => r.modality === 'MUST' || r.modality === 'MUST_NOT');
      const shouldRules = data.rules.filter(r => r.modality === 'SHOULD' || r.modality === 'SHOULD_NOT');
      const mayRules = data.rules.filter(r => r.modality === 'MAY');

      if (mustRules.length > 0) {
        lines.push('## Mandatory Rules (MUST)');
        for (const r of mustRules) {
          lines.push(`- [${r.codexId}] ${r.title}: ${r.summary}`);
        }
        lines.push('');
      }

      if (shouldRules.length > 0) {
        lines.push('## Recommended Rules (SHOULD)');
        for (const r of shouldRules) {
          lines.push(`- [${r.codexId}] ${r.title}: ${r.summary}`);
        }
        lines.push('');
      }

      if (mayRules.length > 0) {
        lines.push('## Optional Guidelines (MAY)');
        for (const r of mayRules) {
          lines.push(`- [${r.codexId}] ${r.title}`);
        }
        lines.push('');
      }
    }

    if (data.patterns.length > 0) {
      lines.push('## Recommended Patterns');
      for (const p of data.patterns) {
        lines.push(`- **${p.title}**: ${p.summary}`);
      }
      lines.push('');
    }

    if (data.antiPatterns.length > 0) {
      lines.push('## Known Anti-Patterns (AVOID)');
      for (const ap of data.antiPatterns) {
        lines.push(`- WARNING **${ap.title}**: ${ap.symptom}`);
        lines.push(`  -> Instead: ${(ap.refactoringPlan || '').split('.')[0]}.`);
      }
      lines.push('');
    }

    lines.push('</codex_rules>');

    const prompt = lines.join('\n');
    return {
      prompt,
      tokenEstimate: Math.ceil(prompt.length / 4),
      metadata: data.metadata
    };
  }

  _formatAsMarkdown(data) {
    const lines = [];

    lines.push('# Codex: Governance Rules\n');
    lines.push(`*Generated: ${data.metadata.loadedAt}*\n`);
    lines.push(`*Scopes: ${data.metadata.scopes.join(', ')}*\n`);

    if (data.principles.length > 0) {
      lines.push('## M3: Core Principles\n');
      for (const p of data.principles) {
        lines.push(`### ${p.title}\n`);
        lines.push(`**ID:** ${p.codexId}\n`);
        lines.push(`${p.summary}\n`);
        lines.push(`**Rationale:** ${p.rationale}\n`);
      }
    }

    if (data.rules.length > 0) {
      lines.push('## M2: Rules\n');
      for (const r of data.rules) {
        lines.push(`### ${r.title}\n`);
        lines.push(`**ID:** ${r.codexId} | **Modality:** ${r.modality}\n`);
        lines.push(`${r.summary}\n`);
      }
    }

    if (data.antiPatterns.length > 0) {
      lines.push('## Anti-Patterns (BlackCodex)\n');
      for (const ap of data.antiPatterns) {
        lines.push(`### WARNING ${ap.title}\n`);
        lines.push(`**Symptom:** ${ap.symptom}\n`);
        lines.push(`**Root Cause:** ${ap.rootCause}\n`);
      }
    }

    return { markdown: lines.join('\n'), metadata: data.metadata };
  }

  // ============================================================
  // RULE LOOKUP
  // ============================================================

  async getRule(codexId) {
    getMetrics()?.recordCodexRuleAccess(codexId);
    const rule = await codexService.getByCodexId(codexId);
    if (!rule) return null;
    const r = rule.properties || rule;
    const antiPatterns = await blackCodexService.getAntiPatternFor(codexId);

    return {
      rule: r,
      antiPatterns: antiPatterns.map(a => a.properties || a),
      formattedForPrompt: this._formatSingleRule(r, antiPatterns)
    };
  }

  // ============================================================
  // BOOTSTRAP / MINIMAL LOADING (Lazy Codex approach)
  // ============================================================

  /**
   * Get bootstrap rules — minimal set for system prompt.
   * Only rules with 'bootstrap' in scope.
   * Returns compact array of { id, title, summary, modality, type }.
   */
  async getBootstrapRules() {
    const cacheKey = 'codex:bootstrap';
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    let rules = [];
    try {
      const memgraph = require('../memgraph.service');
      const result = await memgraph.runQuery(`
        MATCH (n)
        WHERE (n:CodexRule OR n:CodexPrinciple)
          AND n.status = 'ACTIVE'
        RETURN n.codexId as id, n.title as title, n.summary as summary,
               n.modality as modality, labels(n)[0] as type, n.scope as scope
        ORDER BY
          CASE WHEN n:CodexPrinciple THEN 0 ELSE 1 END,
          n.codexId
      `);

      // Filter for bootstrap scope (scope is stored as JSON string or array)
      rules = result.filter(r => {
        let scope = r.scope;
        if (typeof scope === 'string') {
          try { scope = JSON.parse(scope); } catch { scope = [scope]; }
        }
        return Array.isArray(scope) && scope.includes('bootstrap');
      }).map(r => ({
        id: r.id, title: r.title, summary: r.summary,
        modality: r.modality || '', type: r.type || 'CodexRule'
      }));
    } catch (e) {
      console.warn('[CodexLoader] Bootstrap rules query failed:', e.message);
    }

    this._setCache(cacheKey, rules);
    return rules;
  }

  /**
   * Get minimal prompt for agents (~100-150 tokens).
   * Contains: bootstrap rules + Knowledge Access Protocol + English-only directive.
   */
  async getMinimalPrompt() {
    const bootstrapRules = await this.getBootstrapRules();

    const rulesText = bootstrapRules.length > 0
      ? bootstrapRules.map(r => {
          const prefix = r.type === 'CodexPrinciple' ? '◆' : '•';
          const mod = r.modality ? ` [${r.modality}]` : '';
          return `${prefix} ${r.id}: ${r.title}${mod}`;
        }).join('\n')
      : '• No bootstrap rules loaded — use codex_search_rules to find applicable rules.';

    const prompt = `## Institutional Knowledge Access

**Core Rules (always apply):**
${rulesText}

**Knowledge Priority Protocol:**
1. FIRST search internal KB (Codex, Knowledge Graph, BackLog) before any action
2. THEN use retrieved context to inform your response
3. ONLY IF NEEDED use external sources

**Search Tools:**
- \`codex_search_rules\` — find rules by keywords (USE FIRST for any task)
- \`codex_get_rule\` — get full rule details by ID
- \`search_knowledge\` — semantic KB search for existing solutions
- \`backlog_list_tasks\` — find related/duplicate tasks
- \`codex_get_blackcodex\` — anti-patterns to AVOID

Before significant actions, search for applicable rules. Cite sources (e.g., "per CODEX-RULE-FD-001").

**LANGUAGE RULE:** All responses, knowledge base entries, task descriptions, and any data written to the knowledge graph MUST be in English, regardless of the input language (CODEX-RULE-BA-001).

**BackLog Execution Protocol (CODEX-RULE-BA-020..024):**
When working on BackLog tasks, follow the execution cycle:
1. \`cycle.start\` → choose AUTONOMOUS (routine) or PLANNING (critical) mode
2. \`cycle.submit_plan\` → create plan BEFORE execution (mandatory in both modes)
3. \`cycle.add_memory\` → record every DECISION with reasoning
4. \`cycle.transition("REVIEW")\` → submit for cross-review (never skip)
5. If rejected → address each recommendation in new iteration

**Task Creation Protocol (CODEX-RULE-BA-002, BA-010):**
Before creating tasks: search backlog for duplicates. Every task needs: complete spec, acceptance criteria (≥2), correct namespace, sources linked.

**GXE Graph Generation Protocol (CODEX-RULE-GXE-031, GXE-032):**
When generating executable graphs:
1. EVERY executor node MUST have tool/executorId — call \`catalog_search_tools\` to verify
2. Dialog nodes (confirm, search, ask, select) MUST have waitForInput: true
3. Condition edges MUST have labels (true/false or named). NEVER use "default" as label
4. Condition expressions MUST use NodeID.field format (N02.confidence), NOT input.field
5. After generation: self-validate all 5 checks before returning
Common tools: flowdesk.classify_intent, flowdesk.check_location, flowdesk.confirm_request, flowdesk.create_service_request, flowdesk.assign_handler, flowdesk.send_notification, workflow.start/end/condition, ai.generate`;

    return {
      prompt,
      tokenEstimate: Math.ceil(prompt.length / 4),
      rulesCount: bootstrapRules.length
    };
  }

  _formatSingleRule(rule, antiPatterns = []) {
    let text = `[${rule.codexId}] ${rule.title}\n`;
    text += `Modality: ${rule.modality}\n`;
    text += `${rule.summary}\n`;
    if (rule.rationale) text += `Rationale: ${rule.rationale}\n`;

    let examples = rule.examples;
    if (typeof examples === 'string') {
      try { examples = JSON.parse(examples); } catch { examples = []; }
    }
    if (examples && examples.length > 0) {
      text += `Examples:\n`;
      examples.forEach(ex => { text += `  - ${ex}\n`; });
    }

    if (antiPatterns.length > 0) {
      text += `\nKnown pitfalls:\n`;
      antiPatterns.forEach(ap => {
        const a = ap.properties || ap;
        text += `  WARNING ${a.title}: ${a.symptom}\n`;
      });
    }

    return text;
  }
}

module.exports = new CodexLoaderService();
