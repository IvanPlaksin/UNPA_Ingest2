'use strict';

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

/**
 * dialogue.tag — MCP Tool
 *
 * Tag or bookmark a dialogue session. Tags are stored in Memgraph.
 * Special tag "bookmark" marks a session as bookmarked.
 *
 * Usage:
 *   dialogue_tag_session({ sessionId: "UUID", tags: ["architecture", "phase1"] })
 *   dialogue_tag_session({ sessionId: "UUID", bookmarked: true })
 *   dialogue_tag_session({ sessionId: "UUID", tags: ["remove-me"], remove: true })
 */
const dialogueTagExecutor = createSimpleExecutor({
  type: 'dialogue.tag',
  displayName: 'Tag / Bookmark Session',
  description: 'Add, remove, or query tags on a dialogue session. Use bookmarked:true to bookmark. Tags are searchable and filterable in the DevDialogue UI.',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session UUID to tag',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to add (or remove if remove:true)',
      },
      bookmarked: {
        type: 'boolean',
        description: 'Set bookmark status (true = add bookmark tag)',
      },
      remove: {
        type: 'boolean',
        description: 'If true, remove the specified tags instead of adding them',
      },
    },
  },

  async execute(params, _context) {
    const { sessionId, tags = [], bookmarked, remove = false } = params;

    if (!sessionId) {
      return createErrorResult('MISSING_PARAMS', 'sessionId is required');
    }

    const allTags = [...tags];
    if (bookmarked === true) allTags.push('bookmark');
    if (bookmarked === false) {
      // Explicit un-bookmark
      allTags.push('bookmark');
      // Will be treated as removal below
    }

    if (allTags.length === 0) {
      return createErrorResult('MISSING_PARAMS', 'Provide at least one tag or bookmarked flag');
    }

    const mg = require('../../../../../services/memgraph.service');

    // Verify session exists
    const sessionRows = await mg.runQuery(
      'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.aiTitle AS title LIMIT 1',
      { sid: sessionId }
    );
    if (sessionRows.length === 0) {
      return createErrorResult('NOT_FOUND', `Session not found: ${sessionId}`);
    }
    const sessionTitle = sessionRows[0].title;

    const normalizedTags = allTags.map(t => t.toLowerCase().trim().replace(/\s+/g, '-'));

    if (remove || bookmarked === false) {
      // Remove tags
      await mg.runQuery(
        `MATCH (s:DialogueSession {sessionId: $sid})-[r:TAGGED_AS]->(t:DialogueTag)
         WHERE t.name IN $tags
         DELETE r`,
        { sid: sessionId, tags: normalizedTags }
      );
    } else {
      // Add tags — MERGE to avoid duplicates
      for (const tag of normalizedTags) {
        await mg.runQuery(
          `MATCH (s:DialogueSession {sessionId: $sid})
           MERGE (t:DialogueTag {name: $tag})
           MERGE (s)-[:TAGGED_AS]->(t)`,
          { sid: sessionId, tag }
        );
      }
    }

    // Return current tags on the session
    const currentRows = await mg.runQuery(
      `MATCH (s:DialogueSession {sessionId: $sid})-[:TAGGED_AS]->(t:DialogueTag)
       RETURN collect(t.name) AS tags`,
      { sid: sessionId }
    );
    const currentTags = currentRows[0]?.tags || [];

    return createSuccessResult({
      sessionId,
      sessionTitle,
      action: remove || bookmarked === false ? 'removed' : 'added',
      changedTags: normalizedTags,
      currentTags,
      bookmarked: currentTags.includes('bookmark'),
      message: `${remove ? 'Removed' : 'Added'} tags [${normalizedTags.join(', ')}] on "${sessionTitle}"`,
    });
  },
});

module.exports = { dialogueTagExecutor };
