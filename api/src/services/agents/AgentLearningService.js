/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AgentLearningService
 *
 * Persists lessons learned from AI assistant errors into Memgraph.
 * Loads them at session start so the assistant avoids repeating mistakes.
 *
 * Schema:
 *   (:AgentProfile)-[:HAS_LESSON]->(:LessonLearned)
 *
 * LessonLearned properties:
 *   id, errorType, description, resolution, rule, graphContext,
 *   sessionId, createdAt
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const memgraphService = require('../memgraph.service');

const AGENT_ID = 'agent-gxe-assistant-v1';
const MAX_LESSONS_IN_CONTEXT = 20;

class AgentLearningService {
  /**
   * Save a lesson learned from an error.
   * @param {Object} lesson
   * @param {string} lesson.errorType - Category: MISSING_EDGE, WRONG_TYPE, etc.
   * @param {string} lesson.description - What went wrong
   * @param {string} lesson.resolution - How it was fixed
   * @param {string} lesson.rule - Rule to remember for the future
   * @param {string} [lesson.sessionId] - Session where the error occurred
   * @param {string} [lesson.graphId] - Catalog graph ID (if applicable)
   * @returns {Promise<string>} Lesson ID
   */
  async saveLesson(lesson) {
    const id = `lesson-${Date.now()}-${uuidv4().slice(0, 8)}`;

    const cypher = `
      MATCH (a:AgentProfile {id: $agentId})
      CREATE (l:LessonLearned {
        id: $id,
        errorType: $errorType,
        description: $description,
        resolution: $resolution,
        rule: $rule,
        sessionId: $sessionId,
        graphId: $graphId,
        createdAt: datetime(),
        active: true
      })
      CREATE (a)-[:HAS_LESSON]->(l)
      RETURN l.id AS id
    `;

    try {
      const rows = await memgraphService.runQuery(cypher, {
        agentId: AGENT_ID,
        id,
        errorType: lesson.errorType || 'UNKNOWN',
        description: lesson.description || '',
        resolution: lesson.resolution || '',
        rule: lesson.rule || '',
        sessionId: lesson.sessionId || '',
        graphId: lesson.graphId || '',
      });

      console.log(`[AgentLearning] Saved lesson "${id}" (${lesson.errorType})`);
      return rows[0]?.id || id;
    } catch (err) {
      console.error(`[AgentLearning] Failed to save lesson: ${err.message}`);
      return null;
    }
  }

  /**
   * Load recent lessons for system context injection.
   * @param {number} [limit] - Max lessons to load
   * @returns {Promise<Array>} Lessons sorted by createdAt desc
   */
  async loadLessons(limit = MAX_LESSONS_IN_CONTEXT) {
    const safeLimit = Math.max(1, Math.floor(Number(limit) || MAX_LESSONS_IN_CONTEXT));
    const cypher = `
      MATCH (a:AgentProfile {id: $agentId})-[:HAS_LESSON]->(l:LessonLearned {active: true})
      RETURN l.id AS id, l.errorType AS errorType,
             l.description AS description, l.resolution AS resolution,
             l.rule AS rule, l.createdAt AS createdAt
      ORDER BY l.createdAt DESC
      LIMIT ${safeLimit}
    `;

    try {
      const rows = await memgraphService.runQuery(cypher, {
        agentId: AGENT_ID,
      });
      return rows;
    } catch (err) {
      console.warn(`[AgentLearning] Failed to load lessons: ${err.message}`);
      return [];
    }
  }

  /**
   * Format lessons as a text block for system context injection.
   * @returns {Promise<string>} Formatted lessons text (or empty string)
   */
  async formatLessonsForContext() {
    const lessons = await this.loadLessons();
    if (lessons.length === 0) return '';

    const lines = lessons.map((l, i) =>
      `${i + 1}. [${l.errorType}] ${l.description} → FIX: ${l.resolution} → RULE: ${l.rule}`
    );

    return `\n## Past Lessons Learned (${lessons.length} entries — DO NOT repeat these mistakes)\n\n` +
      lines.join('\n');
  }

  /**
   * Get lesson count for monitoring.
   * @returns {Promise<number>}
   */
  async getLessonCount() {
    try {
      const rows = await memgraphService.runQuery(`
        MATCH (a:AgentProfile {id: $agentId})-[:HAS_LESSON]->(l:LessonLearned {active: true})
        RETURN count(l) AS cnt
      `, { agentId: AGENT_ID });
      return rows[0]?.cnt || 0;
    } catch {
      return 0;
    }
  }
}

const agentLearningService = new AgentLearningService();

module.exports = { AgentLearningService, agentLearningService };
