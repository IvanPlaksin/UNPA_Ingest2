/**
 * Node (de)serialization to/from JSONL.
 *
 * Each line: { _identity: {property, value}, labels: [...], props: {...}, stub }
 * `_identity` is the MERGE key resolved via the per-label Identity Map.
 */
const { resolveIdentity } = require('../identity-map');
const { wrapPropertiesDeep } = require('./temporal');

/**
 * Serialize a node into a single JSONL line (no trailing newline).
 * @param {{ labels: string[], properties: object }} node
 * @param {{ stub?: boolean }} [options]
 * @returns {string}
 * @throws {Error} when no identity property can be resolved
 */
function serializeNode(node, options = {}) {
    const labels = node.labels || [];
    const properties = node.properties || {};
    const identity = resolveIdentity(labels, properties);

    if (!identity) {
        throw new Error(
            `UGP: node has no resolvable identity. labels=[${labels.join(',')}] propKeys=[${Object.keys(properties).join(',')}]`
        );
    }

    return JSON.stringify({
        _identity: identity,
        labels,
        props: wrapPropertiesDeep(properties),
        stub: options.stub === true,
    });
}

/**
 * Parse a JSONL line back into a node envelope. Temporal props stay wrapped;
 * the importer unwraps them at write time (see temporal.unwrapPropertiesDeep).
 * @param {string} line
 * @returns {{ _identity: {property: string, value: any}, labels: string[], props: object, stub: boolean }}
 */
function deserializeNode(line) {
    return JSON.parse(line);
}

module.exports = { serializeNode, deserializeNode };
