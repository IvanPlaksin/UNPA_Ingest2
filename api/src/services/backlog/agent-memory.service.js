/**
 * AgentMemory Service — manages agent memory entries within execution cycles.
 *
 * Each entry records a decision, finding, step, or error with reasoning.
 * This serves as the "chat memory" of the executing agent.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

class AgentMemoryService {

  /**
   * Add a memory entry to a cycle
   */
  async addEntry(cycleId, { entryType, content, reasoning, metadata } = {}) {
    if (!['DECISION', 'FINDING', 'STEP', 'ERROR', 'NOTE'].includes(entryType)) {
      throw new Error(`Invalid entryType: ${entryType}`);
    }
    if (!content || content.length < 5) {
      throw new Error('Content must be at least 5 characters');
    }

    // Get next sequence number
    const seqResult = await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_MEMORY]->(m:AgentMemoryEntry)
      RETURN count(m) as cnt
    `, { cycleId });
    const sequence = (seqResult[0]?.cnt || 0) + 1;

    const id = uuidv4();
    const entry = {
      id,
      cycleId,
      sequence,
      entryType,
      content,
      reasoning: reasoning || '',
      metadata: metadata ? JSON.stringify(metadata) : '',
      timestamp: new Date().toISOString()
    };

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})
      CREATE (m:AgentMemoryEntry $props)
      CREATE (c)-[:HAS_MEMORY]->(m)
      RETURN m
    `, { cycleId, props: entry });

    return entry;
  }

  /**
   * Get all memory entries for a cycle
   */
  async getEntries(cycleId) {
    const result = await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_MEMORY]->(m:AgentMemoryEntry)
      RETURN m
      ORDER BY m.sequence
    `, { cycleId });

    return result.map(r => {
      const props = r.m?.properties || r.m;
      if (typeof props.metadata === 'string' && props.metadata) {
        try { props.metadata = JSON.parse(props.metadata); } catch { /* keep */ }
      }
      return props;
    });
  }

  /**
   * Get all memory across all cycles for a task (full history)
   */
  async getFullHistory(backlogId) {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_CYCLE]->(c:ExecutionCycle)-[:HAS_MEMORY]->(m:AgentMemoryEntry)
      RETURN c.iteration as iteration, c.mode as mode, m
      ORDER BY c.iteration, m.sequence
    `, { backlogId });

    const history = {};
    for (const row of result) {
      const iter = row.iteration;
      if (!history[iter]) history[iter] = { iteration: iter, mode: row.mode, entries: [] };
      const props = row.m?.properties || row.m;
      if (typeof props.metadata === 'string' && props.metadata) {
        try { props.metadata = JSON.parse(props.metadata); } catch { /* keep */ }
      }
      history[iter].entries.push(props);
    }

    return Object.values(history);
  }
}

module.exports = new AgentMemoryService();
