/**
 * MSSQL Assistant Controller
 *
 * AI assistant endpoint for answering questions about extraction results.
 * Uses LLM to generate contextual responses based on session data.
 */

let _llmService = null;
function getLlmService() {
  if (!_llmService) {
    _llmService = require('../services/llm.service');
    if (typeof _llmService === 'function') _llmService = new _llmService();
  }
  return _llmService;
}

/**
 * POST /api/v1/mssql/assistant
 * Body: { message, sessionId, context }
 */
const assistantChat = async (req, res) => {
  const { message, sessionId, context } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const llm = getLlmService();

    const systemPrompt = `You are an AI assistant helping a user understand the results of a database knowledge extraction process.

Session Summary:
- Tables processed: ${context?.summary?.tablesProcessed || 0}
- Entities discovered: ${context?.summary?.entitiesDiscovered || 0}
- Relationships found: ${context?.summary?.relationshipsFound || 0}
- Business rules extracted: ${context?.summary?.rulesExtracted || 0}
- Calculations found: ${context?.summary?.calculationsFound || 0}
- Lifecycles detected: ${context?.summary?.lifecyclesDetected || 0}
- Quality score: ${Math.round((context?.qualityScore || 0) * 100)}%

Phase status: ${(context?.phases || []).map(p => `${p.name}: ${p.status}`).join(', ') || 'unknown'}
Available graphs: ${(context?.graphs || []).join(', ') || 'none'}

Provide helpful, concise responses. If the user asks about specific entities, rules, or anomalies, refer to the extracted data. If they want to take actions (restart phases, export data), suggest the appropriate action.`;

    const result = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ]);

    const responseText = result?.content || result?.message?.content || 'No response generated.';

    res.json({ message: responseText });
  } catch (error) {
    console.error('[MSSQL Assistant] Error:', error.message);
    res.status(500).json({ error: error.message, message: 'Sorry, I could not process your question right now.' });
  }
};

module.exports = { assistantChat };
