'use strict';

const { SYNC_EVENTS, validateSyncEvent } = require('../sync-events');
const { handleSyncEvent, DRAFT_KIND } = require('../sync-handler');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const draftRow = (overrides = {}) => ({
  props: {
    id: 'd1',
    name: 'Approval limit',
    description: 'Caps unattended approvals',
    type: 'business_rule',
    status: 'VALIDATED',
    knowledgeFamily: 'BEHAVIORAL',
    content: JSON.stringify({ condition: 'amount > 50000' }),
    ...overrides
  },
  labels: ['DraftBusinessRule']
});

const deps = (rows = [draftRow()]) => ({
  memgraphService: { runQuery: jest.fn().mockResolvedValue(rows) },
  qdrantService: {
    workspaceUpsert: jest.fn().mockResolvedValue(undefined),
    workspaceDeletePoints: jest.fn().mockResolvedValue(undefined)
  },
  teiService: { getEmbedding: jest.fn().mockResolvedValue(new Array(8).fill(0.1)) }
});

const event = (type, overrides = {}) => ({
  type,
  workspaceId: 'ws_1',
  draftId: 'd1',
  ...overrides
});

describe('Radix Sync: event contract', () => {
  it('accepts a well-formed event', () => {
    expect(validateSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED))).toBeNull();
  });

  it('rejects an unknown type', () => {
    expect(validateSyncEvent(event('draft.exploded'))).toMatch('unknown event type');
  });

  it('rejects missing identifiers', () => {
    expect(validateSyncEvent({ type: SYNC_EVENTS.DRAFT_UPDATED, draftId: 'd1' }))
      .toMatch('workspaceId is required');
    expect(validateSyncEvent({ type: SYNC_EVENTS.DRAFT_UPDATED, workspaceId: 'ws_1' }))
      .toMatch('draftId is required');
  });

  it('rejects a non-object', () => {
    expect(validateSyncEvent(null)).toMatch('must be an object');
  });
});

