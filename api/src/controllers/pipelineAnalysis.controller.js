// api/src/controllers/pipelineAnalysis.controller.js
// Контроллер для AI-анализа результатов pipeline

const PipelineAnalysisService = require('../services/pipelineAnalysis.service');
const { getSession } = require('../services/sessionStore');

// Conversation history per session (in-memory, not persisted to Redis)
const conversationHistory = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLLER METHODS
// ═══════════════════════════════════════════════════════════════════════════════

exports.startAnalysis = async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  console.log(`[PipelineAnalysis] startAnalysis for session: ${sessionId}`);
  console.log(`[PipelineAnalysis] Session found: ${!!session}`);
  if (session) {
    console.log(`[PipelineAnalysis] Session status: ${session.status}`);
  }

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  if (session.status !== 'complete') {
    return res.status(400).json({
      success: false,
      error: `Pipeline must complete before analysis. Current status: ${session.status}`
    });
  }

  // Initialize conversation history
  conversationHistory.set(sessionId, []);

  res.json({
    success: true,
    message: 'Analysis ready to stream',
    sessionId
  });
};

exports.streamAnalysis = async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  req.setTimeout(0);

  const history = conversationHistory.get(sessionId) || [];
  let fullResponse = '';

  try {
    res.write(`event: analysis_start\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    for await (const event of PipelineAnalysisService.streamAnalysis(session, history)) {
      if (event.type === 'chunk') {
        fullResponse += event.content;
        res.write(`event: analysis_chunk\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
      } else if (event.type === 'done') {
        // Save to history
        if (history.length === 0) {
          history.push({
            role: 'user',
            content: '[Initial analysis request]'
          });
        }
        history.push({
          role: 'assistant',
          content: fullResponse
        });
        conversationHistory.set(sessionId, history);

        res.write(`event: analysis_complete\ndata: ${JSON.stringify({ sessionId })}\n\n`);
      } else if (event.type === 'error') {
        res.write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`);
      }
    }
  } catch (error) {
    console.error('[Analysis] Stream error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  } finally {
    res.end();
  }
};

exports.chat = async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;

  const session = await getSession(sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  if (!message?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  req.setTimeout(0);

  const history = conversationHistory.get(sessionId) || [];

  // Add user message to history
  history.push({ role: 'user', content: message });

  let fullResponse = '';

  try {
    res.write(`event: chat_start\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    for await (const event of PipelineAnalysisService.chat(session, history.slice(0, -1), message)) {
      if (event.type === 'chunk') {
        fullResponse += event.content;
        res.write(`event: chat_chunk\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
      } else if (event.type === 'done') {
        // Save assistant response to history
        history.push({ role: 'assistant', content: fullResponse });
        conversationHistory.set(sessionId, history);

        res.write(`event: chat_complete\ndata: ${JSON.stringify({ sessionId })}\n\n`);
      } else if (event.type === 'error') {
        res.write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`);
      }
    }
  } catch (error) {
    console.error('[Analysis] Chat error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  } finally {
    res.end();
  }
};

exports.getHistory = (req, res) => {
  const { sessionId } = req.params;
  const history = conversationHistory.get(sessionId) || [];

  res.json({
    success: true,
    history: history.map((msg, idx) => ({
      id: idx,
      role: msg.role,
      content: msg.content,
      timestamp: Date.now()
    }))
  });
};

