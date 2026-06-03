'use strict';

const fs = require('fs');
const { createSimpleExecutor, createSuccessResult } = require('../../plugin-base');

// ── Tool identification ───────────────────────────────────────────────────────

const CONVERSATION_TOOL_BASES = new Set([
  'send_agent_task',
  'get_conversation',
  'list_conversations',
  'send_message_to_chat',
  'get_messages_from_chat',
]);

function getBaseName(toolName) {
  const parts = toolName.split('__');
  if (parts.length >= 3 && parts[0] === 'mcp') return parts[parts.length - 1];
  return toolName;
}

function isConversationTool(toolName) {
  return CONVERSATION_TOOL_BASES.has(getBaseName(toolName));
}

function parseResult(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Claude.ai full history fetch ──────────────────────────────────────────────
//
// Fetches the COMPLETE message history for a conversation from the Claude.ai API.
// Uses got-scraping (ESM, dynamic import) to bypass Cloudflare TLS fingerprinting.
// Returns raw chat_messages array or null on failure (caller falls back to JSONL data).

let _gotScraping = null;
async function getGotScraping() {
  if (!_gotScraping) {
    const mod = await import('got-scraping');
    _gotScraping = mod.gotScraping;
  }
  return _gotScraping;
}

async function fetchCompleteHistory(conversationId) {
  const sessionKey     = process.env.CLAUDE_SESSION_KEY;
  const organizationId = process.env.CLAUDE_ORGANIZATION_ID;
  const baseUrl        = process.env.CLAUDE_BASE_URL || 'https://claude.ai/api';

  if (!sessionKey || !organizationId) return null;

  const url = `${baseUrl}/organizations/${organizationId}/chat_conversations/${conversationId}`;

  try {
    const gotScraping = await getGotScraping();
    const projectId = process.env.CLAUDE_PROJECT_ID;
    const referer   = projectId ? `https://claude.ai/project/${projectId}` : 'https://claude.ai/';

    const response = await gotScraping({
      url,
      method: 'GET',
      headers: {
        'Cookie':              `sessionKey=${sessionKey}`,
        'Accept':              'application/json, text/plain, */*',
        'Accept-Language':     'en-US,en;q=0.9',
        'Accept-Encoding':     'gzip, deflate, br',
        'User-Agent':          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer':             referer,
        'Origin':              'https://claude.ai',
        'Sec-Ch-Ua':           '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile':    '?0',
        'Sec-Ch-Ua-Platform':  '"Windows"',
        'Sec-Fetch-Dest':      'empty',
        'Sec-Fetch-Mode':      'cors',
        'Sec-Fetch-Site':      'same-origin',
        'Cache-Control':       'no-cache',
        'Pragma':              'no-cache',
      },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 131, httpVersion: '2' }],
        devices: ['desktop'],
        locales: ['en-US'],
        operatingSystems: ['windows'],
      },
      throwHttpErrors: false,
      followRedirect: true,
      maxRedirects: 5,
      timeout: { request: 30000 },
      retry: { limit: 2, methods: ['GET'], statusCodes: [408, 429, 500, 502, 503, 504] },
    });

    if (response.statusCode !== 200) {
      console.warn(`[MCPConv] fetchCompleteHistory HTTP ${response.statusCode} for ${conversationId}`);
      return null;
    }

    const data = JSON.parse(response.body);
    return data.chat_messages || null;
  } catch (err) {
    console.warn(`[MCPConv] fetchCompleteHistory failed for ${conversationId}: ${err.message}`);
    return null;
  }
}

