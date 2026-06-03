'use strict';

/**
 * DialogueLinkEnricher
 * Scans text for session/decision UUIDs and replaces them with clickable markdown links.
 * Used when sending messages to Claude.ai chats via MCP send_message_to_chat.
 *
 * Example input:  "See session 71d7ec58-f04f-4f9b-a317-e9be8e2b183e for context"
 * Example output: "See session [DevDialogue Collector](http://localhost:3000/dialogue/session/71d7ec58-...) for context"
 */

const UUID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;

class DialogueLinkEnricher {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiBase = options.apiBase || 'http://localhost:4000';
    // Cache: UUID → { title, type } to avoid repeated DB lookups in the same process
    this._cache = new Map();
  }

  /**
   * Enrich text — replace bare UUIDs that correspond to dialogue sessions or decisions
   * with markdown links.
   * @param {string} text
   * @returns {Promise<string>} enriched text
   */
  async enrich(text) {
    if (!text || typeof text !== 'string') return text;

    const uuids = [...new Set(
      [...text.matchAll(UUID_RE)].map(m => m[1].toLowerCase())
    )];

    if (uuids.length === 0) return text;

    // Resolve each UUID
    const resolved = await Promise.all(uuids.map(id => this._resolve(id)));
    const map = new Map();
    uuids.forEach((id, i) => { if (resolved[i]) map.set(id, resolved[i]); });

    if (map.size === 0) return text;

    // Replace in text
    return text.replace(UUID_RE, (match) => {
      const info = map.get(match.toLowerCase());
      if (!info) return match;
      return `[${info.title}](${info.url})`;
    });
  }

  async _resolve(uuid) {
    if (this._cache.has(uuid)) return this._cache.get(uuid);

    const result = await this._lookupSession(uuid) || await this._lookupDecision(uuid);
    if (result) this._cache.set(uuid, result);
    return result;
  }

  async _lookupSession(uuid) {
    try {
      const mg = require('../../../../../services/memgraph.service');
      const rows = await mg.runQuery(
        'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.aiTitle AS title LIMIT 1',
        { sid: uuid }
      );
      if (rows.length === 0 || !rows[0].title) return null;
      return {
        title: rows[0].title,
        type: 'session',
        url: `${this.baseUrl}/dialogue/session/${uuid}`,
      };
    } catch {
      return null;
    }
  }

  async _lookupDecision(uuid) {
    try {
      const mg = require('../../../../../services/memgraph.service');
      const rows = await mg.runQuery(
        `MATCH (d:DialogueDecision {decisionId: $did})<-[:HAS_DECISION]-(s:DialogueSession)
         RETURN s.sessionId AS sessionId, s.aiTitle AS sessionTitle, d.text AS decisionText
         LIMIT 1`,
        { did: uuid }
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      const shortText = (r.decisionText || '').slice(0, 60) + (r.decisionText?.length > 60 ? '…' : '');
      return {
        title: shortText || `Decision in ${r.sessionTitle}`,
        type: 'decision',
        url: `${this.baseUrl}/dialogue/session/${r.sessionId}`,
      };
    } catch {
      return null;
    }
  }
}

const dialogueLinkEnricher = new DialogueLinkEnricher();

module.exports = { DialogueLinkEnricher, dialogueLinkEnricher };
