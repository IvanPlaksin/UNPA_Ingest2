// api/src/services/pipelineAnalysis.service.js
// Сервис AI-анализа результатов pipeline через Ollama

const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'llama3.2:3b';

const SYSTEM_PROMPT = `You are a Knowledge Graph Quality Analyst specializing in UN legacy system archaeology.

Your role is to analyze pipeline execution results and evaluate extraction quality for the UN ProjectAdvisor system.

When analyzing, focus on:
1. **Coverage** - What entities/relationships were correctly extracted vs missed
2. **Accuracy** - Are extractions correct based on source text
3. **Confidence Calibration** - Are confidence scores appropriate
4. **Layer Classification** - Are entities in correct ontology layers (Strategic/Business/Code)
5. **Actionable Improvements** - Specific suggestions to improve pipeline quality

Be concise but thorough. Use markdown formatting. Reference specific entities and text passages.`;

class PipelineAnalysisService {

  /**
   * Build comprehensive context from session data
   */
  buildAnalysisContext(sessionData) {
    const { text, stages, graphData } = sessionData;

    const stageOutputs = {};
    for (const [stageId, stageData] of Object.entries(stages)) {
      if (stageData.output) {
        stageOutputs[`stage_${stageId}`] = this.summarizeStageOutput(parseInt(stageId), stageData.output);
      }
    }

    return {
      originalText: text,
      originalLength: text.length,
      stages: stageOutputs,
      graph: {
        nodeCount: graphData.nodes?.length || 0,
        linkCount: graphData.links?.length || 0,
        nodes: graphData.nodes?.map(n => ({
          name: n.name,
          type: n.type,
          layer: n.layer,
          confidence: n.confidence
        })) || [],
        links: graphData.links?.map(l => ({
          source: typeof l.source === 'object' ? l.source.name : l.source,
          target: typeof l.target === 'object' ? l.target.name : l.target,
          type: l.type
        })) || [],
        layerDistribution: this.calculateLayerDistribution(graphData.nodes || [])
      }
    };
  }

  summarizeStageOutput(stageId, output) {
    switch (stageId) {
      case 1:
        return {
          stage: 'Sanitization',
          htmlTagsRemoved: output.stats?.htmlTagsRemoved || 0,
          entitiesDecoded: output.stats?.entitiesDecoded || 0,
          sizeReduction: output.stats?.sizeReduction || '0%',
          sanitizedPreview: output.sanitized?.substring(0, 500) + '...'
        };
      case 2:
        return {
          stage: 'Language Detection',
          language: output.language,
          confidence: output.confidence,
          codeLanguage: output.codeLanguage
        };
      case 3:
        return {
          stage: 'Chunking',
          chunkCount: output.chunks?.length || 0,
          avgTokens: output.avgTokens,
          strategy: output.strategy
        };
      case 4:
        return {
          stage: 'Entity Extraction',
          totalEntities: output.entities?.length || 0,
          byType: output.statistics?.byType || {},
          entities: output.entities?.map(e => ({
            name: e.name,
            type: e.type,
            confidence: e.confidence,
            source: e.source
          })) || []
        };
      case 5:
        return {
          stage: 'Query Expansion',
          expansions: output.expansions || []
        };
      case 6:
        return {
          stage: 'Embedding',
          vectorCount: output.vectors || output.totalVectors,
          dimension: output.dimension,
          model: output.model
        };
      case 7:
        return {
          stage: 'Classification',
          distribution: output.distribution
        };
      case 8:
        return {
          stage: 'Relationships',
          totalRelationships: output.relationships?.length || 0,
          byType: output.statistics?.byType || {},
          relationships: output.relationships?.slice(0, 20) || []
        };
      case 9:
        return {
          stage: 'Graph Build',
          nodes: output.nodes?.length || 0,
          links: output.links?.length || 0
        };
      default:
        return output;
    }
  }

  calculateLayerDistribution(nodes) {
    const dist = { Strategic: 0, Business: 0, Code: 0 };
    nodes.forEach(n => {
      if (dist[n.layer] !== undefined) {
        dist[n.layer]++;
      }
    });
    return dist;
  }

