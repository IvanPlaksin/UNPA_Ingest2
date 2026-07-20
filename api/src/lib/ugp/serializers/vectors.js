/**
 * Qdrant point (de)serialization to/from JSONL.
 *
 * Supports both default (single) vectors and NAMED vectors. Two live collections
 * use named vectors (dialogue_embeddings: content+summary; knowledge_entities:
 * entity), so the shape must be preserved round-trip.
 *
 * Line shapes:
 *   default: { id, vector: [...], payload }
 *   named:   { id, vectors: { name: [...] }, payload }
 */

/**
 * @param {{ id: string|number, vector?: number[], vectors?: Object<string,number[]>, payload?: object }} point
 * @returns {string}
 */
function serializeVectorPoint(point) {
    if (point == null || point.id === undefined || point.id === null) {
        throw new Error('UGP: vector point is missing an id');
    }

    const out = { id: point.id, payload: point.payload || {} };

    const hasNamed =
        point.vectors && typeof point.vectors === 'object' && !Array.isArray(point.vectors);
    if (hasNamed) {
        out.vectors = point.vectors;
    } else if (Array.isArray(point.vector)) {
        out.vector = point.vector;
    }
    // A point with neither is allowed (MANIFEST_ONLY policy → payload-only record).

    return JSON.stringify(out);
}

/**
 * @param {string} line
 * @returns {{ id: string|number, vector?: number[], vectors?: object, payload: object }}
 */
function deserializeVectorPoint(line) {
    return JSON.parse(line);
}

/**
 * Normalize a deserialized point into the shape Qdrant `upsert` expects.
 * Named-vector points get `{ id, vector: {name: [...]}, payload }`; default
 * points get `{ id, vector: [...], payload }`.
 * @param {object} point
 * @returns {{ id: string|number, vector: number[]|object, payload: object }}
 */
function toQdrantPoint(point) {
    if (point.vectors) {
        return { id: point.id, vector: point.vectors, payload: point.payload || {} };
    }
    return { id: point.id, vector: point.vector, payload: point.payload || {} };
}

module.exports = { serializeVectorPoint, deserializeVectorPoint, toQdrantPoint };
