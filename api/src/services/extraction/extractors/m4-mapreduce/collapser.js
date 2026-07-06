'use strict';

/**
 * M4 Collapser — merge chunk results in-memory (no LLM calls).
 *
 * Tasks:
 *   1. Merge entities by normalized name — track type conflicts
 *   2. Deduplicate relations by (src::type::tgt)
 *   3. Identify cross-chunk entity candidates (appear in crossReferences of >1 chunk)
 *   4. Produce token summary and conflict list for the Reducer
 */

/**
 * Normalize entity name for deduplication (lowercase, trim, collapse whitespace).
 */
function _normName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Collapse all chunk results into merged entities, relations, conflicts, and metadata.
 *
 * @param {Array} chunkResults   — output from mapAllChunks
 * @returns {CollapseResult}
 */
function collapse(chunkResults) {
  const entityMap   = new Map();   // normName → {canonical, type, confidence, chunks, typeVotes}
  const relationSet = new Set();   // dedup key
  const relations   = [];
  const crossRefCounts = new Map();

  // ── Pass 1: collect entities ────────────────────────────────────────────────
  for (const chunk of chunkResults) {
    for (const e of chunk.entities || []) {
      const norm  = _normName(e.name);
      if (!norm) continue;
      if (!entityMap.has(norm)) {
        entityMap.set(norm, {
          canonical:  e.name.trim(),
          type:       e.type,
          confidence: e.confidence || 0.5,
          chunks:     [chunk.chunkIndex],
          typeVotes:  { [e.type]: 1 },
          evidence:   e.evidence || null,
          epistemicLayer: e.epistemicLayer || null,
        });
      } else {
        const entry = entityMap.get(norm);
        // Higher confidence → update canonical name
        if ((e.confidence || 0) > entry.confidence) {
          entry.confidence = e.confidence;
          entry.canonical  = e.name.trim();
          if (!entry.evidence) entry.evidence = e.evidence || null;
        }
        if (!entry.chunks.includes(chunk.chunkIndex)) entry.chunks.push(chunk.chunkIndex);
        entry.typeVotes[e.type] = (entry.typeVotes[e.type] || 0) + 1;
        // Boost confidence for entities appearing in multiple chunks
        entry.confidence = Math.min(1, entry.confidence + 0.03);
      }
    }

    // ── Cross-reference counting ──────────────────────────────────────────────
    for (const ref of chunk.crossReferences || []) {
      const norm = _normName(ref);
      crossRefCounts.set(norm, (crossRefCounts.get(norm) || 0) + 1);
    }
  }

  // Resolve dominant type per entity (most votes wins)
  for (const [, entry] of entityMap) {
    const votes = entry.typeVotes;
    const dominant = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    // Track as conflict if top two types are tied
    const sortedVotes = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    entry.hasConflict = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1];
    entry.type = dominant;
  }

  // ── Pass 2: collect relations ─────────────────────────────────────────────
  for (const chunk of chunkResults) {
    for (const r of chunk.relations || []) {
      if (!r.sourceEntity || !r.targetEntity) continue;
      const srcNorm = _normName(r.sourceEntity);
      const tgtNorm = _normName(r.targetEntity);
      // Only keep relations where both entities are known
      if (!entityMap.has(srcNorm) || !entityMap.has(tgtNorm)) continue;
      const key = `${srcNorm}::${r.type}::${tgtNorm}`;
      if (relationSet.has(key)) continue;
      relationSet.add(key);
      relations.push({
        sourceEntity: entityMap.get(srcNorm).canonical,
        targetEntity: entityMap.get(tgtNorm).canonical,
        type:         r.type,
        confidence:   r.confidence || 0.5,
        evidence:     r.evidence || null,
        chunks:       [chunk.chunkIndex],
      });
    }
  }

  // ── Build conflict list for Reducer ──────────────────────────────────────
  const conflicts = [];
  for (const [norm, entry] of entityMap) {
    if (entry.hasConflict) {
      conflicts.push({
        name:      entry.canonical,
        typeVotes: entry.typeVotes,
        chunks:    entry.chunks,
      });
    }
  }

  // Cross-chunk candidates: mentioned in crossRefs of ≥2 different chunks
  const crossChunkCandidates = [];
  for (const [norm, count] of crossRefCounts) {
    if (count >= 2 && entityMap.has(norm)) {
      crossChunkCandidates.push(entityMap.get(norm).canonical);
    }
  }

  const entities = Array.from(entityMap.values());

  return {
    entities,
    relations,
    conflicts,
    crossChunkCandidates,
    totalChunks: chunkResults.length,
    chunkSummaries: chunkResults.map(c => c.chunkSummary || '').filter(Boolean),
    tokenTotals: {
      inputTokens:  chunkResults.reduce((s, c) => s + (c.inputTokens  || 0), 0),
      outputTokens: chunkResults.reduce((s, c) => s + (c.outputTokens || 0), 0),
    },
  };
}

module.exports = { collapse };
