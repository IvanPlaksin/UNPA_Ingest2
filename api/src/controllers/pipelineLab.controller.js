// api/src/controllers/pipelineLab.controller.js
// Контроллер для Enhanced Pipeline Lab с поддержкой Redis

const { v4: uuidv4 } = require('uuid');
const PipelineStreamService = require('../services/pipelineStream.service');
const { getSession, saveSession, deleteSession, useRedis } = require('../services/sessionStore');

exports.startPipeline = async (req, res) => {
  try {
    const { text, options = {} } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (text.length > 100000) {
      return res.status(400).json({
        success: false,
        error: 'Text exceeds maximum length (100KB)'
      });
    }

    const sessionId = uuidv4();

    const sessionData = {
      text,
      options,
      stages: {},
      graphData: { nodes: [], links: [] },
      createdAt: Date.now(),
      status: 'pending',
      storageType: useRedis() ? 'redis' : 'memory'
    };

    await saveSession(sessionId, sessionData);

    console.log(`[PipelineLab] Session created: ${sessionId} (storage: ${sessionData.storageType})`);

    res.json({
      success: true,
      sessionId,
      storageType: sessionData.storageType,
      message: 'Pipeline session created. Connect to stream to begin processing.'
    });

  } catch (error) {
    console.error('[PipelineLab] Error starting pipeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.streamPipeline = async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  // SSE заголовки
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Предотвращение timeout
  req.setTimeout(0);

  // Отправка начального события подключения
  res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Обработка отключения клиента
  req.on('close', async () => {
    console.log(`[PipelineLab] Client disconnected: ${sessionId}, current status: ${session.status}`);
    // Не перезаписываем статус если pipeline уже завершён или завершился с ошибкой
    if (session.status !== 'complete' && session.status !== 'error') {
      session.status = 'disconnected';
      await saveSession(sessionId, session);
    }
  });

  try {
    session.status = 'processing';

    // Обработка pipeline через сервис
    await PipelineStreamService.processPipeline(
      session.text,
      session.options,
      {
        onStageStart: async (stage, name) => {
          session.stages[stage] = { status: 'processing', startTime: Date.now() };
          sendEvent('stage_start', { stage, name, timestamp: Date.now() });
        },
        onStageProgress: (stage, progress, message) => {
          sendEvent('stage_progress', { stage, progress, message });
        },
        onStageComplete: async (stage, output, duration) => {
          session.stages[stage] = { status: 'complete', output, duration };
          sendEvent('stage_complete', { stage, output, duration });

          // Обновление данных графа на этапе 9
          if (stage === 9 && output) {
            session.graphData = output;
          }

          // Периодически сохраняем сессию в Redis
          if (stage % 3 === 0 || stage === 9) {
            await saveSession(sessionId, session);
          }
        },
        onError: async (stage, error) => {
          session.stages[stage] = { status: 'error', error: error.message };
          sendEvent('error', { stage, message: error.message, recoverable: true });
          await saveSession(sessionId, session);
        }
      }
    );

    session.status = 'complete';
    await saveSession(sessionId, session);

    sendEvent('pipeline_complete', {
      sessionId,
      totalDuration: Date.now() - session.createdAt,
      summary: {
        nodes: session.graphData.nodes?.length || 0,
        links: session.graphData.links?.length || 0
      }
    });

  } catch (error) {
    console.error(`[PipelineLab] Pipeline error: ${sessionId}`, error);
    session.status = 'error';
    await saveSession(sessionId, session);
    sendEvent('error', {
      message: error.message,
      recoverable: false
    });
  } finally {
    res.end();
  }
};

exports.rerunStage = async (req, res) => {
  try {
    const { stageId } = req.params;
    const { sessionId, input, options = {}, cascade = true } = req.body;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const stageNum = parseInt(stageId);
    const output = await PipelineStreamService.processStage(stageNum, input, options);

    session.stages[stageNum] = { status: 'complete', output, rerunAt: Date.now() };

    // Каскадный сброс зависимых этапов (если включено)
    if (cascade) {
      for (let i = stageNum + 1; i <= 9; i++) {
        if (session.stages[i]) {
          session.stages[i] = { status: 'invalidated', invalidatedBy: stageNum };
        }
      }
    }

    await saveSession(sessionId, session);

    res.json({
      success: true,
      stage: stageNum,
      output,
      cascadeReset: cascade ? Array.from({ length: 9 - stageNum }, (_, i) => stageNum + 1 + i) : []
    });

  } catch (error) {
    console.error('[PipelineLab] Rerun stage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.editStageOutput = async (req, res) => {
  try {
    const { stageId } = req.params;
    const { sessionId, editedOutput, cascade = true } = req.body;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const stageNum = parseInt(stageId);
    session.stages[stageNum] = {
      ...session.stages[stageNum],
      output: editedOutput,
      edited: true,
      editedAt: Date.now()
    };

    // Каскадный сброс зависимых этапов (если включено)
    if (cascade) {
      for (let i = stageNum + 1; i <= 9; i++) {
        if (session.stages[i]) {
          session.stages[i] = { status: 'invalidated', invalidatedBy: stageNum };
        }
      }
    }

    await saveSession(sessionId, session);

    res.json({
      success: true,
      stage: stageNum,
      message: 'Stage output updated',
      cascadeReset: cascade ? Array.from({ length: 9 - stageNum }, (_, i) => stageNum + 1 + i) : []
    });

  } catch (error) {
    console.error('[PipelineLab] Edit stage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getGraph = async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  res.json({
    success: true,
    graphData: session.graphData,
    metadata: {
      nodes: session.graphData.nodes?.length || 0,
      links: session.graphData.links?.length || 0,
      sessionId,
      createdAt: session.createdAt,
      storageType: session.storageType
    }
  });
};

exports.exportGraph = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'json' } = req.body;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const { graphData } = session;

    switch (format) {
      case 'json':
        res.json(graphData);
        break;

      case 'cypher':
        const cypher = PipelineStreamService.graphToCypher(graphData);
        res.type('text/plain').send(cypher);
        break;

      case 'gexf':
        const gexf = PipelineStreamService.graphToGexf(graphData);
        res.type('application/xml').send(gexf);
        break;

      default:
        res.status(400).json({
          success: false,
          error: `Unknown format: ${format}`
        });
    }

  } catch (error) {
    console.error('[PipelineLab] Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
