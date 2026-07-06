'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * InvestigationChatMessageService
 *
 * Persists AI-chat history for investigation sessions in Memgraph.
 * Each user message and each assistant response are stored as
 * InvestigationChatMessage nodes linked to the session.
 */
class InvestigationChatMessageService {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  /**
   * Save one message.
   * @param {string} sessionId
   * @param {object} opts
   * @param {'user'|'assistant'|'error'} opts.role
   * @param {string}  opts.text         - Display text
   * @param {string}  [opts.type]           - message type: 'ARTIFACT_PROPOSED'|'CLARIFICATION'|'FREEFORM'
   * @param {string}  [opts.primitiveType]  - e.g. 'CONNECT' (assistant only)
   * @param {string}  [opts.artifactId]     - linked artifact (assistant only)
   * @param {object}  [opts.params]         - resolved primitive params (assistant only)
   */
  async save(sessionId, { role, text, type = null, primitiveType = null, artifactId = null, params = null }) {
    const messageId = uuidv4();
    const createdAt = new Date().toISOString();
    const paramsJson = params ? JSON.stringify(params) : null;

    await this._mg.queryWithNamespace(
      `CREATE (m:InvestigationChatMessage {
         messageId:     $messageId,
         sessionId:     $sessionId,
         role:          $role,
         text:          $text,
         type:          $type,
         primitiveType: $primitiveType,
         artifactId:    $artifactId,
         paramsJson:    $paramsJson,
         createdAt:     $createdAt
       })`,
      { messageId, sessionId, role, text, type, primitiveType, artifactId, paramsJson, createdAt }
    );

    return { messageId, sessionId, role, text, type, primitiveType, artifactId, params, createdAt };
  }

  /**
   * Return all messages for a session ordered by createdAt asc.
   */
  async list(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (m:InvestigationChatMessage { sessionId: $sessionId })
       RETURN m ORDER BY m.createdAt ASC`,
      { sessionId }
    );
    return (rows || []).map(r => this._map(r.m));
  }

  _map(node) {
    const p = node.properties || node;
    let params = null;
    try { if (p.paramsJson) params = JSON.parse(p.paramsJson); } catch {}
    return {
      messageId:     p.messageId,
      sessionId:     p.sessionId,
      role:          p.role,
      text:          p.text || '',
      type:          p.type || null,
      primitiveType: p.primitiveType || null,
      artifactId:    p.artifactId || null,
      params,
      createdAt:     p.createdAt,
    };
  }
}

let _instance = null;
function getInvestigationChatMessageService() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new InvestigationChatMessageService(mg);
  }
  return _instance;
}

module.exports = { InvestigationChatMessageService, getInvestigationChatMessageService };
