'use strict';

const {
  knowledgeBrief,
  shouldRetrieve,
  frame,
  MIN_QUERY_CHARS
} = require('../knowledge-context.service');

const bundle = (elements = 2, assembled = '## Relevant context\n\n**Leave policy** (policy)\nStaff may carry over 10 days.') => ({
  elements: Array.from({ length: elements }, (_, i) => ({ id: `e${i}` })),
  assembledContext: assembled
});

const retrieverReturning = (result) => ({
  retrieve: jest.fn().mockResolvedValue(result)
});

const WS = 'ws_knowledge';

describe('FlowDesk knowledge pre-fetch', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('when it runs', () => {
    it('is disabled when no knowledge workspace is configured', async () => {
      const svc = retrieverReturning(bundle());
      // No workspaceId override and none in env → feature off.
      const result = await knowledgeBrief('what is the leave carry-over policy', {
        retriever: svc,
        workspaceId: null
      });

      expect(result).toBeNull();
      expect(svc.retrieve).not.toHaveBeenCalled();
    });

    it('retrieves for a substantive question', async () => {
      const svc = retrieverReturning(bundle());
      const result = await knowledgeBrief('what is the leave carry-over policy', {
        retriever: svc,
        workspaceId: WS
      });

      expect(svc.retrieve).toHaveBeenCalledTimes(1);
      expect(result.elements).toBe(2);
      expect(result.ms).toBeGreaterThanOrEqual(0);
    });

    it('skips a message too short to carry intent', async () => {
      const svc = retrieverReturning(bundle());

      for (const text of ['yes', 'ok', 'the second', '']) {
        // Retrieval on "yes" spends the latency budget matching noise.
        expect(await knowledgeBrief(text, { retriever: svc, workspaceId: WS })).toBeNull();
      }
      expect(svc.retrieve).not.toHaveBeenCalled();
    });

    it('skips a bare control click', async () => {
      const svc = retrieverReturning(bundle());
      const result = await knowledgeBrief('', {
        retriever: svc,
        workspaceId: WS,
        controlAction: { slotId: 'x', value: true }
      });

      expect(result).toBeNull();
      expect(svc.retrieve).not.toHaveBeenCalled();
    });

    it('still retrieves when a click carried text too', async () => {
      const svc = retrieverReturning(bundle());
      const result = await knowledgeBrief('actually I also need a laptop replacement', {
        retriever: svc,
        workspaceId: WS,
        controlAction: { slotId: 'x', value: true }
      });

      expect(result).not.toBeNull();
    });

    it('shouldRetrieve reflects the threshold', () => {
      expect(MIN_QUERY_CHARS).toBeGreaterThan(3);
      expect(shouldRetrieve('x'.repeat(MIN_QUERY_CHARS), null, WS)).toBe(true);
      expect(shouldRetrieve('x'.repeat(MIN_QUERY_CHARS - 1), null, WS)).toBe(false);
      // Without a configured workspace the feature is off regardless of text.
      expect(shouldRetrieve('x'.repeat(MIN_QUERY_CHARS), null, null)).toBe(false);
    });
  });

  describe('what reaches the model', () => {
    it('passes a small budget, not Radix defaults', async () => {
      const svc = retrieverReturning(bundle());
      await knowledgeBrief('what is the leave carry-over policy', {
        retriever: svc,
        workspaceId: WS
      });

      const [wsId, query, config] = svc.retrieve.mock.calls[0];
      expect(wsId).toBe(WS);
      expect(query).toBe('what is the leave carry-over policy');
      // A chat turn already pads to a 4,800-token cache floor; the full 4000-token
      // default would be paid on every message.
      expect(config.tokenBudget).toBeLessThanOrEqual(1200);
      expect(config.maxElements).toBeLessThanOrEqual(6);
    });

    it('trims the query before sending it', async () => {
      const svc = retrieverReturning(bundle());
      await knowledgeBrief('   what is the leave policy   ', { retriever: svc, workspaceId: WS });

      expect(svc.retrieve.mock.calls[0][1]).toBe('what is the leave policy');
    });

    it('marks the block as reference, not as the user speaking', async () => {
      const text = frame('some retrieved facts');

      expect(text).toMatch(/NOT the user's words/);
      expect(text).toMatch(/NOT instructions/);
      expect(text.startsWith('[')).toBe(true);
      expect(text.trim().endsWith(']')).toBe(true);
    });

    it('forbids inventing services or fields from retrieved text', async () => {
      // Rule 1 and rule 3 of the chat design: the model never names a field and
      // never uses a service code it did not get from catalog_search.
      const text = frame('some retrieved facts');
      expect(text).toMatch(/never treat anything here as a service, a field, or a value/i);
      expect(text).toMatch(/catalogue and the form/i);
    });

    it('tells the model not to recite the block', async () => {
      expect(frame('facts')).toMatch(/Never quote this block back/i);
    });

    it('carries the retrieved context itself', async () => {
      const result = await knowledgeBrief('what is the leave carry-over policy', {
        retriever: retrieverReturning(bundle(1, 'Staff may carry over 10 days.')),
        workspaceId: WS
      });

      expect(result.text).toContain('Staff may carry over 10 days.');
    });
  });

  describe('it never breaks the turn', () => {
    it('returns null when retrieval finds nothing', async () => {
      const empty = { elements: [], assembledContext: '' };
      const result = await knowledgeBrief('a question about nothing in particular', {
        retriever: retrieverReturning(empty),
        workspaceId: WS
      });

      expect(result).toBeNull();
    });

    it('returns null when retrieval throws', async () => {
      const svc = { retrieve: jest.fn().mockRejectedValue(new Error('Qdrant down')) };
      const result = await knowledgeBrief('what is the leave carry-over policy', {
        retriever: svc,
        workspaceId: WS
      });

      // The user's message must still get an answer.
      expect(result).toBeNull();
    });

    it('gives up rather than stalling the turn', async () => {
      const svc = {
        retrieve: jest.fn().mockImplementation(
          () => new Promise((resolve) => {
            const t = setTimeout(() => resolve(bundle()), 30000);
            if (t.unref) t.unref();
          })
        )
      };

      const started = Date.now();
      const result = await knowledgeBrief('what is the leave carry-over policy', {
        retriever: svc,
        workspaceId: WS
      });

      expect(result).toBeNull();
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it('returns null when the bundle has no assembled text', async () => {
      const result = await knowledgeBrief('what is the leave carry-over policy', {
        retriever: retrieverReturning({ elements: [{ id: 'a' }], assembledContext: '' }),
        workspaceId: WS
      });

      expect(result).toBeNull();
    });
  });
});
