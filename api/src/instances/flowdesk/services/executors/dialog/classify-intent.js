'use strict';

const { keywordClassify } = require('../../keyword-filter.js');
const search = require('../../semantic-search.js');
const { SERVICE_CATEGORIES, LLM_SYSTEM_PROMPT } = require('../../../aopeg/executors/classify-intent.executor.js');

module.exports = {
  id: 'flowdesk.dialog.classify-intent',

  async execute(context) {
    const { userInput, state } = context;

    // L1: Keyword
    const kwMatch = keywordClassify(userInput);
    if (kwMatch) {
      return {
        response: `I can help with that — **${kwMatch.service_code}**. Let me collect a few details.`,
        state_updates: {
          intent: { service_code: kwMatch.service_code, method: 'keyword', confidence: 'high', score: kwMatch.confidence },
          service_code: kwMatch.service_code,
          justification: userInput,
        },
        condition: 'high_confidence',
      };
    }

    // L2: Semantic
    let semanticResult = null;
    try {
      await search.init();
      semanticResult = await search.classifyUserIntent(userInput);

      if (semanticResult.top_match && semanticResult.confidence_score >= 0.80) {
        return {
          response: `I identified your request as **${semanticResult.top_match.service_name}**. Let me collect the details.`,
          state_updates: {
            intent: { ...semanticResult.top_match, method: 'semantic', confidence: semanticResult.confidence, score: semanticResult.confidence_score },
            service_code: semanticResult.top_match.service_code,
            service_name: semanticResult.top_match.service_name,
            justification: userInput,
          },
          condition: 'high_confidence',
        };
      }

      if (semanticResult.top_match && semanticResult.confidence_score >= 0.55) {
        return {
          response: null, // D2-CLARIFY will formulate the question
          state_updates: {
            intent: { ...semanticResult.top_match, method: 'semantic', confidence: semanticResult.confidence, score: semanticResult.confidence_score, alternatives: semanticResult.alternatives },
            justification: userInput,
          },
          condition: 'medium_confidence',
        };
      }
    } catch (err) {
      console.warn('[Dialog] L2 semantic search failed, proceeding to L3:', err.message);
    }

    // L3: LLM classification
    const llm = context.llm || context.executionContext?.llm;
    if (llm) {
      try {
        let userPrompt = userInput;
        if (semanticResult?.top_match) {
          const hints = [semanticResult.top_match, ...(semanticResult.alternatives || [])].slice(0, 3);
          const hintText = hints.map(h => `${h.service_code} (${h.service_name}, score: ${h.score?.toFixed(2)})`).join(', ');
          userPrompt = `User message: "${userInput}"\n\nSemantic search hints (not authoritative): ${hintText}`;
        }

        const response = await llm.chat([
          { role: 'system', content: LLM_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ], { max_tokens: 200 });

        const parsed = JSON.parse(response);
        const validCode = parsed.service_code
          ? SERVICE_CATEGORIES.find(c => c.code === parsed.service_code)
          : null;

        if (validCode && parsed.confidence >= 0.5) {
          const confidence = parsed.confidence >= 0.80 ? 'high' : 'medium';
          const serviceName = parsed.service_name || validCode.name;

          return {
            response: confidence === 'high'
              ? `I identified your request as **${serviceName}**. Let me collect the details.`
              : null,
            state_updates: {
              intent: {
                service_code: parsed.service_code,
                service_name: serviceName,
                method: 'llm',
                confidence,
                score: parsed.confidence,
                reasoning: parsed.reasoning || null,
                alternatives: semanticResult?.alternatives || [],
              },
              service_code: parsed.service_code,
              service_name: serviceName,
              justification: userInput,
            },
            condition: confidence === 'high' ? 'high_confidence' : 'medium_confidence',
          };
        }
      } catch (llmErr) {
        console.warn('[Dialog] L3 LLM classification failed:', llmErr.message);
      }
    }

    return {
      response: null,
      state_updates: { justification: userInput },
      condition: 'low_confidence',
    };
  },
};
