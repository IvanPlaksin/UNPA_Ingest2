const neo4j = require('neo4j-driver');
const {
    wrapTemporal,
    unwrapTemporal,
    wrapPropertiesDeep,
    unwrapPropertiesDeep,
} = require('../serializers/temporal');

describe('UGP temporal serialization', () => {
    test('plain scalars pass through wrap unchanged', () => {
        expect(wrapTemporal('hello')).toBe('hello');
        expect(wrapTemporal(42)).toBe(42);
        expect(wrapTemporal(true)).toBe(true);
        expect(wrapTemporal(null)).toBeNull();
    });

    test('neo4j Integer wraps to a JS number in safe range', () => {
        const i = neo4j.int(12345);
        expect(wrapTemporal(i)).toBe(12345);
    });

    test('DateTime round-trips through a tagged envelope', () => {
        const dt = neo4j.types.DateTime.fromStandardDate(new Date('2026-07-17T12:00:00.000Z'));
        const wrapped = wrapTemporal(dt);
        expect(wrapped).toMatchObject({ $type: 'datetime' });
        expect(typeof wrapped.value).toBe('string');

        // JSON round-trip then unwrap
        const revived = unwrapTemporal(JSON.parse(JSON.stringify(wrapped)));
        // Reconstructed DateTime should represent the same instant
        expect(new Date(revived.toString()).toISOString()).toBe('2026-07-17T12:00:00.000Z');
    });

    test('Date round-trips to a neo4j Date with same components', () => {
        const d = new neo4j.types.Date(neo4j.int(2026), neo4j.int(7), neo4j.int(17));
        const wrapped = wrapTemporal(d);
        expect(wrapped).toMatchObject({ $type: 'date' });

        const revived = unwrapTemporal(JSON.parse(JSON.stringify(wrapped)));
        expect(revived.toString()).toBe('2026-07-17');
    });

    test('unwrap falls back to string for un-reconstructable envelopes', () => {
        expect(unwrapTemporal({ $type: 'localdatetime', value: '2026-07-17T12:00:00' })).toBe(
            '2026-07-17T12:00:00'
        );
        expect(unwrapTemporal({ $type: 'time', value: '12:00:00Z' })).toBe('12:00:00Z');
    });

    test('deep wrap/unwrap walks nested objects and arrays', () => {
        const props = {
            name: 'x',
            count: neo4j.int(7),
            when: neo4j.types.DateTime.fromStandardDate(new Date('2026-01-01T00:00:00.000Z')),
            nested: { tags: ['a', 'b'], n: neo4j.int(3) },
            list: [neo4j.int(1), neo4j.int(2)],
        };
        const wrapped = wrapPropertiesDeep(props);
        // Survives JSON
        const json = JSON.stringify(wrapped);
        const parsed = JSON.parse(json);
        expect(parsed.count).toBe(7);
        expect(parsed.when.$type).toBe('datetime');
        expect(parsed.nested.n).toBe(3);
        expect(parsed.list).toEqual([1, 2]);

        const revived = unwrapPropertiesDeep(parsed);
        expect(revived.name).toBe('x');
        expect(revived.count).toBe(7);
        expect(new Date(revived.when.toString()).toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(revived.nested.tags).toEqual(['a', 'b']);
    });
});
