/**
 * ContextAssembler — turns a fused candidate pool into the finished ContextBundle.
 *
 * Three jobs:
 *   1. Normalize fused scores into the [0..1] that ContextElement guarantees.
 *      A raw RRF sum is roughly 1/(k+1) per contributing strategy — a number
 *      around 0.016 that means nothing to a caller reading `score`.
 *   2. Greedy-fill the prompt under both limits (maxElements AND tokenBudget).
 *   3. Serialize, keeping contradictions in a trailing block of their own.
 *
 * Two deliberate rules:
 *
 * - Elements are never cut in half. Half a business rule is not context, it is
 *   a misleading fragment. An element that does not fit is skipped whole and
 *   the next (smaller) one is tried, so the budget is used rather than abandoned.
 *
 * - Contradictions go last. The model should read what the sources say before
 *   it reads where they disagree; leading with a conflict distorts the answer
 *   even when the conflict is minor.
 *
 * @module services/radix/assembly/context-assembler
 */

'use strict';

const { createContextElement } = require('../contracts/context-bundle');
const { CONFLICT_EDGE_TYPE } = require('../contracts/strategy.interface');
const { minMaxNormalize } = require('../fusion/score-normalizer');
const { createSerializer } = require('./serializers');
const { estimateTokens } = require('./token-counter');
const logger = require('../../../utils/logger');