// Convert raw Claude.ai chat_messages to our internal message format.
// Assigns branchType based on whether the message predates the first CC contact.
function normalizeChatApiMessages(chatMessages, conversationId, firstCcTimestamp) {
  const messages = [];
  for (const msg of chatMessages) {
    const ts   = msg.created_at || msg.updated_at || null;
    const text = (msg.text || '').trim();
    if (!text) continue;

    const sender    = msg.sender || 'human';
    const role      = sender === 'human' ? 'user' : 'assistant';
    const participant = sender === 'human' ? 'User' : 'ClaudeChat';

    // Messages before Claude Code first contacted this chat are "context".
    // Messages at or after are "exchanges".
    const msgTime   = ts ? new Date(ts).getTime() : null;
    const ccTime    = firstCcTimestamp ? new Date(firstCcTimestamp).getTime() : null;
    const branchType = (msgTime && ccTime && msgTime < ccTime) ? 'context' : 'exchange';

    messages.push({
      messageId:   msg.uuid || `${sender}-${ts || Date.now()}`,
      role,
      participant,
      content:     text,
      timestamp:   ts,
      source:      'claude_ai_full',
      branchType,
      conversationId,
    });
  }
  return messages;
}

// ── Cross-message JSONL parser ────────────────────────────────────────────────
//
// In Claude Code JSONL, tool_use blocks appear in assistant messages, while
// the corresponding tool_result blocks appear in the NEXT user message.
// Standard per-message extraction misses this — we do a two-pass raw scan.

function extractToolCallsFromJSONL(sourceFile) {
  let raw;
  try { raw = fs.readFileSync(sourceFile, 'utf-8'); } catch { return []; }

  const lines = raw.split('\n').filter(Boolean);

  const toolUseMap    = new Map(); // id → { name, input, timestamp }
  const toolResultMap = new Map(); // tool_use_id → resultText

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const timestamp = obj.timestamp || null;
    const msg       = obj.message || {};
    const content   = Array.isArray(msg.content) ? msg.content : [];

    for (const block of content) {
      if (block.type === 'tool_use' && isConversationTool(block.name || '')) {
        toolUseMap.set(block.id, { name: block.name, input: block.input || {}, timestamp });
      }
      if (block.type === 'tool_result' && block.tool_use_id) {
        let resultText = block.content;
        if (Array.isArray(resultText)) {
          resultText = resultText.filter(b => b.type === 'text').map(b => b.text).join('\n');
        }
        toolResultMap.set(block.tool_use_id, resultText || '');
      }
    }
  }

  return [...toolUseMap.entries()].map(([id, tool]) => ({
    id,
    name:      tool.name,
    input:     tool.input,
    timestamp: tool.timestamp,
    result:    toolResultMap.get(id) ?? null,
  }));
}

// ── Per-tool extraction logic ─────────────────────────────────────────────────

function extractConversationData(tool) {
  const baseName = getBaseName(tool.name);
  const input    = tool.input || {};
  const result   = parseResult(tool.result);
  const ts       = tool.timestamp;

  let conversationId = null;
  let title = null;
  const messages = [];

  switch (baseName) {
    case 'send_agent_task': {
      conversationId = result?.conversationId || input.conversationId || null;
      if (input.desc) {
        messages.push({
          messageId:   `task-sent-${ts}`,
          role:        'user',
          participant: 'ClaudeCode',
          content:     `[Agent task · ${input.type || 'custom'}] ${input.desc}`,
          timestamp:   ts,
          source:      'claude_ai_linked',
        });
      }
      if (result?.result) {
        messages.push({
          messageId:   `task-resp-${ts}`,
          role:        'assistant',
          participant: 'ClaudeChat',
          content:     String(result.result),
          timestamp:   ts,
          source:      'claude_ai_linked',
        });
      }
      break;
    }

    case 'get_messages_from_chat': {
      conversationId = input.conversationId || null;
      const msgs = result?.messages;
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          messages.push({
            messageId:   m.id || `${m.sender}-${m.created_at || ts}`,
            role:        m.sender === 'human' ? 'user' : 'assistant',
            participant: m.sender === 'human' ? 'User' : 'ClaudeChat',
            content:     m.text || '',
            timestamp:   m.created_at || ts,
            source:      'claude_ai_linked',
          });
        }
      }
      break;
    }

    case 'send_message_to_chat': {
      conversationId = input.conversationId || null;
      if (input.message) {
        messages.push({
          messageId:   `sent-${tool.id}`,
          role:        'user',
          participant: 'ClaudeCode',
          content:     input.message,
          timestamp:   ts,
          source:      'claude_ai_linked',
        });
      }
      const respText = result?.response || result?.text || result?.message ||
        (typeof result === 'string' ? result : null);
      if (respText) {
        messages.push({
          messageId:   `resp-${tool.id}`,
          role:        'assistant',
          participant: 'ClaudeChat',
          content:     String(respText),
          timestamp:   ts,
          source:      'claude_ai_linked',
        });
      }
      break;
    }

    case 'get_conversation': {
      conversationId = input.conversationId || result?.id || null;
      title = result?.title || null;
      break;
    }

    default:
      break;
  }

  return { conversationId, title, messages };
}

