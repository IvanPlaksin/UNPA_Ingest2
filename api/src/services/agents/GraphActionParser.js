/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GraphActionParser
 *
 * Parses structured graph actions from AI assistant responses.
 * Actions are embedded in %%ACTION%% ... %%END_ACTION%% blocks.
 * Supports validation, inverse diff generation (for Undo), and batch ops.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// ACTION TYPES
// ────────────────────────────────────────────────────────────────────────────

const ACTION_TYPES = {
  ADD_NODE: 'ADD_NODE',
  REMOVE_NODE: 'REMOVE_NODE',
  UPDATE_NODE: 'UPDATE_NODE',
  ADD_EDGE: 'ADD_EDGE',
  REMOVE_EDGE: 'REMOVE_EDGE',
  INSERT_BETWEEN: 'INSERT_BETWEEN',
  CREATE_SUBGRAPH: 'CREATE_SUBGRAPH',
  EXTRACT_SUBGRAPH: 'EXTRACT_SUBGRAPH',
  BATCH: 'BATCH',
  EXECUTE_GRAPH: 'EXECUTE_GRAPH',
};

// Tolerant regexes: accept %%END_X%%, %%END_X%, or %%END_X (LLM sometimes omits trailing %%)
const ACTION_BLOCK_RE = /%%ACTION%%\s*([\s\S]*?)\s*%%END_ACTION%{0,2}/g;
const RATIONALE_BLOCK_RE = /%%RATIONALE%%\s*([\s\S]*?)\s*%%END_RATIONALE%{0,2}/g;
const LESSON_BLOCK_RE = /%%LESSON%%\s*([\s\S]*?)\s*%%END_LESSON%{0,2}/g;

// ────────────────────────────────────────────────────────────────────────────
// PARSER
// ────────────────────────────────────────────────────────────────────────────

class GraphActionParser {
  /**
   * Parse assistant response text, extracting actions, rationale, and lessons.
   * @param {string} responseText - Raw assistant response
   * @returns {{ text: string, actions: Array, errors: Array, rationale: string|null, lessons: Array }}
   */
  parse(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      return { text: '', actions: [], errors: [], rationale: null, lessons: [] };
    }

    const actions = [];
    const errors = [];
    const lessons = [];
    let rationale = null;

    // Extract rationale block (first one only)
    RATIONALE_BLOCK_RE.lastIndex = 0;
    const rationaleMatch = RATIONALE_BLOCK_RE.exec(responseText);
    if (rationaleMatch) {
      rationale = rationaleMatch[1].trim();
    }

