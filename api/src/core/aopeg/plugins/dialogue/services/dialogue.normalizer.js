/**
 * Dialogue Normalizer
 * Converts Claude Code JSONL and Claude.ai JSON exports into NormalizedDialogue format.
 *
 * @typedef {Object} NormalizedMessage
 * @property {string} messageId
 * @property {string} role - 'user' | 'assistant'
 * @property {string} participant - 'Ivan' | 'Claude' | 'ClaudeCode'
 * @property {string} text - Flattened text content
 * @property {Array<{name:string,input:object,result:any}>} toolUse
 * @property {string} timestamp - ISO-8601
 * @property {{input:number,output:number,cacheRead:number,cacheCreate:number}|null} tokenUsage
 * @property {string|null} parentId
 *
 * @typedef {Object} NormalizedDialogue
 * @property {string} sourceId - UUID from source
 * @property {string} platform - 'claude_ai' | 'claude_code'
 * @property {string|null} projectPath
 * @property {string} title - First 80 chars of first user message
 * @property {string} startedAt - ISO-8601
 * @property {string} updatedAt - ISO-8601
 * @property {string|null} model
 * @property {string|null} gitBranch
 * @property {NormalizedMessage[]} messages
 * @property {{totalInputTokens:number,totalOutputTokens:number,messageCount:number,sourceFile:string}} metadata
 */

const fs = require('fs');
const path = require('path');

class DialogueNormalizer {
  /**
   * Parse a single Claude Code JSONL file into NormalizedDialogue.
   * @param {string} jsonlPath - Absolute path to .jsonl file
   * @returns {NormalizedDialogue|null}
   */
  parseClaudeCodeSession(jsonlPath) {
    let lines;
    try {
      lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
    } catch (err) {
      console.warn(`[DialogueNormalizer] Cannot read ${jsonlPath}: ${err.message}`);
      return null;
    }

    const records = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }

    // Extract session metadata from first user record
    const firstUserRecord = records.find(r => r.type === 'user' && r.sessionId);
    if (!firstUserRecord) return null;

    const sessionId = firstUserRecord.sessionId;
    const gitBranch = firstUserRecord.gitBranch || null;
    const projectPath = firstUserRecord.cwd || firstUserRecord.projectPath || null;
    const model = null; // Claude Code doesn't store model in user records

    const messages = [];
    let totalInput = 0;
    let totalOutput = 0;
    let startedAt = null;
    let updatedAt = null;

    for (const record of records) {
      if (record.type !== 'user' && record.type !== 'assistant') continue;

      const ts = record.timestamp || record.message?.created_at || null;
      if (ts && !startedAt) startedAt = ts;
      if (ts) updatedAt = ts;

      const role = record.type === 'user' ? 'user' : 'assistant';
      const participant = role === 'user' ? 'Ivan' : 'ClaudeCode';
      const contentBlocks = record.message?.content || [];

      const text = this._extractText(contentBlocks);
      const toolUse = this._extractToolUse(contentBlocks);

      const usage = record.message?.usage;
      let tokenUsage = null;
      if (usage) {
        tokenUsage = {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          cacheCreate: usage.cache_creation_input_tokens || 0,
        };
        totalInput += tokenUsage.input;
        totalOutput += tokenUsage.output;
      }

      messages.push({
        messageId: record.uuid || record.promptId || `${sessionId}-${messages.length}`,
        role,
        participant,
        text,
        toolUse,
        timestamp: ts || new Date().toISOString(),
        tokenUsage,
        parentId: record.parentUuid || null,
      });
    }

    if (messages.length === 0) return null;

    const firstUserMsg = messages.find(m => m.role === 'user' && m.text.trim().length > 0);
    const title = firstUserMsg
      ? firstUserMsg.text.replace(/\s+/g, ' ').trim().slice(0, 80)
      : path.basename(jsonlPath, '.jsonl');