// ── Executor ──────────────────────────────────────────────────────────────────

const dialogueExtractMcpConversationsExecutor = createSimpleExecutor({
  type: 'dialogue.extract_mcp_conversations',
  displayName: 'MCP Conversation Link Extractor',
  description: 'Detects Claude.ai conversation IDs from MCP tool calls in JSONL, fetches complete history from Claude.ai API, and stores linked conversations in Memgraph',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
    },
  },

  async execute(params) {
    const { sessionId } = params;

    const memgraph = require('../../../../../services/memgraph.service');

    // Load source JSONL path from Memgraph
    const sessRows = await memgraph.runQuery(
      'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s',
      { sid: sessionId }
    );
    const sessProps = sessRows[0]?.s?.properties || sessRows[0]?.s || sessRows[0];
    const sourceFile = sessProps?.sourceFile;

    if (!sourceFile) {
      return createSuccessResult({ conversationsFound: 0, messagesExtracted: 0 });
    }

    // Two-pass JSONL extraction to find all conversation IDs and CC-contact timestamps
    const tools = extractToolCallsFromJSONL(sourceFile);
    if (!tools.length) {
      return createSuccessResult({ conversationsFound: 0, messagesExtracted: 0 });
    }

    // Build per-conversation metadata from JSONL tool calls:
    // - title (from get_conversation), JSONL-captured messages, earliest CC-contact time
    const conversationMap = new Map(); // conversationId → { title, jsonlMessages[], toolNames, firstCcTs }

    for (const tool of tools) {
      const { conversationId, title, messages } = extractConversationData(tool);
      if (!conversationId) continue;

      if (!conversationMap.has(conversationId)) {
        conversationMap.set(conversationId, {
          conversationId,
          title:         null,
          jsonlMessages: [],
          toolNames:     new Set(),
          firstCcTs:     null,
        });
      }
      const entry = conversationMap.get(conversationId);
      if (title && !entry.title) entry.title = title;
      entry.toolNames.add(tool.name);
      entry.jsonlMessages.push(...messages);

      // Track earliest timestamp when ClaudeCode sent something to this chat
      if (getBaseName(tool.name) === 'send_message_to_chat' && tool.timestamp) {
        if (!entry.firstCcTs || tool.timestamp < entry.firstCcTs) {
          entry.firstCcTs = tool.timestamp;
        }
      }
    }

    if (conversationMap.size === 0) {
      return createSuccessResult({ conversationsFound: 0, messagesExtracted: 0 });
    }

    let totalMessages = 0;
    const allLinkedMessages       = [];
    const linkedConversationsMeta = [];

    for (const [conversationId, data] of conversationMap) {
      // ── Step A: Fetch complete history from Claude.ai API ─────────────────
      const apiMessages = await fetchCompleteHistory(conversationId);

      let unique;

      if (apiMessages) {
        // Full API history available → use it as authoritative source
        const normalized = normalizeChatApiMessages(apiMessages, conversationId, data.firstCcTs);

        // Merge with JSONL-only messages that API won't have (ClaudeCode-sent messages)
        // These have participant='ClaudeCode' and source='claude_ai_linked'
        const ccOnly = data.jsonlMessages.filter(m => m.participant === 'ClaudeCode');

        // Content-based dedup (API may include some CC messages as role=human)
        const seenContent = new Map();
        const merged = [];

        for (const m of [...normalized, ...ccOnly]) {
          const key = (m.content || '').trim().slice(0, 200);
          if (!key) { merged.push(m); continue; }
          const idx = seenContent.get(key);
          if (idx === undefined) {
            seenContent.set(key, merged.length);
            merged.push(m);
          } else {
            // Prefer ClaudeCode attribution over User for same content
            if (m.participant === 'ClaudeCode' && merged[idx].participant === 'User') {
              merged[idx] = m;
            }
          }
        }

        unique = merged.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Assign branchType to CC messages (they're all 'exchange' — they caused the chat)
        for (const m of unique) {
          if (!m.branchType) {
            m.branchType = m.participant === 'ClaudeCode' ? 'exchange' : 'exchange';
          }
        }

      } else {
        // Fallback: use JSONL-captured messages only (old behavior)
        const byId = [...new Map(data.jsonlMessages.map(m => [m.messageId, m])).values()];

        const seenContent = new Map();
        const result = [];
        for (const m of byId) {
          const key = (m.content || '').trim().slice(0, 200);
          if (!key) { result.push(m); continue; }
          const existing = seenContent.get(key);
          if (existing === undefined) {
            seenContent.set(key, result.length);
            result.push(m);
          } else {
            const cur = result[existing];
            if (m.participant === 'ClaudeCode' && cur.participant === 'User') {
              result[existing] = m;
            }
          }
        }
        unique = result.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Assign branchType based on firstCcTs
        for (const m of unique) {
          if (!m.branchType) {
            const msgTime = m.timestamp ? new Date(m.timestamp).getTime() : null;
            const ccTime  = data.firstCcTs ? new Date(data.firstCcTs).getTime() : null;
            m.branchType = (msgTime && ccTime && msgTime < ccTime) ? 'context' : 'exchange';
          }
        }
      }

      const derivedTitle = data.title || `Claude Chat ${conversationId.slice(0, 8)}`;
      const toolNames    = [...data.toolNames].join(',');
      const now          = new Date().toISOString();
      const source       = apiMessages ? 'claude_ai_full' : 'claude_ai_jsonl';

      // Upsert LinkedConversation node
      await memgraph.runQuery(
        `MERGE (c:LinkedConversation {conversationId: $cid})
         SET c.title = $title,
             c.messages = $msgs,
             c.messageCount = $count,
             c.platform = 'claude_ai',
             c.source = $source,
             c.firstCcTimestamp = $firstCcTs,
             c.updatedAt = $now`,
        {
          cid:      conversationId,
          title:    derivedTitle,
          msgs:     JSON.stringify(unique),
          count:    unique.length,
          source,
          firstCcTs: data.firstCcTs || null,
          now,
        }
      );

      // Upsert REFERENCES_CONVERSATION relationship
      await memgraph.runQuery(
        `MATCH (s:DialogueSession {sessionId: $sid})
         MATCH (c:LinkedConversation {conversationId: $cid})
         MERGE (s)-[r:REFERENCES_CONVERSATION]->(c)
         SET r.toolNames = $toolNames, r.extractedAt = $now`,
        { sid: sessionId, cid: conversationId, toolNames, now }
      );

      totalMessages += unique.length;
      allLinkedMessages.push(...unique);
      linkedConversationsMeta.push({
        conversationId,
        title:        derivedTitle,
        messageCount: unique.length,
        source,
        firstCcTimestamp: data.firstCcTs,
        webUrl:       `https://claude.ai/chat/${conversationId}`,
      });
    }

    console.log(`[MCPConv] ${sessionId?.slice(0, 8)}: ${conversationMap.size} linked conversations, ${totalMessages} messages extracted`);
    return createSuccessResult({
      conversationsFound:   conversationMap.size,
      messagesExtracted:    totalMessages,
      linkedMessages:       allLinkedMessages,
      linkedConversations:  linkedConversationsMeta,
    });
  },
});

module.exports = { dialogueExtractMcpConversationsExecutor, getBaseName, isConversationTool };