class ContextAssembler {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || logger.child('Radix');
  }

  /**
   * Fills `elements`, `sections`, `assembledContext`, `stats` and `truncated`.
   * Mutates and returns the bundle the orchestrator passed in.
   *
   * With connectors, the pool is PARTITIONED into their categories: each
   * connector takes the candidates matching its filters, within its own element
   * and token budget, and whatever no connector claimed falls into a default
   * section. Partitioning rather than re-querying keeps this to one retrieval —
   * a query per connector would multiply the latency budget by the number of
   * categories.
   *
   * @param {import('../contracts/context-bundle').ContextBundle} bundle
   * @param {import('../fusion/fusion-policy.interface').FusedCandidate[]} candidates
   * @param {Object[]} [connectors] - Resolved connectors; empty = single default section
   * @returns {import('../contracts/context-bundle').ContextBundle}
   */
  assemble(bundle, candidates, connectors = []) {
    if (Array.isArray(connectors) && connectors.length > 0) {
      return this._assembleSectioned(bundle, candidates, connectors);
    }
    return this._assembleDefault(bundle, candidates);
  }

  /**
   * @param {import('../contracts/context-bundle').ContextBundle} bundle
   * @param {Object[]} candidates
   * @returns {import('../contracts/context-bundle').ContextBundle}
   * @private
   */
  _assembleDefault(bundle, candidates) {
    const startTime = Date.now();
    const config = bundle.config;
    const serializer = createSerializer(config.assemblyFormat);

    const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    bundle.stats.afterFusion = pool.length;

    if (pool.length === 0) {
      bundle.elements = [];
      bundle.assembledContext = '';
      bundle.stats.afterTruncation = 0;
      bundle.stats.totalTokens = 0;
      bundle.truncated = false;
      bundle.timing.assemblyMs = Date.now() - startTime;
      return bundle;
    }

    // Normalize across the WHOLE pool, not the surviving slice — otherwise the
    // top element would always score 1.0 regardless of how good it actually was
    // relative to everything found.
    const normalized = minMaxNormalize(pool.map((c) => c.score));
    const scored = pool.map((candidate, i) => ({ candidate, score: normalized[i] }));

    const isConflict = ({ candidate }) =>
      (candidate.metadata || {}).terminalEdgeType === CONFLICT_EDGE_TYPE;

    const mainPool = scored.filter((s) => !isConflict(s));
    const conflictPool = scored.filter(isConflict);

    const budget = config.tokenBudget;
    let used = estimateTokens(serializer.CONTEXT_HEADER);
    // Reserve the conflict header up front, so the budget cannot be spent down
    // to the point where a detected contradiction has no room to be reported.
    const conflictHeaderCost = conflictPool.length > 0
      ? estimateTokens(serializer.CONFLICT_HEADER)
      : 0;

    const accepted = [];
    const mainBlocks = [];
    const conflictBlocks = [];
    let truncated = false;

    for (const { candidate, score } of mainPool) {
      if (accepted.length >= config.maxElements) {
        truncated = true;
        break;
      }
      const text = serializer.serializeElement(candidate, score);
      const cost = estimateTokens(text) + 1; // +1 for the separating blank line

      if (used + cost + conflictHeaderCost > budget) {
        // Skip whole, keep going: a later element may still fit.
        truncated = true;
        continue;
      }

      used += cost;
      accepted.push({ candidate, score });
      mainBlocks.push(text);
    }

    if (conflictPool.length > 0) {
      used += conflictHeaderCost;
      for (const { candidate, score } of conflictPool) {
        if (accepted.length >= config.maxElements) {
          truncated = true;
          break;
        }
        const text = serializer.serializeConflict(candidate, score);
        const cost = estimateTokens(text) + 1;

        if (used + cost > budget) {
          truncated = true;
          continue;
        }

        used += cost;
        accepted.push({ candidate, score });
        conflictBlocks.push(text);
      }
    }

    bundle.elements = accepted.map(({ candidate, score }) =>
      createContextElement({
        id: candidate.id,
        type: candidate.type,
        content: candidate.content,
        contentRaw: candidate.contentRaw,
        score,
        strategies: candidate.strategies || [],
        provenance: candidate.provenance,
        metadata: candidate.metadata || {}
      })
    );

    bundle.assembledContext = this._joinSections(serializer, mainBlocks, conflictBlocks);
    bundle.truncated = truncated;
    bundle.stats.afterTruncation = bundle.elements.length;
    bundle.stats.totalTokens = estimateTokens(bundle.assembledContext);
    bundle.timing.assemblyMs = Date.now() - startTime;

    // One implicit section, so a consumer can read `sections` uniformly whether
    // or not the workspace declares connectors.
    bundle.sections = bundle.elements.length ? [{
      category: 'knowledge',
      connectorId: null,
      connectorName: null,
      elements: bundle.elements,
      tokenCount: bundle.stats.totalTokens,
      preamble: '',
      priority: 0
    }] : [];

    if (truncated) {
      this.logger.debug('[Radix:assembler] context truncated', {
        pool: pool.length,
        kept: bundle.elements.length,
        tokens: bundle.stats.totalTokens,
        budget
      });
    }

    return bundle;
  }

  /**
   * Partitions the pool across connectors, one section each.
   *
   * @param {import('../contracts/context-bundle').ContextBundle} bundle
   * @param {Object[]} candidates
   * @param {Object[]} connectors
   * @returns {import('../contracts/context-bundle').ContextBundle}
   * @private
   */
  _assembleSectioned(bundle, candidates, connectors) {
    const startTime = Date.now();
    const config = bundle.config;
    const serializer = createSerializer(config.assemblyFormat);

    const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    bundle.stats.afterFusion = pool.length;

    // Normalize across the WHOLE pool before partitioning, so a score means the
    // same thing in every section.
    const normalized = pool.length ? minMaxNormalize(pool.map((c) => c.score)) : [];
    const scored = pool.map((candidate, i) => ({ candidate, score: normalized[i] }));

    const claimed = new Set();
    const sections = [];
    let truncated = false;

    const ordered = [...connectors].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name))
    );

    for (const connector of ordered) {
      const matching = scored.filter(
        ({ candidate }) => !claimed.has(candidate.id) && this._matchesConnector(candidate, connector)
      );

      const section = this._buildSection(serializer, connector, matching);
      if (section.taken < matching.length) truncated = true;

      section.elements.forEach((el) => claimed.add(el.id));
      // A connector that matched nothing is dropped rather than emitting an
      // empty heading — a category with no facts under it reads to the model as
      // "this workspace has nothing of that kind", which is a claim we cannot make.
      if (section.elements.length > 0) sections.push(section);
    }

    // Anything no connector claimed still belongs in the answer; silently
    // discarding it would mean declaring one connector narrows the whole
    // retrieval, which is not what declaring a category means.
    const leftover = scored.filter(({ candidate }) => !claimed.has(candidate.id));
    if (leftover.length > 0) {
      const fallback = this._buildSection(serializer, {
        id: null,
        name: null,
        category: 'knowledge',
        priority: -1,
        maxElements: config.maxElements,
        tokenBudget: config.tokenBudget,
        resolvedPreamble: ''
      }, leftover);

      if (fallback.taken < leftover.length) truncated = true;
      if (fallback.elements.length > 0) sections.push(fallback);
    }

    bundle.sections = sections;
    bundle.elements = sections.flatMap((s) => s.elements);
    bundle.assembledContext = this._serializeSections(sections);
    bundle.truncated = truncated;
    bundle.stats.afterTruncation = bundle.elements.length;
    bundle.stats.totalTokens = estimateTokens(bundle.assembledContext);
    bundle.timing.assemblyMs = Date.now() - startTime;

    return bundle;
  }

  /**
   * Does this candidate belong to this connector's category?
   *
   * Filters are AND-ed, and an empty filter matches everything — a connector
   * that restricts nothing claims everything not already taken.
   *
   * @param {Object} candidate
   * @param {Object} connector
   * @returns {boolean}
   * @private
   */
  _matchesConnector(candidate, connector) {
    const meta = candidate.metadata || {};

    if (Array.isArray(connector.draftTypes) && connector.draftTypes.length > 0) {
      if (!connector.draftTypes.includes(meta.draftType)) return false;
    }

    if (Array.isArray(connector.knowledgeFamilies) && connector.knowledgeFamilies.length > 0) {
      if (!connector.knowledgeFamilies.includes(meta.knowledgeFamily)) return false;
    }

    return true;
  }

  /**
   * Fills one section under the connector's own element and token budgets.
   *
   * @param {Object} serializer
   * @param {Object} connector
   * @param {{candidate: Object, score: number}[]} matching
   * @returns {Object & {taken: number}}
   * @private
   */
  _buildSection(serializer, connector, matching) {
    const preamble = connector.resolvedPreamble || '';
    const maxElements = connector.maxElements || 10;
    const budget = connector.tokenBudget || 1500;

    let used = estimateTokens(preamble);
    const elements = [];
    const blocks = [];

    for (const { candidate, score } of matching) {
      if (elements.length >= maxElements) break;

      const text = serializer.serializeElement(candidate, score);
      const cost = estimateTokens(text) + 1;
      // Skip whole, keep going: a later, smaller element may still fit.
      if (used + cost > budget) continue;

      used += cost;
      blocks.push(text);
      elements.push(createContextElement({
        id: candidate.id,
        type: candidate.type,
        content: candidate.content,
        contentRaw: candidate.contentRaw,
        score,
        strategies: candidate.strategies || [],
        provenance: candidate.provenance,
        metadata: candidate.metadata || {}
      }));
    }

    return {
      category: connector.category,
      connectorId: connector.id || null,
      connectorName: connector.name || null,
      elements,
      tokenCount: used,
      preamble,
      priority: connector.priority || 0,
      blocks,
      taken: elements.length
    };
  }

  /**
   * @param {Object[]} sections
   * @returns {string}
   * @private
   */
  _serializeSections(sections) {
    return sections
      .map((section) => {
        const heading = `## ${section.connectorName || section.category}`;
        return [heading, section.preamble, section.blocks.join('\n\n')]
          .filter(Boolean)
          .join('\n\n');
      })
      .join('\n\n---\n\n');
  }

  /**
   * @param {import('./serializers').Serializer} serializer
   * @param {string[]} mainBlocks
   * @param {string[]} conflictBlocks
   * @returns {string}
   * @private
   */
  _joinSections(serializer, mainBlocks, conflictBlocks) {
    if (mainBlocks.length === 0 && conflictBlocks.length === 0) return '';

    const sections = [];
    if (mainBlocks.length > 0) {
      sections.push(serializer.CONTEXT_HEADER + '\n' + mainBlocks.join('\n\n'));
    }
    if (conflictBlocks.length > 0) {
      sections.push(serializer.CONFLICT_HEADER + '\n' + conflictBlocks.join('\n\n'));
    }
    return sections.join('\n');
  }
}

module.exports = { ContextAssembler };
