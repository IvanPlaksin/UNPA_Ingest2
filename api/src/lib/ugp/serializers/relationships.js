/**
 * Relationship (de)serialization to/from JSONL.
 *
 * Each line: { type, from: {property, value}, to: {property, value}, props }
 * `from`/`to` carry the resolved identity of the endpoint nodes (see identity-map),
 * so the importer can MATCH endpoints without leaking Memgraph internal ids.
 */
const { wrapPropertiesDeep } = require('./temporal');

/**
 * @param {{ type: string, startNodeIdentity: {property,value}, endNodeIdentity: {property,value}, properties?: object }} rel
 * @returns {string}
 * @throws {Error} when type or an endpoint identity is missing
 */
function serializeRelationship(rel) {
    if (!rel || !rel.type) {
        throw new Error('UGP: relationship is missing a type');
    }
    if (!rel.startNodeIdentity || !rel.endNodeIdentity) {
        throw new Error(`UGP: relationship ${rel.type} is missing an endpoint identity`);
    }

    return JSON.stringify({
        type: rel.type,
        from: rel.startNodeIdentity,
        to: rel.endNodeIdentity,
        props: wrapPropertiesDeep(rel.properties || {}),
    });
}

/**
 * @param {string} line
 * @returns {{ type: string, from: {property,value}, to: {property,value}, props: object }}
 */
function deserializeRelationship(line) {
    return JSON.parse(line);
}

module.exports = { serializeRelationship, deserializeRelationship };
