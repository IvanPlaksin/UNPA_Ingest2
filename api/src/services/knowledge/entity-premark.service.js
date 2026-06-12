'use strict';
/**
 * EntityPremarkService
 *
 * Phase-0 of the extraction pipeline: heuristic entity pre-marking.
 *
 * Queries Memgraph for all known entities (EntityMention across docs +
 * KnowledgeNode / CoreComponent), then scans document text and replaces
 * found mentions with [[ENT:id:TYPE:name]] markers.
 *
 * This reduces Claude Code's work (it doesn't rediscover known entities)
 * and preserves continuity with the existing knowledge graph.
 */

const LOG_PREFIX = '[EntityPremark]';

const MIN_NAME_LEN  = 3;     // ignore very short names (avoid "UN", "IT" noise)
const MAX_ENTITIES  = 500;   // top N by frequency / importance
const TIMEOUT_MS    = 8000;  // give up loading entities if Memgraph is slow

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

// ─── Service ──────────────────────────────────────────────────────────────────

class EntityPremarkService {

  /**
   * Load known entities from Memgraph.
   * Returns [{id, name, type, source:'mention'|'knowledge'}]
   * sorted by name length DESC (longest-match priority).
   */
  async loadKnownEntities() {
    const rows = [];

    // 1. Distinct EntityMention names across all documents
    try {
      const mentions = await Promise.race([
        mg().runQuery(
          `MATCH (em:EntityMention)
           WHERE em.name IS NOT NULL AND length(em.name) >= $min
           WITH em.name as name, em.type as type, em.id as id, count(*) as freq
           RETURN id, name, type
           ORDER BY freq DESC
           LIMIT $lim`,
          { min: MIN_NAME_LEN, lim: require('neo4j-driver').int(MAX_ENTITIES) }
        ),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
      ]);
      for (const r of mentions) {
        rows.push({ id: r.id, name: r.name, type: r.type || 'ENTITY', source: 'mention' });
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'EntityMention query error:', e.message);
    }

    // 2. KnowledgeNode / CoreComponent canonical nodes
    try {
      const nodes = await Promise.race([
        mg().runQuery(
          `MATCH (n)
           WHERE (n:KnowledgeNode OR n:CoreComponent)
             AND n.name IS NOT NULL AND length(n.name) >= $min
           RETURN n.id as id, n.name as name,
                  coalesce(n.type, n.nodeType, labels(n)[0]) as type
           LIMIT $lim`,
          { min: MIN_NAME_LEN, lim: require('neo4j-driver').int(500) }
        ),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
      ]);
      for (const r of nodes) {
        rows.push({ id: r.id, name: r.name, type: r.type || 'KNOWLEDGE', source: 'knowledge' });
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'KnowledgeNode query error:', e.message);
    }

    // De-duplicate by name (case-insensitive); prefer knowledge nodes over mentions
    const seen = new Map();
    for (const e of rows) {
      const key = e.name.toLowerCase();
      if (!seen.has(key) || e.source === 'knowledge') seen.set(key, e);
    }

    // Sort longest-first to prefer "Security Council" over "Council"
    return Array.from(seen.values()).sort((a, b) => b.name.length - a.name.length);
  }

  /**
   * Build case-insensitive whole-word regex for an entity name.
   * Returns null if the name is too risky (pure numbers, single chars, etc.).
   */
  _buildPattern(name) {
    if (!name || name.length < MIN_NAME_LEN) return null;
    // Skip pure-numeric names (IDs, years)
    if (/^\d+$/.test(name)) return null;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startBound = /^\w/.test(name) ? '\\b' : '(?<![\\[\\w])';
    const endBound   = /\w$/.test(name) ? '\\b' : '(?![\\]\\w])';
    try {
      return new RegExp(`${startBound}${escaped}${endBound}`, 'gi');
    } catch {
      return null;
    }
  }

  /**
   * Pre-mark entity mentions in text.
   * Collects all match positions from the original text (no nested markers),
   * then applies replacements in one pass.
   *
   * Returns { markedText, foundEntities: [{id, name, type, count, source}] }
   */
  premark(text, entities) {
    if (!text || !entities?.length) return { markedText: text, foundEntities: [] };

    // Collect all non-overlapping match positions from original text
    const allMatches = [];

    for (const entity of entities) {
      const pattern = this._buildPattern(entity.name);
      if (!pattern) continue;

      let m;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(text)) !== null) {
        const start = m.index;
        const end   = m.index + m[0].length;

        // Skip if overlaps with an already-accepted longer match
        const overlaps = allMatches.some(
          ex => !(end <= ex.start || start >= ex.end)
        );
        if (!overlaps) {
          allMatches.push({ start, end, entity });
        }
      }
    }

    // Sort by text position
    allMatches.sort((a, b) => a.start - b.start);

    // Build result with replacements
    const foundMap = new Map();
    let result = '';
    let pos = 0;

    for (const { start, end, entity } of allMatches) {
      result += text.slice(pos, start);
      result += `[[ENT:${entity.id}:${entity.type}:${entity.name}]]`;
      pos = end;

      if (!foundMap.has(entity.id)) {
        foundMap.set(entity.id, { id: entity.id, name: entity.name, type: entity.type, count: 0, source: entity.source });
      }
      foundMap.get(entity.id).count++;
    }
    result += text.slice(pos);

    return {
      markedText: result,
      foundEntities: Array.from(foundMap.values()).sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Full pipeline: load entities from Memgraph → premark text.
   * Returns { markedText, foundEntities, entityCount }
   * Never throws — on error returns original text with empty foundEntities.
   */
  async premarkText(text) {
    try {
      const entities = await this.loadKnownEntities();
      console.log(LOG_PREFIX, `Loaded ${entities.length} known entities for pre-marking`);
      const result = this.premark(text, entities);
      const totalMentions = result.foundEntities.reduce((s, e) => s + e.count, 0);
      console.log(LOG_PREFIX, `Pre-marked ${result.foundEntities.length} entities (${totalMentions} mentions)`);
      return { ...result, entityCount: entities.length };
    } catch (e) {
      console.warn(LOG_PREFIX, 'premarkText error:', e.message);
      return { markedText: text, foundEntities: [], entityCount: 0 };
    }
  }
}

const entityPremarkService = new EntityPremarkService();
module.exports = { entityPremarkService, EntityPremarkService };