  /**
   * Generate initial analysis prompt
   */
  buildInitialAnalysisPrompt(context) {
    return `Analyze the following pipeline execution results:

## Original Input Text (${context.originalLength} characters):
\`\`\`
${context.originalText}
\`\`\`

## Pipeline Stage Results:

### Stage 1 - Sanitization:
${JSON.stringify(context.stages.stage_1, null, 2)}

### Stage 4 - Entity Extraction:
${JSON.stringify(context.stages.stage_4, null, 2)}

### Stage 7 - Classification:
${JSON.stringify(context.stages.stage_7, null, 2)}

### Stage 8 - Relationships:
${JSON.stringify(context.stages.stage_8, null, 2)}

## Final Knowledge Graph:
- Nodes: ${context.graph.nodeCount}
- Links: ${context.graph.linkCount}
- Layer Distribution: ${JSON.stringify(context.graph.layerDistribution)}

Entities:
${context.graph.nodes.map(n => `- ${n.name} (${n.type}, ${n.layer}, conf: ${(n.confidence * 100).toFixed(0)}%)`).join('\n')}

Relationships:
${context.graph.links.map(l => `- ${l.source} --[${l.type}]--> ${l.target}`).join('\n')}

---

Provide a comprehensive quality analysis with:
1. 📊 **Quality Score** (0-100) with justification
2. ✅ **Correct Extractions** - what was done well
3. ❌ **Missed Items** - entities/relationships that should have been extracted but weren't (reference specific text)
4. ⚠️ **Potential Issues** - incorrect extractions, wrong types, bad confidence scores
5. 💡 **Top 3 Recommendations** - specific actionable improvements`;
  }

  /**
   * Stream response from Ollama
   */
  async *streamAnalysis(sessionData, conversationHistory = []) {
    const context = this.buildAnalysisContext(sessionData);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory
    ];

    if (conversationHistory.length === 0) {
      messages.push({
        role: 'user',
        content: this.buildInitialAnalysisPrompt(context)
      });
    }

    try {
      const response = await axios({
        method: 'post',
        url: `${OLLAMA_URL}/api/chat`,
        data: {
          model: ANALYSIS_MODEL,
          messages,
          stream: true,
          options: {
            temperature: 0.3,
            num_predict: 2048
          }
        },
        responseType: 'stream'
      });

      let buffer = '';

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                yield {
                  type: 'chunk',
                  content: parsed.message.content
                };
              }
              if (parsed.done) {
                yield { type: 'done' };
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('[PipelineAnalysis] Stream error:', error.message);
      let errorMessage = error.message;
      if (error.code === 'ECONNREFUSED' || error.message.includes('socket hang up')) {
        errorMessage = 'Ollama is not running. Please start Ollama with: ollama serve';
      }
      yield {
        type: 'error',
        message: errorMessage
      };
    }
  }

  /**
   * Non-streaming analysis (for testing)
   */
  async analyze(sessionData, conversationHistory = []) {
    const context = this.buildAnalysisContext(sessionData);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory
    ];

    if (conversationHistory.length === 0) {
      messages.push({
        role: 'user',
        content: this.buildInitialAnalysisPrompt(context)
      });
    }

    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: ANALYSIS_MODEL,
      messages,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 2048
      }
    });

    return response.data.message.content;
  }

  /**
   * Continue conversation with user question
   */
  async *chat(sessionData, conversationHistory, userMessage) {
    const context = this.buildAnalysisContext(sessionData);

    const contextSummary = `
[Context Reminder - Pipeline Analysis Session]
- Original text: ${context.originalLength} chars
- Extracted: ${context.graph.nodeCount} nodes, ${context.graph.linkCount} relationships
- Entities: ${context.graph.nodes.map(n => n.name).join(', ')}
`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      {
        role: 'user',
        content: `${contextSummary}\n\nUser question: ${userMessage}`
      }
    ];

    try {
      const response = await axios({
        method: 'post',
        url: `${OLLAMA_URL}/api/chat`,
        data: {
          model: ANALYSIS_MODEL,
          messages,
          stream: true,
          options: {
            temperature: 0.3,
            num_predict: 2048
          }
        },
        responseType: 'stream'
      });

      let buffer = '';

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                yield {
                  type: 'chunk',
                  content: parsed.message.content
                };
              }
              if (parsed.done) {
                yield { type: 'done' };
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('[PipelineAnalysis] Chat error:', error.message);
      let errorMessage = error.message;
      if (error.code === 'ECONNREFUSED' || error.message.includes('socket hang up')) {
        errorMessage = 'Ollama is not running. Please start Ollama with: ollama serve';
      }
      yield {
        type: 'error',
        message: errorMessage
      };
    }
  }
}

module.exports = new PipelineAnalysisService();