describe('Radix Sync: handler', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('indexing', () => {
    it('re-reads the draft from the graph rather than trusting the event', async () => {
      const d = deps();
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      // Ordering and replay safety both depend on this.
      expect(d.memgraphService.runQuery).toHaveBeenCalled();
      const [, params] = d.memgraphService.runQuery.mock.calls[0];
      expect(params).toEqual({ wsId: 'ws_1', draftId: 'd1' });
    });

    it('scopes the read through the workspace edge', async () => {
      const d = deps();
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      const [cypher] = d.memgraphService.runQuery.mock.calls[0];
      expect(cypher).toContain('WorkSpace {id: $wsId}');
      expect(cypher).toContain('CONTAINS_DRAFT');
    });

    it('embeds the same text retrieval will display', async () => {
      const d = deps();
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_CREATED), d);

      const embedded = d.teiService.getEmbedding.mock.calls[0][0];
      expect(embedded).toContain('Approval limit');
      expect(embedded).toContain('Caps unattended approvals');
      expect(embedded).toContain('condition: amount > 50000');
    });

    it('writes the payload retrieval expects', async () => {
      const d = deps();
      const result = await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      const [wsId, points] = d.qdrantService.workspaceUpsert.mock.calls[0];
      expect(wsId).toBe('ws_1');
      expect(points[0].id).toBe('d1');
      expect(points[0].payload).toMatchObject({
        kind: DRAFT_KIND,
        draftNodeId: 'd1',
        type: 'business_rule',
        knowledgeFamily: 'BEHAVIORAL',
        name: 'Approval limit',
        status: 'VALIDATED'
      });
      expect(result.action).toBe('indexed');
    });

    it('carries the CURRENT status so the status filter stops lying', async () => {
      const d = deps([draftRow({ status: 'REJECTED' })]);
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      expect(d.qdrantService.workspaceUpsert.mock.calls[0][1][0].payload.status)
        .toBe('REJECTED');
    });

    it('keeps the point for a REJECTED draft instead of deleting it', async () => {
      const d = deps([draftRow({ status: 'REJECTED' })]);
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      // excludeDraftStatuses is configurable; deleting would make that config a
      // lie for a caller who wants to inspect what was rejected.
      expect(d.qdrantService.workspaceDeletePoints).not.toHaveBeenCalled();
      expect(d.qdrantService.workspaceUpsert).toHaveBeenCalled();
    });

    it('derives the type from labels when the property is absent', async () => {
      const d = deps([{ props: { id: 'd1', name: 'X' }, labels: ['DraftConcept'] }]);
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      expect(d.qdrantService.workspaceUpsert.mock.calls[0][1][0].payload.type)
        .toBe('concept');
    });
  });

  describe('deletion', () => {
    it('removes the point on a delete event without touching the graph', async () => {
      const d = deps();
      const result = await handleSyncEvent(event(SYNC_EVENTS.DRAFT_DELETED), d);

      expect(d.qdrantService.workspaceDeletePoints).toHaveBeenCalledWith('ws_1', ['d1']);
      expect(d.memgraphService.runQuery).not.toHaveBeenCalled();
      expect(result.action).toBe('deleted');
    });

    it('removes the point when the draft is gone from the graph', async () => {
      // A stale or replayed update for something already deleted must not
      // resurrect it.
      const d = deps([]);
      const result = await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

      expect(d.qdrantService.workspaceDeletePoints).toHaveBeenCalledWith('ws_1', ['d1']);
      expect(d.qdrantService.workspaceUpsert).not.toHaveBeenCalled();
      expect(result.action).toBe('deleted-missing');
    });
  });

  describe('idempotency and ordering', () => {
    it('produces the same write when applied twice', async () => {
      const first = deps();
      const second = deps();
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), first);
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), second);

      expect(first.qdrantService.workspaceUpsert.mock.calls[0][1])
        .toEqual(second.qdrantService.workspaceUpsert.mock.calls[0][1]);
    });

    it('an out-of-order event still writes the current state', async () => {
      // Event says "created", graph says the draft has since been renamed.
      const d = deps([draftRow({ name: 'Renamed later' })]);
      await handleSyncEvent(event(SYNC_EVENTS.DRAFT_CREATED), d);

      expect(d.qdrantService.workspaceUpsert.mock.calls[0][1][0].payload.name)
        .toBe('Renamed later');
    });
  });

  describe('failures', () => {
    it('rejects an invalid event', async () => {
      await expect(handleSyncEvent({ type: 'nope' }, deps()))
        .rejects.toThrow('Invalid sync event');
    });

    it('requires its services', async () => {
      await expect(handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), {}))
        .rejects.toThrow('requires memgraphService');
    });

    it('throws when the embedding comes back empty, so the job retries', async () => {
      const d = deps();
      d.teiService.getEmbedding.mockResolvedValue([]);

      await expect(handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d))
        .rejects.toThrow('Embedding failed');
      expect(d.qdrantService.workspaceUpsert).not.toHaveBeenCalled();
    });

    it('propagates a Qdrant failure so the job retries rather than silently diverging', async () => {
      const d = deps();
      d.qdrantService.workspaceUpsert.mockRejectedValue(new Error('Qdrant down'));

      await expect(handleSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d))
        .rejects.toThrow('Qdrant down');
    });
  });
});

describe('Radix Sync: producer', () => {
  let emitSyncEvent;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // No BullMQ available in this suite → the inline fallback path runs.
    jest.doMock('bullmq', () => { throw new Error('bullmq not installed'); });
    ({ emitSyncEvent } = require('../sync-producer'));
  });

  afterEach(() => jest.dontMock('bullmq'));

  it('falls back to inline handling rather than dropping the event', async () => {
    const d = deps();
    const result = await emitSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);

    expect(result.inline).toBe(true);
    expect(result.queued).toBe(false);
    expect(d.qdrantService.workspaceUpsert).toHaveBeenCalled();
  });

  it('never throws when the index cannot be updated', async () => {
    const d = deps();
    d.qdrantService.workspaceUpsert.mockRejectedValue(new Error('Qdrant down'));

    // The graph write already succeeded; a derived index must not fail it.
    const result = await emitSyncEvent(event(SYNC_EVENTS.DRAFT_UPDATED), d);
    expect(result.error).toBe('Qdrant down');
  });

  it('rejects an invalid event without attempting work', async () => {
    const d = deps();
    const result = await emitSyncEvent({ type: 'bogus', workspaceId: 'w', draftId: 'd' }, d);

    expect(result.error).toMatch('unknown event type');
    expect(d.qdrantService.workspaceUpsert).not.toHaveBeenCalled();
  });
});
