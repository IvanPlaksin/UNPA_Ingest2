/**
 * UGP (UNPA Graph Package) — public API.
 *
 * Pure serialization/deserialization + package I/O. No Memgraph/Qdrant access,
 * so both the exporter (backend) and importer (CLI) depend on this one module.
 */
module.exports = {
    ...require('./constants'),

    // Identity & Qdrant linkage configuration
    ...require('./identity-map'),
    ...require('./collection-linkage'),

    // Serializers
    ...require('./serializers/temporal'),
    ...require('./serializers/nodes'),
    ...require('./serializers/relationships'),
    ...require('./serializers/vectors'),
    ...require('./serializers/manifest'),

    // Package I/O
    ...require('./package/writer'),
    ...require('./package/reader'),
    ...require('./package/checksum'),
};
