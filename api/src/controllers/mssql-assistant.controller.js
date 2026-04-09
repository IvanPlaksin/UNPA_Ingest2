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

    let systemPrompt;

    if (context?.purpose === 'datasource_query_generation') {
      // SQL query generation mode — used by DataSource AI Assistant
      const ff = context.formFields || {};
      const currentFields = ff.query || ff.searchQuery || ff.countQuery
        ? `\nCurrent DataSource form state:
- DataSource name: ${ff.name || '(not set)'}
- Connection: ${ff.connectionId || '(not set)'}
- Query (SELECT): ${ff.query || '(empty)'}
- Search Query: ${ff.searchQuery || '(empty)'}
- Count Query: ${ff.countQuery || '(empty)'}
- Search Field: ${ff.searchField || '(empty)'}
- Value Field: ${ff.valueField || '(empty)'}
- Label Field: ${ff.labelField || '(empty)'}
- Description: ${ff.description || '(empty)'}

The user may ask you to modify, improve, or fill these fields. Always return the COMPLETE updated set of fields in your JSON response.`
        : `\nThe DataSource form is empty. The user wants you to generate queries from scratch.
DataSource name: ${ff.name || '(not set)'}`;

      systemPrompt = `You are a SQL Server expert assistant. Your job is to generate and manage SQL queries for a DataSource configuration form.

You have direct access to the DataSource form fields. When the user asks you to generate, modify, or fix queries, you must return a JSON block that will be applied to the form.

${context.schemaContext || 'No schema available.'}
${currentFields}

${context.outputFormat || 'Return SQL queries wrapped in a ```json code block.'}

Rules:
- Generate clean, efficient SQL Server queries
- CRITICAL: Use ONLY column names that actually exist in the schema above. NEVER invent or guess column names like "Id", "Name" — always check the actual columns listed for each table
- If a table's primary key is named "UserId" use "UserId", not "Id". If a name field is "FirstName"+"LastName" use those, not "Name"
- Always alias output columns as "value" and "label" in the SQL (e.g., \`SELECT UserId AS value, FirstName AS label\`)
- CRITICAL: Because of the aliases, the JSON response MUST set \`"valueField": "value"\` and \`"labelField": "label"\` — NOT the source column names. The valueField/labelField fields refer to the result-set column names, not source expressions.
- For searchQuery, use @searchText parameter with LIKE patterns (e.g., WHERE name LIKE '%' + @searchText + '%')
- For countQuery, return a single "total" column
- Return JSON with keys: query, searchQuery, countQuery, valueField, labelField, searchField
- Wrap the JSON in a \`\`\`json code block
- If the user asks to modify just one field, still return all fields (keep unchanged fields as-is)
- If current fields have values, use them as a starting point unless the user asks to replace them

Example of a correct response:
\`\`\`json
{
  "query": "SELECT UserId AS value, CONCAT(FirstName, ' ', LastName) AS label FROM Users WHERE IsActive = 1 ORDER BY FirstName, LastName",
  "searchQuery": "SELECT UserId AS value, CONCAT(FirstName, ' ', LastName) AS label FROM Users WHERE IsActive = 1 AND (FirstName LIKE '%' + @searchText + '%' OR LastName LIKE '%' + @searchText + '%') ORDER BY FirstName, LastName",
  "countQuery": "SELECT COUNT(*) AS total FROM Users WHERE IsActive = 1",
  "valueField": "value",
  "labelField": "label",
  "searchField": "FirstName"
}
\`\`\``;
    } else {
      // Default: extraction results Q&A mode
      systemPrompt = `You are an AI assistant helping a user understand the results of a database knowledge extraction process.

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
    }

    const chatMessages = [{ role: 'system', content: systemPrompt }];

    // Include conversation history if provided
    if (req.body.history?.length) {
      for (const h of req.body.history) {
        if (h.role === 'user' || h.role === 'assistant') {
          chatMessages.push({ role: h.role, content: h.content });
        }
      }
    } else {
      chatMessages.push({ role: 'user', content: message });
    }

    const result = await llm.chat(chatMessages);

    const responseText = result?.content || result?.message?.content || 'No response generated.';

    res.json({ message: responseText });
  } catch (error) {
    console.error('[MSSQL Assistant] Error:', error.message);
    res.status(500).json({ error: error.message, message: 'Sorry, I could not process your question right now.' });
  }
};

module.exports = { assistantChat };
