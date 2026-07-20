const {
    getCollectionLinkage,
    hasNamedVectors,
    resolveLinkageValue,
} = require('../collection-linkage');

describe('UGP collection-linkage', () => {
    test('linked collections expose their payload field', () => {
        expect(getCollectionLinkage('documents_entities').field).toBe('memgraphNodeId');
        expect(getCollectionLinkage('dialogue_embeddings').field).toBe('segmentId');
        expect(getCollectionLinkage('knowledge_entities').field).toBe('entityId');
        expect(getCollectionLinkage('embeddings_unified').field).toBe('quantum_id');
    });

    test('workspace_* collections resolve via pattern', () => {
        const cfg = getCollectionLinkage('workspace_dcf61323_f8b3_4c62_830f_2cc5f1e18fd2');
        expect(cfg.linked).toBe(true);
        expect(cfg.field).toBe('draftNodeId');
        expect(cfg.graphLabel).toBe('DraftEntity');
    });

    test('graph-unlinked collections are flagged linked=false', () => {
        expect(getCollectionLinkage('flowdesk_services').linked).toBe(false);
        expect(getCollectionLinkage('altiora_knowledge').linked).toBe(false);
        expect(getCollectionLinkage('project_knowledge').linked).toBe(false);
    });

    test('unknown collection is unlinked + flagged unknown', () => {
        const cfg = getCollectionLinkage('some_new_collection');
        expect(cfg.linked).toBe(false);
        expect(cfg.unknown).toBe(true);
    });

    test('named vectors detected only where present', () => {
        expect(hasNamedVectors('dialogue_embeddings')).toBe(true);
        expect(hasNamedVectors('knowledge_entities')).toBe(true);
        expect(hasNamedVectors('documents_entities')).toBe(false);
        expect(hasNamedVectors('flowdesk_services')).toBe(false);
    });

    test('resolveLinkageValue honours field then altFields', () => {
        // primary field
        expect(
            resolveLinkageValue('documents_entities', { memgraphNodeId: 'n-1' })
        ).toBe('n-1');
        // altField fallback (graphNodeId)
        expect(
            resolveLinkageValue('documents_entities', { graphNodeId: 'n-2' })
        ).toBe('n-2');
        // workspace altField (entityId)
        expect(
            resolveLinkageValue('workspace_abc', { entityId: 'd-3' })
        ).toBe('d-3');
    });

    test('resolveLinkageValue returns null for unlinked / missing', () => {
        expect(resolveLinkageValue('flowdesk_services', { service_code: 'x' })).toBeNull();
        expect(resolveLinkageValue('documents_entities', { unrelated: 'x' })).toBeNull();
    });
});