    // Extract lesson blocks
    LESSON_BLOCK_RE.lastIndex = 0;
    let lessonMatch;
    while ((lessonMatch = LESSON_BLOCK_RE.exec(responseText)) !== null) {
      const raw = lessonMatch[1].trim();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.errorType && parsed.description) {
          lessons.push(parsed);
        }
      } catch (err) {
        // Lesson is plain text, not JSON — store as-is
        lessons.push({
          errorType: 'UNKNOWN',
          description: raw.substring(0, 500),
          resolution: '',
          rule: '',
        });
      }
    }

    // Extract action blocks
    let match;
    ACTION_BLOCK_RE.lastIndex = 0;

    while ((match = ACTION_BLOCK_RE.exec(responseText)) !== null) {
      const raw = match[1].trim();
      let parsed = null;

      // Skip non-JSON content — LLM sometimes puts explanation text in %%ACTION%% blocks
      if (!raw.startsWith('{') && !raw.startsWith('[')) {
        console.warn(`[GraphActionParser] Skipping non-JSON action block: "${raw.substring(0, 80)}..."`);
        continue;
      }

      // Try direct parse first, then extract JSON object, then repair, then truncation rescue
      try {
        parsed = JSON.parse(raw);
      } catch (_firstErr) {
        // Try extracting just the JSON object if raw has trailing junk
        const extracted = this._extractJsonObject(raw);
        if (extracted) {
          try {
            parsed = JSON.parse(extracted);
          } catch (_) { /* fall through */ }
        }
        if (!parsed) {
          try {
            parsed = JSON.parse(this._repairJson(raw));
          } catch (_repairErr) {
            // Last resort: truncate at corruption point and close the JSON
            try {
              parsed = this._truncateAndClose(raw);
            } catch (err) {
              errors.push({
                raw: raw.substring(0, 200),
                errors: [`JSON parse error: ${err.message}`],
              });
              continue;
            }
          }
        }
      }

      try {
        const validation = this.validate(parsed);

        if (validation.valid) {
          actions.push(parsed);
        } else {
          errors.push({
            raw,
            errors: validation.errors,
          });
        }
      } catch (err) {
        errors.push({
          raw: raw.substring(0, 200),
          errors: [`Validation error: ${err.message}`],
        });
      }
    }

    // Clean text: remove all structured blocks
    const text = responseText
      .replace(ACTION_BLOCK_RE, '')
      .replace(RATIONALE_BLOCK_RE, '')
      .replace(LESSON_BLOCK_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (errors.length > 0) {
      console.warn(`[GraphActionParser] ${errors.length} action(s) failed to parse:`);
      for (const err of errors) {
        console.warn(`  → ${err.errors.join('; ')}  |  raw: ${(err.raw || '').substring(0, 120)}`);
      }
    }

    if (rationale) {
      console.log(`[GraphActionParser] Rationale extracted (${rationale.length} chars)`);
    }
    if (lessons.length > 0) {
      console.log(`[GraphActionParser] ${lessons.length} lesson(s) extracted`);
    }

    return { text, actions, errors, rationale, lessons };
  }

  /**
   * Validate a single action object.
   * @param {Object} action
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(action) {
    const errors = [];

    if (!action || typeof action !== 'object') {
      return { valid: false, errors: ['Action must be an object'] };
    }

    if (!action.type) {
      errors.push('Missing required field: type');
    } else if (!ACTION_TYPES[action.type]) {
      // Fuzzy match: try to auto-correct close action type names from LLM
      const corrected = this._fuzzyMatchActionType(action.type, action);
      if (corrected) {
        console.warn(`[GraphActionParser] Auto-corrected action type "${action.type}" → "${corrected}"`);
        action.type = corrected;
      } else {
        errors.push(`Unknown action type: "${action.type}". Valid types: ${Object.keys(ACTION_TYPES).join(', ')}`);
      }
    }

    // Type-specific validation
    switch (action.type) {
      case ACTION_TYPES.ADD_NODE:
        if (!action.node) errors.push('ADD_NODE requires "node" field');
        else {
          if (!action.node.id) errors.push('ADD_NODE node requires "id"');
          if (!action.node.type) errors.push('ADD_NODE node requires "type"');
        }
        break;

      case ACTION_TYPES.REMOVE_NODE:
        if (!action.nodeId && !action.node?.id) {
          errors.push('REMOVE_NODE requires "nodeId" or "node.id"');
        }
        break;

      case ACTION_TYPES.UPDATE_NODE:
        if (!action.nodeId && !action.node?.id) {
          errors.push('UPDATE_NODE requires "nodeId" or "node.id"');
        }
        break;

      case ACTION_TYPES.ADD_EDGE:
        if (!action.source) errors.push('ADD_EDGE requires "source"');
        if (!action.target) errors.push('ADD_EDGE requires "target"');
        break;

      case ACTION_TYPES.REMOVE_EDGE:
        if (!action.edgeId && (!action.source || !action.target)) {
          errors.push('REMOVE_EDGE requires "edgeId" or "source" + "target"');
        }
        break;

      case ACTION_TYPES.INSERT_BETWEEN:
        if (!action.node) errors.push('INSERT_BETWEEN requires "node"');
        if (!action.insertAfter) errors.push('INSERT_BETWEEN requires "insertAfter"');
        if (!action.insertBefore) errors.push('INSERT_BETWEEN requires "insertBefore"');
        break;

      case ACTION_TYPES.CREATE_SUBGRAPH:
        if (!action.parentNodeId) errors.push('CREATE_SUBGRAPH requires "parentNodeId"');
        if (!action.nodes || !Array.isArray(action.nodes)) {
          errors.push('CREATE_SUBGRAPH requires "nodes" array');
        }
        break;

      case ACTION_TYPES.EXTRACT_SUBGRAPH:
        if (!action.nodeIds || !Array.isArray(action.nodeIds)) {
          errors.push('EXTRACT_SUBGRAPH requires "nodeIds" array');
        }
        break;

      case ACTION_TYPES.BATCH:
        if (!action.actions || !Array.isArray(action.actions)) {
          errors.push('BATCH requires "actions" array');
        } else {
          // Validate each sub-action
          action.actions.forEach((sub, i) => {
            const subResult = this.validate(sub);
            if (!subResult.valid) {
              errors.push(`BATCH action[${i}]: ${subResult.errors.join('; ')}`);
            }
          });
        }
        break;

      case ACTION_TYPES.EXECUTE_GRAPH:
        // Optional: inputData object, config object
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Attempt lightweight JSON repair for common LLM output issues.
   * @param {string} raw - Malformed JSON string
   * @returns {string} Potentially repaired JSON string
   */
  _repairJson(raw) {
    let s = raw;

    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([}\]])/g, '$1');

    // Fix single quotes → double quotes
    s = s.replace(/'/g, '"');

    // Remove JS-style comments
    s = s.replace(/\/\/[^\n]*/g, '');

    // Fix missing quotes around property names: { type: "..." } → { "type": "..." }
    s = s.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');

    // Close unterminated strings: scan for unmatched quotes
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
      if (escaped) { escaped = false; continue; }
      if (s[i] === '\\') { escaped = true; continue; }
      if (s[i] === '"') inString = !inString;
    }
    if (inString) {
      // Truncate from the last unmatched quote value and close it
      // e.g. {"type":"ADD_EDGE","source":" → {"type":"ADD_EDGE","source":""}
      s += '"';
    }

    // Remove trailing key without value: ,"key":"  →  already closed above
    // Remove dangling comma + key: ,"key":  (no value after colon)
    s = s.replace(/,\s*"[^"]*"\s*:\s*$/g, '');

    // Balance braces and brackets
    let braceDepth = 0;
    let bracketDepth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{') braceDepth++;
      else if (s[i] === '}') braceDepth--;
      else if (s[i] === '[') bracketDepth++;
      else if (s[i] === ']') bracketDepth--;
    }
    while (bracketDepth > 0) { s += ']'; bracketDepth--; }
    while (braceDepth > 0) { s += '}'; braceDepth--; }
    while (braceDepth < 0) {
      const lastBrace = s.lastIndexOf('}');
      if (lastBrace >= 0) s = s.substring(0, lastBrace) + s.substring(lastBrace + 1);
      braceDepth++;
    }

    return s;
  }

  /**
   * Extract the first complete JSON object from raw text that may have trailing junk.
   * Tracks brace depth from the first '{' to find the matching '}'.
   *
   * Example: '{"type":"ADD_EDGE","source":"N10","target":"N07"}  some trailing text'
   *        → '{"type":"ADD_EDGE","source":"N10","target":"N07"}'
   *
   * @param {string} raw - Raw content possibly containing trailing non-JSON text
   * @returns {string|null} The first balanced JSON object substring, or null
   */
  _extractJsonObject(raw) {
    const start = raw.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return raw.substring(start, i + 1);
        }
      }
    }

    return null; // No balanced object found
  }

  /**
   * Last-resort rescue: progressively truncate corrupted JSON back to last
   * valid property boundary, close open structures, and parse.
   *
   * For example: {"type":"ADD_NODE","node":{"id":"N06","type":"ingestion.extract_relations","label":"Extractm":false,"min_confidence":0.5
   * → truncates at the corruption point, closes braces → parseable partial object.
   *
   * @param {string} raw - Corrupted JSON string
   * @returns {Object} Parsed JSON object
   * @throws {Error} If rescue fails
   */
  _truncateAndClose(raw) {
    // Strategy: try cutting backwards from the end to find a parseable prefix
    // Cut at each comma or opening brace to find the last good boundary
    const cutPoints = [];
    let inStr = false;
    let esc = false;
    for (let i = 0; i < raw.length; i++) {
      if (esc) { esc = false; continue; }
      if (raw[i] === '\\') { esc = true; continue; }
      if (raw[i] === '"') { inStr = !inStr; continue; }
      if (!inStr && (raw[i] === ',' || raw[i] === '{' || raw[i] === '[')) {
        cutPoints.push(i);
      }
    }

    // Try from most recent cut point backwards
    for (let ci = cutPoints.length - 1; ci >= 0; ci--) {
      const pos = cutPoints[ci];
      let fragment = raw.substring(0, pos);

      // Close any open strings
      let qCount = 0;
      for (const ch of fragment) { if (ch === '"') qCount++; }
      if (qCount % 2 !== 0) fragment += '"';

      // Close open braces/brackets
      let bd = 0, kd = 0;
      let inS = false, es = false;
      for (const ch of fragment) {
        if (es) { es = false; continue; }
        if (ch === '\\') { es = true; continue; }
        if (ch === '"') { inS = !inS; continue; }
        if (!inS) {
          if (ch === '{') bd++;
          else if (ch === '}') bd--;
          else if (ch === '[') kd++;
          else if (ch === ']') kd--;
        }
      }
      while (kd > 0) { fragment += ']'; kd--; }
      while (bd > 0) { fragment += '}'; bd--; }

      try {
        const parsed = JSON.parse(fragment);
        if (parsed && typeof parsed === 'object' && parsed.type) {
          console.warn(`[GraphActionParser] Rescued truncated JSON (cut at pos ${pos}/${raw.length})`);
          return parsed;
        }
      } catch (_) {
        // Try next cut point
      }
    }

    throw new Error('Cannot rescue truncated JSON');
  }

  /**
   * Fuzzy-match an unknown action type to a valid ACTION_TYPES key.
   * Handles common LLM mistakes: truncated names, missing suffixes, wrong separators.
   * Uses action fields to disambiguate when multiple types match a prefix.
   * @param {string} type - The unknown action type string
   * @param {Object} [action] - The full action object for field-based disambiguation
   * @returns {string|null} Corrected action type or null if no match
   */
  _fuzzyMatchActionType(type, action = {}) {
    if (!type) return null;

    const normalized = type.toUpperCase().replace(/[^A-Z_]/g, '');
    const validTypes = Object.keys(ACTION_TYPES);

    // Exact match after normalization (handles casing/whitespace)
    if (ACTION_TYPES[normalized]) return normalized;

    // Depluralize: "REMOVE_NODES" → "REMOVE_NODE"
    const depluralized = normalized.replace(/S$/, '');
    if (ACTION_TYPES[depluralized]) return depluralized;

    // Common aliases (checked before fuzzy to ensure deterministic results)
    const ALIASES = {
      DELETE_NODE: 'REMOVE_NODE',
      DELETE_EDGE: 'REMOVE_EDGE',
      DELETE: 'REMOVE_NODE',
      CREATE_NODE: 'ADD_NODE',
      CREATE_EDGE: 'ADD_EDGE',
      CREATE: 'ADD_NODE',
      CONNECT: 'ADD_EDGE',
      DISCONNECT: 'REMOVE_EDGE',
      MODIFY_NODE: 'UPDATE_NODE',
      EDIT_NODE: 'UPDATE_NODE',
      RUN_GRAPH: 'EXECUTE_GRAPH',
      RUN: 'EXECUTE_GRAPH',
      EXECUTE: 'EXECUTE_GRAPH',
    };
    if (ALIASES[normalized]) return ALIASES[normalized];

    // Prefix match with field-based disambiguation
    const prefixMatches = validTypes.filter(vt => vt.startsWith(normalized));
    if (prefixMatches.length === 1) return prefixMatches[0];
    if (prefixMatches.length > 1) {
      // Use action fields to pick the right type
      const disambiguated = this._disambiguateByFields(prefixMatches, action);
      if (disambiguated) return disambiguated;
      // Default: prefer shorter (more common)
      prefixMatches.sort((a, b) => a.length - b.length);
      return prefixMatches[0];
    }

    // Unique suffix/contains matches
    const suffixMatches = validTypes.filter(vt => vt.endsWith(normalized));
    if (suffixMatches.length === 1) return suffixMatches[0];

    const containsMatches = validTypes.filter(vt => vt.includes(normalized));
    if (containsMatches.length === 1) return containsMatches[0];

    return null;
  }

  /**
   * Disambiguate multiple type candidates using the action's fields.
   * E.g. {source, target} → EDGE type; {nodeId, node} → NODE type.
   * @param {string[]} candidates - Possible action types
   * @param {Object} action - The action object with fields
   * @returns {string|null} Best match or null
   */
  _disambiguateByFields(candidates, action) {
    if (!action || typeof action !== 'object') return null;

    const hasEdgeFields = action.source || action.target || action.edgeId;
    const hasNodeFields = action.nodeId || action.node;

    // If action has edge-specific fields, prefer EDGE types
    if (hasEdgeFields && !hasNodeFields) {
      const edgeType = candidates.find(c => c.includes('EDGE'));
      if (edgeType) return edgeType;
    }

    // If action has node-specific fields, prefer NODE types
    if (hasNodeFields && !hasEdgeFields) {
      const nodeType = candidates.find(c => c.includes('NODE'));
      if (nodeType) return nodeType;
    }

    return null;
  }

  /**
   * Generate inverse action for Undo.
   * @param {Object} action - The action to invert
   * @param {Object} currentGraphState - { nodes: Array, edges: Array }
   * @returns {Object|null} Inverse action or null if not invertible
   */
  generateInverseDiff(action, currentGraphState = { nodes: [], edges: [] }) {
    switch (action.type) {
      case ACTION_TYPES.ADD_NODE: {
        return {
          type: ACTION_TYPES.REMOVE_NODE,
          nodeId: action.node.id,
        };
      }

      case ACTION_TYPES.REMOVE_NODE: {
        const nodeId = action.nodeId || action.node?.id;
        const existingNode = currentGraphState.nodes.find(n =>
          (n.id === nodeId) || (n.data?.id === nodeId)
        );
        if (!existingNode) return null;

        // Also capture edges connected to this node
        const connectedEdges = currentGraphState.edges.filter(e =>
          e.source === nodeId || e.target === nodeId
        );

        return {
          type: ACTION_TYPES.BATCH,
          actions: [
            { type: ACTION_TYPES.ADD_NODE, node: existingNode.data || existingNode },
            ...connectedEdges.map(e => ({
              type: ACTION_TYPES.ADD_EDGE,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle,
              label: e.label,
            })),
          ],
        };
      }

      case ACTION_TYPES.UPDATE_NODE: {
        const nodeId = action.nodeId || action.node?.id;
        const existingNode = currentGraphState.nodes.find(n =>
          (n.id === nodeId) || (n.data?.id === nodeId)
        );
        if (!existingNode) return null;

        return {
          type: ACTION_TYPES.UPDATE_NODE,
          nodeId,
          updates: existingNode.data || existingNode,
        };
      }

      case ACTION_TYPES.ADD_EDGE: {
        return {
          type: ACTION_TYPES.REMOVE_EDGE,
          source: action.source,
          target: action.target,
        };
      }

      case ACTION_TYPES.REMOVE_EDGE: {
        const edgeId = action.edgeId;
        if (edgeId) {
          const existingEdge = currentGraphState.edges.find(e => e.id === edgeId);
          if (existingEdge) {
            return {
              type: ACTION_TYPES.ADD_EDGE,
              source: existingEdge.source,
              target: existingEdge.target,
              sourceHandle: existingEdge.sourceHandle,
              targetHandle: existingEdge.targetHandle,
              label: existingEdge.label,
            };
          }
        }
        return {
          type: ACTION_TYPES.ADD_EDGE,
          source: action.source,
          target: action.target,
        };
      }

      case ACTION_TYPES.INSERT_BETWEEN: {
        // Inverse: remove inserted node, reconnect original edge
        return {
          type: ACTION_TYPES.BATCH,
          actions: [
            { type: ACTION_TYPES.REMOVE_NODE, nodeId: action.node.id },
            { type: ACTION_TYPES.ADD_EDGE, source: action.insertAfter, target: action.insertBefore },
          ],
        };
      }

      case ACTION_TYPES.BATCH: {
        // Invert each sub-action in reverse order
        const inverses = [];
        for (let i = action.actions.length - 1; i >= 0; i--) {
          const inv = this.generateInverseDiff(action.actions[i], currentGraphState);
          if (inv) inverses.push(inv);
        }
        return inverses.length > 0 ? { type: ACTION_TYPES.BATCH, actions: inverses } : null;
      }

      default:
        return null;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON + EXPORTS
// ────────────────────────────────────────────────────────────────────────────

const graphActionParser = new GraphActionParser();

module.exports = {
  GraphActionParser,
  graphActionParser,
  ACTION_TYPES,
};