    return {
      sourceId: sessionId,
      platform: 'claude_code',
      projectPath,
      title,
      startedAt: startedAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
      model,
      gitBranch,
      messages,
      metadata: {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        messageCount: messages.length,
        sourceFile: jsonlPath,
      },
    };
  }

  /**
   * Parse all top-level JSONL files in a Claude Code project directory.
   * Skips subagent files (inside session subdirs).
   * @param {string} dirPath - .claude/projects/<project-dir>
   * @returns {NormalizedDialogue[]}
   */
  parseClaudeCodeDirectory(dirPath) {
    const results = [];

    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch (err) {
      console.warn(`[DialogueNormalizer] Cannot read dir ${dirPath}: ${err.message}`);
      return results;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const full = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      const dialogue = this.parseClaudeCodeSession(full);
      if (dialogue) results.push(dialogue);
    }

    return results;
  }

  /**
   * Parse Claude.ai export conversations.json
   * @param {string} jsonPath - Path to conversations.json
   * @returns {NormalizedDialogue[]}
   */
  parseClaudeAIExport(jsonPath) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (err) {
      console.warn(`[DialogueNormalizer] Cannot parse ${jsonPath}: ${err.message}`);
      return [];
    }

    const conversations = Array.isArray(data) ? data : (data.conversations || []);
    const results = [];

    for (const conv of conversations) {
      const messages = [];

      for (const msg of conv.chat_messages || []) {
        const role = msg.sender === 'human' ? 'user' : 'assistant';
        const participant = role === 'user' ? 'Ivan' : 'Claude';

        const contentBlocks = Array.isArray(msg.content) ? msg.content : [];
        const text = contentBlocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('\n')
          .trim() || (typeof msg.text === 'string' ? msg.text : '');

        messages.push({
          messageId: msg.uuid || `${conv.uuid}-${messages.length}`,
          role,
          participant,
          text,
          toolUse: [],
          timestamp: msg.created_at || conv.created_at || new Date().toISOString(),
          tokenUsage: null,
          parentId: null,
        });
      }

      if (messages.length === 0) continue;

      results.push({
        sourceId: conv.uuid,
        platform: 'claude_ai',
        projectPath: null,
        title: conv.name || conv.title || messages[0]?.text.slice(0, 80) || 'Untitled',
        startedAt: conv.created_at || new Date().toISOString(),
        updatedAt: conv.updated_at || new Date().toISOString(),
        model: conv.model || null,
        gitBranch: null,
        messages,
        metadata: {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          messageCount: messages.length,
          sourceFile: jsonPath,
        },
      });
    }

    return results;
  }

  /**
   * Extract tool use blocks from content array.
   * @param {Array} contentBlocks
   * @returns {Array<{name:string,input:object,result:any}>}
   */
  extractToolUse(contentBlocks) {
    return this._extractToolUse(contentBlocks);
  }

  _extractText(contentBlocks) {
    if (!Array.isArray(contentBlocks)) {
      return typeof contentBlocks === 'string' ? contentBlocks : '';
    }
    return contentBlocks
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n')
      .trim();
  }

  _extractToolUse(contentBlocks) {
    if (!Array.isArray(contentBlocks)) return [];

    const tools = [];
    const toolUseMap = new Map();

    for (const block of contentBlocks) {
      if (block.type === 'tool_use') {
        toolUseMap.set(block.id, {
          name: block.name || 'unknown',
          input: block.input || {},
          result: null,
        });
      } else if (block.type === 'tool_result' && block.tool_use_id) {
        const entry = toolUseMap.get(block.tool_use_id);
        if (entry) {
          entry.result = Array.isArray(block.content)
            ? block.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
            : block.content;
        }
      }
    }

    tools.push(...toolUseMap.values());
    return tools;
  }
}

const dialogueNormalizer = new DialogueNormalizer();
module.exports = { DialogueNormalizer, dialogueNormalizer };
