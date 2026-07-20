const { getIdentityProperties, resolveIdentity, IDENTITY_MAP } = require('../identity-map');

describe('UGP identity-map', () => {
    test('DEFAULT candidates for unlisted label', () => {
        expect(getIdentityProperties('SourceDocument')).toEqual(['id']);
        expect(getIdentityProperties('TotallyUnknownLabel')).toEqual(['id']);
    });

    test('per-label candidates for executable graphs / dialogues / codex', () => {
        expect(getIdentityProperties('GraphDefinition')).toEqual(['graphId']);
        expect(getIdentityProperties('GraphVersion')).toEqual(['versionId']);
        expect(getIdentityProperties('CatalogEntry')).toEqual(['entryId']);
        expect(getIdentityProperties('DialogueSegment')).toEqual(['segmentId']);
        expect(getIdentityProperties('ChatTurn')).toEqual(['turnId']);
        expect(getIdentityProperties('CodexRule')).toEqual(['id', 'codexId']);
    });

    test('resolveIdentity picks the label-specific key', () => {
        expect(resolveIdentity(['GraphDefinition'], { graphId: 'g-1', name: 'x' })).toEqual({
            property: 'graphId',
            value: 'g-1',
        });
        expect(resolveIdentity(['DialogueSegment'], { segmentId: 's-9', sessionId: 'z' })).toEqual({
            property: 'segmentId',
            value: 's-9',
        });
    });

    test('resolveIdentity falls back to id when label key absent', () => {
        // CodexRule prefers id, then codexId
        expect(resolveIdentity(['CodexRule'], { codexId: 'c-1' })).toEqual({
            property: 'codexId',
            value: 'c-1',
        });
        expect(resolveIdentity(['CodexRule'], { id: 'r-1', codexId: 'c-1' })).toEqual({
            property: 'id',
            value: 'r-1',
        });
    });

    test('resolveIdentity handles multi-label nodes', () => {
        // DomainConfig+CoreKnowledge style — first label with a resolvable key wins
        expect(resolveIdentity(['CatalogEntry', 'Extra'], { entryId: 'e-1' })).toEqual({
            property: 'entryId',
            value: 'e-1',
        });
    });

    test('resolveIdentity returns null when nothing resolves', () => {
        expect(resolveIdentity(['DialogueSegment'], { foo: 'bar' })).toBeNull();
        expect(resolveIdentity([], {})).toBeNull();
    });

    test('identity map is versioned config (sanity)', () => {
        expect(IDENTITY_MAP.DEFAULT).toEqual(['id']);
    });
});
