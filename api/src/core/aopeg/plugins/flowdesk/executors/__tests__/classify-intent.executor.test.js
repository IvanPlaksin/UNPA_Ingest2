'use strict';

const { ClassifyIntentExecutor, SERVICE_CATEGORIES, LLM_SYSTEM_PROMPT } = require('../classify-intent.executor');

// Mock template-store — returns a simple string
jest.mock('../../../../../../services/flowdesk/template-store', () => ({
  render: jest.fn(async (key, data) => `[${key}] ${JSON.stringify(data)}`),
}));

// Mock keyword-filter
jest.mock('../../../../../../services/flowdesk/keyword-filter', () => ({
  keywordClassify: jest.fn(),
}));

// Mock semantic-search
jest.mock('../../../../../../services/flowdesk/semantic-search', () => ({
  init: jest.fn(),
  classifyUserIntent: jest.fn(),
}));

const { keywordClassify } = require('../../../../../../services/flowdesk/keyword-filter');
const search = require('../../../../../../services/flowdesk/semantic-search');

describe('ClassifyIntentExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new ClassifyIntentExecutor();
    jest.clearAllMocks();
    keywordClassify.mockReturnValue(null);
    search.init.mockResolvedValue();
    search.classifyUserIntent.mockResolvedValue({
      top_match: null,
      alternatives: [],
      confidence: 'unclassified',
      confidence_score: 0,
      raw_results_count: 0,
    });
  });

  // ── Registration ──────────────────────────────────────────────

  test('has correct type and domain', () => {
    expect(executor.type).toBe('flowdesk.classify_intent');
    expect(executor.domain).toBe('flowdesk');
    expect(executor.displayName).toBe('Classify Intent');
  });

  test('parameterSchema declares userInput, sessionId, useLLM', () => {
    const props = executor.parameterSchema.properties;
    expect(props).toHaveProperty('userInput');
    expect(props).toHaveProperty('sessionId');
    expect(props).toHaveProperty('useLLM');
  });

  test('exports SERVICE_CATEGORIES and LLM_SYSTEM_PROMPT', () => {
    expect(Array.isArray(SERVICE_CATEGORIES)).toBe(true);
    expect(SERVICE_CATEGORIES.length).toBeGreaterThan(50);
    expect(typeof LLM_SYSTEM_PROMPT).toBe('string');
    expect(LLM_SYSTEM_PROMPT).toContain('SERVICE CATEGORIES');
  });

  // ── Cached pass-through ──────────────────────────────────────

  test('returns cached result when service_code already present', async () => {
    const result = await executor.execute(
      { service_code: 'IT-HW-LAP', service_name: 'Laptop' },
      {}
    );
    expect(result.output.method).toBe('cached');
    expect(result.output.service_code).toBe('IT-HW-LAP');
    expect(result.output.branch).toBe('high_confidence');
  });

  // ── No input ─────────────────────────────────────────────────

  test('returns error when no userInput provided', async () => {
    const result = await executor.execute({}, {});
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('NO_INPUT');
  });

  // ── L1: Keyword match ────────────────────────────────────────

  test('returns keyword match when L1 hits', async () => {
    keywordClassify.mockReturnValue({
      service_code: 'IT-SEC-PWD',
      confidence: 0.95,
      match_type: 'keyword',
      matched_pattern: 'password reset',
    });

    const result = await executor.execute({ userInput: 'I need a password reset' }, {});
    expect(result.output.method).toBe('keyword');
    expect(result.output.service_code).toBe('IT-SEC-PWD');
    expect(result.output.confidence).toBe('high');
    expect(result.output.branch).toBe('high_confidence');
  });

  // ── L2: Semantic high confidence ─────────────────────────────

  test('returns semantic match on high confidence (>= 0.80)', async () => {
    search.classifyUserIntent.mockResolvedValue({
      top_match: { service_code: 'IT-HW-LAP', service_name: 'Laptop request', score: 0.92 },
      alternatives: [{ service_code: 'IT-HW-DSK', service_name: 'Desktop', score: 0.65 }],
      confidence: 'high',
      confidence_score: 0.92,
      raw_results_count: 5,
    });

    const result = await executor.execute({ userInput: 'I need a new laptop' }, {});
    expect(result.output.method).toBe('semantic');
    expect(result.output.confidence).toBe('high');
    expect(result.output.service_code).toBe('IT-HW-LAP');
    expect(result.output.branch).toBe('high_confidence');
  });

  // ── L2: Semantic medium confidence ───────────────────────────

  test('returns semantic match on medium confidence (0.55–0.79)', async () => {
    search.classifyUserIntent.mockResolvedValue({
      top_match: { service_code: 'HR-BEN-LEV', service_name: 'Leave request', score: 0.68 },
      alternatives: [],
      confidence: 'medium',
      confidence_score: 0.68,
      raw_results_count: 3,
    });

    const result = await executor.execute({ userInput: 'I want time off' }, {});
    expect(result.output.method).toBe('semantic');
    expect(result.output.confidence).toBe('medium');
    expect(result.output.branch).toBe('medium_confidence');
  });

  // ── L3: LLM classification ──────────────────────────────────

  describe('L3 LLM classification', () => {
    const mockLlm = { chat: jest.fn() };
    const contextWithLlm = { executionContext: { llm: mockLlm } };

    test('calls LLM when L1 and L2 both fail', async () => {
      mockLlm.chat.mockResolvedValue(JSON.stringify({
        service_code: 'FAC-TRV-AUTH',
        service_name: 'Travel authorization',
        confidence: 0.85,
        reasoning: 'User wants to arrange official travel',
      }));

      const result = await executor.execute(
        { userInput: 'I have a mission to Addis Ababa next month, what do I need to arrange?' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('llm');
      expect(result.output.service_code).toBe('FAC-TRV-AUTH');
      expect(result.output.confidence).toBe('high');
      expect(result.output.reasoning).toBe('User wants to arrange official travel');
      expect(result.output.branch).toBe('high_confidence');

      // Verify LLM was called with system prompt containing categories
      expect(mockLlm.chat).toHaveBeenCalledTimes(1);
      const [messages] = mockLlm.chat.mock.calls[0];
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('FAC-TRV-AUTH');
    });

    test('returns medium confidence from LLM when score 0.5–0.79', async () => {
      mockLlm.chat.mockResolvedValue(JSON.stringify({
        service_code: 'IT-SW-INS',
        service_name: 'Software installation',
        confidence: 0.65,
        reasoning: 'Possibly needs software',
      }));

      const result = await executor.execute(
        { userInput: 'How do I get this program on my machine?' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('llm');
      expect(result.output.confidence).toBe('medium');
      expect(result.output.branch).toBe('medium_confidence');
    });

    test('falls through to low_confidence when LLM confidence < 0.5', async () => {
      mockLlm.chat.mockResolvedValue(JSON.stringify({
        service_code: null,
        confidence: 0.2,
        reasoning: 'Unclear request',
      }));

      const result = await executor.execute(
        { userInput: 'hello' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('none');
      expect(result.output.confidence).toBe('low');
      expect(result.output.branch).toBe('low_confidence');
    });

    test('falls through to low_confidence when LLM returns invalid service_code', async () => {
      mockLlm.chat.mockResolvedValue(JSON.stringify({
        service_code: 'INVALID-CODE',
        confidence: 0.9,
      }));

      const result = await executor.execute(
        { userInput: 'something weird' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('none');
      expect(result.output.branch).toBe('low_confidence');
    });

    test('passes semantic hints to LLM when L2 had partial results', async () => {
      search.classifyUserIntent.mockResolvedValue({
        top_match: { service_code: 'IT-HW-LAP', service_name: 'Laptop', score: 0.45 },
        alternatives: [{ service_code: 'IT-HW-DSK', service_name: 'Desktop', score: 0.40 }],
        confidence: 'low',
        confidence_score: 0.45,
        raw_results_count: 3,
      });

      mockLlm.chat.mockResolvedValue(JSON.stringify({
        service_code: 'IT-HW-LAP',
        service_name: 'Laptop request',
        confidence: 0.88,
        reasoning: 'User needs a portable computer',
      }));

      const result = await executor.execute(
        { userInput: 'I need something portable for fieldwork' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('llm');
      expect(result.output.service_code).toBe('IT-HW-LAP');

      // Verify hints were passed
      const [messages] = mockLlm.chat.mock.calls[0];
      expect(messages[1].content).toContain('Semantic search hints');
      expect(messages[1].content).toContain('IT-HW-LAP');
    });

    test('gracefully falls back when LLM throws an error', async () => {
      mockLlm.chat.mockRejectedValue(new Error('LLM service unavailable'));

      const result = await executor.execute(
        { userInput: 'some ambiguous request' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('none');
      expect(result.output.confidence).toBe('low');
      expect(result.output.branch).toBe('low_confidence');
    });

    test('gracefully falls back when LLM returns invalid JSON', async () => {
      mockLlm.chat.mockResolvedValue('not valid json at all');

      const result = await executor.execute(
        { userInput: 'some request' },
        contextWithLlm,
      );

      expect(result.output.method).toBe('none');
      expect(result.output.branch).toBe('low_confidence');
    });

    test('skips LLM when useLLM=false', async () => {
      const result = await executor.execute(
        { userInput: 'some request', useLLM: false },
        contextWithLlm,
      );

      expect(mockLlm.chat).not.toHaveBeenCalled();
      expect(result.output.method).toBe('none');
      expect(result.output.branch).toBe('low_confidence');
    });

    test('skips LLM when no llm in context', async () => {
      const result = await executor.execute(
        { userInput: 'some request' },
        { executionContext: {} },
      );

      expect(result.output.method).toBe('none');
      expect(result.output.branch).toBe('low_confidence');
    });
  });

  // ── L2 failure → L3 fallback ────────────────────────────────

  test('falls through to LLM when semantic search throws', async () => {
    search.classifyUserIntent.mockRejectedValue(new Error('Qdrant down'));
    const mockLlm = { chat: jest.fn() };
    mockLlm.chat.mockResolvedValue(JSON.stringify({
      service_code: 'IT-SEC-PWD',
      service_name: 'Password reset',
      confidence: 0.92,
      reasoning: 'Password related',
    }));

    const result = await executor.execute(
      { userInput: 'my password expired' },
      { executionContext: { llm: mockLlm } },
    );

    expect(result.output.method).toBe('llm');
    expect(result.output.service_code).toBe('IT-SEC-PWD');
  });

  // ── Output schema ────────────────────────────────────────────

  test('output always contains service_code, method, confidence, branch', async () => {
    const result = await executor.execute({ userInput: 'test' }, {});
    expect(result.output).toHaveProperty('service_code');
    expect(result.output).toHaveProperty('method');
    expect(result.output).toHaveProperty('confidence');
    expect(result.output).toHaveProperty('branch');
  });
});
