/**
 * UGP (UNPA Graph Package) — format constants.
 *
 * Shared by the exporter (backend UNPA) and the importer CLI. No side effects.
 */

module.exports = {
    UGP_VERSION: '1.0',

    // File layout inside the .ugp.tar.gz archive
    MANIFEST_PATH: 'package/manifest.json',
    NODES_PATH: 'package/graph/nodes.jsonl',
    RELATIONSHIPS_PATH: 'package/graph/relationships.jsonl',
    VECTORS_DIR: 'package/vectors/', // vectors/<collection>.jsonl
    CHECKSUMS_PATH: 'package/checksums.sha256',

    // Batching limits
    DEFAULT_BATCH_SIZE: 1000,
    VECTOR_BATCH_SIZE: 256,

    // Slice-boundary policy (how to treat edges leaving the selected slice)
    BOUNDARY_POLICY: {
        EXCLUDE: 'EXCLUDE', // drop the dangling edge
        STUB: 'STUB', // emit the external endpoint as a stub node
        CLOSURE: 'CLOSURE', // pull the external endpoint fully into the slice
    },

    // Vector inclusion policy (per-collection selection lives in manifest.selectedCollections)
    VECTOR_POLICY: {
        EMBED_POINTS: 'EMBED_POINTS', // embed full points (vector + payload)
        MANIFEST_ONLY: 'MANIFEST_ONLY', // record affected ids only; rebuild on target
        NONE: 'NONE', // no vectors
    },
};
